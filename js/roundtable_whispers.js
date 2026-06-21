import { getSettings } from './settings.js';
import { getGameTimeContext, recordDialogueInteraction } from './game_state.js';
import { buildRagReferenceMessage } from './knowledge_base.js';

const STORAGE_KEY = 'fritia_roundtable_whispers';
const MESSAGE_TTL_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_STORED_MESSAGES = 240;
const MAX_SELECTED_PARTICIPANTS = 6;
const QUEUE_LIMIT = 8;
const HARD_COOLDOWN_MS = 4000;
const IDLE_COOLDOWN_MS = 45000;
const CALL_WINDOW_MS = 3 * 60 * 1000;
const TOTAL_CALL_LIMIT_10M = 20;
const SOFT_CALL_LIMIT_10M = 15;
const IDLE_CALL_LIMIT_10M = 3;
const TOKEN_SOFT_LIMIT_10M = 80000;
const TOKEN_HARD_LIMIT_10M = 100000;
const DEFAULT_INTER_BOT_TURN_LIMIT = 3;
const MIN_INTER_BOT_TURN_LIMIT = 1;
const MAX_INTER_BOT_TURN_LIMIT = 6;
const FOLLOW_UP_RATE = 0.55;
const IDLE_CHECK_INTERVAL_MS = 3500;
const MIN_HANDOFF_CHAIN_RATIO = 0.6;

const PLAYER_ID = 'player';
const ALL_ID = 'all';
const HANDOFF_INTENT = 'handoff_to_player';
const ALLOWED_INTENTS = new Set(['answer', 'react', 'tease', 'ask', 'shift_topic', 'idle', HANDOFF_INTENT]);
const ALLOWED_EMOTIONS = new Set(['neutral', 'happy', 'shy', 'jealous', 'teasing', 'serious']);
const LOW_PRIORITY_TYPES = new Set(['followup', 'idle']);

const BUILTIN_DEFS = Object.freeze([
    {
        id: 'fritia',
        name: '芙提雅',
        type: 'builtin',
        promptPath: 'src/_queries/system_prompt.txt',
        avatarSrc: 'src/_logos/Profile_Fritia.png',
        accent: '#e58aa6',
        tags: ['芙提雅', '甜点', '咖啡', '约会', '房间', '礼物', '陪伴', '撒娇']
    },
    {
        id: 'cherno',
        name: '琴诺',
        type: 'builtin',
        promptPath: 'src/_char_card/Cherno/char_cherno_prompt.txt',
        avatarSrc: 'src/_logos/Profile_Cherno.png',
        accent: '#b89bd6',
        tags: ['琴诺', '调酒', '害羞', '酒吧', '甜酒', '侍奉', '紧张']
    },
    {
        id: 'fenny',
        name: '芬妮',
        type: 'builtin',
        promptPath: 'src/_char_card/fenny/char_fenny_prompt.txt',
        avatarSrc: 'src/_logos/Profile_Fenny.png',
        accent: '#f0bd66',
        tags: ['芬妮', '舞台', '活力', '约会', '热闹', '甜蜜', '胜负']
    }
]);

const FALLBACK_PROMPTS = Object.freeze({
    fritia: '你是芙提雅，分析员亲密可靠的恋人，语气温柔活泼，会自然照顾分析员的感受。',
    cherno: '你是琴诺，分析员亲密的恋人之一，害羞温柔，偶尔会小声调侃和认真照顾分析员。',
    fenny: '你是芬妮，分析员亲密的恋人之一，明亮自信，喜欢把热闹话题抛给分析员。'
});

const SAFE_FALLBACKS = Object.freeze({
    answer: [
        '分析员，这个话题我想先听听你的选择。',
        '嗯，我会站在分析员这边，不过也想听你的想法。',
        '要不要让分析员来决定？这样我们都更安心。'
    ],
    followup: [
        '说着说着就热闹起来了，分析员也来评一句吧。',
        '我补一句就好，最后还是想听分析员怎么选。',
        '这个提议不错，不过第一份当然要留给分析员。'
    ],
    idle: [
        '分析员安静下来的时候，我会忍不住想靠近一点。',
        '酒吧灯光正好，分析员要不要选个新话题？',
        '大家都在等分析员开口呢，我也想听你的声音。'
    ],
    handoff: [
        '再让我们自己聊下去就太热闹了，分析员想听哪边？',
        '这个问题交给分析员吧，你一句话我们就有方向了。',
        '分析员来定吧，是继续这个话题，还是换个更亲密的？'
    ],
    error: [
        '刚才那句有点乱，我重新靠近分析员一点再说。',
        '我先把话收回来，还是让分析员来稳住圆桌吧。',
        '圆桌稍微慢半拍，但我还在认真听分析员说话。'
    ]
});

const HOSTILE_PATTERNS = [
    /离.*分析员.*远点/,
    /离.*他.*远点/,
    /讨厌(她|你|他|它)/,
    /只能属于我/,
    /只属于我一个/,
    /配不上/,
    /抛弃(她|她们|其他|别人)/,
    /滚开/,
    /不许.*接近/,
    /抢走.*分析员/,
    /你不配/
];

const els = {};
const state = {
    initialized: false,
    controlsModule: null,
    isBarActive: () => false,
    getGuestParticipants: () => [],
    getGameTimeInfo: () => null,
    participants: [],
    promptCache: new Map(),
    selectedIds: new Set(['fritia', 'cherno', 'fenny']),
    activeParticipantIds: ['fritia', 'cherno', 'fenny'],
    messages: [],
    topicSummary: '',
    fullMessages: [],
    fullTopicSummary: '',
    sessionMode: 'full',
    freshSessionDirty: false,
    options: {
        autoBotChat: true,
        idleTalk: false,
        botAtMentionTriggersReply: false,
        botChainLimit: DEFAULT_INTER_BOT_TURN_LIMIT
    },
    step: 'setup',
    queue: [],
    processing: false,
    abortController: null,
    requestToken: 0,
    activeSpeakerId: '',
    lastRequestEndedAt: 0,
    cooldownUntil: 0,
    processTimer: 0,
    lastIdleCheckAt: 0,
    lastIdleEnqueuedAt: 0,
    lastPlayerMessageAt: 0,
    lastAnyMessageAt: 0,
    callHistory: [],
    interBotDebt: 0,
    playerFloorLock: false,
    participantStats: new Map(),
    messageSeq: 0,
    lastSystemNoticeKey: '',
    lastClockText: '',
    memberPickerOpen: false,
    removeMode: false,
    mentionPickerOpen: false,
    rosterExpanded: false
};

function nowMs() {
    return Date.now();
}

function clampText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function estimateTokens(text) {
    let tokens = 0;
    const source = String(text || '');
    for (let i = 0; i < source.length; i += 1) {
        const code = source.charCodeAt(i);
        tokens += code >= 0x4e00 && code <= 0x9fff ? 2 : 1;
    }
    return tokens;
}

function randomItem(list) {
    return list[Math.floor(Math.random() * list.length)] || list[0] || '';
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
}

function pad2(value) {
    return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, '0');
}

function normalizeOptions(options = {}) {
    return {
        autoBotChat: options.autoBotChat !== false,
        idleTalk: options.idleTalk === true,
        botAtMentionTriggersReply: options.botAtMentionTriggersReply === true,
        botChainLimit: clampNumber(
            options.botChainLimit,
            MIN_INTER_BOT_TURN_LIMIT,
            MAX_INTER_BOT_TURN_LIMIT,
            DEFAULT_INTER_BOT_TURN_LIMIT
        )
    };
}

function getBotChainLimit() {
    state.options = normalizeOptions(state.options);
    return state.options.botChainLimit;
}

function getEarliestModelHandoffDebt() {
    const limit = getBotChainLimit();
    return Math.max(1, Math.min(limit, Math.ceil(limit * MIN_HANDOFF_CHAIN_RATIO)));
}

function shouldDelayModelHandoff(event, speaker, text = '') {
    if (isForcedHandoffEvent(event, speaker)) return false;
    const startsMentionChain = hasBotMentionTrigger(text, speaker);
    return (isInterBotChainEvent(event, speaker) || startsMentionChain)
        && state.interBotDebt + 1 < getEarliestModelHandoffDebt();
}

function isForcedHandoffEvent(event, speaker = null) {
    if (!event) return false;
    if (event.type === 'handoff' || event.forceHandoff === true) return true;
    return isInterBotChainEvent(event, speaker) && state.interBotDebt >= getBotChainLimit() - 1;
}

function isLowPriorityEvent(event) {
    return LOW_PRIORITY_TYPES.has(event?.type) && !isForcedHandoffEvent(event);
}

function isInterBotChainEvent(event, speaker = null) {
    if (event?.type !== 'followup') return false;
    if (event.interBotChain === true || event.mentionFollowUp === true) return true;
    if (!event.previousSpeakerId || event.previousSpeakerId === PLAYER_ID) return false;
    return !speaker?.id || event.previousSpeakerId !== speaker.id;
}

function isInterBotFollowUp(event, speaker) {
    return isInterBotChainEvent(event, speaker);
}

function getBotMentionCandidates(text, speaker) {
    if (!speaker) return [];
    const mentionSource = state.options.botAtMentionTriggersReply
        ? text
        : removeLeadingAtToken(text);
    return collectMentionedParticipants(mentionSource, {
        speakerId: speaker.id,
        includeKeywords: true,
        allowAllMentions: false,
        allowAllKeywords: false,
        excludeSelf: true
    });
}

function hasBotMentionTrigger(text, speaker) {
    return getBotMentionCandidates(text, speaker).length > 0;
}

function debugRoundtable(message, details = {}) {
    console.debug('[Roundtable]', message, details);
}

function logRoundtableBlock(reason, details = {}) {
    console.warn('[Roundtable][blocked]', reason, details);
}

function enterPlayerFloorLock(reason, details = {}) {
    const beforeQueueLength = state.queue.length;
    state.playerFloorLock = true;
    stopFloorLockEvents();
    const clearedEvents = beforeQueueLength - state.queue.length;
    console.info('[Roundtable][floor-lock]', {
        reason,
        interBotDebt: state.interBotDebt,
        botChainLimit: getBotChainLimit(),
        clearedEvents,
        ...details
    });
}

function stopFloorLockEvents() {
    state.queue = state.queue.filter(event => {
        if (event.type === 'handoff') return false;
        if (event.mentionBatch) return false;
        return !isLowPriorityEvent(event);
    });
}

