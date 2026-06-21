import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { loadCharacterFromModel, updateCharacter, getCharacterPosition, startInteraction, endInteraction, applyIdlePose } from './character.js';
import { getSettings } from './settings.js';
import { getGameTimeContext, recordDialogueInteraction } from './game_state.js';

const CHERNO_CARD_ID = 'special:cherno';
const CHERNO_MODEL_PATH = 'src/_char_card/Cherno/悖谬-见习侍奉.pmx';
const CHERNO_PROMPT_PATH = 'src/_char_card/Cherno/char_cherno_prompt.txt';
const CHERNO_FIXED_POSE = Object.freeze({ x: 7.2, y: 0.668, z: 42.01, rotationY: -Math.PI / 2 });
const CHERNO_LOOK_RADIUS = 5.0;
const CHERNO_WELCOME_VOICES = Object.freeze([
    'src/_voices/Cherno_welcome_1.wav',
    'src/_voices/Cherno_welcome_2.wav'
]);
const STORAGE_KEY = 'fritia_bar_guest_cards';
const BUILTIN_STATE_KEY = 'fritia_bar_guest_builtin_state';
const BAR_HISTORY_KEY = 'fritia_bar_conversation_history';
const DB_NAME = 'fritia_bar_guest_assets';
const DB_VERSION = 1;
const ASSET_STORE = 'assets';
const FENNY_CARD_ID = 'builtin:fenny';
const FENNY_MODEL_PATH = 'src/_char_card/fenny/芬妮-澄意 夕晖蜜约.pmx';
const FENNY_PROMPT_PATH = 'src/_char_card/fenny/char_fenny_prompt.txt';
const USER_ASSET_ROOT = 'bar_guests';
const PREVIEW_CAPTURE_SIZE = 192;
const BAR_GUEST_SPAWN_AREA = {
    minX: -3.2,
    maxX: 3.2,
    minZ: 43.8,
    maxZ: 48.6
};
const BAR_GUEST_SPAWN_RADIUS = 0.35;
const BAR_GUEST_SPAWN_HEIGHT = 1.5;
const BAR_GUEST_SPAWN_FOOT_OFFSET = 0.04;
const BAR_GUEST_SPAWN_FALLBACKS = [
    { x: -1.6, z: 47.0 },
    { x: 1.6, z: 47.2 },
    { x: 0.0, z: 45.4 },
    { x: -2.3, z: 44.8 },
    { x: 2.3, z: 45.2 }
];

const els = {};
const state = {
    scene: null,
    controlsModule: null,
    getBarBounds: null,
    getBarWaypoints: null,
    getBarColliders: null,
    getPlayerPosition: null,
    cards: [],
    persistedBuiltinIds: new Set(),
    runtimes: new Map(),
    activePrompt: null,
    selectedCardId: FENNY_CARD_ID,
    draft: {
        name: '',
        pmxFile: null,
        resourceFiles: [],
        promptFile: null,
        promptText: '',
        previewUrl: '',
        previewLoading: false,
        previewToken: 0
    },
    initialized: false,
    isInteracting: false,
    interactingRuntimeId: '',
    barHistory: []
};

let dbPromise = null;

const builtinFennyCard = Object.freeze({
    id: FENNY_CARD_ID,
    name: '芬妮',
    builtin: true,
    modelPath: FENNY_MODEL_PATH,
    promptPath: FENNY_PROMPT_PATH,
    createdAt: 0
});

const chernoCard = Object.freeze({
    id: CHERNO_CARD_ID,
    name: '琴诺',
    builtin: true,
    special: true,
    fixed: true,
    dialogueTheme: 'cherno',
    modelPath: CHERNO_MODEL_PATH,
    promptPath: CHERNO_PROMPT_PATH,
    createdAt: 0
});

function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('当前浏览器不支持 IndexedDB，无法保存角色资源。'));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB 打开失败'));
    });
    return dbPromise;
}

async function putAsset(path, blob) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readwrite');
        tx.objectStore(ASSET_STORE).put(blob, path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('资源保存失败'));
    });
}

async function getAsset(path) {
    if (!path) return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readonly');
        const req = tx.objectStore(ASSET_STORE).get(path);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error('资源读取失败'));
    });
}

async function deleteAsset(path) {
    if (!path) return;
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ASSET_STORE, 'readwrite');
        tx.objectStore(ASSET_STORE).delete(path);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('资源删除失败'));
    });
}

function sanitizeName(value, fallback = '新角色') {
    return String(value || '')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .trim()
        .slice(0, 24) || fallback;
}

