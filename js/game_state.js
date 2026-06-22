import { getGameTimeSpeedSettings } from './advanced_settings.js';

const STORAGE_KEY = 'fritia_game_state';
const INITIAL_GAME_MINUTES = 12 * 60;
const DAY_MINUTES = 24 * 60;
const DAILY_SALARY = 4000;
const INITIAL_MONEY = 40000;
const INITIAL_AFFINITY = 124;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const DEFAULT_MODELS = [
    'src/_fritia_3d_model/驰掣-毛绒派对.pmx',
    'src/_fritia_alterable_models/sweety_straw/芙提雅-驰掣 草莓甜心物理裙a1.0.pmx',
    'src/_fritia_alterable_models/cyan_leaf/芙提雅 青叶密裹1.0.pmx',
    'src/_fritia_alterable_models/pool_guard/芙提雅-驰掣 泳池护卫a2.0.pmx',
    'src/_fritia_alterable_models/small_king/芙提雅-炬芯 国主驾到.pmx'
];

let state = {
    gameMinutes: INITIAL_GAME_MINUTES,
    money: INITIAL_MONEY,
    affinity: INITIAL_AFFINITY,
    lastSalaryDay: 0,
    gifts: [],
    stats: createDefaultStats()
};

let lastDisplayBucket = Math.floor(INITIAL_GAME_MINUTES / getGameTimeSpeedSettings().displayStepMinutes);

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
}

function createDefaultStats() {
    return {
        moneySpent: 0,
        lastMoneySpentGameMinute: 0,
        fiveStarGiftCount: 0,
        maxGiftEstimate: 0,
        dailyUserMessages: 0,
        dailyBotMessages: 0,
        barUserMessages: 0,
        barBotMessages: 0,
        dateUserMessages: 0,
        dateBotMessages: 0,
        lastDateDialogueGameMinute: 0,
        dateInteractionLocations: [],
        usedModelPaths: [DEFAULT_MODELS[0]],
        smallTeacherStartsWithGanShenme: 0,
        headPatCount: 0,
        maxDreamFurnitureRevisionCount: 0,
        sleepModeCount: 0,
        danceWatchCount: 0,
        bartendingChallengeWins: 0
    };
}

function normalizeStats(data = {}, context = {}) {
    const defaults = createDefaultStats();
    const list = (value) => Array.isArray(value) ? value.filter(Boolean).map(String) : [];
    const currentGameMinute = Math.max(0, Math.round(Number(context.gameMinutes ?? state.gameMinutes) || 0));
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(data || {}, key);
    const moneySpent = Math.max(0, Math.round(Number(data.moneySpent) || 0));
    const dateUserMessages = Math.max(0, Math.round(Number(data.dateUserMessages) || 0));
    const dateBotMessages = Math.max(0, Math.round(Number(data.dateBotMessages) || 0));
    const lastMoneySpentGameMinute = hasOwn('lastMoneySpentGameMinute')
        ? Math.max(0, Math.round(Number(data.lastMoneySpentGameMinute) || 0))
        : (moneySpent > 0 ? currentGameMinute : 0);
    const lastDateDialogueGameMinute = hasOwn('lastDateDialogueGameMinute')
        ? Math.max(0, Math.round(Number(data.lastDateDialogueGameMinute) || 0))
        : (dateUserMessages > 0 || dateBotMessages > 0 ? currentGameMinute : 0);
    return {
        moneySpent,
        lastMoneySpentGameMinute,
        fiveStarGiftCount: Math.max(0, Math.round(Number(data.fiveStarGiftCount) || 0)),
        maxGiftEstimate: Math.max(0, Math.round(Number(data.maxGiftEstimate) || 0)),
        dailyUserMessages: Math.max(0, Math.round(Number(data.dailyUserMessages) || 0)),
        dailyBotMessages: Math.max(0, Math.round(Number(data.dailyBotMessages) || 0)),
        barUserMessages: Math.max(0, Math.round(Number(data.barUserMessages) || 0)),
        barBotMessages: Math.max(0, Math.round(Number(data.barBotMessages) || 0)),
        dateUserMessages,
        dateBotMessages,
        lastDateDialogueGameMinute,
        dateInteractionLocations: [...new Set(list(data.dateInteractionLocations))],
        usedModelPaths: [...new Set([...defaults.usedModelPaths, ...list(data.usedModelPaths)])],
        smallTeacherStartsWithGanShenme: Math.max(0, Math.round(Number(data.smallTeacherStartsWithGanShenme) || 0)),
        headPatCount: Math.max(0, Math.round(Number(data.headPatCount) || 0)),
        maxDreamFurnitureRevisionCount: Math.max(0, Math.round(Number(data.maxDreamFurnitureRevisionCount) || 0)),
        sleepModeCount: Math.max(0, Math.round(Number(data.sleepModeCount) || 0)),
        danceWatchCount: Math.max(0, Math.round(Number(data.danceWatchCount) || 0)),
        bartendingChallengeWins: Math.max(0, Math.round(Number(data.bartendingChallengeWins) || 0))
    };
}

