import { getSettings } from './settings.js';
import { getConversationHistory } from './dialogue.js';
import { getDateConversationHistory } from './date_dialogue.js';
import {
    addGift,
    addAffinity,
    canAfford,
    formatGameDateTime,
    formatMoney,
    getGameTimeContext,
    getGameTimeInfo,
    getGifts,
    getMoney,
    recordGiftEstimate,
    spendMoney
} from './game_state.js';

let pendingGift = null;
let isEvaluating = false;

const els = {};

export function initGiftSystem() {
    els.shopPanel = document.getElementById('gift-terminal-panel');
    els.collectionPanel = document.getElementById('gift-collection-panel');
    els.shopClose = document.getElementById('gift-terminal-close');
    els.collectionClose = document.getElementById('gift-collection-close');
    els.balance = document.getElementById('gift-balance');
    els.description = document.getElementById('gift-description');
    els.evaluateBtn = document.getElementById('gift-evaluate-btn');
    els.status = document.getElementById('gift-status');
    els.pending = document.getElementById('gift-pending');
    els.payBtn = document.getElementById('gift-pay-btn');
    els.result = document.getElementById('gift-result');
    els.collectionList = document.getElementById('gift-collection-list');

    els.shopClose?.addEventListener('click', closeGiftTerminal);
    els.collectionClose?.addEventListener('click', closeGiftCollection);
    els.evaluateBtn?.addEventListener('click', handleEvaluateGift);
    els.payBtn?.addEventListener('click', handlePurchaseGift);
}

export function openGiftTerminal() {
    renderBalance();
    setStatus('');
    els.pending?.classList.add('hidden');
    els.result?.classList.add('hidden');
    if (els.payBtn) {
        els.payBtn.disabled = false;
        els.payBtn.dataset.disabledReason = '';
    }
    els.shopPanel?.classList.remove('hidden');
    setTimeout(() => els.description?.focus(), 80);
}

export function closeGiftTerminal() {
    els.shopPanel?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'gift-terminal-panel' } }));
}

export function openGiftCollection() {
    renderGiftCollection();
    els.collectionPanel?.classList.remove('hidden');
}

export function closeGiftCollection() {
    els.collectionPanel?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'gift-collection-panel' } }));
}

export function isGiftOverlayVisible() {
    return (els.shopPanel && !els.shopPanel.classList.contains('hidden'))
        || (els.collectionPanel && !els.collectionPanel.classList.contains('hidden'));
}

export function renderGiftCollection() {
    if (!els.collectionList) return;
    const gifts = getGifts();
    els.collectionList.innerHTML = '';

    if (gifts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'gift-empty';
        empty.textContent = '还没有收藏的礼物。';
        els.collectionList.appendChild(empty);
        return;
    }

    for (const gift of gifts) {
        const item = document.createElement('div');
        item.className = 'gift-record';
        item.innerHTML = `
            <div class="gift-record-head">
                <span>${escapeHtml(gift.gameDateTime || '未知时间')}</span>
                <div class="gift-record-stats">
                    <span class="gift-record-price">🪙 ${formatCompactMoney(gift.amount)}</span>
                    <strong>${renderHearts(gift.score)}</strong>
                </div>
            </div>
            <div class="gift-record-detail">${escapeHtml(gift.detail)}</div>
            <blockquote class="gift-record-comment">${escapeHtml(gift.comment || '芙提雅把这份礼物认真收好了。')}</blockquote>
        `;
        els.collectionList.appendChild(item);
    }
}

function renderBalance() {
    if (els.balance) els.balance.textContent = `余额：${formatMoney(getMoney())}`;
}

function setStatus(text, kind = '') {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.dataset.kind = kind;
}

