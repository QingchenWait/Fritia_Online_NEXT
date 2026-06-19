import * as THREE from 'three';
import { initScene } from './scene.js';
import { createRoom } from './room.js';
import { initControls } from './controls.js';
import { loadCharacter, updateCharacter, getCharacterPosition, startInteraction, endInteraction, startWaving, swapModel, applySleepingPose, applyIdlePose, updateBlink, setSittingEnabled, setCharacterNavigationScope, refreshCharacterNavigationData, forceCharacterIntoRoom, moveCharacterToWaypoint } from './character.js';
import { initDialogue, showDialogue, hideDialogue, isDialogueVisible, getConversationHistory, importConversationHistory } from './dialogue.js';
import { initDateDialogue, openDatePanel, closeDatePanel, isDatePanelVisible, getDateConversationHistory, importDateConversationHistory, getDateLocations } from './date_dialogue.js';
import { initSettings } from './settings.js';
import { addAffinity, exportGameState, formatGameDateTime, getAffinity, getGameTimeInfo, getMoney, importGameState, initGameState, recordHeadPat, recordModelUsed, updateGameTime } from './game_state.js';
import { closeGiftCollection, closeGiftTerminal, initGiftSystem, isGiftOverlayVisible, openGiftCollection, openGiftTerminal, renderGiftCollection } from './gift_system.js?v=20260618-gift-stream';
import { closeAchievementsPanel, evaluateAchievements, exportAchievements, flushStartupAchievementToasts, importAchievements, initAchievements, isAchievementsPanelVisible, refreshAchievementsFromImport } from './achievements.js';
import {
    closeDreamFurnitureEditor,
    closeDreamPanel,
    confirmPendingDreamRevision,
    constrainPendingRevisionPlayer,
    exportDreamFurniture,
    getDreamFurnitureColliders,
    getDreamFurnitureLabel,
    getDreamFurnitureWaypoints,
    getLookingDreamFurniture,
    hasEditableDreamPainting,
    importDreamFurniture,
    initDreamSystem,
    isDreamPaintingFurniture,
    isDreamOverlayVisible,
    isDreamRevisionPending,
    isLookingAtDreamFurniture,
    isLookingAtDreamTerminal,
    openDreamFurnitureEditor,
    openDreamPanel,
    refreshDreamFurnitureAfterImport,
    requestDreamPaintingTextureUpload,
    consumeDreamPaintingTextureFile,
    rollbackPendingDreamRevision
} from './dream_system.js';
import {
    enterRoomPanorama,
    exitRoomPanorama,
    initRoomPanorama,
    isRoomPanoramaActive,
    updateRoomPanorama
} from './room_panorama.js';
import {
    BAR_ROOM_ID,
    ensureBarScene,
    getBarBounds,
    getBarCharacterColliders,
    getBarDanceInteractionMesh,
    getBarExitInteractionMesh,
    getBarPlayerColliders,
    getBarSpawn,
    getBarWaypoints,
    isPointInBarBounds,
    setBarSceneVisible
} from './bar_scene.js';
import {
    closeDancePanel,
    finishDanceFlow,
    initDanceSystem,
    isDanceChoiceVisible,
    isDanceFlowActive,
    isDanceOverlayVisible,
    openDancePanel,
    replayDance,
    updateDanceSystem
} from './dance_system.js';

let scene, camera, renderer;
let controlsModule, charData;
let isInteracting = false;
let roomGroup;
let paintingMesh;
let paintingLabel;
let wardrobeMesh;
let bedMesh;
let deskMesh;
let doorMesh;
let windowMesh;
let dreamWindowMesh;
let terminalMesh;
let dreamTerminalMesh;
let dreamDoorMesh;
let dreamDoorInteractionMesh;
let dreamDoorCollider;
let dreamDoorClosedPosition;
let dreamDoorOpenPosition;
let collectionCabinetMesh;
let bedBlanket;
let oldRoomBounds;
let dreamRoomBounds;
let dreamRoomWaypoints = [];
let basePlayerColliders = [];
let bedroomColliders = [];
let dreamStaticColliders = [];
let barSceneData = null;
let currentPlayerRoomId = 'bedroom';
let isBarSceneActive = false;
let barTransitionInProgress = false;
let previousSceneFog = null;
let previousSceneBackground = null;
let hasStoredRoomAtmosphere = false;
let isSleeping = false;
let isDreamDoorOpen = false;
let dreamDoorAnimating = false;
let dreamDoorAnimationTime = 0;
let dreamDoorAnimationFrom = 0;
let dreamDoorAnimationTo = 0;
let startupInteractionStarted = false;
let startupWelcomePending = true;
let startupWelcomeStarted = false;
let dreamCinematic = null;
let sleepCamPos = new THREE.Vector3();
let sleepCamQuat = new THREE.Quaternion();
const raycaster = new THREE.Raycaster();
const occlusionRay = new THREE.Ray();
const lookDirection = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const occlusionPoint = new THREE.Vector3();
const cinematicBox = new THREE.Box3();
const cinematicSize = new THREE.Vector3();
const cinematicCenter = new THREE.Vector3();
const cinematicSafeEnd = new THREE.Vector3();
const cinematicCandidate = new THREE.Vector3();
const cinematicSide = new THREE.Vector3();

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
    initGameState();

    await setLoadingText('初始化场景...');
    setLoadingProgress(10);
    const sceneData = initScene(canvas);
    scene = sceneData.scene;
    camera = sceneData.camera;
    renderer = sceneData.renderer;

    await setLoadingText('构建房间...');
    setLoadingProgress(25);
    const room = createRoom(scene);
    roomGroup = room.group;
    paintingMesh = room.painting;
    paintingLabel = room.paintingLabel;
    wardrobeMesh = room.wardrobeMesh;
    bedMesh = room.bedMesh;
    bedBlanket = room.bedBlanket;
    deskMesh = room.deskMesh;
    doorMesh = room.doorMesh;
    windowMesh = room.windowMesh;
    dreamWindowMesh = room.dreamWindowMesh;
    terminalMesh = room.terminalMesh;
    dreamTerminalMesh = room.dreamTerminalMesh;
    dreamDoorMesh = room.dreamDoorMesh;
    dreamDoorInteractionMesh = room.dreamDoorInteractionMesh;
    dreamDoorCollider = room.dreamDoorCollider;
    dreamDoorClosedPosition = room.dreamDoorClosedPosition;
    dreamDoorOpenPosition = room.dreamDoorOpenPosition;
    collectionCabinetMesh = room.collectionCabinetMesh;
    oldRoomBounds = room.oldRoomBounds;
    dreamRoomBounds = room.dreamRoomBounds;
    dreamRoomWaypoints = room.dreamRoomWaypoints || [];
    bedroomColliders = room.colliders || [];
    dreamStaticColliders = room.dreamRoomColliders || [];
    basePlayerColliders = room.playerColliders || [];

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
            colliders: room.colliders,
            navigationScope: { roomId: 'bedroom' },
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
    charData.originalBedroomWaypoints = room.waypoints;
    charData.originalBedroomColliders = room.colliders;

    await setLoadingText('初始化控制...');
    setLoadingProgress(90);
    controlsModule = initControls(camera, renderer.domElement, getActivePlayerColliders());

    await setLoadingText('加载暖调闲聚地图...');
    setLoadingProgress(92);
    try {
        barSceneData = await ensureBarScene(scene);
    } catch (err) {
        console.error('[BarScene] 暖调闲聚地图加载失败:', err);
        barSceneData = null;
    }

    await setLoadingText('准备对话系统...');
    setLoadingProgress(95);
    await initDialogue();
    await initDateDialogue();
    initSettings();
    initGiftSystem();
    initAchievements();
    initDreamSystem({
        scene,
        camera,
        controlsModule,
        dreamTerminalMesh,
        oldRoomBounds,
        dreamRoomBounds,
        doorClearanceZone: room.doorClearanceZone,
        getGameTimeText: () => formatGameDateTime({ includeYear: true }),
        getCharacterRoot: () => charData?.root || null,
        getOcclusionColliders: () => getActivePlayerColliders(),
        canShowFurnitureDialogue: () => controlsModule?.state?.isLocked
            && !isSleeping
            && !isInteracting
            && !isDialogueVisible()
            && !isDatePanelVisible()
            && !isGiftOverlayVisible()
            && !isDreamOverlayVisible(),
        onFurnitureChanged: handleDreamFurnitureChanged,
        onFurnitureCreated: startDreamFurnitureCinematic
    });
    initRoomPanorama({
        scene,
        camera,
        renderer,
        controlsModule,
        getCharacterRoot: () => charData?.root || null,
        fadeToBlack,
        fadeFromBlack
    });
    initDanceSystem({
        scene,
        controlsModule,
        getCharacterData: () => charData,
        getCurrentModelPath: () => currentModelPath,
        getModels: () => [DEFAULT_MODEL, ...ALTERABLE_MODELS],
        swapToModel: swapToDanceModel,
        placeCharacterAtStage,
        applyIdlePose,
        onDanceFinished: restoreCharacterAfterDance
    });
    initPainting();
    refreshCharacterRoomScope(true);
    updateGameHud(true);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('fritia-action', (e) => {
        const code = e.detail?.code;
        if (code) onKeyDown({ code });
    });
    document.addEventListener('fritia-overlay-closed', (e) => {
        if (e.detail?.id === 'dialogue-ui' && isInteracting) {
            isInteracting = false;
            endInteraction(charData);
        }
        controlsModule.resumeControlMode();
    });
    document.addEventListener('fritia-game-state-updated', (e) => {
        updateGameHud(true);
        showMoneyToast(e.detail?.moneyDelta || 0);
        renderGiftCollection();
        evaluateAchievements();
    });
    document.addEventListener('fritia-affinity-updated', (e) => {
        updateGameHud(true);
        showAffinityToast(e.detail?.delta || 0);
        evaluateAchievements();
    });
    document.getElementById('btn-pet').addEventListener('click', () => { if (isSleeping) petFritiaHead(); });
    document.getElementById('btn-wake').addEventListener('click', () => { if (isSleeping) exitSleepMode(); });
    document.getElementById('btn-achievements').addEventListener('click', () => {
        controlsModule.releaseControlMode({ resumeOnClose: true });
    });
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
        startupInteractionStarted = true;
        flushStartupAchievementToasts();
        playStartupVoice();
        setTimeout(() => {
            if (charData) {
                startWaving(charData, { getLookTarget: () => camera.position });
                startupWelcomeStarted = true;
            } else {
                startupWelcomePending = false;
            }
        }, 300);
    };
    clickToPlay.addEventListener('click', onFirstClick);
}

