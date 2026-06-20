import { getSettings } from './settings.js';
import { recordBartendingChallengeWin } from './game_state.js';

const PANEL_ID = 'bartending-challenge-panel';
const MAX_DRINKS = 8;
const INITIAL_HP = 100;
const MAX_HP = 150;
const LOW_HP_THRESHOLD = 35;
const HIGH_HP_THRESHOLD = 75;
const COMPACT_LANE_MEDIA = '(max-width: 980px)';
const PREVIEW_MAX_CHARS = 20;
const PROCESS_MAX_CHARS = 150;
const NATURAL_TEXT_CUT_MARKS = new Set([',', '.', '\uFF0C', '\u3002', '\uFF0E']);

const MIX_ACTION_DARK = Object.freeze([
    '先倒入一圈会发光的泡沫，再把冰块摇出细小裂纹',
    '用错误的节拍连续摇杯十三次，让香气变得过分热闹',
    '把装饰物短暂浸进悖谬糖雾里，再郑重放回杯口',
    '把调酒壶贴近耳边听气泡唱歌，并按听到的旋律补摇',
    '把酒液分成三层后又突然合回一层，制造不稳定口感'
]);

const MIX_ACTION_GOOD = Object.freeze([
    '先冷却杯壁，再轻摇到气泡细密均匀',
    '严格量取甜酸比例，并用长吧勺缓慢搅拌',
    '轻拍香草释放香气，只保留清爽的前调',
    '先过滤碎冰，再让果香和酒香自然融合',
    '用稳定节奏短摇，避免材料被过度扰动',
    '最后只点上一点装饰香气，让口感保持干净'
]);

const INGREDIENTS = Object.freeze({
    base: [
        { name: '金酒', weird: false },
        { name: '伏特加', weird: false },
        { name: '白朗姆', weird: false },
        { name: '龙舌兰', weird: false },
        { name: '威士忌', weird: false },
        { name: '白兰地', weird: false },
        { name: '清酒', weird: false },
        { name: '起泡酒', weird: false },
        { name: '泰坦冷却液', weird: true },
        { name: '巴德尔试剂', weird: true }
    ],
    flavor: [
        { name: '青柠汁', weird: false },
        { name: '石榴糖浆', weird: false },
        { name: '苦精', weird: false },
        { name: '椰浆', weird: false },
        { name: '姜汁汽水', weird: false },
        { name: '草莓果泥', weird: false },
        { name: '蜂蜜水', weird: false },
        { name: '咖啡利口甜', weird: false },
        { name: '琴诺秘制鲜乳', weird: true },
        { name: '泡椒糖霜', weird: true }
    ],
    garnish: [
        { name: '柠檬片', weird: false },
        { name: '薄荷叶', weird: false },
        { name: '鸡尾酒樱桃', weird: false },
        { name: '橙皮卷', weird: false },
        { name: '青橄榄', weird: false },
        { name: '迷迭香', weird: false },
        { name: '可食用花瓣', weird: false },
        { name: '麻辣味巧克力', weird: true },
        { name: '蠕动的鱿鱼须', weird: true },
        { name: '世界树的叶子', weird: true }
    ]
});

const els = {};
const state = {
    visible: false,
    hp: INITIAL_HP,
    drinksConsumed: 0,
    phase: 'select',
    selected: {
        base: INGREDIENTS.base[0].name,
        flavor: INGREDIENTS.flavor[0].name,
        garnish: INGREDIENTS.garnish[0].name
    },
    custom: {
        base: '',
        flavor: '',
        garnish: ''
    },
    currentResult: null,
    skippedCurrentResult: false,
    lastStatusKind: '',
    isRequesting: false,
    abortController: null,
    requestSeq: 0,
    customDraft: {
        base: null,
        flavor: null,
        garnish: null
    },
    winRecorded: false
};

export function initBartendingChallenge() {
    cacheElements();
    if (!els.panel) return;

    renderIngredientLists();
    bindEvents();
    resetGameState();
    render();
}

export function openBartendingChallenge() {
    if (!els.panel) cacheElements();
    if (!els.panel) return;
    abortPendingRequest();
    resetGameState();
    state.visible = true;
    els.panel.classList.remove('hidden');
    setTimeout(() => els.noteInput?.focus(), 80);
    render();
}

export function closeBartendingChallenge() {
    if (!els.panel) return;
    abortPendingRequest();
    state.visible = false;
    els.panel.classList.add('hidden');
    resetGameState();
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: PANEL_ID } }));
}

export function isBartendingChallengeVisible() {
    return !!els.panel && !els.panel.classList.contains('hidden');
}