function normalizeGift(gift) {
    if (!gift || typeof gift !== 'object') return null;
    const detail = String(gift.detail || gift.description || '').trim();
    if (!detail) return null;
    const amount = Math.max(0, Math.round(Number(gift.amount ?? gift.price ?? 0) || 0));
    const score = Math.max(1, Math.min(5, Math.round(Number(gift.score ?? 3) || 3)));
    const comment = String(gift.comment || gift.review || '').trim();
    const gameDateTime = String(gift.gameDateTime || gift.date || '').trim();
    const createdAt = Number(gift.createdAt || Date.now());
    const id = String(gift.id || makeGiftId(detail, amount, gameDateTime, createdAt));
    return {
        id,
        gameDateTime,
        gameMinutes: Number(gift.gameMinutes || 0),
        detail,
        amount,
        comment,
        score,
        createdAt
    };
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        const gameMinutes = Number(data.gameMinutes);
        const money = Number(data.money);
        const gifts = Array.isArray(data.gifts) ? data.gifts.map(normalizeGift).filter(Boolean) : [];
        state = {
            gameMinutes: Number.isFinite(gameMinutes) ? Math.max(0, gameMinutes) : INITIAL_GAME_MINUTES,
            money: Number.isFinite(money) ? Math.max(0, Math.round(money)) : INITIAL_MONEY,
            affinity: Math.max(INITIAL_AFFINITY, parseAffinityValue(data.affinity, INITIAL_AFFINITY)),
            lastSalaryDay: Number.isFinite(Number(data.lastSalaryDay))
                ? Math.max(0, Math.floor(Number(data.lastSalaryDay)))
                : Math.floor((Number.isFinite(gameMinutes) ? gameMinutes : INITIAL_GAME_MINUTES) / DAY_MINUTES),
            gifts,
            stats: normalizeStats(data.stats, {
                gameMinutes: Number.isFinite(gameMinutes) ? Math.max(0, gameMinutes) : INITIAL_GAME_MINUTES
            })
        };
    } catch {}
}

function makeGiftId(detail, amount, gameDateTime, createdAt) {
    const source = `${detail}|${amount}|${gameDateTime}|${createdAt}`;
    let hash = 0;
    for (let i = 0; i < source.length; i++) {
        hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
    }
    return `gift_${Math.abs(hash)}_${createdAt}`;
}

function getCalendarFromMinutes(totalMinutes, step = 1) {
    const rounded = Math.floor(Math.max(0, totalMinutes) / step) * step;
    const dayIndex = Math.floor(rounded / DAY_MINUTES);
    const minuteOfDay = rounded % DAY_MINUTES;
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    const year = Math.floor(dayIndex / 365) + 1;
    let dayOfYear = dayIndex % 365;
    let month = 1;
    for (const days of MONTH_DAYS) {
        if (dayOfYear < days) break;
        dayOfYear -= days;
        month++;
    }
    const day = dayOfYear + 1;
    return { year, month, day, hour, minute, dayIndex, totalMinutes: rounded };
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function getDayPeriod(hour) {
    if (hour < 5) return '深夜';
    if (hour < 8) return '清晨';
    if (hour < 11) return '上午';
    if (hour < 14) return '中午';
    if (hour < 18) return '下午';
    if (hour < 22) return '晚上';
    return '夜间';
}

function getFestival(month, day) {
    const key = `${month}-${day}`;
    const map = {
        '1-1': '新年',
        '2-14': '情人节',
        '3-14': '白色情人节',
        '5-20': '520',
        '6-1': '儿童节',
        '10-1': '国庆节',
        '12-24': '平安夜',
        '12-25': '圣诞节'
    };
    return map[key] || '';
}

export function initGameState() {
    loadState();
    deriveStatsFromCurrentData();
    lastDisplayBucket = Math.floor(state.gameMinutes / getGameTimeSpeedSettings().displayStepMinutes);
    saveState();
}

export function updateGameTime(realDeltaSeconds) {
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds <= 0) {
        return { displayChanged: false, salary: 0 };
    }

    const timeSettings = getGameTimeSpeedSettings();
    state.gameMinutes += realDeltaSeconds * timeSettings.gameMinutesPerRealSecond;
    let salary = 0;
    const currentDay = Math.floor(state.gameMinutes / DAY_MINUTES);
    if (currentDay > state.lastSalaryDay) {
        const days = currentDay - state.lastSalaryDay;
        salary = days * DAILY_SALARY;
        state.money += salary;
        state.lastSalaryDay = currentDay;
    }

    const displayBucket = Math.floor(state.gameMinutes / timeSettings.displayStepMinutes);
    const displayChanged = displayBucket !== lastDisplayBucket;
    if (displayChanged) lastDisplayBucket = displayBucket;
    if (displayChanged || salary > 0) saveState();

    return { displayChanged, salary };
}

