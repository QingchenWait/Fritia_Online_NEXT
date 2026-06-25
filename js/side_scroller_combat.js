import { buildSideScrollerCardBatch, SIDE_CARD_CATEGORY_LABELS, SIDE_CARD_RARITY_LABELS } from './side_scroller_cards_llm.js?v=20260624-combat-ui';
import { getAffinity } from './game_state.js';
import {
    addCardToSideScrollerArchive,
    cloneArchivedCardForCombat,
    deleteSideScrollerArchiveCard,
    loadSideScrollerArchive,
    setSideScrollerArchiveEquipped
} from './side_scroller_archive.js?v=20260624-combat-ui';
import {
    addSideScrollerScoreRecord,
    loadSideScrollerScores
} from './side_scroller_scores.js?v=20260624-combat-score';

const EVENT_DISTANCE = 560;
const ENCOUNTER_APPROACH_DISTANCE = 240;
const MIN_PLAYER_MAX_HP = 1;
const HAND_SIZE = 4;
const PLAYER_CARD_LIMIT = 3;
const SWORD_ICON = '\u2694\uFE0F';
const BLEED_RATIO = 0.2;
const BLEED_GROWTH_PER_STACK = 0.5;
const GUARD_ATTACK_DOWN = 0.2;
const RUPTURE_SOFT_CAP = 1.2;
const RUPTURE_OVER_CAP_RATE = 0.5;
// 调整敌方浮字整体左右位置：数值越小越靠左，越大越靠右。
const ENEMY_FLOAT_BASE_X = -8;
const ENEMY_FLOAT_BASE_Y = 10;
// 调整芙提雅自身效果浮字位置：X 为角色中心偏移，Y 为角色顶端上方偏移。
const PLAYER_FLOAT_BASE_X = 0;
const PLAYER_FLOAT_BASE_Y = -18;
const PROFILE_FRITIA_SRC = './src/_logos/Profile_Fritia.png';
const ADJUTANT_SKILL_GUARD_SRC = './src/_2d_adventure/2d_fritia/Adjutant_Skill_0.png';
const ADJUTANT_SKILL_EXECUTE_SRC = './src/_2d_adventure/2d_fritia/Adjutant_Skill_1.png';
const TARGET_RETICLE_SRC = './src/_2d_adventure/2d_fritia/target.png';
const CARD_RULE_DOC_SRC = './src/_2d_adventure/card_rule.md';
const SPRITE_ENEMY_CONFIG = {
    variants: {
        '\u8fde\u5f29\u4f1a\u5458': {
            src: './src/_2d_adventure/2d_fritia/Moster_2.png',
            imageRatio: 1191 / 974,
            heightToAdjutant: 0.85,
            minWidthGap: 0.96
        },
        '\u7532\u578b\u5f02\u5316\u4eba': {
            src: './src/_2d_adventure/2d_fritia/Moster_0.png',
            imageRatio: 570 / 957,
            heightToAdjutant: 1.08,
            minWidthGap: 0.86
        },
        '\u6b66\u88c5\u4f1a\u5458': {
            src: './src/_2d_adventure/2d_fritia/Moster_1.png',
            imageRatio: 827 / 1005,
            heightToAdjutant: 1.0,
            minWidthGap: 0.94
        },
        '\u77ed\u5200\u4f1a\u5458': {
            src: './src/_2d_adventure/2d_fritia/Moster_4.png',
            imageRatio: 999 / 1103,
            heightToAdjutant: 1.0,
            minWidthGap: 0.94
        },
        '\u8d50\u798f\u8005': {
            src: './src/_2d_adventure/2d_fritia/Moster_3.png',
            imageRatio: 686 / 1260,
            heightToAdjutant: 1.15,
            minWidthGap: 0.88
        },
        '\u4e01\u578b\u5f02\u5316\u4eba': {
            src: './src/_2d_adventure/2d_fritia/Moster_5.png',
            imageRatio: 918 / 1175,
            heightToAdjutant: 1.3,
            minWidthGap: 0.96
        },
        '\u98df\u591c\u5f71\u517d': {
            src: './src/_2d_adventure/2d_fritia/Moster_6.png',
            imageRatio: 1063 / 1015,
            heightToAdjutant: 1.7,
            minWidthGap: 1.02
        }
    },
    finalCenterRatio: 0.86,
    minGapRatio: 0.085,
    staggerRatio: 0.38,
    standingArea: {
        leftRatio: 0.68,
        rightRatio: 0.965,
        backYOffset: -70,
        frontYOffset: 92,
        minYGap: 34,
        maxYGapRatio: 0.34
    }
};
const BOSS_ATTACK_GROWTH = {
    miniBoss: 0.05,
    boss: 0.08,
    cap: 2.5
};
const CARD_STAGE_VALUE_SCALING = {
    standard: { perStage: 0.10, cap: 1.70 },
    hard: { perStage: 0.075, cap: 1.60 },
    legend: { perStage: 0.055, cap: 1.55 }
};
const SCORE_RULES = {
    normalBase: 120,
    miniBossBase: 420,
    bossBase: 760,
    turnPenalty: 22,
    minimumRate: 0.35
};
const COMPACT_VIEWPORT = {
    minWidth: 760,
    maxHeight: 620,
    extremeMaxHeight: 540,
    minAspect: 2.15,
    extremeAspect: 2.2
};
const DIFFICULTIES = [
    { id: 'standard', label: '标准', detail: '5 关卡 + 1 BOSS', normalEvents: 5, bossEvents: 1 },
    { id: 'hard', label: '困难', detail: '7 关卡 + 1 BOSS', normalEvents: 7, bossEvents: 1 },
    { id: 'legend', label: '传说', detail: '8 关卡 + 2 BOSS', normalEvents: 8, bossEvents: 2, fixedBosses: true }
];

const ENEMY_NAMES = [
    '\u8fde\u5f29\u4f1a\u5458',
    '\u7532\u578b\u5f02\u5316\u4eba',
    '\u6b66\u88c5\u4f1a\u5458',
    '\u77ed\u5200\u4f1a\u5458',
    '\u8d50\u798f\u8005'
];
const BOSS_NAME = '\u98df\u591c\u5f71\u517d';
const MINI_BOSS_NAME = '\u4e01\u578b\u5f02\u5316\u4eba';

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
    currentBattleEvent: null,
    battleStartTurn: 0,
    enemyTurnCount: 0,
    totalEnemyTurns: 0,
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
    executeSeedEnemyId: '',
    executeHoverEnemyId: '',
    executeAimHasPointer: false,
    dragState: null,
    statusPopover: null,
    deckPopoverOpen: false,
    ruleDocOpen: false,
    ruleDocMarkdown: '',
    ruleDocLoading: false,
    ruleDocError: '',
    scoreboardOpen: false,
    scoreRecords: { records: [] },
    archive: { cards: [], equippedIds: [] },
    archiveOpen: false,
    archivePage: 0,
    archiveMessage: '',
    archiveDeleteId: '',
    archiveDeleteName: '',
    carriedCards: [],
    carriedUsedIds: new Set(),
    activeArchiveCard: null,
    infoExpanded: true,
    compactInfoDefaultApplied: false,
    enemyFloatBursts: new Map(),
    playerFloatBursts: { index: 0, at: 0 },
    score: 0,
    scoreKills: 0,
    scoredEnemyIds: new Set(),
    lastScoreRecord: null,
    isNewScoreRecord: false,
    busy: false,
    preloading: false,
    preloadedBatch: null,
    preloadToken: 0,
    log: [],
    getFacing: () => 1,
    getFireScreenPosition: null,
    getFritiaHitbox: null,
    getAdjutantHitbox: null,
    triggerFireAttack: null
};

export function initSideScrollerCombat(options = {}) {
    state.panel = options.panel || document.getElementById('side-scroller-adventure');
    state.getFacing = typeof options.getFacing === 'function' ? options.getFacing : state.getFacing;
    state.getFireScreenPosition = typeof options.getFireScreenPosition === 'function' ? options.getFireScreenPosition : null;
    state.getFritiaHitbox = typeof options.getFritiaHitbox === 'function' ? options.getFritiaHitbox : null;
    state.getAdjutantHitbox = typeof options.getAdjutantHitbox === 'function' ? options.getAdjutantHitbox : null;
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
    state.root?.classList.remove('is-started', 'is-battle', 'is-loading', 'has-visible-hand');
    state.panel?.classList.add('is-side-combat-active');
    state.panel?.classList.remove('is-side-combat-started', 'is-side-combat-hint-visible');
    renderCombat();
}