function describeEvent(event) {
    if (!event) return null;
    return {
        id: event.id || '',
        type: event.type || '',
        priority: event.priority || 0,
        textLength: String(event.text || event.sourceText || '').length,
        forcedSpeakerId: event.forcedSpeakerId || '',
        suggestedSpeakerId: event.suggestedSpeakerId || '',
        previousSpeakerId: event.previousSpeakerId || '',
        replyTargetId: event.replyTargetId || '',
        mentionBatch: Boolean(event.mentionBatch),
        mentionFollowUp: Boolean(event.mentionFollowUp),
        interBotChain: Boolean(event.interBotChain)
    };
}

function createMessageId(prefix = 'rt') {
    state.messageSeq += 1;
    return `${prefix}_${Date.now().toString(36)}_${state.messageSeq.toString(36)}`;
}

function participantColor(id) {
    return getParticipantById(id)?.accent || '#e58aa6';
}

function getParticipantById(id) {
    return state.participants.find(item => item.id === id) || null;
}

function getActiveParticipants() {
    const activeIds = new Set(state.activeParticipantIds);
    const result = state.participants.filter(item => activeIds.has(item.id));
    if (result.length > 0) return result;
    return state.participants.filter(item => state.selectedIds.has(item.id));
}

function normalizeParticipantIdList(ids) {
    const available = new Set(state.participants.map(item => item.id));
    const result = [];
    const seen = new Set();
    for (const rawId of ids || []) {
        const id = String(rawId || '').trim();
        if (!id || seen.has(id) || !available.has(id)) continue;
        seen.add(id);
        result.push(id);
        if (result.length >= MAX_SELECTED_PARTICIPANTS) break;
    }
    return result;
}

function syncSetupSelectionFromActiveRoundtable() {
    const activeIds = normalizeParticipantIdList(state.activeParticipantIds);
    if (activeIds.length === 0) return false;
    state.activeParticipantIds = activeIds;
    state.selectedIds = new Set(activeIds);
    return true;
}

function hasAllMention(text, includePlainKeywords = true, includeExplicit = true) {
    const source = String(text || '');
    if (includeExplicit && /[@＠]\s*(全体|所有人|大家|各位|圆桌)|\b(all|everyone)\b/i.test(source)) return true;
    return includePlainKeywords && /(大家|各位|所有人|全员|全体成员|圆桌成员|你们都|一起回答|都说说|每个人)/.test(source);
}

function collectMentionedParticipants(text, options = {}) {
    const {
        speakerId = '',
        includeKeywords = true,
        allowAllMentions = true,
        allowAllKeywords = true,
        excludeSelf = true
    } = options;
    const source = String(text || '');
    const participants = getActiveParticipants();
    if (!source || participants.length === 0) return [];
    if (hasAllMention(source, allowAllKeywords, allowAllMentions)) {
        return participants.filter(item => !(excludeSelf && item.id === speakerId));
    }

    const mentioned = [];
    const seen = new Set();
    for (const participant of participants) {
        if (excludeSelf && participant.id === speakerId) continue;
        const explicit = isAtMentioned(source, participant.name);
        const keyword = includeKeywords && isNameMentioned(source, participant.name);
        if (!explicit && !keyword) continue;
        if (seen.has(participant.id)) continue;
        seen.add(participant.id);
        mentioned.push(participant);
    }
    return mentioned;
}

function resolveEventTarget(event, speaker, payload = null) {
    const participants = getActiveParticipants();
    const byId = id => participants.find(item => item.id === id) || null;
    if (event.type === 'handoff' || payload?.intent === HANDOFF_INTENT) {
        return { id: PLAYER_ID, name: '分析员' };
    }
    if (event.replyTargetId) {
        if (event.replyTargetId === PLAYER_ID) return { id: PLAYER_ID, name: '分析员' };
        const target = byId(event.replyTargetId);
        if (target) return { id: target.id, name: target.name };
    }
    if (event.type === 'player' || event.type === 'idle') return { id: PLAYER_ID, name: '分析员' };
    if (event.previousSpeakerId) {
        if (event.previousSpeakerId === PLAYER_ID) return { id: PLAYER_ID, name: '分析员' };
        const target = byId(event.previousSpeakerId);
        if (target) return { id: target.id, name: target.name };
    }
    if (payload?.targetId && payload.targetId !== ALL_ID && payload.targetId !== speaker?.id) {
        if (payload.targetId === PLAYER_ID) return { id: PLAYER_ID, name: '分析员' };
        const target = byId(payload.targetId);
        if (target) return { id: target.id, name: target.name };
    }
    return { id: PLAYER_ID, name: '分析员' };
}

function ensureTargetPrefix(text, target) {
    const source = String(text || '').trim();
    const targetName = target?.name || '分析员';
    if (!source) return source;
    const expected = `@${targetName}`;
    if (source.startsWith(expected)) return source;
    return `${expected} ${stripLeadingTargetPrefix(source)}`.trim();
}

function stripLeadingTargetPrefix(text) {
    return String(text || '').trim().replace(/^[@＠]\s*[^\s，。！？、：:；;]+[\s，。！？、：:；;]*/, '').trim();
}

function removeLeadingAtToken(text) {
    return String(text || '').trim().replace(/^[@＠]\s*[^\s，。！？、：:；;]+/, '').trimStart();
}

function pruneMessages(messages = state.messages) {
    const cutoff = nowMs() - MESSAGE_TTL_MS;
    return messages
        .filter(item => Number(item.ts) >= cutoff)
        .slice(-MAX_STORED_MESSAGES);
}

function mergeMessages(base = [], incoming = []) {
    const merged = new Map();
    for (const raw of [...base, ...incoming]) {
        const message = normalizeStoredMessage(raw);
        if (message) merged.set(message.id, message);
    }
    return pruneMessages([...merged.values()].sort((a, b) => a.ts - b.ts));
}

function summarizeMessages(messages = []) {
    const lines = messages
        .filter(item => item && item.role !== 'system')
        .slice(-16)
        .map(item => `${item.speakerName}：${item.text}`);
    return lines.join(' / ').slice(-300);
}

function persistCurrentSessionToFull() {
    if (state.sessionMode !== 'fresh' || !state.freshSessionDirty) return;
    const before = state.fullMessages.length;
    state.fullMessages = mergeMessages(state.fullMessages, state.messages);
    state.fullTopicSummary = summarizeMessages(state.fullMessages);
    state.freshSessionDirty = false;
    debugRoundtable('fresh session migrated to full context', {
        before,
        after: state.fullMessages.length
    });
}

function activateFullContext() {
    persistCurrentSessionToFull();
    state.sessionMode = 'full';
    state.messages = pruneMessages(state.fullMessages);
    state.topicSummary = state.fullTopicSummary || summarizeMessages(state.messages);
    state.freshSessionDirty = false;
}

function activateFreshSession() {
    persistCurrentSessionToFull();
    state.sessionMode = 'fresh';
    state.messages = [];
    state.topicSummary = '';
    state.freshSessionDirty = false;
}

function loadStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return;
        if (data.options && typeof data.options === 'object') {
            state.options = normalizeOptions(data.options);
        }
        if (Array.isArray(data.selectedIds)) {
            state.selectedIds = new Set(data.selectedIds.map(id => String(id || '').trim()).filter(Boolean));
        }
        if (Array.isArray(data.activeParticipantIds)) {
            state.activeParticipantIds = data.activeParticipantIds.map(id => String(id || '').trim()).filter(Boolean);
        }
        const storedMessages = Array.isArray(data.fullMessages) ? data.fullMessages : data.messages;
        if (Array.isArray(storedMessages)) {
            state.fullMessages = pruneMessages(storedMessages.map(normalizeStoredMessage).filter(Boolean));
        }
        state.fullTopicSummary = clampText(data.fullTopicSummary || data.topicSummary, 300) || summarizeMessages(state.fullMessages);
        activateFullContext();
    } catch (err) {
        console.warn('[Roundtable] storage load failed:', err);
    }
}

function saveStorage() {
    try {
        if (state.sessionMode !== 'fresh') {
            state.fullMessages = pruneMessages(state.messages);
            state.fullTopicSummary = state.topicSummary || summarizeMessages(state.fullMessages);
        }
        state.fullMessages = pruneMessages(state.fullMessages);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            version: 2,
            updatedAt: nowMs(),
            options: { ...state.options },
            selectedIds: [...state.selectedIds],
            activeParticipantIds: [...state.activeParticipantIds],
            topicSummary: state.fullTopicSummary,
            fullTopicSummary: state.fullTopicSummary,
            messages: state.fullMessages,
            fullMessages: state.fullMessages
        }));
    } catch (err) {
        console.warn('[Roundtable] storage save failed:', err);
    }
}

function normalizeStoredMessage(item) {
    if (!item || typeof item !== 'object') return null;
    const role = ['player', 'bot', 'system'].includes(item.role) ? item.role : 'system';
    const text = clampText(item.text || item.content, 400);
    if (!text) return null;
    return {
        id: String(item.id || createMessageId('imported')),
        role,
        speakerId: String(item.speakerId || (role === 'player' ? PLAYER_ID : 'system')),
        speakerName: clampText(item.speakerName || (role === 'player' ? '分析员' : '圆桌'), 24),
        text,
        targetId: String(item.targetId || ALL_ID),
        intent: ALLOWED_INTENTS.has(item.intent) ? item.intent : 'react',
        emotion: ALLOWED_EMOTIONS.has(item.emotion) ? item.emotion : 'neutral',
        ts: Number(item.ts) || nowMs(),
        fallback: Boolean(item.fallback)
    };
}

async function loadPrompt(path, fallback) {
    if (!path) return fallback;
    if (state.promptCache.has(path)) return state.promptCache.get(path);
    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const prompt = text.trim() || fallback;
        state.promptCache.set(path, prompt);
        return prompt;
    } catch (err) {
        console.warn('[Roundtable] prompt load failed:', path, err);
        state.promptCache.set(path, fallback);
        return fallback;
    }
}

