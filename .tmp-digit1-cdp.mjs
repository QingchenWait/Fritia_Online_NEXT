const pages = await (await fetch('http://127.0.0.1:9224/json')).json();
const page = pages.find(item => item.type === 'page');
if (!page) throw new Error('No CDP page');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
});

let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const [resolve, reject] = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
};

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, [resolve, reject]);
        socket.send(JSON.stringify({ id, method, params }));
    });
}

async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
}

async function waitFor(expression, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out: ${expression}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
        window.__digit1Log = [];
        let testPointerLockElement = null;
        try {
            Object.defineProperty(document, 'pointerLockElement', {
                configurable: true,
                get: () => testPointerLockElement
            });
        } catch {}
        HTMLCanvasElement.prototype.requestPointerLock = function () {
            testPointerLockElement = this;
            document.dispatchEvent(new Event('pointerlockchange'));
            return Promise.resolve();
        };
        document.exitPointerLock = function () {
            testPointerLockElement = null;
            document.dispatchEvent(new Event('pointerlockchange'));
        };
        document.addEventListener('keydown', event => {
            const active = document.activeElement;
            window.__digit1Log.push({
                code: event.code,
                key: event.key,
                target: event.target?.tagName || '',
                activeTag: active?.tagName || '',
                activeId: active?.id || '',
                activeType: active?.type || '',
                activeEditable: Boolean(active?.isContentEditable),
                pointerLocked: Boolean(document.pointerLockElement),
                welcomeVisible: !document.getElementById('onboarding-welcome-panel')?.classList.contains('hidden'),
                setupVisible: !document.getElementById('deepseek-setup-panel')?.classList.contains('hidden')
            });
        }, true);
    `
});

await evaluate("localStorage.setItem('fritia_onboarding_welcome_dismissed', '1')");
await send('Page.reload', { ignoreCache: true });
await waitFor("document.getElementById('click-to-play') && !document.getElementById('click-to-play').classList.contains('hidden')");

await evaluate("document.getElementById('click-to-play').click()");
await waitFor("Boolean(document.pointerLockElement)");

await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: '1',
    code: 'Digit1',
    windowsVirtualKeyCode: 49,
    nativeVirtualKeyCode: 49
});
await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: '1',
    code: 'Digit1',
    windowsVirtualKeyCode: 49,
    nativeVirtualKeyCode: 49
});
await new Promise(resolve => setTimeout(resolve, 100));

const result = await evaluate(`
    (() => {
        const active = document.activeElement;
        const prompts = ['dream-painting-prompt', 'memory-node-prompt'].map(id => {
            const element = document.getElementById(id);
            return {
                id,
                visible: Boolean(element && !element.classList.contains('hidden')),
                text: element?.textContent?.trim() || ''
            };
        });
        return {
            log: window.__digit1Log,
            activeTag: active?.tagName || '',
            activeId: active?.id || '',
            pointerLocked: Boolean(document.pointerLockElement),
            prompts
        };
    })()
`);

console.log(JSON.stringify(result, null, 2));
socket.close();
