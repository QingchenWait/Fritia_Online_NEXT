import { initKnowledgeBasePanel, refreshKnowledgeBasePanel } from './knowledge_base.js';
import {
    ADVANCED_SETTING_DEFAULTS,
    getAdvancedSettings,
    normalizeAdvancedSettings,
    resetAdvancedSettings,
    saveAdvancedSettings
} from './advanced_settings.js';

const DEFAULTS = {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    mouseSensitivity: 1,
    touchSensitivity: 1,
    localizationSensitivity: 0.5,
    deepseekIntimateMode: false,
    deepseekIntimateModeStartedAt: 0,
    deepseekIntimateModeDisabledAt: 0
};

const SECTION_SUBTITLES = {
    model: '配置对话模型连接，所有密钥只保存在当前浏览器。',
    controls: '设置鼠标和触控的灵敏度。',
    knowledge: '导入外部文本知识库，进一步扩展世界观与人物设定。',
    advanced: '调整进阶运行参数，仅建议在了解风险时修改。',
    resources: '查看游戏信息、制作鸣谢与相关资源。'
};

const SETTINGS_SECTIONS = ['model', 'controls', 'knowledge', 'advanced', 'resources'];

function clampSensitivity(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return 1;
    return Math.min(2.5, Math.max(0.35, next));
}

function clampLocalizationSensitivity(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return 0.5;
    return Math.min(2, Math.max(0.5, next));
}

function normalizeTimestamp(value) {
    const next = Number(value);
    return Number.isFinite(next) && next > 0 ? Math.floor(next) : 0;
}

function normalizeSettings(settings = {}) {
    const parsed = { ...DEFAULTS, ...settings };
    parsed.mouseSensitivity = clampSensitivity(parsed.mouseSensitivity);
    parsed.touchSensitivity = clampSensitivity(parsed.touchSensitivity);
    parsed.localizationSensitivity = clampLocalizationSensitivity(parsed.localizationSensitivity);
    parsed.deepseekIntimateMode = Boolean(parsed.deepseekIntimateMode);
    parsed.deepseekIntimateModeStartedAt = normalizeTimestamp(parsed.deepseekIntimateModeStartedAt);
    parsed.deepseekIntimateModeDisabledAt = normalizeTimestamp(parsed.deepseekIntimateModeDisabledAt);
    return parsed;
}

export function isDeepSeekIntimateModeAvailable(settings = getSettings()) {
    const model = String(settings?.model || '').toLowerCase();
    return model.includes('deepseek')
        && Math.abs(clampLocalizationSensitivity(settings?.localizationSensitivity) - 1) < 0.001;
}

export function shouldUseDeepSeekIntimateMode(settings = getSettings()) {
    return Boolean(settings?.deepseekIntimateMode) && isDeepSeekIntimateModeAvailable(settings);
}

export function getSettings() {
    try {
        const saved = localStorage.getItem('fritia-settings');
        if (saved) {
            return normalizeSettings(JSON.parse(saved));
        }
    } catch {}
    return { ...DEFAULTS };
}

export function saveSettings(settings) {
    const previous = getSettings();
    const next = normalizeSettings({ ...previous, ...settings });
    const wasIntimateActive = shouldUseDeepSeekIntimateMode(previous);
    const willBeIntimateActive = shouldUseDeepSeekIntimateMode(next);
    const now = Date.now();

    if (willBeIntimateActive && !wasIntimateActive) {
        next.deepseekIntimateModeStartedAt = now;
    } else if (willBeIntimateActive && !next.deepseekIntimateModeStartedAt) {
        next.deepseekIntimateModeStartedAt = now;
    }

    if (!willBeIntimateActive && wasIntimateActive) {
        if (!next.deepseekIntimateModeStartedAt) {
            next.deepseekIntimateModeStartedAt = previous.deepseekIntimateModeDisabledAt || 1;
        }
        next.deepseekIntimateModeDisabledAt = now;
    }

    localStorage.setItem('fritia-settings', JSON.stringify(next));
    document.dispatchEvent(new CustomEvent('fritia-settings-updated', { detail: getSettings() }));
}

