import { getSettings } from './settings.js';
import { buildRagReferenceMessage, ensurePreloadedKnowledgeBases } from './knowledge_base.js';

const SYSTEM_PROMPT_URL = 'src/_queries/system_prompt.txt';
const CARD_COUNT = 15;
const LOCKED_CATEGORIES = ['attack', 'attack', 'attack', 'attack', 'heal', 'heal', 'heal'];
const FLEX_CATEGORIES = ['attack', 'heal', 'control', 'summon', 'buff'];

export const SIDE_CARD_CATEGORY_LABELS = {
    attack: '攻击',
    heal: '治疗',
    control: '控制',
    summon: '召唤',
    buff: '强化'
};

export const SIDE_CARD_RARITY_LABELS = {
    blue: '蓝',
    purple: '紫',
    gold: '金'
};

const RARITIES = [
    { id: 'blue', weight: 68 },
    { id: 'purple', weight: 25 },
    { id: 'gold', weight: 7 }
];

const EFFECTS = {
    attack: ['shot', 'pierce', 'burst'],
    heal: ['heal', 'armor'],
    control: ['freeze', 'silence', 'vulnerable'],
    summon: ['fire_summon'],
    buff: ['shield', 'focus', 'weaken', 'weaken', 'vulnerable', 'bleed_growth', 'rupture_stack', 'focus_chain']
};

const FALLBACK_NAMES = {
    attack: ['霜刃', '冰魄', '星火', '雪脉', '冷锋'],
    heal: ['暖流', '复写', '回温', '白息', '护航'],
    control: ['凝滞', '静默', '破绽', '锁域', '低温'],
    summon: ['火种', '焰核', '赤羽', '熔星', '薪焰'],
    buff: ['校准', '护盾', '专注', '整备', '增幅']
};

let cachedCharacterPrompt = null;

export async function buildSideScrollerCardBatch({ styleText = '', reason = 'start' } = {}) {
    const slots = createCardSlots();
    let suggestions = [];
    let source = 'fallback';
    let message = '';
    let diagnostics = null;

    try {
        suggestions = await requestCardSuggestions({ slots, styleText, reason });
        if (!suggestions.length) throw new Error('LLM returned no usable card suggestions.');
        source = 'llm';
    } catch (err) {
        message = err?.message || '卡牌命名暂时使用本地规则。';
        diagnostics = {
            reason,
            styleText: String(styleText || '').slice(0, 240),
            error: message
        };
        console.error('[SideScrollerCards] LLM card generation failed; using fallback cards.', diagnostics, err);
    }

    const suggestionBySlot = new Map(
        suggestions
            .filter(item => item?.slotId)
            .map(item => [String(item.slotId), item])
    );

    return {
        cards: shuffleCards(slots.map((slot, index) => materializeCard(slot, suggestionBySlot.get(slot.slotId), index))),
        source,
        message,
        diagnostics
    };
}

function createCardSlots() {
    const slots = [];
    for (let i = 0; i < CARD_COUNT; i += 1) {
        const lockedCategory = LOCKED_CATEGORIES[i] || null;
        slots.push({
            slotId: `slot-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 9999)}`,
            index: i,
            lockedCategory,
            rarity: pickRarity(),
            effectScope: Math.random() < 0.3 ? 'area' : 'single',
            allowedCategories: FLEX_CATEGORIES
        });
    }
    return slots;
}

function materializeCard(slot, suggestion, index) {
    const category = normalizeCategory(
        slot.lockedCategory || suggestion?.category || FLEX_CATEGORIES[Math.floor(Math.random() * FLEX_CATEGORIES.length)],
        slot.lockedCategory || 'attack'
    );
    const rarity = normalizeRarity(slot.rarity);
    const effectKind = pickEffect(category);
    const mechanics = createMechanics(category, rarity, effectKind, slot.effectScope);
    const fallbackName = FALLBACK_NAMES[category]?.[index % (FALLBACK_NAMES[category]?.length || 1)] || '战术';
    const card = {
        id: `${slot.slotId}-${Math.floor(Math.random() * 100000)}`,
        slotId: slot.slotId,
        name: sanitizeCardName(suggestion?.name, fallbackName),
        description: '',
        rarity,
        category,
        categoryLabel: SIDE_CARD_CATEGORY_LABELS[category] || category,
        rarityLabel: SIDE_CARD_RARITY_LABELS[rarity] || rarity,
        targetMode: mechanics.targetMode,
        effectKind,
        value: mechanics.value,
        duration: mechanics.duration,
        instant: false,
        tags: mechanics.tags
    };
    card.description = normalizeDescriptionForScope(card, sanitizeDescription(suggestion?.description, fallbackDescription(card)));
    return card;
}