async function handleEvaluateGift() {
    if (isEvaluating) return;
    const detail = els.description?.value.trim() || '';
    if (!detail) {
        setStatus('请先描述想送给芙提雅的礼物。', 'warn');
        return;
    }

    const settings = getSettings();
    if (!settings.apiKey) {
        setStatus('请先在设置中填写 API Key 后再评估礼物。', 'warn');
        return;
    }

    pendingGift = null;
    els.pending?.classList.add('hidden');
    els.result?.classList.add('hidden');
    if (els.payBtn) {
        els.payBtn.disabled = false;
        els.payBtn.dataset.disabledReason = '';
    }
    setStatus('正在按照您的需求进行礼物定制...', 'loading');
    isEvaluating = true;
    if (els.evaluateBtn) els.evaluateBtn.disabled = true;

    try {
        const evaluation = await requestGiftEvaluation(detail, settings);
        pendingGift = {
            detail,
            amount: evaluation.amount,
            score: evaluation.score,
            comment: evaluation.comment
        };
        recordGiftEstimate(pendingGift.amount);
        if (els.payBtn) {
            const affordable = canAfford(pendingGift.amount);
            els.payBtn.textContent = `支付 ${formatMoney(pendingGift.amount)}`;
            els.payBtn.disabled = !affordable;
            els.payBtn.dataset.disabledReason = affordable ? '' : 'insufficient';
        }
        els.pending?.classList.remove('hidden');
        setStatus(
            canAfford(pendingGift.amount)
                ? '评估完成。付款后会显示芙提雅的评价与心意指数。'
                : `余额不足，当前余额 ${formatMoney(getMoney())}。`,
            canAfford(pendingGift.amount) ? 'ok' : 'warn'
        );
        renderBalance();
    } catch (err) {
        console.error('Gift evaluation error:', err);
        const message = err.message === 'Failed to fetch'
            ? '网络请求失败，请检查 API 配置或服务是否允许当前网页访问。'
            : err.message;
        setStatus(message, 'warn');
    } finally {
        isEvaluating = false;
        if (els.evaluateBtn) els.evaluateBtn.disabled = false;
    }
}

