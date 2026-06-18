import {
    getAffinity,
    getAllModelPaths,
    getGameTimeInfo,
    getGifts,
    getMoney,
    getStats
} from './game_state.js';
import { getConversationHistory } from './dialogue.js';
import { getDateConversationHistory, getDateLocations } from './date_dialogue.js';

const STORAGE_KEY = 'fritia_achievements';

const ACHIEVEMENTS = [
    {
        id: 'fall_in_love',
        title: '坠入爱河',
        desc: '好感度达到 100。',
        icon: 'src/_logos/ach_love_hearts.svg',
        target: 100,
        progress: () => Math.min(getAffinity(), 100),
        complete: () => getAffinity() >= 100
    },
    {
        id: 'love_bond',
        title: '以恋结缘',
        desc: '好感度达到 200。',
        icon: 'src/_logos/ach_heart_ribbon.svg',
        target: 200,
        progress: () => Math.min(getAffinity(), 200),
        complete: () => getAffinity() >= 200
    },
    {
        id: 'ten_lives',
        title: '十世眷侣',
        desc: '好感度达到 300。',
        icon: 'src/_logos/ach_revolving_hearts.svg',
        target: 300,
        progress: () => Math.min(getAffinity(), 300),
        complete: () => getAffinity() >= 300
    },
    {
        id: 'five_star_once',
        title: '五星好评',
        desc: '获得一次五颗心礼物评价。',
        icon: 'src/_logos/ach_star.svg',
        target: 1,
        progress: () => Math.min(getStats().fiveStarGiftCount, 1),
        complete: () => getStats().fiveStarGiftCount >= 1
    },
    {
        id: 'heart_sync',
        title: '心有灵犀',
        desc: '获得十次五颗心礼物评价。',
        icon: 'src/_logos/ach_sparkling_heart.svg',
        target: 10,
        progress: () => Math.min(getStats().fiveStarGiftCount, 10),
        complete: () => getStats().fiveStarGiftCount >= 10
    },
    {
        id: 'household_master',
        title: '持家高手',
        desc: '数据金余额达到 80000。',
        icon: 'src/_logos/ach_money_bag.svg',
        target: 80000,
        progress: () => Math.min(getMoney(), 80000),
        complete: () => getMoney() >= 80000
    },
    {
        id: 'despair_temperature',
        title: '绝望温度',
        desc: '数据金余额低于或等于 500。',
        icon: 'src/_logos/ach_cold_face.svg',
        target: 1,
        progress: () => getMoney() <= 500 ? 1 : 0,
        complete: () => getMoney() <= 500
    },
    {
        id: 'endless_talk',
        title: '无话不谈',
        desc: '与芙提雅累计对话次数超过 100 次。',
        icon: 'src/_logos/ach_speech.svg',
        target: 100,
        progress: () => Math.min(getConversationProgress(), 100),
        complete: () => getConversationProgress() >= 100
    },
    {
        id: 'all_dates',
        title: '比翼双飞',
        desc: '在全部 12 个约会场景中完成与芙提雅的互动。',
        icon: 'src/_logos/ach_couple_heart.svg',
        target: 12,
        progress: () => Math.min(getCompletedDateLocationCount(), 12),
        complete: () => getCompletedDateLocationCount() >= 12
    },
    {
        id: 'dress_doll',
        title: '更衣人偶',
        desc: '使用过芙提雅的全部皮肤模型。',
        icon: 'src/_logos/ach_dress.svg',
        target: () => getAllModelPaths().length,
        progress: () => getUsedModelCount(),
        complete: () => getUsedModelCount() >= getAllModelPaths().length
    },
    {
        id: 'what_are_you_doing',
        title: '干什么！',
        desc: '芙提雅的回复以“干什么”开头。',
        icon: 'src/_logos/ach_angry.svg',
        target: 1,
        progress: () => Math.min(getStats().smallTeacherStartsWithGanShenme, 1),
        complete: () => getStats().smallTeacherStartsWithGanShenme >= 1
    },
    {
        id: 'no_spending_10_days',
        title: '一毛不拔',
        desc: '游戏时间的前 10 天里未花费任何数据金。',
        hidden: true,
        icon: 'src/_logos/ach_no_entry.svg',
        target: 1,
        progress: () => getFirstTenDaysPassed() && getStats().moneySpent <= 0 ? 1 : 0,
        complete: () => getFirstTenDaysPassed() && getStats().moneySpent <= 0
    },
    {
        id: 'homebody_10_days',
        title: '资深宅友',
        desc: '游戏时间的前 10 天里未在约会模式进行任何对话。',
        hidden: true,
        icon: 'src/_logos/ach_house.svg',
        target: 1,
        progress: () => getFirstTenDaysPassed() && getStats().dateUserMessages <= 0 && getStats().dateBotMessages <= 0 ? 1 : 0,
        complete: () => getFirstTenDaysPassed() && getStats().dateUserMessages <= 0 && getStats().dateBotMessages <= 0
    },
    {
        id: 'luxury_custom',
        title: '高奢定制',
        desc: '礼物估价金额达到 999999 数据金。',
        hidden: true,
        icon: 'src/_logos/ach_gem.svg',
        target: 999999,
        progress: () => Math.min(getStats().maxGiftEstimate, 999999),
        complete: () => getStats().maxGiftEstimate >= 999999
    },
    {
        id: 'pink_head_pat',
        title: '薅秃粉毛',
        desc: '睡觉模式下累计摸头 30 次。',
        hidden: true,
        icon: 'src/_logos/ach_hand.svg',
        target: 30,
        progress: () => Math.min(getStats().headPatCount, 30),
        complete: () => getStats().headPatCount >= 30
    }
];