function makeGuestId() {
    return `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAssetFileName(name) {
    return sanitizeName(name, 'asset.bin');
}

function assetBaseName(path) {
    return String(path || '').replace(/\\/g, '/').split('/').pop() || '';
}

function assetDirName(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    return index >= 0 ? normalized.slice(0, index) : '';
}

function getCardModelFileName(card) {
    return card?.modelFileName || assetBaseName(card?.modelPath) || 'model.pmx';
}

function getCardPromptFileName(card) {
    return card?.promptFileName || assetBaseName(card?.promptPath) || 'prompt.txt';
}

function readTextFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('文本读取失败'));
        reader.readAsText(file);
    });
}

async function extractPmxTextureNames(file) {
    if (!file) return new Set();
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const decoders = [
            new TextDecoder('utf-16le', { fatal: false }),
            new TextDecoder('shift_jis', { fatal: false }),
            new TextDecoder('utf-8', { fatal: false })
        ];
        const textureNames = new Set();
        const pattern = /(?:^|[^\w.\-/\\])([\w\u3000-\u9fffぁ-んァ-ン ._\-()[\]{}+@#$%&=~^]+?\.(?:png|jpe?g|bmp|tga|dds|gif|spa|sph|toon))(?:[^\w.\-/\\]|$)/ig;
        for (const decoder of decoders) {
            const text = decoder.decode(bytes);
            let match;
            while ((match = pattern.exec(text))) {
                const name = assetBaseName(match[1]).trim();
                if (name) textureNames.add(name.toLowerCase());
            }
        }
        return textureNames;
    } catch (err) {
        console.warn('[BarGuest] PMX texture scan skipped:', err);
        return new Set();
    }
}

function loadStoredCards() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(data)
            ? data.map(normalizeStoredCard).filter(Boolean)
            : [];
    } catch {
        return [];
    }
}

function normalizeStoredCard(card) {
    if (!card || typeof card !== 'object') return null;
    const id = String(card.id || '').trim();
    const name = sanitizeName(card.name || '');
    const modelPath = String(card.modelPath || '').trim();
    const promptPath = String(card.promptPath || '').trim();
    if (!id || !name || !modelPath || !promptPath) return null;
    const previewDataUrl = typeof card.previewDataUrl === 'string'
        && card.previewDataUrl.startsWith('data:image/')
        && card.previewDataUrl.length < 260000
        ? card.previewDataUrl
        : '';
    return {
        id,
        name,
        builtin: false,
        modelPath,
        promptPath,
        modelFileName: String(card.modelFileName || assetBaseName(modelPath) || '').trim(),
        promptFileName: String(card.promptFileName || assetBaseName(promptPath) || '').trim(),
        assetPaths: Array.isArray(card.assetPaths)
            ? [...new Set(card.assetPaths.map(path => String(path || '').trim()).filter(Boolean))]
            : [],
        previewDataUrl,
        createdAt: Number(card.createdAt) || Date.now()
    };
}

function saveStoredCards() {
    const userCards = state.cards.filter(card => !card.builtin);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userCards));
}

function normalizeBuiltinIds(ids) {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(id => String(id || '').trim()).filter(id => id === FENNY_CARD_ID))];
}

function loadBuiltinState() {
    try {
        const data = JSON.parse(localStorage.getItem(BUILTIN_STATE_KEY) || '{}');
        return new Set(normalizeBuiltinIds(data.activeIds));
    } catch {
        return new Set();
    }
}

function saveBuiltinState() {
    const activeIds = normalizeBuiltinIds([...state.persistedBuiltinIds]);
    localStorage.setItem(BUILTIN_STATE_KEY, JSON.stringify({
        activeIds,
        updatedAt: Date.now()
    }));
}

function setBuiltinPersisted(id, active) {
    if (id !== FENNY_CARD_ID) return;
    if (active) {
        state.persistedBuiltinIds.add(id);
    } else {
        state.persistedBuiltinIds.delete(id);
    }
    saveBuiltinState();
}

function syncStoredCards() {
    const storedCards = loadStoredCards();
    const storedIds = new Set(storedCards.map(card => card.id));
    state.persistedBuiltinIds = loadBuiltinState();
    for (const id of [...state.runtimes.keys()]) {
        const runtime = state.runtimes.get(id);
        if (runtime?.card?.special) continue;
        if (runtime?.card?.builtin) {
            if (!state.persistedBuiltinIds.has(id)) unloadGuest(id);
            continue;
        }
        if (runtime?.card?.transient) continue;
        if (!storedIds.has(id)) unloadGuest(id);
    }
    state.cards = [builtinFennyCard, ...storedCards];
    if (!state.cards.some(card => card.id === state.selectedCardId)) {
        state.selectedCardId = FENNY_CARD_ID;
    }
    renderCards();
}

function loadBarHistory() {
    try {
        const data = JSON.parse(localStorage.getItem(BAR_HISTORY_KEY) || '[]');
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function saveBarHistory() {
    localStorage.setItem(BAR_HISTORY_KEY, JSON.stringify(state.barHistory));
}

function setStatus(message, tone = 'info') {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.tone = tone;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function cardPreview(card) {
    if (card.previewDataUrl) return `<img src="${escapeHtml(card.previewDataUrl)}" alt="">`;
    return `<span>${escapeHtml(card.name.slice(0, 1) || '?')}</span>`;
}

function renderCards() {
    if (!els.cardList) return;
    els.cardList.innerHTML = '';
    for (const card of state.cards) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `bar-guest-card${card.id === state.selectedCardId ? ' active' : ''}`;
        item.innerHTML = `
            <span class="bar-guest-card__avatar">${cardPreview(card)}</span>
            <span class="bar-guest-card__body">
                <span class="bar-guest-card__name">${escapeHtml(card.name)}</span>
                <span class="bar-guest-card__meta">${card.builtin ? '内置角色' : '自定义角色'}</span>
            </span>
            ${card.builtin ? '' : '<span class="bar-guest-card__delete" title="删除">删除</span>'}
        `;
        item.addEventListener('click', (event) => {
            if (event.target?.classList?.contains('bar-guest-card__delete')) {
                event.stopPropagation();
                void deleteCard(card.id);
                return;
            }
            state.selectedCardId = card.id;
            renderCards();
            renderSelectedCardDetails(card);
        });
        els.cardList.appendChild(item);
    }
}

function getSelectedCard() {
    return state.cards.find(item => item.id === state.selectedCardId) || state.cards[0] || null;
}

function renderDraftPreview() {
    if (!els.preview) return;
    els.preview.classList.toggle('is-loading', Boolean(state.draft.previewLoading));
    if (state.draft.previewLoading) {
        els.preview.innerHTML = '<span class="bar-guest-preview__spinner"></span>';
    } else if (state.draft.previewUrl) {
        els.preview.innerHTML = `<img src="${escapeHtml(state.draft.previewUrl)}" alt="">`;
    } else {
        els.preview.innerHTML = '<span>PMX</span>';
    }
}

function renderSelectedCardDetails(card = getSelectedCard()) {
    if (!card) return;
    state.draft.pmxFile = null;
    state.draft.resourceFiles = [];
    state.draft.promptFile = null;
    state.draft.promptText = '';
    state.draft.previewUrl = card.previewDataUrl || '';
    state.draft.previewLoading = false;
    state.draft.previewToken = 0;
    if (els.pmxInput) els.pmxInput.value = '';
    if (els.promptInput) els.promptInput.value = '';
    if (els.nameInput) els.nameInput.value = card.name;
    if (els.pmxName) {
        els.pmxName.textContent = getCardModelFileName(card);
        els.pmxName.title = card.modelPath || '';
    }
    if (els.promptName) {
        els.promptName.textContent = getCardPromptFileName(card);
        els.promptName.title = card.promptPath || '';
    }
    renderDraftPreview();
    setStatus(`${card.name} 已选中，可直接邀请入场。`);
}

function disposePreviewObject(root) {
    root?.traverse?.((obj) => {
        if (obj.geometry) obj.geometry.dispose?.();
        const materials = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
        for (const mat of materials) {
            for (const value of Object.values(mat)) {
                if (value?.isTexture) value.dispose?.();
            }
            mat.dispose?.();
        }
    });
}

function capturePmxPreview(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const loader = new MMDLoader();
        let renderer = null;
        let meshRef = null;
        const cleanup = () => {
            if (meshRef) disposePreviewObject(meshRef);
            renderer?.dispose?.();
            URL.revokeObjectURL(objectUrl);
        };
        loader.load(
            objectUrl,
            (mesh) => {
                try {
                    meshRef = mesh;
                    const previewScene = new THREE.Scene();
                    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
                    renderer = new THREE.WebGLRenderer({
                        alpha: true,
                        antialias: true,
                        preserveDrawingBuffer: true
                    });
                    renderer.setPixelRatio(1);
                    renderer.setSize(PREVIEW_CAPTURE_SIZE, PREVIEW_CAPTURE_SIZE, false);

                    const box = new THREE.Box3().setFromObject(mesh);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z, 1);
                    mesh.position.sub(center);
                    mesh.scale.setScalar(1.55 / maxDim);
                    mesh.rotation.y = Math.PI;

                    previewScene.add(new THREE.HemisphereLight(0xffffff, 0x403040, 2.2));
                    const key = new THREE.DirectionalLight(0xffffff, 2.4);
                    key.position.set(1.6, 2.2, 2.6);
                    previewScene.add(key);
                    previewScene.add(mesh);

                    camera.position.set(0, 0.42, 3.0);
                    camera.lookAt(0, 0.18, 0);
                    renderer.render(previewScene, camera);
                    const dataUrl = renderer.domElement.toDataURL('image/png');
                    cleanup();
                    resolve(dataUrl);
                } catch (err) {
                    cleanup();
                    reject(err);
                }
            },
            undefined,
            (err) => {
                cleanup();
                reject(err || new Error('PMX preview failed'));
            }
        );
    });
}

function resetDraft() {
    state.draft = {
        name: '',
        pmxFile: null,
        resourceFiles: [],
        promptFile: null,
        promptText: '',
        previewUrl: '',
        previewLoading: false,
        previewToken: 0
    };
    if (els.nameInput) els.nameInput.value = '';
    if (els.pmxInput) els.pmxInput.value = '';
    if (els.promptInput) els.promptInput.value = '';
    if (els.pmxName) els.pmxName.textContent = '未选择 PMX';
    if (els.promptName) els.promptName.textContent = '未选择人格文档';
    if (els.pmxName) els.pmxName.title = '';
    if (els.promptName) els.promptName.title = '';
    renderDraftPreview();
}

async function handlePmxChanged(event) {
    const files = Array.from(event.target.files || []);
    const file = files.find(item => /\.pmx$/i.test(item.name)) || files[0] || null;
    const textureNames = await extractPmxTextureNames(file);
    const fallbackResourcePattern = /\.(?:png|jpe?g|bmp|tga|dds|gif|spa|sph|toon)$/i;
    const resourceFiles = files.filter(item => item !== file && (
        textureNames.has(item.name.toLowerCase())
        || textureNames.has(assetBaseName(item.webkitRelativePath || '').toLowerCase())
        || (textureNames.size === 0 && fallbackResourcePattern.test(item.name))
    ));
    state.draft.pmxFile = file;
    state.draft.resourceFiles = resourceFiles;
    state.draft.name = els.nameInput?.value || state.draft.name;
    if (els.pmxName) els.pmxName.textContent = file ? file.name : '未选择 PMX';
    if (els.pmxName) els.pmxName.title = resourceFiles.length > 0
        ? `${file?.name || ''}\n已自动匹配贴图：\n${resourceFiles.map(item => item.name).join('\n')}`
        : (file?.name || '');
    if (file) setStatus(resourceFiles.length > 0
        ? `已选择 PMX，并自动匹配 ${resourceFiles.length} 个贴图资源。`
        : '已选择 PMX。浏览器无法直接枚举单个文件所在目录；若贴图未自动匹配，请在文件选择时框选 PMX 同目录资源。');
    state.draft.previewUrl = '';
    state.draft.previewLoading = Boolean(file);
    const previewToken = Date.now() + Math.random();
    state.draft.previewToken = previewToken;
    renderDraftPreview();
    if (!file) {
        state.draft.previewLoading = false;
        renderDraftPreview();
        return;
    }
    try {
        const previewUrl = await capturePmxPreview(file);
        if (state.draft.previewToken === previewToken && state.draft.pmxFile === file) {
            state.draft.previewUrl = previewUrl;
        }
    } catch (err) {
        console.warn('[BarGuest] PMX preview skipped:', err);
        if (state.draft.previewToken === previewToken) state.draft.previewUrl = '';
    } finally {
        if (state.draft.previewToken === previewToken) {
            state.draft.previewLoading = false;
            renderDraftPreview();
        }
    }
}

async function handlePromptChanged(event) {
    const file = event.target.files?.[0] || null;
    state.draft.promptFile = file;
    state.draft.name = els.nameInput?.value || state.draft.name;
    if (els.promptName) els.promptName.textContent = file ? file.name : '未选择人格文档';
    if (els.promptName) els.promptName.title = file ? file.name : '';
    if (!file) {
        state.draft.promptText = '';
        return;
    }
    try {
        state.draft.promptText = await readTextFile(file);
        setStatus('人格设定已读取。');
    } catch (err) {
        state.draft.promptText = '';
        setStatus(`人格文档读取失败：${err.message}`, 'error');
    }
}

async function saveDraftCard() {
    const name = sanitizeName(els.nameInput?.value || state.draft.name);
    if (!state.draft.pmxFile || !state.draft.promptFile || !state.draft.promptText.trim()) {
        setStatus('请先填写名称，并导入 PMX 模型与人格设定文档。', 'error');
        return;
    }

    const id = makeGuestId();
    const modelPath = `${USER_ASSET_ROOT}/${id}/${normalizeAssetFileName(state.draft.pmxFile.name)}`;
    const promptPath = `${USER_ASSET_ROOT}/${id}/prompt.txt`;
    const assetPaths = state.draft.resourceFiles.map(file => `${USER_ASSET_ROOT}/${id}/${normalizeAssetFileName(file.name)}`);
    setStatus('正在保存角色资源...', 'busy');
    try {
        await putAsset(modelPath, state.draft.pmxFile);
        for (let i = 0; i < state.draft.resourceFiles.length; i += 1) {
            await putAsset(assetPaths[i], state.draft.resourceFiles[i]);
        }
        await putAsset(promptPath, new Blob([state.draft.promptText], { type: 'text/plain' }));
        const card = {
            id,
            name,
            builtin: false,
            modelPath,
            promptPath,
            modelFileName: state.draft.pmxFile.name,
            promptFileName: state.draft.promptFile.name,
            assetPaths,
            previewDataUrl: state.draft.previewUrl,
            createdAt: Date.now()
        };
        state.cards.push(card);
        state.selectedCardId = id;
        saveStoredCards();
        resetDraft();
        renderCards();
        renderSelectedCardDetails(card);
        setStatus(`${name} 已保存，可在候选列表中邀请。`);
    } catch (err) {
        setStatus(`保存失败：${err.message}`, 'error');
    }
}

async function deleteCard(id) {
    const card = state.cards.find(item => item.id === id);
    if (!card || card.builtin) return;
    unloadGuest(id);
    await deleteAsset(card.modelPath);
    await deleteAsset(card.promptPath);
    for (const path of card.assetPaths || []) await deleteAsset(path);
    state.cards = state.cards.filter(item => item.id !== id);
    if (state.selectedCardId === id) state.selectedCardId = FENNY_CARD_ID;
    saveStoredCards();
    renderCards();
    renderSelectedCardDetails();
    setStatus(`${card.name} 已删除。`);
}

function isWalkableColliderAt(collider, x, z) {
    const walkableHeight = Number(collider?.userData?.walkableHeight);
    return Number.isFinite(walkableHeight)
        && collider.max.y <= walkableHeight
        && x >= collider.min.x
        && x <= collider.max.x
        && z >= collider.min.z
        && z <= collider.max.z;
}

function overlapsSpawnFootprint(collider, x, z) {
    return x + BAR_GUEST_SPAWN_RADIUS > collider.min.x
        && x - BAR_GUEST_SPAWN_RADIUS < collider.max.x
        && z + BAR_GUEST_SPAWN_RADIUS > collider.min.z
        && z - BAR_GUEST_SPAWN_RADIUS < collider.max.z;
}

function getSpawnGroundY(x, z) {
    let groundY = Number(state.getBarBounds?.()?.min?.y);
    if (!Number.isFinite(groundY)) groundY = 0;
    const pos = { x, z };
    for (const collider of state.getBarColliders?.() || []) {
        if (!isWalkableColliderAt(collider, x, z)) continue;
        const dynamicGroundY = typeof collider.userData?.surfaceYAt === 'function'
            ? collider.userData.surfaceYAt(pos, collider)
            : null;
        groundY = Math.max(groundY, Number.isFinite(dynamicGroundY) ? dynamicGroundY : collider.max.y);
    }
    return groundY;
}

function isSpawnPointClear(x, z) {
    const groundY = getSpawnGroundY(x, z);
    const minY = groundY + BAR_GUEST_SPAWN_FOOT_OFFSET;
    const maxY = groundY + BAR_GUEST_SPAWN_HEIGHT;
    for (const collider of state.getBarColliders?.() || []) {
        if (isWalkableColliderAt(collider, x, z)) continue;
        if (!overlapsSpawnFootprint(collider, x, z)) continue;
        if (maxY > collider.min.y && minY < collider.max.y) return false;
    }
    return true;
}

function getSpawnPose(index = 0) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
        const x = BAR_GUEST_SPAWN_AREA.minX + Math.random() * (BAR_GUEST_SPAWN_AREA.maxX - BAR_GUEST_SPAWN_AREA.minX);
        const z = BAR_GUEST_SPAWN_AREA.minZ + Math.random() * (BAR_GUEST_SPAWN_AREA.maxZ - BAR_GUEST_SPAWN_AREA.minZ);
        const tooClose = [...state.runtimes.values()].some(runtime => {
            const pos = runtime.cd?.root?.position;
            return pos && Math.hypot(pos.x - x, pos.z - z) < 1.15;
        });
        if (!tooClose && isSpawnPointClear(x, z)) return { x, z, rotationY: Math.random() * Math.PI * 2 };
    }
    const fallback = BAR_GUEST_SPAWN_FALLBACKS.find(point => isSpawnPointClear(point.x, point.z))
        || BAR_GUEST_SPAWN_FALLBACKS[index % BAR_GUEST_SPAWN_FALLBACKS.length];
    return { ...fallback, rotationY: Math.random() * Math.PI * 2 };
}

function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

function faceRuntimeToward(runtime, targetPos, delta, options = {}) {
    const cd = runtime?.cd;
    if (!cd?.root || !targetPos) return;
    const dx = targetPos.x - cd.root.position.x;
    const dz = targetPos.z - cd.root.position.z;
    if (Math.hypot(dx, dz) <= 0.01) return;
    const targetAngle = Math.atan2(dx, dz);
    const factor = options.immediate ? 1 : 1 - Math.exp(-(options.lerpSpeed ?? 7.0) * Math.max(0, delta));
    cd.root.rotation.y = lerpAngle(cd.root.rotation.y, targetAngle, factor);
    cd.faceDirection = cd.root.rotation.y;
}

function applyRuntimeHeadLook(runtime, targetPos, delta, options = {}) {
    const cd = runtime?.cd;
    const head = cd?.boneRef?.head;
    if (!head || !head.parent || !targetPos) return false;
    cd.skeleton?.update?.();
    cd.mesh?.updateMatrixWorld?.(true);
    const headWorldPos = new THREE.Vector3();
    const lookDir = new THREE.Vector3();
    const parentQuat = new THREE.Quaternion();
    head.getWorldPosition(headWorldPos);
    lookDir.subVectors(targetPos, headWorldPos);
    if (lookDir.lengthSq() <= 0.01) return false;
    head.parent.getWorldQuaternion(parentQuat).invert();
    lookDir.applyQuaternion(parentQuat).normalize();
    const yaw = Math.atan2(-lookDir.x, lookDir.z);
    const pitch = Math.atan2(-lookDir.y, Math.sqrt(lookDir.x * lookDir.x + lookDir.z * lookDir.z));
    const yawLimit = options.yawLimit ?? 0.62;
    const pitchLimit = options.pitchLimit ?? 0.52;
    const targetYaw = Math.max(-yawLimit, Math.min(yawLimit, yaw));
    const targetPitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
    const factor = options.immediate ? 1 : 1 - Math.exp(-(options.lerpSpeed ?? 6.0) * Math.max(0, delta));
    head.rotation.y += (targetYaw - head.rotation.y) * factor;
    head.rotation.x += (targetPitch - head.rotation.x) * factor;
    cd.skeleton?.update?.();
    cd.mesh?.updateMatrixWorld?.(true);
    return true;
}

function buildGuestResourceManager(resourceUrls = []) {
    if (!resourceUrls.length) return null;
    const manager = new THREE.LoadingManager();
    const byName = new Map();
    for (const item of resourceUrls) {
        const key = assetBaseName(item.name).toLowerCase();
        if (key && item.url) byName.set(key, item.url);
    }
    manager.setURLModifier((url) => {
        const key = assetBaseName(url).toLowerCase();
        return byName.get(key) || url;
    });
    return manager;
}

async function resolveModelSource(card) {
    if (card.builtin) return { modelUrl: card.modelPath, resourceUrls: [], ownsModelUrl: false };
    const blob = await getAsset(card.modelPath);
    if (!blob) throw new Error(`缺少模型资源：${card.modelPath}`);
    const modelUrl = URL.createObjectURL(blob);
    const resourceUrls = [];
    for (const path of card.assetPaths || []) {
        const asset = await getAsset(path);
        if (asset) {
            resourceUrls.push({
                name: assetBaseName(path),
                path,
                url: URL.createObjectURL(asset)
            });
        }
    }
    return { modelUrl, resourceUrls, ownsModelUrl: true };
}

async function resolvePrompt(card) {
    if (card.builtin) {
        const response = await fetch(card.promptPath);
        if (!response.ok) throw new Error('内置人格设定加载失败');
        return response.text();
    }
    const blob = await getAsset(card.promptPath);
    if (!blob) throw new Error(`缺少人格资源：${card.promptPath}`);
    return blob.text();
}

async function inviteSelectedCard() {
    if (state.draft.pmxFile && state.draft.promptText.trim()) {
        const transientCard = {
            id: `transient:${makeGuestId()}`,
            name: sanitizeName(els.nameInput?.value || '临时访客'),
            builtin: false,
            transient: true,
            modelPath: '',
            promptPath: '',
            assetPaths: [],
            previewDataUrl: state.draft.previewUrl,
            createdAt: Date.now()
        };
        setStatus(`正在邀请 ${transientCard.name} 入场...`, 'busy');
        let modelUrl = '';
        let resourceUrls = [];
        try {
            modelUrl = URL.createObjectURL(state.draft.pmxFile);
            resourceUrls = state.draft.resourceFiles.map(file => ({
                name: file.name,
                url: URL.createObjectURL(file)
            }));
            const runtime = await loadGuestFromResolvedSource(transientCard, modelUrl, state.draft.promptText, {
                ownsModelUrl: true,
                resourceUrls
            });
            state.runtimes.set(transientCard.id, runtime);
            setStatus(`${transientCard.name} 已临时入场。`);
            closeInvitePanel();
        } catch (err) {
            if (modelUrl) URL.revokeObjectURL(modelUrl);
            for (const item of resourceUrls) {
                if (item.url) URL.revokeObjectURL(item.url);
            }
            setStatus(`邀请失败：${err.message}`, 'error');
        }
        return;
    }

    const card = state.cards.find(item => item.id === state.selectedCardId) || state.cards[0];
    if (!card) return;
    setStatus(`正在邀请 ${card.name} 入场...`, 'busy');
    try {
        await loadGuest(card);
        if (card.builtin) setBuiltinPersisted(card.id, true);
        setStatus(`${card.name} 已进入暖调闲聚。`);
        closeInvitePanel();
    } catch (err) {
        console.error('[BarGuest] invite failed:', err);
        setStatus(`邀请失败：${err.message}`, 'error');
    }
}

async function loadGuest(card) {
    const existing = state.runtimes.get(card.id);
    if (existing?.cd?.root) {
        const pose = getSpawnPose(state.runtimes.size);
        existing.cd.root.position.set(pose.x, existing.cd.baseY + getSpawnGroundY(pose.x, pose.z), pose.z);
        existing.cd.root.rotation.y = pose.rotationY;
        existing.cd.faceDirection = pose.rotationY;
        existing.cd.root.visible = true;
        return existing;
    }
    const source = await resolveModelSource(card);
    const prompt = await resolvePrompt(card);
    const runtime = await loadGuestFromResolvedSource(card, source.modelUrl, prompt, source);
    state.runtimes.set(card.id, runtime);
    return runtime;
}

async function loadGuestFromResolvedSource(card, modelUrl, prompt, sourceOptions = {}) {
    const pose = getSpawnPose(state.runtimes.size);
    const resourceUrls = Array.isArray(sourceOptions.resourceUrls) ? sourceOptions.resourceUrls : [];
    const loadingManager = buildGuestResourceManager(resourceUrls);
    const loadOptions = {
        meshName: `BarGuest_${card.id}`,
        displayName: card.name
    };
    if (loadingManager) loadOptions.loadingManager = loadingManager;
    const cd = await loadCharacterFromModel(
        state.scene,
        modelUrl,
        state.getBarWaypoints?.() || [],
        state.getBarColliders?.() || [],
        null,
        loadOptions
    );
    cd.isBarGuest = true;
    cd.guestId = card.id;
    cd.dialoguePrompt = prompt;
    cd.navigationScope = {
        roomId: 'bar',
        bounds: state.getBarBounds?.() || null
    };
    cd.root.position.set(pose.x, cd.baseY + getSpawnGroundY(pose.x, pose.z), pose.z);
    cd.root.rotation.y = pose.rotationY;
    cd.faceDirection = pose.rotationY;
    cd.root.visible = true;

    return {
        card,
        cd,
        modelObjectUrl: sourceOptions.ownsModelUrl ? modelUrl : '',
        resourceObjectUrls: resourceUrls.map(item => item.url).filter(Boolean),
        prompt
    };
}

async function loadChernoGuest() {
    const existing = state.runtimes.get(CHERNO_CARD_ID);
    if (existing?.cd?.root) {
        placeChernoRuntime(existing, { resetRotation: true });
        existing.cd.root.visible = true;
        return existing;
    }
    const prompt = await resolvePrompt(chernoCard);
    const cd = await loadCharacterFromModel(
        state.scene,
        CHERNO_MODEL_PATH,
        [],
        state.getBarColliders?.() || [],
        null,
        {
            meshName: `BarGuest_${CHERNO_CARD_ID}`,
            displayName: chernoCard.name
        }
    );
    cd.isBarGuest = true;
    cd.isSpecialBarGuest = true;
    cd.isFixedBarGuest = true;
    cd.guestId = CHERNO_CARD_ID;
    cd.dialoguePrompt = prompt;
    cd.navigationScope = {
        roomId: 'bar',
        bounds: state.getBarBounds?.() || null
    };
    cd.waypoints = [];
    cd.currentWaypoint = null;
    cd.targetWaypoint = null;
    cd.idleDuration = Number.POSITIVE_INFINITY;
    applyIdlePose(cd);
    const runtime = {
        card: chernoCard,
        cd,
        modelObjectUrl: '',
        resourceObjectUrls: [],
        prompt,
        fixedPose: CHERNO_FIXED_POSE,
        lookRadius: CHERNO_LOOK_RADIUS
    };
    state.runtimes.set(CHERNO_CARD_ID, runtime);
    placeChernoRuntime(runtime, { resetRotation: true });
    return runtime;
}

function placeChernoRuntime(runtime, options = {}) {
    const cd = runtime?.cd;
    const pose = runtime?.fixedPose || CHERNO_FIXED_POSE;
    if (!cd?.root) return;
    cd.root.position.set(pose.x, pose.y, pose.z);
    if (options.resetRotation || !Number.isFinite(cd.faceDirection)) {
        cd.faceDirection = pose.rotationY;
        cd.root.rotation.y = pose.rotationY;
    }
    cd.root.visible = true;
}

function updateChernoRuntime(runtime, delta) {
    const cd = runtime?.cd;
    if (!cd?.root?.visible) return;
    placeChernoRuntime(runtime);
    cd.state = 'idle';
    cd.prevState = 'idle';
    cd.stateTimer = 0;
    cd.currentWaypoint = null;
    cd.targetWaypoint = null;
    cd.walkPathQueue = null;
    cd.walkProgress = 0;
    cd.walkBlend = 0;
    applyIdlePose(cd);
    const playerPos = state.getPlayerPosition?.();
    if (!playerPos) return;
    const dx = playerPos.x - cd.root.position.x;
    const dz = playerPos.z - cd.root.position.z;
    if (Math.hypot(dx, dz) > (runtime.lookRadius || CHERNO_LOOK_RADIUS)) {
        cd.root.rotation.y = lerpAngle(cd.root.rotation.y, CHERNO_FIXED_POSE.rotationY, 1 - Math.exp(-4.2 * Math.max(0, delta)));
        cd.faceDirection = cd.root.rotation.y;
        const head = cd.boneRef?.head;
        if (head) {
            const factor = 1 - Math.exp(-5.0 * Math.max(0, delta));
            head.rotation.x += (0 - head.rotation.x) * factor;
            head.rotation.y += (0 - head.rotation.y) * factor;
            cd.skeleton?.update?.();
            cd.mesh?.updateMatrixWorld?.(true);
        }
        return;
    }
    faceRuntimeToward(runtime, playerPos, delta);
    applyRuntimeHeadLook(runtime, playerPos, delta);
}

function unloadGuest(id) {
    const runtime = state.runtimes.get(id);
    if (!runtime) return;
    if (runtime.cd?.root) state.scene?.remove(runtime.cd.root);
    if (runtime.modelObjectUrl) URL.revokeObjectURL(runtime.modelObjectUrl);
    for (const url of runtime.resourceObjectUrls || []) URL.revokeObjectURL(url);
    state.runtimes.delete(id);
}

export function unloadTransientGuests() {
    for (const [id, runtime] of [...state.runtimes.entries()]) {
        if (runtime.card?.special) continue;
        if (runtime.card.transient || (!runtime.card.builtin && !state.cards.some(card => card.id === id && !card.builtin))) {
            unloadGuest(id);
        }
    }
}

export async function loadPersistentBarGuests() {
    syncStoredCards();
    try {
        await loadChernoGuest();
    } catch (err) {
        console.warn('[BarGuest] Cherno load skipped:', err);
    }
    for (const card of state.cards.filter(item => item.builtin && state.persistedBuiltinIds.has(item.id))) {
        try {
            await loadGuest(card);
        } catch (err) {
            console.warn('[BarGuest] persistent builtin guest load skipped:', card.name, err);
        }
    }
    for (const card of state.cards.filter(item => !item.builtin)) {
        try {
            await loadGuest(card);
        } catch (err) {
            console.warn('[BarGuest] persistent guest load skipped:', card.name, err);
        }
    }
}

export function unloadAllBarGuests(options = {}) {
    for (const [id, runtime] of [...state.runtimes.entries()]) {
        if (options.keepPersistent && !runtime.card.transient && !runtime.card.builtin && state.cards.some(card => card.id === id)) {
            runtime.cd.root.visible = false;
            continue;
        }
        unloadGuest(id);
    }
}

export function updateBarGuests(delta) {
    for (const runtime of state.runtimes.values()) {
        if (!runtime.cd?.root?.visible) continue;
        if (runtime.card?.id === CHERNO_CARD_ID) {
            if (state.interactingRuntimeId === CHERNO_CARD_ID) {
                placeChernoRuntime(runtime);
                updateCharacter(runtime.cd, delta);
                placeChernoRuntime(runtime);
            } else {
                updateChernoRuntime(runtime, delta);
            }
            continue;
        }
        updateCharacter(runtime.cd, delta);
    }
}

export function poseBarGuestsForDance(stagePoint = { x: 0, z: 35.6 }) {
    const targetX = Number(stagePoint?.x) || 0;
    const targetZ = Number(stagePoint?.z) || 35.6;
    for (const runtime of state.runtimes.values()) {
        const cd = runtime.cd;
        if (!cd?.root?.visible) continue;
        if (runtime.card?.id === CHERNO_CARD_ID) {
            updateChernoRuntime(runtime, 0);
            continue;
        }
        cd.state = 'idle';
        cd.prevState = 'idle';
        cd.stateTimer = 0;
        cd.currentWaypoint = null;
        cd.targetWaypoint = null;
        cd.walkPathQueue = null;
        cd.walkProgress = 0;
        cd.walkBlend = 0;
        cd.walkClipping = false;
        cd.roomTransitionQueue = null;
        cd.lastStoodFromFurnitureWaypointName = null;
        applyIdlePose(cd);
        const dx = targetX - cd.root.position.x;
        const dz = targetZ - cd.root.position.z;
        if (Math.hypot(dx, dz) > 0.01) {
            const angle = Math.atan2(dx, dz);
            cd.root.rotation.y = angle;
            cd.faceDirection = angle;
        }
        cd.mesh?.updateMatrixWorld?.(true);
        cd.skeleton?.update?.();
    }
}

export function findNearestGuest(position, threshold = 2.5) {
    if (!position) return null;
    let best = null;
    let bestDist = threshold;
    for (const runtime of state.runtimes.values()) {
        if (!runtime.cd?.root?.visible) continue;
        const dist = getCharacterPosition(runtime.cd).distanceTo(position);
        if (dist < bestDist) {
            best = runtime;
            bestDist = dist;
        }
    }
    return best;
}

export function getGuestPosition(runtime) {
    return getCharacterPosition(runtime?.cd);
}

export function getActiveBarGuestParticipants() {
    return [...state.runtimes.values()]
        .filter(runtime => runtime?.cd?.root?.visible && runtime?.card?.id && runtime?.card?.name)
        .map(runtime => ({
            id: runtime.card.id,
            name: runtime.card.name,
            prompt: runtime.prompt || runtime.cd?.dialoguePrompt || '',
            type: runtime.card.builtin ? 'builtin_guest' : 'custom_guest',
            avatarText: String(runtime.card.name || '?').trim().slice(0, 1) || '?',
            isBuiltin: Boolean(runtime.card.builtin),
            isSpecial: Boolean(runtime.card.special)
        }));
}

function createMessage(role, content, characterId, characterName) {
    return { role, content, characterId, characterName, scene: 'bar', ts: Date.now() };
}

function getRuntimeHistory(runtime) {
    return state.barHistory.filter(item => item.characterId === runtime.card.id).slice(-18);
}

function buildGuestSystemPrompt(runtime) {
    return [
        runtime.prompt || `你正在扮演 ${runtime.card.name}。`,
        '',
        getGameTimeContext(),
        '',
        '当前地点是“暖调闲聚”酒吧地图。你只在这个场景中与玩家互动。',
        '请保持角色人格设定，用自然、简短、有现场感的口吻回复。'
    ].join('\n');
}

async function sendGuestMessage() {
    if (!state.isInteracting) return;
    const runtime = state.runtimes.get(state.interactingRuntimeId);
    const msg = els.dialogueInput?.value?.trim();
    if (!runtime || !msg) return;
    const settings = getSettings();
    if (!settings.apiKey) {
        appendGuestSystemMessage('请先在设置中填写 API Key');
        return;
    }

    els.dialogueInput.value = '';
    const userMsg = createMessage('user', msg, runtime.card.id, runtime.card.name);
    state.barHistory.push(userMsg);
    saveBarHistory();
    appendGuestUserMessage(msg);

    const thinking = appendGuestThinking(runtime.card.name);
    try {
        const history = getRuntimeHistory(runtime).map(item => ({ role: item.role, content: item.content }));
        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    { role: 'system', content: buildGuestSystemPrompt(runtime) },
                    ...history
                ],
                stream: true,
                temperature: 0.85
            })
        });
        if (!response.ok) throw new Error(`API 错误 (${response.status})`);
        thinking.remove();
        const bubble = appendGuestAssistantShell(runtime.card.name);
        let fullText = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (!data || data === '[DONE]') continue;
                try {
                    const content = JSON.parse(data).choices?.[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        bubble.querySelector('.msg-text').textContent = fullText;
                        scrollDialogue();
                    }
                } catch {}
            }
        }
        state.barHistory.push(createMessage('assistant', fullText, runtime.card.id, runtime.card.name));
        saveBarHistory();
        if (fullText.trim()) recordDialogueInteraction('bar', fullText);
    } catch (err) {
        thinking.remove();
        appendGuestSystemMessage(`请求失败：${err.message}`);
    }
}

function appendGuestBubble(role, name, text = '') {
    const row = document.createElement('div');
    row.className = `chat-row ${role === 'user' ? 'user-row' : 'assistant-row'}`;
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role === 'user' ? 'user-bubble' : 'assistant-bubble'}`;
    const nameEl = document.createElement('div');
    nameEl.className = `chat-name ${role === 'user' ? 'user-name' : 'assistant-name'}`;
    nameEl.textContent = name;
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = text;
    bubble.appendChild(nameEl);
    bubble.appendChild(textEl);
    row.appendChild(bubble);
    els.dialogueText.appendChild(row);
    scrollDialogue();
    return row;
}