function createMechanics(category, rarity, effectKind, effectScope = 'single') {
    const strength = {
        blue: { attack: [18, 30], heal: [14, 26], summon: [22, 34], shield: 0.18, focus: 0.14, focusChain: 0.1, rupture: 0.12, buffTurns: 2, control: [1, 1], vulnerable: 0.24, vulnerableTurns: 2 },
        purple: { attack: [36, 62], heal: [32, 52], summon: [42, 70], shield: 0.28, focus: 0.24, focusChain: 0.1, rupture: 0.12, buffTurns: 2, control: [1, 2], vulnerable: 0.38, vulnerableTurns: 2 },
        gold: { attack: [96, 190], heal: [82, 150], summon: [120, 260], shield: 0.42, focus: 0.42, focusChain: 0.1, rupture: 0.12, buffTurns: 3, control: [2, 3], vulnerable: 0.72, vulnerableTurns: 3 }
    }[rarity] || {};

    if (category === 'heal') {
        if (effectKind === 'armor') {
            return { targetMode: 'self', value: randomInt(...strength.heal), duration: 0, tags: ['armor'] };
        }
        return { targetMode: 'self', value: randomInt(...strength.heal), duration: 0, tags: ['restore'] };
    }
    if (category === 'control') {
        if (effectKind === 'vulnerable') {
            return { targetMode: 'enemy', value: strength.vulnerable, duration: strength.vulnerableTurns, tags: ['debuff'] };
        }
        return { targetMode: 'enemy', value: 0, duration: randomInt(...strength.control), tags: ['debuff'] };
    }
    if (category === 'summon') {
        const area = effectScope === 'area';
        return { targetMode: 'enemy', value: randomInt(...strength.summon), duration: 0, tags: area ? ['fire', 'area'] : ['fire'] };
    }
    if (category === 'buff') {
        if (effectKind === 'focus') {
            return { targetMode: 'self', value: strength.focus, duration: strength.buffTurns, tags: ['damage-up'] };
        }
        if (effectKind === 'weaken') {
            return { targetMode: 'enemy', value: strength.shield, duration: strength.buffTurns, tags: ['debuff'] };
        }
        if (effectKind === 'vulnerable') {
            return { targetMode: 'enemy', value: strength.vulnerable, duration: strength.vulnerableTurns, tags: ['debuff'] };
        }
        if (effectKind === 'bleed_growth') {
            return { targetMode: 'enemy', value: 1, duration: 0, tags: ['debuff', 'stacking', 'bleed-growth'] };
        }
        if (effectKind === 'rupture_stack') {
            return { targetMode: 'enemy', value: strength.rupture, duration: 0, tags: ['debuff', 'stacking', 'rupture'] };
        }
        if (effectKind === 'focus_chain') {
            return { targetMode: 'self', value: strength.focusChain, duration: 0, tags: ['damage-up', 'stacking', 'battle-persistent'] };
        }
        return { targetMode: 'self', value: strength.shield, duration: strength.buffTurns, tags: ['defense'] };
    }
    const area = effectScope === 'area';
    return { targetMode: 'enemy', value: randomInt(...strength.attack), duration: 0, tags: area ? ['damage', 'area'] : ['damage'] };
}

function fallbackDescription(card) {
    if (card.category === 'heal') return card.effectKind === 'armor'
        ? `获得${card.value}护甲`
        : `回复${card.value}生命`;
    if (card.category === 'control') {
        if (card.effectKind === 'freeze') return `冻结${card.duration}回合`;
        if (card.effectKind === 'silence') return `沉默${card.duration}回合`;
        return `易伤${Math.round(card.value * 100)}%`;
    }
    if (card.category === 'summon') return card.tags?.includes('area')
        ? `火种群体${Math.max(1, Math.floor(card.value * 0.7))}`
        : `火种打击${card.value}`;
    if (card.category === 'buff') {
        if (card.effectKind === 'focus') return `伤害+${Math.round(card.value * 100)}%`;
        if (card.effectKind === 'weaken') return `敌伤-${Math.round(card.value * 100)}%`;
        if (card.effectKind === 'vulnerable') return `易伤${Math.round(card.value * 100)}%`;
        if (card.effectKind === 'bleed_growth') return '血燃增幅';
        if (card.effectKind === 'rupture_stack') return `裂解+${Math.round(card.value * 100)}%`;
        if (card.effectKind === 'focus_chain') return `连击+${Math.round(card.value * 100)}%`;
        return `减伤${Math.round(card.value * 100)}%`;
    }
    return card.tags?.includes('area')
        ? `群体${Math.max(1, Math.floor(card.value * 0.7))}伤害`
        : `造成${card.value}伤害`;
}