let achievementState = {
    unlocked: {},
    notified: {},
    pendingStartup: []
};

let els = {};
let suppressEvaluationToasts = false;

export function initAchievements() {
    achievementState = loadAchievementState();
    els.panel = document.getElementById('achievements-panel');
    els.list = document.getElementById('achievement-list');
    els.summary = document.getElementById('achievement-summary');
    els.close = document.getElementById('achievements-close');
    els.toastHost = document.getElementById('achievement-toast-host');
    els.button = document.getElementById('btn-achievements');

    els.button?.addEventListener('click', openAchievementsPanel);
    els.close?.addEventListener('click', closeAchievementsPanel);

    evaluateAchievements({ notify: false, queueStartup: true });
    renderAchievementList();
}

export function openAchievementsPanel() {
    evaluateAchievements({ notify: false });
    renderAchievementList();
    els.panel?.classList.remove('hidden');
}

export function closeAchievementsPanel() {
    els.panel?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'achievements-panel' } }));
}

export function isAchievementsPanelVisible() {
    return els.panel && !els.panel.classList.contains('hidden');
}

export function evaluateAchievements(options = {}) {
    const notify = options.notify !== false;
    const queueStartup = options.queueStartup === true;
    const suppressToast = options.suppressToast === true || suppressEvaluationToasts;
    const newlyUnlocked = [];

    for (const achievement of ACHIEVEMENTS) {
        if (achievementState.unlocked[achievement.id]) continue;
        if (!achievement.complete()) continue;

        achievementState.unlocked[achievement.id] = Date.now();
        newlyUnlocked.push(achievement);
    }

    if (newlyUnlocked.length > 0) {
        saveAchievementState();
        if (queueStartup) {
            achievementState.pendingStartup.push(...newlyUnlocked.map(item => item.id));
        } else if (notify && !suppressToast) {
            newlyUnlocked.forEach(showAchievementToastOnce);
        }
    }

    if (!queueStartup) renderAchievementList();
    return newlyUnlocked;
}

export function flushStartupAchievementToasts() {
    if (!achievementState.pendingStartup.length) return;
    const ids = [...achievementState.pendingStartup];
    achievementState.pendingStartup = [];
    ids.forEach(id => {
        const achievement = ACHIEVEMENTS.find(item => item.id === id);
        if (achievement) showAchievementToastOnce(achievement);
    });
}

export function refreshAchievementsFromImport() {
    suppressEvaluationToasts = true;
    try {
        evaluateAchievements({ notify: false, suppressToast: true });
        renderAchievementList();
    } finally {
        suppressEvaluationToasts = false;
    }
}

export function exportAchievements() {
    return {
        unlocked: { ...achievementState.unlocked },
        notified: { ...achievementState.notified }
    };
}

export function importAchievements(data) {
    if (!data || typeof data !== 'object') return;
    achievementState.unlocked = mergeTimestampMaps(achievementState.unlocked, data.unlocked || {});
    achievementState.notified = mergeTimestampMaps(achievementState.notified, data.notified || {});
    saveAchievementState();
}

function mergeTimestampMaps(current, imported) {
    const result = { ...current };
    for (const [key, value] of Object.entries(imported || {})) {
        const importedTime = Number(value) || Date.now();
        const currentTime = Number(result[key]) || 0;
        result[key] = currentTime > 0 ? Math.min(currentTime, importedTime) : importedTime;
    }
    return result;
}

function showAchievementToastOnce(achievement) {
    if (!achievement || achievementState.notified[achievement.id]) return;
    achievementState.notified[achievement.id] = Date.now();
    saveAchievementState();
    showAchievementToast(achievement);
}

function showAchievementToast(achievement) {
    if (!els.toastHost) return;

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML = `
        <div class="achievement-toast-icon">
            <img src="${escapeHtml(achievement.icon || 'src/_logos/achievement_trophy.svg')}" alt="">
        </div>
        <div>
            <div class="achievement-toast-kicker">成就解锁</div>
            <div class="achievement-toast-title">${escapeHtml(achievement.title)}</div>
        </div>
    `;
    els.toastHost.appendChild(toast);
    setTimeout(() => toast.remove(), 4600);
}