async function refreshParticipants() {
    const builtins = [];
    for (const def of BUILTIN_DEFS) {
        builtins.push({
            ...def,
            prompt: await loadPrompt(def.promptPath, FALLBACK_PROMPTS[def.id] || `你正在扮演 ${def.name}。`)
        });
    }

    const builtinGuestIds = new Set(['special:cherno', 'builtin:fenny', 'cherno', 'fenny']);
    const guestParticipants = [];
    try {
        const guests = state.getGuestParticipants?.() || [];
        for (const guest of guests) {
            const id = String(guest.id || '').trim();
            const name = clampText(guest.name, 24);
            if (!id || !name || builtinGuestIds.has(id)) continue;
            if (guest.isBuiltin && id !== 'builtin:fenny') continue;
            guestParticipants.push({
                id,
                name,
                type: 'custom_guest',
                prompt: clampText(guest.prompt, 8000) || `你正在扮演 ${name}。`,
                avatarText: clampText(guest.avatarText || name.slice(0, 1), 2),
                accent: colorFromString(id),
                tags: [name]
            });
        }
    } catch (err) {
        console.warn('[Roundtable] guest participant refresh failed:', err);
    }

    state.participants = [...builtins, ...guestParticipants].slice(0, 12);
    if (state.selectedIds.size === 0) {
        state.selectedIds = new Set(builtins.map(item => item.id));
    }
    state.selectedIds = new Set(normalizeParticipantIdList([...state.selectedIds]));
    if (state.selectedIds.size === 0) {
        state.selectedIds = new Set(builtins.map(item => item.id));
    }
    state.activeParticipantIds = normalizeParticipantIdList(state.activeParticipantIds);
    if (state.activeParticipantIds.length === 0) {
        state.activeParticipantIds = [...state.selectedIds];
    }
}

function colorFromString(value) {
    const palette = ['#e58aa6', '#b89bd6', '#f0bd66', '#7fc9b2', '#e79072', '#86a8e7'];
    let hash = 0;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
}

function createParticipantAvatar(participant, className = 'roundtable-avatar') {
    const avatar = document.createElement('span');
    avatar.className = className;
    avatar.style.setProperty('--speaker-accent', participant?.accent || '#e58aa6');
    if (participant?.avatarSrc) {
        const img = document.createElement('img');
        img.src = participant.avatarSrc;
        img.alt = '';
        avatar.appendChild(img);
    } else {
        avatar.textContent = participant?.avatarText || participant?.name?.slice(0, 1) || '?';
    }
    return avatar;
}

function insertMention(participant) {
    if (!els.input || !participant) return;
    const mention = `@${participant.name} `;
    const value = els.input.value || '';
    const start = els.input.selectionStart ?? value.length;
    const end = els.input.selectionEnd ?? start;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const atMatch = before.match(/[@＠][^\s@＠，。！？、：:；;]*$/);
    const replaceStart = atMatch ? start - atMatch[0].length : start;
    const needsSpace = replaceStart > 0 && !/\s$/.test(value.slice(0, replaceStart)) ? ' ' : '';
    els.input.value = `${value.slice(0, replaceStart)}${needsSpace}${mention}${after}`;
    const cursor = replaceStart + needsSpace.length + mention.length;
    els.input.focus();
    els.input.setSelectionRange(cursor, cursor);
    hideMentionPicker();
}

function cacheElements() {
    els.panel = document.getElementById('roundtable-whispers-panel');
    els.close = document.getElementById('roundtable-whispers-close');
    els.setupStep = document.getElementById('roundtable-step-setup');
    els.chatStep = document.getElementById('roundtable-step-chat');
    els.participantList = document.getElementById('roundtable-participant-list');
    els.selectedCount = document.getElementById('roundtable-selected-count');
    els.autoTalk = document.getElementById('roundtable-auto-talk');
    els.idleTalk = document.getElementById('roundtable-idle-talk');
    els.botAtTalk = document.getElementById('roundtable-bot-at-talk');
    els.chainLimit = document.getElementById('roundtable-chain-limit');
    els.chainLimitValue = document.getElementById('roundtable-chain-limit-value');
    els.start = document.getElementById('roundtable-start');
    els.continue = document.getElementById('roundtable-continue');
    els.back = document.getElementById('roundtable-back');
    els.addMember = document.getElementById('roundtable-add-member');
    els.removeMember = document.getElementById('roundtable-remove-member');
    els.memberPicker = document.getElementById('roundtable-member-picker');
    els.mentionPicker = document.getElementById('roundtable-mention-picker');
    els.status = document.getElementById('roundtable-status');
    els.chatStatus = document.getElementById('roundtable-chat-status');
    els.gameTime = document.getElementById('roundtable-game-time');
    els.roster = document.querySelector('.roundtable-roster');
    els.participantStrip = document.getElementById('roundtable-participant-strip');
    els.messageList = document.getElementById('roundtable-message-list');
    els.input = document.getElementById('roundtable-input');
    els.send = document.getElementById('roundtable-send');
    els.debt = document.getElementById('roundtable-debt');
    els.queue = document.getElementById('roundtable-queue');
}

function bindEvents() {
    els.close?.addEventListener('click', () => closeRoundtableWhispers());
    els.start?.addEventListener('click', () => startChat('fresh'));
    els.continue?.addEventListener('click', () => startChat('full'));
    els.back?.addEventListener('click', () => {
        persistCurrentSessionToFull();
        syncSetupSelectionFromActiveRoundtable();
        state.step = 'setup';
        state.rosterExpanded = false;
        state.memberPickerOpen = false;
        state.removeMode = false;
        stopAllRequests('setup');
        saveStorage();
        renderAll();
    });
    els.addMember?.addEventListener('click', toggleMemberPicker);
    els.removeMember?.addEventListener('click', toggleRemoveMode);
    els.roster?.addEventListener('click', handleRosterClick);
    els.autoTalk?.addEventListener('change', () => {
        state.options.autoBotChat = Boolean(els.autoTalk.checked);
        saveStorage();
        renderStatus();
    });
    els.idleTalk?.addEventListener('change', () => {
        state.options.idleTalk = Boolean(els.idleTalk.checked);
        state.options = normalizeOptions(state.options);
        saveStorage();
        renderStatus();
    });
    els.botAtTalk?.addEventListener('change', () => {
        state.options.botAtMentionTriggersReply = Boolean(els.botAtTalk.checked);
        state.options = normalizeOptions(state.options);
        saveStorage();
        renderStatus();
    });
    els.chainLimit?.addEventListener('input', () => {
        state.options.botChainLimit = clampNumber(
            els.chainLimit.value,
            MIN_INTER_BOT_TURN_LIMIT,
            MAX_INTER_BOT_TURN_LIMIT,
            DEFAULT_INTER_BOT_TURN_LIMIT
        );
        state.options = normalizeOptions(state.options);
        renderRuleControls();
        saveStorage();
        renderStatus();
    });
    els.send?.addEventListener('click', handlePlayerSend);
    els.input?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        event.preventDefault();
        handlePlayerSend();
    });
    els.input?.addEventListener('input', handleMentionInput);
    els.input?.addEventListener('keyup', handleMentionInput);
    els.input?.addEventListener('focus', collapseRoster);
    els.input?.addEventListener('click', collapseRoster);
    document.addEventListener('click', handleRoundtableDocumentClick);
}

function renderAll() {
    if (!els.panel) return;
    const inSetup = state.step !== 'chat';
    els.setupStep?.classList.toggle('hidden', !inSetup);
    els.chatStep?.classList.toggle('hidden', inSetup);
    els.start?.classList.toggle('hidden', !inSetup);
    els.continue?.classList.toggle('hidden', !inSetup);
    renderRuleControls();
    renderParticipantList();
    renderParticipantStrip();
    renderMemberPicker();
    renderMentionPicker();
    renderMessages();
    renderStatus();
    renderGameTime({ force: true });
}

function renderRuleControls() {
    state.options = normalizeOptions(state.options);
    const limit = getBotChainLimit();
    if (els.autoTalk) els.autoTalk.checked = state.options.autoBotChat;
    if (els.idleTalk) els.idleTalk.checked = state.options.idleTalk;
    if (els.botAtTalk) els.botAtTalk.checked = state.options.botAtMentionTriggersReply;
    if (els.chainLimit) {
        els.chainLimit.min = String(MIN_INTER_BOT_TURN_LIMIT);
        els.chainLimit.max = String(MAX_INTER_BOT_TURN_LIMIT);
        els.chainLimit.value = String(limit);
        els.chainLimit.setAttribute('aria-valuenow', String(limit));
    }
    if (els.chainLimitValue) els.chainLimitValue.textContent = `${limit} 次`;
}

function renderParticipantList() {
    if (!els.participantList) return;
    els.participantList.innerHTML = '';
    const selectedCount = state.selectedIds.size;
    for (const participant of state.participants) {
        const selected = state.selectedIds.has(participant.id);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `roundtable-participant-card${selected ? ' is-selected' : ''}`;
        item.style.setProperty('--speaker-accent', participant.accent || '#e58aa6');
        item.setAttribute('aria-pressed', selected ? 'true' : 'false');

        const avatar = document.createElement('span');
        avatar.className = 'roundtable-avatar';
        avatar.style.setProperty('--speaker-accent', participant.accent || '#e58aa6');
        if (participant.avatarSrc) {
            const img = document.createElement('img');
            img.src = participant.avatarSrc;
            img.alt = '';
            avatar.appendChild(img);
        } else {
            avatar.textContent = participant.avatarText || participant.name.slice(0, 1);
        }

        const body = document.createElement('span');
        body.className = 'roundtable-participant-card__body';
        const name = document.createElement('strong');
        name.textContent = participant.name;
        const meta = document.createElement('small');
        meta.textContent = participant.type === 'custom_guest' ? '暖调闲聚访客' : '固定席位';
        body.append(name, meta);

        const mark = document.createElement('span');
        mark.className = 'roundtable-checkmark';
        mark.textContent = selected ? '已选' : '邀请';

        item.append(avatar, body, mark);
        item.addEventListener('click', () => toggleParticipant(participant.id));
        els.participantList.appendChild(item);
    }
    if (els.selectedCount) {
        els.selectedCount.textContent = `${selectedCount}/${Math.min(MAX_SELECTED_PARTICIPANTS, state.participants.length)}`;
    }
    if (els.start) els.start.disabled = selectedCount <= 0;
}

function toggleParticipant(id) {
    if (state.selectedIds.has(id)) {
        if (state.selectedIds.size <= 1) {
            setSetupStatus('至少保留一位圆桌成员。', 'warn');
            return;
        }
        state.selectedIds.delete(id);
    } else {
        if (state.selectedIds.size >= MAX_SELECTED_PARTICIPANTS) {
            setSetupStatus(`圆桌本轮最多 ${MAX_SELECTED_PARTICIPANTS} 位恋人入席。`, 'warn');
            return;
        }
        state.selectedIds.add(id);
    }
    saveStorage();
    renderParticipantList();
}

