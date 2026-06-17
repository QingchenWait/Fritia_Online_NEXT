import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function hasPhysicalKeyboard() {
    return !('ontouchstart' in window) || window.innerWidth > 1024;
}

export function initControls(camera, domElement, colliders, onInteract) {
    const controls = new PointerLockControls(camera, domElement);

    const state = {
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false,
        direction: new THREE.Vector3(),
        speed: 3.0,
        colliders: colliders,
        isLocked: false,
        useTouchControls: isTouchDevice() && !hasPhysicalKeyboard()
    };

    controls.addEventListener('lock', () => {
        state.isLocked = true;
        document.getElementById('crosshair').classList.add('active');
        document.getElementById('click-to-play').classList.add('hidden');
    });

    controls.addEventListener('unlock', () => {
        state.isLocked = false;
        document.getElementById('crosshair').classList.remove('active');
        const dialogueUI = document.getElementById('dialogue-ui');
        const settingsPanel = document.getElementById('settings-panel');
        if (dialogueUI.classList.contains('hidden') && settingsPanel.classList.contains('hidden')) {
            document.getElementById('click-to-play').classList.remove('hidden');
        }
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
            controls.lock();
        } else {
            state.isLocked = true;
            clickToPlay.classList.add('hidden');
            document.getElementById('crosshair').classList.add('active');
            document.getElementById('touch-controls').classList.add('active');
        }
    });

    document.addEventListener('click', (e) => {
        if (!state.isLocked && !state.useTouchControls) {
            const overlayIds = ['dialogue-ui', 'settings-panel', 'history-panel', 'model-selector', 'sleep-ui', 'date-panel'];
            const inOverlay = overlayIds.some(id => {
                const el = document.getElementById(id);
                return el && !el.classList.contains('hidden') && el.contains(e.target);
            });
            const inTopBar = document.getElementById('top-bar')?.contains(e.target);
            if (!inOverlay && !inTopBar) {
                controls.lock();
            }
        }
    });

    if (state.useTouchControls) {
        initTouchJoystick(state);
        initTouchLook(controls, state);
        initTouchButtons(state, onInteract);
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

    function update(delta) {
        if (!state.isLocked) return;

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

    return { controls, state, update, isNearCharacter };
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

    document.addEventListener('touchend', (e) => {
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
    });

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

    document.addEventListener('touchend', (e) => {
        if (touchId === null) return;
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchId) {
                touchId = null;
                break;
            }
        }
    });
}

function initTouchButtons(state, onInteract) {
    const btnInteract = document.getElementById('btn-interact');
    if (btnInteract) {
        btnInteract.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (onInteract) onInteract();
        });
    }
}
