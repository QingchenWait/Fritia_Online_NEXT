import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function dispatchGameAction(code) {
    document.dispatchEvent(new CustomEvent('fritia-action', { detail: { code } }));
}

function hasPhysicalKeyboard() {
    return !('ontouchstart' in window) || window.innerWidth > 1024;
}

function supportsPointerLock(domElement) {
    const doc = domElement?.ownerDocument;
    return !!domElement?.requestPointerLock
        && !!doc?.exitPointerLock
        && 'pointerLockElement' in doc;
}

const POINTER_LOCK_MAX_LOOK_STEP = 70;
const POINTER_LOCK_HARD_SPIKE = 260;
const MANUAL_LOOK_MAX_STEP = 80;
const MANUAL_LOOK_HARD_SPIKE = 260;
const TOUCH_LOOK_MAX_STEP = 46;
const TOUCH_LOOK_HARD_SPIKE = 180;
const POINTER_LOCK_SUPPRESS_MS = 90;

function nowMs() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function isLookDeltaSpike(deltaX, deltaY, maxDelta) {
    const dx = Number(deltaX);
    const dy = Number(deltaY);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return true;
    return Math.abs(dx) > maxDelta
        || Math.abs(dy) > maxDelta
        || Math.hypot(dx, dy) > maxDelta * 1.45;
}

function normalizeLookDelta(deltaX, deltaY, maxStep, hardSpike) {
    const dx = Number(deltaX);
    const dy = Number(deltaY);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
    if (isLookDeltaSpike(dx, dy, hardSpike)) return null;
    const length = Math.hypot(dx, dy);
    if (length > maxStep && length > 0.0001) {
        const scale = maxStep / length;
        return { x: dx * scale, y: dy * scale };
    }
    return { x: dx, y: dy };
}

