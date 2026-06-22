import { getSettings } from './settings.js';
import { addAffinity, getGameTimeContext, recordDialogueInteraction } from './game_state.js';
import { getDreamFurnitureDialogueContext } from './dream_system.js';
import { buildRagReferenceMessage } from './knowledge_base.js';
import {
    buildDeepSeekIntimateUserMessage,
    shouldKeepMessageForCurrentDeepSeekMode
} from './deepseek_intimate_mode.js';

const HISTORY_KEY = 'fritia_chat_history';

let conversationHistory = [];
let isGenerating = false;
let abortController = null;
let systemPrompt = '';
let dialogueContext = {
    scene: 'daily',
    characterId: 'fritia',
    characterName: '芙提雅',
    prompt: ''
};

const elements = {};

async function loadSystemPrompt() {
    try {
        const response = await fetch('src/_queries/system_prompt.txt');
        if (response.ok) {
            systemPrompt = await response.text();
        } else {
            console.warn('Failed to load system prompt, using fallback');
            systemPrompt = '你是芙提雅（Fritia），是用户的可爱女朋友。你性格活泼温柔，偶尔会撒娇。';
        }
    } catch (err) {
        console.warn('Error loading system prompt:', err);
        systemPrompt = '你是芙提雅（Fritia），是用户的可爱女朋友。你性格活泼温柔，偶尔会撒娇。';
    }
}

function estimateTokens(text) {
    let tokens = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code > 0x4E00 && code < 0x9FFF) {
            tokens += 2;
        } else if (code > 0xFF00 && code < 0xFFEF) {
            tokens += 2;
        } else {
            tokens += 1;
        }
    }
    return tokens;
}

function getContextMessages(settings = getSettings()) {
    const systemTokens = estimateTokens(systemPrompt);
    const maxTokens = 8000;
    const availableTokens = maxTokens - systemTokens - 200;
    
    const messages = [];
    let totalTokens = 0;
    
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if ((msg.scene || 'daily') !== dialogueContext.scene) continue;
        if (!shouldKeepMessageForCurrentDeepSeekMode(msg, settings, ['assistant'])) continue;
        const msgTokens = estimateTokens(msg.content) + 10;
        
        if (totalTokens + msgTokens > availableTokens) break;
        
        messages.unshift({ role: msg.role, content: msg.content });
        totalTokens += msgTokens;
    }
    
    return messages;
}

function buildSystemPrompt() {
    const furnitureContext = getDreamFurnitureDialogueContext();
    const basePrompt = dialogueContext.prompt || systemPrompt;
    const sceneContext = dialogueContext.scene === 'bar'
        ? '\n\n当前地点是“暖调闲聚”酒吧地图。本轮对话属于暖调闲聚场景。'
        : '';
    return `${basePrompt}\n\n${getGameTimeContext()}${sceneContext}${furnitureContext ? `\n\n${furnitureContext}` : ''}`;
}

function loadHistory() {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data)) return data;
        }
    } catch {}
    return [];
}

function saveHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory));
    } catch {}
}

function getTimestamp() {
    return Date.now();
}

export function getConversationHistory() {
    return conversationHistory;
}

export function importConversationHistory(data) {
    if (Array.isArray(data)) {
        conversationHistory = data;
        saveHistory();
    }
}

export function setDialogueSceneContext(context = {}) {
    dialogueContext = {
        scene: context.scene === 'bar' ? 'bar' : 'daily',
        characterId: context.characterId || 'fritia',
        characterName: context.characterName || '芙提雅',
        prompt: context.prompt || ''
    };
}

export async function initDialogue() {
    elements.ui = document.getElementById('dialogue-ui');
    elements.textArea = document.getElementById('dialogue-text-area');
    elements.textEl = document.getElementById('dialogue-text');
    elements.inputEl = document.getElementById('dialogue-input');
    elements.sendBtn = document.getElementById('dialogue-send');
    elements.closeBtn = document.getElementById('dialogue-close');

    await loadSystemPrompt();
    conversationHistory = loadHistory();

    elements.sendBtn.addEventListener('click', handleSend);
    elements.inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    elements.closeBtn.addEventListener('click', hideDialogue);
}