function renderParticipantStrip() {
    if (!els.participantStrip) return;
    if (els.roster) {
        els.roster.classList.toggle('is-expanded', state.rosterExpanded);
        els.roster.classList.toggle('is-collapsed', !state.rosterExpanded);
    }
    els.participantStrip.innerHTML = '';
    for (const participant of getActiveParticipants()) {
        const item = document.createElement('div');
        item.className = 'roundtable-strip-member';
        item.style.setProperty('--speaker-accent', participant.accent || '#e58aa6');
        const avatar = createParticipantAvatar(participant, 'roundtable-avatar roundtable-avatar--sm');
        avatar.classList.add('roundtable-mention-hotspot');
        avatar.title = `@${participant.name}`;
        avatar.addEventListener('click', (event) => {
            event.stopPropagation();
            insertMention(participant);
        });
        const name = document.createElement('span');
        name.textContent = participant.name;
        item.append(avatar, name);
        if (state.removeMode) {
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'roundtable-card-remove';
            remove.textContent = '-';
            remove.title = `移出 ${participant.name}`;
            remove.setAttribute('aria-label', `移出 ${participant.name}`);
            remove.addEventListener('click', (event) => {
                event.stopPropagation();
                removeRoundtableMember(participant.id);
            });
            item.appendChild(remove);
        }
        els.participantStrip.appendChild(item);
    }
    const canAdd = state.activeParticipantIds.length < Math.min(MAX_SELECTED_PARTICIPANTS, state.participants.length);
    const canRemove = getActiveParticipants().length > 1;
    if (els.addMember) els.addMember.disabled = !canAdd;
    if (els.removeMember) els.removeMember.disabled = !canRemove;
    if (els.removeMember) els.removeMember.classList.toggle('is-active', state.removeMode);
}

function handleRosterClick(event) {
    if (state.step !== 'chat') return;
    const target = event.target;
    if (state.rosterExpanded) {
        if (target.closest('.roundtable-panel-label')) collapseRoster();
        return;
    }
    if (target.closest('button') || target.closest('.roundtable-mini-picker')) return;
    state.rosterExpanded = true;
    renderParticipantStrip();
}

function collapseRoster() {
    if (!state.rosterExpanded && !state.memberPickerOpen && !state.removeMode) return;
    state.rosterExpanded = false;
    state.memberPickerOpen = false;
    state.removeMode = false;
    renderParticipantStrip();
    renderMemberPicker();
}

function addRoundtableMember(id) {
    const active = new Set(state.activeParticipantIds);
    const next = state.participants.find(item => item.id === id && !active.has(item.id));
    if (!next) {
        setChatStatus('当前没有可加入的新成员。', 'warn');
        return;
    }
    if (state.activeParticipantIds.length >= MAX_SELECTED_PARTICIPANTS) {
        setChatStatus(`当前圆桌最多 ${MAX_SELECTED_PARTICIPANTS} 位成员。`, 'warn');
        return;
    }
    state.activeParticipantIds = [...state.activeParticipantIds, next.id];
    syncSetupSelectionFromActiveRoundtable();
    appendSystemMessage(`${next.name} 加入了当前圆桌。`, `member-add-${next.id}-${nowMs()}`);
    saveStorage();
    renderParticipantList();
    renderParticipantStrip();
    renderMemberPicker();
    renderStatus();
}

function removeRoundtableMember(id) {
    const active = getActiveParticipants();
    if (active.length <= 1) {
        setChatStatus('至少保留一位圆桌成员。', 'warn');
        return;
    }
    const removed = active.find(item => item.id === id);
    if (!removed) return;
    state.activeParticipantIds = state.activeParticipantIds.filter(id => id !== removed.id);
    syncSetupSelectionFromActiveRoundtable();
    appendSystemMessage(`${removed.name} 暂时离开了当前圆桌。`, `member-remove-${removed.id}-${nowMs()}`);
    state.queue = state.queue.filter(event => event.forcedSpeakerId !== removed.id && event.suggestedSpeakerId !== removed.id);
    if (getActiveParticipants().length <= 1) state.removeMode = false;
    saveStorage();
    renderParticipantList();
    renderParticipantStrip();
    renderMemberPicker();
    renderStatus();
}

function getAvailableParticipantsToAdd() {
    const active = new Set(state.activeParticipantIds);
    return state.participants.filter(item => !active.has(item.id)).slice(0, 12);
}

function toggleMemberPicker(event) {
    event?.stopPropagation?.();
    state.rosterExpanded = true;
    state.memberPickerOpen = !state.memberPickerOpen;
    state.removeMode = false;
    renderParticipantStrip();
    renderMemberPicker();
}

function hideMemberPicker() {
    state.memberPickerOpen = false;
    renderMemberPicker();
}

function toggleRemoveMode(event) {
    event?.stopPropagation?.();
    state.rosterExpanded = true;
    state.removeMode = !state.removeMode;
    state.memberPickerOpen = false;
    renderParticipantStrip();
    renderMemberPicker();
}

function renderMemberPicker() {
    if (!els.memberPicker) return;
    els.memberPicker.innerHTML = '';
    const available = getAvailableParticipantsToAdd();
    const visible = state.memberPickerOpen && state.step === 'chat';
    els.memberPicker.classList.toggle('hidden', !visible);
    if (!visible) return;
    const title = document.createElement('div');
    title.className = 'roundtable-mini-picker__title';
    title.textContent = '邀请成员';
    els.memberPicker.appendChild(title);
    if (available.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'roundtable-mini-picker__empty';
        empty.textContent = '没有可邀请的新成员';
        els.memberPicker.appendChild(empty);
        return;
    }
    const grid = document.createElement('div');
    grid.className = 'roundtable-mini-picker__grid';
    for (const participant of available) {
        const card = createPickerCard(participant, () => {
            addRoundtableMember(participant.id);
            hideMemberPicker();
        });
        grid.appendChild(card);
    }
    els.memberPicker.appendChild(grid);
}

function createPickerCard(participant, onClick) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'roundtable-picker-card';
    card.style.setProperty('--speaker-accent', participant.accent || '#e58aa6');
    const avatar = createParticipantAvatar(participant, 'roundtable-avatar roundtable-avatar--picker');
    const name = document.createElement('span');
    name.textContent = participant.name;
    card.append(avatar, name);
    card.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick?.();
    });
    return card;
}

function handleMentionInput() {
    if (!els.input || state.step !== 'chat') return;
    const value = els.input.value || '';
    const cursor = els.input.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const match = before.match(/[@＠][^\s@＠，。！？、：:；;]*$/);
    state.mentionPickerOpen = Boolean(match);
    renderMentionPicker(match ? match[0].slice(1) : '');
}

function hideMentionPicker() {
    state.mentionPickerOpen = false;
    renderMentionPicker();
}

function renderMentionPicker(filterText = '') {
    if (!els.mentionPicker) return;
    els.mentionPicker.innerHTML = '';
    const visible = state.mentionPickerOpen && state.step === 'chat';
    els.mentionPicker.classList.toggle('hidden', !visible);
    if (!visible) return;
    const query = String(filterText || '').trim();
    const participants = getActiveParticipants()
        .filter(item => !query || item.name.includes(query))
        .slice(0, 8);
    if (participants.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'roundtable-mini-picker__empty';
        empty.textContent = '没有匹配成员';
        els.mentionPicker.appendChild(empty);
        return;
    }
    for (const participant of participants) {
        const row = createMentionRow(participant);
        els.mentionPicker.appendChild(row);
    }
}

function createMentionRow(participant) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'roundtable-mention-row';
    row.style.setProperty('--speaker-accent', participant.accent || '#e58aa6');
    const avatar = createParticipantAvatar(participant, 'roundtable-avatar roundtable-avatar--mention');
    const name = document.createElement('span');
    name.textContent = participant.name;
    row.append(avatar, name);
    row.addEventListener('click', (event) => {
        event.stopPropagation();
        insertMention(participant);
    });
    return row;
}

function handleRoundtableDocumentClick(event) {
    if (!els.panel || els.panel.classList.contains('hidden')) return;
    const target = event.target;
    if (els.memberPicker?.contains(target) || els.addMember?.contains(target)) return;
    if (els.mentionPicker?.contains(target) || els.input?.contains(target)) return;
    if (state.memberPickerOpen) hideMemberPicker();
    if (state.mentionPickerOpen) hideMentionPicker();
}

function renderMessages() {
    if (!els.messageList) return;
    els.messageList.innerHTML = '';
    for (const message of state.messages) {
        els.messageList.appendChild(createMessageElement(message));
    }
    scrollMessages();
}

function createMessageElement(message) {
    const row = document.createElement('div');
    row.className = `roundtable-message roundtable-message--${message.role}`;
    row.style.setProperty('--speaker-accent', participantColor(message.speakerId));

    if (message.role === 'system') {
        const system = document.createElement('div');
        system.className = 'roundtable-system-msg';
        system.textContent = message.text;
        row.appendChild(system);
        return row;
    }

    const participant = getParticipantById(message.speakerId);
    const avatar = document.createElement('span');
    avatar.className = 'roundtable-avatar roundtable-avatar--msg';
    if (message.role === 'player') {
        avatar.textContent = '析';
    } else if (participant?.avatarSrc) {
        const img = document.createElement('img');
        img.src = participant.avatarSrc;
        img.alt = '';
        avatar.appendChild(img);
    } else {
        avatar.textContent = participant?.avatarText || message.speakerName.slice(0, 1);
    }
    if (message.role === 'bot' && participant) {
        avatar.classList.add('roundtable-mention-hotspot');
        avatar.title = `@${participant.name}`;
        avatar.setAttribute('role', 'button');
        avatar.setAttribute('tabindex', '0');
        avatar.setAttribute('aria-label', `@${participant.name}`);
        avatar.addEventListener('click', (event) => {
            event.stopPropagation();
            insertMention(participant);
        });
        avatar.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            insertMention(participant);
        });
    }

    const bubble = document.createElement('div');
    bubble.className = 'roundtable-bubble';
    const name = document.createElement('div');
    name.className = 'roundtable-bubble__name';
    name.textContent = message.role === 'player' ? '分析员' : message.speakerName;
    const text = document.createElement('div');
    text.className = 'roundtable-bubble__text';
    text.textContent = message.text;
    bubble.append(name, text);
    row.append(avatar, bubble);
    return row;
}

function scrollMessages() {
    requestAnimationFrame(() => {
        if (els.messageList) els.messageList.scrollTop = els.messageList.scrollHeight;
    });
}

function setSetupStatus(message, kind = 'info') {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.kind = kind;
}

function setChatStatus(message, kind = 'info') {
    if (!els.chatStatus) return;
    els.chatStatus.textContent = message;
    els.chatStatus.dataset.kind = kind;
}