function onKeyDown(e) {
    igniteForKey(e.code);
    if (barTransitionInProgress) return;
    if (isDanceChoiceVisible()) {
        if (e.code === 'Digit1' || e.code === 'Numpad1') {
            replayDance();
            return;
        }
        if (e.code === 'Digit2' || e.code === 'Numpad2') {
            finishDanceFlow();
            return;
        }
    }
    if (isRoomPanoramaActive()) {
        if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'Digit1' || e.code === 'Numpad1') exitRoomPanorama();
        return;
    }

    if (dreamCinematic) {
        if (e.code === 'KeyE') skipDreamFurnitureCinematic();
        return;
    }

    if (isDreamRevisionPending()) {
        if (e.code === 'Digit1' || e.code === 'Numpad1') {
            confirmPendingDreamRevision();
        } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
            rollbackPendingDreamRevision();
        }
        return;
    }

    if ((e.code === 'Digit1' || e.code === 'Numpad1') && !isTypingInEditableElement()) {
        const lookedDreamFurniture = isBarSceneActive ? null : getLookingDreamFurniture(camera);
        if (!isBarSceneActive && controlsModule?.state?.isLocked && isLookingAtDreamTerminal(camera)) {
            enterRoomPanorama();
            return;
        }
        if (!isBarSceneActive && hasEditableDreamPainting()) {
            requestDreamPaintingTextureUpload();
            return;
        }
        if (!isBarSceneActive && lookedDreamFurniture && isDreamPaintingFurniture(lookedDreamFurniture)) {
            requestDreamPaintingTextureUpload(lookedDreamFurniture);
            return;
        }
    }

    if (e.code === 'KeyF') {
        if (isDanceFlowActive()) return;
        if (isDialogueVisible()) return;
        if (isDatePanelVisible()) return;
        if (isGiftOverlayVisible()) return;
        if (isDreamOverlayVisible()) return;
        if (isDanceOverlayVisible()) return;

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
        if (isGiftOverlayVisible()) return;
        if (isDreamOverlayVisible()) return;
        if (isDanceOverlayVisible()) return;
        if (controlsModule && controlsModule.state.isLocked) {
            if (isSleeping) {
                exitSleepMode();
            } else if (isBarSceneActive && isLookingAtBarDancePlane()) {
                openDancePanel();
            } else if (isDanceFlowActive() && isLookingAtBarExit()) {
                return;
            } else if (isLookingAtBarExit()) {
                exitBarScene();
            } else if (!isBarSceneActive && isLookingAtDreamDoor()) {
                toggleDreamDoor();
            } else if (!isBarSceneActive && isLookingAtDreamTerminal(camera)) {
                openDreamPanel();
            } else if (!isBarSceneActive && isLookingAtDreamFurniture(camera)) {
                openDreamFurnitureEditor(getLookingDreamFurniture(camera));
            } else if (isLookingAtTerminal()) {
                openGiftTerminal();
                controlsModule.releaseControlMode({ resumeOnClose: true });
            } else if (isLookingAtCollectionCabinet()) {
                openGiftCollection();
                controlsModule.releaseControlMode({ resumeOnClose: true });
            } else if (isLookingAtBed() && !isSmallTeacherModel()) {
                enterSleepMode();
            } else if (isLookingAtDesk()) {
                openDatePanel();
                controlsModule.releaseControlMode({ resumeOnClose: true });
            } else if (isLookingAtDoor()) {
                enterBarScene();
            } else if (isLookingAtPainting()) {
                document.getElementById('painting-upload').click();
            } else if (isLookingAtWardrobe()) {
                openModelSelector();
            }
        }
    }

    if (e.code === 'Escape') {
        if (isDreamOverlayVisible()) {
            closeDreamPanel();
            closeDreamFurnitureEditor();
            return;
        }
        if (isGiftOverlayVisible()) {
            closeGiftTerminal();
            closeGiftCollection();
            return;
        }
        if (isAchievementsPanelVisible()) {
            closeAchievementsPanel();
            return;
        }
        if (isDatePanelVisible()) {
            closeDatePanel();
            return;
        }
        if (isDanceOverlayVisible()) {
            closeDancePanel();
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
    showDialogue();
    controlsModule.releaseControlMode({ resumeOnClose: true });
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

function isTypingInEditableElement() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = String(active.tagName || '').toUpperCase();
    return active.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function updateGameHud(force = false, salary = 0) {
    const timeEl = document.getElementById('game-time-display');
    const affinityValueEl = document.getElementById('affinity-value');
    const moneyEl = document.getElementById('money-display');
    const info = getGameTimeInfo({ quantize: 5 });
    if (timeEl && (force || timeEl.dataset.minutes !== String(info.totalMinutes))) {
        timeEl.textContent = info.text;
        timeEl.dataset.minutes = String(info.totalMinutes);
    }
    if (affinityValueEl) {
        affinityValueEl.textContent = `${getAffinity()}/100`;
    }
    if (moneyEl) {
        moneyEl.textContent = `数据金 | 🪙 ${Math.round(getMoney()).toLocaleString('zh-CN')}`;
    }
    if (salary > 0) {
        showSalaryToast(salary);
    }
}

function showAffinityToast(amount) {
    const row = document.getElementById('affinity-display');
    if (!row || amount <= 0) return;

    const toast = document.createElement('span');
    toast.className = 'affinity-pop';
    toast.textContent = `+${amount}`;
    row.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 1200);
}

function showMoneyToast(amount) {
    const row = document.getElementById('money-display');
    if (!row || amount <= 0) return;

    const toast = document.createElement('span');
    toast.className = 'money-pop';
    toast.textContent = `+${amount}`;
    row.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 1200);
}

