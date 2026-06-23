import { buildSideScrollerCardBatch, SIDE_CARD_CATEGORY_LABELS, SIDE_CARD_RARITY_LABELS } from './side_scroller_cards_llm.js?v=20260623-side-combat';
import { getAffinity } from './game_state.js';

const EVENT_DISTANCE = 560;
const ENCOUNTER_APPROACH_DISTANCE = 240;
const MIN_PLAYER_MAX_HP = 1;
const HAND_SIZE = 4;
const PLAYER_CARD_LIMIT = 3;
const DIFFICULTIES = [
    { id: 'standard', label: '标准', detail: '5 关卡 + 1 BOSS', normalEvents: 5, bossEvents: 1 },
    { id: 'hard', label: '困难', detail: '7 关卡 + 1 BOSS', normalEvents: 7, bossEvents: 1 },
    { id: 'legend', label: '传说', detail: '8 关卡 + 2 BOSS', normalEvents: 8, bossEvents: 2, fixedBosses: true }
];

const ENEMY_NAMES = ['霜蚀兵', '冰壳体', '低温兽', '白噪无人机', '冻潮守卫'];
const BOSS_NAME = '极寒炉心';
const MINI_BOSS_NAME = '霜核督战体';

const state = {
    panel: null,
    root: null,
    els: {},
    visible: false,
    phase: 'intro',
    styleText: '',
    difficultyIndex: 0,
    approvalState: 'idle',
    events: [],
    eventIndex: 0,
    nextEventAt: EVENT_DISTANCE,
    forwardDistance: 0,
    encounterProgress: 0,
    pendingEvent: null,
    player: createPlayer(),
    enemies: [],
    hand: [],
    deck: [],
    refreshCount: 0,
    guardUses: 3,
    executeUses: 3,
    playsUsed: 0,
    selectedCardId: '',
    pendingSkill: '',
    dragState: null,
    statusPopover: null,
    deckPopoverOpen: false,
    busy: false,
    preloading: false,
    preloadedBatch: null,
    preloadToken: 0,
    log: [],
    getFacing: () => 1,
    getFireScreenPosition: null,
    getFritiaHitbox: null,
    triggerFireAttack: null
};

export function initSideScrollerCombat(options = {}) {
    state.panel = options.panel || document.getElementById('side-scroller-adventure');
    state.getFacing = typeof options.getFacing === 'function' ? options.getFacing : state.getFacing;
    state.getFireScreenPosition = typeof options.getFireScreenPosition === 'function' ? options.getFireScreenPosition : null;
    state.getFritiaHitbox = typeof options.getFritiaHitbox === 'function' ? options.getFritiaHitbox : null;
    state.triggerFireAttack = typeof options.triggerFireAttack === 'function' ? options.triggerFireAttack : null;
    if (!state.panel) return;
    ensureDom();
    bindEvents();
    renderCombat();
}

export function openSideScrollerCombat() {
    resetCombatState();
    state.visible = true;
    state.root?.classList.remove('hidden');
    renderCombat();
}

export function closeSideScrollerCombat() {
    state.visible = false;
    state.root?.classList.add('hidden');
    state.selectedCardId = '';
    state.pendingSkill = '';
    clearDragState();
    closeStatusPopover();
    closeDeckPopover();
}

export function updateSideScrollerCombat(delta) {
    if (!state.visible) return;
    const dt = Math.max(0, Math.min(0.08, Number(delta) || 0));
    updateEffectTimers(dt);
}

export function isSideScrollerCombatMovementBlocked() {
    return state.visible && !['walk', 'encounter'].includes(state.phase);
}

export function advanceSideScrollerCombatDistance(distance) {
    if (!state.visible || !['walk', 'encounter'].includes(state.phase)) return;
    const step = Number(distance) || 0;
    if (step === 0) return;
    if (state.phase === 'encounter') {
        advanceEncounterApproach(step);
        return;
    }
    state.forwardDistance += step;
    if (state.forwardDistance >= state.nextEventAt) {
        void triggerNextEvent();
    } else {
        renderProgressOnly();
    }
}

function resetCombatState() {
    state.phase = 'intro';
    state.styleText = '';
    state.difficultyIndex = 0;
    state.approvalState = 'idle';
    state.events = [];
    state.eventIndex = 0;
    state.nextEventAt = EVENT_DISTANCE;
    state.forwardDistance = 0;
    state.encounterProgress = 0;
    state.pendingEvent = null;
    state.player = createPlayer();
    state.enemies = [];
    state.hand = [];
    state.deck = [];
    state.refreshCount = 0;
    state.guardUses = 3;
    state.executeUses = 3;
    state.playsUsed = 0;
    state.selectedCardId = '';
    state.pendingSkill = '';
    state.dragState = null;
    state.statusPopover = null;
    state.deckPopoverOpen = false;
    state.busy = false;
    state.preloading = false;
    state.preloadedBatch = null;
    state.preloadToken += 1;
    state.log = ['输入战斗风格后，向右前进会触发雪原事件。'];
}

function createPlayer() {
    const maxHp = Math.max(MIN_PLAYER_MAX_HP, Math.round(Number(getAffinity?.() || 0) || MIN_PLAYER_MAX_HP));
    return {
        hp: maxHp,
        maxHp,
        armor: 0,
        statuses: []
    };
}

function changeDifficulty(direction) {
    if (state.phase !== 'intro' || state.busy) return;
    const total = DIFFICULTIES.length;
    state.difficultyIndex = (state.difficultyIndex + direction + total) % total;
    renderDifficulty();
}

function currentDifficulty() {
    return DIFFICULTIES[state.difficultyIndex] || DIFFICULTIES[0];
}

function currentEventCount() {
    return state.events.length || (currentDifficulty().normalEvents + currentDifficulty().bossEvents);
}

function isBossEvent(event) {
    return event?.kind === 'boss' || event?.kind === 'miniBoss';
}