function renderGameTime(options = {}) {
    if (!els.gameTime) return;
    let clockText = '🕗 --:-- 📶🔋';
    try {
        const info = state.getGameTimeInfo?.({ quantize: 5 });
        if (info && Number.isFinite(info.hour) && Number.isFinite(info.minute)) {
            clockText = `🕗 ${pad2(info.hour)}:${pad2(info.minute)} 📶🔋`;
        }
    } catch (err) {
        debugRoundtable('game time render failed', { reason: err?.message || String(err) });
    }
    if (state.lastClockText === clockText) return;
    state.lastClockText = clockText;
    els.gameTime.textContent = clockText;
}

function renderStatus() {
    renderGameTime();
    if (els.debt) els.debt.textContent = `互聊 ${state.interBotDebt}/${getBotChainLimit()}`;
    if (els.queue) els.queue.textContent = state.processing ? '发言中' : `队列 ${state.queue.length}`;
    if (state.step !== 'chat') {
        setSetupStatus(state.participants.length > 0 ? '选择席位后进入圆桌。' : '正在整理圆桌席位...', 'info');
        return;
    }
    if (state.processing && state.activeSpeakerId) {
        setChatStatus(`${getParticipantById(state.activeSpeakerId)?.name || '圆桌'} 正在接话...`, 'loading');
    } else if (state.playerFloorLock) {
        setChatStatus('话题已经交还给分析员。', 'warn');
    } else {
        setChatStatus('圆桌密语进行中。', 'ok');
    }
}

function startChat(mode = 'fresh') {
    if (state.selectedIds.size <= 0) {
        setSetupStatus('至少选择一位圆桌成员。', 'warn');
        return;
    }
    state.activeParticipantIds = [...state.selectedIds];
    if (mode === 'full') {
        activateFullContext();
    } else {
        activateFreshSession();
    }
    state.step = 'chat';
    state.interBotDebt = 0;
    state.playerFloorLock = false;
    state.rosterExpanded = false;
    state.lastAnyMessageAt = nowMs();
    state.lastPlayerMessageAt = state.lastPlayerMessageAt || nowMs();
    saveStorage();
    renderAll();
    setTimeout(() => els.input?.focus(), 80);
}

function handlePlayerSend() {
    if (!els.input || state.step !== 'chat') return;
    const text = els.input.value.trim();
    if (!text) return;
    els.input.value = '';
    hideMentionPicker();
    const floorLocked = state.playerFloorLock;
    applyPlayerDebtAdjustment(text);
    appendMessage({
        role: 'player',
        speakerId: PLAYER_ID,
        speakerName: '分析员',
        text,
        targetId: ALL_ID,
        intent: 'ask',
        emotion: 'neutral'
    });
    state.lastPlayerMessageAt = nowMs();
    const mentioned = collectMentionedParticipants(text, {
        speakerId: PLAYER_ID,
        includeKeywords: true,
        excludeSelf: false
    }).slice(0, MAX_SELECTED_PARTICIPANTS);
    if (mentioned.length > 0) {
        mentioned.forEach((participant, index) => {
            enqueueEvent({
                type: 'player',
                priority: 120 - index,
                text,
                floorLocked: index === 0 ? floorLocked : false,
                forcedSpeakerId: participant.id,
                replyTargetId: PLAYER_ID,
                mentionBatch: true,
                suppressFollowUp: index < mentioned.length - 1,
                createdAt: nowMs() + index
            });
        });
    } else {
        enqueueEvent({
            type: 'player',
            priority: 100,
            text,
            floorLocked,
            replyTargetId: PLAYER_ID,
            createdAt: nowMs()
        });
    }
}

function appendSystemMessage(text, key = '') {
    if (key && state.lastSystemNoticeKey === key) return;
    state.lastSystemNoticeKey = key;
    appendMessage({
        role: 'system',
        speakerId: 'system',
        speakerName: '圆桌',
        text,
        targetId: ALL_ID,
        intent: 'react',
        emotion: 'neutral',
        fallback: true
    });
}

function appendMessage(partial) {
    const message = normalizeStoredMessage({
        id: partial.id || createMessageId(partial.role || 'msg'),
        ts: partial.ts || nowMs(),
        ...partial
    });
    if (!message) return null;
    state.messages.push(message);
    state.messages = pruneMessages();
    if (state.sessionMode === 'fresh') {
        state.freshSessionDirty = true;
    }
    state.lastAnyMessageAt = nowMs();
    updateTopicSummary(message, partial.topicHint);
    saveStorage();
    if (state.step === 'chat' && els.messageList) {
        els.messageList.appendChild(createMessageElement(message));
        scrollMessages();
    }
    return message;
}

function updateTopicSummary(message, topicHint = '') {
    if (!message || message.role === 'system') return;
    const hint = clampText(topicHint, 80);
    const line = hint || `${message.speakerName}：${message.text}`;
    const next = `${state.topicSummary ? `${state.topicSummary} / ` : ''}${line}`;
    state.topicSummary = next.slice(-300);
}

function applyPlayerDebtAdjustment(text) {
    if (state.interBotDebt <= 0) return;
    const normalized = String(text || '').trim();
    if (/^(嗯|恩|好|继续|然后呢|你们说|你们继续|接着说|说吧|啊|哦)[。.!！?？~]*$/i.test(normalized)) {
        return;
    }
    state.interBotDebt = Math.max(1, state.interBotDebt - 1);
}

function enqueueEvent(event) {
    if (!isActiveSession()) return false;
    if (event.type === 'player') {
        state.queue = state.queue.filter(item => !isLowPriorityEvent(item));
    }
    if (event.type === 'followup') {
        state.queue = state.queue.filter(item => item.type !== 'followup' || item.mentionFollowUp);
    }
    if (state.queue.length >= QUEUE_LIMIT) {
        let lowestIndex = -1;
        let lowestPriority = Number.POSITIVE_INFINITY;
        state.queue.forEach((item, index) => {
            if (item.priority < lowestPriority) {
                lowestPriority = item.priority;
                lowestIndex = index;
            }
        });
        if (lowestIndex >= 0 && lowestPriority < event.priority) {
            debugRoundtable('queue drop lower priority event', {
                dropped: describeEvent(state.queue[lowestIndex]),
                incoming: describeEvent(event)
            });
            state.queue.splice(lowestIndex, 1);
        } else if (event.type === 'player') {
            debugRoundtable('queue shift for player event', {
                dropped: describeEvent(state.queue[0]),
                incoming: describeEvent(event)
            });
            state.queue.shift();
            setChatStatus('圆桌正在整理最新话题。', 'warn');
        } else {
            logRoundtableBlock('queue-full-low-priority-rejected', {
                event: describeEvent(event),
                queueLength: state.queue.length,
                queueLimit: QUEUE_LIMIT
            });
            return false;
        }
    }
    state.queue.push({
        id: createMessageId(`event_${event.type}`),
        ...event
    });
    state.queue.sort((a, b) => (b.priority - a.priority) || (a.createdAt - b.createdAt));
    renderStatus();
    scheduleProcess(0);
    return true;
}

function scheduleProcess(delayMs = 0) {
    if (state.processTimer) clearTimeout(state.processTimer);
    state.processTimer = setTimeout(() => {
        state.processTimer = 0;
        void processNextEvent();
    }, Math.max(0, delayMs));
}

async function processNextEvent() {
    if (state.processing || !isActiveSession()) return;
    const now = nowMs();
    const readyAt = Math.max(state.lastRequestEndedAt + HARD_COOLDOWN_MS, state.cooldownUntil);
    if (readyAt > now) {
        debugRoundtable('cooldown wait', {
            waitMs: Math.ceil(readyAt - now),
            hardCooldownMs: HARD_COOLDOWN_MS,
            rateLimitCooldownUntil: state.cooldownUntil,
            queueLength: state.queue.length
        });
        scheduleProcess(readyAt - now);
        return;
    }
    const event = state.queue.shift();
    if (!event) {
        renderStatus();
        return;
    }
    if (!canRunEvent(event)) {
        renderStatus();
        scheduleProcess(0);
        return;
    }

    const speaker = chooseSpeaker(event);
    if (!speaker) {
        logRoundtableBlock('no-speaker', {
            event: describeEvent(event),
            activeParticipantIds: state.activeParticipantIds
        });
        renderStatus();
        scheduleProcess(0);
        return;
    }

    state.processing = true;
    state.activeSpeakerId = speaker.id;
    state.requestToken += 1;
    const requestToken = state.requestToken;
    renderStatus();

    try {
        const settings = getSettings();
        const ragMessage = await buildRoundtableRagMessage(event);
        if (requestToken !== state.requestToken || !isActiveSession()) return;
        const estimatedTokens = estimateRequestTokens(speaker, event, ragMessage);
        const budgetBeforeRequest = getBudgetState();
        if (budgetBeforeRequest.tokenTotal + estimatedTokens >= TOKEN_HARD_LIMIT_10M) {
            logRoundtableBlock('token-hard-limit-before-request', {
                event: describeEvent(event),
                speakerId: speaker.id,
                estimatedTokens,
                budget: budgetBeforeRequest,
                tokenHardLimit: TOKEN_HARD_LIMIT_10M
            });
            if (event.type === 'player') appendSystemMessage('大家今天有点聊累了，稍后再继续吧。', 'hard-token-limit');
            stopLowPriorityEvents();
            return;
        }
        if (budgetBeforeRequest.tokenTotal + estimatedTokens >= TOKEN_SOFT_LIMIT_10M && isLowPriorityEvent(event) && !event.mentionFollowUp) {
            logRoundtableBlock('token-soft-limit-low-priority', {
                event: describeEvent(event),
                speakerId: speaker.id,
                estimatedTokens,
                budget: budgetBeforeRequest,
                tokenSoftLimit: TOKEN_SOFT_LIMIT_10M
            });
            return;
        }

        debugRoundtable('request start', {
            event: describeEvent(event),
            speakerId: speaker.id,
            speakerName: speaker.name,
            estimatedTokens,
            budget: budgetBeforeRequest
        });
        state.abortController = new AbortController();
        const rawText = await requestRoundtableCompletion({
            settings,
            speaker,
            event,
            ragMessage,
            signal: state.abortController.signal
        });
        if (requestToken !== state.requestToken || !isActiveSession()) return;
        recordCall(event.type, estimatedTokens);
        const parsed = parseRoundtableJson(rawText);
        const payload = normalizeBotPayload(parsed, speaker, event);
        const replyTarget = resolveEventTarget(event, speaker, payload);
        payload.targetId = replyTarget.id;
        payload.text = ensureTargetPrefix(payload.text, replyTarget);
        const message = appendMessage({
            role: 'bot',
            speakerId: speaker.id,
            speakerName: speaker.name,
            text: payload.text,
            targetId: payload.targetId,
            intent: payload.intent,
            emotion: payload.emotion,
            fallback: payload.fallback,
            topicHint: payload.topicHint
        });
        updateSpeakerStats(speaker.id);
        if (message?.text) recordDialogueInteraction('bar', message.text);
        handlePostBotEvent(event, speaker, payload);
        debugRoundtable('request success', {
            event: describeEvent(event),
            speakerId: speaker.id,
            intent: payload.intent,
            fallback: payload.fallback,
            textLength: payload.text.length,
            wantsFollowUp: payload.wantsFollowUp
        });
    } catch (err) {
        if (err?.name === 'AbortError') return;
        if (requestToken !== state.requestToken || !isActiveSession()) return;
        handleRequestError(err, speaker, event);
    } finally {
        if (requestToken === state.requestToken) {
            state.processing = false;
            state.activeSpeakerId = '';
            state.abortController = null;
            state.lastRequestEndedAt = nowMs();
            renderStatus();
            scheduleProcess(HARD_COOLDOWN_MS);
        }
    }
}