export function closeSideScrollerCombat() {
    state.visible = false;
    state.root?.classList.add('hidden');
    state.selectedCardId = '';
    state.pendingSkill = '';
    clearExecuteAimState();
    clearBattlePersistentPlayerStatuses();
    clearActiveArchiveCard();
    clearDragState();
    closeStatusPopover();
    closeDeckPopover();
    closeArchivePanel();
    state.panel?.classList.remove('is-side-combat-active', 'is-side-combat-started', 'is-side-combat-hint-visible');
    state.panel?.classList.remove('is-side-combat-compact-wide', 'is-side-combat-extreme-wide');
    state.root?.classList.remove('is-compact-wide', 'is-extreme-wide');
    state.root?.style.removeProperty('--side-combat-ui-scale');
    state.root?.style.removeProperty('--side-combat-compact-progress');
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
    state.currentBattleEvent = null;
    state.battleStartTurn = 0;
    state.enemyTurnCount = 0;
    state.totalEnemyTurns = 0;
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
    clearExecuteAimState();
    state.dragState = null;
    state.statusPopover = null;
    state.deckPopoverOpen = false;
    state.ruleDocOpen = false;
    state.ruleDocError = '';
    state.scoreboardOpen = false;
    state.scoreRecords = loadSideScrollerScores();
    state.archive = loadSideScrollerArchive();
    state.archiveOpen = false;
    state.archivePage = 0;
    state.archiveMessage = '';
    state.archiveDeleteId = '';
    state.archiveDeleteName = '';
    state.carriedCards = [];
    state.carriedUsedIds = new Set();
    state.activeArchiveCard = null;
    state.infoExpanded = true;
    state.compactInfoDefaultApplied = false;
    state.enemyFloatBursts = new Map();
    state.playerFloatBursts = { index: 0, at: 0 };
    state.score = 0;
    state.scoreKills = 0;
    state.scoredEnemyIds = new Set();
    state.lastScoreRecord = null;
    state.isNewScoreRecord = false;
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
        <div class="side-combat-route" aria-live="polite">
            <div id="side-combat-route-map" class="side-combat-route__map"></div>
            <strong id="side-combat-progress">事件 0/0</strong>
            <span id="side-combat-score-live" class="side-combat-score-live">积分 0</span>
        </div>
        <div class="side-combat-statusbar" aria-live="polite">
            <div class="side-combat-skills">
                <button id="side-combat-skill-guard" class="side-combat-skill side-combat-skill--guard" type="button" aria-label="神之守护">
                    <img src="${ADJUTANT_SKILL_GUARD_SRC}" alt="" aria-hidden="true">
                    <span id="side-combat-skill-guard-count">3</span>
                </button>
                <button id="side-combat-skill-execute" class="side-combat-skill side-combat-skill--execute" type="button" aria-label="御驾亲征">
                    <img src="${ADJUTANT_SKILL_EXECUTE_SRC}" alt="" aria-hidden="true">
                    <span id="side-combat-skill-execute-count">3</span>
                </button>
            </div>
        </div>
        <div id="side-combat-player-panel" class="side-combat-player" data-combat-target="self" role="button" tabindex="0" aria-label="选择芙提雅">
            <div class="side-combat-player__meta">
                <strong id="side-combat-player-hp">120/120</strong>
                <div class="side-combat-hp"><i id="side-combat-player-hp-bar"></i></div>
                <div id="side-combat-player-status" class="side-combat-status-icons"></div>
            </div>
            <img class="side-combat-player__avatar" src="${PROFILE_FRITIA_SRC}" alt="" aria-hidden="true">
        </div>
        <div id="side-combat-sprite-enemy-layer" class="side-combat-sprite-enemy-layer"></div>
        <div id="side-combat-enemy-layer" class="side-combat-enemy-layer"></div>
        <div id="side-combat-world-status-layer" class="side-combat-world-status-layer"></div>
        <div id="side-combat-target-layer" class="side-combat-target-layer"></div>
        <div id="side-combat-log" class="side-combat-log"></div>
        <div id="side-combat-hand" class="side-combat-hand" aria-label="战斗卡牌"></div>
        <button id="side-combat-deck-toggle" class="side-combat-round side-combat-deck-toggle" type="button" aria-label="查看本轮卡池" title="查看本轮卡池">
            <span class="side-combat-round__icon">☰</span>
            <span id="side-combat-deck-count" class="side-combat-round__badge">0</span>
        </button>
        <button id="side-combat-refresh" class="side-combat-round side-combat-refresh-round" type="button" aria-label="重新抽牌" title="重新抽牌">
            <span class="side-combat-round__icon">↻</span>
            <span id="side-combat-refresh-count" class="side-combat-round__badge">0</span>
            <small id="side-combat-refresh-tag" class="side-combat-refresh-tag">不会结束回合</small>
        </button>
        <button id="side-combat-discard" class="side-combat-discard" type="button" aria-label="弃牌" title="拖拽手牌到这里弃牌">🗑️</button>
        <span id="side-combat-play-count" class="side-combat-play-count" aria-live="polite">💠 3/3</span>
        <button id="side-combat-info-toggle" class="side-combat-round side-combat-info-toggle" type="button" aria-label="展开或收起战斗信息" title="展开或收起战斗信息">
            <span class="side-combat-round__icon">i</span>
        </button>
        <button id="side-combat-rule-toggle" class="side-combat-round side-combat-rule-toggle" type="button" aria-label="打开战术文档" title="打开战术文档">
            <span class="side-combat-round__icon">?</span>
        </button>
        <button id="side-combat-scoreboard-toggle" class="side-combat-round side-combat-scoreboard-toggle" type="button" aria-label="打开分数记录" title="打开分数记录">
            <span class="side-combat-round__icon side-combat-round__icon--image" aria-hidden="true">
                <img src="src/_logos/icon_scoreboard_trophy.svg" alt="">
            </span>
        </button>
        <aside id="side-combat-archive" class="side-combat-archive" aria-label="典藏牌库">
            <button id="side-combat-archive-toggle" class="side-combat-round side-combat-archive-toggle" type="button" aria-label="打开典藏牌库" title="打开典藏牌库">
                <span class="side-combat-archive-db" aria-hidden="true"><i></i></span>
                <span id="side-combat-archive-count" class="side-combat-round__badge">0</span>
            </button>
            <div id="side-combat-carry-slots" class="side-combat-carry-slots" aria-label="携带典藏卡牌"></div>
        </aside>
        <div id="side-combat-archive-cast-layer" class="side-combat-archive-cast-layer"></div>
        <div id="side-combat-archive-panel" class="side-combat-archive-panel hidden" aria-live="polite">
            <div class="side-combat-archive-panel__head">
                <div>
                    <span>ARCHIVE</span>
                    <strong>典藏牌库</strong>
                </div>
                <button id="side-combat-archive-close" type="button" aria-label="关闭典藏牌库">×</button>
            </div>
            <div id="side-combat-archive-grid" class="side-combat-archive-grid"></div>
            <div class="side-combat-archive-panel__foot">
                <button id="side-combat-archive-prev" type="button" aria-label="上一页">‹</button>
                <span id="side-combat-archive-page">1/1</span>
                <button id="side-combat-archive-next" type="button" aria-label="下一页">›</button>
            </div>
            <p id="side-combat-archive-status" class="side-combat-archive-status"></p>
            <div id="side-combat-archive-confirm" class="side-combat-archive-confirm hidden" role="dialog" aria-modal="true">
                <strong>删除典藏卡牌？</strong>
                <span id="side-combat-archive-confirm-name"></span>
                <div>
                    <button id="side-combat-archive-delete-cancel" type="button">取消</button>
                    <button id="side-combat-archive-delete-confirm" class="danger" type="button">确认删除</button>
                </div>
            </div>
        </div>
        <div id="side-combat-rule-panel" class="side-combat-rule-panel hidden" aria-live="polite">
            <div class="side-combat-rule-panel__head">
                <strong>战术考核规则简介</strong>
                <button id="side-combat-rule-close" type="button" aria-label="关闭战术文档">×</button>
            </div>
            <div id="side-combat-rule-content" class="side-combat-rule-content"></div>
        </div>
        <div id="side-combat-scoreboard-panel" class="side-combat-scoreboard-panel hidden" aria-live="polite">
            <div class="side-combat-scoreboard-panel__head">
                <div>
                    <span>SCORE</span>
                    <strong>分数记录</strong>
                </div>
                <button id="side-combat-scoreboard-close" type="button" aria-label="关闭分数记录">×</button>
            </div>
            <div id="side-combat-scoreboard-list" class="side-combat-scoreboard-list"></div>
        </div>
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
                <p>输入任意你想尝试的战斗风格！陶董会参考你的需求发放卡牌。</p>
                <textarea id="side-combat-style-input" maxlength="240" placeholder="例如：高爆发单体攻击、增益叠 BUFF 流、偏治疗护盾、召唤火种协同"></textarea>
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
                <div id="side-combat-complete-score" class="side-combat-complete-score"></div>
                <p id="side-combat-complete-text">战术考核完成。</p>
                <button id="side-combat-restart" type="button">返回起点</button>
            </div>
        </div>
        <div id="side-combat-tooltip" class="side-combat-tooltip hidden"></div>
    `;
    state.panel.appendChild(root);
    state.root = root;
    state.els = {
        progress: root.querySelector('#side-combat-progress'),
        scoreLive: root.querySelector('#side-combat-score-live'),
        routeMap: root.querySelector('#side-combat-route-map'),
        refreshCount: root.querySelector('#side-combat-refresh-count'),
        refreshTag: root.querySelector('#side-combat-refresh-tag'),
        refresh: root.querySelector('#side-combat-refresh'),
        playerPanel: root.querySelector('#side-combat-player-panel'),
        playerHp: root.querySelector('#side-combat-player-hp'),
        playerHpBar: root.querySelector('#side-combat-player-hp-bar'),
        playerStatus: root.querySelector('#side-combat-player-status'),
        guard: root.querySelector('#side-combat-skill-guard'),
        guardCount: root.querySelector('#side-combat-skill-guard-count'),
        execute: root.querySelector('#side-combat-skill-execute'),
        executeCount: root.querySelector('#side-combat-skill-execute-count'),
        spriteEnemyLayer: root.querySelector('#side-combat-sprite-enemy-layer'),
        enemyLayer: root.querySelector('#side-combat-enemy-layer'),
        worldStatusLayer: root.querySelector('#side-combat-world-status-layer'),
        targetLayer: root.querySelector('#side-combat-target-layer'),
        hand: root.querySelector('#side-combat-hand'),
        deckToggle: root.querySelector('#side-combat-deck-toggle'),
        deckCount: root.querySelector('#side-combat-deck-count'),
        discard: root.querySelector('#side-combat-discard'),
        playCount: root.querySelector('#side-combat-play-count'),
        infoToggle: root.querySelector('#side-combat-info-toggle'),
        ruleToggle: root.querySelector('#side-combat-rule-toggle'),
        rulePanel: root.querySelector('#side-combat-rule-panel'),
        ruleClose: root.querySelector('#side-combat-rule-close'),
        ruleContent: root.querySelector('#side-combat-rule-content'),
        scoreboardToggle: root.querySelector('#side-combat-scoreboard-toggle'),
        scoreboardPanel: root.querySelector('#side-combat-scoreboard-panel'),
        scoreboardClose: root.querySelector('#side-combat-scoreboard-close'),
        scoreboardList: root.querySelector('#side-combat-scoreboard-list'),
        archive: root.querySelector('#side-combat-archive'),
        archiveToggle: root.querySelector('#side-combat-archive-toggle'),
        archiveCount: root.querySelector('#side-combat-archive-count'),
        carrySlots: root.querySelector('#side-combat-carry-slots'),
        archiveCastLayer: root.querySelector('#side-combat-archive-cast-layer'),
        archivePanel: root.querySelector('#side-combat-archive-panel'),
        archiveClose: root.querySelector('#side-combat-archive-close'),
        archiveGrid: root.querySelector('#side-combat-archive-grid'),
        archivePrev: root.querySelector('#side-combat-archive-prev'),
        archiveNext: root.querySelector('#side-combat-archive-next'),
        archivePage: root.querySelector('#side-combat-archive-page'),
        archiveStatus: root.querySelector('#side-combat-archive-status'),
        archiveConfirm: root.querySelector('#side-combat-archive-confirm'),
        archiveConfirmName: root.querySelector('#side-combat-archive-confirm-name'),
        archiveDeleteCancel: root.querySelector('#side-combat-archive-delete-cancel'),
        archiveDeleteConfirm: root.querySelector('#side-combat-archive-delete-confirm'),
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
        completeScore: root.querySelector('#side-combat-complete-score'),
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
    state.els.archiveToggle?.addEventListener('click', event => {
        event.stopPropagation();
        toggleArchivePanel();
    });
    state.els.ruleToggle?.addEventListener('click', event => {
        event.stopPropagation();
        void toggleRuleDocPanel();
    });
    state.els.ruleClose?.addEventListener('click', event => {
        event.stopPropagation();
        closeRuleDocPanel();
    });
    state.els.scoreboardToggle?.addEventListener('click', event => {
        event.stopPropagation();
        toggleScoreboardPanel();
    });
    state.els.scoreboardClose?.addEventListener('click', event => {
        event.stopPropagation();
        closeScoreboardPanel();
    });
    state.els.archiveClose?.addEventListener('click', event => {
        event.stopPropagation();
        closeArchivePanel();
    });
    state.els.archivePrev?.addEventListener('click', event => {
        event.stopPropagation();
        changeArchivePage(-1);
    });
    state.els.archiveNext?.addEventListener('click', event => {
        event.stopPropagation();
        changeArchivePage(1);
    });
    state.els.archiveDeleteCancel?.addEventListener('click', event => {
        event.stopPropagation();
        closeArchiveDeleteConfirm();
    });
    state.els.archiveDeleteConfirm?.addEventListener('click', event => {
        event.stopPropagation();
        confirmArchiveDelete();
    });
    state.els.infoToggle?.addEventListener('click', event => {
        event.stopPropagation();
        toggleInfoLog();
    });
    state.els.guard?.addEventListener('click', () => void useGuardSkill());
    state.els.execute?.addEventListener('click', () => void armExecuteSkill());
    state.els.endTurn?.addEventListener('click', () => void endPlayerTurn());
    state.els.continue?.addEventListener('click', continueWalking);
    state.els.restart?.addEventListener('click', openSideScrollerCombat);
    state.root?.addEventListener('pointerdown', event => {
        if (!event.target?.closest?.('.side-combat-status, .side-combat-tooltip')) closeStatusPopover();
        if (!event.target?.closest?.('#side-combat-deck-toggle, .side-combat-tooltip--deck')) closeDeckPopover();
        if (!event.target?.closest?.('#side-combat-archive-panel, #side-combat-archive-toggle')) closeArchivePanel();
        if (!event.target?.closest?.('#side-combat-rule-panel, #side-combat-rule-toggle')) closeRuleDocPanel();
        if (!event.target?.closest?.('#side-combat-scoreboard-panel, #side-combat-scoreboard-toggle')) closeScoreboardPanel();
    });
    state.root?.addEventListener('pointermove', handleCombatPointerMove);
    state.root?.addEventListener('pointerleave', handleCombatPointerLeave);
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
    window.addEventListener('resize', handleCombatViewportChange);
    window.addEventListener('orientationchange', handleCombatViewportChange);
}

async function startRun() {
    if (state.busy) return;
    state.styleText = state.els.styleInput?.value?.trim() || '';
    state.events = createEventRoute();
    state.archive = loadSideScrollerArchive();
    state.carriedCards = getEquippedArchiveCards();
    state.carriedUsedIds = new Set();
    state.activeArchiveCard = null;
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
        for (let i = 0; i < 4; i += 1) events.push(createNormalRouteEvent(i, difficulty));
        events.push({ kind: 'miniBoss', level: 5 });
        for (let i = 5; i < 9; i += 1) events.push(createNormalRouteEvent(i, difficulty));
        events.push({ kind: 'boss', level: 10 });
        return enforceSupplyRouteRules(events, difficulty);
    }
    for (let i = 0; i < difficulty.normalEvents; i += 1) {
        events.push(createNormalRouteEvent(i, difficulty));
    }
    for (let i = 0; i < difficulty.bossEvents; i += 1) {
        events.push({ kind: 'boss', level: difficulty.normalEvents + i + 1 });
    }
    return enforceSupplyRouteRules(events, difficulty);
}

function createNormalRouteEvent(index, difficulty = currentDifficulty()) {
    if (index < 2) return { kind: 'enemy', level: index + 1 };
    const roll = Math.random();
    if (difficulty.id === 'standard') {
        if (roll < 0.78) return { kind: 'enemy', level: index + 1 };
        if (roll < 0.90) return { kind: 'supply', level: index + 1 };
        return { kind: 'rare', level: index + 1 };
    }
    if (difficulty.id === 'legend') {
        if (roll < 0.68) return { kind: 'enemy', level: index + 1 };
        if (roll < 0.92) return { kind: 'supply', level: index + 1 };
        return { kind: 'rare', level: index + 1 };
    }
    if (roll < 0.72) return { kind: 'enemy', level: index + 1 };
    if (roll < 0.95) return { kind: 'supply', level: index + 1 };
    return { kind: 'rare', level: index + 1 };
}

function enforceSupplyRouteRules(events, difficulty = currentDifficulty()) {
    if (difficulty.id === 'standard') return limitSupplyEvents(events, 1);
    if (difficulty.id === 'legend') return ensureSupplyEventRange(limitSupplyEvents(events, 2), 1, 2);
    return events;
}

function limitSupplyEvents(events, maxCount) {
    let seen = 0;
    return events.map(event => {
        if (event.kind !== 'supply') return event;
        seen += 1;
        return seen > maxCount ? { ...event, kind: 'enemy' } : event;
    });
}

function ensureSupplyEventRange(events, minCount, maxCount) {
    let supplyCount = events.filter(event => event.kind === 'supply').length;
    const result = events.map(event => ({ ...event }));
    for (let index = 2; index < result.length && supplyCount < minCount; index += 1) {
        if (result[index].kind !== 'enemy') continue;
        result[index].kind = 'supply';
        supplyCount += 1;
    }
    for (let index = 2; index < result.length && supplyCount < minCount; index += 1) {
        if (result[index].kind !== 'rare') continue;
        result[index].kind = 'supply';
        supplyCount += 1;
    }
    return limitSupplyEvents(result, maxCount);
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
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 80);
        pushLog('稀有信标：获得 1 次卡牌刷新，并恢复 80 HP。');
        showReward('RARE SIGNAL', '获得 1 次卡牌刷新，并恢复 80 HP。');
        return;
    }
    beginEncounter(event);
}

function beginEncounter(event) {
    state.phase = 'encounter';
    state.busy = false;
    state.pendingEvent = event;
    state.currentBattleEvent = null;
    state.enemyTurnCount = 0;
    state.encounterProgress = 0;
    state.enemies = createEnemies(event);
    state.playsUsed = 0;
    state.selectedCardId = '';
    state.pendingSkill = '';
    clearExecuteAimState();
    pushLog(isBossEvent(event) ? 'Boss 信号锁定，继续前进接敌。' : '敌对反应接近，继续前进接敌。');
    renderCombat();
}

function advanceEncounterApproach(distance) {
    state.encounterProgress = Math.min(ENCOUNTER_APPROACH_DISTANCE, state.encounterProgress + distance);
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
    clearExecuteAimState();
    state.pendingEvent = null;
    state.currentBattleEvent = event;
    state.enemyTurnCount = 0;
    state.battleStartTurn = 0;
    pushLog(isBossEvent(event) ? 'Boss 信号锁定。' : '敌对反应接近。');
    if (!state.hand.length && !state.deck.length) pushLog('当前卡池已空，请使用预加载卡池。');
    else if (state.hand.length < HAND_SIZE && !state.deck.length) pushLog('当前手牌不足，卡池已空。');
    pushLog('玩家回合开始。拖动或点击卡牌选择目标。');
    renderCombat();
    await autoRefreshEmptyCardPool();
    if (state.phase === 'battle') maybeFailNoDamageOptions();
}

function createEnemies(event) {
    if (event.kind === 'miniBoss') {
        const hp = 240 * 2;
        return [withEnemyVisualType({
            id: `miniboss-${Date.now()}`,
            name: MINI_BOSS_NAME,
            boss: true,
            miniBoss: true,
            maxHp: hp,
            hp,
            attack: 15,
            statuses: []
        })];
    }
    if (event.kind === 'boss') {
        const hp = 360 * 2;
        return [withEnemyVisualType({
            id: `boss-${Date.now()}`,
            name: BOSS_NAME,
            boss: true,
            maxHp: hp,
            hp,
            attack: 18,
            statuses: []
        })];
    }
    const count = event.level >= 5 ? 3 : (event.level >= 3 ? 2 : 1);
    return Array.from({ length: count }, (_, index) => {
        const hp = (58 + event.level * 9 + index * 10) * 2;
        const enemy = {
            id: `enemy-${Date.now()}-${index}`,
            name: ENEMY_NAMES[(event.level + index) % ENEMY_NAMES.length],
            boss: false,
            maxHp: hp,
            hp,
            attack: 9 + event.level * 2 + index,
            statuses: []
        };
        return withEnemyVisualType(enemy);
    });
}

function shouldUseSpriteEnemy(enemy) {
    return Boolean(getSpriteEnemyVariant(enemy));
}

function withEnemyVisualType(enemy) {
    return {
        ...enemy,
        visualType: shouldUseSpriteEnemy(enemy) ? 'sprite' : 'card'
    };
}

function isSpriteEnemy(enemy) {
    return enemy?.visualType === 'sprite';
}

async function refreshCards({ consume, reason }) {
    const isManualRefresh = reason === 'manual';
    const shouldConsumeRefresh = Boolean(consume);
    if (state.busy && isManualRefresh) return false;
    const previousBusy = state.busy;
    const shouldEndTurnAfterManualRefresh = isManualRefresh
        && state.phase === 'battle'
        && getRemainingCardPoolCount() > HAND_SIZE;
    let batch = null;
    if (shouldConsumeRefresh) {
        if (state.refreshCount <= 0) {
            pushLog('全局刷新次数不足。');
            renderCombat();
            return false;
        }
        if (isManualRefresh && !state.preloadedBatch) {
            pushLog(state.preloading ? '下一组卡池仍在预加载中。' : '下一组卡池尚未预加载完成。');
            renderCombat();
            return false;
        }
        state.refreshCount -= 1;
        if (state.preloadedBatch) {
            batch = state.preloadedBatch;
            state.preloadedBatch = null;
            pushLog(isManualRefresh ? '已使用预加载战术卡组。' : '牌堆已空，自动启用一次全局刷新。');
            scheduleCardPreload(isManualRefresh ? 'after-refresh' : 'after-empty-auto');
        } else {
            state.busy = true;
            renderCombat();
            pushLog('牌堆已空，正在自动补充新战术卡池。');
            batch = await buildSideScrollerCardBatch({ styleText: state.styleText, reason });
            scheduleCardPreload('after-empty-auto');
        }
    } else {
        state.busy = true;
        renderCombat();
        batch = await buildSideScrollerCardBatch({ styleText: state.styleText, reason });
    }
    if (!state.visible) {
        state.busy = previousBusy && !isManualRefresh;
        return false;
    }
    applyCardBatch(batch);
    if (batch.source === 'llm') pushLog('战术卡组已由模型命名。');
    else if (batch.message) {
        pushLog(`使用本地战术卡组：${batch.message}`);
        console.error('[SideScrollerCombat] Card batch fell back to local cards.', batch.diagnostics || batch.message);
    }
    state.selectedCardId = '';
    state.busy = previousBusy && !isManualRefresh;
    if (isManualRefresh) state.busy = false;
    if (maybeFailNoDamageOptions()) return true;
    renderCombat();
    if (shouldEndTurnAfterManualRefresh) await endPlayerTurn({ force: true });
    return true;
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
    clearExecuteAimState();
    state.selectedCardId = state.selectedCardId === cardId ? '' : cardId;
    renderCombat();
}

function handleCombatPointerMove(event) {
    if (state.pendingSkill !== 'execute' || state.phase !== 'battle' || state.busy) return;
    const enemy = findEnemyByPoint(event.clientX, event.clientY);
    state.executeAimHasPointer = Boolean(enemy);
    state.executeHoverEnemyId = enemy?.id || '';
    renderDragTargetHints();
}

function handleCombatPointerLeave() {
    if (state.pendingSkill !== 'execute') return;
    state.executeAimHasPointer = false;
    state.executeHoverEnemyId = '';
    renderDragTargetHints();
}

function clearExecuteAimState() {
    state.executeSeedEnemyId = '';
    state.executeHoverEnemyId = '';
    state.executeAimHasPointer = false;
}

function getRandomSelectableEnemy() {
    const enemies = state.enemies.filter(enemy => isAlive(enemy) && isExecuteUsableOnEnemy(enemy));
    if (!enemies.length) return null;
    return enemies[Math.floor(Math.random() * enemies.length)];
}

function findEnemyByPoint(clientX, clientY) {
    const element = findEnemyTargetElementAtPoint(clientX, clientY);
    const enemyId = element?.dataset?.enemyId || '';
    const enemy = enemyId ? findSelectableEnemy(enemyId) : null;
    if (!enemy || (state.pendingSkill === 'execute' && !isExecuteUsableOnEnemy(enemy))) return null;
    return enemy;
}

function handleTargetSelection(targetId) {
    if (state.phase !== 'battle' || state.busy) return;
    if (state.pendingSkill === 'execute') {
        const enemy = findSelectableEnemy(targetId);
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
    const target = targetId === 'self' ? state.player : findSelectableEnemy(targetId);
    if (!target) return;
    void playCard(card, target);
}

function tryPlayCardOnTarget(cardId, targetId) {
    if (state.phase !== 'battle' || state.busy) return false;
    state.pendingSkill = '';
    clearExecuteAimState();
    const card = findPlayableCard(cardId);
    if (!card) return false;
    if (state.playsUsed >= PLAYER_CARD_LIMIT) {
        pushLog('本回合出牌次数已满。');
        renderCombat();
        return false;
    }
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
    const target = targetId === 'self' ? state.player : findSelectableEnemy(targetId);
    if (!target) return false;
    state.selectedCardId = cardId;
    void playCard(card, target);
    return true;
}

function findPlayableCard(cardId) {
    return state.hand.find(item => item.id === cardId) || (state.activeArchiveCard?.id === cardId ? state.activeArchiveCard : null);
}

function findSelectableEnemy(enemyId) {
    const enemy = state.enemies.find(item => item.id === enemyId);
    if (!enemy) return null;
    if (state.enemies.length > 1 && !isAlive(enemy)) return null;
    return enemy;
}

function clearActiveArchiveCard() {
    state.activeArchiveCard = null;
    if (state.els.archiveCastLayer) state.els.archiveCastLayer.textContent = '';
}

async function playCard(card, target) {
    if (state.playsUsed >= PLAYER_CARD_LIMIT) {
        pushLog('本回合出牌次数已满。');
        renderCombat();
        return;
    }
    state.busy = true;
    const fromArchive = card.source === 'archive';
    if (fromArchive) {
        state.carriedUsedIds.add(card.archiveId);
        state.activeArchiveCard = null;
    } else {
        state.hand = state.hand.filter(item => item.id !== card.id);
    }
    state.selectedCardId = '';
    state.playsUsed += 1;
    try {
        await applyCardEffect(card, target);
    } finally {
        state.busy = false;
    }
    if (!fromArchive) drawUntilHandSize();
    if (isBattleWon()) {
        finishBattle();
        return;
    }
    await autoRefreshEmptyCardPool();
    if (state.phase !== 'battle') return;
    if (maybeFailNoDamageOptions()) return;
    if (state.playsUsed >= PLAYER_CARD_LIMIT) await endPlayerTurn();
    else renderCombat();
}

async function applyCardEffect(card, target) {
    if (card.category === 'heal') {
        if (card.effectKind === 'armor') {
            const amount = scaleFlatCardValue(card.value);
            state.player.armor = Math.max(0, Math.round(Number(state.player.armor) || 0)) + amount;
            floatAtPlayer(`🛡️ +${amount}`, 'shield');
            healingAuraAtFritia('shield');
            pushLog(`${card.name}: 获得 ${amount} 护甲。`);
            return;
        }
        const before = state.player.hp;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + scaleFlatCardValue(card.value));
        floatAtPlayer(`❤️ +${state.player.hp - before}`, 'heal');
        healingAuraAtFritia();
        pushLog(`${card.name}：恢复 ${state.player.hp - before} HP。`);
        return;
    }
    if (card.category === 'buff') {
        if (card.effectKind === 'bleed_growth') {
            addStatus(target, 'bleed_growth', 999, 1);
            floatAtEnemy(target.id, '🩸+50%', 'status');
            pushLog(`${card.name}: 施加血燃。`);
            return;
        }
        if (card.effectKind === 'rupture_stack') {
            addStatus(target, 'rupture_stack', 999, card.value);
            floatAtEnemy(target.id, '💥+', 'status');
            pushLog(`${card.name}: 施加裂解。`);
            return;
        }
        if (card.effectKind === 'focus_chain') {
            addStatus(state.player, 'focus_chain', 999, card.value);
            floatAtPlayer(`⚔️ +${Math.round(card.value * 100)}%`, 'status');
            healingAuraAtFritia('focus');
            pushLog(`${card.name}：连锁专注叠加。`);
            return;
        }
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
        if (card.effectKind === 'focus') {
            addStatus(state.player, 'focus', card.duration, card.value);
            floatAtPlayer(`⚔️ +${Math.round(card.value * 100)}%`, 'status');
        } else {
            addStatus(state.player, 'shield', card.duration, card.value);
            floatAtPlayer(`🛡️ +${Math.round(card.value * 100)}%`, 'shield');
        }
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
    const baseDamage = getEffectiveCardDamageValue(card);
    targets.forEach(enemy => {
        dealDamage(enemy, baseDamage, card, { source: effectType });
        awardScoreForDeadEnemy(enemy);
        if (card.category === 'summon') addSummonBleed(enemy, baseDamage);
        fireRayToEnemy(enemy.id, { type: effectType, duration: effectType === 'summon' ? 1150 : 860 });
        spawnHitParticlesAtEnemy(enemy.id, effectType);
    });
    pushLog(isAreaCard(card)
        ? `${card.name}：群体造成 ${baseDamage} 伤害。`
        : `${card.name}：造成 ${baseDamage} 伤害。`);
}

function computeOutgoingDamage(base) {
    const focus = sumStatusValue(state.player, 'focus') + sumStatusValue(state.player, 'focus_chain');
    return Math.max(1, Math.round(base * (1 + focus)));
}

function dealDamage(enemy, amount, card = null, options = {}) {
    const vulnerable = sumStatusValue(enemy, 'vulnerable');
    const rupture = computeRuptureMultiplier(enemy) - 1;
    const damage = Math.max(1, Math.round(computeOutgoingDamage(amount) * (1 + vulnerable + rupture)));
    enemy.hp = Math.max(0, enemy.hp - damage);
    const type = options.source === 'bleed' ? 'bleed' : (card?.category === 'summon' ? 'fire' : 'damage');
    floatAtEnemy(enemy.id, `-${damage}`, type);
    spawnHitParticlesAtEnemy(enemy.id, card?.category === 'summon' ? 'summon' : type);
    shakeEnemy(enemy.id);
    return damage;
}

async function endPlayerTurn(options = {}) {
    if (state.phase !== 'battle' || (state.busy && !options.force)) return;
    state.selectedCardId = '';
    state.pendingSkill = '';
    clearExecuteAimState();
    state.busy = true;
    renderCombat();
    await wait(260);
    state.enemyTurnCount += 1;
    state.totalEnemyTurns += 1;
    await resolveBleedBeforeEnemyTurn();
    if (isBattleWon()) {
        finishBattle();
        return;
    }
    pushLog('敌方回合。');
    for (const enemy of state.enemies.filter(isAlive)) {
        if (isEnemyActionBlocked(enemy)) {
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
    await autoRefreshEmptyCardPool();
    if (state.phase !== 'battle') return;
    if (maybeFailNoDamageOptions()) return;
    pushLog('玩家回合开始。');
    renderCombat();
}

async function resolveBleedBeforeEnemyTurn() {
    const bleedingEnemies = state.enemies.filter(enemy => isAlive(enemy) && getBleedRawTotal(enemy) > 0);
    if (!bleedingEnemies.length) return;
    pushLog('流血状态结算。');
    bleedingEnemies.forEach(enemy => {
        const enemyAmplifierAlreadyApplied = growBleedLayers(enemy);
        const rawBleed = getBleedRawTotal(enemy);
        if (rawBleed <= 0) return;
        dealBleedDamage(enemy, rawBleed, { enemyAmplifierAlreadyApplied });
    });
    renderCombat();
    await wait(320);
}

function computeEnemyIntentDamage(enemy) {
    if (!isAlive(enemy) || isEnemyActionBlocked(enemy)) return 0;
    return computeIncomingDamage(getEnemyAttackValue(enemy), enemy);
}

function formatEnemyIntentText(damage) {
    return `${SWORD_ICON} ${Math.max(0, Math.round(Number(damage) || 0))}`;
}

function isEnemyActionBlocked(enemy) {
    return hasStatus(enemy, 'freeze') || hasStatus(enemy, 'silence');
}

function getEnemyAttackValue(enemy) {
    const base = Number(enemy?.attack) || 0;
    if (!enemy?.boss) return base;
    const growth = enemy.miniBoss ? BOSS_ATTACK_GROWTH.miniBoss : BOSS_ATTACK_GROWTH.boss;
    const multiplier = Math.min(BOSS_ATTACK_GROWTH.cap, 1 + Math.max(0, state.enemyTurnCount) * growth);
    return Math.round(base * multiplier);
}

function computeIncomingDamage(base, enemy = null) {
    const defense = sumStatusValue(state.player, 'shield') + sumStatusValue(state.player, 'guard_defense');
    const weaken = enemy ? sumStatusValue(enemy, 'weaken') : 0;
    return Math.max(1, Math.round(base * Math.max(0.18, 1 - defense) * Math.max(0.18, 1 - weaken)));
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

function addSummonBleed(enemy, baseDamage) {
    if (!enemy || !isAlive(enemy)) return;
    const bleed = Math.max(1, Math.floor((Number(baseDamage) || 0) * BLEED_RATIO));
    addStatus(enemy, 'bleed', 999, bleed);
    floatAtEnemy(enemy.id, `🩸+${bleed}`, 'status');
}

function growBleedLayers(enemy) {
    const growthStacks = countStatus(enemy, 'bleed_growth');
    if (growthStacks <= 0) return false;
    const multiplier = getBleedGrowthMultiplier(enemy);
    enemy.statuses
        .filter(status => status.id === 'bleed' && status.turns > 0)
        .forEach(status => {
            status.value = Math.max(1, Math.round((Number(status.value) || 0) * multiplier));
        });
    return true;
}

function getBleedRawTotal(enemy) {
    return enemy.statuses
        .filter(status => status.id === 'bleed' && status.turns > 0)
        .reduce((sum, status) => sum + Math.max(0, Number(status.value) || 0), 0);
}

function getNextBleedRawTotal(enemy) {
    const raw = getBleedRawTotal(enemy);
    if (raw <= 0) return 0;
    return Math.max(1, Math.round(raw * getBleedGrowthMultiplier(enemy)));
}

function getBleedDamagePreview(enemy) {
    const enemyAmplifierAlreadyApplied = countStatus(enemy, 'bleed_growth') > 0;
    const raw = enemyAmplifierAlreadyApplied ? getNextBleedRawTotal(enemy) : getBleedRawTotal(enemy);
    if (raw <= 0) return 0;
    return computeBleedDamage(enemy, raw, { enemyAmplifierAlreadyApplied });
}

function computeBleedDamage(enemy, rawBleed, options = {}) {
    const playerAmplified = computeOutgoingDamage(rawBleed);
    if (options.enemyAmplifierAlreadyApplied) return playerAmplified;
    const vulnerable = sumStatusValue(enemy, 'vulnerable');
    const rupture = computeRuptureMultiplier(enemy) - 1;
    return Math.max(1, Math.round(playerAmplified * (1 + vulnerable + rupture)));
}

function dealBleedDamage(enemy, rawBleed, options = {}) {
    const damage = computeBleedDamage(enemy, rawBleed, options);
    enemy.hp = Math.max(0, enemy.hp - damage);
    floatAtEnemy(enemy.id, `-${damage}`, 'bleed');
    spawnHitParticlesAtEnemy(enemy.id, 'bleed');
    shakeEnemy(enemy.id);
    awardScoreForDeadEnemy(enemy);
    return damage;
}

function getBleedGrowthMultiplier(enemy) {
    const growthStacks = countStatus(enemy, 'bleed_growth');
    if (growthStacks <= 0) return 1;
    const enemyAmplifier = 1 + sumStatusValue(enemy, 'vulnerable') + (computeRuptureMultiplier(enemy) - 1);
    return Math.max(1, (1 + growthStacks * BLEED_GROWTH_PER_STACK) * enemyAmplifier);
}

function awardScoreForDeadEnemy(enemy) {
    if (!enemy || isAlive(enemy) || state.scoredEnemyIds.has(enemy.id)) return 0;
    const gained = computeEnemyScore(enemy);
    state.scoredEnemyIds.add(enemy.id);
    state.score += gained;
    state.scoreKills += 1;
    floatAtEnemy(enemy.id, `+${gained}`, 'score');
    pushLog(`${enemy.name}: 击破获得 ${gained} 积分。`);
    renderProgressOnly();
    return gained;
}

function computeEnemyScore(enemy) {
    const base = getEnemyScoreBase(enemy);
    const turnsUsed = Math.max(0, state.enemyTurnCount - state.battleStartTurn);
    const minimum = Math.floor(base * SCORE_RULES.minimumRate);
    return Math.max(minimum, base - turnsUsed * SCORE_RULES.turnPenalty);
}

function getEnemyScoreBase(enemy) {
    if (enemy?.boss && enemy?.miniBoss) return SCORE_RULES.miniBossBase;
    if (enemy?.boss) return SCORE_RULES.bossBase;
    return SCORE_RULES.normalBase;
}

function finalizeRunScore() {
    if (state.lastScoreRecord || state.score <= 0) return;
    const difficulty = currentDifficulty();
    const result = addSideScrollerScoreRecord({
        score: state.score,
        difficulty: difficulty.id,
        difficultyLabel: difficulty.label,
        eventsCleared: state.eventIndex,
        kills: state.scoreKills,
        turns: state.totalEnemyTurns,
        completedAt: Date.now()
    });
    if (result.ok) {
        state.lastScoreRecord = result.record;
        state.isNewScoreRecord = result.isNewRecord;
        state.scoreRecords = result.scores;
    }
}

function computeRuptureMultiplier(enemy) {
    const raw = sumStatusValue(enemy, 'rupture_stack');
    if (raw <= RUPTURE_SOFT_CAP) return 1 + raw;
    return 1 + RUPTURE_SOFT_CAP + (raw - RUPTURE_SOFT_CAP) * RUPTURE_OVER_CAP_RATE;
}

function getCurrentStageLevel() {
    return Math.max(1, Math.round(Number(state.currentBattleEvent?.level || state.eventIndex || 1) || 1));
}

function getStageValueMultiplier() {
    const scaling = CARD_STAGE_VALUE_SCALING[currentDifficulty().id] || CARD_STAGE_VALUE_SCALING.standard;
    const stage = getCurrentStageLevel();
    return Math.min(scaling.cap, 1 + Math.max(0, stage - 1) * scaling.perStage);
}

function scaleFlatCardValue(value) {
    return Math.max(1, Math.floor((Number(value) || 1) * getStageValueMultiplier()));
}

function clearBattlePersistentPlayerStatuses() {
    state.player.statuses = state.player.statuses.filter(status => status.id !== 'focus_chain');
}

function drawUntilHandSize() {
    while (state.hand.length < HAND_SIZE && state.deck.length > 0) {
        state.hand.push(state.deck.shift());
    }
}

async function autoRefreshEmptyCardPool() {
    if (state.busy || state.phase !== 'battle' || isBattleWon() || getRemainingCardPoolCount() > 0) return false;
    if (state.refreshCount <= 0) return false;
    return refreshCards({ consume: true, reason: 'empty-auto' });
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

function maybeFailNoDamageOptions() {
    if (!shouldFailNoDamageOptions()) return false;
    pushLog('全局刷新次数已耗尽，且已无可造成伤害的手段。');
    completeRun(false);
    return true;
}

function shouldFailNoDamageOptions() {
    if (state.phase !== 'battle' || state.busy || isBattleWon()) return false;
    if (state.refreshCount > 0) return false;
    if (hasAvailableDamageCard()) return false;
    if (hasEnemyBleedDamagePending()) return false;
    if (canUseExecuteForDamage()) return false;
    return state.enemies.some(isAlive);
}

function hasAvailableDamageCard() {
    return getAvailablePlayableCards().some(card => isDamageCard(card));
}

function getAvailablePlayableCards() {
    const cards = [...state.hand, ...state.deck];
    if (state.activeArchiveCard) cards.push(state.activeArchiveCard);
    state.carriedCards.forEach(card => {
        if (!card?.archiveId || state.carriedUsedIds.has(card.archiveId)) return;
        cards.push(card);
    });
    return cards;
}

function isDamageCard(card) {
    return card?.category === 'attack' || card?.category === 'summon';
}

function hasEnemyBleedDamagePending() {
    return state.enemies.some(enemy => isAlive(enemy) && getBleedRawTotal(enemy) > 0);
}

function canUseExecuteForDamage() {
    if (state.executeUses <= 0) return false;
    return state.enemies.some(enemy => isAlive(enemy) && isExecuteUsableOnEnemy(enemy));
}

function isExecuteUsableOnEnemy(enemy) {
    return !enemy?.boss || enemy.hp / enemy.maxHp <= 0.5;
}

function getEquippedArchiveCards() {
    const byId = new Map(state.archive.cards.map(card => [card.archiveId, card]));
    return state.archive.equippedIds
        .map(id => byId.get(id))
        .filter(Boolean)
        .slice(0, 4);
}

function finishBattle() {
    state.enemies.forEach(enemy => awardScoreForDeadEnemy(enemy));
    closeStatusPopover();
    clearActiveArchiveCard();
    state.phase = 'reward';
    state.busy = false;
    state.enemies = [];
    clearBattlePersistentPlayerStatuses();
    state.currentBattleEvent = null;
    state.enemyTurnCount = 0;
    state.playsUsed = 0;
    state.pendingSkill = '';
    clearExecuteAimState();
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
    state.busy = false;
    state.phase = 'walk';
    renderCombat();
}

function completeRun(victory) {
    closeStatusPopover();
    clearActiveArchiveCard();
    state.phase = victory ? 'complete' : 'defeat';
    state.busy = false;
    clearBattlePersistentPlayerStatuses();
    clearExecuteAimState();
    state.currentBattleEvent = null;
    state.enemyTurnCount = 0;
    state.els.rewardPanel?.classList.add('hidden');
    state.els.completePanel?.classList.remove('hidden');
    finalizeRunScore();
    if (state.els.completeTitle) state.els.completeTitle.textContent = victory ? 'RUN COMPLETE' : 'RUN FAILED';
    renderCompleteScore();
    if (state.els.completeText) {
        state.els.completeText.textContent = victory
            ? '战术考核完成，芙提雅安全返回信标点。'
            : '芙提雅生命值归零，路线已中断。';
    }
    pushLog(victory ? '战术考核完成。' : '路线中断。');
    renderCombat();
}

function showReward(title, text) {
    if (state.els.rewardTitle) state.els.rewardTitle.textContent = title;
    if (state.els.rewardText) state.els.rewardText.textContent = text;
    state.els.rewardPanel?.classList.remove('hidden');
    renderCombat();
}

async function useGuardSkill() {
    if (state.phase !== 'battle' || state.busy || state.guardUses <= 0) return;
    state.busy = true;
    renderCombat();
    playGuardSkillEffect();
    await wait(1900);
    if (!state.visible || state.phase !== 'battle') {
        state.busy = false;
        renderCombat();
        return;
    }
    state.guardUses -= 1;
    state.player.hp = state.player.maxHp;
    addStatus(state.player, 'guard_defense', 3, 0.35);
    addStatus(state.player, 'guard_attack_down', 2, GUARD_ATTACK_DOWN);
    state.enemies.filter(isAlive).forEach(enemy => addStatus(enemy, 'silence', 1, 0));
    floatAtPlayer('FULL', 'heal');
    healingAuraAtFritia('guard');
    pushLog('神之守护：生命全满，敌方下回合沉默。');
    state.busy = false;
    renderCombat();
}

async function armExecuteSkill() {
    if (state.phase !== 'battle' || state.busy || state.executeUses <= 0) return;
    const shouldArm = state.pendingSkill !== 'execute';
    state.pendingSkill = shouldArm ? 'execute' : '';
    state.selectedCardId = '';
    if (shouldArm) {
        const seedEnemy = getRandomSelectableEnemy();
        state.executeSeedEnemyId = seedEnemy?.id || '';
        state.executeHoverEnemyId = '';
        state.executeAimHasPointer = false;
    } else {
        clearExecuteAimState();
    }
    pushLog(state.pendingSkill ? '选择御驾亲征目标。' : '取消御驾亲征。');
    renderCombat();
}

async function useExecuteSkill(enemy) {
    if (state.executeUses <= 0 || !isAlive(enemy)) return;
    if (enemy.boss && enemy.hp / enemy.maxHp > 0.5) {
        pushLog('Boss 生命高于 50%，御驾亲征暂不可用。');
        state.pendingSkill = '';
        renderCombat();
        return;
    }
    state.busy = true;
    state.selectedCardId = '';
    state.pendingSkill = '';
    clearExecuteAimState();
    renderCombat();
    playExecuteSkillEffect();
    await wait(2250);
    if (!state.visible || state.phase !== 'battle') {
        state.busy = false;
        renderCombat();
        return;
    }
    state.executeUses -= 1;
    enemy.hp = 0;
    awardScoreForDeadEnemy(enemy);
    floatAtEnemy(enemy.id, '-99999999', 'execute');
    shakeEnemy(enemy.id);
    spawnHitParticlesAtEnemy(enemy.id, 'execute');
    pushLog('御驾亲征：目标已清除。');
    state.busy = false;
    if (isBattleWon()) finishBattle();
    else if (maybeFailNoDamageOptions()) return;
    else renderCombat();
}

function renderCombat() {
    if (!state.root) return;
    syncCombatViewportClass();
    const stylePanelVisible = state.phase === 'intro' || state.phase === 'loading';
    const combatStarted = !stylePanelVisible;
    const hintVisible = state.visible && (state.phase === 'walk' || state.phase === 'encounter');
    const hasVisibleHand = state.phase === 'battle' && state.hand.length > 0;
    state.root.classList.toggle('is-battle', state.phase === 'battle');
    state.root.classList.toggle('is-loading', state.busy || state.phase === 'loading');
    state.root.classList.toggle('is-started', combatStarted);
    state.root.classList.toggle('is-info-collapsed', !state.infoExpanded);
    state.root.classList.toggle('has-visible-hand', hasVisibleHand);
    if (combatStarted && state.scoreboardOpen) closeScoreboardPanel();
    state.panel?.classList.toggle('is-side-combat-started', combatStarted);
    state.panel?.classList.toggle('is-side-combat-hint-visible', hintVisible);
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
    renderRuleDocControls();
    renderScoreboardPanel();
    renderArchiveControls();
    positionCompactRuleToggle();
    renderLog();
}

function handleCombatViewportChange() {
    syncCombatViewportClass();
    positionCompactRuleToggle();
}

function syncCombatViewportClass() {
    if (!state.root || !state.panel) return;
    const rect = state.panel.getBoundingClientRect();
    const width = rect.width || window.innerWidth || 0;
    const height = rect.height || window.innerHeight || 0;
    const aspect = height > 0 ? width / height : 0;
    const compactByHeight = width >= COMPACT_VIEWPORT.minWidth && height <= COMPACT_VIEWPORT.maxHeight;
    const compactByAspect = width >= COMPACT_VIEWPORT.minWidth && height <= 900 && aspect >= COMPACT_VIEWPORT.minAspect;
    const compactWide = state.visible && (compactByHeight || compactByAspect);
    const progress = compactWide
        ? clamp01(Math.max(
            (COMPACT_VIEWPORT.maxHeight - height) / (COMPACT_VIEWPORT.maxHeight - 360),
            (aspect - COMPACT_VIEWPORT.minAspect) / 1.6
        ))
        : 0;
    const scale = compactWide ? (1 - progress * 0.34).toFixed(3) : '1';
    const extremeWide = compactWide && (
        height <= COMPACT_VIEWPORT.extremeMaxHeight
        || (height <= 820 && aspect >= COMPACT_VIEWPORT.extremeAspect)
        || progress > 0.26
    );
    if (compactWide && !state.compactInfoDefaultApplied) {
        state.infoExpanded = false;
        state.compactInfoDefaultApplied = true;
    } else if (!compactWide) {
        state.compactInfoDefaultApplied = false;
    }
    state.panel.classList.toggle('is-side-combat-compact-wide', compactWide);
    state.panel.classList.toggle('is-side-combat-extreme-wide', extremeWide);
    state.root.classList.toggle('is-compact-wide', compactWide);
    state.root.classList.toggle('is-extreme-wide', extremeWide);
    state.root.style.setProperty('--side-combat-ui-scale', scale);
    state.root.style.setProperty('--side-combat-compact-progress', progress.toFixed(3));
    setScaledStyleVars(Number(scale));
}

function positionCompactRuleToggle() {
    const button = state.els.ruleToggle;
    const archiveButton = state.els.archiveToggle;
    if (!button || !archiveButton || !state.root) return;
    const shouldAnchor = state.visible
        && state.root.classList.contains('is-started')
        && state.root.classList.contains('is-compact-wide');
    if (!shouldAnchor) {
        button.style.removeProperty('left');
        button.style.removeProperty('top');
        button.style.removeProperty('right');
        button.style.removeProperty('width');
        button.style.removeProperty('height');
        button.style.removeProperty('transform');
        return;
    }
    const rootRect = state.root.getBoundingClientRect();
    const anchorRect = archiveButton.getBoundingClientRect();
    if (!rootRect.width || !anchorRect.width || !anchorRect.height) return;
    const buttonRect = button.getBoundingClientRect();
    const width = anchorRect.width || buttonRect.width || 48;
    const height = anchorRect.height || buttonRect.height || 48;
    const gap = Math.max(8, Math.min(14, anchorRect.height * 0.24));
    const left = anchorRect.left - rootRect.left + anchorRect.width * 0.5 - width * 0.5;
    const top = anchorRect.top - rootRect.top - gap - height * 0.5;
    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    button.style.right = 'auto';
    button.style.width = `${Math.round(width)}px`;
    button.style.height = `${Math.round(height)}px`;
    button.style.transform = 'translateY(-50%)';
}

function setScaledStyleVars(scale) {
    if (!state.root) return;
    state.root.style.setProperty('--side-combat-side-rail-scale', Math.max(0.82, scale).toFixed(3));
    const pxVars = {
        '--side-combat-route-top': 7,
        '--side-combat-route-width': 470,
        '--side-combat-route-map-height': 24,
        '--side-combat-route-map-pad': 10,
        '--side-combat-route-pointer-top': -10,
        '--side-combat-route-node-width': 22,
        '--side-combat-route-gap-width': 18,
        '--side-combat-hand-width': 820,
        '--side-combat-card-width': 150,
        '--side-combat-card-height': 180,
        '--side-combat-card-pad': 12,
        '--side-combat-card-title-gap': 12,
        '--side-combat-card-copy-height': 34,
        '--side-combat-card-copy-gap': 7,
        '--side-combat-card-value-gap': 10,
        '--side-combat-round-size': 48,
        '--side-combat-refresh-x': 396,
        '--side-combat-deck-x': 340,
        '--side-combat-side-x': 18,
        '--side-combat-side-gap': 14,
        '--side-combat-rule-archive-offset': 152,
        '--side-combat-play-right': 166,
        '--side-combat-play-width': 66,
        '--side-combat-discard-right': 252,
        '--side-combat-actions-right': 18,
        '--side-combat-player-top': 68,
        '--side-combat-player-right': 18,
        '--side-combat-player-width': 232,
        '--side-combat-player-height': 50,
        '--side-combat-player-text-column': 104,
        '--side-combat-player-avatar-column': 46,
        '--side-combat-player-gap': 8,
        '--side-combat-player-pad-y': 5,
        '--side-combat-player-pad-x': 7,
        '--side-combat-player-pad-left': 12,
        '--side-combat-player-avatar': 42,
        '--side-combat-hp-gap': 5
    };
    Object.entries(pxVars).forEach(([name, value]) => {
        state.root.style.setProperty(name, `${value * scale}px`);
    });
    const remVars = {
        '--side-combat-route-pointer-font': 1,
        '--side-combat-route-node-font': 1,
        '--side-combat-route-gap-font': 0.7,
        '--side-combat-route-title-font': 1,
        '--side-combat-score-font': 0.62,
        '--side-combat-card-title-font': 1.08,
        '--side-combat-card-copy-font': 0.68,
        '--side-combat-card-meta-font': 0.62,
        '--side-combat-round-font': 1.02,
        '--side-combat-play-font': 0.96,
        '--side-combat-action-font': 0.78,
        '--side-combat-player-font': 0.84
    };
    Object.entries(remVars).forEach(([name, value]) => {
        state.root.style.setProperty(name, `${value * scale}rem`);
    });
}

function renderProgressOnly() {
    const eventCount = currentEventCount();
    if (state.els.progress) state.els.progress.textContent = `事件 ${Math.min(state.eventIndex, eventCount)}/${eventCount}`;
    if (state.els.scoreLive) state.els.scoreLive.textContent = `实时积分 ${state.score}`;
    renderRouteMap();
    if (state.els.refreshCount) state.els.refreshCount.textContent = String(state.refreshCount);
}

function renderCompleteScore() {
    const target = state.els.completeScore;
    if (!target) return;
    target.textContent = '';
    const label = document.createElement('span');
    label.textContent = '最终积分';
    const value = document.createElement('strong');
    value.textContent = String(state.score);
    target.append(label, value);
    if (state.isNewScoreRecord) {
        const badge = document.createElement('em');
        badge.textContent = '新纪录';
        target.appendChild(badge);
    }
}

function renderRouteMap() {
    const layer = state.els.routeMap;
    if (!layer) return;
    layer.textContent = '';
    const events = state.events.length ? state.events : createPreviewEventRoute();
    events.forEach((event, index) => {
        if (index > 0) {
            const gap = document.createElement('span');
            gap.className = 'side-combat-route__gap';
            gap.textContent = '···';
            layer.appendChild(gap);
        }
        const node = document.createElement('span');
        node.className = 'side-combat-route__node';
        node.dataset.routeIndex = String(index);
        node.textContent = routeEventIcon(event);
        node.title = routeEventLabel(event);
        layer.appendChild(node);
    });
    const pointer = document.createElement('i');
    pointer.className = 'side-combat-route__pointer';
    pointer.textContent = '🔻';
    layer.appendChild(pointer);
    positionRoutePointer(layer, pointer, events.length);
}

function createPreviewEventRoute() {
    const difficulty = currentDifficulty();
    if (difficulty.fixedBosses) {
        return [
            { kind: 'enemy' }, { kind: 'enemy' }, { kind: 'supply' }, { kind: 'enemy' },
            { kind: 'miniBoss' },
            { kind: 'enemy' }, { kind: 'enemy' }, { kind: 'enemy' }, { kind: 'enemy' },
            { kind: 'boss' }
        ];
    }
    if (difficulty.id === 'standard') {
        return [
            ...Array.from({ length: difficulty.normalEvents }, () => ({ kind: 'enemy' })),
            ...Array.from({ length: difficulty.bossEvents }, () => ({ kind: 'boss' }))
        ];
    }
    return [
        ...Array.from({ length: difficulty.normalEvents }, (_, index) => ({ kind: index === 2 ? 'supply' : 'enemy' })),
        ...Array.from({ length: difficulty.bossEvents }, () => ({ kind: 'boss' }))
    ];
}

function getCurrentRouteIndex() {
    if (!state.events.length) return 0;
    if (state.phase === 'walk') return Math.max(0, Math.min(state.eventIndex - 1, state.events.length - 1));
    return Math.max(0, Math.min(state.eventIndex - 2, state.events.length - 1));
}

function getNextRouteIndex() {
    if (!state.events.length) return 0;
    if (state.phase === 'walk') return Math.max(0, Math.min(state.eventIndex, state.events.length - 1));
    return Math.max(0, Math.min(state.eventIndex - 1, state.events.length - 1));
}

function getRoutePointerProgress() {
    if (!state.events.length) return 0;
    if (state.phase === 'encounter') {
        return clamp01(state.encounterProgress / ENCOUNTER_APPROACH_DISTANCE);
    }
    if (state.phase !== 'walk') return 0;
    const eventStart = Math.max(0, state.nextEventAt - EVENT_DISTANCE);
    const clampedDistance = clampNumber(state.forwardDistance, eventStart, state.nextEventAt);
    return clamp01((clampedDistance - eventStart) / EVENT_DISTANCE);
}

function routeEventIcon(event) {
    if (event?.kind === 'boss' || event?.kind === 'miniBoss') return '👑';
    if (event?.kind === 'supply' || event?.kind === 'rare') return '💜';
    return '⚔️';
}

function routeEventLabel(event) {
    if (event?.kind === 'boss') return 'Boss';
    if (event?.kind === 'miniBoss') return '小 Boss';
    if (event?.kind === 'supply') return '补给';
    if (event?.kind === 'rare') return '稀有信标';
    return '战斗';
}

function positionRoutePointer(layer, pointer, count) {
    const nodes = [...layer.querySelectorAll('.side-combat-route__node')];
    if (!nodes.length) return;
    const route = getRoutePointerIndexes(count);
    const fromNode = nodes[route.from] || nodes[0];
    const toNode = nodes[route.to] || fromNode;
    const fromX = getRouteNodeCenterX(fromNode, layer);
    const toX = getRouteNodeCenterX(toNode, layer);
    pointer.style.left = `${fromX + (toX - fromX) * route.progress}px`;
}

function getRoutePointerIndexes(count) {
    if (count <= 1 || !state.events.length) return { from: 0, to: 0, progress: 0 };
    if (state.phase === 'walk') {
        const to = clampNumber(state.eventIndex, 0, count - 1);
        const from = Math.max(0, to - 1);
        return { from, to, progress: getRoutePointerProgress() };
    }
    if (state.phase === 'encounter') {
        const current = clampNumber(state.eventIndex - 1, 0, count - 1);
        return { from: current, to: current, progress: 0 };
    }
    const current = clampNumber(state.eventIndex - 1, 0, count - 1);
    return { from: current, to: current, progress: 0 };
}

function getRouteNodeCenterX(node, layer) {
    return node.offsetLeft + node.offsetWidth * 0.5;
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
        state.els.guard.disabled = state.phase !== 'battle' || state.guardUses <= 0 || state.busy;
        state.els.guard.title = `神之守护（剩余 ${state.guardUses} 次）：播放绿色治疗屏障，芙提雅生命回满，获得减伤并让敌方下回合沉默；代价是 2 回合内攻击牌伤害降低 20%。`;
        state.els.guard.setAttribute('aria-label', `神之守护，剩余 ${state.guardUses} 次`);
        if (state.els.guardCount) state.els.guardCount.textContent = String(state.guardUses);
    }
    if (state.els.execute) {
        state.els.execute.disabled = state.phase !== 'battle' || state.executeUses <= 0 || state.busy;
        state.els.execute.classList.toggle('is-armed', state.pendingSkill === 'execute');
        state.els.execute.title = `御驾亲征（剩余 ${state.executeUses} 次）：播放全图蓝色闪电后选择目标，非 Boss 直接清除；Boss 生命不高于 50% 时可用。`;
        state.els.execute.setAttribute('aria-label', `御驾亲征，剩余 ${state.executeUses} 次`);
        if (state.els.executeCount) state.els.executeCount.textContent = String(state.executeUses);
    }
    positionAdjutantSkills();
    if (state.els.refresh) {
        const manualRefreshEndsTurn = state.phase === 'battle' && getRemainingCardPoolCount() > HAND_SIZE;
        state.els.refresh.disabled = state.refreshCount <= 0 || state.busy || !['battle', 'walk'].includes(state.phase) || (!state.preloadedBatch && state.preloading);
        state.els.refresh.title = state.preloadedBatch
            ? (manualRefreshEndsTurn ? '重新抽牌。当前卡池仍充足，因此刷新后结束回合。' : '重新抽牌。当前卡池不足，刷新后不结束回合。')
            : (state.preloading ? '正在预加载下一组卡池' : '下一组卡池尚未预加载完成');
        state.els.refresh.classList.toggle('will-end-turn', manualRefreshEndsTurn);
        state.els.refresh.classList.toggle('will-keep-turn', !manualRefreshEndsTurn);
        if (state.els.refreshTag) {
            state.els.refreshTag.textContent = manualRefreshEndsTurn ? '同时结束回合' : '不会结束回合';
        }
    }
    if (state.els.playCount) {
        const remainingPlays = Math.max(0, PLAYER_CARD_LIMIT - state.playsUsed);
        state.els.playCount.textContent = `💠 ${remainingPlays}/${PLAYER_CARD_LIMIT}`;
    }
    if (state.els.endTurn) {
        state.els.endTurn.disabled = state.phase !== 'battle' || state.busy;
    }
    if (state.els.infoToggle) {
        state.els.infoToggle.classList.toggle('is-open', state.infoExpanded);
        state.els.infoToggle.disabled = !['walk', 'encounter', 'battle', 'reward', 'complete', 'defeat'].includes(state.phase);
    }
}

function positionAdjutantSkills() {
    const skills = state.root?.querySelector('.side-combat-skills');
    if (!skills || !state.root) return;
    const rootRect = state.root.getBoundingClientRect();
    const panelRect = state.panel?.getBoundingClientRect?.();
    const hitbox = state.getAdjutantHitbox?.();
    const validHitbox = panelRect && hitbox && hitbox.right > hitbox.left && hitbox.bottom > hitbox.top;
    if (!validHitbox || !state.visible || state.phase !== 'battle') {
        skills.classList.add('is-unanchored');
        return;
    }
    const direction = Math.sign(state.getFacing?.() || 1) || 1;
    const centerX = panelRect.left - rootRect.left + (hitbox.left + hitbox.right) * 0.5;
    const centerY = panelRect.top - rootRect.top + hitbox.top + (hitbox.bottom - hitbox.top) * 0.1;
    skills.style.left = `${centerX - direction * 132}px`;
    skills.style.top = `${centerY}px`;
    skills.classList.remove('is-unanchored');
}

function renderEnemies() {
    const layer = state.els.enemyLayer;
    const spriteLayer = state.els.spriteEnemyLayer;
    if (!layer || !spriteLayer) return;
    layer.textContent = '';
    if (state.phase !== 'battle' && state.phase !== 'loading' && state.phase !== 'encounter') {
        spriteLayer.textContent = '';
        return;
    }
    const spriteRenderToken = `render-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const visibleEnemies = getVisibleEnemiesForRender();
    const spriteEnemies = visibleEnemies.filter(isSpriteEnemy);
    visibleEnemies.forEach((enemy, index) => {
        if (isSpriteEnemy(enemy)) {
            renderSpriteEnemy(spriteLayer, enemy, spriteEnemies.indexOf(enemy), spriteEnemies, spriteRenderToken);
            return;
        }
        layer.appendChild(createEnemyCardElement(enemy, index));
    });
    cleanupSpriteEnemyLayer(spriteLayer, spriteRenderToken);
}

