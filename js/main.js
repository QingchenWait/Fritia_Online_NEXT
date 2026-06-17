import * as THREE from 'three';
import { initScene } from './scene.js';
import { createRoom } from './room.js';
import { initControls } from './controls.js';
import { loadCharacter, updateCharacter, getCharacterPosition, startInteraction, endInteraction, startWaving, swapModel, applySleepingPose, applyIdlePose, updateBlink } from './character.js';
import { initDialogue, showDialogue, hideDialogue, isDialogueVisible, getConversationHistory, importConversationHistory } from './dialogue.js';
import { initDateDialogue, openDatePanel, closeDatePanel, isDatePanelVisible, getDateConversationHistory, importDateConversationHistory, getDateLocations } from './date_dialogue.js';
import { initSettings } from './settings.js';

let scene, camera, renderer;
let controlsModule, charData;
let isInteracting = false;
let paintingMesh;
let paintingLabel;
let wardrobeMesh;
let bedMesh;
let deskMesh;
let doorMesh;
let bedBlanket;
let isSleeping = false;
let sleepCamPos = new THREE.Vector3();
let sleepCamQuat = new THREE.Quaternion();
const raycaster = new THREE.Raycaster();

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
    paintingMesh = room.painting;
    paintingLabel = room.paintingLabel;
    wardrobeMesh = room.wardrobeMesh;
    bedMesh = room.bedMesh;
    bedBlanket = room.bedBlanket;
    deskMesh = room.deskMesh;
    doorMesh = room.doorMesh;

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
    controlsModule = initControls(camera, renderer.domElement, room.playerColliders, () => {
        if (isSleeping) {
            petFritiaHead();
            return;
        }
        if (isInteracting) {
            endInteractionMode();
            return;
        }
        const charPos = getCharacterPosition(charData);
        if (controlsModule.isNearCharacter(charPos)) {
            startInteractionMode(charPos);
        }
    });

    await setLoadingText('准备对话系统...');
    setLoadingProgress(95);
    await initDialogue();
    await initDateDialogue();
    initSettings();
    initPainting();

    document.addEventListener('keydown', onKeyDown);
    document.getElementById('btn-pet').addEventListener('click', () => { if (isSleeping) petFritiaHead(); });
    document.getElementById('btn-wake').addEventListener('click', () => { if (isSleeping) exitSleepMode(); });
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', importData);
    document.getElementById('import-file').addEventListener('change', handleImportFile);
    initHistoryPanel();
    initPromptButtons();

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

    const clickToPlay = document.getElementById('click-to-play');
    const onFirstClick = () => {
        clickToPlay.removeEventListener('click', onFirstClick);
        playStartupVoice();
        setTimeout(() => {
            if (charData) startWaving(charData);
        }, 300);
    };
    clickToPlay.addEventListener('click', onFirstClick);
}

function onKeyDown(e) {
    if (e.code === 'KeyF') {
        if (isDialogueVisible()) return;
        if (isDatePanelVisible()) return;

        if (isSleeping) {
            petFritiaHead();
            return;
        }

        if (isInteracting) {
            endInteractionMode();
            return;
        }

        const charPos = getCharacterPosition(charData);
        if (controlsModule.isNearCharacter(charPos)) {
            startInteractionMode(charPos);
        }
    }

    if (e.code === 'KeyE') {
        if (isInteracting || isDialogueVisible()) return;
        if (isDatePanelVisible()) return;
        if (isSleeping) {
            exitSleepMode();
        } else if (isLookingAtBed() && !currentModelPath.includes('国主驾到')) {
            enterSleepMode();
        } else if (isLookingAtDesk() || isLookingAtDoor()) {
            if (controlsModule && controlsModule.state.isLocked) {
                controlsModule.controls.unlock();
            }
            openDatePanel();
        } else if (isLookingAtPainting()) {
            document.getElementById('painting-upload').click();
        } else if (isLookingAtWardrobe()) {
            openModelSelector();
        }
    }

    if (e.code === 'Escape') {
        if (isDatePanelVisible()) {
            closeDatePanel();
            return;
        }
        if (isDialogueVisible()) {
            endInteractionMode();
        }
        const modelPanel = document.getElementById('model-selector');
        if (modelPanel && !modelPanel.classList.contains('hidden')) {
            closeModelSelector();
        }
    }
}