function canRunEvent(event) {
    if (!isActiveSession()) {
        logRoundtableBlock('inactive-session', { event: describeEvent(event), barActive: state.isBarActive?.() });
        return false;
    }
    if (event.type === 'handoff' && state.interBotDebt < getBotChainLimit()) {
        logRoundtableBlock('handoff-debt-not-ready', {
            event: describeEvent(event),
            interBotDebt: state.interBotDebt,
            botChainLimit: getBotChainLimit()
        });
        return false;
    }
    if (event.type === 'idle' && (state.playerFloorLock || state.interBotDebt > 0)) {
        logRoundtableBlock('idle-blocked-by-floor-or-debt', {
            event: describeEvent(event),
            playerFloorLock: state.playerFloorLock,
            interBotDebt: state.interBotDebt
        });
        return false;
    }
    if (isLowPriorityEvent(event) && state.playerFloorLock) {
        logRoundtableBlock('low-priority-blocked-by-player-floor-lock', {
            event: describeEvent(event),
            playerFloorLock: state.playerFloorLock
        });
        return false;
    }

    const settings = getSettings();
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    if (!settings.apiKey || !baseUrl || !settings.model) {
        logRoundtableBlock('missing-api-settings', {
            event: describeEvent(event),
            hasApiKey: Boolean(settings.apiKey),
            hasBaseUrl: Boolean(baseUrl),
            hasModel: Boolean(settings.model)
        });
        if (event.type === 'player') {
            appendSystemMessage('请先在设置中填写 API Key、Base URL 和模型名称。', 'missing-api');
        }
        return false;
    }

    const budget = getBudgetState();
    if (budget.hardLimited) {
        logRoundtableBlock('budget-hard-limit', {
            event: describeEvent(event),
            budget,
            totalCallLimit: TOTAL_CALL_LIMIT_10M,
            tokenHardLimit: TOKEN_HARD_LIMIT_10M
        });
        if (event.type === 'player') {
            appendSystemMessage('大家今天有点聊累了，稍后再继续吧。', 'hard-limit');
        }
        setChatStatus('大家今天有点聊累了，稍后再继续吧。', 'warn');
        stopLowPriorityEvents();
        return false;
    }
    if (budget.softLimited && isLowPriorityEvent(event) && !event.mentionFollowUp) {
        logRoundtableBlock('budget-soft-limit-low-priority', {
            event: describeEvent(event),
            budget,
            softCallLimit: SOFT_CALL_LIMIT_10M,
            tokenSoftLimit: TOKEN_SOFT_LIMIT_10M
        });
        return false;
    }
    if (event.type === 'idle' && budget.idleCalls >= IDLE_CALL_LIMIT_10M) {
        logRoundtableBlock('idle-call-limit', {
            event: describeEvent(event),
            budget,
            idleCallLimit: IDLE_CALL_LIMIT_10M
        });
        return false;
    }
    return true;
}

function stopLowPriorityEvents() {
    state.queue = state.queue.filter(event => !isLowPriorityEvent(event));
}

function getBudgetState() {
    const cutoff = nowMs() - CALL_WINDOW_MS;
    state.callHistory = state.callHistory.filter(item => item.ts >= cutoff);
    const total = state.callHistory.length;
    const idleCalls = state.callHistory.filter(item => item.type === 'idle').length;
    const tokenTotal = state.callHistory.reduce((sum, item) => sum + (Number(item.tokens) || 0), 0);
    return {
        total,
        idleCalls,
        tokenTotal,
        softLimited: total >= SOFT_CALL_LIMIT_10M || tokenTotal >= TOKEN_SOFT_LIMIT_10M,
        hardLimited: total >= TOTAL_CALL_LIMIT_10M || tokenTotal >= TOKEN_HARD_LIMIT_10M
    };
}

function recordCall(type, tokens = 0) {
    state.callHistory.push({ ts: nowMs(), type, tokens: Math.max(0, Math.round(tokens) || 0) });
    getBudgetState();
}

function estimateRequestTokens(speaker, event, ragMessage = null) {
    const recentMessages = state.messages
        .filter(item => item.role !== 'system')
        .slice(-10)
        .map(item => `${item.speakerName}:${item.text}`)
        .join('\n');
    return estimateTokens([
        speaker?.prompt || '',
        state.topicSummary,
        event?.text || '',
        event?.sourceText || '',
        recentMessages,
        ragMessage?.content || '',
        getGameTimeContext(),
        'roundtable-json-contract-static-overhead'
    ].join('\n')) + 1200;
}

function chooseSpeaker(event) {
    const participants = getActiveParticipants();
    if (participants.length === 0) return null;
    const forced = event.forcedSpeakerId ? getParticipantById(event.forcedSpeakerId) : null;
    if (forced && participants.some(item => item.id === forced.id)) return forced;

    if (event.type === 'followup' && event.suggestedSpeakerId) {
        const suggested = participants.find(item => item.id === event.suggestedSpeakerId && item.id !== event.previousSpeakerId);
        if (suggested) return suggested;
    }

    const candidates = event.type === 'followup'
        ? participants.filter(item => item.id !== event.previousSpeakerId)
        : participants;
    if (candidates.length === 0) return event.type === 'followup' ? null : (participants[0] || null);

    let best = null;
    let bestScore = -Infinity;
    for (const participant of candidates) {
        const score = scoreSpeaker(participant, event);
        if (score > bestScore) {
            best = participant;
            bestScore = score;
        }
    }
    return best;
}

function scoreSpeaker(participant, event) {
    const text = event.text || '';
    const stats = state.participantStats.get(participant.id) || {};
    let score = Math.random() * 7;

    if (isAtMentioned(text, participant.name)) score += 100;
    if (isNameMentioned(text, participant.name)) score += 28;
    if (/[?？吗呢谁什么怎么如何为何为什么是否]/.test(text)) score += 6;
    for (const tag of participant.tags || []) {
        if (tag && text.includes(tag)) score += 12;
    }
    const silenceMs = stats.lastSpokeAt ? nowMs() - stats.lastSpokeAt : CALL_WINDOW_MS;
    score += Math.min(18, silenceMs / 16000);
    score -= Math.min(16, (stats.speechCount || 0) * 1.7);
    if (stats.lastSpokeAt && state.messages.at(-1)?.speakerId === participant.id) score -= 22;
    if (event.type === 'idle') score += Math.min(12, silenceMs / 12000);
    if (event.type === 'handoff') score += participant.id === state.messages.at(-1)?.speakerId ? -14 : 8;
    if (event.type === 'followup' && participant.id === event.previousSpeakerId) score -= 80;
    return score;
}

function isAtMentioned(text, name) {
    const source = String(text || '');
    const escaped = escapeRegExp(name);
    return new RegExp(`[@＠]\\s*${escaped}`).test(source);
}