function appendGuestUserMessage(text) {
    return appendGuestBubble('user', '你', text);
}

function appendGuestAssistantShell(name) {
    return appendGuestBubble('assistant', name, '');
}

function appendGuestThinking(name) {
    const row = appendGuestBubble('assistant', name, '思考中...');
    row.classList.add('thinking-row');
    row.querySelector('.chat-bubble')?.classList.add('thinking');
    return row;
}

function appendGuestSystemMessage(text) {
    const row = document.createElement('div');
    row.className = 'chat-row system-row';
    const msg = document.createElement('div');
    msg.className = 'system-msg';
    msg.textContent = text;
    row.appendChild(msg);
    els.dialogueText.appendChild(row);
    scrollDialogue();
}

function scrollDialogue() {
    requestAnimationFrame(() => {
        if (els.dialogueArea) els.dialogueArea.scrollTop = els.dialogueArea.scrollHeight;
    });
}

function playChernoWelcomeVoice() {
    const src = CHERNO_WELCOME_VOICES[Math.floor(Math.random() * CHERNO_WELCOME_VOICES.length)];
    if (!src) return;
    const audio = new Audio(src);
    audio.volume = 0.86;
    audio.play().catch(() => {});
}

export function startGuestInteraction(runtime) {
    if (!runtime?.cd || state.isInteracting) return false;
    state.isInteracting = true;
    state.interactingRuntimeId = runtime.card.id;
    startInteraction(runtime.cd, () => state.getPlayerPosition?.() || new THREE.Vector3());
    const dialogueUi = document.getElementById('dialogue-ui');
    dialogueUi?.classList.add('bar-guest-dialogue');
    if (runtime.card.dialogueTheme === 'cherno') {
        dialogueUi?.classList.add('bar-guest-dialogue--cherno');
        playChernoWelcomeVoice();
    }
    if (els.dialogueName) els.dialogueName.textContent = runtime.card.name;
    if (els.dialogueText) els.dialogueText.innerHTML = '';
    appendGuestAssistantShell(runtime.card.name).querySelector('.msg-text').textContent = `${runtime.card.name} 已经入场。想聊什么？`;
    document.getElementById('dialogue-ui')?.classList.remove('hidden');
    state.controlsModule?.releaseControlMode?.({ resumeOnClose: true });
    setTimeout(() => els.dialogueInput?.focus(), 100);
    return true;
}