export function getGameTimeInfo(options = {}) {
    const step = options.quantize === 5 ? getGameTimeSpeedSettings().displayStepMinutes : 1;
    const info = getCalendarFromMinutes(state.gameMinutes, step);
    const festival = getFestival(info.month, info.day);
    return {
        ...info,
        period: getDayPeriod(info.hour),
        festival,
        text: `${info.month}月${info.day}日 ${pad2(info.hour)}:${pad2(info.minute)}`
    };
}

export function formatGameDateTime(options = {}) {
    const info = getGameTimeInfo(options);
    const yearPrefix = options.includeYear ? `第${info.year}年 ` : '';
    return `${yearPrefix}${info.month}月${info.day}日 ${pad2(info.hour)}:${pad2(info.minute)}`;
}

export function getGameTimeContext() {
    const info = getGameTimeInfo({ quantize: 1 });
    const festivalText = info.festival ? `，今天是${info.festival}` : '';
    return [
        `当前游戏内时间：第${info.year}年${info.month}月${info.day}日 ${pad2(info.hour)}:${pad2(info.minute)}，${info.period}${festivalText}。`,
        '你可以在合适时自然参考当前时间和日期，例如早安、晚安、用餐、休息、节日祝福等；不需要每次都生硬提及时间。'
    ].join('');
}

export function getMoney() {
    return state.money;
}

export function getAffinity() {
    return state.affinity;
}

export function formatMoney(amount = state.money) {
    return `${Math.round(amount).toLocaleString('zh-CN')} 数据金`;
}

export function addAffinity(amount) {
    const delta = Math.max(0, Math.round(Number(amount) || 0));
    if (delta <= 0) return { delta: 0, value: state.affinity };

    state.affinity += delta;
    saveState();

    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('fritia-affinity-updated', {
            detail: { delta, value: state.affinity }
        }));
    }

    return { delta, value: state.affinity };
}

export function getStats() {
    return {
        ...state.stats,
        dateInteractionLocations: [...state.stats.dateInteractionLocations],
        usedModelPaths: [...state.stats.usedModelPaths]
    };
}

export function getAllModelPaths() {
    return [...DEFAULT_MODELS];
}

export function recordGiftEstimate(amount) {
    const value = Math.max(0, Math.round(Number(amount) || 0));
    if (value > state.stats.maxGiftEstimate) {
        state.stats.maxGiftEstimate = value;
        saveState();
        dispatchStatsUpdated();
    }
}

export function recordDialogueInteraction(type, assistantText = '', locationId = '') {
    if (type === 'date') {
        state.stats.dateUserMessages += 1;
        state.stats.dateBotMessages += 1;
        state.stats.lastDateDialogueGameMinute = Math.max(0, Math.round(Number(state.gameMinutes) || 0));
        if (locationId && !state.stats.dateInteractionLocations.includes(locationId)) {
            state.stats.dateInteractionLocations.push(locationId);
        }
    } else if (type === 'bar') {
        state.stats.barUserMessages += 1;
        state.stats.barBotMessages += 1;
    } else {
        state.stats.dailyUserMessages += 1;
        state.stats.dailyBotMessages += 1;
    }

    const text = String(assistantText || '').trim();
    if (state.stats.smallTeacherStartsWithGanShenme <= 0 && text.startsWith('干什么')) {
        state.stats.smallTeacherStartsWithGanShenme = 1;
    }

    saveState();
    dispatchStatsUpdated();
}

export function recordModelUsed(path) {
    const value = String(path || '').trim();
    if (!value || state.stats.usedModelPaths.includes(value)) return;
    state.stats.usedModelPaths.push(value);
    saveState();
    dispatchStatsUpdated();
}

