import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js';
import { recordDanceWatched } from './game_state.js';

const DANCE_STAGE_POSE = Object.freeze({ x: 0, z: 35.6, rotationY: 0 });
const DANCE_CHOICE_TIMEOUT_MS = 5000;
// Manual tuning parameter: target world Y for the dancer's lowest point at the stage start.
// Lower it if the dancer floats; raise it if the feet sink into the stage.
const DANCE_STAGE_Y_OFFSET = 0.52;
const LOVE_LEE_PRESET = Object.freeze({
    title: 'Love Lee',
    vmdPath: 'src/_vmd/love_lee/love_lee.vmd',
    audioPath: 'src/_vmd/love_lee/love_lee_bgm.wav'
});

const els = {};
const state = {
    initialized: false,
    options: {},
    selectedModelPath: '',
    vmdFile: null,
    vmdPreset: null,
    audioFile: null,
    audioPreset: null,
    audioUrl: null,
    audio: null,
    clip: null,
    helper: null,
    helperMesh: null,
    mode: 'idle',
    elapsed: 0,
    duration: 0,
    danceCoordinate: null,
    dancePoseSnapshot: null,
    danceScale: null,
    choiceTimer: null,
    busy: false
};

export function initDanceSystem(options = {}) {
    state.options = options;
    cacheElements();
    if (!els.panel || state.initialized) return;
    state.initialized = true;
    bindEvents();
    state.selectedModelPath = options.getCurrentModelPath?.() || '';
    renderModelChoices();
    refreshFileSummaries();
    setStatus('导入 VMD 动作后即可开场。');
}

function cacheElements() {
    els.panel = document.getElementById('dance-panel');
    els.close = document.getElementById('dance-close');
    els.vmdInput = document.getElementById('dance-vmd-file');
    els.audioInput = document.getElementById('dance-audio-file');
    els.vmdPick = document.getElementById('dance-vmd-pick');
    els.audioPick = document.getElementById('dance-audio-pick');
    els.presetStage = document.getElementById('dance-preset-stage');
    els.vmdName = document.getElementById('dance-vmd-name');
    els.audioName = document.getElementById('dance-audio-name');
    els.modelList = document.getElementById('dance-model-list');
    els.start = document.getElementById('dance-start-btn');
    els.status = document.getElementById('dance-status');
    els.choiceBar = document.getElementById('dance-curtain-bar');
    els.replay = document.getElementById('dance-replay');
    els.curtain = document.getElementById('dance-curtain');
}

function bindEvents() {
    els.close?.addEventListener('click', () => closeDancePanel());
    els.vmdPick?.addEventListener('click', () => els.vmdInput?.click());
    els.audioPick?.addEventListener('click', () => els.audioInput?.click());
    els.presetStage?.addEventListener('click', loadLoveLeePreset);
    els.presetStage?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        loadLoveLeePreset();
    });
    els.vmdInput?.addEventListener('change', handleVmdFileChanged);
    els.audioInput?.addEventListener('change', handleAudioFileChanged);
    els.start?.addEventListener('click', () => { void startDanceFromPanel(); });
    els.replay?.addEventListener('click', () => dispatchPromptAction('Digit1'));
    els.curtain?.addEventListener('click', () => dispatchPromptAction('Digit2'));
}

function dispatchPromptAction(code) {
    document.dispatchEvent(new CustomEvent('fritia-action', { detail: { code } }));
}

function getModels() {
    const models = state.options.getModels?.() || state.options.models || [];
    return Array.isArray(models) ? models : [];
}

function renderModelChoices() {
    if (!els.modelList) return;
    const models = getModels();
    const current = state.options.getCurrentModelPath?.() || models[0]?.path || '';
    if (!state.selectedModelPath || !models.some(model => model.path === state.selectedModelPath)) {
        state.selectedModelPath = current;
    }
    els.modelList.innerHTML = '';
    for (const model of models) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `dance-model-card${model.path === state.selectedModelPath ? ' active' : ''}`;
        item.innerHTML = `
            <span class="dance-model-card__mark"></span>
            <span class="dance-model-card__name">${escapeHtml(model.name || 'Fritia')}</span>
        `;
        item.addEventListener('click', () => {
            state.selectedModelPath = model.path;
            renderModelChoices();
        });
        els.modelList.appendChild(item);
    }
}

function handleVmdFileChanged(event) {
    const file = event.target.files?.[0] || null;
    state.vmdFile = file;
    state.vmdPreset = null;
    state.clip = null;
    refreshFileSummaries();
    setStatus(file ? 'VMD 动作已就绪，选择模型后即可加载。' : '导入 VMD 动作后即可开场。');
}