function ensureDom() {
    if (state.root) return;
    const root = document.createElement('div');
    root.id = 'side-scroller-combat';
    root.className = 'side-combat hidden';
    root.innerHTML = `
        <div class="side-combat-statusbar" aria-live="polite">
            <div class="side-combat-chip side-combat-chip--progress">
                <span id="side-combat-progress">事件 0/8</span>
                <small id="side-combat-distance">前进 0m</small>
            </div>
            <div class="side-combat-chip">
                <span>全局刷新</span>
                <strong id="side-combat-refresh-count">0</strong>
                <button id="side-combat-refresh" type="button">刷新战术</button>
            </div>
            <div id="side-combat-player-panel" class="side-combat-player" data-combat-target="self" role="button" tabindex="0" aria-label="选择芙提雅">
                <span>芙提雅</span>
                <strong id="side-combat-player-hp">120/120</strong>
                <div class="side-combat-hp"><i id="side-combat-player-hp-bar"></i></div>
                <div id="side-combat-player-status" class="side-combat-status-icons"></div>
            </div>
            <div class="side-combat-skills">
                <button id="side-combat-skill-guard" type="button">神之守护 3</button>
                <button id="side-combat-skill-execute" type="button">御驾亲征 3</button>
            </div>
        </div>
        <div id="side-combat-enemy-layer" class="side-combat-enemy-layer"></div>
        <div id="side-combat-world-status-layer" class="side-combat-world-status-layer"></div>
        <div id="side-combat-target-layer" class="side-combat-target-layer"></div>
        <div id="side-combat-log" class="side-combat-log"></div>
        <div id="side-combat-hand" class="side-combat-hand" aria-label="战斗卡牌"></div>
        <button id="side-combat-deck-toggle" class="side-combat-round side-combat-deck-toggle" type="button" aria-label="查看本轮卡池" title="查看本轮卡池">
            <span class="side-combat-round__icon">☰</span>
            <span id="side-combat-deck-count" class="side-combat-round__badge">0</span>
        </button>
        <button id="side-combat-discard" class="side-combat-discard" type="button" aria-label="弃牌" title="拖拽手牌到这里弃牌">🗑️</button>
        <div class="side-combat-actions">
            <button id="side-combat-end-turn" type="button">结束回合</button>
        </div>
        <div id="side-combat-style-panel" class="side-combat-modal">
            <div class="side-combat-modal__panel">
                <span class="side-combat-modal__eyebrow">TACTICAL EXAM</span>
                <h2>战术考核设定</h2>
                <div class="side-combat-difficulty" aria-label="选择战术考核难度">
                    <button id="side-combat-difficulty-prev" class="side-combat-difficulty__arrow" type="button" aria-label="上一个难度">‹</button>
                    <div class="side-combat-difficulty__text">
                        <strong id="side-combat-difficulty-label">标准</strong>
                        <span id="side-combat-difficulty-detail">5 关卡 + 1 BOSS</span>
                    </div>
                    <button id="side-combat-difficulty-next" class="side-combat-difficulty__arrow" type="button" aria-label="下一个难度">›</button>
                </div>
                <p>输入任意战斗风格，模型只会据此影响卡牌倾向和命名；数值与规则由本地校验。</p>
                <textarea id="side-combat-style-input" maxlength="240" placeholder="例如：高爆发、火力压制、偏治疗保护、召唤火种协同"></textarea>
                <div id="side-combat-approval" class="side-combat-approval hidden" aria-live="polite">
                    <i></i>
                    <span>陶董正在审阅中 ...</span>
                </div>
                <button id="side-combat-start" type="button">提交战备申请</button>
            </div>
        </div>
        <div id="side-combat-reward-panel" class="side-combat-modal hidden">
            <div class="side-combat-modal__panel side-combat-modal__panel--small">
                <span id="side-combat-reward-title" class="side-combat-modal__eyebrow">EVENT CLEAR</span>
                <p id="side-combat-reward-text">事件处理完成。</p>
                <button id="side-combat-continue" type="button">继续前进</button>
            </div>
        </div>
        <div id="side-combat-complete-panel" class="side-combat-modal hidden">
            <div class="side-combat-modal__panel side-combat-modal__panel--small">
                <span id="side-combat-complete-title" class="side-combat-modal__eyebrow">RUN COMPLETE</span>
                <p id="side-combat-complete-text">雪原路线完成。</p>
                <button id="side-combat-restart" type="button">重新开始</button>
            </div>
        </div>
        <div id="side-combat-tooltip" class="side-combat-tooltip hidden"></div>
    `;
    state.panel.appendChild(root);
    state.root = root;
    state.els = {
        progress: root.querySelector('#side-combat-progress'),
        distance: root.querySelector('#side-combat-distance'),
        refreshCount: root.querySelector('#side-combat-refresh-count'),
        refresh: root.querySelector('#side-combat-refresh'),
        playerPanel: root.querySelector('#side-combat-player-panel'),
        playerHp: root.querySelector('#side-combat-player-hp'),
        playerHpBar: root.querySelector('#side-combat-player-hp-bar'),
        playerStatus: root.querySelector('#side-combat-player-status'),
        guard: root.querySelector('#side-combat-skill-guard'),
        execute: root.querySelector('#side-combat-skill-execute'),
        enemyLayer: root.querySelector('#side-combat-enemy-layer'),
        worldStatusLayer: root.querySelector('#side-combat-world-status-layer'),
        targetLayer: root.querySelector('#side-combat-target-layer'),
        hand: root.querySelector('#side-combat-hand'),
        deckToggle: root.querySelector('#side-combat-deck-toggle'),
        deckCount: root.querySelector('#side-combat-deck-count'),
        discard: root.querySelector('#side-combat-discard'),
        log: root.querySelector('#side-combat-log'),
        endTurn: root.querySelector('#side-combat-end-turn'),
        stylePanel: root.querySelector('#side-combat-style-panel'),
        styleInput: root.querySelector('#side-combat-style-input'),
        difficultyPrev: root.querySelector('#side-combat-difficulty-prev'),
        difficultyNext: root.querySelector('#side-combat-difficulty-next'),
        difficultyLabel: root.querySelector('#side-combat-difficulty-label'),
        difficultyDetail: root.querySelector('#side-combat-difficulty-detail'),
        approval: root.querySelector('#side-combat-approval'),
        start: root.querySelector('#side-combat-start'),
        rewardPanel: root.querySelector('#side-combat-reward-panel'),
        rewardTitle: root.querySelector('#side-combat-reward-title'),
        rewardText: root.querySelector('#side-combat-reward-text'),
        continue: root.querySelector('#side-combat-continue'),
        completePanel: root.querySelector('#side-combat-complete-panel'),
        completeTitle: root.querySelector('#side-combat-complete-title'),
        completeText: root.querySelector('#side-combat-complete-text'),
        restart: root.querySelector('#side-combat-restart'),
        tooltip: root.querySelector('#side-combat-tooltip')
    };
}

function bindEvents() {
    if (state.root?.dataset.bound === '1') return;
    state.root.dataset.bound = '1';
    state.els.start?.addEventListener('click', () => void startRun());
    state.els.difficultyPrev?.addEventListener('click', () => changeDifficulty(-1));
    state.els.difficultyNext?.addEventListener('click', () => changeDifficulty(1));
    state.els.refresh?.addEventListener('click', () => void refreshCards({ consume: true, reason: 'manual' }));
    state.els.deckToggle?.addEventListener('click', event => {
        event.stopPropagation();
        toggleDeckPopover();
    });
    state.els.guard?.addEventListener('click', useGuardSkill);
    state.els.execute?.addEventListener('click', armExecuteSkill);
    state.els.endTurn?.addEventListener('click', () => void endPlayerTurn());
    state.els.continue?.addEventListener('click', continueWalking);
    state.els.restart?.addEventListener('click', openSideScrollerCombat);
    state.root?.addEventListener('pointerdown', event => {
        if (!event.target?.closest?.('.side-combat-status, .side-combat-tooltip')) closeStatusPopover();
        if (!event.target?.closest?.('#side-combat-deck-toggle, .side-combat-tooltip--deck')) closeDeckPopover();
    });
    state.els.playerPanel?.addEventListener('click', () => handleTargetSelection('self'));
    state.els.playerPanel?.addEventListener('pointerup', event => {
        const cardId = state.dragState?.cardId || state.root?.dataset.dragCardId;
        if (!cardId) return;
        event.preventDefault();
        if (state.dragState) finishCardDrag(event, 'self');
        else {
            state.root.dataset.dragCardId = '';
            state.selectedCardId = cardId;
            handleTargetSelection('self');
        }
    });
}

async function startRun() {
    if (state.busy) return;
    state.styleText = state.els.styleInput?.value?.trim() || '';
    state.events = createEventRoute();
    const battleCount = state.events.filter(event => event.kind === 'enemy' || isBossEvent(event)).length;
    state.refreshCount = battleCount + 2;
    state.phase = 'loading';
    state.busy = true;
    state.approvalState = 'reviewing';
    state.log = ['正在提交战备申请。'];
    renderCombat();
    await refreshCards({ consume: false, reason: 'start' });
    if (!state.visible) return;
    state.approvalState = 'approved';
    state.busy = true;
    renderCombat();
    await wait(1000);
    if (!state.visible) return;
    state.busy = false;
    state.phase = 'walk';
    state.approvalState = 'idle';
    pushLog('向右前进，雪原信号会自动接入。');
    scheduleCardPreload('after-start');
    renderCombat();
}

function createEventRoute() {
    const events = [];
    const difficulty = currentDifficulty();
    if (difficulty.fixedBosses) {
        for (let i = 0; i < 4; i += 1) events.push(createNormalRouteEvent(i));
        events.push({ kind: 'miniBoss', level: 5 });
        for (let i = 5; i < 9; i += 1) events.push(createNormalRouteEvent(i));
        events.push({ kind: 'boss', level: 10 });
        return events;
    }
    for (let i = 0; i < difficulty.normalEvents; i += 1) {
        events.push(createNormalRouteEvent(i));
    }
    for (let i = 0; i < difficulty.bossEvents; i += 1) {
        events.push({ kind: 'boss', level: difficulty.normalEvents + i + 1 });
    }
    return events;
}

function createNormalRouteEvent(index) {
    if (index < 2) return { kind: 'enemy', level: index + 1 };
    const roll = Math.random();
    if (roll < 0.72) return { kind: 'enemy', level: index + 1 };
    if (roll < 0.95) return { kind: 'supply', level: index + 1 };
    return { kind: 'rare', level: index + 1 };
}

async function triggerNextEvent() {
    if (state.phase !== 'walk' || state.busy) return;
    const event = state.events[state.eventIndex];
    state.eventIndex += 1;
    state.nextEventAt += EVENT_DISTANCE;
    if (!event) {
        completeRun(true);
        return;
    }
    if (event.kind === 'supply') {
        state.phase = 'reward';
        const heal = Math.min(36, state.player.maxHp - state.player.hp);
        state.player.hp += heal;
        pushLog(`补给点恢复 ${heal} HP。`);
        showReward('SUPPLY POINT', heal > 0 ? `补给完成，芙提雅恢复 ${heal} HP。` : '补给点已清理，当前生命值已满。');
        return;
    }
    if (event.kind === 'rare') {
        state.phase = 'reward';
        state.refreshCount += 1;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 18);
        pushLog('稀有信标：获得 1 次全局刷新并恢复 18 HP。');
        showReward('RARE SIGNAL', '获得 1 次全局刷新，并恢复 18 HP。');
        return;
    }
    beginEncounter(event);
}

function beginEncounter(event) {
    state.phase = 'encounter';
    state.busy = false;
    state.pendingEvent = event;
    state.encounterProgress = 0;
    state.enemies = createEnemies(event);
    state.playsUsed = 0;
    state.selectedCardId = '';
    state.pendingSkill = '';
    pushLog(isBossEvent(event) ? 'Boss 信号锁定，继续前进接敌。' : '敌对反应接近，继续前进接敌。');
    renderCombat();
}

