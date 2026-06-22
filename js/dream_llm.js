import { getDreamMaxComponents } from './advanced_settings.js';

const LINE_MAX_TOKENS = 256;
const LINE_RETRY_MAX_TOKENS = 640;
let cachedCharacterPrompt = null;

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
}

async function loadCharacterPrompt() {
    if (cachedCharacterPrompt != null) return cachedCharacterPrompt;
    try {
        const response = await fetch('src/_queries/system_prompt.txt');
        cachedCharacterPrompt = response.ok
            ? await response.text()
            : '你是芙提雅（Fritia），是用户的可爱女朋友。你性格活泼温柔，偶尔会撒娇。';
    } catch {
        cachedCharacterPrompt = '你是芙提雅（Fritia），是用户的可爱女朋友。你性格活泼温柔，偶尔会撒娇。';
    }
    return cachedCharacterPrompt;
}

function stripCodeFence(text) {
    return String(text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function findFirstJsonObjectEnd(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) return i;
        }
    }

    return -1;
}

function extractJsonObject(text) {
    const normalized = stripCodeFence(text);
    try {
        return JSON.parse(normalized);
    } catch {}

    const first = normalized.indexOf('{');
    if (first >= 0) {
        const candidates = [];
        let start = first;
        while (start >= 0) {
            const end = findFirstJsonObjectEnd(normalized, start);
            if (end <= start) break;
            try {
                const candidate = JSON.parse(normalized.slice(start, end + 1));
                if (Array.isArray(candidate?.components) && candidate.components.length > 0) {
                    return candidate;
                }
                candidates.push(candidate);
            } catch {}
            start = normalized.indexOf('{', end + 1);
        }
        if (candidates.length > 0) {
            return candidates[0];
        }
    }

    throw new Error('LLM 输出不是合法 JSON。');
}

function textFromValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        return value.map(textFromValue).filter(Boolean).join('');
    }
    if (typeof value !== 'object') return '';

    if (value.text && typeof value.text === 'object') {
        const text = textFromValue(value.text.value);
        if (text) return text;
    }

    for (const key of ['content', 'text', 'output_text', 'response', 'result', 'line', 'message', 'delta', 'data']) {
        const text = textFromValue(value[key]);
        if (text) return text;
    }

    if (Array.isArray(value.choices)) {
        return textFromValue(value.choices[0]);
    }
    return '';
}

function extractCompletionText(json) {
    const choice = json?.choices?.[0];
    return textFromValue(choice?.delta?.content)
        || textFromValue(choice?.message?.content)
        || textFromValue(choice?.text)
        || textFromValue(choice?.message)
        || textFromValue(choice)
        || textFromValue(json?.output_text)
        || textFromValue(json?.content)
        || textFromValue(json);
}

function appendStreamCompletionText(current, json) {
    const text = extractCompletionText(json);
    if (!text) return current;
    return text.startsWith(current) ? text : current + text;
}

