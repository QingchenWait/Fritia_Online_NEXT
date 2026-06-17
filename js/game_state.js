const STORAGE_KEY = 'fritia_game_state';
const INITIAL_GAME_MINUTES = 12 * 60;
const GAME_MINUTES_PER_REAL_SECOND = 5;
const DISPLAY_STEP_MINUTES = 5;
const DAY_MINUTES = 24 * 60;
const DAILY_SALARY = 4000;
const INITIAL_MONEY = 40000;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

let state = {
    gameMinutes: INITIAL_GAME_MINUTES,
    money: INITIAL_MONEY,
    lastSalaryDay: 0,
    gifts: []
};

let lastDisplayBucket = Math.floor(INITIAL_GAME_MINUTES / DISPLAY_STEP_MINUTES);

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
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
            lastSalaryDay: Number.isFinite(Number(data.lastSalaryDay))
                ? Math.max(0, Math.floor(Number(data.lastSalaryDay)))
                : Math.floor((Number.isFinite(gameMinutes) ? gameMinutes : INITIAL_GAME_MINUTES) / DAY_MINUTES),
            gifts
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
    lastDisplayBucket = Math.floor(state.gameMinutes / DISPLAY_STEP_MINUTES);
    saveState();
}

export function updateGameTime(realDeltaSeconds) {
    if (!Number.isFinite(realDeltaSeconds) || realDeltaSeconds <= 0) {
        return { displayChanged: false, salary: 0 };
    }

    state.gameMinutes += realDeltaSeconds * GAME_MINUTES_PER_REAL_SECOND;
    let salary = 0;
    const currentDay = Math.floor(state.gameMinutes / DAY_MINUTES);
    if (currentDay > state.lastSalaryDay) {
        const days = currentDay - state.lastSalaryDay;
        salary = days * DAILY_SALARY;
        state.money += salary;
        state.lastSalaryDay = currentDay;
    }

    const displayBucket = Math.floor(state.gameMinutes / DISPLAY_STEP_MINUTES);
    const displayChanged = displayBucket !== lastDisplayBucket;
    if (displayChanged) lastDisplayBucket = displayBucket;
    if (displayChanged || salary > 0) saveState();

    return { displayChanged, salary };
}

export function getGameTimeInfo(options = {}) {
    const step = options.quantize === 5 ? DISPLAY_STEP_MINUTES : 1;
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

export function formatMoney(amount = state.money) {
    return `${Math.round(amount).toLocaleString('zh-CN')} 数据金`;
}

export function canAfford(amount) {
    return state.money >= Math.max(0, Math.round(amount));
}

export function spendMoney(amount) {
    const value = Math.max(0, Math.round(amount));
    if (state.money < value) return false;
    state.money -= value;
    saveState();
    return true;
}

export function addGift(gift) {
    const normalized = normalizeGift(gift);
    if (!normalized) return null;
    if (!state.gifts.some(item => getGiftKey(item) === getGiftKey(normalized))) {
        state.gifts.push(normalized);
        state.gifts.sort((a, b) => (b.gameMinutes || b.createdAt) - (a.gameMinutes || a.createdAt));
        saveState();
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
        version: 1,
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
        gifts: getGifts()
    };
}

export function importGameState(data) {
    if (!data || typeof data !== 'object') return { giftsAdded: 0 };

    const source = data.gameState && typeof data.gameState === 'object' ? data.gameState : data;
    const minutes = Number(source.gameMinutes ?? source.gameTime?.totalMinutes);
    if (Number.isFinite(minutes)) {
        state.gameMinutes = Math.max(0, minutes);
        lastDisplayBucket = Math.floor(state.gameMinutes / DISPLAY_STEP_MINUTES);
    }

    const moneyAmount = Number(source.money?.amount ?? source.money);
    if (Number.isFinite(moneyAmount)) {
        state.money = Math.max(0, Math.round(moneyAmount));
    }

    const importedSalaryDay = Number(source.lastSalaryDay);
    state.lastSalaryDay = Number.isFinite(importedSalaryDay)
        ? Math.max(0, Math.floor(importedSalaryDay))
        : Math.floor(state.gameMinutes / DAY_MINUTES);

    const gifts = Array.isArray(source.gifts)
        ? source.gifts
        : (Array.isArray(data.gifts) ? data.gifts : []);
    const giftsAdded = mergeGifts(gifts);
    saveState();
    return { giftsAdded };
}