function showSalaryToast(amount) {
    const el = document.getElementById('salary-toast');
    if (!el) return;
    el.textContent = `[陶董] 发放日薪：+ ${amount}`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(showSalaryToast.timer);
    showSalaryToast.timer = setTimeout(() => {
        el.classList.add('hidden');
    }, 2800);
}

function handleDreamFurnitureChanged(options = {}) {
    if (controlsModule) {
        controlsModule.setColliders(getActivePlayerColliders());
    }
    if (charData && currentPlayerRoomId === BAR_ROOM_ID) {
        refreshCharacterNavigationData(charData, {
            roomId: BAR_ROOM_ID,
            bounds: getBarBounds(),
            waypoints: getBarWaypoints(),
            colliders: getBarCharacterColliders(),
            forceRepath: Boolean(options.forceCharacterRepath)
        });
        return;
    }
    if (charData && currentPlayerRoomId === 'dream') {
        refreshCharacterNavigationData(charData, {
            roomId: 'dream',
            bounds: dreamRoomBounds,
            waypoints: [...dreamRoomWaypoints, ...getDreamFurnitureWaypoints()],
            colliders: getActiveDreamCharacterColliders(),
            forceRepath: Boolean(options.forceCharacterRepath)
        });
    } else if (charData && currentPlayerRoomId === 'bedroom') {
        refreshCharacterNavigationData(charData, {
            roomId: 'bedroom',
            bounds: oldRoomBounds,
            waypoints: charData.originalBedroomWaypoints || charData.waypoints || [],
            colliders: getActiveBedroomCharacterColliders(),
            forceRepath: Boolean(options.forceCharacterRepath)
        });
    }
}

function getActiveBasePlayerColliders() {
    if (isBarSceneActive) return getBarPlayerColliders();
    if (isDreamDoorOpen || !dreamDoorCollider) return basePlayerColliders.filter(collider => collider !== dreamDoorCollider);
    return basePlayerColliders;
}

function getActivePlayerColliders() {
    if (isBarSceneActive) return getBarPlayerColliders();
    return [...getActiveBasePlayerColliders(), ...getDreamFurnitureColliders()];
}

function getActiveBedroomCharacterColliders() {
    const colliders = bedroomColliders ? [...bedroomColliders] : [];
    if (!isDreamDoorOpen && dreamDoorCollider) colliders.push(dreamDoorCollider);
    return colliders;
}

function getActiveDreamCharacterColliders() {
    const colliders = dreamStaticColliders ? [...dreamStaticColliders] : [];
    if (!isDreamDoorOpen && dreamDoorCollider) colliders.push(dreamDoorCollider);
    colliders.push(...getDreamFurnitureColliders());
    return colliders;
}

function refreshCollisionScopesAfterDreamDoorChange() {
    if (controlsModule) {
        controlsModule.setColliders(getActivePlayerColliders());
        controlsModule.resolveCameraCollisions?.();
    }
    if (!charData) return;
    if (currentPlayerRoomId === BAR_ROOM_ID) {
        refreshCharacterNavigationData(charData, {
            roomId: BAR_ROOM_ID,
            bounds: getBarBounds(),
            waypoints: getBarWaypoints(),
            colliders: getBarCharacterColliders()
        });
        return;
    }
    if (currentPlayerRoomId === 'dream') {
        refreshCharacterNavigationData(charData, {
            roomId: 'dream',
            bounds: dreamRoomBounds,
            waypoints: [...dreamRoomWaypoints, ...getDreamFurnitureWaypoints()],
            colliders: getActiveDreamCharacterColliders()
        });
    } else {
        refreshCharacterNavigationData(charData, {
            roomId: 'bedroom',
            bounds: oldRoomBounds,
            waypoints: charData.originalBedroomWaypoints || charData.waypoints || [],
            colliders: getActiveBedroomCharacterColliders()
        });
    }
}

function clampCameraToDreamRoom(pos, margin = 0.42) {
    if (!dreamRoomBounds) return pos;
    pos.x = THREE.MathUtils.clamp(pos.x, dreamRoomBounds.min.x + margin, dreamRoomBounds.max.x - margin);
    pos.z = THREE.MathUtils.clamp(pos.z, dreamRoomBounds.min.z + margin, dreamRoomBounds.max.z - margin);
    pos.y = THREE.MathUtils.clamp(pos.y, 0.75, dreamRoomBounds.max.y - 0.25);
    return pos;
}

function isCameraPointBlocked(pos, radius = 0.28) {
    const colliders = getActivePlayerColliders();
    for (const box of colliders) {
        if (pos.x + radius > box.min.x && pos.x - radius < box.max.x
            && pos.z + radius > box.min.z && pos.z - radius < box.max.z
            && pos.y > box.min.y && 0 < box.max.y) {
            return true;
        }
    }
    return false;
}

