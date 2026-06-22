import * as THREE from 'three';

const PANORAMA_VIEWS = [
    {
        id: 'northwest',
        camera: new THREE.Vector3(-8.0, 13.0, -10.0),
        target: new THREE.Vector3(5.0, 0.72, 0.05),
        transparentWalls: new Set(['north', 'west'])
    },
    {
        id: 'northeast',
        camera: new THREE.Vector3(16.8, 13.0, -10.0),
        target: new THREE.Vector3(5.0, 0.72, 0.05),
        transparentWalls: new Set(['north', 'east'])
    },
    {
        id: 'southeast',
        camera: new THREE.Vector3(16.8, 13.0, 10.0),
        target: new THREE.Vector3(5.0, 0.72, 0.05),
        transparentWalls: new Set(['south', 'east'])
    },
    {
        id: 'southwest',
        camera: new THREE.Vector3(-8.0, 13.0, 10.0),
        target: new THREE.Vector3(5.0, 0.72, 0.05),
        transparentWalls: new Set(['south', 'west'])
    }
];

const TRANSPARENT_OPACITY = 0.04;
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.45;
const PANORAMA_BACKGROUND = new THREE.Color(0xd9e4ee);
const PANORAMA_EXPOSURE = 1.08;

let scene;
let camera;
let renderer;
let controlsModule;
let fadeToBlack = async () => {};
let fadeFromBlack = async () => {};
let isActive = false;
let isTransitioning = false;
let viewIndex = 0;
let savedCameraPosition = new THREE.Vector3();
let savedCameraQuaternion = new THREE.Quaternion();
let savedCameraFov = 65;
let savedSceneFog = null;
let savedSceneBackground = null;
let savedRendererExposure = 0.9;
let savedCrosshairActive = false;
let zoomLevel = 1;
let materialStates = [];
let styleMaterialStates = [];
let els = {};
const workingTarget = new THREE.Vector3();
const workingOffset = new THREE.Vector3();
let pinchStartDistance = 0;
let pinchStartZoom = 1;

export function initRoomPanorama(options = {}) {
    scene = options.scene;
    camera = options.camera;
    renderer = options.renderer;
    controlsModule = options.controlsModule;
    fadeToBlack = options.fadeToBlack || fadeToBlack;
    fadeFromBlack = options.fadeFromBlack || fadeFromBlack;

    els.panel = document.getElementById('room-panorama-ui');
    els.prev = document.getElementById('room-panorama-prev');
    els.next = document.getElementById('room-panorama-next');
    els.capture = document.getElementById('room-panorama-capture');
    els.close = document.getElementById('room-panorama-close');

    els.prev?.addEventListener('click', () => switchPanoramaView(-1));
    els.next?.addEventListener('click', () => switchPanoramaView(1));
    els.capture?.addEventListener('click', captureRoomPanorama);
    els.close?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('fritia-action', { detail: { code: 'KeyE' } }));
    });
    els.panel?.addEventListener('click', stopPanoramaPropagation);
    els.panel?.addEventListener('pointerdown', stopPanoramaPropagation);
    els.panel?.addEventListener('mousedown', stopPanoramaPropagation);
    els.panel?.addEventListener('wheel', onPanoramaWheel, { passive: false });
    els.panel?.addEventListener('touchstart', onPanoramaTouchStart, { passive: false });
    els.panel?.addEventListener('touchmove', onPanoramaTouchMove, { passive: false });
    els.panel?.addEventListener('touchend', resetPanoramaPinch);
    els.panel?.addEventListener('touchcancel', resetPanoramaPinch);
}

export function isRoomPanoramaActive() {
    return isActive;
}

export async function enterRoomPanorama() {
    if (isActive || isTransitioning || !scene || !camera || !renderer) return;
    isTransitioning = true;
    isActive = true;
    savedCameraPosition.copy(camera.position);
    savedCameraQuaternion.copy(camera.quaternion);
    savedCameraFov = camera.fov;
    savedSceneFog = scene.fog;
    savedSceneBackground = scene.background;
    savedRendererExposure = renderer.toneMappingExposure;
    savedCrosshairActive = document.getElementById('crosshair')?.classList.contains('active') || false;
    zoomLevel = 1;
    document.body.classList.add('room-panorama-active');
    controlsModule?.releaseControlMode?.();

    await fadeToBlack();
    applyPanoramaFov();
    scene.background = PANORAMA_BACKGROUND;
    scene.fog = null;
    renderer.toneMappingExposure = PANORAMA_EXPOSURE;
    document.getElementById('crosshair')?.classList.remove('active');
    applyPanoramaMaterialStyle();
    applyPanoramaVisibility();
    applyPanoramaView();
    els.panel?.classList.remove('hidden');
    await fadeFromBlack();
    isTransitioning = false;
}