function normalizeDescriptionForScope(card, description) {
    const text = String(description || '').trim();
    if (!text) return fallbackDescription(card);
    if (!['attack', 'summon'].includes(card.category)) return text;
    const area = card.tags?.includes('area');
    const hasAreaWord = /群体|全体|范围|多目标|所有敌|敌群|扫射|波及|扩散|溅射|aoe/i.test(text);
    const hasSingleWord = /单体|单个|目标|精准|点射|直击|一名|一个敌|锁定/i.test(text);
    if (area && !hasAreaWord) return fallbackDescription(card);
    if (!area && (hasAreaWord || !hasSingleWord)) return fallbackDescription(card);
    return text;
}

function pickEffect(category) {
    const pool = EFFECTS[category] || EFFECTS.attack;
    return pool[Math.floor(Math.random() * pool.length)];
}

function pickRarity() {
    const total = RARITIES.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const rarity of RARITIES) {
        roll -= rarity.weight;
        if (roll <= 0) return rarity.id;
    }
    return 'blue';
}

async function requestCardSuggestions({ slots, styleText, reason }) {
    const settings = getSettings();
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    if (!settings.apiKey) throw new Error('未配置 API Key。');
    if (!baseUrl) throw new Error('未配置 Base URL。');
    if (!settings.model) throw new Error('未配置模型名。');

    const characterPrompt = await loadCharacterPrompt();
    const ragContext = await loadCardKnowledgeContext(styleText);
    const requestBody = {
        model: settings.model,
        temperature: 0.88,
        stream: true,
        messages: [
            { role: 'system', content: characterPrompt },
            {
                role: 'system',
                content: [
                    '你正在为一个纯静态网页 2D 横板战斗小游戏生成卡牌命名。',
                    '只能输出 JSON，禁止 Markdown，禁止代码，禁止外部 URL。',
                    '必须优先参考知识库中的芙提雅个人经历、火种、普罗米修斯神格、世界树、海姆达尔部队、缄默装甲、绝望的温度、研究员经历和她对技术代价的态度。',
                    '卡牌 name 与 description 要体现这些经历或主题，不要写成和芙提雅无关的通用冰雪技能。description 中不要包含具体的数值或规则说明，要写成与芙提雅相关的战术描述。',
                    '玩家输入的战斗风格是自由文本，只用于引导 flex 槽位的类别倾向和命名气质，不要套用固定模板，也不要把玩家要求改写成规则数值。',
                    '必须先理解 battleStyle 对牌型类别的真实要求，再决定 flex 槽位 category；如果玩家明确要求某类牌更多或全给某类牌，flex 槽位要优先满足该类别。',
                    '不要只把玩家要求写进 name/description 里。例如玩家要求“都给我召唤牌”，flex 槽位应优先输出 summon，而不是输出 attack 但描述成召唤。',
                    'lockedCategory 不可改变；flex 槽位可在 attack/heal/control/summon/buff 中自由选择，类别选择权来自你对 battleStyle 的理解。',
                    '每个槽位会提供 rarity：blue 文案正常克制，purple 文案要显得更强大，gold 文案要显得无与伦比地强大；三种等级都必须继续参考芙提雅知识库经历，不要写成空泛强度形容。',
                    '每个槽位会提供 effectScope：single 的语义描述必须写成与“单体/单目标/精准打击”效果相关；area 的语义描述必须写成与“群体/范围/多目标”效果相关。description 不得和 effectScope 矛盾。',
                    '召唤牌存在本地隐藏流血机制，但 name/description 不要直接写“流血”“持续伤害”“出血”等说明；这部分只由本地数值 UI 表达。',
                    '强化牌可能被本地实现为血燃、裂解、连锁专注等叠层策略；参考知识库中的芙提雅相关知识和主题，根据对应的策略进行命名。',
                    '必须输出完整 JSON object：{"cards":[...]}；不要直接输出数组，不要省略任何槽位。',
                    '不得输出数值、概率、规则覆盖或可执行脚本。'
                ].join('\n')
            },
            ...(ragContext ? [{
                role: 'system',
                content: ragContext
            }] : []),
            {
                role: 'user',
                content: JSON.stringify({
                    reason,
                    battleStyle: String(styleText || '').slice(0, 240),
                    categoryMeaning: {
                        attack: '直接伤害牌',
                        heal: '恢复芙提雅生命或增加护甲的防护牌',
                        control: '冻结、沉默、易伤等控制牌',
                        summon: '召唤/火种协同/群体攻击牌',
                        buff: '强化芙提雅或给敌方施加削弱、易伤、血燃、裂解、连锁专注等状态牌'
                    },
                    categoryPolicy: [
                        '前 7 个 lockedCategory 槽位必须保持：4 张 attack、3 张 heal。',
                        '其余 lockedCategory 为 null 的 flex 槽位必须优先服从 battleStyle 的牌型意图。',
                        '如果 battleStyle 明确要求“全/都/只要/尽量/多给”某类牌，所有或绝大多数 flex 槽位都应选择该类 category。',
                        '先确定每个 flex 槽位的 category，再根据知识库为该 category 写芙提雅相关 name/description。'
                    ],
                    outputShape: {
                        cards: [{ slotId: 'slot id', category: 'attack|heal|control|summon|buff', name: '2到4个汉字', description: '20字以内风味描述' }]
                    },
                    slots: slots.map(slot => ({
                        slotId: slot.slotId,
                        rarity: slot.rarity,
                        effectScope: slot.effectScope,
                        lockedCategory: slot.lockedCategory,
                        allowedCategories: slot.allowedCategories
                    }))
                })
            }
        ]
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`卡牌 LLM 请求失败 (${response.status}): ${bodyText.slice(0, 160)}`);
    }

    const text = await readCompletionText(response);
    const json = extractJsonValue(text, { rawText: text });
    const cards = extractCardsFromPayload(json);
    if (!cards.length) {
        console.error('[SideScrollerCards] LLM returned JSON without cards array.', { rawText: text.slice(0, 800), json });
        throw new Error('LLM 没有返回可用的 cards 数组。');
    }

    const normalized = [];
    const slotById = new Map(slots.map(slot => [slot.slotId, slot]));
    const rejected = [];
    for (const item of cards) {
        const slotId = String(item?.slotId || '');
        const slot = slotById.get(slotId);
        if (!slot) {
            rejected.push({ slotId, reason: 'unknown slotId' });
            continue;
        }
        const category = normalizeCategory(item?.category, '');
        if (!category) {
            rejected.push({ slotId, reason: 'invalid category', category: item?.category });
            continue;
        }
        if (slot.lockedCategory && category !== slot.lockedCategory) {
            rejected.push({ slotId, reason: 'locked category changed', category, lockedCategory: slot.lockedCategory });
            continue;
        }
        normalized.push({
            slotId,
            category,
            name: item?.name,
            description: item?.description
        });
    }
    if (rejected.length) {
        console.warn('[SideScrollerCards] Some LLM card suggestions were rejected.', { rejected, rawText: text.slice(0, 800) });
    }
    if (!normalized.length) throw new Error('LLM 返回的卡牌建议全部未通过校验。');
    return normalized;
}