function cacheElements() {
    els.panel = document.getElementById(PANEL_ID);
    els.resultPanel = els.panel?.querySelector('.bartending-result-panel');
    els.close = document.getElementById('bartending-close');
    els.hpValue = document.getElementById('bartending-hp-value');
    els.hpBar = document.getElementById('bartending-hp-bar');
    els.hpState = document.getElementById('bartending-hp-state');
    els.roundValue = document.getElementById('bartending-round-value');
    els.drinkCount = document.getElementById('bartending-drink-count');
    els.baseList = document.getElementById('bartending-base-list');
    els.flavorList = document.getElementById('bartending-flavor-list');
    els.garnishList = document.getElementById('bartending-garnish-list');
    els.baseCustom = document.getElementById('bartending-base-custom');
    els.flavorCustom = document.getElementById('bartending-flavor-custom');
    els.garnishCustom = document.getElementById('bartending-garnish-custom');
    els.noteInput = document.getElementById('bartending-note');
    els.startBtn = document.getElementById('bartending-start-btn');
    els.status = document.getElementById('bartending-status');
    els.slotBase = document.getElementById('bartending-slot-base');
    els.slotFlavor = document.getElementById('bartending-slot-flavor');
    els.slotGarnish = document.getElementById('bartending-slot-garnish');
    els.previewPanel = document.getElementById('bartending-preview-panel');
    els.previewText = document.getElementById('bartending-preview-text');
    els.previewHint = document.getElementById('bartending-preview-hint');
    els.loading = document.getElementById('bartending-loading');
    els.drinkBtn = document.getElementById('bartending-drink-btn');
    els.skipBtn = document.getElementById('bartending-skip-btn');
    els.revealPanel = document.getElementById('bartending-reveal-panel');
    els.resultName = document.getElementById('bartending-result-name');
    els.resultDelta = document.getElementById('bartending-result-delta');
    els.resultKind = document.getElementById('bartending-result-kind');
    els.resultProcess = document.getElementById('bartending-result-process');
    els.resultTags = document.getElementById('bartending-result-tags');
    els.nextBtn = document.getElementById('bartending-next-btn');
    els.endPanel = document.getElementById('bartending-end-panel');
    els.endTitle = document.getElementById('bartending-end-title');
    els.endText = document.getElementById('bartending-end-text');
    els.restartBtn = document.getElementById('bartending-restart-btn');
    els.laneLabels = Array.from(els.panel?.querySelectorAll('.bartending-mixer-panel .bartending-lane > .otome-section-label') || []);
}

function bindEvents() {
    els.close?.addEventListener('click', closeBartendingChallenge);
    els.startBtn?.addEventListener('click', () => { void handleStartMixing(); });
    els.drinkBtn?.addEventListener('click', handleDrink);
    els.skipBtn?.addEventListener('click', handleSkip);
    els.nextBtn?.addEventListener('click', startNextSelection);
    els.restartBtn?.addEventListener('click', () => {
        resetGameState();
        render();
    });

    for (const [category, input] of Object.entries({
        base: els.baseCustom,
        flavor: els.flavorCustom,
        garnish: els.garnishCustom
    })) {
        input?.addEventListener('input', () => {
            state.customDraft[category] = input.value.trim();
            renderIngredientSelection();
            renderSelectedSlots();
        });
        input?.addEventListener('blur', () => commitCustomIngredient(category));
        input?.addEventListener('change', () => commitCustomIngredient(category));
    }

    bindLaneCollapseEvents();
}

function bindLaneCollapseEvents() {
    for (const label of els.laneLabels || []) {
        if (label.dataset.bartendingCollapseBound === '1') continue;
        const lane = label.closest('.bartending-lane');
        if (!lane) continue;
        label.dataset.bartendingCollapseBound = '1';
        label.classList.add('bartending-lane-label');
        label.setAttribute('role', 'button');
        label.setAttribute('aria-expanded', 'true');
        label.addEventListener('click', () => toggleIngredientLane(lane, label));
        label.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (!isCompactLaneLayout()) return;
            event.preventDefault();
            toggleIngredientLane(lane, label);
        });
    }
    window.addEventListener('resize', syncIngredientLaneCollapseState, { passive: true });
    syncIngredientLaneCollapseState();
}

function toggleIngredientLane(lane, label) {
    if (!isCompactLaneLayout()) return;
    lane.classList.toggle('is-collapsed');
    label.setAttribute('aria-expanded', String(!lane.classList.contains('is-collapsed')));
}

function syncIngredientLaneCollapseState() {
    const compact = isCompactLaneLayout();
    for (const label of els.laneLabels || []) {
        const lane = label.closest('.bartending-lane');
        if (!lane) continue;
        if (!compact) lane.classList.remove('is-collapsed');
        label.tabIndex = compact ? 0 : -1;
        label.classList.toggle('is-toggle-enabled', compact);
        label.setAttribute('aria-expanded', String(!lane.classList.contains('is-collapsed')));
    }
}

function resetIngredientLaneCollapse() {
    for (const label of els.laneLabels || []) {
        const lane = label.closest('.bartending-lane');
        lane?.classList.remove('is-collapsed');
        label.setAttribute('aria-expanded', 'true');
    }
    syncIngredientLaneCollapseState();
}

function isCompactLaneLayout() {
    return window.matchMedia?.(COMPACT_LANE_MEDIA).matches ?? window.innerWidth <= 980;
}

function renderIngredientLists() {
    renderIngredientList('base', els.baseList);
    renderIngredientList('flavor', els.flavorList);
    renderIngredientList('garnish', els.garnishList);
}