function findSafeDreamCinematicEnd(preferredEnd, target, viewDir, maxSize) {
    const playerY = Number.isFinite(camera?.position?.y) ? camera.position.y : 1.6;
    const fallbackDistance = THREE.MathUtils.clamp(maxSize * 1.8 + 1.25, 2.4, 5.4);
    const forward = cinematicCandidate.copy(viewDir);
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, 1);
    forward.y = 0;
    forward.normalize();
    cinematicSide.set(-forward.z, 0, forward.x);

    const candidates = [preferredEnd.clone()];
    for (const distanceScale of [1, 0.82, 1.18, 0.64, 1.36]) {
        const baseDistance = fallbackDistance * distanceScale;
        for (const sideOffset of [0, 0.55, -0.55, 1.0, -1.0, 1.45, -1.45]) {
            const candidate = target.clone()
                .addScaledVector(forward, baseDistance)
                .addScaledVector(cinematicSide, sideOffset);
            candidate.y = playerY;
            candidates.push(candidate);
        }
    }

    for (const candidate of candidates) {
        candidate.y = playerY;
        clampCameraToDreamRoom(candidate);
        candidate.y = playerY;
        if (!isCameraPointBlocked(candidate)) {
            return candidate.clone();
        }
    }

    const fallback = preferredEnd.clone();
    fallback.y = playerY;
    clampCameraToDreamRoom(fallback);
    return fallback;
}

function startDreamFurnitureCinematic(record, runtimeItem) {
    const group = runtimeItem?.group;
    if (!group || !camera || !controlsModule) return;
    group.updateMatrixWorld(true);
    cinematicBox.setFromObject(group);
    if (!Number.isFinite(cinematicBox.min.x) || !Number.isFinite(cinematicBox.max.x)) return;

    cinematicBox.getCenter(cinematicCenter);
    cinematicBox.getSize(cinematicSize);
    const maxSize = Math.max(cinematicSize.x, cinematicSize.y, cinematicSize.z, 0.8);
    const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y).normalize();
    const endDistance = THREE.MathUtils.clamp(maxSize * 1.55 + 1.15, 2.2, 5.2);
    const startDistance = Math.max(1.15, endDistance * 0.48);
    const target = cinematicCenter.clone();
    target.y = Math.max(0.55, cinematicBox.min.y + cinematicSize.y * 0.55);

    const start = target.clone().addScaledVector(front, startDistance).add(new THREE.Vector3(0, -0.08, 0));
    const end = target.clone().addScaledVector(front, endDistance).add(new THREE.Vector3(0, Math.min(1.0, maxSize * 0.28 + 0.35), 0));
    clampCameraToDreamRoom(start);
    clampCameraToDreamRoom(end);
    cinematicSafeEnd.copy(findSafeDreamCinematicEnd(end, target, front, maxSize));
    end.copy(cinematicSafeEnd);

    dreamCinematic = {
        recordId: record?.id || '',
        elapsed: 0,
        duration: 3.05,
        start,
        end,
        targetStart: target.clone().add(new THREE.Vector3(0, -0.05, 0)),
        targetEnd: target.clone().add(new THREE.Vector3(0, Math.min(0.55, maxSize * 0.16), 0))
    };

    controlsModule.releaseControlMode({ resumeOnClose: false });
    controlsModule.setMovementLocked?.(true);
    const prompt = document.getElementById('interaction-prompt');
    if (prompt) {
        prompt.innerHTML = '按 <kbd>E</kbd> 跳过展示';
        prompt.dataset.promptKey = 'KeyE';
        prompt.classList.remove('hidden');
    }
    const paintingPrompt = document.getElementById('painting-prompt');
    if (paintingPrompt) paintingPrompt.classList.add('hidden');
    const dreamPaintingPrompt = document.getElementById('dream-painting-prompt');
    if (dreamPaintingPrompt) dreamPaintingPrompt.classList.add('hidden');
}

function skipDreamFurnitureCinematic() {
    if (!dreamCinematic) return false;
    finishDreamFurnitureCinematic();
    return true;
}

function finishDreamFurnitureCinematic() {
    if (!dreamCinematic) return;
    if (camera && dreamCinematic.end) {
        camera.position.copy(dreamCinematic.end);
        camera.lookAt(dreamCinematic.targetEnd || lookTarget);
    }
    dreamCinematic = null;
    controlsModule?.setMovementLocked?.(false);
    controlsModule?.resolveCameraCollisions?.();
    controlsModule?.forceEnterControlMode?.();
    const prompt = document.getElementById('interaction-prompt');
    if (prompt) prompt.classList.add('hidden');
}

function updateDreamFurnitureCinematic(delta) {
    if (!dreamCinematic || !camera) return;
    dreamCinematic.elapsed += delta;
    const t = THREE.MathUtils.clamp(dreamCinematic.elapsed / dreamCinematic.duration, 0, 1);
    const eased = easeInOutCubic(t);
    camera.position.lerpVectors(dreamCinematic.start, dreamCinematic.end, eased);
    lookTarget.lerpVectors(dreamCinematic.targetStart, dreamCinematic.targetEnd, eased);
    camera.lookAt(lookTarget);
    if (t >= 1) finishDreamFurnitureCinematic();
}

function getRoomIdForPosition(position) {
    if (isBarSceneActive || isPointInBarBounds(position)) {
        return BAR_ROOM_ID;
    }
    if (dreamRoomBounds
        && position.x >= dreamRoomBounds.min.x - 0.05
        && position.x <= dreamRoomBounds.max.x + 0.05
        && position.z >= dreamRoomBounds.min.z - 0.05
        && position.z <= dreamRoomBounds.max.z + 0.05) {
        return 'dream';
    }
    return 'bedroom';
}

function applyBarNavigationScope() {
    if (!charData) return;
    setCharacterNavigationScope(charData, {
        roomId: BAR_ROOM_ID,
        bounds: getBarBounds(),
        waypoints: getBarWaypoints(),
        colliders: getBarCharacterColliders()
    });
    const spawn = getBarSpawn();
    if (spawn?.character) {
        forceCharacterIntoRoom(charData, BAR_ROOM_ID, spawn.character);
    }
}

function applyBarSceneAtmosphere() {
    if (!scene) return;
    if (!hasStoredRoomAtmosphere) {
        previousSceneFog = scene.fog || null;
        previousSceneBackground = scene.background || null;
        hasStoredRoomAtmosphere = true;
    }
    scene.background = new THREE.Color(0x20151d);
    scene.fog = new THREE.Fog(0x20151d, 28, 72);
}

function restoreRoomAtmosphere() {
    if (!scene) return;
    scene.fog = previousSceneFog || null;
    scene.background = previousSceneBackground || new THREE.Color(0x1a1a2e);
    previousSceneFog = null;
    previousSceneBackground = null;
    hasStoredRoomAtmosphere = false;
}

