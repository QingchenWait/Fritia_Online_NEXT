import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export function initControls(camera, domElement, colliders) {
    const controls = new PointerLockControls(camera, domElement);

    const state = {
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false,
        direction: new THREE.Vector3(),
        speed: 3.0,
        colliders: colliders,
        isLocked: false
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
        controls.lock();
    });

    document.addEventListener('click', (e) => {
        if (!state.isLocked) {
            const dialogueUI = document.getElementById('dialogue-ui');
            const settingsPanel = document.getElementById('settings-panel');
            const settingsToggle = document.getElementById('settings-toggle');
            if (dialogueUI.classList.contains('hidden') &&
                settingsPanel.classList.contains('hidden') &&
                !settingsToggle.contains(e.target)) {
                controls.lock();
            }
        }
    });

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
                camera.position.z = prevPos.z;
            }
        }

        if (state.moveLeft || state.moveRight) {
            controls.moveRight(state.direction.x * speed);
            if (checkCollision(camera.position, radius)) {
                camera.position.x = prevPos.x;
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