function renderIngredientList(category, container) {
    if (!container) return;
    container.innerHTML = '';
    for (const ingredient of INGREDIENTS[category]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bartending-ingredient';
        if (ingredient.weird) button.classList.add('is-weird');
        button.dataset.category = category;
        button.dataset.value = ingredient.name;
        button.innerHTML = `
            <span>${escapeHtml(ingredient.name)}</span>
            <small>${ingredient.weird ? '异常材料' : '标准材料'}</small>
        `;
        button.addEventListener('click', () => selectIngredient(category, ingredient.name));
        container.appendChild(button);
    }
}

function selectIngredient(category, value) {
    if (!INGREDIENTS[category]) return;
    state.selected[category] = value;
    state.custom[category] = '';
    state.customDraft[category] = null;
    const input = getCustomInput(category);
    if (input) input.value = '';
    renderIngredientSelection();
    renderSelectedSlots();
}

function getCustomInput(category) {
    if (category === 'base') return els.baseCustom;
    if (category === 'flavor') return els.flavorCustom;
    if (category === 'garnish') return els.garnishCustom;
    return null;
}

function resetGameState() {
    state.hp = INITIAL_HP;
    state.drinksConsumed = 0;
    state.phase = 'select';
    state.currentResult = null;
    state.skippedCurrentResult = false;
    state.winRecorded = false;
    state.isRequesting = false;
    state.lastStatusKind = '';
    state.selected.base = INGREDIENTS.base[0].name;
    state.selected.flavor = INGREDIENTS.flavor[0].name;
    state.selected.garnish = INGREDIENTS.garnish[0].name;
    state.custom.base = '';
    state.custom.flavor = '';
    state.custom.garnish = '';
    state.customDraft.base = null;
    state.customDraft.flavor = null;
    state.customDraft.garnish = null;
    if (els.baseCustom) els.baseCustom.value = '';
    if (els.flavorCustom) els.flavorCustom.value = '';
    if (els.garnishCustom) els.garnishCustom.value = '';
    if (els.noteInput) els.noteInput.value = '';
    resetIngredientLaneCollapse();
    setStatus('选择三种材料后开始特调。', 'info');
}

function abortPendingRequest() {
    state.requestSeq += 1;
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
    }
    state.isRequesting = false;
}

function render() {
    renderVitals();
    renderIngredientSelection();
    renderSelectedSlots();
    renderPhasePanels();
}

function renderVitals() {
    const clampedHp = Math.max(0, Math.round(state.hp));
    if (els.hpValue) els.hpValue.textContent = String(clampedHp);
    if (els.hpBar) {
        const pct = Math.max(0, Math.min(100, clampedHp));
        els.hpBar.style.width = `${pct}%`;
        els.hpBar.dataset.level = clampedHp <= LOW_HP_THRESHOLD ? 'danger' : (clampedHp >= HIGH_HP_THRESHOLD ? 'high' : 'normal');
    }
    if (els.hpState) {
        els.hpState.textContent = clampedHp <= LOW_HP_THRESHOLD ? '危险' : (clampedHp >= HIGH_HP_THRESHOLD ? '稳定' : '波动');
        els.hpState.dataset.level = clampedHp <= LOW_HP_THRESHOLD ? 'danger' : (clampedHp >= HIGH_HP_THRESHOLD ? 'high' : 'normal');
    }
    const nextRound = Math.min(MAX_DRINKS, state.drinksConsumed + 1);
    if (els.roundValue) els.roundValue.textContent = `${nextRound}/${MAX_DRINKS}`;
    if (els.drinkCount) els.drinkCount.textContent = `${state.drinksConsumed}/${MAX_DRINKS}`;
}

function renderIngredientSelection() {
    for (const category of Object.keys(INGREDIENTS)) {
        const container = category === 'base' ? els.baseList : (category === 'flavor' ? els.flavorList : els.garnishList);
        if (!container) continue;
        container.querySelectorAll('.bartending-ingredient').forEach((button) => {
            button.classList.toggle('is-selected', !hasCustomIngredient(category) && button.dataset.value === state.selected[category]);
        });
    }
}

function renderSelectedSlots() {
    setSlotText(els.slotBase, getDisplayIngredient('base'));
    setSlotText(els.slotFlavor, getDisplayIngredient('flavor'));
    setSlotText(els.slotGarnish, getDisplayIngredient('garnish'));
}

function setSlotText(valueEl, text) {
    if (!valueEl) return;
    const value = String(text || '').trim();
    valueEl.textContent = value || '未选择';
    const slot = valueEl.closest('.bartending-slot');
    slot?.classList.toggle('is-custom', Boolean(value && !isPresetIngredient(value)));
}