export async function exitRoomPanorama() {
    if (!isActive || isTransitioning) return;
    isTransitioning = true;
    controlsModule?.setMovementLocked?.(true);
    controlsModule?.setLookLocked?.(true);
    controlsModule?.forceEnterControlMode?.({ allowDuringPanorama: true });
    await fadeToBlack();
    restorePanoramaVisibility();
    restorePanoramaMaterialStyle();
    camera.position.copy(savedCameraPosition);
    camera.quaternion.copy(savedCameraQuaternion);
    camera.fov = savedCameraFov;
    camera.updateProjectionMatrix();
    scene.fog = savedSceneFog;
    scene.background = savedSceneBackground;
    renderer.toneMappingExposure = savedRendererExposure;
    els.panel?.classList.add('hidden');
    await fadeFromBlack();
    isActive = false;
    document.body.classList.remove('room-panorama-active');
    controlsModule?.setMovementLocked?.(false);
    controlsModule?.setLookLocked?.(false);
    if (savedCrosshairActive) document.getElementById('crosshair')?.classList.add('active');
    isTransitioning = false;
}

export async function switchPanoramaView(direction) {
    if (!isActive || isTransitioning) return;
    isTransitioning = true;
    await fadeToBlack();
    viewIndex = (viewIndex + direction + PANORAMA_VIEWS.length) % PANORAMA_VIEWS.length;
    applyPanoramaVisibility();
    applyPanoramaView();
    await fadeFromBlack();
    isTransitioning = false;
}

export function updateRoomPanorama() {
    if (!isActive || isTransitioning || !camera) return;
    applyPanoramaView();
}

function applyPanoramaView() {
    const view = PANORAMA_VIEWS[viewIndex] || PANORAMA_VIEWS[0];
    applyPanoramaFov();
    workingTarget.copy(view.target);
    workingOffset.copy(view.camera).sub(workingTarget).multiplyScalar(zoomLevel);
    camera.position.copy(workingTarget).add(workingOffset);
    camera.lookAt(workingTarget);
    camera.updateMatrixWorld(true);
}

function applyPanoramaFov() {
    if (!camera) return;
    const aspect = Math.max(0.2, window.innerWidth / Math.max(1, window.innerHeight));
    camera.fov = aspect < 0.75 ? 94 : (aspect < 1.1 ? 86 : 78);
    camera.updateProjectionMatrix();
}

function applyPanoramaVisibility() {
    restorePanoramaVisibility();
    const view = PANORAMA_VIEWS[viewIndex] || PANORAMA_VIEWS[0];
    const transparentWalls = view.transparentWalls || new Set();
    const candidates = [];

    scene.traverse(object => {
        if (!object?.isMesh) return;
        const layer = object.userData?.panoramaLayer;
        const wall = normalizePanoramaWall(object.userData?.panoramaWall || findParentPanoramaWall(object));
        const isCeiling = layer === 'ceiling';
        const isWallFacingCamera = (layer === 'wall' || layer === 'wallDecor' || wall)
            && wall
            && transparentWalls.has(wall);
        const dreamWall = getWallMountedDreamFurnitureWall(object);
        const isWallDreamFurniture = dreamWall && transparentWalls.has(dreamWall);
        if (isCeiling || isWallFacingCamera || isWallDreamFurniture) {
            candidates.push(object);
        }
    });

    for (const object of candidates) {
        setMeshTransparent(object);
    }
}

function applyPanoramaMaterialStyle() {
    restorePanoramaMaterialStyle();
    scene.traverse(object => {
        if (!object?.isMesh || !object.material) return;
        const layer = object.userData?.panoramaLayer;
        if (layer !== 'floor' && layer !== 'wall' && layer !== 'ceiling') return;
        const originalMaterial = object.material;
        const styled = cloneStyledMaterial(originalMaterial, layer);
        if (!styled) return;
        styleMaterialStates.push({ mesh: object, material: originalMaterial });
        object.material = styled;
    });
}

function cloneStyledMaterial(material, layer) {
    const apply = (source) => {
        if (!source) return source;
        const cloned = source.clone();
        if (layer === 'floor') {
            cloned.color?.lerp?.(new THREE.Color(0xb6ad9d), 0.45);
            cloned.roughness = Math.min(1, (Number(cloned.roughness) || 0.8) + 0.08);
        } else if (layer === 'wall') {
            cloned.color?.lerp?.(new THREE.Color(0xfff7ed), 0.35);
            cloned.roughness = Math.min(1, (Number(cloned.roughness) || 0.9) + 0.04);
        } else if (layer === 'ceiling') {
            cloned.color?.lerp?.(new THREE.Color(0xf7fbff), 0.25);
        }
        cloned.needsUpdate = true;
        return cloned;
    };
    return Array.isArray(material) ? material.map(apply) : apply(material);
}