function getVisibleEnemiesForRender() {
    if (state.enemies.length <= 1) return state.enemies;
    return state.enemies.filter(isAlive);
}

function createEnemyCardElement(enemy, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `side-combat-enemy${enemy.boss ? ' side-combat-enemy--boss' : ''}`;
    button.dataset.enemyId = enemy.id;
    button.dataset.combatTarget = 'enemy';
    button.disabled = !isAlive(enemy) || state.busy || state.phase === 'encounter';
    button.style.setProperty('--enemy-index', String(index));
    const approach = state.phase === 'encounter' || state.phase === 'loading'
        ? state.encounterProgress / ENCOUNTER_APPROACH_DISTANCE
        : 1;
    button.style.setProperty('--approach', String(approach));
    button.style.setProperty('--approach-opacity', String(0.28 + clamp01(approach) * 0.72));
    const name = document.createElement('span');
    name.className = 'side-combat-enemy__name';
    name.textContent = enemy.name;
    const intent = document.createElement('span');
    intent.className = 'side-combat-enemy__intent';
    const intentDamage = computeEnemyIntentDamage(enemy);
    intent.title = '敌方下次行动将造成的实际伤害';
    intent.textContent = formatEnemyIntentText(intentDamage);
    const hp = document.createElement('strong');
    hp.textContent = `${enemy.hp}/${enemy.maxHp}`;
    const bar = document.createElement('i');
    bar.className = 'side-combat-enemy__hp';
    bar.style.width = `${clamp01(enemy.hp / enemy.maxHp) * 100}%`;
    const status = document.createElement('div');
    status.className = 'side-combat-status-icons';
    renderStatusIcons(status, enemy.statuses, enemy);
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
    return button;
}