function renderPhasePanels() {
    const isLoading = state.phase === 'loading';
    const isPreview = state.phase === 'preview';
    const isRevealed = state.phase === 'revealed';
    const isEnded = state.phase === 'ended';

    els.resultPanel?.classList.toggle('is-ended', isEnded);
    els.loading?.classList.toggle('hidden', !isLoading);
    els.previewPanel?.classList.toggle('hidden', !(isPreview || isLoading));
    els.revealPanel?.classList.toggle('hidden', !(isRevealed || (isEnded && state.currentResult)));
    els.endPanel?.classList.toggle('hidden', !isEnded);

    if (els.startBtn) {
        els.startBtn.disabled = isLoading || isPreview || isRevealed || isEnded;
        els.startBtn.textContent = isLoading ? '调制中...' : '开始特调';
    }
    if (els.previewText) {
        els.previewText.textContent = state.currentResult?.previewText || '琴诺正在摇杯，暂时看不清结果。';
    }
    if (els.previewHint) {
        els.previewHint.textContent = isLoading ? '正在等待琴诺完成本杯。' : '只显示外观和气味，真正效果要喝下才知道。';
    }
    if (state.currentResult && (isRevealed || isEnded)) {
        renderRevealedResult(state.currentResult);
    }
    els.nextBtn?.classList.toggle('hidden', isEnded);
    if (isEnded) {
        renderEndState();
    }
}

function setStatus(text, kind = '') {
    if (!els.status) return;
    state.lastStatusKind = kind;
    els.status.textContent = text || '';
    els.status.dataset.kind = kind;
}

function getChosenIngredient(category) {
    return (state.custom[category] || state.selected[category] || '').trim();
}

function getDisplayIngredient(category) {
    const draft = state.customDraft[category];
    if (draft !== null && draft !== undefined) {
        return (draft || state.selected[category] || '').trim();
    }
    return (state.custom[category] || state.selected[category] || '').trim();
}

function hasCustomIngredient(category) {
    const draft = state.customDraft[category];
    if (draft !== null && draft !== undefined) return Boolean(String(draft).trim());
    return Boolean(state.custom[category]);
}

function commitCustomIngredient(category) {
    if (!INGREDIENTS[category]) return;
    const input = getCustomInput(category);
    const value = String(input?.value || '').trim();
    state.custom[category] = value;
    state.customDraft[category] = null;
    renderIngredientSelection();
    renderSelectedSlots();
}

function getRoundIngredients() {
    commitAllCustomIngredients();
    return {
        base: getChosenIngredient('base'),
        flavor: getChosenIngredient('flavor'),
        garnish: getChosenIngredient('garnish')
    };
}

function commitAllCustomIngredients() {
    for (const category of Object.keys(INGREDIENTS)) {
        commitCustomIngredient(category);
    }
}

async function handleStartMixing() {
    if (state.isRequesting || state.phase !== 'select') return;
    const ingredients = getRoundIngredients();
    if (!ingredients.base || !ingredients.flavor || !ingredients.garnish) {
        setStatus('基酒、调味和装饰都要各选一种。', 'warn');
        return;
    }

    const settings = getSettings();
    if (!settings.apiKey) {
        setStatus('请先在设置中填写 API Key 后再请琴诺调酒。', 'warn');
        return;
    }

    const note = els.noteInput?.value.trim() || '';
    state.phase = 'loading';
    state.isRequesting = true;
    state.currentResult = null;
    state.skippedCurrentResult = false;
    state.requestSeq += 1;
    const requestSeq = state.requestSeq;
    state.abortController = new AbortController();
    setStatus('琴诺正在理解你的材料，并认真摇晃调酒壶...', 'loading');
    render();

    let rawCompletion = '';
    try {
        rawCompletion = await requestBartendingCompletion({
            settings,
            ingredients,
            note,
            hp: state.hp,
            drinksConsumed: state.drinksConsumed,
            signal: state.abortController.signal
        });
        if (!isCurrentRequest(requestSeq)) return;
        const parsed = parseBartendingJson(rawCompletion);
        state.currentResult = normalizeBartendingResult(parsed, ingredients, state.hp, { source: 'llm' });
        state.phase = 'preview';
        setStatus('本杯完成。先观察外观和气味，再决定要不要喝。', 'ok');
    } catch (err) {
        if (!isCurrentRequest(requestSeq) || err?.name === 'AbortError') return;
        const fallbackReason = getFallbackReason(err);
        const fallback = createFallbackResult(ingredients, { reason: fallbackReason });
        logBartendingFallback({
            reason: fallbackReason,
            error: err,
            rawCompletion,
            ingredients,
            note,
            hp: state.hp,
            drinksConsumed: state.drinksConsumed,
            settings,
            fallback
        });
        state.currentResult = normalizeBartendingResult(fallback, ingredients, state.hp, { source: 'fallback', reason: fallbackReason });
        state.phase = 'preview';
        setStatus('模型通讯异常，琴诺启用了本地备用酒谱。', 'warn');
    } finally {
        if (isCurrentRequest(requestSeq)) {
            state.isRequesting = false;
            state.abortController = null;
            render();
        }
    }
}

function isCurrentRequest(requestSeq) {
    return state.visible && requestSeq === state.requestSeq;
}

function getFallbackReason(error) {
    if (!error) return '未知错误，未能使用 LLM 结果。';
    const message = String(error.message || '').trim();
    if (message) return message;
    return `${error.name || 'Error'}：未能使用 LLM 结果。`;
}