function handlePurchaseGift() {
    if (!pendingGift) return;
    if (!canAfford(pendingGift.amount)) {
        if (els.payBtn) {
            els.payBtn.disabled = true;
            els.payBtn.dataset.disabledReason = 'insufficient';
        }
        setStatus(`余额不足，当前余额 ${formatMoney(getMoney())}。`, 'warn');
        return;
    }

    if (!spendMoney(pendingGift.amount)) {
        setStatus('付款失败，请稍后再试。', 'warn');
        return;
    }

    const timeInfo = getGameTimeInfo({ quantize: 1 });
    const gift = addGift({
        id: `gift_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        gameDateTime: formatGameDateTime({ includeYear: true }),
        gameMinutes: timeInfo.totalMinutes,
        detail: pendingGift.detail,
        amount: pendingGift.amount,
        comment: pendingGift.comment,
        score: pendingGift.score,
        createdAt: Date.now()
    });

    if (!gift) {
        setStatus('礼物记录写入失败。', 'warn');
        return;
    }

    renderBalance();
    setStatus('购买成功，礼物已经归档到收藏柜。', 'ok');
    renderPurchasedResult(gift);
    addAffinity(getGiftAffinityGain(gift.score));
    els.pending?.classList.add('hidden');
    pendingGift = null;
    document.dispatchEvent(new CustomEvent('fritia-game-state-updated'));
}

function getGiftAffinityGain(score) {
    const hearts = Math.round(Number(score) || 0);
    if (hearts >= 5) return 4;
    if (hearts === 4) return 2;
    if (hearts === 3) return 1;
    return 0;
}

async function requestGiftEvaluation(detail, settings) {
    const modes = ['strict', 'conversational'];
    let lastError = null;
    let lastContent = '';

    for (const mode of modes) {
        const requestBody = buildGiftRequestBody(detail, settings, mode);

        try {
            const content = await fetchGiftCompletionStream(settings, requestBody);
            lastContent = content;
            if (!content.trim()) {
                throw new Error('API 返回了空的模型输出。');
            }

            const parsed = parseGiftEvaluation(content, { silent: true });
            if (isLowQualityEvaluation(content, parsed)) {
                throw new Error('模型返回了不可用内容。');
            }

            return parsed;
        } catch (err) {
            lastError = err;
            console.warn(`[Gift] ${mode} evaluation failed:`, err, lastContent);
        }
    }

    console.warn('[Gift] All model evaluation attempts failed:', lastContent);
    throw new Error(lastError?.message || '礼物评估模型输出异常，请检查当前 API 与模型配置。');
}

function buildGiftRequestBody(detail, settings, mode) {
    const requestBody = {
        model: settings.model,
        messages: [
            {
                role: 'system',
                content: buildGiftSystemPrompt(mode)
            },
            { role: 'user', content: buildGiftPrompt(detail, mode) }
        ],
        stream: true,
        temperature: mode === 'strict' ? 0.25 : 0.65
    };

    return requestBody;
}

function buildGiftSystemPrompt(mode) {
    if (mode === 'conversational') {
        return [
            '你是芙提雅（Fritia），正在和玩家对话。',
            '玩家想送你一份礼物。请用中文理解礼物内容，并估算它在现实中大约需要多少人民币。',
            '最后必须输出 AMOUNT、SCORE、COMMENT 三个字段，方便游戏读取。'
        ].join('\n');
    }

    return [
        '你是芙提雅 Online NEXT 的礼物评估器。你必须严格输出三行纯文本。',
        '第一行：AMOUNT=整数金额',
        '第二行：SCORE=1到5的整数',
        '第三行：COMMENT=芙提雅口吻的简短评价',
        '不要输出 JSON，不要输出 Markdown，不要输出解释，不要输出其他行。'
    ].join('\n');
}

async function fetchGiftCompletionStream(settings, body) {
    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`API 错误 (${response.status}): ${bodyText.slice(0, 160)}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        return extractCompletionText(json).trim();
    }

    if (!response.body) {
        throw new Error('API 没有返回可读取的流式响应。请确认该服务支持 stream=true。');
    }

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
            const data = trimmed.startsWith('data:')
                ? trimmed.slice(5).trim()
                : trimmed;
            if (data === '[DONE]' || data === 'event: message') continue;

            try {
                const json = JSON.parse(data);
                const content = extractCompletionText(json);
                if (content) fullText += content;
            } catch {
                if (trimmed.startsWith('data:') && data && !looksLikeJsonPayload(data)) {
                    fullText += data;
                }
            }
        }
    }

    const tail = buffer.trim();
    if (tail && tail !== '[DONE]') {
        try {
            const data = tail.startsWith('data:') ? tail.slice(5).trim() : tail;
            const json = JSON.parse(data);
            const content = extractCompletionText(json);
            if (content) fullText += content;
        } catch {}
    }

    if (!fullText.trim()) {
        const raw = rawText.trim();
        if (looksLikeSseStream(raw)) {
            const extracted = extractTextFromSseStream(raw).trim();
            if (extracted) return extracted;
            throw new Error('API 返回了流式 JSON，但没有可读取的模型正文。请确认模型没有只输出思考内容，或尝试更换非推理模型。');
        }
        try {
            return extractCompletionText(JSON.parse(raw)).trim();
        } catch {
            return raw;
        }
    }

    return fullText.trim();
}

function extractCompletionText(json) {
    const choice = json?.choices?.[0];
    return normalizeCompletionContent(choice?.delta?.content)
        || normalizeCompletionContent(choice?.delta?.text)
        || normalizeCompletionContent(choice?.message?.content)
        || normalizeCompletionContent(choice?.text)
        || normalizeCompletionContent(json?.delta)
        || normalizeCompletionContent(json?.content)
        || normalizeCompletionContent(json?.response)
        || '';
}

function normalizeCompletionContent(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value.map(item => {
            if (typeof item === 'string') return item;
            return item?.text || item?.content || item?.value || '';
        }).join('');
    }
    if (value && typeof value === 'object') {
        return value.text || value.content || value.value || '';
    }
    return '';
}

function looksLikeJsonPayload(text) {
    const value = String(text || '').trim();
    return value.startsWith('{') || value.startsWith('[');
}