export function recordHeadPat() {
    state.stats.headPatCount += 1;
    saveState();
    dispatchStatsUpdated();
}

export function recordDreamFurnitureRevision(count) {
    const value = Math.max(0, Math.round(Number(count) || 0));
    if (value <= state.stats.maxDreamFurnitureRevisionCount) return;
    state.stats.maxDreamFurnitureRevisionCount = value;
    saveState();
    dispatchStatsUpdated();
}

export function recordSleepModeEntered() {
    state.stats.sleepModeCount += 1;
    saveState();
    dispatchStatsUpdated();
}

export function recordDanceWatched() {
    state.stats.danceWatchCount += 1;
    state.affinity += 3;
    saveState();
    dispatchStatsUpdated();
    document.dispatchEvent(new CustomEvent('fritia-affinity-updated', {
        detail: { delta: 3, value: state.affinity }
    }));
}

export function recordBartendingChallengeWin() {
    state.stats.bartendingChallengeWins += 1;
    saveState();
    dispatchStatsUpdated();
}

export function getBarAdmissionProgress() {
    const stats = getStats();
    const dailyDialogues = Math.max(0, Math.min(stats.dailyUserMessages || 0, stats.dailyBotMessages || 0));
    const dateDialogues = Math.max(0, Math.min(stats.dateUserMessages || 0, stats.dateBotMessages || 0));
    const dreamFurnitureCount = readDreamFurnitureSnapshot().length;
    const tasks = [
        {
            id: 'daily_dialogue',
            label: '日常对话',
            value: Math.min(dailyDialogues, 3),
            target: 3
        },
        {
            id: 'date',
            label: '约会',
            value: Math.min(dateDialogues, 1),
            target: 1
        },
        {
            id: 'sleep',
            label: '睡觉模式',
            value: Math.min(stats.sleepModeCount || 0, 1),
            target: 1
        },
        {
            id: 'gift',
            label: '送出礼物',
            value: Math.min(state.gifts.length, 1),
            target: 1
        },
        {
            id: 'dream_furniture',
            label: '造梦家具',
            value: Math.min(dreamFurnitureCount, 1),
            target: 1
        }
    ].map(task => ({
        ...task,
        complete: task.value >= task.target
    }));
    return {
        tasks,
        completed: tasks.filter(task => task.complete).length,
        total: tasks.length,
        complete: tasks.every(task => task.complete)
    };
}

function dispatchStatsUpdated() {
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('fritia-game-state-updated'));
    }
}

export function canAfford(amount) {
    return state.money >= Math.max(0, Math.round(amount));
}

export function spendMoney(amount) {
    const value = Math.max(0, Math.round(amount));
    if (state.money < value) return false;
    if (value <= 0) return true;
    state.money -= value;
    state.stats.moneySpent += value;
    state.stats.lastMoneySpentGameMinute = Math.max(0, Math.round(Number(state.gameMinutes) || 0));
    saveState();
    dispatchStatsUpdated();
    return true;
}

export function addMoney(amount, reason = '') {
    const value = Math.max(0, Math.round(amount));
    if (value <= 0) return false;
    state.money += value;
    saveState();
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('fritia-game-state-updated', {
            detail: { moneyDelta: value, reason }
        }));
    }
    return true;
}

export function addGift(gift) {
    const normalized = normalizeGift(gift);
    if (!normalized) return null;
    if (!state.gifts.some(item => getGiftKey(item) === getGiftKey(normalized))) {
        state.gifts.push(normalized);
        state.gifts.sort((a, b) => (b.gameMinutes || b.createdAt) - (a.gameMinutes || a.createdAt));
        if (normalized.score >= 5) {
            state.stats.fiveStarGiftCount += 1;
        }
        saveState();
        dispatchStatsUpdated();
    }
    return normalized;
}

function getGiftKey(gift) {
    if (gift.id) return `id:${gift.id}`;
    return `gift:${gift.gameDateTime}|${gift.detail}|${gift.amount}|${gift.score}`;
}

export function getGifts() {
    return [...state.gifts];
}

export function mergeGifts(gifts) {
    if (!Array.isArray(gifts)) return 0;
    const existing = new Set(state.gifts.map(getGiftKey));
    let added = 0;
    for (const gift of gifts) {
        const normalized = normalizeGift(gift);
        if (!normalized) continue;
        const key = getGiftKey(normalized);
        if (existing.has(key)) continue;
        state.gifts.push(normalized);
        existing.add(key);
        added++;
    }
    if (added > 0) {
        state.gifts.sort((a, b) => (b.gameMinutes || b.createdAt) - (a.gameMinutes || a.createdAt));
        saveState();
    }
    return added;
}

