import { getSettings } from './settings.js';

const DATE_HISTORY_KEY = 'fritia_date_history';
const DATE_LOCATIONS = [
    { id: 'cinema', name: '电影院', emoji: '🎬', desc: '一起看一场浪漫的电影' },
    { id: 'amusement', name: '游乐场', emoji: '🎡', desc: '坐摩天轮、过山车' },
    { id: 'mall', name: '商场', emoji: '🛍️', desc: '逛街购物、吃甜品' },
    { id: 'park', name: '公园', emoji: '🌸', desc: '散步、野餐、看夕阳' },
    { id: 'aquarium', name: '水族馆', emoji: '🐠', desc: '看海豚表演、水母隧道' },
    { id: 'beach', name: '海边', emoji: '🏖️', desc: '踏浪、堆沙堡、看日落' },
    { id: 'museum', name: '科技馆', emoji: '🔬', desc: '芙提雅最喜欢的约会地点' },
    { id: 'karaoke', name: 'KTV', emoji: '🎤', desc: '一起唱歌、吃零食' },
    { id: 'zoo', name: '动物园', emoji: '🐼', desc: '看可爱的动物们' },
    { id: 'cafe', name: '猫咖', emoji: '🐱', desc: '撸猫、喝下午茶' },
    { id: 'bookstore', name: '书店', emoji: '📚', desc: '安静地一起看书' },
    { id: 'nightmarket', name: '夜市', emoji: '🏮', desc: '吃小吃、玩游戏' }
];

let datePromptTemplate = '';
let dateConversationHistory = {};
let currentLocationId = null;
let isDateGenerating = false;
let dateAbortController = null;

const els = {};

async function loadDatePrompt() {
    try {
        const resp = await fetch('src/_queries/date_prompt.txt');
        if (resp.ok) datePromptTemplate = await resp.text();
    } catch {}
}

function loadDateHistory() {
    try {
        const raw = localStorage.getItem(DATE_HISTORY_KEY);
        if (raw) {
            const data = JSON.parse(raw);
            if (typeof data === 'object' && !Array.isArray(data)) return data;
        }
    } catch {}
    return {};
}

function saveDateHistory() {
    try {
        localStorage.setItem(DATE_HISTORY_KEY, JSON.stringify(dateConversationHistory));
    } catch {}
}

export function getDateConversationHistory() {
    const result = {};
    for (const [key, value] of Object.entries(dateConversationHistory)) {
        if (key.endsWith('_archive')) {
            continue;
        }
        result[key] = value;
        const archiveKey = `${key}_archive`;
        if (dateConversationHistory[archiveKey]) {
            for (const archive of dateConversationHistory[archiveKey]) {
                if (archive.messages && archive.messages.length > 0) {
                    result[key] = result[key].concat(archive.messages);
                }
            }
        }
    }
    return result;
}

export function importDateConversationHistory(data) {
    if (data && typeof data === 'object') {
        dateConversationHistory = data;
        saveDateHistory();
    }
}

export function getDateLocations() {
    return DATE_LOCATIONS;
}

export async function initDateDialogue() {
    els.panel = document.getElementById('date-panel');
    els.locations = document.getElementById('date-locations');
    els.chat = document.getElementById('date-chat');
    els.chatArea = document.getElementById('date-chat-area');
    els.input = document.getElementById('date-input');
    els.sendBtn = document.getElementById('date-send-btn');
    els.backBtn = document.getElementById('date-back-btn');
    els.chatTitle = document.getElementById('date-chat-title');
    els.closeBtn = document.getElementById('date-close');
    els.newTopicBtn = document.getElementById('date-new-topic-btn');

    await loadDatePrompt();
    dateConversationHistory = loadDateHistory();

    renderLocations();

    els.closeBtn.addEventListener('click', closeDatePanel);
    els.backBtn.addEventListener('click', showLocations);
    els.sendBtn.addEventListener('click', handleDateSend);
    els.newTopicBtn.addEventListener('click', handleNewTopic);
    els.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleDateSend();
        }
    });
}