function renderSpriteEnemy(layer, enemy, index, spriteEnemies, renderToken) {
    const metrics = getSpriteEnemyMetrics(enemy, index, spriteEnemies);
    if (!metrics) {
        enemy.visualType = 'card';
        renderCombat();
        return;
    }
    const existing = layer.querySelector(`.side-combat-sprite-enemy[data-enemy-id="${cssEscape(enemy.id)}"]`);
    if (existing) {
        updateSpriteEnemyElement(existing, enemy, index, metrics, renderToken);
        return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'side-combat-sprite-enemy';
    button.dataset.enemyId = enemy.id;
    button.dataset.combatTarget = 'enemy';
    button.dataset.enemyRole = 'target';
    updateSpriteEnemyElement(button, enemy, index, metrics, renderToken);

    const img = document.createElement('img');
    img.className = 'side-combat-sprite-enemy__image';
    img.src = getSpriteEnemyVariant(enemy)?.src || '';
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'eager';
    img.setAttribute('aria-hidden', 'true');
    img.addEventListener('error', () => {
        enemy.visualType = 'card';
        renderCombat();
    }, { once: true });

    const hud = document.createElement('div');
    hud.className = 'side-combat-sprite-enemy__hud';
    hud.dataset.enemyId = enemy.id;
    hud.dataset.enemyRole = 'hud';
    const status = document.createElement('div');
    status.className = 'side-combat-status-icons side-combat-sprite-enemy__status';
    renderStatusIcons(status, enemy.statuses, enemy);
    const intent = document.createElement('span');
    intent.className = 'side-combat-enemy__intent side-combat-sprite-enemy__intent';
    const intentDamage = computeEnemyIntentDamage(enemy);
    intent.title = '敌方下次行动将造成的实际伤害';
    intent.textContent = formatEnemyIntentText(intentDamage);
    const row = document.createElement('div');
    row.className = 'side-combat-sprite-enemy__row';
    const name = document.createElement('span');
    name.className = 'side-combat-enemy__name';
    name.textContent = enemy.name;
    const hp = document.createElement('strong');
    hp.textContent = `${enemy.hp}/${enemy.maxHp}`;
    row.append(name, hp);
    const barTrack = document.createElement('div');
    barTrack.className = 'side-combat-sprite-enemy__hp-track';
    const bar = document.createElement('i');
    bar.className = 'side-combat-enemy__hp';
    bar.style.width = `${clamp01(enemy.hp / enemy.maxHp) * 100}%`;
    barTrack.appendChild(bar);
    hud.append(status, intent, row, barTrack);

    button.append(img, hud);
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
    updateSpriteEnemyElement(button, enemy, index, metrics, renderToken);
}

function updateSpriteEnemyElement(button, enemy, index, metrics, renderToken) {
    button.dataset.renderToken = renderToken;
    button.disabled = !isAlive(enemy) || state.busy || state.phase === 'encounter';
    button.style.left = `${metrics.left}px`;
    button.style.top = `${metrics.top}px`;
    button.style.width = `${metrics.width}px`;
    button.style.height = `${metrics.height}px`;
    button.style.zIndex = String(metrics.zIndex);
    button.style.setProperty('--enemy-index', String(index));
    button.style.setProperty('--approach', String(metrics.approach));
    button.style.setProperty('--approach-opacity', String(0.28 + metrics.approach * 0.72));

    const status = button.querySelector('.side-combat-sprite-enemy__status');
    const img = button.querySelector('.side-combat-sprite-enemy__image');
    const intent = button.querySelector('.side-combat-sprite-enemy__intent');
    const name = button.querySelector('.side-combat-enemy__name');
    const hp = button.querySelector('.side-combat-sprite-enemy__row strong');
    const bar = button.querySelector('.side-combat-sprite-enemy__hp-track .side-combat-enemy__hp');
    renderStatusIcons(status, enemy.statuses, enemy);
    const spriteSrc = getSpriteEnemyVariant(enemy)?.src || '';
    if (img && spriteSrc && img.getAttribute('src') !== spriteSrc) img.src = spriteSrc;
    const intentDamage = computeEnemyIntentDamage(enemy);
    if (intent) intent.textContent = formatEnemyIntentText(intentDamage);
    if (name) name.textContent = enemy.name;
    if (hp) hp.textContent = `${enemy.hp}/${enemy.maxHp}`;
    if (bar) bar.style.width = `${clamp01(enemy.hp / enemy.maxHp) * 100}%`;
}

function cleanupSpriteEnemyLayer(layer, renderToken) {
    [...layer.querySelectorAll('.side-combat-sprite-enemy')].forEach(element => {
        if (element.dataset.renderToken !== renderToken) element.remove();
    });
}

function getSpriteEnemyVariant(enemy) {
    return SPRITE_ENEMY_CONFIG.variants[enemy?.name] || null;
}

function getSpriteEnemyMetrics(enemy, index = 0, spriteEnemies = []) {
    if (!state.root) return null;
    const variant = getSpriteEnemyVariant(enemy);
    if (!variant) return null;
    const rootRect = state.root.getBoundingClientRect();
    const panelRect = state.panel?.getBoundingClientRect?.();
    const fritiaHitbox = state.getFritiaHitbox?.();
    if (!rootRect || !panelRect || !fritiaHitbox) return null;
    const adjutantHitbox = state.getAdjutantHitbox?.();
    const referenceHeight = adjutantHitbox && adjutantHitbox.bottom > adjutantHitbox.top
        ? adjutantHitbox.bottom - adjutantHitbox.top
        : fritiaHitbox.bottom - fritiaHitbox.top;
    const groundY = panelRect.top - rootRect.top + fritiaHitbox.bottom;
    const area = getSpriteEnemyStandingArea(rootRect, groundY);
    const areaWidth = Math.max(80, area.right - area.left);
    const compactHeight = state.root?.classList.contains('is-compact-wide') || (rootRect.width >= 760 && rootRect.height <= 540);
    const maxHeight = compactHeight
        ? rootRect.height * (enemy?.boss ? 0.58 : 0.48)
        : rootRect.width <= 700
            ? rootRect.height * (enemy?.boss ? 0.64 : 0.52)
            : rootRect.height * (enemy?.boss ? 0.82 : 0.68);
    const desiredHeight = clampNumber(referenceHeight * variant.heightToAdjutant, 180, maxHeight);
    const desiredWidth = desiredHeight * variant.imageRatio;
    const fitScale = desiredWidth > areaWidth ? areaWidth / desiredWidth : 1;
    const height = Math.max(120, desiredHeight * fitScale);
    const width = height * variant.imageRatio;
    const total = Math.max(1, spriteEnemies.length || 1);
    const footMinX = area.left + width * 0.5;
    const footMaxX = area.right - width * 0.5;
    const usableX = Math.max(0, footMaxX - footMinX);
    const footX = total === 1
        ? (footMinX + footMaxX) * 0.5
        : footMinX + usableX * (index / (total - 1));
    const centerOffset = index - (total - 1) * 0.5;
    const maxYGap = Math.max(SPRITE_ENEMY_CONFIG.standingArea.minYGap, usableX * SPRITE_ENEMY_CONFIG.standingArea.maxYGapRatio / Math.max(1, total - 1));
    const yStep = clampNumber(maxYGap, SPRITE_ENEMY_CONFIG.standingArea.minYGap, Math.max(SPRITE_ENEMY_CONFIG.standingArea.minYGap, (area.front - area.back) / Math.max(1, total - 1)));
    const footY = clampNumber(groundY + centerOffset * yStep, area.back, area.front);
    const rawApproach = state.phase === 'encounter' || state.phase === 'loading'
        ? state.encounterProgress / ENCOUNTER_APPROACH_DISTANCE
        : 1;
    const approach = clamp01(rawApproach);
    const finalLeft = footX - width * 0.5;
    const approachOffset = Math.max(0, ENCOUNTER_APPROACH_DISTANCE - state.encounterProgress);
    return {
        left: finalLeft + approachOffset,
        top: footY - height,
        width,
        height,
        approach,
        footY,
        zIndex: 20 + Math.min(200, Math.round(footY - area.back))
    };
}

function getSpriteEnemyStandingArea(rootRect, groundY) {
    const area = SPRITE_ENEMY_CONFIG.standingArea;
    const left = rootRect.width * area.leftRatio;
    const right = rootRect.width * area.rightRatio;
    const back = groundY + area.backYOffset;
    const front = groundY + area.frontYOffset;
    return {
        left: Math.min(left, right),
        right: Math.max(left, right),
        back: Math.min(back, front),
        front: Math.max(back, front)
    };
}

function renderHand() {
    const hand = state.els.hand;
    if (!hand) return;
    hand.textContent = '';
    if (state.phase !== 'battle') return;
    state.hand.forEach(card => {
        const button = createCombatCardElement(card);
        button.disabled = state.phase !== 'battle' || state.busy;
        button.classList.toggle('is-selected', state.selectedCardId === card.id);
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
            if (isPointInsideArchiveToggle(event.clientX, event.clientY)) {
                void finishCardArchive(event);
                return;
            }
            if (isPointInsideDiscard(event.clientX, event.clientY)) {
                void finishCardDiscard(event);
                return;
            }
            const targetId = getCombatTargetIdAtPoint(event.clientX, event.clientY);
            finishCardDrag(event, targetId);
        });
        button.addEventListener('pointercancel', () => {
            cancelCardDrag();
        });
        hand.appendChild(button);
    });
}