export function endGuestInteraction() {
    if (!state.isInteracting) return;
    const runtime = state.runtimes.get(state.interactingRuntimeId);
    if (runtime?.cd) endInteraction(runtime.cd);
    state.isInteracting = false;
    state.interactingRuntimeId = '';
    const dialogueUi = document.getElementById('dialogue-ui');
    dialogueUi?.classList.remove('bar-guest-dialogue', 'bar-guest-dialogue--cherno');
    dialogueUi?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'dialogue-ui' } }));
}

export function isGuestInteracting() {
    return state.isInteracting;
}

export function openInvitePanel() {
    if (!els.panel) return false;
    resetDraft();
    renderCards();
    renderSelectedCardDetails();
    els.panel.classList.remove('hidden');
    state.controlsModule?.releaseControlMode?.({ resumeOnClose: true });
    return true;
}

export function closeInvitePanel() {
    if (!els.panel) return false;
    els.panel.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'bar-guest-panel' } }));
    return true;
}

export function isInvitePanelVisible() {
    return Boolean(els.panel && !els.panel.classList.contains('hidden'));
}

export function getBarConversationHistory() {
    return state.barHistory;
}

export function importBarConversationHistory(data) {
    if (!Array.isArray(data)) return;
    state.barHistory = data;
    saveBarHistory();
}