function shuffleCards(cards) {
    const result = cards.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

async function loadCardKnowledgeContext(styleText = '') {
    try {
        await ensurePreloadedKnowledgeBases();
        const query = [
            '芙提雅 伊格妮丝 个人经历 火种 普罗米修斯神格 世界树公司 海姆达尔部队 缄默装甲 绝望的温度 技术代价 研究员',
            String(styleText || '').slice(0, 160)
        ].filter(Boolean).join('\n');
        const ragMessage = await buildRagReferenceMessage({
            mode: 'daily',
            query,
            limit: 5
        });
        if (!ragMessage?.content) {
            console.warn('[SideScrollerCards] No knowledge-base context found for card generation.');
            return '';
        }
        return [
            ragMessage.content,
            '请把以上知识库内容转化为卡牌技能名和技能效果文案的主题来源；只影响 name/description，不改变本地战斗规则。'
        ].join('\n');
    } catch (err) {
        console.warn('[SideScrollerCards] Knowledge-base lookup failed for card generation:', err);
        return '';
    }
}

async function loadCharacterPrompt() {
    if (cachedCharacterPrompt != null) return cachedCharacterPrompt;
    try {
        const response = await fetch(SYSTEM_PROMPT_URL, { cache: 'force-cache' });
        cachedCharacterPrompt = response.ok ? await response.text() : '你是芙提雅，负责以轻快聪明的语气协助生成战斗卡牌文本。';
    } catch {
        cachedCharacterPrompt = '你是芙提雅，负责以轻快聪明的语气协助生成战斗卡牌文本。';
    }
    return cachedCharacterPrompt;
}

async function readCompletionText(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        return extractCompletionText(json).trim() || JSON.stringify(json);
    }
    if (!response.body) throw new Error('API 没有返回可读取内容。');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawText = '';
    let fullText = '';

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
            if (!data || data === '[DONE]' || data === 'event: message') continue;
            try {
                fullText = appendCompletionText(fullText, JSON.parse(data));
            } catch {
                if (!data.startsWith('{') && !data.startsWith('[')) fullText += data;
            }
        }
    }

    const tail = buffer.trim();
    if (tail && tail !== '[DONE]') {
        try {
            const data = tail.startsWith('data:') ? tail.slice(5).trim() : tail;
            fullText = appendCompletionText(fullText, JSON.parse(data));
        } catch {}
    }

    if (fullText.trim()) return fullText.trim();
    const raw = rawText.trim();
    try {
        return extractCompletionText(JSON.parse(raw)).trim() || raw;
    } catch {
        return raw;
    }
}