async function fetchChatCompletion(settings, body) {
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    if (!settings.apiKey) {
        throw new Error('未配置 API Key。');
    }
    if (!baseUrl) {
        throw new Error('未配置 Base URL。');
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`LLM 请求失败 (${response.status}): ${bodyText.slice(0, 180)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        const text = extractCompletionText(json).trim();
        return text || JSON.stringify(json);
    }

    if (!response.body) {
        throw new Error('API 没有返回可读取响应。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let rawText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        rawText += chunk;
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            if (data === '[DONE]' || data === 'event: message') continue;
            try {
                fullText = appendStreamCompletionText(fullText, JSON.parse(data));
            } catch {
                if (!data.startsWith('{') && !data.startsWith('[')) {
                    fullText += data;
                }
            }
        }
    }

    const tail = buffer.trim();
    if (tail && tail !== '[DONE]') {
        try {
            const data = tail.startsWith('data:') ? tail.slice(5).trim() : tail;
            fullText = appendStreamCompletionText(fullText, JSON.parse(data));
        } catch {}
    }

    if (!fullText.trim()) {
        try {
            const text = extractCompletionText(JSON.parse(rawText.trim())).trim();
            return text || rawText.trim();
        } catch {
            if (rawText.trim().startsWith('data:')) {
                throw new Error('LLM 没有返回最终 JSON 内容。');
            }
            return rawText.trim();
        }
    }

    return fullText.trim();
}

async function fetchChatCompletionJson(settings, body) {
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    if (!settings.apiKey) {
        throw new Error('未配置 API Key。');
    }
    if (!baseUrl) {
        throw new Error('未配置 Base URL。');
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`LLM 请求失败 (${response.status}): ${bodyText.slice(0, 180)}`);
    }

    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return { content: text };
    }
}

function formatFurnitureSummary(existingFurniture = []) {
    if (!Array.isArray(existingFurniture) || existingFurniture.length === 0) {
        return '当前没有玩家自制家具。';
    }
    return existingFurniture.slice(0, 20)
        .map(item => `- ${item.name || item.id}: ${item.category || 'custom'}，位置 x=${Number(item.pose?.position?.x || 0).toFixed(1)}, z=${Number(item.pose?.position?.z || 0).toFixed(1)}`)
        .join('\n');
}

function buildFurniturePrompt({ description, placementText, roomContext, existingFurniture }) {
    const bounds = roomContext?.bounds || {};
    const door = roomContext?.doorClearanceZone || {};
    const maxComponents = getDreamMaxComponents();
    return [
        `玩家想制造的家具：${description}`,
        `玩家描述的摆放位置：${placementText || '未填写，默认放在新房间中央安全区域。'}`,
        '',
        '房间坐标上下文：',
        `造梦房间可用范围：X ${bounds.minX} 到 ${bounds.maxX}，Z ${bounds.minZ} 到 ${bounds.maxZ}，墙高约 ${bounds.maxY}。`,
        `连接门清空区：X ${door.minX} 到 ${door.maxX}，Z ${door.minZ} 到 ${door.maxZ}。`,
        '最终坐标由本地程序确定，你不要输出绝对坐标。',
        '',
        '已有自制家具：',
        formatFurnitureSummary(existingFurniture),
        '',
        '请只输出一个家具规格 JSON。不要输出 Markdown，不要解释，不要生成 JavaScript。',
        '顶层 JSON 必须直接包含 components 数组，不要把 components 放进其他字段。',
        'name 为 1 到 12 个中文字符左右。',
        'category 只能是 seat/table/bed/storage/lighting/decor/plant/toy/hanging/painting/custom。',
        '默认 anchor 必须是 floor；只有玩家明确要求“挂在墙上/悬挂/壁挂/墙面上的钟/墙饰/挂画”等墙面悬挂家具时，才允许输出 anchor:"wall" 且 category:"hanging"。',
        '如果玩家明确要求挂在墙面的画、相框、展示框、照片框等矩形有边框悬挂家具，请输出 anchor:"wall" 且 category:"painting"。',
        'painting 家具必须包含边框组件，以及一个命名为 image_panel 或 display_surface 的薄矩形内侧展示面，用于后续本地图片替换。',
        '如果玩家没有明确要求悬挂或挂墙，绝对不要输出 anchor:"wall"，不要把普通家具放到墙上。',
        'dimensions.width/depth/height 使用米，默认不超过 3m/2.5m/2.3m。',
        'frontDirection 只能是 +X/-X/+Z/-Z。',
        `components 是 1 到 ${maxComponents} 个 primitive，绝不能是空数组；type 只能是 box/cylinder/sphere/cone/torus/plane。`,
        '每个 component 包含 name, position{x,y,z}, rotation{x,y,z}, size{x,y,z}, color, material。',
        'color 使用 #RRGGBB。',
        'material 只能表达 wood/fabric/metal/glass/plastic/ceramic/light/default 这类本地材质意图，不要外部贴图 URL。',
        'interaction.waypoint.offset 给出角色站在家具附近的位置偏移，不要太远。',
        'placement.intent/preferredWall/avoidDoor 描述摆放意图。'
    ].join('\n');
}

function buildFurnitureRevisionPrompt({ furniture, instruction, roomContext }) {
    const bounds = roomContext?.bounds || {};
    const currentSpec = furniture?.spec || {};
    const maxComponents = getDreamMaxComponents();
    return [
        `玩家要修改已经存在的造梦家具：「${furniture?.name || currentSpec.name || '造梦家具'}」。`,
        `玩家的样式修改要求：${instruction}`,
        '',
        '当前家具安全 JSON 规格如下：',
        JSON.stringify(currentSpec, null, 2),
        '',
        '房间坐标上下文：',
        `造梦房间可用范围：X ${bounds.minX} 到 ${bounds.maxX}，Z ${bounds.minZ} 到 ${bounds.maxZ}，墙高约 ${bounds.maxY}。`,
        '',
        '请基于当前 JSON 修改家具形态，只输出修改后的完整家具规格 JSON。不要输出 Markdown，不要解释，不要生成 JavaScript。',
        '必须保留同一个家具实体的语义；如果玩家要求添加电脑、靠垫、灯带等物件，请作为同一个家具的 components 增加或调整。',
        '如果当前家具 anchor 是 floor，即使玩家要求“在柱子上挂一个时钟/在侧面悬挂装饰”，也必须保持 anchor:"floor" 和原 category 不变；新增挂件应作为依附在现有家具竖直表面的 components，而不是把整件家具改成墙挂家具。',
        '如果要在普通家具的竖直表面添加挂件，请先识别现有家具正面、侧面或立柱表面，在该表面附近放置薄 box/cylinder/plane 组件，厚度很薄并略微外凸，避免和主体完全重叠。',
        '如果当前家具 anchor 是 wall，则不要输出修改；悬挂式家具不能进行样式修改。',
        '如果玩家要求在墙、屏风、隔断等实体上开门洞、窗洞或通道，必须把实体拆成门洞两侧和上方等多个 box 组件，不要用一整块 box 表示带洞的墙。',
        '顶层 JSON 必须直接包含非空 components 数组，不要把 components 放进其他字段。',
        `components 是 1 到 ${maxComponents} 个 primitive；type 只能是 box/cylinder/sphere/cone/torus/plane。`,
        '每个 component 必须包含 name, position{x,y,z}, rotation{x,y,z}, size{x,y,z}, color, material。',
        'dimensions.width/depth/height 使用米，不能超过房间安全尺寸；不要输出外部 URL 或贴图。',
        'color 使用 #RRGGBB；material 只能是 wood/fabric/metal/glass/plastic/ceramic/light/default 等本地材质意图。',
        '家具名称、描述和最终摆放位置会由本地程序保持不变，你不需要改变它们。'
    ].join('\n');
}

function cleanRomanticLine(content) {
    let text = stripCodeFence(content);
    try {
        const parsed = JSON.parse(text);
        text = textFromValue(parsed?.line ?? parsed?.text ?? parsed?.content ?? parsed?.message ?? parsed);
    } catch {
        try {
            const parsed = extractJsonObject(text);
            text = textFromValue(parsed?.line ?? parsed?.text ?? parsed?.content ?? parsed?.message ?? parsed);
        } catch {}
    }

    text = String(text || '')
        .replace(/^data:\s*/i, '')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .replace(/^芙提雅\s*[:：]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
    return Array.from(text).slice(0, 48).join('');
}

async function fetchRomanticLineAttempt(settings, body) {
    const json = await fetchChatCompletionJson(settings, body);
    const extracted = extractCompletionText(json).trim();
    return {
        json,
        raw: extracted || JSON.stringify(json),
        line: cleanRomanticLine(extracted || JSON.stringify(json))
    };
}

function shouldRetryRomanticLine(json, line) {
    const choice = json?.choices?.[0];
    return !line
        && choice?.finish_reason === 'length'
        && !String(choice?.message?.content || '').trim()
        && !!String(choice?.message?.reasoning_content || '').trim();
}

export async function requestDreamFurnitureSpec({ description, placementText, roomContext, existingFurniture, settings }) {
    const text = String(description || '').trim();
    if (!text) {
        return { ok: false, error: '请先填写家具描述。' };
    }
    if (!settings?.apiKey) {
        return { ok: false, error: '未配置 API Key。' };
    }

    const body = {
        model: settings.model,
        stream: false,
        temperature: 0.35,
        messages: [
            {
                role: 'system',
                content: [
                    '你是芙提雅 Online NEXT 的造梦家具规格生成器。',
                    '你只能输出严格 JSON，不能输出 Markdown、解释、注释或代码。',
                    '家具会由前端使用 Three.js 基础几何体程序化构建，所以你只能描述 primitives 和安全材质参数。',
                    '不要输出外部 URL，不要输出 JavaScript，不要输出多件独立家具；多个小物件应作为同一个家具实体的 components。',
                    '返回的顶层 JSON 必须包含非空 components 数组，至少 1 个可见 primitive。'
                ].join('\n')
            },
            {
                role: 'user',
                content: buildFurniturePrompt({ description: text, placementText, roomContext, existingFurniture })
            }
        ]
    };

    try {
        const content = await fetchChatCompletion(settings, body);
        if (!content.trim()) {
            return { ok: false, error: 'LLM 返回了空内容。' };
        }
        console.log('[Dream][LLM] furniture raw output:', content);
        const json = extractJsonObject(content);
        console.log('[Dream][LLM] furniture parsed JSON:', json);
        return { ok: true, spec: json, raw: content };
    } catch (err) {
        return { ok: false, error: err.message || 'LLM 请求失败。' };
    }
}

export async function requestDreamFurnitureRevision({ furniture, instruction, roomContext, settings }) {
    const text = String(instruction || '').trim();
    if (!text) {
        return { ok: false, error: '请先填写家具样式修改要求。' };
    }
    if (!settings?.apiKey) {
        return { ok: false, error: '未配置 API Key。' };
    }

    const body = {
        model: settings.model,
        stream: false,
        temperature: 0.28,
        messages: [
            {
                role: 'system',
                content: [
                    '你是芙提雅 Online NEXT 的造梦家具样式修改器。',
                    '你只能输出严格 JSON，不能输出 Markdown、解释、注释或代码。',
                    '你会收到一个已经通过安全校验的 Three.js primitive 家具 JSON，以及玩家的自然语言修改要求。',
                    '你的任务是输出修改后的完整家具规格 JSON；不能删除 components 数组，也不能让 components 为空。',
                    '不要输出外部 URL，不要输出 JavaScript，不要输出多件独立家具。'
                ].join('\n')
            },
            {
                role: 'user',
                content: buildFurnitureRevisionPrompt({ furniture, instruction: text, roomContext })
            }
        ]
    };

    try {
        const content = await fetchChatCompletion(settings, body);
        if (!content.trim()) {
            return { ok: false, error: 'LLM 返回了空内容。' };
        }
        console.log('[Dream][LLM] furniture revision raw output:', content);
        const json = extractJsonObject(content);
        console.log('[Dream][LLM] furniture revision parsed JSON:', json);
        return { ok: true, spec: json, raw: content };
    } catch (err) {
        return { ok: false, error: err.message || '家具样式修改请求失败。' };
    }
}

export async function requestFurnitureRomanticLine({ furniture, gameTimeContext, settings }) {
    if (!settings?.apiKey) {
        return { ok: false, error: '未配置 API Key。' };
    }

    const characterPrompt = await loadCharacterPrompt();
    const tags = Array.isArray(furniture?.spec?.interaction?.waypoint?.dialogueTags)
        ? furniture.spec.interaction.waypoint.dialogueTags.join('、')
        : '';

    const body = {
        model: settings.model,
        stream: false,
        temperature: 0.78,
        max_tokens: LINE_MAX_TOKENS,
        messages: [
            {
                role: 'system',
                content: [
                    characterPrompt,
                    '',
                    '当前是造梦系统的家具互动气泡，不是完整日常对话。',
                    '请严格保持上面的人格设定与语气，只根据由玩家亲手制作的家具，说一句与该家具相关的，简短、恋爱向、自然口语的中文台词。',
                    '不要超过 20 个汉字，不要旁白，不要加引号，不要解释推理过程。'
                ].join('\n')
            },
            {
                role: 'user',
                content: [
                    `家具名称：${furniture?.name || '造梦家具'}`,
                    `类型：${furniture?.category || 'custom'}`,
                    `描述：${furniture?.playerDescription || furniture?.description || ''}`,
                    `标签：${tags || '无'}`,
                    `时间：${gameTimeContext || ''}`
                ].join('\n')
            }
        ]
    };

    try {
        let attempt = await fetchRomanticLineAttempt(settings, body);
        console.log('[Dream][LLM] furniture romantic raw output:', attempt.raw);

        if (shouldRetryRomanticLine(attempt.json, attempt.line)) {
            const retryBody = {
                ...body,
                max_tokens: LINE_RETRY_MAX_TOKENS,
                temperature: 0.55
            };
            console.warn('[Dream][LLM] furniture romantic retry: reasoning consumed the first token budget.');
            attempt = await fetchRomanticLineAttempt(settings, retryBody);
            console.log('[Dream][LLM] furniture romantic retry raw output:', attempt.raw);
        }

        if (!attempt.line) return { ok: false, error: 'LLM 返回了空台词。', raw: attempt.raw };
        return { ok: true, line: attempt.line, raw: attempt.raw };
    } catch (err) {
        return { ok: false, error: err.message || '家具台词生成失败。' };
    }
}