function logBartendingFallback({ reason, error, rawCompletion, ingredients, note, hp, drinksConsumed, settings, fallback }) {
    const errorInfo = {
        name: error?.name || '',
        message: error?.message || '',
        stack: error?.stack || '',
        cause: error?.cause || null
    };
    console.warn('[BartendingChallenge] 使用本地预置备用酒谱。LLM 查询/解析未成功。', {
        reason,
        error: errorInfo,
        rawCompletion,
        rawCompletionLength: String(rawCompletion || '').length,
        ingredients,
        note,
        hp: Math.round(hp),
        drinksConsumed,
        requestConfig: {
            baseUrl: normalizeBaseUrl(settings?.baseUrl || ''),
            model: settings?.model || '',
            hasApiKey: Boolean(settings?.apiKey)
        },
        fallback
    });
}

function handleDrink() {
    if (state.phase !== 'preview' || !state.currentResult) return;
    const result = state.currentResult;
    state.skippedCurrentResult = false;
    state.hp = Math.max(0, Math.min(MAX_HP, state.hp + result.hpDelta));
    state.drinksConsumed += 1;
    state.phase = (state.hp <= 0 || state.drinksConsumed >= MAX_DRINKS) ? 'ended' : 'revealed';
    setStatus(
        result.hpDelta >= 0
            ? `HP +${result.hpDelta}。这杯意外地让分析员精神一振。`
            : `HP ${result.hpDelta}。分析员开始怀疑自己的味觉。`,
        result.hpDelta >= 0 ? 'ok' : 'warn'
    );
    render();
}

function handleSkip() {
    if (state.phase !== 'preview' || !state.currentResult) return;
    state.skippedCurrentResult = true;
    state.phase = 'revealed';
    setStatus('你放过了这杯，回合不计数。琴诺公开了调制结果。', 'info');
    render();
}

function startNextSelection() {
    if (state.phase !== 'revealed') return;
    state.currentResult = null;
    state.skippedCurrentResult = false;
    state.phase = 'select';
    setStatus('继续选择下一杯材料。必须喝满 8 杯才算完成挑战。', 'info');
    render();
}

function renderRevealedResult(result) {
    if (els.resultName) els.resultName.textContent = result.cocktailName;
    if (els.resultDelta) {
        if (state.skippedCurrentResult) {
            els.resultDelta.textContent = result.isDarkCuisine ? '危险回避' : '错失良机';
            els.resultDelta.dataset.kind = result.isDarkCuisine ? 'avoid' : 'missed';
        } else {
            els.resultDelta.textContent = result.hpDelta >= 0 ? `+${result.hpDelta} HP` : `${result.hpDelta} HP`;
            els.resultDelta.dataset.kind = result.hpDelta >= 0 ? 'heal' : 'damage';
        }
    }
    if (els.resultKind) {
        els.resultKind.textContent = result.isDarkCuisine
            ? `黑暗料理 · 危险度 ${result.darkLevel}`
            : `良好饮品 · 偏离度 ${result.darkLevel}`;
        els.resultKind.dataset.kind = result.isDarkCuisine ? 'dark' : 'good';
    }
    if (els.resultProcess) els.resultProcess.textContent = result.processText;
    if (els.resultTags) {
        els.resultTags.innerHTML = '';
        result.tags.forEach((tag) => {
            const span = document.createElement('span');
            span.textContent = tag;
            els.resultTags.appendChild(span);
        });
    }
}

function renderEndState() {
    const victory = state.hp > 0 && state.drinksConsumed >= MAX_DRINKS;
    if (victory && !state.winRecorded) {
        state.winRecorded = true;
        recordBartendingChallengeWin();
    }
    if (els.endPanel) els.endPanel.dataset.result = victory ? 'win' : 'lose';
    if (els.endTitle) els.endTitle.textContent = victory ? '挑战成功' : '挑战失败';
    if (els.endText) {
        els.endText.textContent = victory
            ? '分析员精神倍增，把所有天启者都带进了自己的房间。'
            : '分析员晕倒了，被莫尔索拖回了她的房间。';
    }
    if (state.currentResult) renderRevealedResult(state.currentResult);
}