function createCombatCardElement(card, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `side-combat-card side-combat-card--${card.rarity} ${cardToneClass(card)} ${extraClass}`.trim();
    button.dataset.cardId = card.id;
    button.title = `${card.categoryLabel || SIDE_CARD_CATEGORY_LABELS[card.category] || card.category} / ${card.rarityLabel || SIDE_CARD_RARITY_LABELS[card.rarity] || card.rarity}：${mechanicsText(card)}`;
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
    return button;
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

function renderArchiveControls() {
    if (state.phase === 'intro' || state.phase === 'loading' || state.archiveOpen) {
        state.archive = loadSideScrollerArchive();
    }
    if (state.els.archiveCount) state.els.archiveCount.textContent = String(state.archive.cards.length);
    renderCarrySlots();
    renderArchivePanel();
}

function renderCarrySlots() {
    const container = state.els.carrySlots;
    if (!container) return;
    container.textContent = '';
    const activeCards = state.phase === 'intro' || state.phase === 'loading'
        ? getEquippedArchiveCards()
        : state.carriedCards;
    for (let index = 0; index < 4; index += 1) {
        const card = activeCards[index] || null;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-carry-slot${card ? ` is-filled side-combat-carry-slot--${card.category}` : ''}`;
        button.dataset.carryIndex = String(index);
        const used = card && state.carriedUsedIds.has(card.archiveId);
        const active = card && state.activeArchiveCard?.archiveId === card.archiveId;
        button.classList.toggle('is-used', Boolean(used));
        button.classList.toggle('is-active', Boolean(active));
        button.disabled = state.busy || (state.phase === 'battle' && (!card || used));
        button.title = card
            ? `${card.name} · ${SIDE_CARD_CATEGORY_LABELS[card.category] || card.category} · ${mechanicsText(card)}`
            : '从典藏牌库选择携带卡牌';
        button.textContent = card ? cardIcon(card) : '+';
        button.addEventListener('click', event => {
            event.stopPropagation();
            if (!card) {
                openArchivePanel();
                return;
            }
            if (state.phase === 'battle') summonArchiveCard(card, button, index);
            else showArchiveCardInfo(card, button);
        });
        container.appendChild(button);
    }
}

function toggleArchivePanel() {
    if (state.archiveOpen) closeArchivePanel();
    else openArchivePanel();
}

function openArchivePanel() {
    state.archive = loadSideScrollerArchive();
    state.archiveOpen = true;
    closeRuleDocPanel();
    closeScoreboardPanel();
    closeDeckPopover();
    closeStatusPopover();
    renderArchivePanel();
}

function closeArchivePanel() {
    if (!state.archiveOpen) return;
    state.archiveOpen = false;
    closeArchiveDeleteConfirm();
    state.els.archivePanel?.classList.add('hidden');
}

async function toggleRuleDocPanel() {
    if (state.ruleDocOpen) {
        closeRuleDocPanel();
        return;
    }
    await openRuleDocPanel();
}

async function openRuleDocPanel() {
    state.ruleDocOpen = true;
    closeArchivePanel();
    closeScoreboardPanel();
    closeDeckPopover();
    closeStatusPopover();
    renderRuleDocControls();
    if (!state.ruleDocMarkdown && !state.ruleDocLoading) {
        state.ruleDocLoading = true;
        state.ruleDocError = '';
        renderRuleDocControls();
        try {
            const response = await fetch(CARD_RULE_DOC_SRC, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            state.ruleDocMarkdown = await response.text();
        } catch (error) {
            console.warn('[SideScrollerCombat] Failed to load card rule document.', error);
            state.ruleDocError = '战术文档加载失败，请确认 src/_2d_adventure/card_rule.md 存在。';
        } finally {
            state.ruleDocLoading = false;
            renderRuleDocControls();
        }
    }
}

function closeRuleDocPanel() {
    if (!state.ruleDocOpen) return;
    state.ruleDocOpen = false;
    state.els.rulePanel?.classList.add('hidden');
    state.els.ruleToggle?.classList.remove('is-open');
}

function toggleScoreboardPanel() {
    if (state.scoreboardOpen) closeScoreboardPanel();
    else openScoreboardPanel();
}

function openScoreboardPanel() {
    state.scoreRecords = loadSideScrollerScores();
    state.scoreboardOpen = true;
    closeArchivePanel();
    closeRuleDocPanel();
    closeDeckPopover();
    closeStatusPopover();
    renderScoreboardPanel();
}

function closeScoreboardPanel() {
    if (!state.scoreboardOpen) return;
    state.scoreboardOpen = false;
    state.els.scoreboardPanel?.classList.add('hidden');
    state.els.scoreboardToggle?.classList.remove('is-open');
}

function renderScoreboardPanel() {
    const panel = state.els.scoreboardPanel;
    if (!panel) return;
    panel.classList.toggle('hidden', !state.scoreboardOpen);
    state.els.scoreboardToggle?.classList.toggle('is-open', state.scoreboardOpen);
    if (!state.scoreboardOpen) return;
    const list = state.els.scoreboardList;
    if (!list) return;
    list.textContent = '';
    const records = state.scoreRecords.records || [];
    if (!records.length) {
        const empty = document.createElement('p');
        empty.className = 'side-combat-scoreboard-empty';
        empty.textContent = '还没有分数记录。';
        list.appendChild(empty);
        return;
    }
    records.slice(0, 10).forEach((record, index) => {
        const row = document.createElement('div');
        row.className = 'side-combat-scoreboard-row';
        const rank = document.createElement('span');
        rank.textContent = `#${index + 1}`;
        const score = document.createElement('strong');
        score.textContent = String(record.score);
        const meta = document.createElement('small');
        meta.textContent = `${record.difficultyLabel || record.difficulty} · 击杀 ${record.kills || 0} · ${formatScoreDate(record.completedAt)}`;
        row.append(rank, score, meta);
        list.appendChild(row);
    });
}

