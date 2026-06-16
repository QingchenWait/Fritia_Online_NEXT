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

export function initSettings() {
    const settings = getSettings();
    document.getElementById('api-key').value = settings.apiKey;
    document.getElementById('base-url').value = settings.baseUrl;
    document.getElementById('model-name').value = settings.model;

    const panel = document.getElementById('settings-panel');
    const toggle = document.getElementById('settings-toggle');

    toggle.addEventListener('click', () => {
        panel.classList.toggle('hidden');
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
        panel.classList.add('hidden');
    });

    document.getElementById('settings-close').addEventListener('click', () => {
        panel.classList.add('hidden');
    });
}