function buildBartendingRequestBody({ ingredients, note, hp, drinksConsumed, settings }) {
    const mixing = chooseMixingDirection();
    return {
        model: settings.model,
        stream: true,
        temperature: 0.95,
        // Do not set max_tokens here. This endpoint must receive a complete JSON object;
        // generation caps can truncate the closing braces and force an unnecessary fallback.
        messages: [
            {
                role: 'system',
                content: [
                    '你是芙提雅 Online NEXT 的“调酒挑战”结果生成器。',
                    '角色：琴诺是暖调闲聚里的调酒师，擅长把分析员给出的材料，理解成夸张、可爱、不可预测的黑暗料理调酒。',
                    '你必须只输出严格 JSON。必须保证 JSON 格式正确。禁止 Markdown，禁止解释，禁止代码，禁止外部贴图 URL。',
                    'JSON 字符串内部如需引用角色台词，使用中文弯引号或单书名号，不要在字符串内部直接使用未转义英文双引号。',
                    '分析员选择的三种材料只是灵感来源，不是决定结果的唯一因素。不要因为相同材料组合就反复生成相同或稳定偏好的结果。',
                    '调酒过程必须展现出琴诺可爱、害羞、胆小慌张、充满奇思妙想的个性。琴诺每次都会使用完全不同且不可预测的调酒方式。不要使用占卜类行为。不要让调酒过程看起来像是现实中专业调酒师的操作指导。',
                    '材料本身只用作琴诺的调酒参考，琴诺的临场动作、摇杯节奏、过滤方式、装饰处理、误解方式和突发灵感，必须比材料本身更能影响最终好坏。',
                    '输出内容必须是虚构游戏语境。不要输出现实可复现的危险配方、真实毒物、真实伤害指导或具体危险配比。',
                    '结果要有不确定性：不要每次都是黑暗料理，也不要每次都是好酒；同一材料组合重复请求时，也应因为调配动作不同而出现明显差异。',
                    'previewText 只能写生成的酒品的外观和气味，尽量使用客观的风格描述，避免使用带有明显正面或负面含义的形容词 (例如“可怕的味道”)，也不得提前暴露 HP、黑暗料理、实际使用的材料、危险、好坏或饮用结果。',
                    '所有字段都必须存在。'
                ].join('\n')
            },
            {
                role: 'user',
                content: [
                    '请根据本回合材料生成一杯调酒挑战结果。',
                    `当前 HP：${Math.round(hp)}`,
                    `已喝杯数：${drinksConsumed}/${MAX_DRINKS}`,
                    `基酒：${ingredients.base}`,
                    `调味：${ingredients.flavor}`,
                    `装饰：${ingredients.garnish}`,
                    `玩家备注：${note || '无'}`,
                    `本轮随机调配倾向：${mixing.intentLabel}`,
                    `本轮琴诺关键动作：${mixing.action}`,
                    `本轮随机种子：${mixing.seed}`,
                    '',
                    '你必须只输出严格 JSON。字段协议如下。字段名固定，但不要复用协议说明里的占位文字，也不要把某个危险等级或 HP 变化固定成默认值：',
                    '- cocktailName：中文字符串，4到10字。',
                    '- previewText：中文字符串，只描述外观和气味，15到20个中文字符左右。',
                    '- isDarkCuisine：布尔值。true 为黑暗料理，false 为正常饮品。',
                    '- darkLevel：整数，从 1 到 5 中按本杯调配过程分散选择，避免集中在同一个数值。',
                    '- hpDelta：整数。按本杯性质、darkLevel、当前 HP 和调配动作生成，避免重复同一个伤害或回血数值。',
                    '- processText：中文字符串，约100字，描述琴诺的虚构调酒过程，不要包含现实危险配方或真实毒物配比。琴诺喜欢使用古怪和夸张的调酒过程，并根据自己的想法临时添加更多的材料，调配出更加危险或者更加好喝的酒品。调酒过程应该展现出琴诺的可爱、害羞、胆小慌张、充满奇思妙想的个性',
                    '- tags：字符串数组，2到5个短标签。',
                    '',
                    '平衡倾向：',
                    '1. 本轮随机调配倾向来自前端。你要优先遵循这个倾向，但仍允许少量意外反转。',
                    '2. 材料只提供风味和视觉线索，不能让固定材料组合稳定变成好酒；调配动作必须明显改变最终结果。',
                    '3. 琴诺会参考分析员玩家给出的材料，但不一定正确理解；她的临场动作可以让正常材料变成黑暗料理，也可以把奇怪材料意外调好。不要使用占卜类行为',
                    '4. previewText 的前台描述必须具有很大的迷惑性，积极描述也可以对应黑暗料理。',
                    '5. isDarkCuisine=true 表示饮用后扣血，hpDelta 应为负数。',
                    '6. isDarkCuisine=false 表示饮用后回血，hpDelta 应为正数。',
                    '7. darkLevel 为 1 到 5 的整数，越高越偏离正常观念。',
                    '8. hpDelta 为整数，可能为正数或负数。darkLevel 数值越高，hpDelta 的绝对值通常更大。darkLevel 1 的饮品可能只有轻微效果（例如 ±10 HP），darkLevel 5 的饮品可能有极端效果（例如 -40 HP 或 +30 HP）。同一 darkLevel 下，hpDelta 数值也应有一定随机性，不要每次都固定在某几个数值上。',
                    '9. tags 为 2 到 5 个短标签。',
                    '只输出 JSON，不要输出其他内容。'
                ].join('\n')
            }
        ]
    };
}

function chooseMixingDirection() {
    const isDarkIntent = Math.random() < 0.6;
    const actions = isDarkIntent ? MIX_ACTION_DARK : MIX_ACTION_GOOD;
    return {
        intent: isDarkIntent ? 'dark' : 'good',
        intentLabel: isDarkIntent
            ? '黑暗料理相关操作优先，但仍允许极少数意外调好'
            : '正常饮品相关操作优先，但仍允许少量失手变黑暗料理',
        action: actions[randomInt(0, actions.length - 1)],
        seed: `${Date.now().toString(36)}-${randomInt(1000, 9999)}`
    };
}

