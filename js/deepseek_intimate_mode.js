import { shouldUseDeepSeekIntimateMode } from './settings.js';

const PROMPT_URL = './src/_queries/deepseek_special_prompt.txt';

let promptCache = null;

async function loadDeepSeekSpecialPrompt() {
    if (promptCache !== null) return promptCache;
    try {
        const response = await fetch(PROMPT_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        promptCache = (await response.text()).trim();
    } catch (err) {
        console.warn('[DeepSeekIntimateMode] prompt load failed:', err);
        promptCache = '';
    }
    return promptCache;
}

export async function buildDeepSeekIntimateUserMessage(settings) {
    if (!shouldUseDeepSeekIntimateMode(settings)) return null;
    const prompt = await loadDeepSeekSpecialPrompt();
    if (!prompt) return null;
    return {
        role: 'user',
        content: `\u4eb2\u5bc6\u6a21\u5f0f\u8ffd\u52a0\u63d0\u793a\uff1a\n${prompt}`
    };
}

export function isDeepSeekIntimateReply(message, settings, replyRoles = ['assistant', 'bot']) {
    if (!message || !replyRoles.includes(message.role)) return false;
    if (message.deepseekIntimateMode === true) return true;

    const disabledAt = Number(settings?.deepseekIntimateModeDisabledAt) || 0;
    const startedAt = Number(settings?.deepseekIntimateModeStartedAt) || 0;
    const ts = Number(message.ts) || 0;
    if (!disabledAt || !ts) return false;
    if (startedAt > 0) return ts >= startedAt && ts <= disabledAt;
    return ts <= disabledAt;
}

export function shouldKeepMessageForCurrentDeepSeekMode(message, settings, replyRoles = ['assistant', 'bot']) {
    return shouldUseDeepSeekIntimateMode(settings) || !isDeepSeekIntimateReply(message, settings, replyRoles);
}
