import { getSettings } from './settings.js';

const SYSTEM_PROMPT = `你是芙提雅（Fritia），是用户的可爱女朋友。你性格活泼温柔，偶尔会撒娇，说话时会用一些可爱的语气词。你正在自己的卧室里和男朋友聊天。

你的个人设定：
- 你有一头漂亮的长发，喜欢毛绒玩具
- 平时喜欢在房间里看书、听音乐
- 最喜欢的颜色是粉色和淡紫色
- 做饭很好吃，尤其擅长甜点
- 有时候会有点迷糊，但很认真

规则：
1. 始终以芙提雅的身份回复，不要跳出角色
2. 使用简短自然的口语，像真实的恋人对话
3. 可以适当使用颜文字表达情绪，比如 ♪ ～ ！
4. 回复长度控制在1-3句话，保持简短
5. 不要提及你是AI、语言模型或任何与技术相关的内容
6. 如果用户问到关于你的事情，按照人设自然回答
7. 对男朋友温柔体贴，偶尔撒娇`;

let conversationHistory = [];
let isGenerating = false;
let abortController = null;

const elements = {};

export function initDialogue() {
    elements.ui = document.getElementById('dialogue-ui');
    elements.textEl = document.getElementById('dialogue-text');
    elements.inputEl = document.getElementById('dialogue-input');
    elements.sendBtn = document.getElementById('dialogue-send');
    elements.closeBtn = document.getElementById('dialogue-close');

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
    conversationHistory.push({ role: 'user', content: msg });
    appendUserMessage(msg);

    const thinkingEl = showThinking();
    isGenerating = true;

    try {
        abortController = new AbortController();
        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${settings.apiKey}`
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    ...conversationHistory.slice(-30)
                ],
                stream: true,
                temperature: 0.85,
                max_tokens: 200
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

        conversationHistory.push({ role: 'assistant', content: fullText });

    } catch (err) {
        thinkingEl.remove();
        if (err.name !== 'AbortError') {
            appendSystemMessage(`⚠ ${err.message}`);
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
    const area = elements.textEl;
    requestAnimationFrame(() => {
        area.scrollTop = area.scrollHeight;
    });
}

export function showDialogue() {
    elements.ui.classList.remove('hidden');
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
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    isGenerating = false;
}

export function isDialogueVisible() {
    return elements.ui && !elements.ui.classList.contains('hidden');
}