function renderLocations() {
    els.locations.innerHTML = '';
    DATE_LOCATIONS.forEach(loc => {
        const card = document.createElement('div');
        card.className = 'date-location-card';
        card.innerHTML = `
            <div class="date-location-emoji">${loc.emoji}</div>
            <div class="date-location-name">${loc.name}</div>
            <div class="date-location-desc">${loc.desc}</div>
        `;
        card.addEventListener('click', () => selectLocation(loc));
        els.locations.appendChild(card);
    });
}

function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
}

function getMessageDateKey(ts) {
    const d = new Date(ts || 0);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function selectLocation(loc) {
    currentLocationId = loc.id;
    els.locations.classList.add('hidden');
    els.chat.classList.remove('hidden');
    els.chatTitle.textContent = `${loc.emoji} ${loc.name}`;

    const todayKey = getTodayKey();
    const history = dateConversationHistory[loc.id];

    if (history && history.length > 0) {
        const lastMsg = history[history.length - 1];
        const lastDateKey = getMessageDateKey(lastMsg.ts);

        if (lastDateKey !== todayKey) {
            const archiveKey = `${loc.id}_archive`;
            if (!dateConversationHistory[archiveKey]) {
                dateConversationHistory[archiveKey] = [];
            }
            dateConversationHistory[archiveKey].push({
                dateKey: lastDateKey,
                messages: [...history]
            });
            dateConversationHistory[loc.id] = [];
            saveDateHistory();
        }
    }

    renderDateMessages();

    if (!dateConversationHistory[loc.id] || dateConversationHistory[loc.id].length === 0) {
        startDateConversation(loc);
    }

    setTimeout(() => els.input.focus(), 100);
}

function showLocations() {
    currentLocationId = null;
    els.chat.classList.add('hidden');
    els.locations.classList.remove('hidden');
}

function renderDateMessages() {
    els.chatArea.innerHTML = '';
    const history = dateConversationHistory[currentLocationId] || [];
    history.forEach(msg => {
        if (msg.role === 'user') {
            appendDateUserMessage(msg.content, false);
        } else {
            appendDateAssistantMessage(msg.content, false);
        }
    });
    scrollDateChat();
}

function appendDateUserMessage(text, doScroll = true) {
    const row = document.createElement('div');
    row.className = 'chat-row user-row';
    row.innerHTML = `<div class="chat-bubble user-bubble"><div class="chat-name user-name">你</div><div class="msg-text">${escapeHtml(text)}</div></div>`;
    els.chatArea.appendChild(row);
    if (doScroll) scrollDateChat();
}

function appendDateAssistantMessage(text, doScroll = true) {
    const row = document.createElement('div');
    row.className = 'chat-row assistant-row';
    row.innerHTML = `<div class="chat-bubble assistant-bubble"><div class="chat-name assistant-name">芙提雅</div><div class="msg-text">${escapeHtml(text)}</div></div>`;
    els.chatArea.appendChild(row);
    if (doScroll) scrollDateChat();
}

function appendDateThinking() {
    const row = document.createElement('div');
    row.className = 'chat-row assistant-row thinking-row';
    row.innerHTML = `<div class="chat-bubble assistant-bubble thinking"><div class="chat-name assistant-name">芙提雅</div><div class="msg-text">思考中...</div></div>`;
    els.chatArea.appendChild(row);
    scrollDateChat();
    return row;
}

function scrollDateChat() {
    requestAnimationFrame(() => {
        els.chatArea.scrollTop = els.chatArea.scrollHeight;
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleNewTopic() {
    if (isDateGenerating || !currentLocationId) return;
    if (!dateConversationHistory[currentLocationId] || dateConversationHistory[currentLocationId].length === 0) return;

    const history = dateConversationHistory[currentLocationId];
    if (history.length > 0 && history[history.length - 1].role === 'assistant') {
        history.pop();
        saveDateHistory();
    }

    els.chatArea.innerHTML = '';
    const loc = DATE_LOCATIONS.find(l => l.id === currentLocationId);
    if (loc) {
        startDateConversation(loc);
    }
}

async function startDateConversation(loc) {
    if (!dateConversationHistory[loc.id]) {
        dateConversationHistory[loc.id] = [];
    }

    const settings = getSettings();
    if (!settings.apiKey) return;

    isDateGenerating = true;
    const thinkingEl = appendDateThinking();

    try {
        dateAbortController = new AbortController();
        const systemPrompt = datePromptTemplate.replace('{location}', loc.name);
        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: 'system', content: systemPrompt }],
                stream: true,
                temperature: 0.9,
                max_tokens: 300
            }),
            signal: dateAbortController.signal
        });

        if (!response.ok) throw new Error(`API 错误 (${response.status})`);

        thinkingEl.remove();
        const bubbleEl = createDateAssistantBubble();
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
                        scrollDateChat();
                    }
                } catch {}
            }
        }

        dateConversationHistory[loc.id].push({ role: 'assistant', content: fullText, ts: Date.now() });
        saveDateHistory();
    } catch (err) {
        thinkingEl.remove();
        if (err.name !== 'AbortError') {
            console.error('Date LLM error:', err);
        }
    } finally {
        isDateGenerating = false;
        dateAbortController = null;
    }
}