function looksLikeSseStream(text) {
    return /^data:\s*\{/m.test(String(text || '')) || /"object"\s*:\s*"chat\.completion\.chunk"/.test(String(text || ''));
}

function extractTextFromSseStream(raw) {
    let text = '';
    const lines = String(raw || '').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]' || !looksLikeJsonPayload(data)) continue;
        try {
            text += extractCompletionText(JSON.parse(data));
        } catch {}
    }
    return text;
}

function buildGiftPrompt(detail, mode) {
    const context = [
        `礼物：${detail}`,
        `当前游戏时间：${getGameTimeContext()}`,
        '',
        '近期日常对话摘要：',
        summarizeDailyHistory(),
        '',
        '近期约会对话摘要：',
        summarizeDateHistory(),
        '',
        '请综合考虑：',
        '1. 礼物与芙提雅人设和性格喜好的契合度',
        '2. 礼物与近期日常/约会话题的关联度',
        '3. 是否有助于增加亲密度',
        '4. 是否适合当前游戏日期时间',
        '礼物价格不能影响 SCORE。'
    ];

    if (mode === 'conversational') {
        return [
            ...context,
            '',
            '请先在心里完成判断，不要写推理过程。最后只输出这三行：',
            'AMOUNT=你估算的整数金额',
            'SCORE=1到5的整数',
            'COMMENT=你作为芙提雅对这份礼物的简短评价'
        ].join('\n');
    }

    return [
        ...context,
        '',
        '严格输出：',
        'AMOUNT=整数金额',
        'SCORE=1到5',
        'COMMENT=芙提雅对这份礼物的简短评价'
    ].join('\n');
}

function summarizeDailyHistory() {
    const history = getConversationHistory().slice(-10);
    if (history.length === 0) return '暂无。';
    return history.map(msg => `${msg.role === 'user' ? '玩家' : '芙提雅'}：${msg.content}`).join('\n');
}

function summarizeDateHistory() {
    const history = getDateConversationHistory();
    const messages = [];
    for (const value of Object.values(history)) {
        if (!Array.isArray(value)) continue;
        value.forEach(msg => {
            if (msg && msg.content) messages.push(msg);
        });
    }
    messages.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const recent = messages.slice(-10);
    if (recent.length === 0) return '暂无。';
    return recent.map(msg => `${msg.role === 'user' ? '玩家' : '芙提雅'}：${msg.content}`).join('\n');
}

function parseGiftEvaluation(content, options = {}) {
    const normalized = normalizeEvaluationText(looksLikeSseStream(content)
        ? extractTextFromSseStream(content)
        : content);
    if (!normalized.trim()) {
        if (!options.silent) console.warn('[Gift] Empty evaluation after stream parsing:', content);
        throw new Error('模型没有返回可解析的礼物估价。请确认当前 API 与模型支持 chat/completions 的流式输出。');
    }
    let parsed = null;
    try {
        parsed = JSON.parse(normalized);
    } catch {
        const match = normalized.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                parsed = JSON.parse(match[0]);
            } catch {}
        }
    }

    if (!parsed) {
        parsed = parseLooseEvaluation(normalized);
    }

    if (!parsed) {
        if (!options.silent) console.warn('[Gift] Unparsed evaluation response:', content);
        throw new Error('模型没有返回可解析的礼物估价。请确认当前 API 与模型支持 chat/completions 的流式输出。');
    }

    const amount = parseMoneyValue(getFirstValue(parsed, [
        'AMOUNT', 'amount', 'Amount', 'price', 'cost', 'value', 'estimated_price', 'price_cny',
        '金额', '价格', '估价', '购买金额', '礼物金额', '礼物价值', '价值估计', '估算金额'
    ]));
    const scoreValue = getFirstValue(parsed, [
        'SCORE', 'score', 'Score', 'rating', 'hearts',
        '评分', '分数', '打分', '综合评分', '综合评价打分', '心意指数', '心数'
    ]);
    const score = Math.max(1, Math.min(5, Math.round(Number(String(scoreValue).match(/[1-5]/)?.[0] || 3))));
    const comment = String(getFirstValue(parsed, [
        'COMMENT', 'comment', 'Comment', 'review', 'evaluation', 'fritia_comment',
        '评价', '评论', '芙提雅评价', '芙提雅评论', '芙提雅的评论', '芙提雅的简短评价'
    ]) || '这份礼物很特别，我会好好珍惜的。').trim().slice(0, 100);

    if (!Number.isFinite(amount) || amount <= 0) {
        if (!options.silent) console.warn('[Gift] Evaluation missing amount:', content);
        throw new Error('模型没有返回可解析的礼物估价。请确认当前 API 与模型支持 chat/completions 的流式输出。');
    }

    return { amount: Math.max(1, Math.min(999999, Math.round(amount))), score, comment };
}