function handleAudioFileChanged(event) {
    const file = event.target.files?.[0] || null;
    state.audioFile = file;
    state.audioPreset = null;
    releaseAudioUrl();
    refreshFileSummaries();
}

function loadLoveLeePreset() {
    if (state.busy || state.mode !== 'idle') return;
    state.vmdFile = null;
    state.audioFile = null;
    state.vmdPreset = { name: `${LOVE_LEE_PRESET.title}.vmd`, path: LOVE_LEE_PRESET.vmdPath };
    state.audioPreset = { name: `${LOVE_LEE_PRESET.title}.wav`, path: LOVE_LEE_PRESET.audioPath };
    state.clip = null;
    releaseAudioUrl();
    if (els.vmdInput) els.vmdInput.value = '';
    if (els.audioInput) els.audioInput.value = '';
    refreshFileSummaries();
    setStatus(`${LOVE_LEE_PRESET.title} 预设舞曲已就绪，选择模型后即可开场。`, 'busy');
}

function refreshFileSummaries() {
    if (els.vmdName) {
        els.vmdName.textContent = state.vmdFile
            ? compactFileName(state.vmdFile.name)
            : state.vmdPreset
                ? compactFileName(state.vmdPreset.name)
                : '未选择 VMD';
    }
    if (els.audioName) {
        els.audioName.textContent = state.audioFile
            ? compactFileName(state.audioFile.name)
            : state.audioPreset
                ? compactFileName(state.audioPreset.name)
                : '可选音频';
    }
    if (els.start) els.start.disabled = !(state.vmdFile || state.vmdPreset) || state.busy;
}

function compactFileName(name) {
    const value = String(name || '').trim();
    if (value.length <= 30) return value || '未命名文件';
    return `${value.slice(0, 16)}...${value.slice(-10)}`;
}

function setStatus(message, tone = 'info') {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.tone = tone;
}

export function openDancePanel() {
    if (!els.panel || state.mode !== 'idle' || state.busy) return false;
    resetImportedFiles();
    state.selectedModelPath = state.options.getCurrentModelPath?.() || state.selectedModelPath;
    renderModelChoices();
    refreshFileSummaries();
    els.panel.classList.remove('hidden');
    state.options.controlsModule?.releaseControlMode?.({ resumeOnClose: true });
    return true;
}

export function closeDancePanel(options = {}) {
    if (!els.panel || (state.busy && !options.force)) return false;
    els.panel.classList.add('hidden');
    if (options.dispatch !== false) {
        document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'dance-panel' } }));
    }
    return true;
}

export function isDanceOverlayVisible() {
    return Boolean(els.panel && !els.panel.classList.contains('hidden'));
}

export function isDanceFlowActive() {
    return state.mode === 'loading' || state.mode === 'playing' || state.mode === 'choice';
}

export function isDanceChoiceVisible() {
    return state.mode === 'choice';
}

export function updateDanceSystem(delta) {
    if (state.mode !== 'playing') return;
    lockDanceScale();
    prepareRawDanceCoordinates();
    try {
        state.helper?.update(delta);
    } catch (err) {
        console.error('[DanceSystem] VMD playback failed:', err);
        finishPlayback();
        return;
    }
    captureRawDanceCoordinates();
    lockDanceScale();
    applyDanceDisplayCoordinates();
    state.elapsed += delta;
    if (state.elapsed >= state.duration) finishPlayback();
}

async function startDanceFromPanel() {
    if (state.busy || !(state.vmdFile || state.vmdPreset) || !state.options.getCharacterData?.()) return;
    state.busy = true;
    state.mode = 'loading';
    refreshFileSummaries();
    setStatus('正在装载舞曲与动作...', 'busy');
    closeDancePanel({ force: true });
    state.options.controlsModule?.forceEnterControlMode?.();

    try {
        await ensureSelectedModel();
        state.clip = await loadVmdClip();
        playLoadedDance();
    } catch (err) {
        console.error('[DanceSystem] unable to start dance:', err);
        state.mode = 'idle';
        state.busy = false;
        openDancePanel();
        setStatus(`加载失败：${formatError(err)}`, 'error');
        refreshFileSummaries();
        return;
    } finally {
        state.busy = false;
        refreshFileSummaries();
    }
}

async function ensureSelectedModel() {
    const current = state.options.getCurrentModelPath?.() || '';
    const next = state.selectedModelPath || current;
    if (!next || next === current) return;
    setStatus('正在切换舞台模型...', 'busy');
    await state.options.swapToModel?.(next);
}