export function initControls(camera, domElement, colliders) {
    const pointerLockSupported = supportsPointerLock(domElement);
    const controls = new PointerLockControls(camera, domElement);
    const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    const state = {
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false,
        direction: new THREE.Vector3(),
        speed: 3.0,
        colliders: colliders,
        isLocked: false,
        movementLocked: false,
        useTouchControls: isTouchDevice() && (!hasPhysicalKeyboard() || !pointerLockSupported)
    };

    const overlayIds = [
        'dialogue-ui',
        'settings-panel',
        'history-panel',
        'model-selector',
        'sleep-ui',
        'date-panel',
        'gift-terminal-panel',
        'gift-collection-panel',
        'achievements-panel',
        'dream-terminal-panel',
        'dream-furniture-editor-panel',
        'dream-placement-editor-panel',
        'dream-object-controls'
    ];
    let resumeAfterOverlay = false;
    let resumeInProgress = false;
    let suppressPointerLookUntil = 0;
    let resetTouchInputState = () => {};

    function suppressPointerLook(ms = POINTER_LOCK_SUPPRESS_MS) {
        suppressPointerLookUntil = Math.max(suppressPointerLookUntil, nowMs() + ms);
    }

    function filterPointerLockMouseMove(event) {
        const doc = domElement.ownerDocument;
        if (state.useTouchControls || doc.pointerLockElement !== domElement || !state.isLocked) return;
        const dx = Number(event.movementX) || 0;
        const dy = Number(event.movementY) || 0;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (nowMs() < suppressPointerLookUntil) return;
        const normalized = normalizeLookDelta(dx, dy, POINTER_LOCK_MAX_LOOK_STEP, POINTER_LOCK_HARD_SPIKE);
        if (normalized) {
            applyLookDelta(normalized.x, normalized.y, 0.002);
        }
    }

    document.addEventListener('mousemove', filterPointerLockMouseMove, true);

    function isOverlayOpen() {
        return overlayIds.some(id => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        });
    }

    function syncEntryPrompt() {
        const prompt = document.getElementById('click-to-play');
        if (!prompt) return;
        if (!state.isLocked && !isOverlayOpen() && !resumeAfterOverlay && !resumeInProgress) {
            prompt.classList.remove('hidden');
        } else {
            prompt.classList.add('hidden');
        }
    }

    for (const id of overlayIds) {
        const el = document.getElementById(id);
        if (el) {
            new MutationObserver(syncEntryPrompt).observe(el, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    function clearMovementState() {
        state.moveForward = false;
        state.moveBackward = false;
        state.moveLeft = false;
        state.moveRight = false;
    }

    function enterControlMode() {
        resumeAfterOverlay = false;
        resumeInProgress = false;
        resetTouchInputState();
        state.isLocked = true;
        syncEntryPrompt();
        document.getElementById('crosshair').classList.add('active');
        if (state.useTouchControls) {
            document.getElementById('touch-controls').classList.add('active');
        }
    }

    function leaveControlMode() {
        state.isLocked = false;
        clearMovementState();
        resetTouchInputState();
        document.getElementById('crosshair').classList.remove('active');
        document.getElementById('touch-controls').classList.remove('active');
        syncEntryPrompt();
    }

    controls.addEventListener('lock', () => {
        suppressPointerLook();
        enterControlMode();
    });

    controls.addEventListener('unlock', () => {
        leaveControlMode();
    });

    document.addEventListener('keydown', (e) => {
        switch (e.code) {
            case 'KeyW': state.moveForward = true; break;
            case 'KeyS': state.moveBackward = true; break;
            case 'KeyA': state.moveLeft = true; break;
            case 'KeyD': state.moveRight = true; break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch (e.code) {
            case 'KeyW': state.moveForward = false; break;
            case 'KeyS': state.moveBackward = false; break;
            case 'KeyA': state.moveLeft = false; break;
            case 'KeyD': state.moveRight = false; break;
        }
    });

    const clickToPlay = document.getElementById('click-to-play');
    clickToPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.useTouchControls) {
            if (pointerLockSupported) {
                controls.lock();
            }
        } else {
            enterControlMode();
        }
    });

    document.addEventListener('click', (e) => {
        if (!state.isLocked && !state.useTouchControls && !resumeAfterOverlay && !resumeInProgress) {
            const inOverlay = overlayIds.some(id => {
                const el = document.getElementById(id);
                return el && !el.classList.contains('hidden') && el.contains(e.target);
            });
            const inTopBar = document.getElementById('top-bar')?.contains(e.target);
            if (!inOverlay && !inTopBar && pointerLockSupported) {
                controls.lock();
            }
        }
    });

    function resetTransientInput() {
        clearMovementState();
        resetTouchInputState();
        suppressPointerLook(160);
    }

    window.addEventListener('resize', resetTransientInput);
    window.addEventListener('orientationchange', resetTransientInput);
    window.addEventListener('blur', () => {
        resetTransientInput();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) resetTransientInput();
        else suppressPointerLook(160);
    });

    if (state.useTouchControls) {
        const resetJoystick = initTouchJoystick(state);
        const resetLook = initTouchLook(controls, state, rotateView);
        resetTouchInputState = () => {
            resetJoystick?.();
            resetLook?.();
        };
        initTouchButtons(state);
    }

    function checkCollision(pos, radius) {
        for (const box of state.colliders) {
            if (pos.x + radius > box.min.x && pos.x - radius < box.max.x &&
                pos.z + radius > box.min.z && pos.z - radius < box.max.z &&
                1.6 > box.min.y && 0 < box.max.y) {
                return true;
            }
        }
        return false;
    }

    function resolveCameraCollisions(radius = 0.25) {
        const camera = controls.object;
        let moved = false;

        for (let i = 0; i < 8; i++) {
            let resolvedThisPass = false;
            for (const box of state.colliders) {
                if (!(camera.position.x + radius > box.min.x && camera.position.x - radius < box.max.x &&
                    camera.position.z + radius > box.min.z && camera.position.z - radius < box.max.z &&
                    1.6 > box.min.y && 0 < box.max.y)) {
                    continue;
                }

                const shifts = [
                    { axis: 'x', value: box.min.x - (camera.position.x + radius) },
                    { axis: 'x', value: box.max.x - (camera.position.x - radius) },
                    { axis: 'z', value: box.min.z - (camera.position.z + radius) },
                    { axis: 'z', value: box.max.z - (camera.position.z - radius) }
                ].sort((a, b) => Math.abs(a.value) - Math.abs(b.value));

                const shift = shifts[0];
                camera.position[shift.axis] += shift.value;
                resolvedThisPass = true;
                moved = true;
            }
            if (!resolvedThisPass) break;
        }

        camera.position.y = 1.6;
        return moved;
    }

    function update(delta) {
        if (!state.isLocked) return;
        if (state.movementLocked) {
            clearMovementState();
            controls.object.position.y = 1.6;
            return;
        }

        state.direction.z = Number(state.moveForward) - Number(state.moveBackward);
        state.direction.x = Number(state.moveRight) - Number(state.moveLeft);
        state.direction.normalize();

        const speed = state.speed * delta;
        const camera = controls.object;
        camera.updateMatrixWorld(true);
        const prevQuat = camera.quaternion.clone();
        const radius = 0.25;

        if (state.moveForward || state.moveBackward) {
            const prevPos = camera.position.clone();
            controls.moveForward(state.direction.z * speed);
            if (checkCollision(camera.position, radius)) {
                camera.position.copy(prevPos);
            }
        }

        if (state.moveLeft || state.moveRight) {
            const beforeRight = camera.position.clone();
            controls.moveRight(state.direction.x * speed);
            if (checkCollision(camera.position, radius)) {
                camera.position.copy(beforeRight);
            }
        }

        camera.position.y = 1.6;
        camera.quaternion.copy(prevQuat);
    }

    function isNearCharacter(charPos, threshold = 2.5) {
        const camPos = controls.object.position;
        const dx = camPos.x - charPos.x;
        const dz = camPos.z - charPos.z;
        return Math.sqrt(dx * dx + dz * dz) < threshold;
    }

    function addColliders(colliders) {
        if (!Array.isArray(colliders)) return;
        for (const collider of colliders) {
            if (collider && !state.colliders.includes(collider)) {
                state.colliders.push(collider);
            }
        }
    }

    function removeColliders(colliders) {
        if (!Array.isArray(colliders)) return;
        state.colliders = state.colliders.filter(collider => !colliders.includes(collider));
    }

    function setColliders(colliders) {
        state.colliders = Array.isArray(colliders) ? colliders : [];
    }

    function setMovementLocked(locked) {
        state.movementLocked = Boolean(locked);
        clearMovementState();
    }

    function applyLookDelta(deltaX, deltaY, sensitivity) {
        lookEuler.setFromQuaternion(controls.object.quaternion);
        lookEuler.y -= deltaX * sensitivity;
        lookEuler.x -= deltaY * sensitivity;
        lookEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lookEuler.x));
        controls.object.quaternion.setFromEuler(lookEuler);
        controls.object.updateMatrixWorld(true);
    }

    function rotateView(deltaX, deltaY) {
        const normalized = normalizeLookDelta(deltaX, deltaY, MANUAL_LOOK_MAX_STEP, MANUAL_LOOK_HARD_SPIKE);
        if (!normalized) return false;
        applyLookDelta(normalized.x, normalized.y, 0.002);
        return true;
    }

    function blurActiveOverlayElement() {
        const active = document.activeElement;
        if (active && typeof active.blur === 'function' && active !== document.body) {
            active.blur();
        }
    }

    function requestPointerLockForResume() {
        try {
            suppressPointerLook();
            const result = domElement.requestPointerLock();
            if (result && typeof result.catch === 'function') {
                result.catch(() => {
                    resumeInProgress = false;
                    syncEntryPrompt();
                });
            }
            return true;
        } catch {
            resumeInProgress = false;
            syncEntryPrompt();
            return false;
        }
    }

    function releaseControlMode(options = {}) {
        if (options.resumeOnClose && state.isLocked) {
            resumeAfterOverlay = true;
        }

        const doc = domElement.ownerDocument;
        if (state.useTouchControls) {
            if (!state.isLocked) return false;
            leaveControlMode();
            return true;
        }
        if (!pointerLockSupported || !doc || doc.pointerLockElement !== domElement) {
            if (state.isLocked) {
                leaveControlMode();
                return true;
            }
            return false;
        }
        controls.unlock();
        return true;
    }

    function resumeControlMode() {
        if (!resumeAfterOverlay || isOverlayOpen()) {
            syncEntryPrompt();
            return false;
        }

        blurActiveOverlayElement();

        if (state.useTouchControls) {
            enterControlMode();
            return true;
        }

        if (!pointerLockSupported) {
            resumeAfterOverlay = false;
            syncEntryPrompt();
            return false;
        }

        const doc = domElement.ownerDocument;
        if (doc.pointerLockElement === domElement) {
            enterControlMode();
            return true;
        }

        resumeInProgress = true;
        syncEntryPrompt();
        return requestPointerLockForResume();
    }

    function forceEnterControlMode() {
        blurActiveOverlayElement();
        if (state.useTouchControls) {
            enterControlMode();
            return true;
        }
        if (!pointerLockSupported) {
            enterControlMode();
            return false;
        }
        const doc = domElement.ownerDocument;
        if (doc.pointerLockElement === domElement) {
            enterControlMode();
            return true;
        }
        resumeAfterOverlay = false;
        resumeInProgress = true;
        syncEntryPrompt();
        return requestPointerLockForResume();
    }

    return {
        controls,
        state,
        update,
        isNearCharacter,
        addColliders,
        removeColliders,
        setColliders,
        resolveCameraCollisions,
        setMovementLocked,
        rotateView,
        releaseControlMode,
        resumeControlMode,
        enterControlMode,
        forceEnterControlMode
    };
}