function renderRuleDocControls() {
    if (state.els.ruleToggle) {
        state.els.ruleToggle.classList.toggle('is-open', state.ruleDocOpen);
        state.els.ruleToggle.title = state.ruleDocOpen ? '关闭战术文档' : '打开战术文档';
    }
    const panel = state.els.rulePanel;
    if (!panel) return;
    panel.classList.toggle('hidden', !state.ruleDocOpen);
    if (!state.ruleDocOpen) return;
    if (state.els.ruleContent) {
        if (state.ruleDocLoading) {
            state.els.ruleContent.innerHTML = '<p>战术文档加载中...</p>';
        } else if (state.ruleDocError) {
            state.els.ruleContent.textContent = state.ruleDocError;
        } else {
            state.els.ruleContent.innerHTML = renderCombatRuleMarkdown(state.ruleDocMarkdown || '');
        }
    }
}

function renderCombatRuleMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let listOpen = false;
    lines.forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) {
            if (listOpen) {
                html.push('</ul>');
                listOpen = false;
            }
            return;
        }
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            if (listOpen) {
                html.push('</ul>');
                listOpen = false;
            }
            const level = Math.min(3, heading[1].length + 1);
            html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
            return;
        }
        const bullet = line.match(/^[-*]\s+(.+)$/);
        if (bullet) {
            if (!listOpen) {
                html.push('<ul>');
                listOpen = true;
            }
            html.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`);
            return;
        }
        const numbered = line.match(/^\d+\.\s+(.+)$/);
        if (numbered) {
            if (!listOpen) {
                html.push('<ul>');
                listOpen = true;
            }
            html.push(`<li>${renderInlineMarkdown(numbered[1])}</li>`);
            return;
        }
        if (listOpen) {
            html.push('</ul>');
            listOpen = false;
        }
        html.push(`<p>${renderInlineMarkdown(line)}</p>`);
    });
    if (listOpen) html.push('</ul>');
    return html.join('');
}

function renderInlineMarkdown(text) {
    return escapeHtml(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function formatScoreDate(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
}

function changeArchivePage(direction) {
    const maxPage = Math.max(0, Math.ceil(state.archive.cards.length / 6) - 1);
    state.archivePage = clampNumber(state.archivePage + direction, 0, maxPage);
    renderArchivePanel();
}

function renderArchivePanel() {
    const panel = state.els.archivePanel;
    if (!panel) return;
    panel.classList.toggle('hidden', !state.archiveOpen);
    if (!state.archiveOpen) return;
    const maxPage = Math.max(0, Math.ceil(state.archive.cards.length / 6) - 1);
    state.archivePage = clampNumber(state.archivePage, 0, maxPage);
    const selected = new Set(state.archive.equippedIds);
    const editable = isArchiveEditable();
    if (!editable && state.archiveDeleteId) closeArchiveDeleteConfirm();
    const pageCards = state.archive.cards.slice(state.archivePage * 6, state.archivePage * 6 + 6);
    const grid = state.els.archiveGrid;
    if (grid) {
        grid.textContent = '';
        if (!pageCards.length) {
            const empty = document.createElement('p');
            empty.className = 'side-combat-archive-empty';
            empty.textContent = '还没有典藏卡牌。战斗中把喜欢的手牌拖到数据库按钮即可收纳。';
            grid.appendChild(empty);
        }
        pageCards.forEach(card => {
            const button = document.createElement('div');
            button.role = editable ? 'button' : 'group';
            button.tabIndex = editable ? 0 : -1;
            button.className = `side-combat-archive-card side-combat-card--${card.rarity} ${cardToneClass(card)}`;
            button.classList.toggle('is-equipped', selected.has(card.archiveId));
            button.classList.toggle('is-readonly', !editable);
            button.title = `${card.name} · ${mechanicsText(card)}`;
            button.innerHTML = `
                <span>${SIDE_CARD_RARITY_LABELS[card.rarity] || card.rarity} · ${SIDE_CARD_CATEGORY_LABELS[card.category] || card.category}</span>
                <strong></strong>
                <small></small>
                <em></em>
            `;
            button.querySelector('strong').textContent = card.name;
            button.querySelector('small').textContent = card.description || '典藏战术卡';
            button.querySelector('em').textContent = mechanicsText(card);
            button.addEventListener('click', event => {
                event.stopPropagation();
                if (!editable) return;
                toggleArchiveEquip(card);
            });
            button.addEventListener('keydown', event => {
                if (!editable || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                event.stopPropagation();
                toggleArchiveEquip(card);
            });
            if (editable) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'side-combat-archive-delete';
                deleteButton.textContent = '🗑️';
                deleteButton.title = `删除 ${card.name}`;
                deleteButton.setAttribute('aria-label', `删除 ${card.name}`);
                deleteButton.addEventListener('click', event => {
                    event.stopPropagation();
                    openArchiveDeleteConfirm(card);
                });
                button.appendChild(deleteButton);
            }
            grid.appendChild(button);
        });
    }
    if (state.els.archivePage) state.els.archivePage.textContent = `${state.archivePage + 1}/${maxPage + 1}`;
    if (state.els.archivePrev) state.els.archivePrev.disabled = state.archivePage <= 0;
    if (state.els.archiveNext) state.els.archiveNext.disabled = state.archivePage >= maxPage;
    if (state.els.archiveStatus) {
        state.els.archiveStatus.textContent = state.archiveMessage
            || '永久收藏 LLM 生成的任意卡牌。收藏以后，未来对局开始前可选择 4 张带入。';
    }
    renderArchiveDeleteConfirm();
}

function isArchiveEditable() {
    return state.phase === 'intro' && !state.busy;
}

function openArchiveDeleteConfirm(card) {
    state.archiveDeleteId = card.archiveId;
    state.archiveDeleteName = card.name;
    renderArchiveDeleteConfirm();
}

function closeArchiveDeleteConfirm() {
    state.archiveDeleteId = '';
    state.archiveDeleteName = '';
    renderArchiveDeleteConfirm();
}

function renderArchiveDeleteConfirm() {
    const confirm = state.els.archiveConfirm;
    if (!confirm) return;
    const visible = state.archiveOpen && Boolean(state.archiveDeleteId);
    confirm.classList.toggle('hidden', !visible);
    if (state.els.archiveConfirmName) {
        state.els.archiveConfirmName.textContent = visible
            ? `确认从典藏牌库删除「${state.archiveDeleteName}」？`
            : '';
    }
}

function confirmArchiveDelete() {
    if (!state.archiveDeleteId) return;
    const deleteId = state.archiveDeleteId;
    const deleteName = state.archiveDeleteName;
    const result = deleteSideScrollerArchiveCard(deleteId);
    state.archive = result.archive;
    state.archiveDeleteId = '';
    state.archiveDeleteName = '';
    if (result.ok) {
        state.carriedCards = state.carriedCards.filter(card => card.archiveId !== deleteId);
        state.carriedUsedIds.delete(deleteId);
        if (state.activeArchiveCard?.archiveId === deleteId) clearActiveArchiveCard();
        state.archiveMessage = `已删除「${deleteName}」。`;
    } else {
        state.archiveMessage = '没有找到要删除的典藏卡牌。';
    }
    renderArchiveControls();
}

function toggleArchiveEquip(card) {
    if (!isArchiveEditable()) {
        state.archiveMessage = '战术考核进行中只能查看典藏牌库。';
        renderArchivePanel();
        return;
    }
    const ids = [...state.archive.equippedIds];
    const existing = ids.indexOf(card.archiveId);
    if (existing >= 0) ids.splice(existing, 1);
    else {
        if (ids.length >= 4) {
            state.archiveMessage = '携带格子已满，请先取消一张已选择卡牌。';
            renderArchivePanel();
            return;
        }
        ids.push(card.archiveId);
    }
    state.archive = setSideScrollerArchiveEquipped(ids);
    state.archiveMessage = existing >= 0 ? '已取消携带。' : '已加入本次携带。';
    if (state.phase === 'intro' || state.phase === 'loading') state.carriedCards = getEquippedArchiveCards();
    renderArchiveControls();
}

function summonArchiveCard(card, sourceButton, index) {
    if (state.phase !== 'battle' || state.busy) return;
    if (state.carriedUsedIds.has(card.archiveId)) return;
    if (state.activeArchiveCard?.archiveId === card.archiveId) {
        clearActiveArchiveCard();
        renderArchiveControls();
        return;
    }
    const playable = cloneArchivedCardForCombat(card, index);
    if (!playable) return;
    state.activeArchiveCard = playable;
    renderArchiveCastCard(playable, sourceButton);
    renderArchiveControls();
}

function renderArchiveCastCard(card, sourceButton) {
    const layer = state.els.archiveCastLayer;
    if (!layer) return;
    layer.textContent = '';
    const button = createCombatCardElement(card, 'side-combat-card--archive-cast');
    const rootRect = state.root?.getBoundingClientRect?.();
    const sourceRect = sourceButton?.getBoundingClientRect?.();
    if (rootRect && sourceRect) {
        button.style.left = `${sourceRect.right - rootRect.left + 18}px`;
        button.style.top = `${sourceRect.top - rootRect.top - 48}px`;
    }
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
        const targetId = getCombatTargetIdAtPoint(event.clientX, event.clientY);
        finishCardDrag(event, targetId);
        if (!state.activeArchiveCard) layer.textContent = '';
    });
    button.addEventListener('pointercancel', cancelCardDrag);
    layer.appendChild(button);
}

function showArchiveCardInfo(card, anchor) {
    if (!state.els.tooltip || !state.root) return;
    closeStatusPopover();
    closeDeckPopover();
    const rect = anchor.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const tooltip = state.els.tooltip;
    tooltip.className = 'side-combat-tooltip side-combat-tooltip--status side-combat-tooltip--carry';
    tooltip.textContent = '';
    const title = document.createElement('strong');
    title.textContent = card.name;
    const body = document.createElement('span');
    body.textContent = `${SIDE_CARD_CATEGORY_LABELS[card.category] || card.category} · ${mechanicsText(card)} · ${card.description || '典藏战术卡'}`;
    tooltip.append(title, body);
    tooltip.style.left = `${rect.right - rootRect.left + 12}px`;
    tooltip.style.top = `${clampNumber(rect.top - rootRect.top + rect.height * 0.5, 24, rootRect.height - 24)}px`;
    tooltip.classList.remove('hidden');
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
    const cards = getSortedDeckPopoverCards(getRemainingCardPool());
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

function getSortedDeckPopoverCards(cards) {
    const categoryOrder = ['attack', 'heal', 'control', 'summon', 'buff'];
    const rarityOrder = { gold: 0, purple: 1, blue: 2 };
    return cards
        .map((card, index) => ({ card, index }))
        .sort((a, b) => {
            const categoryDelta = categoryOrder.indexOf(a.card.category) - categoryOrder.indexOf(b.card.category);
            if (categoryDelta !== 0) return categoryDelta;
            const rarityDelta = (rarityOrder[a.card.rarity] ?? 9) - (rarityOrder[b.card.rarity] ?? 9);
            if (rarityDelta !== 0) return rarityDelta;
            return a.index - b.index;
        })
        .map(item => item.card);
}

function beginCardDrag(button, card, event) {
    clearDragState();
    closeStatusPopover();
    state.pendingSkill = '';
    clearExecuteAimState();
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

async function finishCardArchive(event) {
    const drag = state.dragState;
    if (!drag) return;
    const card = state.hand.find(item => item.id === drag.cardId);
    if (!card) {
        animateDraggedCardBack(drag);
        clearDragState({ keepGhost: true });
        return;
    }
    const result = addCardToSideScrollerArchive(card);
    if (!result.ok) {
        pushLog('这张牌无法加入典藏牌库。');
        animateDraggedCardBack(drag);
        clearDragState({ keepGhost: true });
        renderCombat();
        return;
    }
    state.archive = result.archive;
    state.hand = state.hand.filter(item => item.id !== card.id);
    if (state.selectedCardId === card.id) state.selectedCardId = '';
    drawUntilHandSize();
    animateDraggedCardToArchive(drag, event);
    clearDragState({ keepGhost: true });
    pushLog(`${card.name}: 已收纳进典藏牌库。`);
    await autoRefreshEmptyCardPool();
    if (state.phase !== 'battle') return;
    if (maybeFailNoDamageOptions()) return;
    renderCombat();
}

async function finishCardDiscard(event) {
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
    await autoRefreshEmptyCardPool();
    if (state.phase !== 'battle') return;
    if (maybeFailNoDamageOptions()) return;
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

function animateDraggedCardToArchive(drag, event) {
    const ghost = drag?.ghost;
    if (!ghost) return;
    const rect = state.els.archiveToggle?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width * 0.5 : event.clientX;
    const y = rect ? rect.top + rect.height * 0.5 : event.clientY;
    ghost.classList.add('is-archiving');
    ghost.style.transform = `translate3d(${x - drag.startRect.width * 0.5}px, ${y - drag.startRect.height * 0.5}px, 0) scale(0.2) rotate(-8deg)`;
    window.setTimeout(() => ghost.remove(), 280);
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

function isPointInsideArchiveToggle(clientX, clientY) {
    const rect = state.els.archiveToggle?.getBoundingClientRect?.();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function getCombatTargetIdAtPoint(clientX, clientY) {
    const hitElement = document.elementFromPoint(clientX, clientY);
    const spriteEnemy = findEnemyTargetElementAtPoint(clientX, clientY);
    if (hitElement?.closest?.('.side-combat-sprite-enemy__hud') && !spriteEnemy) return '';
    const target = hitElement?.closest?.('[data-combat-target]');
    if (target?.dataset?.combatTarget === 'self') return 'self';
    if (target?.dataset?.combatTarget === 'enemy') {
        if (target.classList?.contains('side-combat-sprite-enemy') && !spriteEnemy) return '';
        return target.dataset.enemyId || '';
    }
    if (spriteEnemy) return spriteEnemy.dataset.enemyId || '';
    if (isPointInsideFritia(clientX, clientY)) return 'self';
    return '';
}

function findSpriteEnemyAtPoint(clientX, clientY) {
    const hitStack = document.elementsFromPoint?.(clientX, clientY);
    if (hitStack) {
        return hitStack.find(element => element.classList?.contains('side-combat-sprite-enemy') && element.dataset?.enemyId && !element.disabled) || null;
    }
    return [...(state.root?.querySelectorAll('.side-combat-sprite-enemy[data-enemy-id]') || [])]
        .sort((a, b) => (Number(b.style.zIndex) || 0) - (Number(a.style.zIndex) || 0))
        .find(element => {
            const rect = element.getBoundingClientRect();
            return !element.disabled && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        }) || null;
}

function findEnemyTargetElementAtPoint(clientX, clientY) {
    const hitStack = document.elementsFromPoint?.(clientX, clientY);
    if (hitStack) {
        return hitStack.find(element =>
            (element.classList?.contains('side-combat-sprite-enemy') || element.classList?.contains('side-combat-enemy'))
                && element.dataset?.enemyId
                && !element.disabled
        ) || null;
    }
    return findSpriteEnemyAtPoint(clientX, clientY)
        || null;
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

function renderStatusIcons(container, statuses, owner = null) {
    if (!container) return;
    container.textContent = '';
    aggregateStatuses(statuses, owner).forEach(status => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-status side-combat-status--${status.id}`;
        button.textContent = statusDisplayText(status);
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
    getVisibleEnemiesForRender().forEach(enemy => renderEnemyWorldStatus(layer, enemy));
}