function loadVmdClip() {
    const cd = state.options.getCharacterData?.();
    if (!cd?.mesh) return Promise.reject(new Error('角色模型尚未加载'));
    if (!state.vmdFile && !state.vmdPreset) return Promise.reject(new Error('请选择 VMD 动作文件'));

    const loader = new MMDLoader();
    const usingObjectUrl = Boolean(state.vmdFile);
    const url = usingObjectUrl ? URL.createObjectURL(state.vmdFile) : state.vmdPreset.path;
    return new Promise((resolve, reject) => {
        loader.loadAnimation(
            url,
            cd.mesh,
            (clip) => {
                if (usingObjectUrl) URL.revokeObjectURL(url);
                if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) {
                    reject(new Error('VMD 动作时长无效'));
                    return;
                }
                resolve(clip);
            },
            undefined,
            (err) => {
                if (usingObjectUrl) URL.revokeObjectURL(url);
                reject(err);
            }
        );
    });
}

function playLoadedDance() {
    const cd = state.options.getCharacterData?.();
    if (!cd?.mesh || !state.clip) return false;

    clearChoiceTimer();
    hideChoiceBar();
    releaseAudioUrl();
    clearDanceCoordinate();
    restoreDancePoseSnapshot();
    removeHelperObject();
    state.options.onDanceStart?.(DANCE_STAGE_POSE);
    state.options.placeCharacterAtStage?.(DANCE_STAGE_POSE);
    captureDanceScale(cd);
    captureDancePoseSnapshot(cd);

    state.helper = new MMDAnimationHelper({ afterglow: 0.0 });
    state.helperMesh = cd.mesh;
    state.helper.add(cd.mesh, { animation: state.clip, physics: false });
    lockDanceScale();
    state.helper.update(0);
    lockDanceScale();
    configureDanceCoordinateFromCurrentPose();
    lockDanceScale();
    state.duration = Math.max(0.25, Number(state.clip.duration) || 0.25);
    state.elapsed = 0;
    state.mode = 'playing';
    document.body.classList.add('dance-flow-active');
    startAudio();
    return true;
}

function finishPlayback() {
    if (state.mode !== 'playing') return;
    stopAudio();
    recordDanceWatched();
    prepareRawDanceCoordinates();
    lockDanceScale();
    removeHelperObject();
    restoreDancePoseSnapshot();
    lockDanceScale();
    state.options.placeCharacterAtStage?.(DANCE_STAGE_POSE);
    state.options.applyIdlePose?.(state.options.getCharacterData?.());
    configureDanceCoordinateFromCurrentPose();
    lockDanceScale();
    state.mode = 'choice';
    showChoiceBar();
    clearChoiceTimer();
    state.choiceTimer = setTimeout(() => finishDanceFlow(), DANCE_CHOICE_TIMEOUT_MS);
}

export function replayDance() {
    if (state.mode !== 'choice') return false;
    playLoadedDance();
    return true;
}

export function finishDanceFlow() {
    if (!isDanceFlowActive()) return false;
    clearChoiceTimer();
    hideChoiceBar();
    stopAudio();
    prepareRawDanceCoordinates();
    lockDanceScale();
    removeHelperObject();
    restoreDancePoseSnapshot();
    clearDanceCoordinate();
    if (typeof state.options.onDanceFinished === 'function') {
        state.options.onDanceFinished(DANCE_STAGE_POSE);
    } else {
        state.options.placeCharacterAtStage?.(DANCE_STAGE_POSE);
    }
    state.options.applyIdlePose?.(state.options.getCharacterData?.());
    lockDanceScale();
    clearDanceScale();
    clearDancePoseSnapshot();
    state.mode = 'idle';
    document.body.classList.remove('dance-flow-active');
    return true;
}

function showChoiceBar() {
    els.choiceBar?.classList.remove('hidden');
}

function hideChoiceBar() {
    els.choiceBar?.classList.add('hidden');
}

function clearChoiceTimer() {
    if (state.choiceTimer) {
        clearTimeout(state.choiceTimer);
        state.choiceTimer = null;
    }
}

function resetImportedFiles() {
    state.vmdFile = null;
    state.vmdPreset = null;
    state.audioFile = null;
    state.audioPreset = null;
    state.clip = null;
    releaseAudioUrl();
    if (els.vmdInput) els.vmdInput.value = '';
    if (els.audioInput) els.audioInput.value = '';
    setStatus('导入 VMD 动作后即可开场。');
}

function configureDanceCoordinateFromCurrentPose() {
    const cd = state.options.getCharacterData?.();
    if (!cd?.root) {
        state.danceCoordinate = null;
        return;
    }
    cd.root.updateMatrixWorld(true);
    const rawPosition = cd.root.position.clone();
    const footY = measureDanceFootY(cd);
    const displayYOffset = Number.isFinite(footY)
        ? DANCE_STAGE_Y_OFFSET - footY
        : DANCE_STAGE_Y_OFFSET;
    state.danceCoordinate = {
        rawPosition,
        displayYOffset,
        initialFootY: footY,
        targetFootY: DANCE_STAGE_Y_OFFSET
    };
    applyDanceDisplayCoordinates();
}