export function exportBarGuestCards() {
    return state.cards.filter(card => !card.builtin).map(card => ({
        id: card.id,
        name: card.name,
        modelPath: card.modelPath,
        promptPath: card.promptPath,
        modelFileName: getCardModelFileName(card),
        promptFileName: getCardPromptFileName(card),
        assetPaths: Array.isArray(card.assetPaths) ? card.assetPaths : [],
        previewDataUrl: card.previewDataUrl || '',
        createdAt: card.createdAt
    }));
}

export function exportBarGuestCardsByPaths(paths = new Set()) {
    return exportBarGuestCards().filter(card =>
        paths.has(card.modelPath)
        && paths.has(card.promptPath)
        && (card.assetPaths || []).every(path => paths.has(path))
    );
}

export function exportBarGuestBuiltinState() {
    return {
        activeIds: normalizeBuiltinIds([...state.persistedBuiltinIds])
    };
}

export async function exportBarGuestAssets() {
    const assets = [];
    for (const card of state.cards.filter(item => !item.builtin)) {
        const model = await getAsset(card.modelPath);
        const prompt = await getAsset(card.promptPath);
        if (model) assets.push({ path: card.modelPath, blob: model });
        if (prompt) assets.push({ path: card.promptPath, blob: prompt });
        for (const path of card.assetPaths || []) {
            const asset = await getAsset(path);
            if (asset) assets.push({ path, blob: asset });
        }
    }
    return assets;
}