export function exportGameState() {
    const time = getGameTimeInfo({ quantize: 1 });
    return {
        version: 2,
        gameMinutes: state.gameMinutes,
        lastSalaryDay: state.lastSalaryDay,
        gameTime: {
            ...time,
            formatted: formatGameDateTime({ includeYear: true })
        },
        money: {
            currency: '数据金',
            amount: state.money
        },
        affinity: {
            value: state.affinity
        },
        stats: getStats(),
        dreamFurniture: readDreamFurnitureSnapshot(),
        gifts: getGifts()
    };
}

export function importGameState(data, options = {}) {
    if (!data || typeof data !== 'object') return { giftsAdded: 0 };

    const source = data.gameState && typeof data.gameState === 'object' ? data.gameState : data;
    const minutes = Number(source.gameMinutes ?? source.gameTime?.totalMinutes);
    if (Number.isFinite(minutes)) {
        state.gameMinutes = Math.max(0, minutes);
        lastDisplayBucket = Math.floor(state.gameMinutes / getGameTimeSpeedSettings().displayStepMinutes);
    }

    const moneyAmount = Number(source.money?.amount ?? source.money);
    if (Number.isFinite(moneyAmount)) {
        state.money = Math.max(0, Math.round(moneyAmount));
    }

    const importedAffinity = maxFinite([
        parseAffinityValue(source.affinity, NaN),
        parseAffinityValue(data.affinity, NaN)
    ]);
    if (Number.isFinite(importedAffinity)) {
        state.affinity = Math.max(state.affinity, importedAffinity);
    }

    const importedSalaryDay = Number(source.lastSalaryDay);
    state.lastSalaryDay = Number.isFinite(importedSalaryDay)
        ? Math.max(0, Math.floor(importedSalaryDay))
        : Math.floor(state.gameMinutes / DAY_MINUTES);

    const gifts = Array.isArray(source.gifts)
        ? source.gifts
        : (Array.isArray(data.gifts) ? data.gifts : []);
    const giftsAdded = mergeGifts(gifts);
    state.stats = mergeStats(state.stats, normalizeStats(source.stats || data.stats, {
        gameMinutes: state.gameMinutes
    }));
    deriveStatsFromCurrentData();
    saveState();
    if (!options.suppressEvent) {
        dispatchStatsUpdated();
    }
    return { giftsAdded };
}

function mergeStats(current, imported) {
    return {
        moneySpent: Math.max(current.moneySpent, imported.moneySpent),
        lastMoneySpentGameMinute: Math.max(current.lastMoneySpentGameMinute || 0, imported.lastMoneySpentGameMinute || 0),
        fiveStarGiftCount: Math.max(current.fiveStarGiftCount, imported.fiveStarGiftCount),
        maxGiftEstimate: Math.max(current.maxGiftEstimate, imported.maxGiftEstimate),
        dailyUserMessages: Math.max(current.dailyUserMessages, imported.dailyUserMessages),
        dailyBotMessages: Math.max(current.dailyBotMessages, imported.dailyBotMessages),
        barUserMessages: Math.max(current.barUserMessages, imported.barUserMessages),
        barBotMessages: Math.max(current.barBotMessages, imported.barBotMessages),
        dateUserMessages: Math.max(current.dateUserMessages, imported.dateUserMessages),
        dateBotMessages: Math.max(current.dateBotMessages, imported.dateBotMessages),
        lastDateDialogueGameMinute: Math.max(current.lastDateDialogueGameMinute || 0, imported.lastDateDialogueGameMinute || 0),
        dateInteractionLocations: [...new Set([...current.dateInteractionLocations, ...imported.dateInteractionLocations])],
        usedModelPaths: [...new Set([...current.usedModelPaths, ...imported.usedModelPaths])],
        smallTeacherStartsWithGanShenme: Math.max(current.smallTeacherStartsWithGanShenme, imported.smallTeacherStartsWithGanShenme),
        headPatCount: Math.max(current.headPatCount, imported.headPatCount),
        maxDreamFurnitureRevisionCount: Math.max(current.maxDreamFurnitureRevisionCount, imported.maxDreamFurnitureRevisionCount),
        sleepModeCount: Math.max(current.sleepModeCount || 0, imported.sleepModeCount || 0),
        danceWatchCount: Math.max(current.danceWatchCount || 0, imported.danceWatchCount || 0),
        bartendingChallengeWins: Math.max(current.bartendingChallengeWins || 0, imported.bartendingChallengeWins || 0)
    };
}