function isNameMentioned(text, name) {
    const source = String(text || '');
    const escaped = escapeRegExp(name);
    if (!source || !name) return false;
    const bounded = new RegExp(`(^|[\\s@＠，。！？、：:；;《》（）()\\[\\]【】「」『』])${escaped}([\\s，。！？、：:；;《》（）()\\[\\]【】「」『』]|$)`);
    if (bounded.test(source)) return true;
    return /[\u4e00-\u9fff]/.test(name) && [...name].length >= 2 && source.includes(name);
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateSpeakerStats(id) {
    const stats = state.participantStats.get(id) || { speechCount: 0, lastSpokeAt: 0 };
    stats.speechCount += 1;
    stats.lastSpokeAt = nowMs();
    state.participantStats.set(id, stats);
}

function handlePostBotEvent(event, speaker, payload) {
    if (event.type === 'handoff') {
        state.interBotDebt = Math.max(state.interBotDebt, getBotChainLimit());
        enterPlayerFloorLock('forced-handoff-event', {
            event: describeEvent(event),
            speakerId: speaker?.id || '',
            intent: payload.intent
        });
        payload.wantsFollowUp = false;
        return;
    }

    if (isInterBotFollowUp(event, speaker)) {
        state.interBotDebt = Math.min(getBotChainLimit(), state.interBotDebt + 1);
        if (state.interBotDebt >= getBotChainLimit()) {
            enterPlayerFloorLock('inter-bot-debt-limit-final-turn', {
                event: describeEvent(event),
                speakerId: speaker?.id || '',
                interBotDebt: state.interBotDebt,
                botChainLimit: getBotChainLimit()
            });
            payload.wantsFollowUp = false;
            return;
        }
    } else if (event.type === 'followup') {
        debugRoundtable('inter-bot debt unchanged: followup is not bot-to-bot', {
            event: describeEvent(event),
            speakerId: speaker?.id || '',
            interBotDebt: state.interBotDebt
        });
    }

    if (payload.intent === HANDOFF_INTENT) {
        const earliestHandoffDebt = getEarliestModelHandoffDebt();
        enterPlayerFloorLock('model-handoff-intent', {
            event: describeEvent(event),
            speakerId: speaker?.id || '',
            intent: payload.intent,
            earliestHandoffDebt
        });
        payload.wantsFollowUp = false;
        return;
    }

    if (event.floorLocked) {
        state.interBotDebt = Math.max(0, state.interBotDebt - 1);
        state.playerFloorLock = false;
        return;
    }

    if (event.type !== 'player' && event.type !== 'followup') return;
    if (event.type === 'player' && state.interBotDebt > 0) {
        state.interBotDebt = Math.max(0, state.interBotDebt - 1);
    }
    if (!state.options.autoBotChat) {
        debugRoundtable('followup skipped: auto bot chat disabled', { event: describeEvent(event), speakerId: speaker.id });
        return;
    }
    if (state.playerFloorLock || state.interBotDebt >= getBotChainLimit()) {
        debugRoundtable('followup skipped: floor lock or debt', {
            event: describeEvent(event),
            playerFloorLock: state.playerFloorLock,
            interBotDebt: state.interBotDebt,
            botChainLimit: getBotChainLimit()
        });
        return;
    }
    const remainingChain = Math.max(0, getBotChainLimit() - state.interBotDebt);
    if (remainingChain <= 0) return;
    const mentioned = getBotMentionCandidates(payload.text, speaker).slice(0, remainingChain);
    if (mentioned.length > 0) {
        mentioned.forEach((participant, index) => {
            enqueueEvent({
                type: 'followup',
                priority: 70 - index,
                previousSpeakerId: speaker.id,
                forcedSpeakerId: participant.id,
                replyTargetId: speaker.id,
                sourceText: payload.text,
                mentionFollowUp: true,
                interBotChain: true,
                createdAt: nowMs() + index
            });
        });
        debugRoundtable('mention followup enqueued', {
            speakerId: speaker.id,
            mentioned: mentioned.map(item => item.id),
            botAtMentionTriggersReply: state.options.botAtMentionTriggersReply,
            remainingChain
        });
        return;
    }
    if (event.type === 'player' && event.suppressFollowUp) {
        debugRoundtable('probability followup skipped: player mention batch still pending', { event: describeEvent(event) });
        return;
    }
    if (getBudgetState().softLimited) {
        debugRoundtable('followup skipped: budget soft limit', { event: describeEvent(event), budget: getBudgetState() });
        return;
    }
    if (!payload.wantsFollowUp || Math.random() > FOLLOW_UP_RATE) {
        debugRoundtable('followup skipped: model/probability', {
            event: describeEvent(event),
            wantsFollowUp: payload.wantsFollowUp,
            followUpRate: FOLLOW_UP_RATE
        });
        return;
    }

    enqueueEvent({
        type: 'followup',
        priority: 30,
        previousSpeakerId: speaker.id,
        replyTargetId: speaker.id,
        suggestedSpeakerId: payload.suggestedFollowUpTargetId,
        sourceText: payload.text,
        interBotChain: true,
        createdAt: nowMs()
    });
}

function handleRequestError(err, speaker, event) {
    const message = String(err?.message || '');
    const isRateLimit = err?.status === 429 || /429|rate limit|too many requests/i.test(message);
    if (isRateLimit) {
        state.cooldownUntil = Math.max(state.cooldownUntil, nowMs() + 20000);
        setChatStatus('圆桌稍微放慢了语速。', 'warn');
    } else {
        setChatStatus('圆桌有一瞬间没听清。', 'warn');
    }
    const fallbackKind = event.type === 'handoff'
        ? 'handoff'
        : (event.type === 'idle' ? 'idle' : (event.type === 'followup' ? 'followup' : 'error'));
    const replyTarget = resolveEventTarget(event, speaker, {
        intent: fallbackKind === 'handoff' ? HANDOFF_INTENT : 'react',
        targetId: fallbackKind === 'handoff' ? PLAYER_ID : (event.replyTargetId || ALL_ID)
    });
    appendMessage({
        role: 'bot',
        speakerId: speaker.id,
        speakerName: speaker.name,
        text: ensureTargetPrefix(randomItem(SAFE_FALLBACKS[fallbackKind] || SAFE_FALLBACKS.error), replyTarget),
        targetId: replyTarget.id,
        intent: fallbackKind === 'handoff' ? HANDOFF_INTENT : 'react',
        emotion: 'shy',
        fallback: true
    });
    if (event.type === 'handoff') {
        enterPlayerFloorLock('handoff-api-fallback', {
            event: describeEvent(event),
            speakerId: speaker?.id || ''
        });
    }
    console.warn('[Roundtable][api-error]', {
        status: err?.status || 0,
        statusText: err?.statusText || '',
        code: err?.code || '',
        name: err?.name || '',
        message,
        body: err?.body || '',
        reason: isRateLimit ? 'rate-limit' : 'api-error',
        isRateLimit,
        speakerId: speaker?.id || '',
        event: describeEvent(event),
        cooldownUntil: state.cooldownUntil
    }, err);
}

async function requestRoundtableCompletion({ settings, speaker, event, ragMessage = null, signal }) {
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(buildRequestBody(settings, speaker, event, ragMessage)),
        signal
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        const error = new Error(`API 请求失败 (${response.status}): ${body.slice(0, 160)}`);
        error.status = response.status;
        error.statusText = response.statusText || '';
        error.body = body.slice(0, 500);
        throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        return extractCompletionText(json).trim() || JSON.stringify(json);
    }
    if (!response.body) throw new Error('API 没有返回可读取内容。');
    return readCompletionStream(response);
}

async function buildRoundtableRagMessage(event) {
    const recentMessages = state.messages
        .filter(item => item.role !== 'system')
        .slice(-8)
        .map(item => `${item.speakerName}：${item.text}`);
    const query = [event?.text || '', event?.sourceText || '', state.topicSummary].filter(Boolean).join('\n');
    return buildRagReferenceMessage({
        mode: 'roundtable',
        query,
        recentMessages,
        limit: 5
    });
}

function buildRequestBody(settings, speaker, event, ragMessage = null) {
    const participants = getActiveParticipants();
    const others = participants
        .filter(item => item.id !== speaker.id)
        .map(item => `${item.name}（同为分析员亲密、彼此认可的恋人）`)
        .join('、') || '暂无';
    const budget = getBudgetState();
    const recentCount = budget.softLimited ? 6 : 10;
    const recentMessages = state.messages
        .filter(item => item.role !== 'system')
        .slice(-recentCount)
        .map(item => ({
            speakerId: item.speakerId,
            speakerName: item.speakerName,
            role: item.role,
            text: item.text,
            intent: item.intent
        }));
    const forcedIntent = isForcedHandoffEvent(event, speaker) ? HANDOFF_INTENT : '';
    const replyTarget = resolveEventTarget(event, speaker, { targetId: event.replyTargetId || ALL_ID, intent: forcedIntent });
    const userContext = {
        eventType: event.type,
        playerInput: event.text || '',
        sourceBotText: event.sourceText || '',
        forcedIntent,
        replyTarget,
        interBotDebt: state.interBotDebt,
        botChainLimit: getBotChainLimit(),
        earliestHandoffDebt: getEarliestModelHandoffDebt(),
        playerFloorLock: state.playerFloorLock,
        topicSummary: state.topicSummary,
        participants: participants.map(item => ({ id: item.id, name: item.name })),
        recentMessages
    };

    return {
        model: settings.model,
        stream: true,
        temperature: 0.82,
        messages: [
            {
                role: 'system',
                content: [
                    '你正在参与《芙提雅 ONLINE NEXT》的“圆桌密语”群聊。所有女性角色都与玩家“分析员”保持亲密、稳定、彼此认可的恋人关系。你需要像真实群聊中的一个角色一样发出一条短消息。',
                    '',
                    `本次你只扮演：${speaker.name}。不要代替其他角色发言。`,
                    `你的完整人格设定如下：\n${speaker.prompt || `你正在扮演 ${speaker.name}。`}`,
                    '',
                    `其他在场成员：${others}。`,
                    getGameTimeContext(),
                    '',
                    '关系规则：你可以喜欢、依恋、调侃、轻微占有分析员；可以和其他角色互相接话、玩笑、补充、害羞地竞争陪伴机会；不能敌视其他角色，不能恶意争风吃醋，不能要求分析员抛弃其他人；整体基调是和谐、暧昧、亲密、包容。',
                    '玩家中心规则：即使你正在回应另一个角色，也不能忘记分析员在场；话题应自然关联到分析员，或邀请分析员参与；不要让角色之间长时间自顾自聊天。',
                    '互聊节奏规则：如果 eventType 为 followup 且 interBotDebt 低于 earliestHandoffDebt，不要急着交还话题，可继续接其他成员的话；当 forcedIntent 为 handoff_to_player 或 interBotDebt 接近 botChainLimit 时，必须把话题交还给分析员。',
                    '群聊显示规则：text 必须以 @回复对象 开头，例如 @分析员、@琴诺；你只能 @ 分析员或某个具体成员，不要 @大家。这个 @ 只表示你正在回应谁，不代表请求对方再次发言。',
                    '如果本次要求 forcedIntent 为 handoff_to_player，你必须把话题交还给分析员，提出轻量问题、邀请选择、邀请评价或邀请参与，并且 wantsFollowUp 必须为 false。',
                    '',
                    '输出规则：只输出 JSON，不要输出 Markdown。不要代替其他角色说话。不要输出多轮对话。不要说“作为 AI”。消息长度 10-60 个中文字符，最多 100 字。',
                    'JSON 字段固定为：text, targetId, intent, emotion, wantsFollowUp, suggestedFollowUpTargetId, topicHint。',
                    'targetId 只能是 player、all 或某个参与者 id。intent 只能是 answer/react/tease/ask/shift_topic/idle/handoff_to_player。emotion 只能是 neutral/happy/shy/jealous/teasing/serious。'
                ].join('\n')
            },
            ...(ragMessage ? [ragMessage] : []),
            {
                role: 'user',
                content: [
                    '请根据以下圆桌状态，只生成你这一位角色的一条 JSON 消息：',
                    JSON.stringify(userContext, null, 2)
                ].join('\n')
            }
        ]
    };
}

async function readCompletionStream(response) {
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
    return current + extractCompletionText(json);
}

function extractCompletionText(json) {
    if (!json || typeof json !== 'object') return '';
    const choice = json.choices?.[0];
    return choice?.delta?.content
        || choice?.message?.content
        || choice?.text
        || json.output_text
        || '';
}