function advanceEncounterApproach(distance) {
    state.encounterProgress = Math.max(0, Math.min(ENCOUNTER_APPROACH_DISTANCE, state.encounterProgress + distance));
    renderCombat();
    if (state.encounterProgress >= ENCOUNTER_APPROACH_DISTANCE && !state.busy) {
        void startBattle(state.pendingEvent);
    }
}

async function startBattle(event) {
    if (!event) return;
    state.phase = 'battle';
    state.busy = false;
    state.encounterProgress = ENCOUNTER_APPROACH_DISTANCE;
    state.playsUsed = 0;
    state.selectedCardId = '';
    state.pendingSkill = '';
    state.pendingEvent = null;
    pushLog(isBossEvent(event) ? 'Boss 信号锁定。' : '敌对反应接近。');
    if (!state.hand.length && !state.deck.length) pushLog('当前卡池已空，请使用预加载卡池。');
    else if (state.hand.length < HAND_SIZE && !state.deck.length) pushLog('当前手牌不足，卡池已空。');
    pushLog('玩家回合开始。拖动或点击卡牌选择目标。');
    renderCombat();
}

function createEnemies(event) {
    if (event.kind === 'miniBoss') {
        const hp = 240 * 2;
        return [{
            id: `miniboss-${Date.now()}`,
            name: MINI_BOSS_NAME,
            boss: true,
            miniBoss: true,
            maxHp: hp,
            hp,
            attack: 15,
            statuses: []
        }];
    }
    if (event.kind === 'boss') {
        const hp = 360 * 2;
        return [{
            id: `boss-${Date.now()}`,
            name: BOSS_NAME,
            boss: true,
            maxHp: hp,
            hp,
            attack: 18,
            statuses: []
        }];
    }
    const count = event.level >= 5 ? 3 : (event.level >= 3 ? 2 : 1);
    return Array.from({ length: count }, (_, index) => {
        const hp = (58 + event.level * 9 + index * 10) * 2;
        return {
            id: `enemy-${Date.now()}-${index}`,
            name: ENEMY_NAMES[(event.level + index) % ENEMY_NAMES.length],
            boss: false,
            maxHp: hp,
            hp,
            attack: 9 + event.level * 2 + index,
            statuses: []
        };
    });
}

async function refreshCards({ consume, reason }) {
    if (state.busy && reason === 'manual') return;
    const previousBusy = state.busy;
    const shouldEndTurnAfterManualRefresh = reason === 'manual'
        && state.phase === 'battle'
        && getRemainingCardPoolCount() > HAND_SIZE;
    let batch = null;
    if (reason === 'manual') {
        if (state.refreshCount <= 0) {
            pushLog('全局刷新次数不足。');
            renderCombat();
            return;
        }
        if (!state.preloadedBatch) {
            pushLog(state.preloading ? '下一组卡池仍在预加载中。' : '下一组卡池尚未预加载完成。');
            renderCombat();
            return;
        }
        state.refreshCount -= 1;
        batch = state.preloadedBatch;
        state.preloadedBatch = null;
        pushLog('已使用预加载战术卡组。');
        scheduleCardPreload('after-refresh');
    } else {
        state.busy = true;
        renderCombat();
        batch = await buildSideScrollerCardBatch({ styleText: state.styleText, reason });
    }
    applyCardBatch(batch);
    if (batch.source === 'llm') pushLog('战术卡组已由模型命名。');
    else if (batch.message) {
        pushLog(`使用本地战术卡组：${batch.message}`);
        console.error('[SideScrollerCombat] Card batch fell back to local cards.', batch.diagnostics || batch.message);
    }
    state.selectedCardId = '';
    state.busy = previousBusy && reason !== 'manual';
    if (reason === 'manual') state.busy = false;
    renderCombat();
    if (shouldEndTurnAfterManualRefresh) await endPlayerTurn({ force: true });
}

function scheduleCardPreload(reason) {
    if (!state.visible || state.preloading || state.preloadedBatch) return;
    const token = ++state.preloadToken;
    state.preloading = true;
    state.preloadedBatch = null;
    window.setTimeout(async () => {
        if (!state.visible || token !== state.preloadToken) {
            state.preloading = false;
            return;
        }
        try {
            const batch = await buildSideScrollerCardBatch({ styleText: state.styleText, reason });
            if (!state.visible || token !== state.preloadToken) return;
            state.preloadedBatch = batch;
            if (batch.source === 'llm') pushLog('下一组战术卡牌已预加载。');
            else {
                pushLog(`预加载使用本地卡组：${batch.message || '生成失败'}`);
                console.error('[SideScrollerCombat] Preloaded card batch fell back to local cards.', batch.diagnostics || batch.message);
            }
            renderCombat();
        } catch (err) {
            if (token === state.preloadToken) {
                console.error('[SideScrollerCombat] Card preload failed unexpectedly:', err);
                pushLog(`预加载卡组失败：${err?.message || err}`);
                renderCombat();
            }
        } finally {
            if (token === state.preloadToken) state.preloading = false;
        }
    }, reason === 'after-start' ? 2800 : 1200);
}

function handleCardClick(cardId) {
    if (state.phase !== 'battle' || state.busy) return;
    state.pendingSkill = '';
    state.selectedCardId = state.selectedCardId === cardId ? '' : cardId;
    renderHand();
}

function handleTargetSelection(targetId) {
    if (state.phase !== 'battle' || state.busy) return;
    if (state.pendingSkill === 'execute') {
        const enemy = state.enemies.find(item => item.id === targetId);
        if (enemy) useExecuteSkill(enemy);
        return;
    }
    const card = state.hand.find(item => item.id === state.selectedCardId);
    if (!card) return;
    if (card.targetMode === 'self' && targetId !== 'self') {
        pushLog('这张牌需要对芙提雅使用。');
        renderCombat();
        return;
    }
    if (card.targetMode === 'enemy' && targetId === 'self') {
        pushLog('这张牌需要选择敌方目标。');
        renderCombat();
        return;
    }
    const target = targetId === 'self' ? state.player : state.enemies.find(item => item.id === targetId);
    if (!target) return;
    void playCard(card, target);
}

function tryPlayCardOnTarget(cardId, targetId) {
    if (state.phase !== 'battle' || state.busy) return false;
    state.pendingSkill = '';
    const card = state.hand.find(item => item.id === cardId);
    if (!card) return false;
    if (card.targetMode === 'self' && targetId !== 'self') {
        pushLog('这张牌需要对芙提雅使用。');
        renderCombat();
        return false;
    }
    if (card.targetMode === 'enemy' && targetId === 'self') {
        pushLog('这张牌需要选择敌方目标。');
        renderCombat();
        return false;
    }
    const target = targetId === 'self' ? state.player : state.enemies.find(item => item.id === targetId);
    if (!target) return false;
    state.selectedCardId = cardId;
    void playCard(card, target);
    return true;
}

async function playCard(card, target) {
    if (state.playsUsed >= PLAYER_CARD_LIMIT) {
        pushLog('本回合出牌次数已满。');
        renderCombat();
        return;
    }
    state.busy = true;
    state.hand = state.hand.filter(item => item.id !== card.id);
    state.selectedCardId = '';
    state.playsUsed += 1;
    try {
        await applyCardEffect(card, target);
    } finally {
        state.busy = false;
    }
    drawUntilHandSize();
    if (isBattleWon()) {
        finishBattle();
        return;
    }
    if (state.playsUsed >= PLAYER_CARD_LIMIT) await endPlayerTurn();
    else renderCombat();
}

async function applyCardEffect(card, target) {
    if (card.category === 'heal') {
        if (card.effectKind === 'armor') {
            const amount = Math.max(1, Math.round(Number(card.value) || 0));
            state.player.armor = Math.max(0, Math.round(Number(state.player.armor) || 0)) + amount;
            floatAtPlayer(`+${amount}🛡️`, 'shield');
            healingAuraAtFritia('shield');
            pushLog(`${card.name}: 获得 ${amount} 护甲。`);
            return;
        }
        const before = state.player.hp;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + card.value);
        floatAtPlayer(`+${state.player.hp - before}`, 'heal');
        healingAuraAtFritia();
        pushLog(`${card.name}：恢复 ${state.player.hp - before} HP。`);
        return;
    }
    if (card.category === 'buff') {
        if (card.effectKind === 'weaken') {
            addStatus(target, 'weaken', card.duration, card.value);
            floatAtEnemy(target.id, '⚔️↓', 'status');
            pushLog(`${card.name}: 施加${statusLabel('weaken')}。`);
            return;
        }
        if (card.effectKind === 'vulnerable') {
            addStatus(target, 'vulnerable', card.duration, card.value);
            floatAtEnemy(target.id, '破', 'status');
            pushLog(`${card.name}: 施加${statusLabel('vulnerable')}。`);
            return;
        }
        if (card.effectKind === 'focus') addStatus(state.player, 'focus', card.duration, card.value);
        else addStatus(state.player, 'shield', card.duration, card.value);
        healingAuraAtFritia(card.effectKind === 'focus' ? 'focus' : 'shield');
        pushLog(`${card.name}：获得${card.effectKind === 'focus' ? '专注' : '护盾'}。`);
        return;
    }
    if (card.category === 'control') {
        if (card.effectKind === 'freeze') addStatus(target, 'freeze', card.duration, 0);
        else if (card.effectKind === 'silence') addStatus(target, 'silence', card.duration, 0);
        else addStatus(target, 'vulnerable', card.duration, card.value);
        floatAtEnemy(target.id, '状态', 'status');
        pushLog(`${card.name}：施加${statusLabel(card.effectKind)}。`);
        return;
    }
    if (card.category === 'summon') {
        state.triggerFireAttack?.();
        await wait(220);
        applyDamageCard(card, target, 'summon');
        return;
    }
    applyDamageCard(card, target, 'attack');
}