function playTalkSound() {
    const index = Math.floor(Math.random() * 5) + 1;
    const audio = new Audio(`src/_voices/talk_${index}.mp3`);
    audio.volume = 0.7;
    audio.play().catch(() => {});
}

function startInteractionMode(charPos) {
    isInteracting = true;
    startInteraction(charData, () => camera.position);
    controlsModule.controls.unlock();
    showDialogue();
    playTalkSound();

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
        if (!isSleeping) {
            controlsModule.update(delta);
        }
    }

    if (charData) {
        if (!isSleeping) {
            updateCharacter(charData, delta);
        }
        updateInteractionPrompt();
    }

    renderer.render(scene, camera);
}

function updateInteractionPrompt() {
    const prompt = document.getElementById('interaction-prompt');
    const paintingPrompt = document.getElementById('painting-prompt');
    if (isSleeping || isInteracting || isDialogueVisible() || isDatePanelVisible()) {
        prompt.classList.add('hidden');
        if (paintingPrompt) paintingPrompt.classList.add('hidden');
        return;
    }

    if (!controlsModule || !controlsModule.state.isLocked) {
        prompt.classList.add('hidden');
        if (paintingPrompt) paintingPrompt.classList.add('hidden');
        return;
    }

    const charPos = getCharacterPosition(charData);
    const nearChar = controlsModule.isNearCharacter(charPos);
    const lookPaint = isLookingAtPainting();
    const lookWardrobe = isLookingAtWardrobe();

    if (nearChar) {
        prompt.innerHTML = '按 <kbd>F</kbd> 与芙提雅对话';
        prompt.classList.remove('hidden');
    } else {
        prompt.classList.add('hidden');
    }

    if (paintingPrompt) {
        const lookBed = isLookingAtBed();
        const lookDesk = isLookingAtDesk();
        const lookDoor = isLookingAtDoor();
        if (lookPaint) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 更换挂画';
            paintingPrompt.classList.remove('hidden');
        } else if (lookWardrobe) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 换装';
            paintingPrompt.classList.remove('hidden');
        } else if (lookBed) {
            if (currentModelPath.includes('国主驾到')) {
                paintingPrompt.innerHTML = '<span style="opacity:0.4;cursor:not-allowed;">按 <kbd>E</kbd> 休息 <small style="font-size:0.75em;">(该装扮不可用)</small></span>';
            } else {
                paintingPrompt.innerHTML = '按 <kbd>E</kbd> 休息';
            }
            paintingPrompt.classList.remove('hidden');
        } else if (lookDesk) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 开始今日约会行程';
            paintingPrompt.classList.remove('hidden');
        } else if (lookDoor) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 出门约会';
            paintingPrompt.classList.remove('hidden');
        } else {
            paintingPrompt.classList.add('hidden');
        }
    }

    adjustPromptOverlap(prompt, paintingPrompt);
}

function adjustPromptOverlap(prompt1, prompt2) {
    if (!prompt1 || !prompt2) return;
    if (prompt1.classList.contains('hidden') || prompt2.classList.contains('hidden')) {
        prompt1.style.bottom = '';
        prompt1.dataset.shifted = '';
        return;
    }
    if (prompt1.dataset.shifted) return;
    const gap = 16;
    const r1 = prompt1.getBoundingClientRect();
    const r2 = prompt2.getBoundingClientRect();
    if (r1.right > r2.left && r1.left < r2.right && r1.bottom > r2.top) {
        const shift = Math.ceil(r1.bottom - r2.top + gap);
        prompt1.style.bottom = `calc(30% + ${shift}px)`;
        prompt1.dataset.shifted = '1';
    }
}