function initTouchJoystick(state) {
    const joystick = document.getElementById('joystick-move');
    const knob = document.getElementById('joystick-move-knob');
    if (!joystick || !knob) return () => {};

    let touchId = null;
    const maxDist = 35;

    function resetJoystick() {
        touchId = null;
        knob.style.transform = 'translate(-50%, -50%)';
        state.moveForward = false;
        state.moveBackward = false;
        state.moveLeft = false;
        state.moveRight = false;
    }

    joystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (touchId !== null) return;
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        updateJoystick(touch);
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (touchId === null) return;
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                updateJoystick(touch);
                break;
            }
        }
    }, { passive: false });

    function endJoystickTouch(e) {
        if (touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                resetJoystick();
                break;
            }
        }
    }

    document.addEventListener('touchend', endJoystickTouch, { passive: false });
    document.addEventListener('touchcancel', endJoystickTouch, { passive: false });

    function updateJoystick(touch) {
        const rect = joystick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = touch.clientX - cx;
        let dy = touch.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        const threshold = 10;
        state.moveForward = dy < -threshold;
        state.moveBackward = dy > threshold;
        state.moveLeft = dx < -threshold;
        state.moveRight = dx > threshold;
    }

    return resetJoystick;
}

function initTouchLook(controls, state, rotateView) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return () => {};

    let touchId = null;
    let lastX = 0;
    let lastY = 0;

    function resetLookTouch() {
        touchId = null;
        lastX = 0;
        lastY = 0;
    }

    canvas.addEventListener('touchstart', (e) => {
        if (!state.isLocked) return;
        const joystick = document.getElementById('joystick-move');
        const btnInteract = document.getElementById('btn-interact');
        const btnLook = document.getElementById('btn-look');
        
        for (const touch of e.changedTouches) {
            const target = touch.target;
            if (target === joystick || target === btnInteract || target === btnLook) continue;
            if (target.closest('#joystick-move') || target.closest('.touch-actions')) continue;
            
            if (touchId === null) {
                e.preventDefault();
                touchId = touch.identifier;
                lastX = touch.clientX;
                lastY = touch.clientY;
            }
        }
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (touchId === null || !state.isLocked) return;
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                const dx = touch.clientX - lastX;
                const dy = touch.clientY - lastY;
                lastX = touch.clientX;
                lastY = touch.clientY;

                const normalized = normalizeLookDelta(dx, dy, TOUCH_LOOK_MAX_STEP, TOUCH_LOOK_HARD_SPIKE);
                if (!normalized) break;
                rotateView?.(normalized.x * 1.5, normalized.y * 1.5);
                break;
            }
        }
    }, { passive: false });

    function endLookTouch(e) {
        if (touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                resetLookTouch();
                break;
            }
        }
    }

    document.addEventListener('touchend', endLookTouch, { passive: false });
    document.addEventListener('touchcancel', endLookTouch, { passive: false });

    return resetLookTouch;
}

function initTouchButtons(state) {
    const btnInteract = document.getElementById('btn-interact');
    if (btnInteract) {
        btnInteract.addEventListener('touchstart', (e) => {
            e.preventDefault();
            dispatchGameAction('KeyF');
        });
    }
}