function parseRoundtableJson(content) {
    const text = stripJsonFences(content);
    const direct = tryParseJson(text);
    if (direct.ok) return direct.value;
    const objectText = extractJsonObjectText(text);
    if (!objectText) throw new Error('LLM 返回非 JSON。');
    const extracted = tryParseJson(objectText);
    if (extracted.ok) return extracted.value;
    const quoteFixed = objectText
        .replace(/[“”]([\w$-]+)[“”]\s*:/g, '"$1":')
        .replace(/:\s*[“”]([^“”]*?)[“”](?=\s*[,}\]])/g, ': "$1"')
        .replace(/[‘’]([\w$-]+)[‘’]\s*:/g, '"$1":')
        .replace(/:\s*[‘’]([^‘’]*?)[‘’](?=\s*[,}\]])/g, ': "$1"');
    const fixed = tryParseJson(quoteFixed);
    if (fixed.ok) return fixed.value;
    throw extracted.error || new Error('LLM JSON 解析失败。');
}

function stripJsonFences(value) {
    return String(value || '')
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();
}

function tryParseJson(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (error) {
        return { ok: false, error };
    }
}

function extractJsonObjectText(text) {
    const source = String(text || '');
    let start = source.indexOf('{');
    while (start >= 0) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < source.length; i += 1) {
            const ch = source[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }
                continue;
            }
            if (ch === '"') {
                inString = true;
            } else if (ch === '{') {
                depth += 1;
            } else if (ch === '}') {
                depth -= 1;
                if (depth === 0) return source.slice(start, i + 1);
            }
        }
        start = source.indexOf('{', start + 1);
    }
    return '';
}

function normalizeBotPayload(raw, speaker, event) {
    const source = raw && typeof raw === 'object' ? raw : {};
    let text = sanitizeBotText(source.text, speaker.name);
    let fallback = false;
    const kind = event.type === 'handoff'
        ? 'handoff'
        : (event.type === 'idle' ? 'idle' : (event.type === 'followup' ? 'followup' : 'answer'));
    if (!text || text.length > 160 || containsHostileText(text)) {
        text = randomItem(SAFE_FALLBACKS[kind] || SAFE_FALLBACKS.answer);
        fallback = true;
    }

    const validTargets = new Set([PLAYER_ID, ALL_ID, ...getActiveParticipants().map(item => item.id)]);
    let targetId = validTargets.has(source.targetId) ? source.targetId : (event.type === 'handoff' ? PLAYER_ID : ALL_ID);
    let intent = ALLOWED_INTENTS.has(source.intent) ? source.intent : defaultIntentForEvent(event.type);
    let emotion = ALLOWED_EMOTIONS.has(source.emotion) ? source.emotion : 'neutral';
    let wantsFollowUp = source.wantsFollowUp === true;
    let suggestedFollowUpTargetId = validTargets.has(source.suggestedFollowUpTargetId) && source.suggestedFollowUpTargetId !== speaker.id
        ? source.suggestedFollowUpTargetId
        : '';
    const topicHint = clampText(source.topicHint, 80);

    if (intent === HANDOFF_INTENT && shouldDelayModelHandoff(event, speaker, text)) {
        debugRoundtable('model handoff downgraded before append: inter-bot chain too early', {
            event: describeEvent(event),
            speakerId: speaker?.id || '',
            interBotDebt: state.interBotDebt,
            nextInterBotDebt: state.interBotDebt + 1,
            earliestHandoffDebt: getEarliestModelHandoffDebt(),
            botChainLimit: getBotChainLimit()
        });
        intent = 'react';
        targetId = event.previousSpeakerId || ALL_ID;
        wantsFollowUp = true;
    }

    if (isForcedHandoffEvent(event, speaker) || event.type === 'handoff' || intent === HANDOFF_INTENT) {
        intent = HANDOFF_INTENT;
        targetId = PLAYER_ID;
        wantsFollowUp = false;
        suggestedFollowUpTargetId = '';
        if (!addressesPlayer(text)) {
            text = randomItem(SAFE_FALLBACKS.handoff);
            fallback = true;
        }
    }

    return {
        text,
        targetId,
        intent,
        emotion,
        wantsFollowUp,
        suggestedFollowUpTargetId,
        topicHint,
        fallback
    };
}

function defaultIntentForEvent(type) {
    if (type === 'idle') return 'idle';
    if (type === 'handoff') return HANDOFF_INTENT;
    if (type === 'followup') return 'react';
    return 'answer';
}

function sanitizeBotText(value, speakerName) {
    let text = String(value || '')
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .trim();
    const prefix = new RegExp(`^\\s*(?:${escapeRegExp(speakerName)}|我)\\s*[:：]\\s*`);
    text = text.replace(prefix, '').trim();
    return text;
}

function containsHostileText(text) {
    return HOSTILE_PATTERNS.some(pattern => pattern.test(text));
}

function addressesPlayer(text) {
    return /分析员|玩家|你|主人|一起|选择|决定|想听|来/.test(text);
}

function isActiveSession() {
    return Boolean(els.panel && !els.panel.classList.contains('hidden') && state.isBarActive?.());
}

function stopAllRequests(reason = '') {
    state.queue = [];
    if (state.processTimer) {
        clearTimeout(state.processTimer);
        state.processTimer = 0;
    }
    if (state.processing || state.abortController) {
        state.requestToken += 1;
    }
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
    }
    state.processing = false;
    state.activeSpeakerId = '';
    if (reason === 'close' || reason === 'setup') {
        state.interBotDebt = 0;
        state.playerFloorLock = false;
    }
    if (reason === 'close') {
        state.lastSystemNoticeKey = '';
    }
    renderStatus();
}

export function initRoundtableWhispers(options = {}) {
    if (state.initialized) return;
    state.initialized = true;
    state.controlsModule = options.controlsModule || null;
    state.isBarActive = typeof options.isBarActive === 'function' ? options.isBarActive : () => false;
    state.getGuestParticipants = typeof options.getGuestParticipants === 'function' ? options.getGuestParticipants : () => [];
    state.getGameTimeInfo = typeof options.getGameTimeInfo === 'function' ? options.getGameTimeInfo : () => null;
    cacheElements();
    loadStorage();
    bindEvents();
    void refreshParticipants().then(renderAll);
}

export async function openRoundtableWhispers() {
    if (!els.panel) return false;
    if (!state.isBarActive?.()) return false;
    await refreshParticipants();
    state.step = 'setup';
    els.panel.classList.remove('hidden');
    state.controlsModule?.releaseControlMode?.({ resumeOnClose: true });
    renderAll();
    return true;
}

export function closeRoundtableWhispers(options = {}) {
    if (!els.panel || els.panel.classList.contains('hidden')) return false;
    const closingFromChat = state.step === 'chat';
    persistCurrentSessionToFull();
    if (closingFromChat) syncSetupSelectionFromActiveRoundtable();
    stopAllRequests('close');
    els.panel.classList.add('hidden');
    saveStorage();
    if (options.dispatch !== false) {
        document.dispatchEvent(new CustomEvent('fritia-overlay-closed', {
            detail: { id: 'roundtable-whispers-panel' }
        }));
    }
    return true;
}

export function isRoundtableWhispersVisible() {
    return Boolean(els.panel && !els.panel.classList.contains('hidden'));
}

export function updateRoundtableWhispers() {
    if (!isRoundtableWhispersVisible()) return;
    renderGameTime();
    if (!state.isBarActive?.()) {
        closeRoundtableWhispers();
        return;
    }
    const now = nowMs();
    if (now - state.lastIdleCheckAt < IDLE_CHECK_INTERVAL_MS) return;
    state.lastIdleCheckAt = now;
    if (state.step !== 'chat' || !state.options.idleTalk) return;
    if (state.processing || state.queue.length > 0 || state.playerFloorLock || state.interBotDebt > 0) {
        debugRoundtable('idle skipped: busy/floor/debt', {
            processing: state.processing,
            queueLength: state.queue.length,
            playerFloorLock: state.playerFloorLock,
            interBotDebt: state.interBotDebt
        });
        return;
    }
    if (now - state.lastAnyMessageAt < IDLE_COOLDOWN_MS) return;
    if (now - state.lastIdleEnqueuedAt < IDLE_COOLDOWN_MS) return;
    const budget = getBudgetState();
    if (budget.softLimited || budget.idleCalls >= IDLE_CALL_LIMIT_10M) {
        logRoundtableBlock('idle-budget-blocked', {
            budget,
            idleCallLimit: IDLE_CALL_LIMIT_10M,
            tokenSoftLimit: TOKEN_SOFT_LIMIT_10M
        });
        return;
    }
    state.lastIdleEnqueuedAt = now;
    enqueueEvent({
        type: 'idle',
        priority: 10,
        createdAt: now
    });
}

export function exportRoundtableWhispers() {
    if (state.step === 'chat') syncSetupSelectionFromActiveRoundtable();
    persistCurrentSessionToFull();
    state.fullMessages = pruneMessages(state.fullMessages);
    state.fullTopicSummary = state.fullTopicSummary || summarizeMessages(state.fullMessages);
    return {
        version: 2,
        updatedAt: nowMs(),
        options: { ...state.options },
        selectedIds: [...state.selectedIds],
        activeParticipantIds: [...state.activeParticipantIds],
        topicSummary: state.fullTopicSummary,
        fullTopicSummary: state.fullTopicSummary,
        messages: state.fullMessages,
        fullMessages: state.fullMessages
    };
}

export function importRoundtableWhispers(data) {
    if (!data || typeof data !== 'object') return { imported: 0 };
    persistCurrentSessionToFull();
    const before = new Set(state.fullMessages.map(item => item.id));
    if (data.options && typeof data.options === 'object') {
        state.options = normalizeOptions(data.options);
    }
    if (Array.isArray(data.selectedIds)) {
        state.selectedIds = new Set(data.selectedIds.map(id => String(id || '').trim()).filter(Boolean));
    }
    if (Array.isArray(data.activeParticipantIds)) {
        state.activeParticipantIds = data.activeParticipantIds.map(id => String(id || '').trim()).filter(Boolean);
    }
    if (typeof data.fullTopicSummary === 'string' || typeof data.topicSummary === 'string') {
        state.fullTopicSummary = clampText(data.fullTopicSummary || data.topicSummary, 300);
    }
    const merged = new Map(state.fullMessages.map(item => [item.id, item]));
    const incoming = Array.isArray(data.fullMessages) ? data.fullMessages : (data.messages || []);
    for (const raw of incoming) {
        const message = normalizeStoredMessage(raw);
        if (message) merged.set(message.id, message);
    }
    state.fullMessages = pruneMessages([...merged.values()].sort((a, b) => a.ts - b.ts));
    state.fullTopicSummary = state.fullTopicSummary || summarizeMessages(state.fullMessages);
    if (state.sessionMode !== 'fresh') {
        activateFullContext();
    }
    saveStorage();
    renderAll();
    return {
        imported: state.fullMessages.filter(item => !before.has(item.id)).length
    };
}