function initPromptButtons() {
    const prompt = document.getElementById('interaction-prompt');
    const paintingPrompt = document.getElementById('painting-prompt');

    function handlePromptTap(e, action) {
        e.preventDefault();
        e.stopPropagation();
        action();
    }

    prompt.addEventListener('click', (e) => {
        if (prompt.classList.contains('hidden')) return;
        handlePromptTap(e, () => {
            const charPos = getCharacterPosition(charData);
            if (controlsModule.isNearCharacter(charPos)) {
                startInteractionMode(charPos);
            }
        });
    });
    prompt.addEventListener('touchend', (e) => {
        if (prompt.classList.contains('hidden')) return;
        handlePromptTap(e, () => {
            const charPos = getCharacterPosition(charData);
            if (controlsModule.isNearCharacter(charPos)) {
                startInteractionMode(charPos);
            }
        });
    }, { passive: false });

    paintingPrompt.addEventListener('click', (e) => {
        if (paintingPrompt.classList.contains('hidden')) return;
        handlePromptTap(e, () => {
            if (isLookingAtBed() && !currentModelPath.includes('国主驾到')) {
                enterSleepMode();
            } else if (isLookingAtDesk() || isLookingAtDoor()) {
                if (controlsModule && controlsModule.state.isLocked) {
                    controlsModule.controls.unlock();
                }
                openDatePanel();
            } else if (isLookingAtPainting()) {
                document.getElementById('painting-upload').click();
            } else if (isLookingAtWardrobe()) {
                openModelSelector();
            }
        });
    });
    paintingPrompt.addEventListener('touchend', (e) => {
        if (paintingPrompt.classList.contains('hidden')) return;
        handlePromptTap(e, () => {
            if (isLookingAtBed() && !currentModelPath.includes('国主驾到')) {
                enterSleepMode();
            } else if (isLookingAtDesk() || isLookingAtDoor()) {
                if (controlsModule && controlsModule.state.isLocked) {
                    controlsModule.controls.unlock();
                }
                openDatePanel();
            } else if (isLookingAtPainting()) {
                document.getElementById('painting-upload').click();
            } else if (isLookingAtWardrobe()) {
                openModelSelector();
            }
        });
    }, { passive: false });
}

function initPainting() {
    const saved = localStorage.getItem('fritia_painting');
    if (saved && paintingMesh) {
        applyPaintingTexture(saved);
    }

    const fileInput = document.getElementById('painting-upload');
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            applyPaintingTexture(dataUrl);
            localStorage.setItem('fritia_painting', dataUrl);
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
    });

    document.getElementById('model-close').addEventListener('click', closeModelSelector);
}

const DEFAULT_MODEL = {
    name: '默认 - 毛绒派对',
    path: 'src/_fritia_3d_model/驰掣-毛绒派对.pmx'
};

const ALTERABLE_MODELS = [
    { name: '草莓甜心', path: 'src/_fritia_alterable_models/sweety_straw/芙提雅-驰掣 草莓甜心物理裙a1.0.pmx'},
    {name: '青叶密裹', path: 'src/_fritia_alterable_models/cyan_leaf/芙提雅 青叶密裹1.0.pmx'},
    {name: '泳池护卫', path: 'src/_fritia_alterable_models/pool_guard/芙提雅-驰掣 泳池护卫a2.0.pmx'},
    {name: '国主驾到 (小小老师)', path: 'src/_fritia_alterable_models/small_king/芙提雅-炬芯 国主驾到.pmx'}
];

let currentModelPath = DEFAULT_MODEL.path;
let isSwapping = false;

function openModelSelector() {
    if (controlsModule && controlsModule.state.isLocked) {
        controlsModule.controls.unlock();
    }
    const panel = document.getElementById('model-selector');
    const list = document.getElementById('model-list');
    list.innerHTML = '';

    const allModels = [DEFAULT_MODEL, ...ALTERABLE_MODELS];
    for (const model of allModels) {
        const item = document.createElement('div');
        item.className = 'model-item' + (model.path === currentModelPath ? ' active' : '');
        item.innerHTML = `<div class="model-name">${model.name}</div><div class="model-path">${model.path}</div>`;
        item.addEventListener('click', () => selectModel(model));
        list.appendChild(item);
    }

    panel.classList.remove('hidden');
}

function closeModelSelector() {
    document.getElementById('model-selector').classList.add('hidden');
}

async function selectModel(model) {
    if (model.path === currentModelPath || isSwapping) return;
    isSwapping = true;
    closeModelSelector();

    try {
        await swapModel(scene, charData, model.path);
        currentModelPath = model.path;
    } catch (err) {
        console.error('Model swap failed:', err);
    } finally {
        isSwapping = false;
    }
}

function applyPaintingTexture(src) {
    if (!paintingMesh) return;
    const img = new Image();
    img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        paintingMesh.material.map = tex;
        paintingMesh.material.color.set(0xffffff);
        paintingMesh.material.needsUpdate = true;
        if (paintingLabel) paintingLabel.visible = false;
    };
    img.src = src;
}