async function enterBarScene() {
    if (barTransitionInProgress) return;
    barTransitionInProgress = true;
    controlsModule?.setMovementLocked?.(true);
    let needsFadeIn = false;

    try {
        if (!barSceneData) {
            barSceneData = await ensureBarScene(scene);
        }
        if (!barSceneData) return;

        await fadeToBlack();
        needsFadeIn = true;
        setBarSceneVisible(true);
        if (roomGroup) roomGroup.visible = false;
        applyBarSceneAtmosphere();
        isBarSceneActive = true;
        currentPlayerRoomId = BAR_ROOM_ID;

        const spawn = getBarSpawn();
        if (spawn?.playerPosition) {
            camera.position.copy(spawn.playerPosition);
            if (spawn.lookAt) camera.lookAt(spawn.lookAt);
            camera.updateMatrixWorld(true);
        }
        applyBarNavigationScope();
        controlsModule?.setColliders(getActivePlayerColliders());
        controlsModule?.resolveCameraCollisions?.();

        await fadeFromBlack();
        needsFadeIn = false;
    } catch (err) {
        console.error('[BarScene] 无法进入暖调闲聚:', err);
        if (roomGroup) roomGroup.visible = true;
        setBarSceneVisible(false);
        restoreRoomAtmosphere();
        isBarSceneActive = false;
        currentPlayerRoomId = 'bedroom';
        if (needsFadeIn) await fadeFromBlack();
    } finally {
        controlsModule?.setMovementLocked?.(false);
        barTransitionInProgress = false;
    }
}

async function exitBarScene() {
    if (isDanceFlowActive()) return;
    if (barTransitionInProgress) return;
    barTransitionInProgress = true;
    controlsModule?.setMovementLocked?.(true);
    let needsFadeIn = false;

    try {
        await fadeToBlack();
        needsFadeIn = true;
        isBarSceneActive = false;
        setBarSceneVisible(false);
        if (roomGroup) roomGroup.visible = true;
        restoreRoomAtmosphere();
        currentPlayerRoomId = 'bedroom';

        camera.position.set(-2.2, 1.6, 1.55);
        camera.lookAt(new THREE.Vector3(-2.2, 1.25, 0.25));
        camera.updateMatrixWorld(true);
        controlsModule?.setColliders(getActivePlayerColliders());
        controlsModule?.resolveCameraCollisions?.();

        setCharacterNavigationScope(charData, {
            roomId: 'bedroom',
            bounds: oldRoomBounds,
            waypoints: charData.originalBedroomWaypoints || charData.waypoints || [],
            colliders: getActiveBedroomCharacterColliders()
        });
        forceCharacterIntoRoom(charData, 'bedroom', { x: -1.35, z: 1.45, rotationY: -Math.PI });

        await fadeFromBlack();
        needsFadeIn = false;
    } catch (err) {
        console.error('[BarScene] 返回卧室失败:', err);
        if (roomGroup) roomGroup.visible = true;
        restoreRoomAtmosphere();
        if (needsFadeIn) await fadeFromBlack();
    } finally {
        controlsModule?.setMovementLocked?.(false);
        barTransitionInProgress = false;
    }
}

function easeInOutCubic(t) {
    const x = Math.max(0, Math.min(1, t));
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function updateDreamDoor(delta) {
    if (!dreamDoorMesh || !dreamDoorClosedPosition || !dreamDoorOpenPosition) return;
    if (!dreamDoorAnimating) return;
    dreamDoorAnimationTime += delta;
    const duration = 0.82;
    const t = easeInOutCubic(dreamDoorAnimationTime / duration);
    const value = THREE.MathUtils.lerp(dreamDoorAnimationFrom, dreamDoorAnimationTo, t);
    dreamDoorMesh.position.lerpVectors(dreamDoorClosedPosition, dreamDoorOpenPosition, value);
    if (dreamDoorAnimationTime >= duration) {
        dreamDoorMesh.position.copy(isDreamDoorOpen ? dreamDoorOpenPosition : dreamDoorClosedPosition);
        dreamDoorMesh.visible = !isDreamDoorOpen;
        dreamDoorAnimating = false;
    }
}

function toggleDreamDoor() {
    if (!dreamDoorMesh || !dreamDoorClosedPosition || !dreamDoorOpenPosition) return;
    dreamDoorMesh.visible = true;
    const currentProgress = dreamDoorClosedPosition.distanceTo(dreamDoorOpenPosition) > 0.001
        ? dreamDoorMesh.position.distanceTo(dreamDoorClosedPosition) / dreamDoorClosedPosition.distanceTo(dreamDoorOpenPosition)
        : Number(isDreamDoorOpen);
    isDreamDoorOpen = !isDreamDoorOpen;
    dreamDoorAnimating = true;
    dreamDoorAnimationTime = 0;
    dreamDoorAnimationFrom = THREE.MathUtils.clamp(currentProgress, 0, 1);
    dreamDoorAnimationTo = isDreamDoorOpen ? 1 : 0;
    refreshCollisionScopesAfterDreamDoorChange();
}

function refreshCharacterRoomScope(force = false) {
    if (!charData || !oldRoomBounds || !dreamRoomBounds) return;
    if (isBarSceneActive) {
        if (!force && currentPlayerRoomId === BAR_ROOM_ID) return;
        currentPlayerRoomId = BAR_ROOM_ID;
        setCharacterNavigationScope(charData, {
            roomId: BAR_ROOM_ID,
            bounds: getBarBounds(),
            waypoints: getBarWaypoints(),
            colliders: getBarCharacterColliders()
        });
        return;
    }
    const roomId = getRoomIdForPosition(camera.position);
    if (!force && roomId === currentPlayerRoomId) return;
    currentPlayerRoomId = roomId;

    if (roomId === 'dream') {
        const waypoints = [...dreamRoomWaypoints, ...getDreamFurnitureWaypoints()];
        const charPos = getCharacterPosition(charData);
        setCharacterNavigationScope(charData, {
            roomId: 'dream',
            bounds: dreamRoomBounds,
            waypoints,
            colliders: getActiveDreamCharacterColliders()
        });
        if (getRoomIdForPosition(charPos) !== 'dream') {
            const walked = !force && moveCharacterToWaypoint(
                charData,
                { name: 'bedroom_to_dream_door', roomId: 'bedroom', position: new THREE.Vector3(2.35, 0, 0.65), isFurniture: false, ignoreCollision: true },
                { nextWaypoints: [{ name: 'dream_entry_follow', roomId: 'dream', position: new THREE.Vector3(4.35, 0, 0.65), isFurniture: false, ignoreCollision: true }] }
            );
            if (!walked) forceCharacterIntoRoom(charData, 'dream', { x: 4.35, z: 0.65, rotationY: Math.PI / 2 });
        }
    } else {
        const charPos = getCharacterPosition(charData);
        setCharacterNavigationScope(charData, {
            roomId: 'bedroom',
            bounds: oldRoomBounds,
            waypoints: charData.originalBedroomWaypoints || charData.waypoints || [],
            colliders: getActiveBedroomCharacterColliders()
        });
        if (getRoomIdForPosition(charPos) !== 'bedroom') {
            const walked = !force && moveCharacterToWaypoint(
                charData,
                { name: 'dream_to_bedroom_door', roomId: 'dream', position: new THREE.Vector3(4.35, 0, 0.65), isFurniture: false, ignoreCollision: true },
                { nextWaypoints: [{ name: 'bedroom_entry_follow', roomId: 'bedroom', position: new THREE.Vector3(1.6, 0, 0.35), isFurniture: false, ignoreCollision: true }] }
            );
            if (!walked) forceCharacterIntoRoom(charData, 'bedroom', { x: 1.6, z: 0.35, rotationY: -Math.PI / 2 });
        }
    }
}

function updateWindowSky() {
    if ((!windowMesh || !windowMesh.material) && (!dreamWindowMesh || !dreamWindowMesh.material)) return;
    const info = getGameTimeInfo({ quantize: 1 });
    const minutes = info.hour * 60 + info.minute;
    const sunriseStart = 5 * 60;
    const sunriseEnd = 7 * 60 + 30;
    const sunsetStart = 17 * 60 + 30;
    const sunsetEnd = 20 * 60;
    let dayFactor;
    if (minutes < sunriseStart || minutes >= sunsetEnd) {
        dayFactor = 0;
    } else if (minutes < sunriseEnd) {
        dayFactor = (minutes - sunriseStart) / (sunriseEnd - sunriseStart);
    } else if (minutes < sunsetStart) {
        dayFactor = 1;
    } else {
        dayFactor = 1 - (minutes - sunsetStart) / (sunsetEnd - sunsetStart);
    }
    dayFactor = Math.max(0, Math.min(1, dayFactor));
    const night = new THREE.Color(0x02040d);
    const day = new THREE.Color(0x88bbff);
    const color = night.clone().lerp(day, dayFactor);
    applyWindowSkyColor(windowMesh, color);
    applyWindowSkyColor(dreamWindowMesh, color);
}

function applyWindowSkyColor(mesh, color) {
    if (!mesh?.material) return;
    mesh.material.color.copy(color);
    if (mesh.material.emissive) {
        mesh.material.emissive.copy(color);
        mesh.material.emissiveIntensity = 0.3;
    }
}

function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    const timeUpdate = updateGameTime(delta);
    if (timeUpdate.displayChanged || timeUpdate.salary > 0) {
        updateGameHud(false, timeUpdate.salary);
        evaluateAchievements();
    }
    updateWindowSky();
    updateDreamDoor(delta);
    updateDreamFurnitureCinematic(delta);
    updateRoomPanorama();

    if (controlsModule) {
        if (!isSleeping && !dreamCinematic && !isRoomPanoramaActive()) {
            controlsModule.update(delta);
            constrainPendingRevisionPlayer();
        }
    }

    if (charData) {
        if (!isSleeping && !dreamCinematic && !isRoomPanoramaActive()) {
            if (isDanceFlowActive()) {
                updateDanceSystem(delta);
            } else if (!startupInteractionStarted) {
                updateBlink(charData, delta);
            } else if (startupWelcomePending) {
                updateCharacter(charData, delta);
                if (startupWelcomeStarted && charData.state !== 'waving') {
                    startupWelcomePending = false;
                }
            } else {
                refreshCharacterRoomScope();
                updateCharacter(charData, delta);
            }
        }
        if (!dreamCinematic) updateInteractionPrompt();
    }

    renderer.render(scene, camera);
}