function renderAchievementList() {
    if (!els.list) return;
    const completed = ACHIEVEMENTS.filter(item => achievementState.unlocked[item.id]).length;
    els.summary.textContent = `${completed}/${ACHIEVEMENTS.length}`;
    els.list.innerHTML = '';

    for (const achievement of ACHIEVEMENTS) {
        const unlocked = Boolean(achievementState.unlocked[achievement.id]);
        const hiddenLocked = achievement.hidden && !unlocked;
        const card = document.createElement('div');
        card.className = [
            'achievement-card',
            unlocked ? 'unlocked' : 'locked',
            achievement.hidden ? 'secret' : '',
            hiddenLocked ? 'secret-placeholder' : ''
        ].filter(Boolean).join(' ');

        const icon = getAchievementIcon(achievement, unlocked, hiddenLocked);
        const title = hiddenLocked ? '隐藏成就' : achievement.title;
        const desc = hiddenLocked ? '达成后揭示。' : achievement.desc;
        const progress = hiddenLocked ? '' : renderProgress(achievement, unlocked);

        card.innerHTML = `
            <div class="achievement-card-icon">
                <span>${icon.emoji}</span>
                <img src="${icon.src}" alt="">
            </div>
            <div class="achievement-card-body">
                <div class="achievement-card-title">${escapeHtml(title)}</div>
                <div class="achievement-card-desc">${escapeHtml(desc)}</div>
                ${progress}
            </div>
        `;
        els.list.appendChild(card);
    }
}

function renderProgress(achievement, unlocked) {
    const target = getTargetValue(achievement);
    const value = Math.min(getProgressValue(achievement), target);
    const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
    const text = unlocked ? `${target}/${target}` : `${value}/${target}`;
    return `
        <div class="achievement-progress">
            <span>${text}</span>
            <div class="achievement-progress-track">
                <div class="achievement-progress-fill" style="width:${pct}%"></div>
            </div>
        </div>
    `;
}

function getAchievementIcon(achievement, unlocked, hiddenLocked) {
    if (hiddenLocked) return { emoji: '🔒', src: 'src/_logos/achievement_lock.svg' };
    if (achievement.hidden && unlocked) return { emoji: '🔓', src: achievement.icon };
    return { emoji: '', src: achievement.icon };
}

function getTargetValue(achievement) {
    const target = typeof achievement.target === 'function' ? achievement.target() : achievement.target;
    return Math.max(1, Math.round(Number(target) || 1));
}

function getProgressValue(achievement) {
    return Math.max(0, Math.round(Number(achievement.progress()) || 0));
}

function getConversationProgress() {
    const stats = getStats();
    const statUser = stats.dailyUserMessages + stats.dateUserMessages;
    const statBot = stats.dailyBotMessages + stats.dateBotMessages;
    const historyUser = getConversationHistory().filter(msg => msg.role === 'user').length;
    const historyBot = getConversationHistory().filter(msg => msg.role === 'assistant').length;
    const dateHistory = getDateConversationHistory();
    let dateUser = 0;
    let dateBot = 0;
    Object.values(dateHistory).forEach(messages => {
        if (!Array.isArray(messages)) return;
        messages.forEach(msg => {
            if (msg.role === 'user') dateUser++;
            if (msg.role === 'assistant') dateBot++;
        });
    });
    return Math.min(Math.max(statUser, historyUser + dateUser), Math.max(statBot, historyBot + dateBot));
}

function getCompletedDateLocationCount() {
    const stats = getStats();
    const completed = new Set(stats.dateInteractionLocations);
    const dateHistory = getDateConversationHistory();
    getDateLocations().forEach(loc => {
        const messages = Array.isArray(dateHistory[loc.id]) ? dateHistory[loc.id] : [];
        const hasUser = messages.some(msg => msg.role === 'user');
        const hasBot = messages.some(msg => msg.role === 'assistant');
        if (hasUser && hasBot) completed.add(loc.id);
    });
    return completed.size;
}

function getUsedModelCount() {
    const all = getAllModelPaths();
    const used = new Set(getStats().usedModelPaths);
    return all.filter(path => used.has(path)).length;
}

function getFirstTenDaysPassed() {
    return getGameTimeInfo({ quantize: 1 }).dayIndex >= 10;
}

function loadAchievementState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                unlocked: parsed.unlocked && typeof parsed.unlocked === 'object' ? parsed.unlocked : {},
                notified: parsed.notified && typeof parsed.notified === 'object' ? parsed.notified : {},
                pendingStartup: []
            };
        }
    } catch {}
    return { unlocked: {}, notified: {}, pendingStartup: [] };
}

function saveAchievementState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            unlocked: achievementState.unlocked,
            notified: achievementState.notified
        }));
    } catch {}
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}