async function requestBartendingCompletion({ settings, ingredients, note, hp, drinksConsumed, signal }) {
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    if (!baseUrl) throw new Error('未配置 Base URL。');
    const body = buildBartendingRequestBody({ ingredients, note, hp, drinksConsumed, settings });
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(body),
        signal
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${bodyText.slice(0, 160)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        return extractCompletionText(json).trim() || JSON.stringify(json);
    }

    if (!response.body) throw new Error('API 没有返回可读取内容。');
    return readCompletionStream(response);
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

function parseBartendingJson(content) {
    const normalized = stripJsonFences(content);
    if (!normalized.trim()) throw new Error('LLM 返回空内容。');
    const parsed = tryParseJsonText(normalized);
    if (parsed.ok) return parsed.value;

    const quoteFixed = fixLikelyJsonSyntaxQuotes(normalized);
    if (quoteFixed !== normalized) {
        const fixedParsed = tryParseJsonText(quoteFixed);
        if (fixedParsed.ok) return fixedParsed.value;
    }

    throw new Error(`LLM JSON 解析失败：${parsed.error?.message || '未知解析错误'}`);
}

function tryParseJsonText(text) {
    try {
        return { ok: true, value: JSON.parse(text) };
    } catch (error) {
        const extracted = tryExtractJsonObject(text);
        if (extracted.ok) return extracted;
        return { ok: false, error: extracted.error || error };
    }
}

function tryExtractJsonObject(text) {
    const first = text.indexOf('{');
    if (first < 0) return { ok: false, error: new Error('LLM 返回非 JSON。') };
    let start = first;
    let lastError = null;
    while (start >= 0) {
        const end = findJsonObjectEnd(text, start);
        if (end <= start) break;
        try {
            return { ok: true, value: JSON.parse(text.slice(start, end + 1)) };
        } catch (error) {
            lastError = error;
        }
        start = text.indexOf('{', end + 1);
    }
    return { ok: false, error: lastError || new Error('LLM JSON 对象未闭合。') };
}

function fixLikelyJsonSyntaxQuotes(text) {
    return String(text || '')
        .replace(/[“”]([\w$-]+)[“”]\s*:/g, '"$1":')
        .replace(/:\s*[“”]([^“”]*?)[“”](?=\s*[,}\]])/g, ': "$1"')
        .replace(/[‘’]([\w$-]+)[‘’]\s*:/g, '"$1":')
        .replace(/:\s*[‘’]([^‘’]*?)[‘’](?=\s*[,}\]])/g, ': "$1"');
}

function normalizeBartendingResult(raw, ingredients, currentHp, options = {}) {
    const fallback = createFallbackResult(ingredients, options);
    const source = raw && typeof raw === 'object' ? raw : fallback;
    let isDarkCuisine = typeof source.isDarkCuisine === 'boolean'
        ? source.isDarkCuisine
        : inferDarkCuisine(source);
    let darkLevel = clampInt(source.darkLevel, 1, 5, fallback.darkLevel);
    let hpDelta = Number(source.hpDelta);
    if (!Number.isFinite(hpDelta)) {
        hpDelta = fallback.hpDelta;
        isDarkCuisine = fallback.isDarkCuisine;
        darkLevel = fallback.darkLevel;
    }

    hpDelta = clampHpDelta({ hpDelta, isDarkCuisine, darkLevel, currentHp });

    const result = {
        cocktailName: sanitizeName(source.cocktailName, fallback.cocktailName),
        previewText: sanitizePreview(source.previewText, fallback.previewText),
        isDarkCuisine,
        darkLevel,
        hpDelta,
        processText: sanitizeProcessText(source.processText, fallback.processText),
        tags: sanitizeTags(source.tags, fallback.tags)
    };

    if (result.isDarkCuisine && result.hpDelta > 0) {
        result.hpDelta = clampHpDelta({ hpDelta: -result.hpDelta, isDarkCuisine: true, darkLevel: result.darkLevel, currentHp });
    } else if (!result.isDarkCuisine && result.hpDelta < 0) {
        result.hpDelta = clampHpDelta({ hpDelta: Math.abs(result.hpDelta), isDarkCuisine: false, darkLevel: result.darkLevel, currentHp });
    }
    return result;
}

function clampHpDelta({ hpDelta, isDarkCuisine, darkLevel, currentHp }) {
    let value = Math.round(Number(hpDelta));
    if (!Number.isFinite(value)) value = 0;

    if (isDarkCuisine) {
        value = -Math.abs(value || randomInt(8, 28));
        const requestedDamage = Math.abs(value);
        const disasterAllowed = darkLevel >= 5 && Math.random() < 0.10;
        const minDamage = disasterAllowed ? 40 : 8;
        const maxDamage = disasterAllowed ? 49 : 28;
        let damage = Math.max(minDamage, Math.min(maxDamage, requestedDamage));
        if (currentHp <= LOW_HP_THRESHOLD) damage = Math.min(damage, 25);
        return -damage;
    }

    value = Math.abs(value || randomInt(8, 25));
    let heal = Math.max(8, Math.min(25, value));
    if (currentHp >= HIGH_HP_THRESHOLD) heal = Math.min(heal, 15);
    return heal;
}