function appendCompletionText(current, json) {
    const text = extractCompletionText(json);
    if (!text) return current;
    return text.startsWith(current) ? text : current + text;
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

function textFromValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(textFromValue).filter(Boolean).join('');
    if (typeof value !== 'object') return '';
    if (value.text && typeof value.text === 'object') {
        const text = textFromValue(value.text.value);
        if (text) return text;
    }
    for (const key of ['content', 'text', 'output_text', 'response', 'result', 'message', 'delta', 'data']) {
        const text = textFromValue(value[key]);
        if (text) return text;
    }
    if (Array.isArray(value.choices)) return textFromValue(value.choices[0]);
    return '';
}

function extractCardsFromPayload(json) {
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.cards)) return json.cards;
    if (Array.isArray(json?.data?.cards)) return json.data.cards;
    return [];
}

function extractJsonValue(text, options = {}) {
    const normalized = stripCodeFence(text);
    try {
        return JSON.parse(normalized);
    } catch {}

    for (let start = 0; start < normalized.length; start += 1) {
        const char = normalized[start];
        if (char !== '{' && char !== '[') continue;
        const end = findJsonEnd(normalized, start);
        if (end >= start) {
            try {
                return JSON.parse(normalized.slice(start, end + 1));
            } catch {}
        }
    }
    console.error('[SideScrollerCards] Failed to extract JSON from LLM response.', {
        rawText: String(options.rawText || text || '').slice(0, 1200)
    });
    throw new Error('卡牌 LLM 没有返回合法 JSON。');
}

function stripCodeFence(text) {
    return String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function findJsonEnd(text, start) {
    const first = text[start];
    if (first !== '{' && first !== '[') return -1;
    const stack = [];
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') inString = true;
        else if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
            if (stack[stack.length - 1] !== char) return -1;
            stack.pop();
            if (stack.length === 0) return i;
        }
    }
    return -1;
}

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function normalizeCategory(value, fallback) {
    const category = String(value || '').trim().toLowerCase();
    return FLEX_CATEGORIES.includes(category) ? category : fallback;
}

function normalizeRarity(value) {
    const rarity = String(value || '').trim().toLowerCase();
    return rarity === 'purple' || rarity === 'gold' ? rarity : 'blue';
}

function sanitizeCardName(value, fallback) {
    const text = String(value || '').replace(/[<>{}[\]`"'\\]/g, '').trim();
    const chars = Array.from(text).filter(char => !/\s/.test(char));
    if (chars.length < 2) return fallback;
    return chars.slice(0, 4).join('');
}

function sanitizeDescription(value, fallback) {
    const text = String(value || '').replace(/[<>{}[\]`\\]/g, '').replace(/\s+/g, '').trim();
    if (!text) return fallback;
    return Array.from(text).slice(0, 20).join('');
}

function randomInt(min, max) {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return low + Math.floor(Math.random() * (high - low + 1));
}