function updateInteractionPrompt() {
    const prompt = document.getElementById('interaction-prompt');
    const paintingPrompt = document.getElementById('painting-prompt');
    const dreamPaintingPrompt = document.getElementById('dream-painting-prompt');
    const hideActionPrompts = () => {
        prompt.classList.add('hidden');
        if (paintingPrompt) {
            paintingPrompt.classList.add('hidden');
            paintingPrompt.classList.remove('is-disabled');
        }
        if (dreamPaintingPrompt) dreamPaintingPrompt.classList.add('hidden');
    };
    if (isDreamRevisionPending()) {
        hideActionPrompts();
        return;
    }
    if (isRoomPanoramaActive()) {
        hideActionPrompts();
        return;
    }
    if (isSleeping || isInteracting || isDialogueVisible() || isDatePanelVisible() || isGiftOverlayVisible() || isDreamOverlayVisible() || isDanceOverlayVisible()) {
        hideActionPrompts();
        return;
    }

    if (!controlsModule || !controlsModule.state.isLocked) {
        hideActionPrompts();
        return;
    }

    const charPos = getCharacterPosition(charData);
    const nearChar = controlsModule.isNearCharacter(charPos);
    const lookPaint = isLookingAtPainting();
    const lookWardrobe = isLookingAtWardrobe();

    if (nearChar && !isDanceFlowActive()) {
        prompt.innerHTML = '按 <kbd>F</kbd> 与芙提雅对话';
        prompt.dataset.promptKey = 'KeyF';
        prompt.classList.remove('hidden');
    } else {
        prompt.classList.add('hidden');
    }

    if (paintingPrompt) {
        dreamPaintingPrompt?.classList.add('hidden');
        const lookBarExit = isLookingAtBarExit();
        const lookBarDance = isLookingAtBarDancePlane();
        const lookDreamDoor = isLookingAtDreamDoor();
        const lookBed = isLookingAtBed();
        const lookDesk = isLookingAtDesk();
        const lookDoor = isLookingAtDoor();
        const lookDreamTerminal = !isBarSceneActive && isLookingAtDreamTerminal(camera);
        const lookDreamFurniture = !isBarSceneActive && isLookingAtDreamFurniture(camera);
        const lookTerminal = isLookingAtTerminal();
        const lookCollectionCabinet = isLookingAtCollectionCabinet();
        paintingPrompt.classList.remove('is-disabled');
        if (lookBarDance && !isDanceFlowActive()) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 观看跳舞';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookBarExit) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 返回宿舍';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookDreamDoor) {
            paintingPrompt.innerHTML = getDreamDoorPromptText();
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookDreamTerminal) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 打开造梦终端';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
            if (dreamPaintingPrompt) {
                dreamPaintingPrompt.innerHTML = '按 <kbd>1</kbd> 拍摄房间';
                dreamPaintingPrompt.dataset.promptKey = 'Digit1';
                dreamPaintingPrompt.classList.remove('hidden');
            }
        } else if (lookDreamFurniture) {
            const dreamFurnitureId = getLookingDreamFurniture(camera);
            const furnitureName = getDreamFurnitureLabel(dreamFurnitureId);
            paintingPrompt.innerHTML = `按 <kbd>E</kbd> 管理 [${furnitureName}]`;
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
            if (isDreamPaintingFurniture(dreamFurnitureId) && dreamPaintingPrompt) {
                dreamPaintingPrompt.innerHTML = '按 <kbd>1</kbd> 替换图片';
                dreamPaintingPrompt.dataset.promptKey = 'Digit1';
                dreamPaintingPrompt.classList.remove('hidden');
            }
        } else if (lookTerminal) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 打开购物终端';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookCollectionCabinet) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 打开礼物收藏';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookPaint) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 更换挂画';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookWardrobe) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 换装';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookBed) {
            if (isSmallTeacherModel()) {
                paintingPrompt.innerHTML = '<span style="opacity:0.4;cursor:not-allowed;">按 <kbd>E</kbd> 休息 <small style="font-size:0.75em;">(该装扮不可用)</small></span>';
            } else {
                paintingPrompt.innerHTML = '按 <kbd>E</kbd> 休息';
            }
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookDesk) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 开始今日约会行程';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else if (lookDoor) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 前往暖调闲聚';
            paintingPrompt.dataset.promptKey = 'KeyE';
            paintingPrompt.classList.remove('hidden');
        } else {
            paintingPrompt.classList.add('hidden');
        }
        if (lookBarExit && isDanceFlowActive() && !paintingPrompt.classList.contains('hidden')) {
            paintingPrompt.innerHTML = '按 <kbd>E</kbd> 返回宿舍';
            delete paintingPrompt.dataset.promptKey;
            paintingPrompt.classList.add('is-disabled');
        }
    }

    stackPromptButtons(prompt, paintingPrompt, dreamPaintingPrompt);
}