function prepareRawDanceCoordinates() {
    const cd = state.options.getCharacterData?.();
    if (!cd?.root || !state.danceCoordinate) return;
    cd.root.position.copy(state.danceCoordinate.rawPosition);
    cd.root.updateMatrixWorld(true);
}

function captureRawDanceCoordinates() {
    const cd = state.options.getCharacterData?.();
    if (!cd?.root || !state.danceCoordinate) return;
    state.danceCoordinate.rawPosition.copy(cd.root.position);
}

function applyDanceDisplayCoordinates() {
    const cd = state.options.getCharacterData?.();
    const coord = state.danceCoordinate;
    if (!cd?.root || !coord) return;
    cd.root.position.copy(coord.rawPosition);
    cd.root.position.y += coord.displayYOffset;
    cd.root.updateMatrixWorld(true);
}

function clearDanceCoordinate() {
    prepareRawDanceCoordinates();
    state.danceCoordinate = null;
}

function measureDanceFootY(cd) {
    if (!cd?.mesh) return NaN;
    cd.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(cd.mesh);
    return box?.min ? box.min.y : NaN;
}

function captureDancePoseSnapshot(cd) {
    if (!cd) {
        state.dancePoseSnapshot = null;
        return;
    }
    state.dancePoseSnapshot = {
        bones: Array.isArray(cd.bones)
            ? cd.bones.map(bone => ({
                bone,
                position: bone.position.clone(),
                quaternion: bone.quaternion.clone(),
                scale: bone.scale.clone()
            }))
            : [],
        morphTargetInfluences: cd.mesh?.morphTargetInfluences
            ? Array.from(cd.mesh.morphTargetInfluences)
            : null
    };
}

function restoreDancePoseSnapshot() {
    const cd = state.options.getCharacterData?.();
    const snapshot = state.dancePoseSnapshot;
    if (!cd || !snapshot) return;
    for (const item of snapshot.bones) {
        if (!item?.bone) continue;
        item.bone.position.copy(item.position);
        item.bone.quaternion.copy(item.quaternion);
        item.bone.scale.copy(item.scale);
    }
    if (snapshot.morphTargetInfluences && cd.mesh?.morphTargetInfluences) {
        const count = Math.min(snapshot.morphTargetInfluences.length, cd.mesh.morphTargetInfluences.length);
        for (let i = 0; i < count; i += 1) {
            cd.mesh.morphTargetInfluences[i] = snapshot.morphTargetInfluences[i];
        }
    }
    cd.skeleton?.update?.();
    cd.mesh?.updateMatrixWorld?.(true);
}

function clearDancePoseSnapshot() {
    state.dancePoseSnapshot = null;
}

function captureDanceScale(cd) {
    if (!cd?.mesh?.scale) {
        state.danceScale = null;
        return;
    }
    state.danceScale = cd.mesh.scale.clone();
}

function lockDanceScale() {
    const cd = state.options.getCharacterData?.();
    if (!state.danceScale || !cd?.mesh?.scale) return;
    cd.mesh.scale.copy(state.danceScale);
    cd.mesh.updateMatrixWorld(true);
}

function clearDanceScale() {
    state.danceScale = null;
}

function startAudio() {
    if (!state.audioFile && !state.audioPreset) return;
    releaseAudioUrl();
    if (state.audioFile) {
        state.audioUrl = URL.createObjectURL(state.audioFile);
        state.audio = new Audio(state.audioUrl);
    } else {
        state.audio = new Audio(state.audioPreset.path);
    }
    state.audio.volume = 0.82;
    state.audio.currentTime = 0;
    state.audio.play().catch((err) => {
        console.warn('[DanceSystem] audio playback was blocked or failed:', err);
    });
}

function stopAudio() {
    if (!state.audio) return;
    state.audio.pause();
    state.audio.currentTime = 0;
    state.audio = null;
}

function releaseAudioUrl() {
    stopAudio();
    if (state.audioUrl) {
        URL.revokeObjectURL(state.audioUrl);
        state.audioUrl = null;
    }
}

function removeHelperObject() {
    if (state.helper && state.helperMesh && typeof state.helper.remove === 'function') {
        try {
            state.helper.remove(state.helperMesh);
        } catch (err) {
            console.warn('[DanceSystem] helper cleanup failed:', err);
        }
    }
    state.helper = null;
    state.helperMesh = null;
}

function formatError(err) {
    if (err?.message) return err.message;
    return '无法解析该动作文件';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