export async function importBarGuestCards(cards = [], assets = []) {
    for (const asset of assets) {
        if (asset?.path && asset.blob) await putAsset(asset.path, asset.blob);
    }
    const assetPathSet = new Set(assets.map(asset => asset?.path).filter(Boolean));
    const normalized = Array.isArray(cards) ? cards.map(normalizeStoredCard).filter(Boolean) : [];
    const incoming = [];
    for (const card of normalized) {
        if (assetPathSet.size > 0) {
            if (
                assetPathSet.has(card.modelPath)
                && assetPathSet.has(card.promptPath)
                && (card.assetPaths || []).every(path => assetPathSet.has(path))
            ) {
                incoming.push(card);
            }
            continue;
        }
        const [model, prompt, ...extraAssets] = await Promise.all([
            getAsset(card.modelPath).catch(() => null),
            getAsset(card.promptPath).catch(() => null),
            ...(card.assetPaths || []).map(path => getAsset(path).catch(() => null))
        ]);
        if (model && prompt && extraAssets.every(Boolean)) incoming.push(card);
    }
    const byId = new Map(state.cards.filter(card => !card.builtin).map(card => [card.id, card]));
    for (const card of incoming) byId.set(card.id, card);
    state.cards = [builtinFennyCard, ...byId.values()];
    saveStoredCards();
    renderCards();
    return { imported: incoming.length };
}