function deriveStatsFromCurrentData() {
    state.stats.usedModelPaths = [...new Set([...state.stats.usedModelPaths, DEFAULT_MODELS[0]])];
    const fiveStarCount = state.gifts.filter(gift => Number(gift.score) >= 5).length;
    state.stats.fiveStarGiftCount = Math.max(state.stats.fiveStarGiftCount, fiveStarCount);
    deriveDialogueStatsFromLocalHistory();
    state.stats.lastMoneySpentGameMinute = Math.max(0, Math.round(Number(state.stats.lastMoneySpentGameMinute) || 0));
    state.stats.lastDateDialogueGameMinute = Math.max(0, Math.round(Number(state.stats.lastDateDialogueGameMinute) || 0));
    state.stats.sleepModeCount = Math.max(0, Math.round(Number(state.stats.sleepModeCount) || 0));
    state.stats.danceWatchCount = Math.max(0, Math.round(Number(state.stats.danceWatchCount) || 0));
    state.stats.bartendingChallengeWins = Math.max(0, Math.round(Number(state.stats.bartendingChallengeWins) || 0));
}

function deriveDialogueStatsFromLocalHistory() {
    if (typeof localStorage === 'undefined') return;
    try {
        const messages = JSON.parse(localStorage.getItem('fritia_chat_history') || '[]');
        if (Array.isArray(messages)) {
            const daily = countDialogueMessages(messages.filter(msg => (msg?.scene || 'daily') !== 'bar'));
            const bar = countDialogueMessages(messages.filter(msg => (msg?.scene || 'daily') === 'bar'));
            state.stats.dailyUserMessages = Math.max(state.stats.dailyUserMessages, daily.user);
            state.stats.dailyBotMessages = Math.max(state.stats.dailyBotMessages, daily.bot);
            state.stats.barUserMessages = Math.max(state.stats.barUserMessages, bar.user);
            state.stats.barBotMessages = Math.max(state.stats.barBotMessages, bar.bot);
            if (state.stats.smallTeacherStartsWithGanShenme <= 0 && messages.some(msg => msg?.role === 'assistant' && String(msg.content || '').trim().startsWith('干什么'))) {
                state.stats.smallTeacherStartsWithGanShenme = 1;
            }
        }
    } catch {}

    try {
        const history = JSON.parse(localStorage.getItem('fritia_date_history') || '{}');
        if (!history || typeof history !== 'object' || Array.isArray(history)) return;
        let user = 0;
        let bot = 0;
        const locations = new Set(state.stats.dateInteractionLocations);
        Object.entries(history).forEach(([key, value]) => {
            if (key.endsWith('_archive')) return;
            const messages = Array.isArray(value) ? [...value] : [];
            const archives = history[`${key}_archive`];
            if (Array.isArray(archives)) {
                archives.forEach(archive => {
                    if (Array.isArray(archive?.messages)) messages.push(...archive.messages);
                });
            }
            const counts = countDialogueMessages(messages);
            user += counts.user;
            bot += counts.bot;
            if (counts.user > 0 && counts.bot > 0) locations.add(key);
        });
        state.stats.dateUserMessages = Math.max(state.stats.dateUserMessages, user);
        state.stats.dateBotMessages = Math.max(state.stats.dateBotMessages, bot);
        state.stats.dateInteractionLocations = [...locations];
    } catch {}
}

function countDialogueMessages(messages) {
    return (Array.isArray(messages) ? messages : []).reduce((acc, msg) => {
        if (msg?.role === 'user') acc.user += 1;
        if (msg?.role === 'assistant') acc.bot += 1;
        return acc;
    }, { user: 0, bot: 0 });
}

function readDreamFurnitureSnapshot() {
    try {
        const data = JSON.parse(localStorage.getItem('fritia_dream_furniture') || '[]');
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function parseAffinityValue(value, fallback) {
    const raw = value && typeof value === 'object'
        ? value.value ?? value.amount ?? value.affinity
        : value;
    const parsed = Number(raw);
    return Number.isFinite(parsed)
        ? Math.max(0, Math.round(parsed))
        : fallback;
}

function maxFinite(values) {
    const finiteValues = values.filter(Number.isFinite);
    return finiteValues.length > 0 ? Math.max(...finiteValues) : NaN;
}