function applyDamageCard(card, target, effectType) {
    const targets = isAreaCard(card) ? state.enemies.filter(isAlive) : [target].filter(Boolean);
    const baseDamage = getCardDamageValue(card);
    targets.forEach(enemy => {
        dealDamage(enemy, computeOutgoingDamage(baseDamage), card);
        fireRayToEnemy(enemy.id, { type: effectType, duration: effectType === 'summon' ? 1150 : 860 });
        spawnHitParticlesAtEnemy(enemy.id, effectType);
    });
    pushLog(isAreaCard(card)
        ? `${card.name}：群体造成 ${baseDamage} 伤害。`
        : `${card.name}：造成 ${baseDamage} 伤害。`);
}

function computeOutgoingDamage(base) {
    const focus = sumStatusValue(state.player, 'focus');
    return Math.max(1, Math.round(base * (1 + focus)));
}

function dealDamage(enemy, amount, card = null) {
    const vulnerable = sumStatusValue(enemy, 'vulnerable');
    const damage = Math.max(1, Math.round(amount * (1 + vulnerable)));
    enemy.hp = Math.max(0, enemy.hp - damage);
    floatAtEnemy(enemy.id, `-${damage}`, card?.category === 'summon' ? 'fire' : 'damage');
    spawnHitParticlesAtEnemy(enemy.id, card?.category === 'summon' ? 'summon' : 'damage');
    shakeEnemy(enemy.id);
}

async function endPlayerTurn(options = {}) {
    if (state.phase !== 'battle' || (state.busy && !options.force)) return;
    state.selectedCardId = '';
    state.pendingSkill = '';
    state.busy = true;
    renderCombat();
    await wait(260);
    pushLog('敌方回合。');
    for (const enemy of state.enemies.filter(isAlive)) {
        if (hasStatus(enemy, 'freeze') || hasStatus(enemy, 'silence')) {
            pushLog(`${enemy.name} 行动受阻。`);
            continue;
        }
        const damage = computeEnemyIntentDamage(enemy);
        applyDamageToPlayer(damage);
        floatAtPlayer(`-${damage}`, 'damage');
        if (state.player.hp <= 0) {
            completeRun(false);
            return;
        }
        await wait(180);
    }
    tickStatuses(state.enemies);
    tickStatuses([state.player]);
    state.playsUsed = 0;
    drawUntilHandSize();
    state.busy = false;
    pushLog('玩家回合开始。');
    renderCombat();
}

function computeEnemyIntentDamage(enemy) {
    if (!isAlive(enemy) || hasStatus(enemy, 'freeze') || hasStatus(enemy, 'silence')) return 0;
    return computeIncomingDamage(enemy.attack, enemy);
}

function computeIncomingDamage(base, enemy = null) {
    const defense = sumStatusValue(state.player, 'shield') + sumStatusValue(state.player, 'guard_defense');
    const vulnerability = sumStatusValue(state.player, 'guard_vulnerable');
    const weaken = enemy ? sumStatusValue(enemy, 'weaken') : 0;
    return Math.max(1, Math.round(base * (1 + vulnerability) * Math.max(0.18, 1 - defense) * Math.max(0.18, 1 - weaken)));
}

function applyDamageToPlayer(amount) {
    let remaining = Math.max(0, Math.round(Number(amount) || 0));
    const armor = Math.max(0, Math.round(Number(state.player.armor) || 0));
    if (armor > 0) {
        const absorbed = Math.min(armor, remaining);
        state.player.armor = armor - absorbed;
        remaining -= absorbed;
    }
    if (remaining > 0) state.player.hp = Math.max(0, state.player.hp - remaining);
}

function drawUntilHandSize() {
    while (state.hand.length < HAND_SIZE && state.deck.length > 0) {
        state.hand.push(state.deck.shift());
    }
    if (!state.hand.length && !state.deck.length && state.phase === 'battle' && !isBattleWon()) {
        void autoRefreshEmptyCardPool();
    }
}

async function autoRefreshEmptyCardPool() {
    if (state.busy || getRemainingCardPoolCount() > 0) return;
    if (state.preloadedBatch) {
        pushLog('卡池已空，自动启用预加载战术。');
        const batch = state.preloadedBatch;
        state.preloadedBatch = null;
        applyCardBatch(batch);
        scheduleCardPreload('after-empty-auto');
        renderCombat();
        return;
    }
    state.busy = true;
    renderCombat();
    const batch = await buildSideScrollerCardBatch({ styleText: state.styleText, reason: 'empty-auto' });
    if (!state.visible || state.phase !== 'battle') {
        state.busy = false;
        return;
    }
    applyCardBatch(batch);
    state.busy = false;
    pushLog(batch.source === 'llm' ? '卡池已空，已自动重新抽牌。' : '卡池已空，已自动使用本地战术卡组。');
    renderCombat();
}

function applyCardBatch(batch) {
    state.hand = batch.cards.slice(0, HAND_SIZE);
    state.deck = batch.cards.slice(HAND_SIZE);
    state.deckPopoverOpen = false;
    if (batch.source !== 'llm' && batch.message) {
        console.error('[SideScrollerCombat] Auto card batch fell back to local cards.', batch.diagnostics || batch.message);
    }
}

function getRemainingCardPool() {
    return [...state.hand, ...state.deck];
}

function getRemainingCardPoolCount() {
    return state.hand.length + state.deck.length;
}

function finishBattle() {
    closeStatusPopover();
    state.phase = 'reward';
    state.enemies = [];
    state.playsUsed = 0;
    state.pendingSkill = '';
    state.selectedCardId = '';
    pushLog('战斗完成。');
    if (state.eventIndex >= currentEventCount()) {
        completeRun(true);
        return;
    }
    showReward('BATTLE CLEAR', '敌对信号已清除，向前继续搜索。');
}

function continueWalking() {
    if (state.phase !== 'reward') return;
    state.els.rewardPanel?.classList.add('hidden');
    closeStatusPopover();
    state.phase = 'walk';
    renderCombat();
}

function completeRun(victory) {
    closeStatusPopover();
    state.phase = victory ? 'complete' : 'defeat';
    state.busy = false;
    state.els.rewardPanel?.classList.add('hidden');
    state.els.completePanel?.classList.remove('hidden');
    if (state.els.completeTitle) state.els.completeTitle.textContent = victory ? 'RUN COMPLETE' : 'RUN FAILED';
    if (state.els.completeText) {
        state.els.completeText.textContent = victory
            ? '雪原路线完成，芙提雅安全返回信标点。'
            : '芙提雅生命值归零，路线已中断。';
    }
    pushLog(victory ? '雪原路线完成。' : '路线中断。');
    renderCombat();
}

function showReward(title, text) {
    if (state.els.rewardTitle) state.els.rewardTitle.textContent = title;
    if (state.els.rewardText) state.els.rewardText.textContent = text;
    state.els.rewardPanel?.classList.remove('hidden');
    renderCombat();
}

function useGuardSkill() {
    if (state.phase !== 'battle' || state.busy || state.guardUses <= 0) return;
    state.guardUses -= 1;
    state.player.hp = state.player.maxHp;
    addStatus(state.player, 'guard_defense', 3, 0.35);
    addStatus(state.player, 'guard_vulnerable', 3, 0.25);
    state.enemies.filter(isAlive).forEach(enemy => addStatus(enemy, 'silence', 1, 0));
    floatAtPlayer('FULL', 'heal');
    healingAuraAtFritia('guard');
    pushLog('神之守护：生命全满，敌方下回合沉默。');
    renderCombat();
}

function armExecuteSkill() {
    if (state.phase !== 'battle' || state.busy || state.executeUses <= 0) return;
    state.pendingSkill = state.pendingSkill === 'execute' ? '' : 'execute';
    state.selectedCardId = '';
    pushLog(state.pendingSkill ? '选择御驾亲征目标。' : '取消御驾亲征。');
    renderCombat();
}