export function importBarGuestBuiltinState(data) {
    if (!data || typeof data !== 'object') return;
    state.persistedBuiltinIds = new Set(normalizeBuiltinIds(data.activeIds));
    saveBuiltinState();
}

export function initBarGuestSystem(options = {}) {
    if (state.initialized) return;
    state.initialized = true;
    state.scene = options.scene;
    state.controlsModule = options.controlsModule;
    state.getBarBounds = options.getBarBounds;
    state.getBarWaypoints = options.getBarWaypoints;
    state.getBarColliders = options.getBarColliders;
    state.getPlayerPosition = options.getPlayerPosition;
    state.persistedBuiltinIds = loadBuiltinState();
    state.cards = [builtinFennyCard, ...loadStoredCards()];
    state.barHistory = loadBarHistory();

    els.panel = document.getElementById('bar-guest-panel');
    els.close = document.getElementById('bar-guest-close');
    els.cardList = document.getElementById('bar-guest-card-list');
    els.nameInput = document.getElementById('bar-guest-name');
    els.pmxInput = document.getElementById('bar-guest-pmx-file');
    els.promptInput = document.getElementById('bar-guest-prompt-file');
    els.pmxPick = document.getElementById('bar-guest-pmx-pick');
    els.promptPick = document.getElementById('bar-guest-prompt-pick');
    els.pmxName = document.getElementById('bar-guest-pmx-name');
    els.promptName = document.getElementById('bar-guest-prompt-name');
    els.preview = document.getElementById('bar-guest-preview');
    els.save = document.getElementById('bar-guest-save');
    els.invite = document.getElementById('bar-guest-invite');
    els.status = document.getElementById('bar-guest-status');
    els.dialogueName = document.getElementById('dialogue-name');
    els.dialogueArea = document.getElementById('dialogue-text-area');
    els.dialogueText = document.getElementById('dialogue-text');
    els.dialogueInput = document.getElementById('dialogue-input');
    els.dialogueSend = document.getElementById('dialogue-send');
    els.dialogueClose = document.getElementById('dialogue-close');

    els.close?.addEventListener('click', closeInvitePanel);
    els.pmxPick?.addEventListener('click', () => els.pmxInput?.click());
    els.promptPick?.addEventListener('click', () => els.promptInput?.click());
    els.pmxInput?.addEventListener('change', handlePmxChanged);
    els.promptInput?.addEventListener('change', handlePromptChanged);
    els.save?.addEventListener('click', () => { void saveDraftCard(); });
    els.invite?.addEventListener('click', () => { void inviteSelectedCard(); });
    els.dialogueSend?.addEventListener('click', (event) => {
        if (!state.isInteracting) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void sendGuestMessage();
    }, true);
    els.dialogueInput?.addEventListener('keydown', (event) => {
        if (!state.isInteracting || event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void sendGuestMessage();
    }, true);
    els.dialogueClose?.addEventListener('click', (event) => {
        if (!state.isInteracting) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        endGuestInteraction();
    }, true);

    renderCards();
    resetDraft();
}