async function handleSend() {
    if (isGenerating) return;
    const msg = elements.inputEl.value.trim();
    if (!msg) return;

    const settings = getSettings();
    if (!settings.apiKey) {
        appendSystemMessage('请先在设置中填写 API Key');
        return;
    }

    elements.inputEl.value = '';
    const userMsg = {
        role: 'user',
        content: msg,
        ts: getTimestamp(),
        scene: dialogueContext.scene,
        characterId: dialogueContext.characterId,
        characterName: dialogueContext.characterName
    };
    conversationHistory.push(userMsg);
    saveHistory();
    appendUserMessage(msg);

    const thinkingEl = showThinking();
    isGenerating = true;

    try {
        abortController = new AbortController();
        const contextMessages = getContextMessages(settings);
        const ragMessage = dialogueContext.scene === 'daily'
            ? await buildRagReferenceMessage({
                mode: 'daily',
                query: msg,
                recentMessages: contextMessages
            })
            : null;
        const intimateMessage = dialogueContext.scene === 'daily'
            ? await buildDeepSeekIntimateUserMessage(settings)
            : null;
        const messages = [
            { role: 'system', content: buildSystemPrompt() },
            ...(ragMessage ? [ragMessage] : []),
            ...(intimateMessage ? [intimateMessage] : []),
            ...contextMessages
        ];

        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages,
                stream: true,
                temperature: 0.85,
                max_tokens: 350
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`API 错误 (${response.status}): ${errBody.slice(0, 100)}`);
        }

        thinkingEl.remove();
        const bubbleEl = createAssistantBubble();
        let fullText = '';

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;

                try {
                    const json = JSON.parse(data);
                    const content = json.choices?.[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        bubbleEl.querySelector('.msg-text').textContent = fullText;
                        scrollDialogue();
                    }
                } catch {}
            }
        }

        const assistantMsg = {
            role: 'assistant',
            content: fullText,
            ts: getTimestamp(),
            scene: dialogueContext.scene,
            characterId: dialogueContext.characterId,
            characterName: dialogueContext.characterName,
            deepseekIntimateMode: Boolean(intimateMessage)
        };
        conversationHistory.push(assistantMsg);
        saveHistory();
        if (fullText.trim()) {
            addAffinity(1);
            recordDialogueInteraction(dialogueContext.scene === 'bar' ? 'bar' : 'daily', fullText);
        }

    } catch (err) {
        thinkingEl.remove();
        if (err.name !== 'AbortError') {
            let errMsg = err.message;
            if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
                errMsg = '网络请求失败，请检查：1) API Key 是否已配置  2) Base URL 是否正确  3) API 服务是否支持当前域名的访问（部分 API 在 GitHub Pages 上可能被 CORS 拦截，建议使用支持 CORS 的 API 服务或自建代理）';
            }
            appendSystemMessage(`⚠ ${errMsg}`);
            console.error('LLM error:', err);
        }
    } finally {
        isGenerating = false;
        abortController = null;
    }
}

function appendUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'chat-row user-row';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user-bubble';

    const nameEl = document.createElement('div');
    nameEl.className = 'chat-name user-name';
    nameEl.textContent = '你';

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = text;

    bubble.appendChild(nameEl);
    bubble.appendChild(textEl);
    row.appendChild(bubble);
    elements.textEl.appendChild(row);
    scrollDialogue();
}

function createAssistantBubble() {
    const existing = elements.textEl.querySelector('.thinking-row');
    if (existing) existing.remove();

    const row = document.createElement('div');
    row.className = 'chat-row assistant-row';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant-bubble';

    const nameEl = document.createElement('div');
    nameEl.className = 'chat-name assistant-name';
    nameEl.textContent = '芙提雅';

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';

    bubble.appendChild(nameEl);
    bubble.appendChild(textEl);
    row.appendChild(bubble);
    elements.textEl.appendChild(row);
    scrollDialogue();
    return row;
}

function showThinking() {
    const row = document.createElement('div');
    row.className = 'chat-row assistant-row thinking-row';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant-bubble thinking';

    const nameEl = document.createElement('div');
    nameEl.className = 'chat-name assistant-name';
    nameEl.textContent = '芙提雅';

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = '思考中...';

    bubble.appendChild(nameEl);
    bubble.appendChild(textEl);
    row.appendChild(bubble);
    elements.textEl.appendChild(row);
    scrollDialogue();
    return row;
}

function appendSystemMessage(text) {
    const row = document.createElement('div');
    row.className = 'chat-row system-row';
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    row.appendChild(div);
    elements.textEl.appendChild(row);
    scrollDialogue();
}

function scrollDialogue() {
    const scrollToBottom = () => {
        if (elements.textArea) {
            elements.textArea.scrollTop = elements.textArea.scrollHeight;
        }
    };
    requestAnimationFrame(() => {
        scrollToBottom();
        requestAnimationFrame(scrollToBottom);
    });
}

export function showDialogue() {
    elements.ui.classList.remove('hidden');
    elements.ui.classList.toggle('bar-fritia-dialogue', dialogueContext.scene === 'bar');
    const namePlate = document.getElementById('dialogue-name');
    if (namePlate) namePlate.textContent = dialogueContext.characterName || '芙提雅';
    elements.textEl.innerHTML = '';

    const greetings = [
        '嘿嘿，你来啦～ 今天想聊什么呢？♪',
        '啊，你来了！我正好在等你呢～',
        '嘿嘿～终于来找我啦！有什么想说的吗？',
        '你来啦！今天也想和你在一起呢～ ♪'
    ];
    const row = document.createElement('div');
    row.className = 'chat-row assistant-row';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant-bubble';
    const nameEl = document.createElement('div');
    nameEl.className = 'chat-name assistant-name';
    nameEl.textContent = '芙提雅';
    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = greetings[Math.floor(Math.random() * greetings.length)];
    bubble.appendChild(nameEl);
    bubble.appendChild(textEl);
    row.appendChild(bubble);
    elements.textEl.appendChild(row);

    setTimeout(() => elements.inputEl.focus(), 100);
}

export function hideDialogue() {
    elements.ui.classList.add('hidden');
    elements.ui.classList.remove('bar-fritia-dialogue');
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    isGenerating = false;
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'dialogue-ui' } }));
}

export function isDialogueVisible() {
    return elements.ui && !elements.ui.classList.contains('hidden');
}