function isLookingAtBed() {
    if (!bedMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(bedMesh, true);
    return hits.length > 0;
}

function isLookingAtDesk() {
    if (!deskMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(deskMesh);
    return hits.length > 0;
}

function isLookingAtDoor() {
    if (!doorMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(doorMesh);
    return hits.length > 0;
}

function fadeToBlack() {
    return new Promise(resolve => {
        const overlay = document.getElementById('fade-overlay');
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.opacity = '1';
        setTimeout(resolve, 500);
    });
}

function fadeFromBlack() {
    return new Promise(resolve => {
        const overlay = document.getElementById('fade-overlay');
        overlay.style.transition = 'opacity 0.5s ease';
        overlay.style.opacity = '0';
        setTimeout(resolve, 500);
    });
}

async function enterSleepMode() {
    if (!charData || !charData.hasAnimation) return;

    await fadeToBlack();

    isSleeping = true;

    sleepCamPos.copy(camera.position);
    sleepCamQuat.copy(camera.quaternion);

    const bedCenter = new THREE.Vector3(-2.1, 0, -1.3);
    charData.root.position.set(bedCenter.x - 0.25, -0.05, bedCenter.z);
    charData.root.rotation.y = 0;
    applySleepingPose(charData);

    if (bedBlanket) bedBlanket.visible = false;

    if (charData.blinkIndex >= 0 && charData.mesh.morphTargetInfluences) {
        charData.mesh.morphTargetInfluences[charData.blinkIndex] = 1.0;
    }
    if (charData.smileIndex >= 0 && charData.mesh.morphTargetInfluences) {
        charData.mesh.morphTargetInfluences[charData.smileIndex] = 0.6;
    }

    camera.position.set(bedCenter.x + 0.1, bedCenter.y + 0.8, bedCenter.z - 0.6);

    const lookTarget = new THREE.Vector3(bedCenter.x - 0.25, bedCenter.y + 0.4, bedCenter.z - 0.6);
    camera.lookAt(lookTarget);

    const prompt = document.getElementById('interaction-prompt');
    if (prompt) prompt.classList.add('hidden');
    const paintingPrompt = document.getElementById('painting-prompt');
    if (paintingPrompt) paintingPrompt.classList.add('hidden');
    document.getElementById('sleep-ui').classList.remove('hidden');

    await fadeFromBlack();
    playSleepBgm();
}

let isPetting = false;
let sleepBgm = null;

function playSleepBgm() {
    stopSleepBgm();
    const tracks = ['src/_voices/sleep_mode_1.mp3', 'src/_voices/sleep_mode_2.mp3'];
    const src = tracks[Math.floor(Math.random() * tracks.length)];
    sleepBgm = new Audio(src);
    sleepBgm.loop = true;
    sleepBgm.volume = 0.35;
    sleepBgm.play().catch(() => {});
}

function stopSleepBgm() {
    if (sleepBgm) {
        sleepBgm.pause();
        sleepBgm.currentTime = 0;
        sleepBgm = null;
    }
}

function playSleepWhisper() {
    const index = Math.floor(Math.random() * 5) + 1;
    const audio = new Audio(`src/_voices/sleep_whisper_${index}.mp3`);
    audio.volume = 0.9;
    audio.play().catch(() => {});
}

function petFritiaHead() {
    if (!charData || isPetting) return;
    isPetting = true;

    const mesh = charData.mesh;
    const inf = mesh.morphTargetInfluences;
    const bi = charData.blinkIndex;
    const si = charData.smileIndex;

    if (inf && bi >= 0) inf[bi] = 0;
    if (inf && si >= 0) inf[si] = 1.0;
    renderer.render(scene, camera);
    playSleepWhisper();

    const delay = 3000 + Math.random() * 3000;
    setTimeout(() => {
        if (!isSleeping) { isPetting = false; return; }
        if (inf && bi >= 0) inf[bi] = 1.0;
        if (inf && si >= 0) inf[si] = 0.6;
        renderer.render(scene, camera);
        isPetting = false;
    }, delay);
}

async function exitSleepMode() {
    stopSleepBgm();
    await fadeToBlack();

    isSleeping = false;

    camera.position.copy(sleepCamPos);
    camera.quaternion.copy(sleepCamQuat);

    charData.root.position.set(0, charData.baseY, 0);
    charData.root.rotation.set(0, 0, 0);
    charData.state = 'idle';
    charData.stateTimer = 0;
    charData.currentWaypoint = null;
    charData.idleDuration = 3;
    applyIdlePose(charData);

    if (bedBlanket) bedBlanket.visible = true;
    document.getElementById('sleep-ui').classList.add('hidden');

    if (charData.blinkIndex >= 0 && charData.mesh.morphTargetInfluences) {
        charData.mesh.morphTargetInfluences[charData.blinkIndex] = 0;
    }
    if (charData.smileIndex >= 0 && charData.mesh.morphTargetInfluences) {
        charData.mesh.morphTargetInfluences[charData.smileIndex] = 0.3;
    }

    await fadeFromBlack();
}

function isLookingAtPainting() {
    if (!paintingMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(paintingMesh);
    return hits.length > 0;
}

function isLookingAtWardrobe() {
    if (!wardrobeMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(wardrobeMesh);
    return hits.length > 0;
}

async function playStartupVoice() {
    const exts = ['.wav', '.mp3', '.ogg'];
    const names = [];
    for (let i = 1; i <= 20; i++) {
        for (const ext of exts) {
            names.push(`startup_${i}${ext}`);
        }
    }
    names.push('startup.wav', 'startup_01.wav', 'startup_greeting.wav');

    for (const name of names) {
        const url = `src/_voices/${name}`;
        try {
            const head = await fetch(url, { method: 'HEAD' });
            if (head.ok) {
                const audio = new Audio(url);
                audio.volume = 0.9;
                audio.play().catch(() => {});
                return;
            }
        } catch {}
    }
}

function initHistoryPanel() {
    const panel = document.getElementById('history-panel');
    const list = document.getElementById('history-list');
    const dateList = document.getElementById('date-history-list');
    const selectWrapper = document.getElementById('history-date-filter');
    const selectSelected = selectWrapper.querySelector('.select-selected');
    const selectOptions = selectWrapper.querySelector('.select-options');
    const tabs = document.querySelectorAll('.history-tab');

    document.getElementById('btn-history').addEventListener('click', () => {
        renderHistory();
        panel.classList.remove('hidden');
    });
    document.getElementById('history-close').addEventListener('click', () => {
        panel.classList.add('hidden');
        selectOptions.classList.add('hidden');
    });

    selectSelected.addEventListener('click', (e) => {
        e.stopPropagation();
        selectOptions.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        selectOptions.classList.add('hidden');
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            selectOptions.classList.add('hidden');
            if (tab.dataset.tab === 'daily') {
                list.classList.remove('hidden');
                dateList.classList.add('hidden');
                renderHistory();
            } else {
                list.classList.add('hidden');
                dateList.classList.remove('hidden');
                renderDateHistory();
            }
        });
    });
}

function renderHistory(dateFilter = 'all') {
    const list = document.getElementById('history-list');
    const selectWrapper = document.getElementById('history-date-filter');
    const selectSelected = selectWrapper.querySelector('.select-selected');
    const selectOptions = selectWrapper.querySelector('.select-options');
    const history = getConversationHistory();

    const dates = [...new Set(history.map(m => {
        const d = new Date(m.ts || 0);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }))].sort().reverse();

    selectOptions.innerHTML = '';
    const allOpt = document.createElement('div');
    allOpt.className = 'select-option' + (dateFilter === 'all' ? ' selected' : '');
    allOpt.textContent = '全部日期';
    allOpt.dataset.value = 'all';
    allOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSelected.textContent = '全部日期';
        selectOptions.classList.add('hidden');
        renderHistory('all');
    });
    selectOptions.appendChild(allOpt);

    dates.forEach(d => {
        const opt = document.createElement('div');
        opt.className = 'select-option' + (d === dateFilter ? ' selected' : '');
        opt.textContent = d;
        opt.dataset.value = d;
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            selectSelected.textContent = d;
            selectOptions.classList.add('hidden');
            renderHistory(d);
        });
        selectOptions.appendChild(opt);
    });

    selectSelected.textContent = dateFilter === 'all' ? '全部日期' : dateFilter;

    let filtered = history;
    if (dateFilter !== 'all') {
        filtered = history.filter(m => {
            const d = new Date(m.ts || 0);
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            return ds === dateFilter;
        });
    }

    list.innerHTML = '';
    let lastDate = '';
    filtered.forEach(m => {
        const d = new Date(m.ts || 0);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (dateStr !== lastDate) {
            const sep = document.createElement('div');
            sep.className = 'history-date-sep';
            sep.textContent = dateStr;
            list.appendChild(sep);
            lastDate = dateStr;
        }
        const el = document.createElement('div');
        el.className = `history-msg ${m.role}`;
        const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        el.innerHTML = `<div class="msg-role">${m.role === 'user' ? '你' : '芙提雅'} · ${time}</div><div>${m.content}</div>`;
        list.appendChild(el);
    });

    list.scrollTop = list.scrollHeight;
}

