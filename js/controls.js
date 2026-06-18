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
        document.getElementById('crosshair').classList.remove('active');
        document.getElementById('touch-controls').classList.remove('active');
        syncEntryPrompt();
    }

    controls.addEventListener('lock', () => {
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
    clickToPlay.addEventListener('click', () => {
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

    if (state.useTouchControls) {
        initTouchJoystick(state);
        initTouchLook(controls, state);
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
        const prevPos = camera.position.clone();
        const radius = 0.25;

        if (state.moveForward || state.moveBackward) {
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

    function rotateView(deltaX, deltaY) {
        const sensitivity = 0.002;
        lookEuler.setFromQuaternion(controls.object.quaternion);
        lookEuler.y -= deltaX * sensitivity;
        lookEuler.x -= deltaY * sensitivity;
        lookEuler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lookEuler.x));
        controls.object.quaternion.setFromEuler(lookEuler);
    }

    function blurActiveOverlayElement() {
        const active = document.activeElement;
        if (active && typeof active.blur === 'function' && active !== document.body) {
            active.blur();
        }
    }

    function requestPointerLockForResume() {
        try {
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
        enterControlMode
    };
}

function initTouchJoystick(state) {
    const joystick = document.getElementById('joystick-move');
    const knob = document.getElementById('joystick-move-knob');
    if (!joystick || !knob) return;

    let touchId = null;
    const maxDist = 35;

    joystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (touchId !== null) return;
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        updateJoystick(touch);
    });

    document.addEventListener('touchmove', (e) => {
        if (touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                updateJoystick(touch);
                break;
            }
        }
    });

    function endJoystickTouch(e) {
        if (touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                touchId = null;
                knob.style.transform = 'translate(-50%, -50%)';
                state.moveForward = false;
                state.moveBackward = false;
                state.moveLeft = false;
                state.moveRight = false;
                break;
            }
        }
    }

    document.addEventListener('touchend', endJoystickTouch);
    document.addEventListener('touchcancel', endJoystickTouch);

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
}

function initTouchLook(controls, state) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    let touchId = null;
    let lastX = 0;
    let lastY = 0;
    const sensitivity = 0.003;
    let euler = new THREE.Euler(0, 0, 0, 'YXZ');

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
                touchId = touch.identifier;
                lastX = touch.clientX;
                lastY = touch.clientY;
            }
        }
    });

    document.addEventListener('touchmove', (e) => {
        if (touchId === null || !state.isLocked) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                const dx = touch.clientX - lastX;
                const dy = touch.clientY - lastY;
                lastX = touch.clientX;
                lastY = touch.clientY;

                euler.setFromQuaternion(controls.object.quaternion);
                euler.y -= dx * sensitivity;
                euler.x -= dy * sensitivity;
                euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
                controls.object.quaternion.setFromEuler(euler);
                break;
            }
        }
    });

    function endLookTouch(e) {
        if (touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                touchId = null;
                break;
            }
        }
    }

    document.addEventListener('touchend', endLookTouch);
    document.addEventListener('touchcancel', endLookTouch);
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
