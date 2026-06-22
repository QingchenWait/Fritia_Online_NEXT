const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function u16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value) {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

const ZIP_UTF8_FLAG = 0x0800;

function dosDateTime(date = new Date()) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

async function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    return encoder.encode(String(data ?? ''));
}

export async function createZip(entries) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const { time, day } = dosDateTime();

    for (const entry of entries) {
        const name = normalizePath(entry.path);
        if (!name) continue;
        const nameBytes = encoder.encode(name);
        const data = await toBytes(entry.data);
        const crc = crc32(data);
        const local = new Uint8Array([
            ...u32(0x04034b50), ...u16(20), ...u16(ZIP_UTF8_FLAG), ...u16(0), ...u16(time), ...u16(day),
            ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)
        ]);
        chunks.push(local, nameBytes, data);
        central.push({ nameBytes, crc, size: data.length, offset, time, day });
        offset += local.length + nameBytes.length + data.length;
    }

    const centralOffset = offset;
    for (const item of central) {
        const header = new Uint8Array([
            ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(ZIP_UTF8_FLAG), ...u16(0), ...u16(item.time), ...u16(item.day),
            ...u32(item.crc), ...u32(item.size), ...u32(item.size), ...u16(item.nameBytes.length), ...u16(0), ...u16(0),
            ...u16(0), ...u16(0), ...u32(0), ...u32(item.offset)
        ]);
        chunks.push(header, item.nameBytes);
        offset += header.length + item.nameBytes.length;
    }

    const centralSize = offset - centralOffset;
    chunks.push(new Uint8Array([
        ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
        ...u32(centralSize), ...u32(centralOffset), ...u16(0)
    ]));
    return new Blob(chunks, { type: 'application/zip' });
}

function readU16(view, offset) {
    return view.getUint16(offset, true);
}

function readU32(view, offset) {
    return view.getUint32(offset, true);
}

async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('该浏览器不支持解压缩 ZIP 中的 deflate 条目。');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i -= 1) {
        if (readU32(view, i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('不是有效的 ZIP 存档。');
    const count = readU16(view, eocd + 10);
    let ptr = readU32(view, eocd + 16);
    const files = new Map();

    for (let i = 0; i < count; i += 1) {
        if (readU32(view, ptr) !== 0x02014b50) throw new Error('ZIP 中央目录损坏。');
        const method = readU16(view, ptr + 10);
        const compressedSize = readU32(view, ptr + 20);
        const uncompressedSize = readU32(view, ptr + 24);
        const nameLen = readU16(view, ptr + 28);
        const extraLen = readU16(view, ptr + 30);
        const commentLen = readU16(view, ptr + 32);
        const localOffset = readU32(view, ptr + 42);
        const name = decoder.decode(bytes.slice(ptr + 46, ptr + 46 + nameLen));
        const localNameLen = readU16(view, localOffset + 26);
        const localExtraLen = readU16(view, localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const compressed = bytes.slice(dataStart, dataStart + compressedSize);
        const data = method === 0 ? compressed : await inflateRaw(compressed);
        if (data.length !== uncompressedSize && method !== 0) throw new Error(`ZIP 条目大小异常：${name}`);
        files.set(normalizePath(name), new Blob([data]));
        ptr += 46 + nameLen + extraLen + commentLen;
    }
    return files;
}

export async function readZipText(files, path) {
    const blob = files.get(normalizePath(path));
    return blob ? blob.text() : '';
}
