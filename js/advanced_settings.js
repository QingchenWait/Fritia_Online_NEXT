const STORAGE_KEY = 'fritia_advanced_settings';

export const ADVANCED_SETTING_DEFAULTS = Object.freeze({
    timeSpeed: 5,
    dreamMaxComponents: 24,
    dreamDialogueCooldownMs: 20000,
    roundtableMaxParticipants: 6,
    roundtableTokenHardLimit: 400000,
    roundtableTotalCallLimit: 20,
    roundtableFollowUpRate: 0.55,
    roundtableMaxStoredMessages: 500,
    kbChunkSize: 512,
    kbChunkOverlap: 50,
    kbCandidateLimit: 50
});

export const ADVANCED_SETTING_LIMITS = Object.freeze({
    timeSpeed: { min: 1, max: 60, step: 1 },
    dreamMaxComponents: { min: 4, max: 80, step: 1 },
    dreamDialogueCooldownMs: { min: 0, max: 600000, step: 1000 },
    roundtableMaxParticipants: { min: 1, max: 12, step: 1 },
    roundtableTokenHardLimit: { min: 10000, max: 2000000, step: 10000 },
    roundtableTotalCallLimit: { min: 1, max: 100, step: 1 },
    roundtableFollowUpRate: { min: 0, max: 1, step: 0.05 },
    roundtableMaxStoredMessages: { min: 50, max: 3000, step: 50 },
    kbChunkSize: { min: 200, max: 2000, step: 1 },
    kbChunkOverlap: { min: 0, max: 500, step: 1 },
    kbCandidateLimit: { min: 1, max: 200, step: 1 }
});

function clampNumber(value, key) {
    const limit = ADVANCED_SETTING_LIMITS[key];
    const fallback = ADVANCED_SETTING_DEFAULTS[key];
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(limit.max, Math.max(limit.min, num));
}

function clampInteger(value, key) {
    return Math.round(clampNumber(value, key));
}

export function normalizeAdvancedSettings(settings = {}) {
    const next = { ...ADVANCED_SETTING_DEFAULTS, ...(settings || {}) };
    next.timeSpeed = clampInteger(next.timeSpeed, 'timeSpeed');
    next.dreamMaxComponents = clampInteger(next.dreamMaxComponents, 'dreamMaxComponents');
    next.dreamDialogueCooldownMs = clampInteger(next.dreamDialogueCooldownMs, 'dreamDialogueCooldownMs');
    next.roundtableMaxParticipants = clampInteger(next.roundtableMaxParticipants, 'roundtableMaxParticipants');
    next.roundtableTokenHardLimit = clampInteger(next.roundtableTokenHardLimit, 'roundtableTokenHardLimit');
    next.roundtableTotalCallLimit = clampInteger(next.roundtableTotalCallLimit, 'roundtableTotalCallLimit');
    next.roundtableFollowUpRate = Number(clampNumber(next.roundtableFollowUpRate, 'roundtableFollowUpRate').toFixed(2));
    next.roundtableMaxStoredMessages = clampInteger(next.roundtableMaxStoredMessages, 'roundtableMaxStoredMessages');
    next.kbChunkSize = clampInteger(next.kbChunkSize, 'kbChunkSize');
    next.kbChunkOverlap = Math.min(next.kbChunkSize - 1, clampInteger(next.kbChunkOverlap, 'kbChunkOverlap'));
    next.kbCandidateLimit = clampInteger(next.kbCandidateLimit, 'kbCandidateLimit');
    return next;
}

export function getAdvancedSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return normalizeAdvancedSettings(JSON.parse(saved));
    } catch {}
    return normalizeAdvancedSettings();
}

export function saveAdvancedSettings(settings = {}) {
    const next = normalizeAdvancedSettings(settings);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
    document.dispatchEvent(new CustomEvent('fritia-advanced-settings-updated', { detail: next }));
    return next;
}

export function resetAdvancedSettings() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {}
    const next = normalizeAdvancedSettings();
    document.dispatchEvent(new CustomEvent('fritia-advanced-settings-updated', { detail: next }));
    return next;
}

export function getGameTimeSpeedSettings() {
    const settings = getAdvancedSettings();
    return {
        gameMinutesPerRealSecond: settings.timeSpeed,
        displayStepMinutes: settings.timeSpeed
    };
}

export function getDreamMaxComponents() {
    return getAdvancedSettings().dreamMaxComponents;
}

export function getDreamDialogueCooldownMs() {
    return getAdvancedSettings().dreamDialogueCooldownMs;
}

export function getRoundtableAdvancedSettings() {
    const settings = getAdvancedSettings();
    return {
        maxParticipants: settings.roundtableMaxParticipants,
        tokenHardLimit: settings.roundtableTokenHardLimit,
        totalCallLimit: settings.roundtableTotalCallLimit,
        followUpRate: settings.roundtableFollowUpRate,
        maxStoredMessages: settings.roundtableMaxStoredMessages
    };
}

export function getKnowledgeBaseAdvancedSettings() {
    const settings = getAdvancedSettings();
    return {
        chunkSize: settings.kbChunkSize,
        chunkOverlap: settings.kbChunkOverlap,
        candidateLimit: settings.kbCandidateLimit
    };
}