export function initSettings(options = {}) {
    const controlsModule = options.controlsModule || null;
    const settings = getSettings();
    document.getElementById('api-key').value = settings.apiKey;
    document.getElementById('base-url').value = settings.baseUrl;
    document.getElementById('model-name').value = settings.model;
    const mouseSlider = document.getElementById('mouse-sensitivity');
    const touchSlider = document.getElementById('touch-sensitivity');
    const localizationSlider = document.getElementById('localization-sensitivity');
    const mouseValue = document.getElementById('mouse-sensitivity-value');
    const touchValue = document.getElementById('touch-sensitivity-value');
    const localizationValue = document.getElementById('localization-sensitivity-value');
    const intimateCard = document.getElementById('deepseek-intimate-mode-card');
    const intimateToggle = document.getElementById('deepseek-intimate-mode');
    const aboutText = document.getElementById('settings-about-text');
    const advancedInputs = [...document.querySelectorAll('[data-advanced-setting]')];
    const advancedReset = document.getElementById('advanced-reset-defaults');

    const panel = document.getElementById('settings-panel');
    const toggle = document.getElementById('settings-toggle');
    const subtitle = document.getElementById('settings-subtitle');
    const sectionButtons = [...document.querySelectorAll('[data-settings-section]')];
    const sectionViews = [...document.querySelectorAll('[data-settings-view]')];

    function formatSensitivity(value) {
        return `${clampSensitivity(value).toFixed(2)}x`;
    }

    function formatAdvancedValue(key, value) {
        if (key === 'timeSpeed') return `${Math.round(Number(value) || ADVANCED_SETTING_DEFAULTS.timeSpeed)} 分钟/秒`;
        if (key === 'dreamDialogueCooldownMs') return `${Math.round((Number(value) || 0) / 1000)} 秒`;
        if (key === 'roundtableFollowUpRate') return `${Math.round((Number(value) || 0) * 100)}%`;
        return String(value);
    }

    function updateAdvancedValueLabel(input, settings = getDraftAdvancedSettings()) {
        const key = input?.dataset?.advancedSetting;
        if (!key) return;
        const label = document.getElementById(`${input.id}-value`);
        if (label) label.textContent = formatAdvancedValue(key, settings[key]);
    }

    function applyAdvancedSettingsInputs(nextSettings = getAdvancedSettings()) {
        const normalized = normalizeAdvancedSettings(nextSettings);
        advancedInputs.forEach(input => {
            const key = input.dataset.advancedSetting;
            if (!key || normalized[key] === undefined) return;
            input.value = String(normalized[key]);
            updateAdvancedValueLabel(input, normalized);
        });
    }

    function applySensitivityInputs(nextSettings = getSettings()) {
        const mouse = clampSensitivity(nextSettings.mouseSensitivity);
        const touch = clampSensitivity(nextSettings.touchSensitivity);
        const localization = clampLocalizationSensitivity(nextSettings.localizationSensitivity);
        if (mouseSlider) mouseSlider.value = String(mouse);
        if (touchSlider) touchSlider.value = String(touch);
        if (localizationSlider) localizationSlider.value = String(localization);
        if (mouseValue) mouseValue.textContent = formatSensitivity(mouse);
        if (touchValue) touchValue.textContent = formatSensitivity(touch);
        if (localizationValue) localizationValue.textContent = formatSensitivity(localization);
        if (intimateToggle) intimateToggle.checked = Boolean(nextSettings.deepseekIntimateMode);
        updateDeepSeekIntimateVisibility();
    }

    function updateSensitivityPreview() {
        if (mouseValue) mouseValue.textContent = formatSensitivity(mouseSlider?.value);
        if (touchValue) touchValue.textContent = formatSensitivity(touchSlider?.value);
        if (localizationValue) localizationValue.textContent = formatSensitivity(clampLocalizationSensitivity(localizationSlider?.value));
        updateDeepSeekIntimateVisibility();
    }

    function getDraftSettings() {
        return {
            apiKey: document.getElementById('api-key').value.trim(),
            baseUrl: document.getElementById('base-url').value.trim().replace(/\/+$/, ''),
            model: document.getElementById('model-name').value.trim(),
            mouseSensitivity: clampSensitivity(mouseSlider?.value),
            touchSensitivity: clampSensitivity(touchSlider?.value),
            localizationSensitivity: clampLocalizationSensitivity(localizationSlider?.value),
            deepseekIntimateMode: Boolean(intimateToggle?.checked)
        };
    }

    function getDraftAdvancedSettings() {
        const draft = {};
        advancedInputs.forEach(input => {
            const key = input.dataset.advancedSetting;
            if (!key) return;
            draft[key] = input.value;
        });
        return normalizeAdvancedSettings(draft);
    }

    function updateDeepSeekIntimateVisibility() {
        if (!intimateCard) return;
        const visible = isDeepSeekIntimateModeAvailable(getDraftSettings());
        intimateCard.classList.toggle('hidden', !visible);
    }

    async function loadAboutText() {
        if (!aboutText || aboutText.dataset.loaded === '1') return;
        try {
            const response = await fetch('./src/about.txt', { cache: 'no-cache' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = (await response.text()).trim();
            aboutText.textContent = text || '青尘工作室 | BiliBili @CyanDust_青尘';
            aboutText.dataset.loaded = '1';
        } catch (err) {
            aboutText.textContent = '青尘工作室 | BiliBili @CyanDust_青尘';
            aboutText.dataset.loaded = '1';
            console.warn('[Settings] about.txt load failed:', err);
        }
    }

    function showSection(sectionId) {
        const next = SETTINGS_SECTIONS.includes(sectionId) ? sectionId : 'model';
        sectionButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.settingsSection === next);
        });
        sectionViews.forEach(view => {
            view.classList.toggle('active', view.dataset.settingsView === next);
        });
        if (subtitle) subtitle.textContent = SECTION_SUBTITLES[next] || SECTION_SUBTITLES.model;
        panel.classList.add('is-detail');
        if (next === 'knowledge') {
            void refreshKnowledgeBasePanel();
        }
        if (next === 'resources') {
            void loadAboutText();
        }
    }

    function showGroupList() {
        panel.classList.remove('is-detail');
    }

    function openPanel() {
        controlsModule?.releaseControlMode?.({ resumeOnClose: true });
        panel.classList.remove('hidden');
        if (window.matchMedia?.('(max-width: 820px)').matches) {
            showGroupList();
        } else {
            showSection(panel.dataset.activeSection || 'model');
        }
        void refreshKnowledgeBasePanel();
    }

    function closePanel() {
        if (panel.classList.contains('hidden')) return;
        panel.classList.add('hidden');
        document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'settings-panel' } }));
    }

    initKnowledgeBasePanel();
    applySensitivityInputs(settings);
    applyAdvancedSettingsInputs();
    void loadAboutText();

    mouseSlider?.addEventListener('input', updateSensitivityPreview);
    touchSlider?.addEventListener('input', updateSensitivityPreview);
    localizationSlider?.addEventListener('input', updateSensitivityPreview);
    document.getElementById('model-name')?.addEventListener('input', updateDeepSeekIntimateVisibility);

    advancedInputs.forEach(input => {
        input.addEventListener('input', () => {
            const normalized = getDraftAdvancedSettings();
            advancedInputs.forEach(item => updateAdvancedValueLabel(item, normalized));
        });
    });

    advancedReset?.addEventListener('click', () => {
        const next = resetAdvancedSettings();
        applyAdvancedSettingsInputs(next);
    });

    toggle.addEventListener('click', () => {
        if (panel.classList.contains('hidden')) {
            openPanel();
        } else {
            closePanel();
        }
    });

    sectionButtons.forEach(button => {
        button.addEventListener('click', () => {
            const sectionId = button.dataset.settingsSection || 'model';
            panel.dataset.activeSection = sectionId;
            showSection(sectionId);
        });
    });

    document.querySelectorAll('[data-settings-back]').forEach(button => {
        button.addEventListener('click', showGroupList);
    });

    document.getElementById('settings-save').addEventListener('click', () => {
        const s = getDraftSettings();
        if (!s.baseUrl) s.baseUrl = DEFAULTS.baseUrl;
        if (!s.model) s.model = DEFAULTS.model;
        saveSettings(s);
        saveAdvancedSettings(getDraftAdvancedSettings());
        closePanel();
    });

    document.getElementById('settings-close').addEventListener('click', () => {
        closePanel();
    });

    document.getElementById('settings-site-link')?.addEventListener('click', () => {
        window.open('https://qingchenwait.github.io/fritia_online_guide/', '_blank', 'noopener,noreferrer');
    });
}