function findParentPanoramaWall(object) {
    let current = object?.parent;
    while (current) {
        if (current.userData?.panoramaWall) return normalizePanoramaWall(current.userData.panoramaWall);
        current = current.parent;
    }
    return '';
}

function getWallMountedDreamFurnitureWall(object) {
    let current = object;
    while (current) {
        if (current.userData?.dreamFurnitureId) {
            if (current.userData?.anchor !== 'wall') return '';
            return normalizePanoramaWall(current.userData?.panoramaWall) || inferWallFromPosition(current.position);
        }
        current = current.parent;
    }
    return '';
}

function normalizePanoramaWall(wall) {
    const key = String(wall || '').toLowerCase();
    if (key === 'back') return 'north';
    if (key === 'front') return 'south';
    if (key === 'right') return 'east';
    if (key === 'left') return 'west';
    return key;
}

function inferWallFromPosition(position) {
    if (!position) return '';
    if (position.z <= -2.75) return 'north';
    if (position.z >= 2.75) return 'south';
    if (position.x >= 12.7) return 'east';
    if (position.x <= -2.75) return 'west';
    if (position.x >= 2.8 && position.x <= 3.45) return 'shared';
    return '';
}

function setMeshTransparent(mesh) {
    if (!mesh?.material) return;
    const originalMaterial = mesh.material;
    const cloneMaterial = (material) => {
        if (!material) return material;
        const cloned = material.clone();
        cloned.transparent = true;
        cloned.opacity = Math.min(Number(material.opacity) || 1, TRANSPARENT_OPACITY);
        cloned.depthWrite = false;
        cloned.needsUpdate = true;
        return cloned;
    };
    materialStates.push({ mesh, material: originalMaterial });
    mesh.material = Array.isArray(originalMaterial)
        ? originalMaterial.map(cloneMaterial)
        : cloneMaterial(originalMaterial);
}

function restorePanoramaVisibility() {
    for (const state of materialStates) {
        const current = state.mesh.material;
        state.mesh.material = state.material;
        const materials = Array.isArray(current) ? current : [current];
        for (const material of materials) {
            if (material && material !== state.material && typeof material.dispose === 'function') {
                material.dispose();
            }
        }
    }
    materialStates = [];
}

function restorePanoramaMaterialStyle() {
    for (const state of styleMaterialStates) {
        const current = state.mesh.material;
        state.mesh.material = state.material;
        const materials = Array.isArray(current) ? current : [current];
        for (const material of materials) {
            if (material && material !== state.material && typeof material.dispose === 'function') {
                material.dispose();
            }
        }
    }
    styleMaterialStates = [];
}

function onPanoramaWheel(event) {
    if (!isActive) return;
    event.preventDefault();
    event.stopPropagation();
    setPanoramaZoom(zoomLevel + (event.deltaY > 0 ? 0.08 : -0.08));
}

function onPanoramaTouchStart(event) {
    if (!isActive) return;
    event.stopPropagation();
    if (isPanoramaControlTarget(event.target) && event.touches.length < 2) {
        resetPanoramaPinch();
        return;
    }
    event.preventDefault();
    if (event.touches.length !== 2) {
        resetPanoramaPinch();
        return;
    }
    pinchStartDistance = getTouchDistance(event.touches);
    pinchStartZoom = zoomLevel;
}

function onPanoramaTouchMove(event) {
    if (!isActive) return;
    event.stopPropagation();
    if (isPanoramaControlTarget(event.target) && event.touches.length < 2) return;
    event.preventDefault();
    if (event.touches.length !== 2 || pinchStartDistance <= 0) return;
    const distance = getTouchDistance(event.touches);
    setPanoramaZoom(pinchStartZoom * (pinchStartDistance / Math.max(20, distance)));
}

function stopPanoramaPropagation(event) {
    if (!isActive) return;
    event.stopPropagation();
}

function isPanoramaControlTarget(target) {
    return Boolean(target?.closest?.('.room-panorama-side, #room-panorama-capture, #room-panorama-close'));
}

function resetPanoramaPinch() {
    pinchStartDistance = 0;
    pinchStartZoom = zoomLevel;
}

function getTouchDistance(touches) {
    const a = touches[0];
    const b = touches[1];
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function setPanoramaZoom(value) {
    zoomLevel = THREE.MathUtils.clamp(Number(value) || 1, MIN_ZOOM, MAX_ZOOM);
    applyPanoramaView();
}

function captureRoomPanorama() {
    if (!isActive || !renderer) return;
    els.panel?.classList.add('capturing');
    requestAnimationFrame(() => {
        renderer.render(scene, camera);
        let url = '';
        try {
            url = renderer.domElement.toDataURL('image/png');
        } catch (err) {
            console.warn('[Panorama] screenshot failed:', err);
        }
        els.panel?.classList.remove('capturing');
        if (!url) return;

        const link = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        link.href = url;
        link.download = `fritia_room_panorama_${stamp}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    });
}