function useExecuteSkill(enemy) {
    if (state.executeUses <= 0 || !isAlive(enemy)) return;
    if (enemy.boss && enemy.hp / enemy.maxHp > 0.5) {
        pushLog('Boss 生命高于 50%，御驾亲征暂不可用。');
        state.pendingSkill = '';
        renderCombat();
        return;
    }
    state.executeUses -= 1;
    state.pendingSkill = '';
    enemy.hp = 0;
    floatAtEnemy(enemy.id, '-99999999', 'execute');
    shakeEnemy(enemy.id);
    fireRayToEnemy(enemy.id, { type: 'execute', duration: 1040 });
    spawnHitParticlesAtEnemy(enemy.id, 'execute');
    pushLog('御驾亲征：目标已清除。');
    if (isBattleWon()) finishBattle();
    else renderCombat();
}

function renderCombat() {
    if (!state.root) return;
    state.root.classList.toggle('is-battle', state.phase === 'battle');
    state.root.classList.toggle('is-loading', state.busy || state.phase === 'loading');
    const stylePanelVisible = state.phase === 'intro' || state.phase === 'loading';
    state.els.stylePanel?.classList.toggle('hidden', !stylePanelVisible);
    state.els.rewardPanel?.classList.toggle('hidden', state.phase !== 'reward');
    state.els.completePanel?.classList.toggle('hidden', state.phase !== 'complete' && state.phase !== 'defeat');
    renderProgressOnly();
    renderPlayer();
    renderDifficulty();
    renderApproval();
    renderSkills();
    renderEnemies();
    renderWorldStatusIcons();
    renderDragTargetHints();
    renderHand();
    renderDeckControls();
    renderLog();
}

function renderProgressOnly() {
    const eventCount = currentEventCount();
    if (state.els.progress) state.els.progress.textContent = `事件 ${Math.min(state.eventIndex, eventCount)}/${eventCount}`;
    if (state.els.distance) {
        if (state.phase === 'walk') {
            const remain = Math.max(0, state.nextEventAt - state.forwardDistance);
            state.els.distance.textContent = `距下个信号 ${Math.ceil(remain)}m`;
        } else if (state.phase === 'encounter') {
            const remain = Math.max(0, ENCOUNTER_APPROACH_DISTANCE - state.encounterProgress);
            state.els.distance.textContent = `接敌 ${Math.ceil(remain)}m`;
        } else {
            state.els.distance.textContent = phaseLabel(state.phase);
        }
    }
    if (state.els.refreshCount) state.els.refreshCount.textContent = String(state.refreshCount);
}

function renderPlayer() {
    const armor = Math.max(0, Math.round(Number(state.player.armor) || 0));
    const total = Math.max(0, Math.round(Number(state.player.hp) || 0)) + armor;
    const pct = clamp01(total / state.player.maxHp);
    if (state.els.playerHp) state.els.playerHp.textContent = armor > 0
        ? `${total}/${state.player.maxHp}(🛡️${armor})`
        : `${state.player.hp}/${state.player.maxHp}`;
    if (state.els.playerHpBar) {
        state.els.playerHpBar.style.width = `${pct * 100}%`;
        state.els.playerHpBar.style.setProperty('--hp-ratio', `${clamp01(state.player.hp / Math.max(1, total)) * 100}%`);
        state.els.playerHpBar.classList.toggle('has-armor', armor > 0);
    }
    renderStatusIcons(state.els.playerStatus, state.player.statuses);
}

function renderDifficulty() {
    const difficulty = currentDifficulty();
    if (state.els.difficultyLabel) state.els.difficultyLabel.textContent = difficulty.label;
    if (state.els.difficultyDetail) state.els.difficultyDetail.textContent = difficulty.detail;
    if (state.els.difficultyPrev) state.els.difficultyPrev.disabled = state.phase !== 'intro' || state.busy;
    if (state.els.difficultyNext) state.els.difficultyNext.disabled = state.phase !== 'intro' || state.busy;
}

function renderApproval() {
    const approval = state.els.approval;
    if (!approval) return;
    approval.classList.toggle('hidden', state.approvalState === 'idle');
    approval.classList.toggle('is-approved', state.approvalState === 'approved');
    const text = approval.querySelector('span');
    if (text) text.textContent = state.approvalState === 'approved' ? '陶董已批准' : '陶董正在审阅中 ...';
    if (state.els.start) {
        state.els.start.classList.toggle('hidden', state.approvalState !== 'idle');
        state.els.start.disabled = state.phase !== 'intro' || state.busy;
    }
}

function renderSkills() {
    if (state.els.guard) {
        state.els.guard.textContent = `神之守护 ${state.guardUses}`;
        state.els.guard.disabled = state.phase !== 'battle' || state.guardUses <= 0 || state.busy;
    }
    if (state.els.execute) {
        state.els.execute.textContent = `御驾亲征 ${state.executeUses}`;
        state.els.execute.disabled = state.phase !== 'battle' || state.executeUses <= 0 || state.busy;
        state.els.execute.classList.toggle('is-armed', state.pendingSkill === 'execute');
    }
    if (state.els.refresh) {
        const manualRefreshEndsTurn = state.phase === 'battle' && getRemainingCardPoolCount() > HAND_SIZE;
        state.els.refresh.textContent = manualRefreshEndsTurn ? '重新抽牌并结束回合' : '重新抽牌';
        state.els.refresh.disabled = state.refreshCount <= 0 || state.busy || !['battle', 'walk'].includes(state.phase) || (!state.preloadedBatch && state.preloading);
        state.els.refresh.title = state.preloadedBatch
            ? (manualRefreshEndsTurn ? '使用已预加载卡池，当前卡池仍充足，因此刷新后结束回合。' : '使用已预加载卡池，当前卡池不足，刷新后不结束回合。')
            : (state.preloading ? '正在预加载下一组卡池' : '下一组卡池尚未预加载完成');
    }
    if (state.els.endTurn) {
        state.els.endTurn.disabled = state.phase !== 'battle' || state.busy;
    }
}

function renderEnemies() {
    const layer = state.els.enemyLayer;
    if (!layer) return;
    layer.textContent = '';
    if (state.phase !== 'battle' && state.phase !== 'loading' && state.phase !== 'encounter') return;
    state.enemies.forEach((enemy, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-enemy${enemy.boss ? ' side-combat-enemy--boss' : ''}`;
        button.dataset.enemyId = enemy.id;
        button.dataset.combatTarget = 'enemy';
        button.disabled = !isAlive(enemy) || state.busy || state.phase === 'encounter';
        button.style.setProperty('--enemy-index', String(index));
        const approach = state.phase === 'encounter' || state.phase === 'loading'
            ? clamp01(state.encounterProgress / ENCOUNTER_APPROACH_DISTANCE)
            : 1;
        button.style.setProperty('--approach', String(approach));
        button.style.setProperty('--approach-opacity', String(0.28 + approach * 0.72));
        const name = document.createElement('span');
        name.className = 'side-combat-enemy__name';
        name.textContent = enemy.name;
        const intent = document.createElement('span');
        intent.className = 'side-combat-enemy__intent';
        const intentDamage = computeEnemyIntentDamage(enemy);
        intent.textContent = intentDamage > 0 ? `⚔️ ${intentDamage}` : '⚔️ 0';
        intent.title = '敌方下次行动将造成的实际伤害';
        const hp = document.createElement('strong');
        hp.textContent = `${enemy.hp}/${enemy.maxHp}`;
        const bar = document.createElement('i');
        bar.className = 'side-combat-enemy__hp';
        bar.style.width = `${clamp01(enemy.hp / enemy.maxHp) * 100}%`;
        const status = document.createElement('div');
        status.className = 'side-combat-status-icons';
        renderStatusIcons(status, enemy.statuses);
        button.append(name, intent, hp, bar, status);
        button.addEventListener('click', () => handleTargetSelection(enemy.id));
        button.addEventListener('pointerup', event => {
            const cardId = state.dragState?.cardId || state.root?.dataset.dragCardId;
            if (!cardId) return;
            event.preventDefault();
            if (state.dragState) finishCardDrag(event, enemy.id);
            else {
                state.root.dataset.dragCardId = '';
                state.selectedCardId = cardId;
                handleTargetSelection(enemy.id);
            }
        });
        layer.appendChild(button);
    });
}

function renderHand() {
    const hand = state.els.hand;
    if (!hand) return;
    hand.textContent = '';
    if (state.phase !== 'battle') return;
    state.hand.forEach(card => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-card side-combat-card--${card.rarity} ${cardToneClass(card)}`;
        button.dataset.cardId = card.id;
        button.disabled = state.phase !== 'battle' || state.busy;
        button.classList.toggle('is-selected', state.selectedCardId === card.id);
        button.title = `${card.categoryLabel} / ${card.rarityLabel}：${mechanicsText(card)}`;
        const top = document.createElement('span');
        top.className = 'side-combat-card__top';
        top.textContent = `${SIDE_CARD_RARITY_LABELS[card.rarity] || card.rarity} · ${SIDE_CARD_CATEGORY_LABELS[card.category] || card.category}`;
        const name = document.createElement('strong');
        name.textContent = card.name;
        const desc = document.createElement('small');
        desc.textContent = card.description;
        const value = document.createElement('span');
        value.className = 'side-combat-card__value';
        value.textContent = mechanicsText(card);
        button.append(top, name, desc, value);
        button.addEventListener('click', () => handleCardClick(card.id));
        button.addEventListener('pointerdown', event => {
            if (state.phase !== 'battle' || state.busy) return;
            event.preventDefault();
            button.setPointerCapture?.(event.pointerId);
            beginCardDrag(button, card, event);
        });
        button.addEventListener('pointermove', event => {
            if (state.dragState?.cardId !== card.id) return;
            moveCardDrag(event);
        });
        button.addEventListener('pointerup', event => {
            button.releasePointerCapture?.(event.pointerId);
            if (state.dragState?.cardId !== card.id) return;
            if (isPointInsideDiscard(event.clientX, event.clientY)) {
                finishCardDiscard(event);
                return;
            }
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-combat-target]');
            let targetId = '';
            if (target?.dataset?.combatTarget === 'self') targetId = 'self';
            else if (target?.dataset?.combatTarget === 'enemy') targetId = target.dataset.enemyId || '';
            else if (isPointInsideFritia(event.clientX, event.clientY)) targetId = 'self';
            finishCardDrag(event, targetId);
        });
        button.addEventListener('pointercancel', () => {
            cancelCardDrag();
        });
        hand.appendChild(button);
    });
}