function normalizeEvaluationText(content) {
    return String(content || '')
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/：/g, ':')
        .replace(/，/g, ',')
        .replace(/；/g, ';')
        .trim();
}

function parseLooseEvaluation(text) {
    if (looksLikeSseStream(text)) return null;
    const amount = parseMoneyValue(
        text.match(/(?:amount|price|cost|value|金额|价格|估价|购买金额|售价)[^\d￥¥]*(?:￥|¥)?\s*([\d,，.]+)/i)?.[1]
    );
    const score = Number(text.match(/(?:score|rating|hearts|评分|分数|心意指数|心数)[^\d1-5]*([1-5])/i)?.[1]);
    const comment = text.match(/(?:comment|review|evaluation|评价|评论|芙提雅评价)\s*[=:：]\s*["']?([^"'\n;；]+)/i)?.[1]?.trim();

    if (!Number.isFinite(amount)) {
        return null;
    }

    return {
        amount,
        score: Number.isFinite(score) ? score : 3,
        comment: comment || text.slice(0, 100)
    };
}

function parseMoneyValue(value) {
    if (typeof value === 'number') return value;
    const text = String(value ?? '').replace(/[,，\s]/g, '');
    if (!text) return NaN;
    const wan = text.match(/([\d.]+)万/);
    if (wan) return Number(wan[1]) * 10000;
    const match = text.match(/[\d.]+/);
    return match ? Number(match[0]) : NaN;
}

function getFirstValue(object, keys) {
    if (!object || typeof object !== 'object') return undefined;
    for (const key of keys) {
        if (object[key] !== undefined && object[key] !== null && object[key] !== '') {
            return object[key];
        }
    }
    return undefined;
}

function isLowQualityEvaluation(content, parsed) {
    const text = String(content || '');
    if (!parsed || !Number.isFinite(Number(parsed.amount))) return true;
    if (/^data:\s*\{/i.test(String(parsed.comment || '').trim())) return true;
    if (/"object"\s*:\s*"chat\.completion\.chunk"/.test(text)) return true;
    if (text.includes('\uFFFD')) return true;
    const asciiRatio = text.length > 0
        ? [...text].filter(ch => ch.charCodeAt(0) < 128).length / [...text].length
        : 0;
    const hasMeaningfulCjk = /[\u4e00-\u9fff]/.test(text);
    const hasProtocolWords = /amount|score|comment|金额|评分|评价|AMOUNT|SCORE|COMMENT/i.test(text);
    return asciiRatio > 0.78 && !hasMeaningfulCjk && !hasProtocolWords;
}

function renderPurchasedResult(gift) {
    if (!els.result) return;
    els.result.innerHTML = `
        <img class="gift-result-avatar" src="src/_logos/Profile_Fritia.png" alt="芙提雅">
        <div class="gift-result-content">
            <div class="gift-result-score">${renderHearts(gift.score)}</div>
            <div class="gift-result-comment">${escapeHtml(gift.comment)}</div>
        </div>
    `;
    els.result.classList.remove('hidden');
}

function renderHearts(score) {
    const count = Math.max(1, Math.min(5, Math.round(Number(score) || 1)));
    return `${'♥'.repeat(count)}${'♡'.repeat(5 - count)}`;
}

function formatCompactMoney(amount) {
    return Math.round(Number(amount) || 0).toLocaleString('zh-CN');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}