function stackPromptButtons(...prompts) {
    let row = 0;
    for (const prompt of prompts.slice().reverse()) {
        if (!prompt || prompt.classList.contains('hidden')) continue;
        prompt.style.bottom = `calc(24% + ${row * 56}px)`;
        prompt.dataset.shifted = '';
        row += 1;
    }
}

function initPromptButtons() {
    const prompt = document.getElementById('interaction-prompt');
    const paintingPrompt = document.getElementById('painting-prompt');
    const dreamPaintingPrompt = document.getElementById('dream-painting-prompt');

    function handlePromptTap(e, promptEl, fallbackCode) {
        e.preventDefault();
        e.stopPropagation();
        if (promptEl?.classList?.contains('is-disabled')) return;
        const keyCode = promptEl?.dataset?.promptKey || fallbackCode;
        onKeyDown({ code: keyCode });
    }

    prompt.addEventListener('click', (e) => {
        if (prompt.classList.contains('hidden')) return;
        handlePromptTap(e, prompt, 'KeyF');
    });
    prompt.addEventListener('touchend', (e) => {
        if (prompt.classList.contains('hidden')) return;
        handlePromptTap(e, prompt, 'KeyF');
    }, { passive: false });

    paintingPrompt.addEventListener('click', (e) => {
        if (paintingPrompt.classList.contains('hidden')) return;
        handlePromptTap(e, paintingPrompt, 'KeyE');
    });
    paintingPrompt.addEventListener('touchend', (e) => {
        if (paintingPrompt.classList.contains('hidden')) return;
        handlePromptTap(e, paintingPrompt, 'KeyE');
    }, { passive: false });

    dreamPaintingPrompt?.addEventListener('click', (e) => {
        if (dreamPaintingPrompt.classList.contains('hidden')) return;
        handlePromptTap(e, dreamPaintingPrompt, 'Digit1');
    });
    dreamPaintingPrompt?.addEventListener('touchend', (e) => {
        if (dreamPaintingPrompt.classList.contains('hidden')) return;
        handlePromptTap(e, dreamPaintingPrompt, 'Digit1');
    }, { passive: false });
}

/* ===== 按键提示「点燃」效果 =====
   触控点击提示按钮会经 handlePromptTap → onKeyDown，物理按键也走 onKeyDown，
   因此只需在 onKeyDown 顶部按键位点亮当前可见的对应提示，触控/按键统一覆盖。 */
function normalizePromptKey(code) {
    if (code === 'Numpad1') return 'Digit1';
    if (code === 'Numpad2') return 'Digit2';
    return code;
}

function firstVisiblePromptForKey(ids, code) {
    const expected = normalizePromptKey(code);
    for (const id of ids) {
        const el = document.getElementById(id);
        const promptKey = normalizePromptKey(el?.dataset?.promptKey || '');
        if (el && promptKey === expected && el.getClientRects().length > 0) return el;
    }
    return null;
}