function renderDateHistory(dateFilter = 'all') {
    const list = document.getElementById('date-history-list');
    const selectWrapper = document.getElementById('history-date-filter');
    const selectSelected = selectWrapper.querySelector('.select-selected');
    const selectOptions = selectWrapper.querySelector('.select-options');
    const dateHistory = getDateConversationHistory();

    const locationMap = {};
    getDateLocations().forEach(loc => {
        locationMap[loc.id] = loc.name;
    });

    const allSessions = [];
    for (const [locationId, messages] of Object.entries(dateHistory)) {
        if (!Array.isArray(messages) || messages.length === 0) continue;
        const dateGroups = {};
        messages.forEach(m => {
            const d = new Date(m.ts || 0);
            const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
            if (!dateGroups[dateStr]) dateGroups[dateStr] = [];
            dateGroups[dateStr].push(m);
        });
        for (const [dateStr, msgs] of Object.entries(dateGroups)) {
            allSessions.push({
                date: dateStr,
                locationId,
                locationName: locationMap[locationId] || locationId,
                messages: msgs,
                firstTs: msgs[0].ts || 0
            });
        }
    }

    allSessions.sort((a, b) => b.firstTs - a.firstTs);

    const dates = [...new Set(allSessions.map(s => s.date))].sort().reverse();

    selectOptions.innerHTML = '';
    const allOpt = document.createElement('div');
    allOpt.className = 'select-option' + (dateFilter === 'all' ? ' selected' : '');
    allOpt.textContent = '全部日期';
    allOpt.dataset.value = 'all';
    allOpt.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSelected.textContent = '全部日期';
        selectOptions.classList.add('hidden');
        renderDateHistory('all');
    });
    selectOptions.appendChild(allOpt);

    dates.forEach(d => {
        const opt = document.createElement('div');
        opt.className = 'select-option' + (d === dateFilter ? ' selected' : '');
        opt.textContent = d;
        opt.dataset.value = d;
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            selectSelected.textContent = d;
            selectOptions.classList.add('hidden');
            renderDateHistory(d);
        });
        selectOptions.appendChild(opt);
    });

    selectSelected.textContent = dateFilter === 'all' ? '全部日期' : dateFilter;

    let filtered = allSessions;
    if (dateFilter !== 'all') {
        filtered = allSessions.filter(s => s.date === dateFilter);
    }

    list.innerHTML = '';
    if (filtered.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:20px;">暂无约会记录</div>';
        return;
    }

    filtered.forEach(session => {
        const group = document.createElement('div');
        group.className = 'date-history-group';

        const title = document.createElement('div');
        title.className = 'history-date-sep';
        title.textContent = `${session.date}-[${session.locationName}]`;
        group.appendChild(title);

        session.messages.forEach(m => {
            const el = document.createElement('div');
            el.className = `history-msg ${m.role}`;
            const d = new Date(m.ts || 0);
            const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            el.innerHTML = `<div class="msg-role">${m.role === 'user' ? '你' : '芙提雅'} · ${time}</div><div>${m.content}</div>`;
            group.appendChild(el);
        });

        list.appendChild(group);
    });
}

function exportData() {
    const data = {
        version: 1,
        exportedAt: Date.now(),
        settings: JSON.parse(localStorage.getItem('fritia-settings') || '{}'),
        conversations: getConversationHistory(),
        dateConversations: getDateConversationHistory()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    a.href = url;
    a.download = `fritia_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData() {
    document.getElementById('import-file').click();
}

function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (data.settings) {
                localStorage.setItem('fritia-settings', JSON.stringify(data.settings));
            }
            if (data.conversations && Array.isArray(data.conversations)) {
                importConversationHistory(data.conversations);
            }
            if (data.dateConversations && typeof data.dateConversations === 'object') {
                importDateConversationHistory(data.dateConversations);
            }
            alert('导入成功！刷新页面以应用设置。');
        } catch (err) {
            alert('导入失败：文件格式不正确');
            console.error('Import error:', err);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

init().catch(err => {
    console.error('Init error:', err);
    setLoadingText(`初始化失败: ${err.message}`);
});
