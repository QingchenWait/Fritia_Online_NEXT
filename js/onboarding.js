const ONBOARDING_DISMISSED_KEY = 'fritia_onboarding_welcome_dismissed';
const DEEPSEEK_API_KEYS_URL = 'https://platform.deepseek.com/api_keys';
const DEEPSEEK_TOP_UP_URL = 'https://platform.deepseek.com/top_up';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEEPSEEK_CHECK_TIMEOUT_MS = 30000;

function readStoredSettings() {
    try {
        const saved = localStorage.getItem('fritia-settings');
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
}

function isDeepSeekConnection(settings = {}) {
    const apiKey = String(settings.apiKey || '').trim();
    const model = String(settings.model || '').trim().toLowerCase();
    let hostname = '';
    try {
        hostname = new URL(String(settings.baseUrl || '').trim()).hostname.toLowerCase();
    } catch {}
    return Boolean(apiKey)
        && hostname === 'api.deepseek.com'
        && model === DEEPSEEK_MODEL;
}

function normalizeKey(value) {
    return String(value || '').trim();
}

function summarizeKey(apiKey, saved = false) {
    const suffix = normalizeKey(apiKey).slice(-4);
    if (!suffix) return '';
    return `${saved ? '配置已保存' : '已读取密钥'} ····${suffix}`;
}

function setPanelVisible(panel, visible) {
    if (!panel) return;
    panel.classList.toggle('hidden', !visible);
    panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function dispatchOverlayClosed(id) {
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id } }));
}

function openOfficialPage(url) {
    const opened = window.open(url, '_blank');
    if (opened) {
        try {
            opened.opener = null;
        } catch {}
        return true;
    }
    // Electron denies the renderer popup after forwarding it to the system browser.
    return window.location.protocol === 'fritia:';
}

/**
 * Initializes the first-run welcome panel and the DeepSeek-only setup wizard.
 * The caller owns gameplay startup and settings persistence so this module can
 * remain independent from the main game and settings modules.
 */