async function handleDateSend() {
    if (isDateGenerating || !currentLocationId) return;
    const msg = els.input.value.trim();
    if (!msg) return;

    const settings = getSettings();
    if (!settings.apiKey) return;

    els.input.value = '';
    if (!dateConversationHistory[currentLocationId]) {
        dateConversationHistory[currentLocationId] = [];
    }
    dateConversationHistory[currentLocationId].push({ role: 'user', content: msg, ts: Date.now() });
    saveDateHistory();
    appendDateUserMessage(msg);

    isDateGenerating = true;
    const thinkingEl = appendDateThinking();

    try {
        dateAbortController = new AbortController();
        const loc = DATE_LOCATIONS.find(l => l.id === currentLocationId);
        const systemPrompt = datePromptTemplate.replace('{location}', loc ? loc.name : '约会');

        const history = dateConversationHistory[currentLocationId];
        const contextMsgs = history.slice(-20).map(m => ({ role: m.role, content: m.content }));

        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...contextMsgs
                ],
                stream: true,
                temperature: 0.9,
                max_tokens: 300
            }),
            signal: dateAbortController.signal
        });

        if (!response.ok) throw new Error(`API 错误 (${response.status})`);

        thinkingEl.remove();
        const bubbleEl = createDateAssistantBubble();
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
                        scrollDateChat();
                    }
                } catch {}
            }
        }

        dateConversationHistory[currentLocationId].push({ role: 'assistant', content: fullText, ts: Date.now() });
        saveDateHistory();
    } catch (err) {
        thinkingEl.remove();
        if (err.name !== 'AbortError') {
            console.error('Date LLM error:', err);
        }
    } finally {
        isDateGenerating = false;
        dateAbortController = null;
    }
}

function createDateAssistantBubble() {
    const row = document.createElement('div');
    row.className = 'chat-row assistant-row';
    row.innerHTML = `<div class="chat-bubble assistant-bubble"><div class="chat-name assistant-name">芙提雅</div><div class="msg-text"></div></div>`;
    els.chatArea.appendChild(row);
    scrollDateChat();
    return row;
}

export function openDatePanel() {
    els.panel.classList.remove('hidden');
    showLocations();
}

export function closeDatePanel() {
    els.panel.classList.add('hidden');
    if (dateAbortController) {
        dateAbortController.abort();
        dateAbortController = null;
    }
    isDateGenerating = false;
    currentLocationId = null;
}

export function isDatePanelVisible() {
    return els.panel && !els.panel.classList.contains('hidden');
}