function createFallbackResult(ingredients, options = {}) {
    const mixing = chooseMixingDirection();
    const weirdCount = countWeirdIngredients(ingredients);
    const roll = Math.random();
    const darkBias = mixing.intent === 'dark' ? 0.6 : 0.26;
    const disaster = roll < 0.04 + weirdCount * 0.012 && mixing.intent === 'dark';
    const isDarkCuisine = disaster || roll < Math.min(0.82, darkBias + weirdCount * 0.035);
    const darkLevel = isDarkCuisine
        ? (disaster ? 5 : Math.min(5, randomInt(2, 4) + (weirdCount > 1 ? 1 : 0)))
        : randomInt(1, 3);
    const hpDelta = isDarkCuisine
        ? -(disaster ? randomInt(40, 49) : randomInt(8, 28))
        : randomInt(8, 25);
    const names = isDarkCuisine
        ? ['悖谬星雾杯', '泡椒月光露', '螺丝樱桃酒', '逆流莓果饮']
        : ['晨光薄荷杯', '玫瑰晴空酒', '青柠星露', '蜜桃微风杯'];
    const previews = [
        '杯中泛着柔光，闻起来像甜花香',
        '细小气泡上浮，散出清冷果香',
        '金色酒液很亮，气味温柔干净',
        '粉雾绕着杯口，带一点莓果甜香'
    ];
    const base = ingredients?.base || '基酒';
    const flavor = ingredients?.flavor || '调味';
    const garnish = ingredients?.garnish || '装饰';
    return {
        cocktailName: names[randomInt(0, names.length - 1)],
        previewText: previews[randomInt(0, previews.length - 1)],
        isDarkCuisine,
        darkLevel,
        hpDelta,
        processText: `琴诺认真记下${base}、${flavor}和${garnish}，但临场决定${mixing.action}。杯中冒出一圈虚构的小星光，她又按自己的直觉调整香气，确信这杯已经达到挑战标准，才小心递给分析员。`,
        tags: isDarkCuisine ? ['琴诺特调', '黑暗料理', '虚构材料'] : ['琴诺特调', '清爽', '意外好喝'],
        fallbackReason: options.reason || ''
    };
}

function inferDarkCuisine(source) {
    const hp = Number(source?.hpDelta);
    if (Number.isFinite(hp)) return hp < 0;
    const level = Number(source?.darkLevel);
    if (Number.isFinite(level)) return level >= 4;
    return Math.random() < 0.58;
}

function countWeirdIngredients(ingredients) {
    let count = 0;
    for (const [category, value] of Object.entries(ingredients || {})) {
        const preset = INGREDIENTS[category]?.find(item => item.name === value);
        if (preset?.weird || (value && !preset)) count += 1;
    }
    return count;
}

function sanitizeName(value, fallback) {
    const text = String(value || '').replace(/[^\u4e00-\u9fff]/g, '').trim();
    if (!text) return fallback;
    const chars = Array.from(text);
    if (chars.length < 4) return fallback;
    return chars.slice(0, 10).join('');
}

function sanitizePreview(value, fallback) {
    let text = String(value || '').replace(/\s+/g, '').trim();
    text = text
        .replace(/黑暗料理|扣血|回血|HP|危险|安全|毒|致命|晕倒|好喝|难喝|会死|伤害/g, '')
        .replace(/[。！？!?,，；;：:]/g, '，')
        .replace(/，+/g, '，')
        .replace(/^，|，$/g, '');
    if (!/[\u4e00-\u9fff]/.test(text) || Array.from(text).length < 8) return fallback;
    return truncateAtNextNaturalMark(text, PREVIEW_MAX_CHARS);
}

function sanitizeProcessText(value, fallback) {
    let text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
    text = text
        .replace(/氰化物|砒霜|农药|漂白剂|强酸|强碱|水银|汽油|甲醇|毒鼠强|亚硝酸盐/g, '虚构黑暗物质')
        .replace(/\d+(?:\.\d+)?\s*(?:克|毫升|ml|g|kg|升)/gi, '少量');
    if (!/[\u4e00-\u9fff]/.test(text)) return fallback;
    return truncateAtNextNaturalMark(text, PROCESS_MAX_CHARS);
}

function truncateAtNextNaturalMark(text, maxChars) {
    const chars = Array.from(String(text || ''));
    const limit = Math.max(0, Math.floor(Number(maxChars) || 0));
    if (chars.length <= limit) return chars.join('');

    for (let i = limit; i < chars.length; i += 1) {
        if (NATURAL_TEXT_CUT_MARKS.has(chars[i])) {
            return chars.slice(0, i + 1).join('').trim();
        }
    }

    return chars.slice(0, limit).join('').trim();
}

function sanitizeTags(value, fallback) {
    const source = Array.isArray(value) ? value : fallback;
    const tags = source
        .map(tag => String(tag || '').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, '').trim())
        .filter(Boolean)
        .slice(0, 5);
    while (tags.length < 2) tags.push(tags.length === 0 ? '琴诺特调' : '挑战酒');
    return tags;
}

function isPresetIngredient(value) {
    return Object.values(INGREDIENTS).some(list => list.some(item => item.name === value));
}

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function stripJsonFences(text) {
    return String(text || '')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function findJsonObjectEnd(text, start) {
    let depth = 0;
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
        else if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function textFromValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(textFromValue).join('');
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

function appendCompletionText(current, json) {
    const text = extractCompletionText(json);
    if (!text) return current;
    return text.startsWith(current) ? text : current + text;
}

function clampInt(value, min, max, fallback) {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
}

function randomInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}