export function initOnboarding(options = {}) {
    const controlsModule = options.controlsModule || null;
    const startGameplay = typeof options.startGameplay === 'function'
        ? options.startGameplay
        : () => {};
    const saveModelConnection = typeof options.saveModelConnection === 'function'
        ? options.saveModelConnection
        : null;
    const getSettings = typeof options.getSettings === 'function'
        ? options.getSettings
        : readStoredSettings;

    const welcomePanel = document.getElementById('onboarding-welcome-panel');
    const dismissToggle = document.getElementById('onboarding-dismiss-toggle');
    const quickApiButton = document.getElementById('onboarding-quick-api');
    const welcomeCloseButton = document.getElementById('onboarding-close');

    const setupPanel = document.getElementById('deepseek-setup-panel');
    const setupCloseButton = document.getElementById('deepseek-setup-close');
    const stepPanels = [1, 2, 3].map(step => document.getElementById(`deepseek-step-${step}`));
    const progressItems = [...document.querySelectorAll('[data-deepseek-progress-step]')];
    const openPlatformButton = document.getElementById('deepseek-open-platform');
    const keyInput = document.getElementById('deepseek-key-input');
    const manualInputWrap = setupPanel?.querySelector('[data-deepseek-manual-wrap]') || null;
    const stepActionGroups = [...(setupPanel?.querySelectorAll('[data-deepseek-actions]') || [])];
    const readClipboardButton = document.getElementById('deepseek-read-clipboard');
    const manualEntryButton = document.getElementById('deepseek-manual-entry');
    const keySummary = document.getElementById('deepseek-key-summary');
    const toStepTwoButton = document.getElementById('deepseek-to-step-2');
    const checkButton = document.getElementById('deepseek-check');
    const topUpButton = document.getElementById('deepseek-top-up');
    const retryButton = document.getElementById('deepseek-retry');
    const startGameButton = document.getElementById('deepseek-start-game');
    const returnSettingsButton = document.getElementById('deepseek-return-settings');
    const resetButton = document.getElementById('deepseek-reset');
    const status = document.getElementById('deepseek-status');
    const statusResult = setupPanel?.querySelector('.deepseek-check-result') || null;
    const settingsPanel = document.getElementById('settings-panel');

    let source = 'welcome';
    let currentStep = 1;
    let draftKey = '';
    let currentRequest = null;
    let currentRequestTimedOut = false;
    let platformVisitPending = false;
    let platformWindowBlurred = false;
    let setupSucceeded = false;
    let destroyed = false;

    const listeners = [];

    function listen(target, type, handler, listenerOptions) {
        if (!target) return;
        target.addEventListener(type, handler, listenerOptions);
        listeners.push(() => target.removeEventListener(type, handler, listenerOptions));
    }

    function isDismissed() {
        try {
            return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
        } catch {
            return false;
        }
    }

    function setDismissed(dismissed) {
        try {
            if (dismissed) {
                localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
            } else {
                localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
            }
        } catch {}
        syncDismissToggle(dismissed);
    }

    function syncDismissToggle(dismissed = isDismissed()) {
        if (!dismissToggle) return;
        if ('checked' in dismissToggle) dismissToggle.checked = dismissed;
        dismissToggle.setAttribute('aria-checked', dismissed ? 'true' : 'false');
        dismissToggle.classList.toggle('is-active', dismissed);
    }

    function setStatus(message = '', state = 'info') {
        if (!status) return;
        const resultState = ['success', 'error', 'balance'].includes(state) ? state : 'checking';
        const textKind = state === 'busy' ? 'info' : state;
        status.textContent = message;
        status.dataset.state = state;
        status.dataset.kind = textKind;
        if (statusResult) statusResult.dataset.state = resultState;
        status.classList.toggle('hidden', !message);
    }

    function setButtonVisible(button, visible) {
        button?.classList.toggle('hidden', !visible);
    }

    function setBusy(busy) {
        if (checkButton) checkButton.disabled = busy;
        if (retryButton) retryButton.disabled = busy;
        if (resetButton) resetButton.disabled = busy;
        if (setupCloseButton) setupCloseButton.dataset.busy = busy ? '1' : '0';
        setupPanel?.classList.toggle('is-busy', busy);
    }

    function showManualInput() {
        if (!keyInput) return;
        manualInputWrap?.classList.remove('hidden');
        manualInputWrap?.removeAttribute('aria-hidden');
        keyInput.classList.remove('hidden');
        keyInput.removeAttribute('aria-hidden');
        keyInput.value = draftKey;
        requestAnimationFrame(() => keyInput.focus());
    }

    function hideManualInput() {
        if (!keyInput) return;
        keyInput.value = '';
        manualInputWrap?.classList.add('hidden');
        manualInputWrap?.setAttribute('aria-hidden', 'true');
        keyInput.classList.add('hidden');
        keyInput.setAttribute('aria-hidden', 'true');
    }

    function updateKeySummary(saved = false) {
        if (!keySummary) return;
        const summary = summarizeKey(draftKey, saved);
        keySummary.textContent = summary;
        keySummary.classList.toggle('hidden', !summary);
    }

    function showStep(step) {
        currentStep = Math.min(3, Math.max(1, Number(step) || 1));
        stepPanels.forEach((panel, index) => {
            setPanelVisible(panel, index + 1 === currentStep);
        });
        progressItems.forEach(item => {
            const itemStep = Number(item.dataset.deepseekProgressStep);
            item.classList.toggle('is-active', itemStep === currentStep);
            item.classList.toggle('is-complete', itemStep < currentStep);
            if (itemStep === currentStep) {
                item.setAttribute('aria-current', 'step');
            } else {
                item.removeAttribute('aria-current');
            }
        });
        stepActionGroups.forEach(group => {
            setPanelVisible(group, Number(group.dataset.deepseekActions) === currentStep);
        });
        setupPanel?.setAttribute('data-current-step', String(currentStep));
    }

    function clearSensitiveDraft() {
        draftKey = '';
        if (keyInput) keyInput.value = '';
    }

    function clearOfficialPageReturnState() {
        platformVisitPending = false;
        platformWindowBlurred = false;
    }

    function abortCurrentRequest() {
        if (!currentRequest) return;
        currentRequest.abort();
        currentRequest = null;
        currentRequestTimedOut = false;
        setBusy(false);
    }

    function resetTransientState() {
        abortCurrentRequest();
        clearSensitiveDraft();
        hideManualInput();
        if (keySummary) {
            keySummary.textContent = '';
            keySummary.classList.add('hidden');
        }
        setStatus('');
        setButtonVisible(topUpButton, false);
        setButtonVisible(retryButton, false);
        setButtonVisible(checkButton, true);
        setButtonVisible(startGameButton, false);
        setButtonVisible(returnSettingsButton, false);
        setupSucceeded = false;
        clearOfficialPageReturnState();
    }

    function loadExistingConnection() {
        const existing = getSettings() || {};
        if (!isDeepSeekConnection(existing)) return false;
        draftKey = normalizeKey(existing.apiKey);
        updateKeySummary();
        showStep(3);
        if (checkButton) checkButton.textContent = '测试当前配置';
        setButtonVisible(checkButton, true);
        setButtonVisible(resetButton, true);
        setStatus('检测到已有 DeepSeek 配置，可以直接测试。', 'info');
        return true;
    }

    function prepareNewConnection() {
        showStep(1);
        if (checkButton) checkButton.textContent = '检查配置';
        setButtonVisible(resetButton, false);
        setStatus('只需在 DeepSeek 官方页面复制一次密钥。', 'info');
    }

    function shouldShowWelcome() {
        return Boolean(welcomePanel) && !isDismissed();
    }

    function showWelcome() {
        if (!welcomePanel || destroyed) return false;
        controlsModule?.releaseControlMode?.({ resumeOnClose: false });
        syncDismissToggle();
        setPanelVisible(welcomePanel, true);
        return true;
    }

    function enterGameplayAfterSetup() {
        if (destroyed) return;
        abortCurrentRequest();
        setPanelVisible(setupPanel, false);
        setPanelVisible(welcomePanel, false);
        setPanelVisible(settingsPanel, false);
        clearSensitiveDraft();
        clearOfficialPageReturnState();
        hideManualInput();
        startGameplay();
        controlsModule?.forceEnterControlMode?.();
    }

    function closeWelcome(options = {}) {
        if (!welcomePanel || welcomePanel.classList.contains('hidden')) return false;
        setPanelVisible(welcomePanel, false);
        if (options.enterGameplay !== false) {
            startGameplay();
            controlsModule?.forceEnterControlMode?.();
        }
        dispatchOverlayClosed('onboarding-welcome-panel');
        return true;
    }

    function openDeepSeekSetup(nextSource = 'settings') {
        if (!setupPanel || destroyed) return false;
        source = nextSource === 'welcome' ? 'welcome' : 'settings';
        resetTransientState();
        controlsModule?.cancelOverlayResume?.();
        controlsModule?.releaseControlMode?.({ resumeOnClose: false });
        setPanelVisible(setupPanel, true);
        if (source === 'welcome') {
            setPanelVisible(welcomePanel, false);
        } else {
            setPanelVisible(settingsPanel, false);
        }
        if (!loadExistingConnection()) prepareNewConnection();
        return true;
    }

    function closeDeepSeekSetup() {
        if (!setupPanel || setupPanel.classList.contains('hidden')) return false;
        enterGameplayAfterSetup();
        dispatchOverlayClosed('deepseek-setup-panel');
        return true;
    }

    function moveToKeyImport(message = '请读取刚复制的 DeepSeek 密钥。') {
        showStep(2);
        setStatus(message, 'info');
        setButtonVisible(topUpButton, false);
        setButtonVisible(retryButton, false);
    }

    function acceptDraftKey(value) {
        const nextKey = normalizeKey(value);
        if (!nextKey) {
            setStatus('没有读取到密钥，请复制后重试或手动粘贴。', 'error');
            showManualInput();
            return false;
        }
        if (/\s/.test(nextKey)) {
            setStatus('密钥中包含空格，请重新复制完整密钥。', 'error');
            showManualInput();
            return false;
        }
        draftKey = nextKey;
        if (keyInput) keyInput.value = '';
        updateKeySummary();
        showStep(3);
        setStatus(`${summarizeKey(nextKey)}。检查成功后才会保存。`, 'info');
        setButtonVisible(resetButton, true);
        setButtonVisible(checkButton, true);
        if (checkButton) checkButton.textContent = '检查配置';
        return true;
    }

    async function readKeyFromClipboard() {
        if (!navigator.clipboard?.readText) {
            setStatus('当前环境不能读取剪贴板，请在下方手动粘贴。', 'error');
            showManualInput();
            return;
        }
        try {
            const value = await navigator.clipboard.readText();
            acceptDraftKey(value);
        } catch {
            setStatus('浏览器没有允许读取剪贴板，请在下方手动粘贴。', 'error');
            showManualInput();
        }
    }

    function showValidationError(message, options = {}) {
        setStatus(message, options.state || 'error');
        setButtonVisible(checkButton, false);
        setButtonVisible(topUpButton, Boolean(options.showTopUp));
        setButtonVisible(retryButton, true);
        setButtonVisible(startGameButton, false);
        setButtonVisible(returnSettingsButton, false);
    }

    function mapResponseError(statusCode) {
        if (statusCode === 401) return { message: 'Key 无效，请重新复制后再试。' };
        if (statusCode === 402) {
            return {
                message: '账户余额不足。请先完成实名认证并充值，支持支付宝和微信支付。',
                showTopUp: true,
                state: 'balance'
            };
        }
        if (statusCode === 403) return { message: '当前 Key 没有调用权限，请在 DeepSeek 平台重新创建。' };
        if (statusCode === 429) return { message: '请求过于频繁，请稍后再试。' };
        if (statusCode === 500) return { message: 'DeepSeek 服务暂时异常，请稍后重试。' };
        if (statusCode === 503) return { message: 'DeepSeek 服务繁忙，请稍后重试。' };
        return { message: `检查失败（HTTP ${statusCode}），请稍后重试。` };
    }

    async function checkAndSaveConnection() {
        if (currentRequest || destroyed) return;
        if (!draftKey) {
            moveToKeyImport('请先读取或粘贴 DeepSeek 密钥。');
            showManualInput();
            return;
        }
        if (!saveModelConnection) {
            showValidationError('设置模块尚未就绪，请重新打开向导。');
            return;
        }

        showStep(3);
        setButtonVisible(checkButton, false);
        setBusy(true);
        setButtonVisible(topUpButton, false);
        setButtonVisible(retryButton, false);
        setStatus('正在检查 DeepSeek 配置…', 'busy');

        const controller = new AbortController();
        currentRequest = controller;
        currentRequestTimedOut = false;
        const timeoutId = window.setTimeout(() => {
            currentRequestTimedOut = true;
            controller.abort();
        }, DEEPSEEK_CHECK_TIMEOUT_MS);

        try {
            const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${draftKey}`
                },
                body: JSON.stringify({
                    model: DEEPSEEK_MODEL,
                    messages: [{ role: 'user', content: '只回复 OK' }],
                    stream: false,
                    max_tokens: 8,
                    thinking: { type: 'disabled' }
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const responseError = mapResponseError(response.status);
                showValidationError(responseError.message, responseError);
                return;
            }

            let payload;
            try {
                payload = await response.json();
            } catch {
                showValidationError('DeepSeek 返回了无法识别的数据，请稍后重试。');
                return;
            }

            const message = payload?.choices?.[0]?.message;
            if (!message
                || typeof message !== 'object'
                || Array.isArray(message)
                || typeof message.content !== 'string'
                || !message.content.trim()) {
                showValidationError('DeepSeek 返回内容不完整，请稍后重试。');
                return;
            }

            const keySuffix = draftKey.slice(-4);
            try {
                await saveModelConnection({
                    apiKey: draftKey,
                    baseUrl: DEEPSEEK_BASE_URL,
                    model: DEEPSEEK_MODEL
                });
            } catch {
                showValidationError('配置已通过检查，但浏览器无法保存设置，请检查存储权限。');
                return;
            }

            setupSucceeded = true;
            setStatus('配置成功，DeepSeek 已可以使用。', 'success');
            if (keySummary) {
                keySummary.textContent = `配置已保存 ····${keySuffix}`;
                keySummary.classList.remove('hidden');
            }
            clearSensitiveDraft();
            setButtonVisible(topUpButton, false);
            setButtonVisible(retryButton, false);
            setButtonVisible(checkButton, false);
            setButtonVisible(resetButton, false);
            setButtonVisible(startGameButton, source === 'welcome');
            setButtonVisible(returnSettingsButton, source === 'settings');
        } catch (error) {
            if (error?.name === 'AbortError') {
                if (currentRequestTimedOut) {
                    showValidationError('连接超时，请检查网络后重试。');
                }
                return;
            }
            showValidationError('无法连接 DeepSeek，请检查网络或浏览器跨域限制后重试。');
        } finally {
            window.clearTimeout(timeoutId);
            if (currentRequest === controller) currentRequest = null;
            currentRequestTimedOut = false;
            setBusy(false);
        }
    }

    function resetConnectionDraft() {
        abortCurrentRequest();
        resetTransientState();
        prepareNewConnection();
    }

    function onOfficialPageOpen(url, nextMessage) {
        platformVisitPending = true;
        platformWindowBlurred = false;
        if (!openOfficialPage(url)) {
            platformVisitPending = false;
            setStatus('未能打开 DeepSeek 官网，请允许浏览器弹出窗口后重试。', 'error');
            return;
        }
        setStatus(nextMessage, 'info');
    }

    function onWindowBlur() {
        if (platformVisitPending) platformWindowBlurred = true;
    }

    function onWindowFocus() {
        if (!platformVisitPending || !platformWindowBlurred) return;
        platformVisitPending = false;
        platformWindowBlurred = false;
        const target = currentStep === 1
            ? toStepTwoButton
            : (currentStep === 2 ? readClipboardButton : retryButton);
        target?.classList.add('is-highlighted');
        target?.focus?.();
        window.setTimeout(() => target?.classList.remove('is-highlighted'), 2400);
        if (currentStep === 1) {
            setStatus('欢迎回来。复制好密钥后，点击“我已复制，下一步”。', 'info');
        } else if (currentStep === 2) {
            setStatus('欢迎回来。请读取刚复制的密钥。', 'info');
        } else {
            setStatus('充值完成后，请重新检查配置。', 'info');
        }
    }

    function onManualKeyCommit() {
        const value = keyInput?.value || '';
        if (!normalizeKey(value) && draftKey) return;
        acceptDraftKey(value);
    }

    function onDismissToggle() {
        const next = 'checked' in dismissToggle
            ? Boolean(dismissToggle.checked)
            : dismissToggle.getAttribute('aria-checked') !== 'true';
        setDismissed(next);
    }

    function onEscape(event) {
        if (event.key !== 'Escape') return;
        if (setupPanel && !setupPanel.classList.contains('hidden')) {
            event.preventDefault();
            closeDeepSeekSetup();
            return;
        }
        if (welcomePanel && !welcomePanel.classList.contains('hidden')) {
            event.preventDefault();
            closeWelcome();
        }
    }

    listen(dismissToggle, 'change', onDismissToggle);
    if (dismissToggle && !('checked' in dismissToggle)) {
        listen(dismissToggle, 'click', onDismissToggle);
    }
    listen(quickApiButton, 'click', () => openDeepSeekSetup('welcome'));
    listen(welcomeCloseButton, 'click', () => closeWelcome());
    listen(setupCloseButton, 'click', () => closeDeepSeekSetup());
    listen(openPlatformButton, 'click', () => {
        onOfficialPageOpen(DEEPSEEK_API_KEYS_URL, '创建并复制密钥后，回到这里点击“我已复制，下一步”。');
    });
    listen(toStepTwoButton, 'click', () => moveToKeyImport());
    listen(readClipboardButton, 'click', () => void readKeyFromClipboard());
    listen(manualEntryButton, 'click', showManualInput);
    listen(keyInput, 'paste', () => window.setTimeout(onManualKeyCommit, 0));
    listen(keyInput, 'change', onManualKeyCommit);
    listen(keyInput, 'keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onManualKeyCommit();
    });
    listen(checkButton, 'click', () => void checkAndSaveConnection());
    listen(retryButton, 'click', () => void checkAndSaveConnection());
    listen(topUpButton, 'click', () => {
        onOfficialPageOpen(DEEPSEEK_TOP_UP_URL, '充值完成后，请返回并重新检查配置。');
    });
    listen(resetButton, 'click', resetConnectionDraft);
    listen(startGameButton, 'click', () => {
        if (!setupSucceeded) return;
        closeDeepSeekSetup();
    });
    listen(returnSettingsButton, 'click', () => {
        if (!setupSucceeded) return;
        closeDeepSeekSetup();
    });
    listen(window, 'blur', onWindowBlur);
    listen(window, 'focus', onWindowFocus);
    listen(document, 'keydown', onEscape);

    syncDismissToggle();
    setPanelVisible(welcomePanel, false);
    setPanelVisible(setupPanel, false);
    const welcomeShown = options.autoShow === true && shouldShowWelcome()
        ? showWelcome()
        : false;

    return {
        welcomeShown,
        shouldShowWelcome,
        openWelcome: showWelcome,
        openQuickSetup: openDeepSeekSetup,
        closeWelcome,
        openDeepSeekSetup,
        closeDeepSeekSetup,
        destroy() {
            destroyed = true;
            abortCurrentRequest();
            clearSensitiveDraft();
            clearOfficialPageReturnState();
            listeners.splice(0).forEach(remove => remove());
        }
    };
}