function renderDeckControls() {
    const count = getRemainingCardPoolCount();
    if (state.els.deckCount) state.els.deckCount.textContent = String(count);
    if (state.els.deckToggle) {
        state.els.deckToggle.disabled = !['battle', 'walk'].includes(state.phase) || count <= 0;
        state.els.deckToggle.classList.toggle('is-open', state.deckPopoverOpen);
    }
    if (state.deckPopoverOpen) renderDeckPopover();
}

function toggleDeckPopover() {
    if (!state.els.deckToggle || state.els.deckToggle.disabled) return;
    if (state.deckPopoverOpen) closeDeckPopover();
    else {
        closeStatusPopover();
        state.deckPopoverOpen = true;
        renderDeckPopover();
    }
}

function closeDeckPopover() {
    if (!state.deckPopoverOpen) return;
    state.deckPopoverOpen = false;
    state.els.tooltip?.classList.add('hidden');
}

function renderDeckPopover() {
    if (!state.els.tooltip || !state.els.deckToggle || !state.root) return;
    const cards = getRemainingCardPool();
    const rect = state.els.deckToggle.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const tooltip = state.els.tooltip;
    tooltip.className = 'side-combat-tooltip side-combat-tooltip--deck';
    tooltip.textContent = '';
    const title = document.createElement('strong');
    title.textContent = `本轮卡池 · 剩余 ${cards.length}`;
    const list = document.createElement('div');
    list.className = 'side-combat-deck-list';
    cards.forEach(card => {
        const item = document.createElement('div');
        item.className = `side-combat-deck-item side-combat-deck-item--${card.rarity} ${cardToneClass(card)}`;
        const name = document.createElement('b');
        name.textContent = card.name;
        const meta = document.createElement('span');
        meta.textContent = `${SIDE_CARD_RARITY_LABELS[card.rarity] || card.rarity} · ${SIDE_CARD_CATEGORY_LABELS[card.category] || card.category} · ${mechanicsText(card)}`;
        item.append(name, meta);
        list.appendChild(item);
    });
    tooltip.append(title, list);
    tooltip.style.left = `${rect.left - rootRect.left + rect.width * 0.5}px`;
    tooltip.style.top = `${Math.max(18, rect.top - rootRect.top - 12)}px`;
    tooltip.classList.remove('hidden');
}

function beginCardDrag(button, card, event) {
    clearDragState();
    closeStatusPopover();
    const point = getPointerPoint(event);
    const rect = button.getBoundingClientRect();
    const ghost = button.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.disabled = true;
    ghost.classList.add('is-drag-ghost');
    ghost.style.left = '0px';
    ghost.style.top = '0px';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    document.body.appendChild(ghost);
    button.classList.add('is-drag-source');
    state.root.dataset.dragCardId = card.id;
    state.dragState = {
        cardId: card.id,
        source: button,
        ghost,
        startRect: rect,
        offsetX: point.x - rect.left,
        offsetY: point.y - rect.top,
        left: rect.left,
        top: rect.top,
        currentX: point.x,
        currentY: point.y,
        trajectory: [{ x: point.x, y: point.y, t: performance.now() }]
    };
    moveCardDrag(event);
}

function moveCardDrag(event) {
    const drag = state.dragState;
    if (!drag?.ghost) return;
    const point = getPointerPoint(event);
    drag.currentX = point.x;
    drag.currentY = point.y;
    drag.trajectory.push({ x: point.x, y: point.y, t: performance.now() });
    if (drag.trajectory.length > 12) drag.trajectory.shift();
    drag.left = point.x - drag.offsetX;
    drag.top = point.y - drag.offsetY;
    drag.ghost.style.transform = `translate3d(${drag.left}px, ${drag.top}px, 0) scale(1.04)`;
    renderDragTargetHints();
}

function getPointerPoint(event) {
    const coalesced = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : null;
    const latest = coalesced?.length ? coalesced[coalesced.length - 1] : event;
    return { x: latest.clientX, y: latest.clientY };
}

function finishCardDrag(event, targetId) {
    const drag = state.dragState;
    if (!drag) return;
    const cardId = drag.cardId;
    const played = targetId ? tryPlayCardOnTarget(cardId, targetId) : false;
    if (played) {
        animateDraggedCardToTarget(drag, event, targetId);
        clearDragState({ keepGhost: true });
    } else {
        animateDraggedCardBack(drag);
        clearDragState({ keepGhost: true });
    }
}

function finishCardDiscard(event) {
    const drag = state.dragState;
    if (!drag) return;
    const card = state.hand.find(item => item.id === drag.cardId);
    if (!card) {
        animateDraggedCardBack(drag);
        clearDragState({ keepGhost: true });
        return;
    }
    state.hand = state.hand.filter(item => item.id !== card.id);
    if (state.selectedCardId === card.id) state.selectedCardId = '';
    drawUntilHandSize();
    animateDraggedCardToDiscard(drag, event);
    clearDragState({ keepGhost: true });
    pushLog(`${card.name}: 已弃牌。`);
    renderCombat();
}

function cancelCardDrag() {
    const drag = state.dragState;
    if (!drag) return;
    animateDraggedCardBack(drag);
    clearDragState({ keepGhost: true });
}

function clearDragState(options = {}) {
    if (state.dragState?.source) state.dragState.source.classList.remove('is-drag-source');
    if (state.dragState?.ghost && !options.keepGhost) state.dragState.ghost.remove();
    state.dragState = null;
    if (state.root) state.root.dataset.dragCardId = '';
    state.root?.classList.remove('is-card-dragging', 'is-dragging-enemy-card', 'is-dragging-self-card');
    if (state.els.targetLayer) state.els.targetLayer.textContent = '';
}

function refreshDeckPopoverIfOpen() {
    if (state.deckPopoverOpen) renderDeckPopover();
}

function animateDraggedCardBack(drag) {
    const ghost = drag?.ghost;
    if (!ghost) return;
    ghost.classList.add('is-returning');
    ghost.style.transform = `translate3d(${drag.startRect.left}px, ${drag.startRect.top}px, 0) scale(0.98)`;
    window.setTimeout(() => ghost.remove(), 220);
}

function animateDraggedCardToTarget(drag, event, targetId) {
    const ghost = drag?.ghost;
    if (!ghost) return;
    const point = getTargetCenterPoint(targetId, event);
    ghost.classList.add('is-casting');
    ghost.style.transform = `translate3d(${point.x - drag.startRect.width * 0.5}px, ${point.y - drag.startRect.height * 0.5}px, 0) scale(0.38)`;
    window.setTimeout(() => ghost.remove(), 360);
}

function animateDraggedCardToDiscard(drag, event) {
    const ghost = drag?.ghost;
    if (!ghost) return;
    const rect = state.els.discard?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width * 0.5 : event.clientX;
    const y = rect ? rect.top + rect.height * 0.5 : event.clientY;
    ghost.classList.add('is-discarding');
    ghost.style.transform = `translate3d(${x - drag.startRect.width * 0.5}px, ${y - drag.startRect.height * 0.5}px, 0) scale(0.22) rotate(10deg)`;
    window.setTimeout(() => ghost.remove(), 260);
}