function renderDragTargetHints() {
    const layer = state.els.targetLayer;
    if (!layer) return;
    layer.textContent = '';
    state.root?.classList.toggle('is-card-dragging', Boolean(state.dragState));
    state.root?.classList.remove('is-dragging-enemy-card', 'is-dragging-self-card');
    if (state.pendingSkill === 'execute' && state.phase === 'battle') {
        renderExecuteTargetReticle(layer);
    }
    if (!state.dragState || state.phase !== 'battle') return;
    const card = findPlayableCard(state.dragState.cardId);
    if (!card) return;
    state.root?.classList.toggle('is-dragging-enemy-card', card.targetMode === 'enemy');
    state.root?.classList.toggle('is-dragging-self-card', card.targetMode === 'self');
    if (card.targetMode === 'self') renderSelfTargetHint(layer);
    if (card.targetMode === 'enemy') {
        renderEnemyTargetHints(layer);
        renderCardTargetReticles(layer, card);
    }
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
    const enemies = state.enemies.filter(isAlive);
    enemies.forEach(enemy => {
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

function renderCardTargetReticles(layer, card) {
    if (!state.dragState) return;
    const hoveredEnemy = findEnemyByPoint(state.dragState.currentX, state.dragState.currentY);
    if (!hoveredEnemy) return;
    const enemies = isAreaCard(card) ? state.enemies.filter(isAlive) : [hoveredEnemy];
    enemies.forEach(enemy => renderTargetReticle(layer, enemy.id, 'card'));
}

function renderExecuteTargetReticle(layer) {
    const hoverId = state.executeAimHasPointer ? state.executeHoverEnemyId : '';
    const enemyId = hoverId || state.executeSeedEnemyId;
    if (!enemyId) return;
    renderTargetReticle(layer, enemyId, hoverId ? 'execute-hover' : 'execute-seed');
}

function renderTargetReticle(layer, enemyId, mode) {
    const target = findEnemyElement(enemyId);
    const rootRect = state.root?.getBoundingClientRect?.();
    const rect = target?.getBoundingClientRect?.();
    if (!target || target.disabled || !rootRect || !rect) return;
    const reticle = document.createElement('img');
    reticle.className = `side-combat-target-reticle side-combat-target-reticle--${mode}`;
    reticle.src = TARGET_RETICLE_SRC;
    reticle.alt = '';
    reticle.draggable = false;
    reticle.style.left = `${rect.left - rootRect.left + rect.width * 0.5}px`;
    reticle.style.top = `${rect.top - rootRect.top + rect.height * 0.48}px`;
    layer.appendChild(reticle);
}

function renderPlayerWorldStatus(layer) {
    const statuses = aggregateStatuses(state.player.statuses);
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
    if (isSpriteEnemy(enemy)) return;
    const statuses = aggregateStatuses(enemy.statuses, enemy);
    if (!statuses.length) return;
    const target = findEnemyHudElement(enemy.id);
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
        button.textContent = statusDisplayText(status);
        button.title = statusSummary(status);
        button.addEventListener('click', event => {
            event.stopPropagation();
            showStatusPopover(button, status);
        });
        holder.appendChild(button);
    });
    return holder;
}

function aggregateStatuses(statuses, owner = null) {
    const active = statuses.filter(status => status.turns > 0);
    const result = [];
    const skip = new Set(['bleed', 'bleed_growth', 'rupture_stack', 'focus_chain']);
    active.forEach(status => {
        if (skip.has(status.id)) return;
        const existing = result.find(item => item.id === status.id);
        if (existing) {
            existing.turns += Math.max(0, Math.round(Number(status.turns) || 0));
            existing.value += Number(status.value) || 0;
            return;
        }
        result.push({
            ...status,
            turns: Math.max(0, Math.round(Number(status.turns) || 0)),
            value: Number(status.value) || 0
        });
    });
    if (owner && getBleedRawTotal(owner) > 0) {
        result.unshift({ id: 'bleed_preview', turns: 999, value: getBleedDamagePreview(owner) });
    }
    if (owner && countStatus(owner, 'bleed_growth') > 0) {
        result.unshift({ id: 'bleed_growth', turns: 999, value: countStatus(owner, 'bleed_growth') });
    }
    if (owner && sumStatusValue(owner, 'rupture_stack') > 0) {
        result.unshift({ id: 'rupture_stack', turns: 999, value: computeRuptureMultiplier(owner) - 1 });
    }
    if (!owner && sumStatusValue({ statuses: active }, 'focus_chain') > 0) {
        result.unshift({ id: 'focus_chain', turns: 999, value: sumStatusValue({ statuses: active }, 'focus_chain') });
    }
    return result;
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

function toggleInfoLog() {
    state.infoExpanded = !state.infoExpanded;
    renderCombat();
}

function mechanicsText(card) {
    if (card.category === 'heal') {
        const value = scaleFlatCardValue(card.value);
        return card.effectKind === 'armor' ? `🛡️ ${value}` : `❤️ ${value}`;
    }
    if (card.category === 'control') return `${controlIcon(card.effectKind)} ${statusLabel(card.effectKind)} ${card.duration}`;
    if (card.category === 'summon') {
        const damage = getEffectiveCardDamageValue(card);
        const bleed = getSummonBleedValue(card);
        return isAreaCard(card) ? `🔥 群体 ${damage} 🩸${bleed}` : `🔥 ${damage} 🩸${bleed}`;
    }
    if (card.category === 'buff') {
        if (card.effectKind === 'focus') return `伤害 +${Math.round(card.value * 100)}% ✨`;
        if (card.effectKind === 'weaken') return `敌伤 -${Math.round(card.value * 100)}% 🔽`;
        if (card.effectKind === 'vulnerable') return `易伤 +${Math.round(card.value * 100)}% 🔽`;
        if (card.effectKind === 'bleed_growth') return `🩸+50% 🔽`;
        if (card.effectKind === 'rupture_stack') return `💥+${Math.round(card.value * 100)}% 🔽`;
        if (card.effectKind === 'focus_chain') return `⚔️+${Math.round(card.value * 100)}% ✨`;
        return `减伤 ${Math.round(card.value * 100)}% ✨`;
    }
    return isAreaCard(card) ? `⚔️ 群体 ${getEffectiveCardDamageValue(card)}` : `⚔️ ${getEffectiveCardDamageValue(card)}`;
}

function cardIcon(card) {
    return {
        attack: '⚔️',
        heal: card.effectKind === 'armor' ? '🛡️' : '❤️',
        control: controlIcon(card.effectKind),
        summon: '🔥',
        buff: card.targetMode === 'enemy' || card.tags?.includes('debuff') ? '🔽' : '✨'
    }[card.category] || '✦';
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

function getScaledCardDamageValue(card) {
    return scaleFlatCardValue(getCardDamageValue(card));
}

function getEffectiveCardDamageValue(card) {
    const damage = getScaledCardDamageValue(card);
    if (card?.category !== 'attack') return damage;
    const attackDown = sumStatusValue(state.player, 'guard_attack_down');
    return Math.max(1, Math.floor(damage * Math.max(0.1, 1 - attackDown)));
}

function getSummonBleedValue(card) {
    return Math.max(1, Math.floor(getEffectiveCardDamageValue(card) * BLEED_RATIO));
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
    if (id === 'silence' && hasStatus(target, 'freeze')) return;
    if (id === 'freeze') {
        target.statuses = target.statuses.filter(status => status.id !== 'silence');
    }
    if (id === 'freeze' || id === 'silence') {
        const existing = target.statuses.find(status => status.id === id && status.turns > 0);
        if (existing) {
            existing.turns += Math.max(1, Math.round(Number(turns) || 1));
            existing.value = Number(value) || 0;
            return;
        }
    }
    target.statuses.push({
        id,
        turns: Math.max(1, Math.round(Number(turns) || 1)),
        value: Number(value) || 0
    });
}

function tickStatuses(targets) {
    targets.forEach(target => {
        target.statuses.forEach(status => {
            if (isPersistentStackStatus(status.id)) return;
            status.turns -= 1;
        });
        target.statuses = target.statuses.filter(status => status.turns > 0);
    });
}

function isPersistentStackStatus(id) {
    return ['bleed', 'bleed_growth', 'rupture_stack', 'focus_chain'].includes(id);
}

function hasStatus(target, id) {
    return target.statuses.some(status => status.id === id && status.turns > 0);
}

function sumStatusValue(target, id) {
    return target.statuses
        .filter(status => status.id === id && status.turns > 0)
        .reduce((sum, status) => sum + (Number(status.value) || 0), 0);
}

function countStatus(target, id) {
    return target.statuses.filter(status => status.id === id && status.turns > 0).length;
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
        bleed: '流血',
        bleed_preview: '流血',
        bleed_growth: '血燃',
        rupture_stack: '裂解',
        shield: '护盾',
        focus: '专注',
        focus_chain: '连锁专注',
        guard_defense: '守护减伤',
        guard_attack_down: '守护代价'
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
        bleed: `敌方回合开始前受到持续伤害，当前基础值 ${Math.round(Number(status.value) || 0)}。`,
        bleed_preview: `敌方回合开始前预计受到 ${Math.round(Number(status.value) || 0)} 点流血伤害。`,
        bleed_growth: `每个敌方回合开始前让流血层成长 50%；敌方易伤/裂解会计入成长，芙提雅增伤不会写入成长基础。当前 ${Math.round(Number(status.value) || 0)} 层。`,
        rupture_stack: `受到攻击、召唤、流血伤害提高 ${pct}；超过 120% 后新层收益减半。`,
        shield: `受到伤害降低 ${pct}，剩余 ${turns}。`,
        focus: `造成伤害提高 ${pct}，剩余 ${turns}。`,
        focus_chain: `本场战斗中攻击、召唤、流血伤害提高 ${pct}。`,
        guard_defense: `神之守护减伤 ${pct}，剩余 ${turns}。`,
        guard_attack_down: `神之守护代价：攻击牌伤害降低 ${pct}，剩余 ${turns}。`
    }[status.id] || `状态剩余 ${turns}。`;
}

function statusIcon(id) {
    return {
        freeze: '冻',
        silence: '默',
        vulnerable: '破',
        weaken: '弱',
        bleed: '🩸',
        bleed_preview: '🩸',
        bleed_growth: '燃',
        rupture_stack: '裂',
        shield: '盾',
        focus: '准',
        focus_chain: '连',
        guard_defense: '守',
        guard_attack_down: '价'
    }[id] || '?';
}

function statusDisplayText(status) {
    if (status.id === 'bleed_preview') return `🩸-${Math.round(Number(status.value) || 0)}`;
    if (status.id === 'bleed_growth') return `燃${Math.round(Number(status.value) || 0)}`;
    if (status.id === 'rupture_stack') return `裂${Math.round((Number(status.value) || 0) * 100)}%`;
    if (status.id === 'focus_chain') return `连${Math.round((Number(status.value) || 0) * 100)}%`;
    return statusIcon(status.id);
}

function floatAtEnemy(enemyId, text, type) {
    const target = findEnemyElement(enemyId);
    floatAtElement(target, text, type, { enemyId });
}

function floatAtPlayer(text, type) {
    floatAtElement(state.els.playerPanel, text, type, { self: true });
}

function floatAtElement(target, text, type, options = {}) {
    if (!target || !state.root) return;
    const targetRect = target.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const floater = document.createElement('span');
    const isEnemy = target.dataset?.combatTarget === 'enemy';
    const isSelf = options.self === true;
    const isDamage = isDamageFloatType(type);
    const valueClass = isDamage ? ' side-combat-float--damage-burst' : ' side-combat-float--status-burst';
    const burstClass = isEnemy
        ? ` side-combat-float--enemy-burst${valueClass}`
        : (isSelf ? ` side-combat-float--self-burst${valueClass}` : '');
    floater.className = `side-combat-float side-combat-float--${type}${burstClass}`;
    floater.textContent = text;
    if (isEnemy) {
        const burstOffset = getEnemyFloatBurstOffset(options.enemyId || target.dataset.enemyId || '', isDamage);
        floater.style.left = `${targetRect.left - rootRect.left + ENEMY_FLOAT_BASE_X + burstOffset.x}px`;
        floater.style.top = `${targetRect.top - rootRect.top + ENEMY_FLOAT_BASE_Y + burstOffset.y}px`;
    } else if (isSelf) {
        const anchor = getPlayerFloatAnchor(rootRect, targetRect);
        const burstOffset = getPlayerFloatBurstOffset();
        floater.style.left = `${anchor.x + burstOffset.x}px`;
        floater.style.top = `${anchor.y + burstOffset.y}px`;
    } else {
        floater.style.left = `${targetRect.left - rootRect.left + targetRect.width * 0.5}px`;
        floater.style.top = `${targetRect.top - rootRect.top + targetRect.height * 0.22}px`;
    }
    const duration = isEnemy || isSelf ? 1750 : 1250;
    state.root.appendChild(floater);
    setTimeout(() => floater.remove(), duration);
}

function isDamageFloatType(type) {
    return ['damage', 'fire', 'bleed', 'execute'].includes(type);
}

function getPlayerFloatAnchor(rootRect, fallbackRect) {
    const panelRect = state.panel?.getBoundingClientRect?.();
    const hitbox = state.getFritiaHitbox?.();
    if (panelRect && hitbox) {
        return {
            x: panelRect.left - rootRect.left + (hitbox.left + hitbox.right) * 0.5 + PLAYER_FLOAT_BASE_X,
            y: panelRect.top - rootRect.top + hitbox.top + PLAYER_FLOAT_BASE_Y
        };
    }
    return {
        x: fallbackRect.left - rootRect.left + fallbackRect.width * 0.5,
        y: fallbackRect.top - rootRect.top + fallbackRect.height * 0.16
    };
}

function getPlayerFloatBurstOffset() {
    const now = performance.now();
    const current = state.playerFloatBursts || { index: 0, at: 0 };
    const index = current && now - current.at < 180 ? current.index + 1 : 0;
    state.playerFloatBursts = { index, at: now };
    const lane = index % 4;
    return {
        x: [-16, 18, 2, 30][lane],
        y: [0, -10, 14, 4][lane]
    };
}

function getEnemyFloatBurstOffset(enemyId, isDamage = false) {
    const key = enemyId || 'enemy';
    const now = performance.now();
    const current = state.enemyFloatBursts.get(key);
    const index = current && now - current.at < 180 ? current.index + 1 : 0;
    state.enemyFloatBursts.set(key, { index, at: now });
    const lane = index % 6;
    if (isDamage) {
        return {
            x: [0, 38, 18, 56, 8, 44][lane],
            y: [-18, -34, -4, -24, 10, -46][lane]
        };
    }
    return {
        x: [18, 52, 34, 68, 26, 60][lane],
        y: [18, 2, 34, 22, 48, -8][lane]
    };
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

function playGuardSkillEffect() {
    if (!state.root) return;
    healingAuraAtFritia('guard');
    const rootRect = state.root.getBoundingClientRect();
    const panelRect = state.panel?.getBoundingClientRect?.();
    const hitbox = state.getFritiaHitbox?.();
    if (!panelRect || !hitbox) return;
    const cx = panelRect.left - rootRect.left + (hitbox.left + hitbox.right) * 0.5;
    const cy = panelRect.top - rootRect.top + (hitbox.top + hitbox.bottom) * 0.48;
    const field = document.createElement('i');
    field.className = 'side-combat-skill-effect side-combat-skill-effect--guard';
    field.style.left = `${cx}px`;
    field.style.top = `${cy}px`;
    state.root.appendChild(field);
    for (let i = 0; i < 28; i += 1) {
        const particle = document.createElement('i');
        particle.className = 'side-combat-skill-particle side-combat-skill-particle--guard';
        particle.style.left = `${cx}px`;
        particle.style.top = `${cy}px`;
        const angle = (Math.PI * 2 * i) / 28;
        const radius = 58 + (i % 5) * 16;
        particle.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
        particle.style.setProperty('--dy', `${Math.sin(angle) * radius * 1.28}px`);
        particle.style.animationDelay = `${i * 24}ms`;
        state.root.appendChild(particle);
        setTimeout(() => particle.remove(), 2200);
    }
    setTimeout(() => field.remove(), 2300);
}

function playExecuteSkillEffect() {
    if (!state.root) return;
    const flash = document.createElement('div');
    flash.className = 'side-combat-skill-effect side-combat-skill-effect--execute';
    state.root.appendChild(flash);
    const boltCount = 44;
    for (let i = 0; i < boltCount; i += 1) {
        const bolt = document.createElement('i');
        bolt.className = 'side-combat-skill-bolt';
        bolt.style.left = `${-8 + (i * 37) % 116}%`;
        bolt.style.top = `${-14 + (i * 19) % 118}%`;
        bolt.style.setProperty('--angle', `${-58 + (i % 9) * 13}deg`);
        bolt.style.setProperty('--length', `${280 + (i % 7) * 72}px`);
        bolt.style.animationDelay = `${(i % 18) * 42}ms`;
        bolt.style.setProperty('--bolt-scale', `${0.76 + (i % 4) * 0.16}`);
        state.root.appendChild(bolt);
        setTimeout(() => bolt.remove(), 2300);
    }
    setTimeout(() => flash.remove(), 2300);
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
    return state.root?.querySelector(`.side-combat-sprite-enemy[data-enemy-id="${cssEscape(id)}"]`)
        || state.root?.querySelector(`.side-combat-enemy[data-enemy-id="${cssEscape(id)}"]`)
        || null;
}

function findEnemyHudElement(enemyId) {
    const id = String(enemyId || '');
    return state.root?.querySelector(`[data-enemy-role="hud"][data-enemy-id="${cssEscape(id)}"]`)
        || state.root?.querySelector(`.side-combat-enemy[data-enemy-id="${cssEscape(id)}"]`)
        || null;
}

function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
}

function updateEffectTimers() {
    renderProgressOnly();
    positionAdjutantSkills();
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

function clampNumber(value, min, max) {
    const number = Number(value) || 0;
    return Math.max(min, Math.min(max, number));
}
