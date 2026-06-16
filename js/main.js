import * as THREE from 'three';
import { initScene } from './scene.js';
import { createRoom } from './room.js';
import { initControls } from './controls.js';
import { loadCharacter, updateCharacter, getCharacterPosition, startInteraction, endInteraction } from './character.js';
import { initDialogue, showDialogue, hideDialogue, isDialogueVisible } from './dialogue.js';
import { initSettings } from './settings.js';

let scene, camera, renderer;
let controlsModule, charData;
let isInteracting = false;

const clock = new THREE.Clock();

async function setLoadingText(text) {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
}

function setLoadingProgress(pct) {
    const bar = document.getElementById('loading-progress');
    if (bar) bar.style.width = `${Math.min(100, pct)}%`;
}

async function init() {
    const canvas = document.getElementById('game-canvas');

    await setLoadingText('初始化场景...');
    setLoadingProgress(10);
    const sceneData = initScene(canvas);
    scene = sceneData.scene;
    camera = sceneData.camera;
    renderer = sceneData.renderer;

    await setLoadingText('构建房间...');
    setLoadingProgress(25);
    const room = createRoom(scene);

    await new Promise(r => setTimeout(r, 100));

    await setLoadingText('加载芙提雅的模型...');
    setLoadingProgress(35);

    try {
        charData = await loadCharacter(scene, room.waypoints, room.colliders, (pct) => {
            setLoadingProgress(35 + pct * 0.5);
        });
        setLoadingProgress(85);
    } catch (err) {
        console.error('Character load failed:', err);
        await setLoadingText('模型加载失败，将使用占位体...');
        await new Promise(r => setTimeout(r, 1000));

        const placeholder = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.3, 1.0, 4, 8),
            new THREE.MeshStandardMaterial({ color: 0xffb6c1 })
        );
        placeholder.position.set(0, 0.8, 0);
        placeholder.castShadow = true;
        scene.add(placeholder);

        charData = {
            root: placeholder,
            mesh: placeholder,
            state: 'idle',
            stateTimer: 0,
            waypoints: room.waypoints,
            skeleton: null,
            hasAnimation: false,
            baseY: 0,
            bones: [],
            initialQuats: {},
            faceDirection: 0,
            currentWaypoint: null,
            walkProgress: 0,
            walkStart: new THREE.Vector3(),
            walkEnd: new THREE.Vector3(),
            idleDuration: 5,
            sitDuration: 15,
            transitionProgress: 0,
            transitionDuration: 1.0,
            blinkIndex: -1,
            nextBlink: 4,
            blinkTimer: 0,
            isBlinking: false,
            walkCycle: 0
        };
    }

    await setLoadingText('初始化控制...');
    setLoadingProgress(90);
    controlsModule = initControls(camera, renderer.domElement, room.colliders);

    await setLoadingText('准备对话系统...');
    setLoadingProgress(95);
    initDialogue();
    initSettings();

    document.addEventListener('keydown', onKeyDown);

    await setLoadingText('准备就绪！');
    setLoadingProgress(100);

    await new Promise(r => setTimeout(r, 500));
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.classList.add('fade-out');
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 800);

    document.getElementById('click-to-play').classList.remove('hidden');

    animate();
}

function onKeyDown(e) {
    if (e.code === 'KeyF') {
        if (isDialogueVisible()) return;

        if (isInteracting) {
            endInteractionMode();
            return;
        }

        const charPos = getCharacterPosition(charData);
        if (controlsModule.isNearCharacter(charPos)) {
            startInteractionMode(charPos);
        }
    }

    if (e.code === 'Escape') {
        if (isDialogueVisible()) {
            endInteractionMode();
        }
    }
}

function startInteractionMode(charPos) {
    isInteracting = true;
    startInteraction(charData, () => camera.position);
    controlsModule.controls.unlock();
    showDialogue();

    const checkInterval = setInterval(() => {
        if (!isInteracting) {
            clearInterval(checkInterval);
            return;
        }
        if (!isDialogueVisible()) {
            endInteractionMode();
            clearInterval(checkInterval);
        }
    }, 200);
}

function endInteractionMode() {
    isInteracting = false;
    endInteraction(charData);
    hideDialogue();
}

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);

    if (controlsModule) {
        controlsModule.update(delta);
    }

    if (charData) {
        updateCharacter(charData, delta);
        updateInteractionPrompt();
    }

    renderer.render(scene, camera);
}

function updateInteractionPrompt() {
    const prompt = document.getElementById('interaction-prompt');
    if (isInteracting || isDialogueVisible()) {
        prompt.classList.add('hidden');
        return;
    }

    const charPos = getCharacterPosition(charData);
    if (controlsModule && controlsModule.state.isLocked && controlsModule.isNearCharacter(charPos)) {
        prompt.classList.remove('hidden');
    } else {
        prompt.classList.add('hidden');
    }
}

init().catch(err => {
    console.error('Init error:', err);
    setLoadingText(`初始化失败: ${err.message}`);
});