function ignitePrompt(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    el.classList.add('igniting');
    setTimeout(() => el.classList.remove('igniting'), 560);
    const burst = document.createElement('div');
    burst.className = 'ignite-burst';
    burst.style.left = `${rect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 650);
}

function igniteForKey(code) {
    let el = null;
    if (code === 'KeyF') {
        el = firstVisiblePromptForKey(['interaction-prompt', 'btn-pet'], code);
    } else if (code === 'KeyE') {
        el = firstVisiblePromptForKey(['painting-prompt', 'interaction-prompt', 'btn-wake', 'room-panorama-close'], code);
    } else if (code === 'Digit1' || code === 'Numpad1') {
        if (!isRoomPanoramaActive()) {
            el = firstVisiblePromptForKey(['dance-replay', 'dream-revision-confirm', 'dream-painting-prompt'], code);
        }
    } else if (code === 'Digit2' || code === 'Numpad2') {
        el = firstVisiblePromptForKey(['dance-curtain', 'dream-revision-rollback'], code);
    }
    if (el) ignitePrompt(el);
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
        if (consumeDreamPaintingTextureFile(file)) {
            fileInput.value = '';
            return;
        }
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

function isSmallTeacherModel(path = currentModelPath) {
    return String(path || '').includes('国主驾到') || String(path || '').includes('small_king');
}

function openModelSelector() {
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
    controlsModule.releaseControlMode({ resumeOnClose: true });
}

function closeModelSelector() {
    document.getElementById('model-selector').classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'model-selector' } }));
}

async function selectModel(model) {
    if (model.path === currentModelPath || isSwapping) return;
    isSwapping = true;
    closeModelSelector();
    const previousModelPath = currentModelPath;

    try {
        setSittingEnabled(charData, !isSmallTeacherModel(model.path));
        await swapModel(scene, charData, model.path);
        currentModelPath = model.path;
        setSittingEnabled(charData, !isSmallTeacherModel(currentModelPath));
        recordModelUsed(model.path);
    } catch (err) {
        setSittingEnabled(charData, !isSmallTeacherModel(previousModelPath));
        console.error('Model swap failed:', err);
    } finally {
        isSwapping = false;
    }
}

async function swapToDanceModel(modelPath) {
    if (!modelPath || modelPath === currentModelPath || isSwapping) return;
    isSwapping = true;
    const previousModelPath = currentModelPath;

    try {
        setSittingEnabled(charData, !isSmallTeacherModel(modelPath));
        await swapModel(scene, charData, modelPath);
        currentModelPath = modelPath;
        setSittingEnabled(charData, !isSmallTeacherModel(currentModelPath));
        recordModelUsed(modelPath);
    } catch (err) {
        setSittingEnabled(charData, !isSmallTeacherModel(previousModelPath));
        console.error('Dance model swap failed:', err);
        throw err;
    } finally {
        isSwapping = false;
    }
}

function placeCharacterAtStage(pose = {}) {
    if (!charData?.root) return;
    const x = Number.isFinite(pose.x) ? pose.x : 0;
    const z = Number.isFinite(pose.z) ? pose.z : 35.6;
    setCharacterNavigationScope(charData, {
        roomId: BAR_ROOM_ID,
        bounds: getBarBounds(),
        waypoints: [],
        colliders: []
    });
    forceCharacterIntoRoom(charData, BAR_ROOM_ID, {
        x,
        z,
        rotationY: Number.isFinite(pose.rotationY) ? pose.rotationY : 0
    });
}

function restoreCharacterAfterDance(pose = {}) {
    if (!charData?.root) return;
    setCharacterNavigationScope(charData, {
        roomId: BAR_ROOM_ID,
        bounds: getBarBounds(),
        waypoints: getBarWaypoints(),
        colliders: getBarCharacterColliders()
    });
    forceCharacterIntoRoom(charData, BAR_ROOM_ID, {
        x: Number.isFinite(pose.x) ? pose.x : 0,
        z: Number.isFinite(pose.z) ? pose.z : 35.6,
        rotationY: Number.isFinite(pose.rotationY) ? pose.rotationY : 0
    });
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
    if (isBarSceneActive) return false;
    if (!bedMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(bedMesh, true);
    return hits.length > 0 && hasClearLineOfSight(hits[0].point, hits[0].distance);
}

function isLookingAtDesk() {
    if (isBarSceneActive) return false;
    if (!deskMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(deskMesh);
    return hits.length > 0 && hasClearLineOfSight(hits[0].point, hits[0].distance);
}

function isLookingAtDoor() {
    if (isBarSceneActive) return false;
    if (!doorMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(doorMesh);
    return hits.length > 0 && hasClearLineOfSight(hits[0].point, hits[0].distance);
}

function isLookingAtTerminal() {
    if (isBarSceneActive) return false;
    if (!terminalMesh || !camera) return false;
    const centerX = terminalMesh.userData?.interactionCenter?.x ?? terminalMesh.position.x;
    if (camera.position.x > centerX + 0.02) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(terminalMesh, true);
    if (hits.length > 0) return hasClearLineOfSight(hits[0].point, hits[0].distance);
    return isLookingAtPoint(terminalMesh, 0.68, 5) && hasClearLineOfSightToObject(terminalMesh);
}

function isLookingAtCollectionCabinet() {
    if (isBarSceneActive) return false;
    if (!collectionCabinetMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(collectionCabinetMesh, true);
    if (hits.length > 0) return hasClearLineOfSight(hits[0].point, hits[0].distance);
    return isLookingAtPoint(collectionCabinetMesh, 0.78, 5) && hasClearLineOfSightToObject(collectionCabinetMesh);
}

function isLookingAtDreamDoor() {
    if (isBarSceneActive) return false;
    if (!dreamDoorInteractionMesh || !camera) return false;
    const oldFar = raycaster.far;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 5;
    const hits = raycaster.intersectObject(dreamDoorInteractionMesh, true);
    raycaster.far = oldFar;
    return hits.length > 0 && hasClearLineOfSight(hits[0].point, hits[0].distance);
}

function isLookingAtBarExit() {
    if (!isBarSceneActive || !camera) return false;
    const exitMesh = getBarExitInteractionMesh();
    if (!exitMesh) return false;
    const oldFar = raycaster.far;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 12;
    const hits = raycaster.intersectObject(exitMesh, true);
    raycaster.far = oldFar;
    return hits.length > 0;
}

function isLookingAtBarDancePlane() {
    if (!isBarSceneActive || !camera) return false;
    const danceMesh = getBarDanceInteractionMesh();
    if (!danceMesh) return false;
    const oldFar = raycaster.far;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 40;
    const hits = raycaster.intersectObject(danceMesh, true);
    raycaster.far = oldFar;
    return hits.length > 0;
}

function getDreamDoorPromptText() {
    if (isDreamDoorOpen) return '按 <kbd>E</kbd> 关门';
    return getRoomIdForPosition(camera.position) === 'dream'
        ? '按 <kbd>E</kbd> 打开卧室门'
        : '按 <kbd>E</kbd> 打开造梦空间';
}

function isLookingAtPoint(target, radius = 0.5, maxDistance = 4) {
    if (!target || !camera) return false;

    if (target.userData?.interactionCenter) {
        lookTarget.copy(target.userData.interactionCenter);
    } else {
        target.getWorldPosition(lookTarget);
    }
    camera.getWorldDirection(lookDirection);

    const toTarget = lookTarget.sub(camera.position);
    const distance = toTarget.length();
    if (distance <= 0.001 || distance > maxDistance) return false;

    const forwardDistance = toTarget.dot(lookDirection);
    if (forwardDistance <= 0) return false;

    const perpendicularSq = Math.max(0, distance * distance - forwardDistance * forwardDistance);
    return Math.sqrt(perpendicularSq) <= radius;
}

function getInteractionPoint(target, out) {
    if (target.userData?.interactionCenter) {
        out.copy(target.userData.interactionCenter);
    } else {
        target.getWorldPosition(out);
    }
    return out;
}

function hasClearLineOfSightToObject(target) {
    getInteractionPoint(target, lookTarget);
    return hasClearLineOfSight(lookTarget, lookTarget.distanceTo(camera.position));
}

function hasClearLineOfSight(targetPoint, targetDistance) {
    if (!camera || !targetPoint || !Number.isFinite(targetDistance) || targetDistance <= 0.001) return false;
    occlusionRay.origin.copy(camera.position);
    occlusionRay.direction.copy(targetPoint).sub(camera.position);
    const rayLength = occlusionRay.direction.length();
    if (rayLength <= 0.001) return false;
    occlusionRay.direction.divideScalar(rayLength);

    for (const collider of getActivePlayerColliders()) {
        if (!collider) continue;
        if (collider.containsPoint?.(targetPoint)) continue;
        const hit = occlusionRay.intersectBox(collider, occlusionPoint);
        if (!hit) continue;
        const distance = hit.distanceTo(camera.position);
        if (distance > 0.04 && distance < targetDistance - 0.05) return false;
    }
    return true;
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
    const dreamPaintingPrompt = document.getElementById('dream-painting-prompt');
    if (dreamPaintingPrompt) dreamPaintingPrompt.classList.add('hidden');
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
    addAffinity(1);
    recordHeadPat();

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
    if (isBarSceneActive) return false;
    if (!paintingMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(paintingMesh);
    return hits.length > 0 && hasClearLineOfSight(hits[0].point, hits[0].distance);
}

function isLookingAtWardrobe() {
    if (isBarSceneActive) return false;
    if (!wardrobeMesh || !camera) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = raycaster.intersectObject(wardrobeMesh);
    return hits.length > 0 && hasClearLineOfSight(hits[0].point, hits[0].distance);
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
    const gameState = exportGameState();
    const data = {
        version: 2,
        exportedAt: Date.now(),
        exportedGameTime: gameState.gameTime,
        gameState,
        money: gameState.money,
        affinity: gameState.affinity,
        stats: gameState.stats,
        achievements: exportAchievements(),
        gifts: gameState.gifts,
        dreamFurniture: exportDreamFurniture(),
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
            const importResult = importGameState(data, { suppressEvent: true });
            const dreamImport = importDreamFurniture(data.dreamFurniture || data.gameState?.dreamFurniture || []);
            importAchievements(data.achievements);
            refreshAchievementsFromImport();
            refreshDreamFurnitureAfterImport();
            updateGameHud(true);
            renderGiftCollection();
            alert(`导入成功！礼物同步新增 ${importResult.giftsAdded || 0} 条，造梦家具新增 ${dreamImport.added || 0} 件，跳过 ${dreamImport.skipped || 0} 件。刷新页面以应用设置。`);
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