function getTargetCenterPoint(targetId, event) {
    if (targetId === 'self') {
        const panelRect = state.panel?.getBoundingClientRect?.();
        const hitbox = state.getFritiaHitbox?.();
        if (panelRect && hitbox) {
            return {
                x: panelRect.left + (hitbox.left + hitbox.right) * 0.5,
                y: panelRect.top + (hitbox.top + hitbox.bottom) * 0.48
            };
        }
        const rect = state.els.playerPanel?.getBoundingClientRect?.();
        if (rect) return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
    }
    const enemy = findEnemyElement(targetId);
    const rect = enemy?.getBoundingClientRect?.();
    if (rect) return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.45 };
    return { x: event?.clientX || window.innerWidth * 0.5, y: event?.clientY || window.innerHeight * 0.5 };
}

function isPointInsideDiscard(clientX, clientY) {
    const rect = state.els.discard?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function isPointInsideFritia(clientX, clientY) {
    const panelRect = state.panel?.getBoundingClientRect?.();
    const hitbox = state.getFritiaHitbox?.();
    if (!panelRect || !hitbox) return false;
    const x = clientX - panelRect.left;
    const y = clientY - panelRect.top;
    return x >= hitbox.left && x <= hitbox.right && y >= hitbox.top && y <= hitbox.bottom;
}

function renderStatusIconsLegacy(container, statuses) {
    renderStatusIcons(container, statuses);
    return;
    if (!container) return;
    container.textContent = '';
    statuses.filter(status => status.turns > 0).forEach(status => {
        const span = document.createElement('span');
        span.className = `side-combat-status side-combat-status--${status.id}`;
        span.textContent = statusIcon(status.id);
        span.title = `${statusLabel(status.id)} ${status.turns}回合`;
        container.appendChild(span);
    });
}

function renderStatusIcons(container, statuses) {
    if (!container) return;
    container.textContent = '';
    statuses.filter(status => status.turns > 0).forEach(status => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-status side-combat-status--${status.id}`;
        button.textContent = statusIcon(status.id);
        button.title = statusSummary(status);
        button.addEventListener('click', event => {
            event.stopPropagation();
            showStatusPopover(button, status);
        });
        container.appendChild(button);
    });
}

function renderWorldStatusIcons() {
    const layer = state.els.worldStatusLayer;
    if (!layer) return;
    layer.textContent = '';
    if (!['battle', 'loading', 'encounter'].includes(state.phase)) return;
    renderPlayerWorldStatus(layer);
    state.enemies.forEach(enemy => renderEnemyWorldStatus(layer, enemy));
}

function renderDragTargetHints() {
    const layer = state.els.targetLayer;
    if (!layer) return;
    layer.textContent = '';
    state.root?.classList.toggle('is-card-dragging', Boolean(state.dragState));
    state.root?.classList.remove('is-dragging-enemy-card', 'is-dragging-self-card');
    if (!state.dragState || state.phase !== 'battle') return;
    const card = state.hand.find(item => item.id === state.dragState.cardId);
    if (!card) return;
    state.root?.classList.toggle('is-dragging-enemy-card', card.targetMode === 'enemy');
    state.root?.classList.toggle('is-dragging-self-card', card.targetMode === 'self');
    if (card.targetMode === 'self') renderSelfTargetHint(layer);
    if (card.targetMode === 'enemy') renderEnemyTargetHints(layer);
}

function renderSelfTargetHint(layer) {
    const panelRect = state.panel?.getBoundingClientRect?.();
    const rootRect = state.root?.getBoundingClientRect?.();
    const hitbox = state.getFritiaHitbox?.();
    if (!panelRect || !rootRect || !hitbox) return;
    const ring = document.createElement('i');
    ring.className = 'side-combat-target-ring side-combat-target-ring--self';
    const width = Math.max(86, hitbox.right - hitbox.left + 34);
    const height = Math.max(132, hitbox.bottom - hitbox.top + 26);
    ring.style.left = `${panelRect.left - rootRect.left + (hitbox.left + hitbox.right) * 0.5}px`;
    ring.style.top = `${panelRect.top - rootRect.top + (hitbox.top + hitbox.bottom) * 0.5}px`;
    ring.style.width = `${width}px`;
    ring.style.height = `${height}px`;
    layer.appendChild(ring);
}

function renderEnemyTargetHints(layer) {
    state.enemies.filter(isAlive).forEach(enemy => {
        const target = findEnemyElement(enemy.id);
        const rootRect = state.root?.getBoundingClientRect?.();
        const rect = target?.getBoundingClientRect?.();
        if (!target || target.disabled || !rootRect || !rect) return;
        const ring = document.createElement('i');
        ring.className = `side-combat-target-ring side-combat-target-ring--enemy${enemy.boss ? ' side-combat-target-ring--boss' : ''}`;
        ring.style.left = `${rect.left - rootRect.left + rect.width * 0.5}px`;
        ring.style.top = `${rect.top - rootRect.top + rect.height * 0.5}px`;
        ring.style.width = `${Math.max(118, rect.width + 22)}px`;
        ring.style.height = `${Math.max(104, rect.height + 22)}px`;
        layer.appendChild(ring);
    });
}

function renderPlayerWorldStatus(layer) {
    const statuses = state.player.statuses.filter(status => status.turns > 0);
    if (!statuses.length) return;
    const panelRect = state.panel?.getBoundingClientRect?.();
    const rootRect = state.root?.getBoundingClientRect?.();
    const hitbox = state.getFritiaHitbox?.();
    if (!panelRect || !rootRect || !hitbox) return;
    const holder = createWorldStatusHolder(statuses);
    holder.style.left = `${panelRect.left - rootRect.left + (hitbox.left + hitbox.right) * 0.5}px`;
    holder.style.top = `${panelRect.top - rootRect.top + hitbox.top - 22}px`;
    layer.appendChild(holder);
}

function renderEnemyWorldStatus(layer, enemy) {
    const statuses = enemy.statuses.filter(status => status.turns > 0);
    if (!statuses.length) return;
    const target = findEnemyElement(enemy.id);
    const rootRect = state.root?.getBoundingClientRect?.();
    const rect = target?.getBoundingClientRect?.();
    if (!target || !rootRect || !rect) return;
    const holder = createWorldStatusHolder(statuses);
    holder.style.left = `${rect.left - rootRect.left + rect.width * 0.5}px`;
    holder.style.top = `${rect.top - rootRect.top - 42}px`;
    layer.appendChild(holder);
}

function createWorldStatusHolder(statuses) {
    const holder = document.createElement('div');
    holder.className = 'side-combat-world-status';
    statuses.forEach(status => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-status side-combat-status--${status.id}`;
        button.textContent = statusIcon(status.id);
        button.title = statusSummary(status);
        button.addEventListener('click', event => {
            event.stopPropagation();
            showStatusPopover(button, status);
        });
        holder.appendChild(button);
    });
    return holder;
}

function showStatusPopover(anchor, status) {
    if (!state.els.tooltip || !state.root) return;
    state.deckPopoverOpen = false;
    const rect = anchor.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const tooltip = state.els.tooltip;
    tooltip.className = 'side-combat-tooltip side-combat-tooltip--status';
    tooltip.textContent = '';
    const title = document.createElement('strong');
    title.textContent = statusLabel(status.id);
    const body = document.createElement('span');
    body.textContent = statusDescription(status);
    tooltip.append(title, body);
    tooltip.style.left = `${rect.left - rootRect.left + rect.width * 0.5}px`;
    tooltip.style.top = `${Math.max(18, rect.top - rootRect.top - 10)}px`;
    tooltip.classList.remove('hidden');
    state.statusPopover = { id: status.id };
}

function closeStatusPopover() {
    state.statusPopover = null;
    state.els.tooltip?.classList.add('hidden');
}

function renderLog() {
    if (!state.els.log) return;
    state.els.log.textContent = state.log.slice(-4).join('\n');
}

function mechanicsText(card) {
    if (card.category === 'heal') return card.effectKind === 'armor' ? `🛡️ ${card.value}` : `❤️ ${card.value}`;
    if (card.category === 'control') return `${controlIcon(card.effectKind)} ${statusLabel(card.effectKind)} ${card.duration}`;
    if (card.category === 'summon') return isAreaCard(card) ? `🔥 群体 ${getCardDamageValue(card)}` : `🔥 ${card.value}`;
    if (card.category === 'buff') {
        if (card.effectKind === 'focus') return `伤害 +${Math.round(card.value * 100)}% ✨`;
        if (card.effectKind === 'weaken') return `敌伤 -${Math.round(card.value * 100)}% 🔽`;
        if (card.effectKind === 'vulnerable') return `易伤 +${Math.round(card.value * 100)}% 🔽`;
        return `减伤 ${Math.round(card.value * 100)}% ✨`;
    }
    return isAreaCard(card) ? `⚔️ 群体 ${getCardDamageValue(card)}` : `⚔️ ${card.value}`;
}

