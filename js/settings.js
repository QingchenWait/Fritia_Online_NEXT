import { initKnowledgeBasePanel, refreshKnowledgeBasePanel } from './knowledge_base.js';

const DEFAULTS = {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
};

export function getSettings() {
    try {
        const saved = localStorage.getItem('fritia-settings');
        if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
    } catch {}
    return { ...DEFAULTS };
}

export function saveSettings(settings) {
    localStorage.setItem('fritia-settings', JSON.stringify(settings));
}

export function initSettings(options = {}) {
    const controlsModule = options.controlsModule || null;
    const settings = getSettings();
    document.getElementById('api-key').value = settings.apiKey;
    document.getElementById('base-url').value = settings.baseUrl;
    document.getElementById('model-name').value = settings.model;

    const panel = document.getElementById('settings-panel');
    const toggle = document.getElementById('settings-toggle');
    const sectionButtons = [...document.querySelectorAll('[data-settings-section]')];
    const sectionViews = [...document.querySelectorAll('[data-settings-view]')];

    function showSection(sectionId) {
        const next = sectionId === 'knowledge' ? 'knowledge' : 'model';
        sectionButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.settingsSection === next);
        });
        sectionViews.forEach(view => {
            view.classList.toggle('active', view.dataset.settingsView === next);
        });
        panel.classList.add('is-detail');
        if (next === 'knowledge') {
            void refreshKnowledgeBasePanel();
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
        const s = {
            apiKey: document.getElementById('api-key').value.trim(),
            baseUrl: document.getElementById('base-url').value.trim().replace(/\/+$/, ''),
            model: document.getElementById('model-name').value.trim()
        };
        if (!s.baseUrl) s.baseUrl = DEFAULTS.baseUrl;
        if (!s.model) s.model = DEFAULTS.model;
        saveSettings(s);
        closePanel();
    });

    document.getElementById('settings-close').addEventListener('click', () => {
        closePanel();
    });
}