function cardToneClass(card) {
    if (card?.category !== 'buff') return '';
    return card.targetMode === 'enemy' || card.tags?.includes('debuff')
        ? 'side-combat-card--enemy-debuff'
        : 'side-combat-card--friendly-buff';
}

function isAreaCard(card) {
    return Array.isArray(card?.tags) && card.tags.includes('area');
}

function getCardDamageValue(card) {
    const value = Math.max(1, Math.round(Number(card?.value) || 1));
    return isAreaCard(card) ? Math.max(1, Math.floor(value * 0.7)) : value;
}

function controlIcon(effectKind) {
    return {
        freeze: '❄️',
        silence: '🔇',
        vulnerable: '💥',
        weaken: '⚔️↓'
    }[effectKind] || '⛓️';
}

function addStatus(target, id, turns, value) {
    target.statuses.push({
        id,
        turns: Math.max(1, Math.round(Number(turns) || 1)),
        value: Number(value) || 0
    });
}

function tickStatuses(targets) {
    targets.forEach(target => {
        target.statuses.forEach(status => { status.turns -= 1; });
        target.statuses = target.statuses.filter(status => status.turns > 0);
    });
}

function hasStatus(target, id) {
    return target.statuses.some(status => status.id === id && status.turns > 0);
}

function sumStatusValue(target, id) {
    return target.statuses
        .filter(status => status.id === id && status.turns > 0)
        .reduce((sum, status) => sum + (Number(status.value) || 0), 0);
}

function isBattleWon() {
    return state.enemies.length > 0 && state.enemies.every(enemy => !isAlive(enemy));
}

function isAlive(entity) {
    return Number(entity?.hp || 0) > 0;
}

function pushLog(text) {
    state.log.push(text);
    if (state.log.length > 12) state.log.shift();
}

function phaseLabel(phase) {
    if (phase === 'encounter') return '接敌中';
    if (phase === 'intro') return '等待设定';
    if (phase === 'loading') return '整理卡组';
    if (phase === 'battle') return `出牌 ${state.playsUsed}/${PLAYER_CARD_LIMIT}`;
    if (phase === 'reward') return '事件完成';
    if (phase === 'complete') return '路线完成';
    if (phase === 'defeat') return '路线中断';
    return '前进中';
}

function statusLabel(id) {
    return {
        freeze: '冻结',
        silence: '沉默',
        vulnerable: '易伤',
        weaken: '削弱',
        shield: '护盾',
        focus: '专注',
        guard_defense: '守护减伤',
        guard_vulnerable: '守护易伤'
    }[id] || id;
}

function statusSummary(status) {
    return `${statusLabel(status.id)} · ${status.turns}回合`;
}

function statusDescription(status) {
    const turns = `${status.turns} 回合`;
    const pct = `${Math.round((Number(status.value) || 0) * 100)}%`;
    return {
        freeze: `无法行动，剩余 ${turns}。`,
        silence: `无法发动敌方技能，剩余 ${turns}。`,
        vulnerable: `受到伤害提高 ${pct}，剩余 ${turns}。`,
        weaken: `造成伤害降低 ${pct}，剩余 ${turns}。`,
        shield: `受到伤害降低 ${pct}，剩余 ${turns}。`,
        focus: `造成伤害提高 ${pct}，剩余 ${turns}。`,
        guard_defense: `神之守护减伤 ${pct}，剩余 ${turns}。`,
        guard_vulnerable: `神之守护代价：受到伤害提高 ${pct}，剩余 ${turns}。`
    }[status.id] || `状态剩余 ${turns}。`;
}

function statusIcon(id) {
    return {
        freeze: '冻',
        silence: '默',
        vulnerable: '破',
        weaken: '弱',
        shield: '盾',
        focus: '准',
        guard_defense: '守',
        guard_vulnerable: '险'
    }[id] || '?';
}

function floatAtEnemy(enemyId, text, type) {
    const target = findEnemyElement(enemyId);
    floatAtElement(target, text, type);
}

function floatAtPlayer(text, type) {
    floatAtElement(state.els.playerPanel, text, type);
}

function floatAtElement(target, text, type) {
    if (!target || !state.root) return;
    const targetRect = target.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const floater = document.createElement('span');
    floater.className = `side-combat-float side-combat-float--${type}`;
    floater.textContent = text;
    const isEnemy = target.dataset?.combatTarget === 'enemy';
    floater.style.left = `${targetRect.left - rootRect.left + targetRect.width * (isEnemy ? 0.82 : 0.5)}px`;
    floater.style.top = `${targetRect.top - rootRect.top + targetRect.height * (isEnemy ? -0.08 : 0.22)}px`;
    state.root.appendChild(floater);
    setTimeout(() => floater.remove(), 1250);
}

function shakeEnemy(enemyId) {
    const target = findEnemyElement(enemyId);
    if (!target) return;
    target.classList.remove('is-hit');
    void target.offsetWidth;
    target.classList.add('is-hit');
}

function fireRayToEnemy(enemyId, options = {}) {
    const target = findEnemyElement(enemyId);
    if (!target || !state.root) return;
    const targetRect = target.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const fire = state.getFireScreenPosition?.() || {
        x: rootRect.width * 0.5 - state.getFacing() * 92,
        y: rootRect.height * 0.46
    };
    const end = {
        x: targetRect.left - rootRect.left + targetRect.width * 0.5,
        y: targetRect.top - rootRect.top + targetRect.height * 0.45
    };
    const dx = end.x - fire.x;
    const dy = end.y - fire.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const ray = document.createElement('i');
    ray.className = `side-combat-ray side-combat-ray--${options.type || 'attack'}`;
    ray.style.left = `${fire.x}px`;
    ray.style.top = `${fire.y}px`;
    ray.style.width = `${length}px`;
    ray.style.transform = `rotate(${angle}rad)`;
    ray.style.animationDuration = `${Math.max(360, Number(options.duration) || 620)}ms`;
    state.root.appendChild(ray);
    setTimeout(() => ray.remove(), Math.max(360, Number(options.duration) || 620) + 80);
}

function healingAuraAtFritia(type = 'heal') {
    if (!state.root) return;
    const rootRect = state.root.getBoundingClientRect();
    const panelRect = state.panel?.getBoundingClientRect?.();
    const hitbox = state.getFritiaHitbox?.();
    if (!panelRect || !hitbox) return;
    const cx = panelRect.left - rootRect.left + (hitbox.left + hitbox.right) * 0.5;
    const cy = panelRect.top - rootRect.top + hitbox.top + (hitbox.bottom - hitbox.top) * 0.54;
    const aura = document.createElement('i');
    aura.className = `side-combat-heal-aura side-combat-heal-aura--${type}`;
    aura.style.left = `${cx}px`;
    aura.style.top = `${cy}px`;
    state.root.appendChild(aura);
    for (let i = 0; i < 14; i += 1) {
        const particle = document.createElement('i');
        particle.className = `side-combat-particle side-combat-particle--${type}`;
        particle.style.left = `${cx}px`;
        particle.style.top = `${cy}px`;
        const angle = (Math.PI * 2 * i) / 14;
        const radius = 28 + (i % 4) * 9;
        particle.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
        particle.style.setProperty('--dy', `${Math.sin(angle) * radius}px`);
        particle.style.animationDelay = `${i * 22}ms`;
        state.root.appendChild(particle);
        setTimeout(() => particle.remove(), 1450);
    }
    setTimeout(() => aura.remove(), 1350);
}

function spawnHitParticlesAtEnemy(enemyId, type = 'damage') {
    const target = findEnemyElement(enemyId);
    if (!target || !state.root) return;
    const targetRect = target.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const cx = targetRect.left - rootRect.left + targetRect.width * 0.5;
    const cy = targetRect.top - rootRect.top + targetRect.height * 0.45;
    const count = type === 'summon' ? 16 : 9;
    for (let i = 0; i < count; i += 1) {
        const particle = document.createElement('i');
        particle.className = `side-combat-hit-particle side-combat-hit-particle--${type}`;
        particle.style.left = `${cx}px`;
        particle.style.top = `${cy}px`;
        particle.style.setProperty('--dx', `${Math.cos((Math.PI * 2 * i) / count) * (26 + (i % 3) * 9)}px`);
        particle.style.setProperty('--dy', `${Math.sin((Math.PI * 2 * i) / count) * (18 + (i % 4) * 7)}px`);
        particle.style.animationDelay = `${i * 12}ms`;
        state.root.appendChild(particle);
        setTimeout(() => particle.remove(), 1280);
    }
}

function findEnemyElement(enemyId) {
    const id = String(enemyId || '');
    return [...(state.root?.querySelectorAll('[data-enemy-id]') || [])]
        .find(element => element.dataset.enemyId === id) || null;
}

function updateEffectTimers() {
    renderProgressOnly();
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}
