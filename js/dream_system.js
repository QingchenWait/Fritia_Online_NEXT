import * as THREE from 'three';
import { getDreamDialogueCooldownMs } from './advanced_settings.js';
import { getSettings } from './settings.js';
import {
    addAffinity,
    addMoney,
    canAfford,
    formatGameDateTime,
    formatMoney,
    getGameTimeContext,
    getGameTimeInfo,
    getMoney,
    recordDreamFurnitureRevision,
    spendMoney
} from './game_state.js';
import { requestDreamFurnitureRevision, requestDreamFurnitureSpec, requestFurnitureRomanticLine } from './dream_llm.js';
import {
    applyFurniturePose,
    createFurnitureCollider,
    createFurnitureColliders,
    createFurnitureFromSpec,
    deserializeFurniture,
    estimateFurnitureAABB,
    normalizeFurnitureSpec,
    serializeFurniture
} from './dream_furniture_factory.js';

const STORAGE_KEY = 'fritia_dream_furniture';
const DREAM_COST = 500;
const DREAM_REVISION_COST = 100;
const DREAM_REVISION_REFUND = 50;
const DREAM_DELETE_REFUND = 400;
const FURNITURE_DIALOGUE_LLM_RATE = 0.5;
const SEAT_INTERACTION_RATE = 0.42;
const BED_INTERACTION_RATE = 0.42;
const MOVE_STEP = 0.25;
const WALL_MOVE_STEP = 0.18;
const ROTATE_STEP = THREE.MathUtils.degToRad(15);
const MAX_LOOK_DISTANCE = 5;
const FALLBACK_FURNITURE_LINES = [
    '分析员打造的家具太棒啦。',
    '这个小角落，因为你变得好温柔。',
    '我好喜欢你为房间添上的心意。',
    '坐在这里，好像离分析员更近一点。',
    '这件家具看起来很有你的味道呢。',
    '以后我们可以常常待在这里吗？',
    '这里被你布置得像一个小小的梦。',
    '看到它就会想到你认真设计的样子。',
    '分析员的审美，我一直都很相信哦。',
    '这里好适合偷偷多看你一会儿。',
    '有你在，普通的家具也像礼物一样。',
    '这个位置刚刚好，我很喜欢。',
    '房间一点点变成我们的样子了呢。',
    '谢谢你把这里装点得这么温暖。',
    '我想把这份心意好好记住。',
    '这里好舒服，想和分析员多待一会儿。',
    '每次经过这里，心情都会变好。',
    '这是只属于我们的造梦角落吧。'
];
const DREAM_FURNITURE_TEMPLATES = [
    {
        title: '🕑 挂在墙上的时钟',
        description: '一个挂在墙上的圆形机械时钟，黄色边框，乳白色表盘，细长指针。'
    },
    {
        title: '🌙 月光阅读沙发',
        description: '一张适合两个人并肩坐下的沙发，低矮柔软，浅粉和奶白配色，靠背有一条蓝色的灯带。'
    },
    {
        title: '🖼️ 可定制图片的挂画',
        description: '一张悬挂在墙上的大型挂画，9:16 比例，带有深红色的窄边框。'
    },
    {
        title: '🖥️ 双人电竞桌',
        description: '一张宽阔的电竞桌，带有四个桌腿，桌面为棕色，桌面上并排摆放着两台电脑。'
    },
    {
        title: '💡 心愿落地灯',
        description: '一盏细杆落地灯，顶部是圆台形的灯罩，发出温暖柔光，底座稳定。'
    },
    {
        title: '🪞 落地镜',
        description: '一面表面光滑的透明方形落地镜，带有金色边框。'
    },
    {
        title: '🧸 多层展示柜',
        description: '一个带有三个透明格子的展示柜，圆角玻璃门，内部有淡金色小灯。'
    },
    {
        title: '🪴 圣诞树',
        description: '一棵绿色的圣诞树，周围环绕着几个红色和黄色的彩灯。'
    },
    {
        title: '🧱 卧室隔断墙',
        description: '一面宽阔的隔断墙，宽度接近房间宽度，高度接近房间高度，右侧带有一个能容纳人通过的门框。'
    },
    {
        title: '🛏️ 双人床',
        description: '一张带有床头靠背的双人床，带有粉色的床垫和白色的枕头。'
    }
];

let scene;
let camera;
let dreamTerminalMesh;
let dreamRoomBounds;
let oldRoomBounds;
let doorClearanceZone;
let controlsModule;
let onFurnitureChanged = () => {};
let onFurnitureCreated = () => {};
let getGameTimeText = () => formatGameDateTime({ includeYear: true });
let getCharacterRoot = () => null;
let canShowFurnitureDialogue = () => true;
let getOcclusionColliders = () => [];

const raycaster = new THREE.Raycaster();
const occlusionRay = new THREE.Ray();
const lookDirection = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const occlusionPoint = new THREE.Vector3();
const furnitureRecords = [];
const runtime = new Map();
const els = {};
let isCreating = false;
let isRevising = false;
let editingId = null;
let editSnapshot = null;
let pendingRevision = null;
let rotateHoldTimer = null;
let rotateHoldDelayTimer = null;
let moveHoldTimer = null;
let moveHoldDelayTimer = null;
let objectControlsFrame = null;
let screenToastTimer = null;
let characterBubbleFrame = null;
let characterBubbleTimer = null;
let lookDragPointerId = null;
let lastLookDrag = { x: 0, y: 0 };
const projectedControlPosition = new THREE.Vector3();
const projectedBubblePosition = new THREE.Vector3();
const projectedBubbleNdc = new THREE.Vector3();
const furnitureSpeechTarget = new THREE.Vector3();
const characterBubbleBox = new THREE.Box3();
const dreamYAxis = new THREE.Vector3(0, 1, 0);
let furnitureSpeechTurnToken = 0;
let pendingDreamPaintingTextureId = '';
let pendingDreamPaintingTextureTimer = null;

function vectorToPlainBounds(box) {
    if (!box) return null;
    return {
        minX: Number(box.min.x),
        maxX: Number(box.max.x),
        minY: Number(box.min.y),
        maxY: Number(box.max.y),
        minZ: Number(box.min.z),
        maxZ: Number(box.max.z)
    };
}

function boxFromPlain(plain) {
    if (!plain) return null;
    return new THREE.Box3(
        new THREE.Vector3(plain.minX, plain.minY, plain.minZ),
        new THREE.Vector3(plain.maxX, plain.maxY, plain.maxZ)
    );
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function makeId() {
    return `dream_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

export function constrainPendingRevisionPlayer() {
    if (!pendingRevision || !camera || !dreamRoomBounds) return;
    const margin = 0.3;
    camera.position.x = clamp(camera.position.x, dreamRoomBounds.min.x + margin, dreamRoomBounds.max.x - margin);
    camera.position.z = clamp(camera.position.z, dreamRoomBounds.min.z + margin, dreamRoomBounds.max.z - margin);
    camera.position.y = 1.6;
}

function clampName(value, fallback = '梦造家具') {
    const chars = Array.from(String(value || fallback).trim());
    return chars.slice(0, 12).join('') || fallback;
}

function copyPose(pose) {
    return {
        position: {
            x: Number(pose?.position?.x) || 0,
            y: Number(pose?.position?.y) || 0,
            z: Number(pose?.position?.z) || 0
        },
        rotationY: Number(pose?.rotationY) || 0,
        wall: typeof pose?.wall === 'string' ? pose.wall : '',
        anchor: typeof pose?.anchor === 'string' ? pose.anchor : ''
    };
}

function isWallFurniture(recordOrSpec) {
    const spec = recordOrSpec?.spec || recordOrSpec;
    return spec?.anchor === 'wall' || spec?.category === 'hanging' || spec?.category === 'painting';
}

function hasExplicitWallMountIntent(text) {
    return /挂在墙|挂墙|墙上|墙面|壁挂|悬挂|挂钟|挂画|墙饰|wall[-\s]?mounted|on\s+the\s+wall|hanging/i.test(String(text || ''));
}

function hasPaintingIntent(text) {
    return /挂画|画框|相框|照片框|展示框|墙画|壁画|painting|picture\s*frame|photo\s*frame|wall\s*art/i.test(String(text || ''));
}

function hasFurnitureSurfaceHangingIntent(text) {
    return /挂|悬挂|壁挂|挂钟|时钟|钟表|墙饰|吊饰|clock|hanging|wall[-\s]?mounted/i.test(String(text || ''));
}

function componentLooksLikeHangingAttachment(component) {
    const name = `${component?.name || ''} ${component?.material || ''}`;
    if (/挂|钟|clock|wall|hanging|ornament|decor/i.test(name)) return true;
    const size = component?.size || {};
    const thinDepth = Math.min(Number(size.x) || 0, Number(size.z) || 0);
    const broadFace = Math.max(Number(size.x) || 0, Number(size.y) || 0, Number(size.z) || 0);
    return thinDepth > 0 && thinDepth <= 0.12 && broadFace >= 0.22 && Number(component?.position?.y || 0) > 0.7;
}

function alignHangingAttachmentsOnFurniture(spec, instruction) {
    if (!spec || isWallFurniture(spec) || !hasFurnitureSurfaceHangingIntent(instruction)) return spec;
    const next = copyJson(spec);
    const components = Array.isArray(next.components) ? next.components : [];
    const face = next.frontDirection || '+Z';
    let changed = false;

    for (const component of components) {
        if (!componentLooksLikeHangingAttachment(component)) continue;
        const size = component.size || {};
        component.position = component.position || { x: 0, y: 1, z: 0 };
        component.rotation = component.rotation || { x: 0, y: 0, z: 0 };
        if (face === '+X') {
            component.position.x = next.dimensions.width / 2 + (Number(size.x) || 0.05) / 2 + 0.018;
            component.rotation.y = Math.PI / 2;
            next.dimensions.width = Math.max(next.dimensions.width, Math.abs(component.position.x) * 2 + (Number(size.x) || 0.05));
        } else if (face === '-X') {
            component.position.x = -next.dimensions.width / 2 - (Number(size.x) || 0.05) / 2 - 0.018;
            component.rotation.y = -Math.PI / 2;
            next.dimensions.width = Math.max(next.dimensions.width, Math.abs(component.position.x) * 2 + (Number(size.x) || 0.05));
        } else if (face === '-Z') {
            component.position.z = -next.dimensions.depth / 2 - (Number(size.z) || 0.05) / 2 - 0.018;
            component.rotation.y = Math.PI;
            next.dimensions.depth = Math.max(next.dimensions.depth, Math.abs(component.position.z) * 2 + (Number(size.z) || 0.05));
        } else {
            component.position.z = next.dimensions.depth / 2 + (Number(size.z) || 0.05) / 2 + 0.018;
            component.rotation.y = 0;
            next.dimensions.depth = Math.max(next.dimensions.depth, Math.abs(component.position.z) * 2 + (Number(size.z) || 0.05));
        }
        component.position.y = clamp(
            Number(component.position.y) || next.dimensions.height * 0.62,
            (Number(size.y) || 0.1) / 2 + 0.08,
            Math.max((Number(size.y) || 0.1) / 2 + 0.08, next.dimensions.height - (Number(size.y) || 0.1) / 2 - 0.08)
        );
        changed = true;
    }

    return changed ? normalizeFurnitureSpec(next) : spec;
}

function copyJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function getUsableBounds(margin = 0.35) {
    return {
        minX: dreamRoomBounds.min.x + margin,
        maxX: dreamRoomBounds.max.x - margin,
        minZ: dreamRoomBounds.min.z + margin,
        maxZ: dreamRoomBounds.max.z - margin
    };
}

function intersectsDoorZone(box) {
    return doorClearanceZone && box.intersectsBox(doorClearanceZone);
}

function getWindowClearanceZone() {
    if (!dreamRoomBounds) return null;
    return new THREE.Box3(
        new THREE.Vector3(6.95, 0, dreamRoomBounds.min.z - 0.05),
        new THREE.Vector3(9.65, 2.6, dreamRoomBounds.min.z + 0.72)
    );
}

function intersectsWindowZone(box) {
    const windowZone = getWindowClearanceZone();
    return Boolean(windowZone && box.intersectsBox(windowZone));
}

function isBoxInsideRoom(box) {
    const floorMargin = 0.05;
    return box.min.x >= dreamRoomBounds.min.x + floorMargin
        && box.max.x <= dreamRoomBounds.max.x - floorMargin
        && box.min.z >= dreamRoomBounds.min.z + floorMargin
        && box.max.z <= dreamRoomBounds.max.z - floorMargin
        && box.max.y <= dreamRoomBounds.max.y - 0.05;
}

function isWallBoxInsideRoom(box) {
    const margin = 0.003;
    return box.min.x >= dreamRoomBounds.min.x + margin
        && box.max.x <= dreamRoomBounds.max.x - margin
        && box.min.z >= dreamRoomBounds.min.z + margin
        && box.max.z <= dreamRoomBounds.max.z - margin
        && box.min.y >= 0.35
        && box.max.y <= dreamRoomBounds.max.y - 0.18;
}

function getOtherFurnitureColliders(excludeId = '') {
    return Array.from(runtime.values())
        .filter(item => item.id !== excludeId)
        .flatMap(item => item.colliders || (item.collider ? [item.collider] : []))
        .filter(Boolean);
}

function validateRuntimePlacement(group, excludeId = '') {
    const box = estimateFurnitureAABB(group);
    const isWallMounted = group.userData?.anchor === 'wall';
    if (isWallMounted ? !isWallBoxInsideRoom(box) : !isBoxInsideRoom(box)) {
        return { ok: false, error: '家具会穿出房间边界。' };
    }
    if (intersectsDoorZone(box)) {
        return { ok: false, error: '家具会挡住连接门。' };
    }
    if (intersectsWindowZone(box)) {
        return { ok: false, error: '家具会遮挡窗户。' };
    }
    for (const collider of getOtherFurnitureColliders(excludeId)) {
        if (box.intersectsBox(collider)) {
            return { ok: false, error: '家具会与已有家具重叠。' };
        }
    }
    return { ok: true, box };
}

function directionToRotation(frontDirection) {
    switch (frontDirection) {
        case '+X': return Math.PI / 2;
        case '-X': return -Math.PI / 2;
        case '-Z': return Math.PI;
        case '+Z':
        default: return 0;
    }
}

function rotateTowardInterior(pos, spec, baseRotation) {
    const clearance = 0.95;
    let rotation = baseRotation;
    if (pos.x < dreamRoomBounds.min.x + clearance) rotation = Math.PI / 2;
    if (pos.x > dreamRoomBounds.max.x - clearance) rotation = -Math.PI / 2;
    if (pos.z < dreamRoomBounds.min.z + clearance) rotation = 0;
    if (pos.z > dreamRoomBounds.max.z - clearance) rotation = Math.PI;
    if (spec.category === 'seat' || spec.category === 'table' || spec.category === 'storage') {
        return rotation;
    }
    return baseRotation;
}

function buildCandidatePositions(spec, placementText = '', placement = {}) {
    const text = `${placementText || ''} ${placement.intent || ''} ${placement.preferredWall || ''}`.toLowerCase();
    const usable = getUsableBounds();
    const center = {
        x: (usable.minX + usable.maxX) / 2,
        z: (usable.minZ + usable.maxZ) / 2
    };
    const candidates = [];
    const add = (x, z, reason = '') => {
        candidates.push({
            x: clamp(x, usable.minX, usable.maxX),
            z: clamp(z, usable.minZ, usable.maxZ),
            reason
        });
    };
    const addWallCandidates = () => {
        const xMargin = spec.dimensions.width / 2 + 0.42;
        const zMargin = spec.dimensions.depth / 2 + 0.42;
        add(usable.maxX - xMargin, center.z, 'wall_right');
        add(usable.minX + xMargin, center.z, 'wall_shared');
        add(center.x, usable.maxZ - zMargin, 'wall_front');
        add(center.x, usable.minZ + zMargin, 'wall_back');
        add(usable.maxX - xMargin, usable.maxZ - zMargin, 'wall_far_front');
        add(usable.maxX - xMargin, usable.minZ + zMargin, 'wall_far_back');
        add(usable.minX + xMargin, usable.maxZ - zMargin, 'wall_entry_front');
        add(usable.minX + xMargin, usable.minZ + zMargin, 'wall_entry_back');
    };

    if (!text.trim()) {
        addWallCandidates();
    }

    if (/窗|window/.test(text)) {
        add(8.4, usable.minZ + spec.dimensions.depth / 2 + 0.45, 'window');
    }
    if (/中央|中间|center|middle/.test(text)) {
        add(center.x, center.z, 'center');
    }
    if (/门口|入口|door/.test(text)) {
        add(4.75, 1.75, 'near_door');
        add(4.75, -1.85, 'near_door_alt');
    }
    if (/左边|左侧|left/.test(text)) {
        add(center.x, usable.minZ + spec.dimensions.depth / 2 + 0.55, 'left_side');
    }
    if (/右边|右侧|right/.test(text)) {
        add(center.x, usable.maxZ - spec.dimensions.depth / 2 - 0.55, 'right_side');
    }
    if (/最里面|深处|远|far|inside/.test(text)) {
        add(usable.maxX - spec.dimensions.width / 2 - 0.5, center.z, 'far_wall');
    }
    if (/墙|靠墙|wall/.test(text)) {
        add(usable.maxX - spec.dimensions.width / 2 - 0.45, center.z, 'right_wall');
        add(center.x, usable.minZ + spec.dimensions.depth / 2 + 0.45, 'back_wall');
        add(center.x, usable.maxZ - spec.dimensions.depth / 2 - 0.45, 'front_wall');
    }
    if (/芙提雅|经常站/.test(text)) {
        add(8, -0.7, 'near_fritia');
    }

    if (text.trim()) {
        addWallCandidates();
    }
    add(center.x, center.z, 'fallback_center');
    add(7.3, -1.65, 'fallback_window');
    add(10.6, 1.65, 'fallback_far');
    add(6.2, 1.8, 'fallback_entry_right');
    add(11.4, -1.7, 'fallback_far_window');

    const gridStep = 0.75;
    for (let x = usable.minX + spec.dimensions.width / 2; x <= usable.maxX - spec.dimensions.width / 2; x += gridStep) {
        for (let z = usable.minZ + spec.dimensions.depth / 2; z <= usable.maxZ - spec.dimensions.depth / 2; z += gridStep) {
            add(x, z, 'grid');
        }
    }

    return candidates;
}

function buildExhaustiveFloorCandidates() {
    const usable = getUsableBounds();
    const candidates = [];
    const step = 0.45;
    const centerX = (usable.minX + usable.maxX) / 2;
    const centerZ = (usable.minZ + usable.maxZ) / 2;
    const points = [];

    for (let x = usable.minX; x <= usable.maxX + 0.001; x += step) {
        for (let z = usable.minZ; z <= usable.maxZ + 0.001; z += step) {
            points.push({ x, z });
        }
    }
    points.sort((a, b) => {
        const da = Math.hypot(a.x - centerX, a.z - centerZ);
        const db = Math.hypot(b.x - centerX, b.z - centerZ);
        return da - db;
    });
    for (const point of points) {
        candidates.push({ x: point.x, z: point.z, reason: 'exhaustive_grid' });
    }
    return candidates;
}

function getFloorRotationCandidates(pos, spec, baseRotation) {
    const interiorRotation = rotateTowardInterior(pos, spec, baseRotation);
    return Array.from(new Set([
        interiorRotation,
        baseRotation,
        0,
        Math.PI / 2,
        Math.PI,
        -Math.PI / 2
    ].map(value => Number(value.toFixed(6)))));
}

function buildWallMountCandidates(spec, placementText = '') {
    const text = `${placementText || ''} ${spec.placement?.intent || ''} ${spec.placement?.preferredWall || ''}`.toLowerCase();
    const width = spec.dimensions.width;
    const height = spec.dimensions.height;
    const depth = Math.max(0.06, spec.dimensions.depth);
    const xMinOnZWall = dreamRoomBounds.min.x + width / 2 + 0.25;
    const xMaxOnZWall = dreamRoomBounds.max.x - width / 2 - 0.25;
    const zMinOnXWall = dreamRoomBounds.min.z + width / 2 + 0.25;
    const zMaxOnXWall = dreamRoomBounds.max.z - width / 2 - 0.25;
    const yMin = Math.max(0.55 + height / 2, 0.75);
    const yMax = dreamRoomBounds.max.y - height / 2 - 0.25;
    const yDefault = clamp(/低|矮|below|lower/.test(text) ? 1.15 : /高|上|top|high/.test(text) ? 2.15 : 1.65, yMin, yMax);
    const centerX = (dreamRoomBounds.min.x + dreamRoomBounds.max.x) / 2;
    const centerZ = (dreamRoomBounds.min.z + dreamRoomBounds.max.z) / 2;
    const candidates = [];
    const add = (wall, x, y, z, rotationY, reason = '') => {
        const onZWall = wall === 'front' || wall === 'back';
        candidates.push({
            wall,
            position: {
                x: onZWall ? clamp(x, xMinOnZWall, xMaxOnZWall) : x,
                y: clamp(y, yMin, yMax),
                z: onZWall ? z : clamp(z, zMinOnXWall, zMaxOnXWall)
            },
            rotationY,
            reason
        });
    };

    const preferWindowWall = /窗|window/.test(text);
    const preferDoor = /门|入口|door/.test(text);
    const preferFar = /最里面|深处|far|inside/.test(text);
    const zBack = dreamRoomBounds.min.z + depth / 2 + 0.08;
    const zFront = dreamRoomBounds.max.z - depth / 2 - 0.08;
    const xShared = dreamRoomBounds.min.x + depth / 2 + 0.08;
    const xFar = dreamRoomBounds.max.x - depth / 2 - 0.08;

    if (preferWindowWall) add('back', 8.35, yDefault, zBack, 0, 'window_wall');
    if (preferDoor) add('shared', xShared, yDefault, centerZ, Math.PI / 2, 'near_door_wall');
    if (preferFar) add('right', xFar, yDefault, centerZ, -Math.PI / 2, 'far_wall');
    if (/左|left/.test(text)) add('back', xMinOnZWall, yDefault, zBack, 0, 'left_on_wall');
    if (/右|right/.test(text)) add('front', xMaxOnZWall, yDefault, zFront, Math.PI, 'right_on_wall');

    add('front', centerX, yDefault, zFront, Math.PI, 'front_wall');
    add('back', centerX, yDefault, zBack, 0, 'back_wall');
    add('right', xFar, yDefault, centerZ, -Math.PI / 2, 'right_wall');
    add('shared', xShared, yDefault, centerZ, Math.PI / 2, 'shared_wall');
    add('front', centerX, clamp(2.05, yMin, yMax), zFront, Math.PI, 'front_high');
    add('back', centerX, clamp(1.2, yMin, yMax), zBack, 0, 'back_low');

    const yLevels = Array.from(new Set([
        yDefault,
        clamp(1.15, yMin, yMax),
        clamp(1.65, yMin, yMax),
        clamp(2.05, yMin, yMax)
    ].map(value => Number(value.toFixed(2)))));
    const gridStep = 0.72;
    for (const y of yLevels) {
        for (let x = xMinOnZWall; x <= xMaxOnZWall + 0.001; x += gridStep) {
            add('front', x, y, zFront, Math.PI, 'grid_front');
            add('back', x, y, zBack, 0, 'grid_back');
        }
        for (let z = zMinOnXWall; z <= zMaxOnXWall + 0.001; z += gridStep) {
            add('right', xFar, y, z, -Math.PI / 2, 'grid_right');
            add('shared', xShared, y, z, Math.PI / 2, 'grid_shared');
        }
    }

    return candidates;
}

function findSafeWallPlacement(group, spec, placementText = '', excludeId = '') {
    const candidates = buildWallMountCandidates(spec, placementText);
    const errors = new Set();
    const tried = new Set();
    let lastError = '没有安全悬挂位置。';

    group.userData.anchor = 'wall';
    for (const candidate of candidates) {
        const key = `${candidate.wall}:${candidate.rotationY.toFixed(2)}:${candidate.position.x.toFixed(2)}:${candidate.position.y.toFixed(2)}:${candidate.position.z.toFixed(2)}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const pose = applyWallFurniturePose(group, {
            position: candidate.position,
            rotationY: candidate.rotationY,
            wall: candidate.wall,
            anchor: 'wall'
        });
        const validation = validateRuntimePlacement(group, excludeId);
        if (validation.ok) {
            return {
                ok: true,
                pose
            };
        }
        if (validation.error) errors.add(validation.error);
        lastError = validation.error;
    }

    return { ok: false, error: errors.size > 1 ? '没有找到可安全悬挂的位置。' : lastError };
}

function alignWallFurnitureToSurface(group, wall) {
    if (!group || !wall || !dreamRoomBounds) return;
    const flushOffset = 0.006;

    group.updateMatrixWorld(true);
    const box = estimateFurnitureAABB(group);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

    if (wall === 'back') {
        group.position.z += dreamRoomBounds.min.z + flushOffset - box.min.z;
    } else if (wall === 'front') {
        group.position.z += dreamRoomBounds.max.z - flushOffset - box.max.z;
    } else if (wall === 'shared') {
        group.position.x += dreamRoomBounds.min.x + flushOffset - box.min.x;
    } else if (wall === 'right') {
        group.position.x += dreamRoomBounds.max.x - flushOffset - box.max.x;
    }
    group.updateMatrixWorld(true);
}

function applyWallFurniturePose(group, pose) {
    applyFurniturePose(group, pose);
    alignWallFurnitureToSurface(group, pose?.wall);
    return {
        position: {
            x: group.position.x,
            y: group.position.y,
            z: group.position.z
        },
        rotationY: Number(pose?.rotationY) || 0,
        wall: pose?.wall || '',
        anchor: 'wall'
    };
}

function applyRecordPoseToGroup(group, record) {
    if (isWallFurniture(record)) {
        group.userData.anchor = 'wall';
        const pose = applyWallFurniturePose(group, {
            ...record.pose,
            anchor: 'wall'
        });
        record.pose = copyPose(pose);
        if (record.spec) record.spec.anchor = 'wall';
        return pose;
    }
    group.userData.anchor = 'floor';
    applyFurniturePose(group, record.pose);
    return record.pose;
}

function findSafePlacement(group, spec, placementText = '', excludeId = '') {
    if (isWallFurniture(spec)) {
        return findSafeWallPlacement(group, spec, placementText, excludeId);
    }

    const baseRotation = directionToRotation(spec.frontDirection);
    const candidates = [
        ...buildCandidatePositions(spec, placementText, spec.placement),
        ...buildExhaustiveFloorCandidates()
    ];
    let lastError = '没有安全摆放位置。';

    const errors = new Set();
    const tried = new Set();
    for (const candidate of candidates) {
        const pos = new THREE.Vector3(candidate.x, 0, candidate.z);
        for (const rotationY of getFloorRotationCandidates(pos, spec, baseRotation)) {
            const key = `${pos.x.toFixed(2)}:${pos.z.toFixed(2)}:${rotationY.toFixed(2)}`;
            if (tried.has(key)) continue;
            tried.add(key);
            applyFurniturePose(group, { position: pos, rotationY });
            const validation = validateRuntimePlacement(group, excludeId);
            if (validation.ok) {
                return {
                    ok: true,
                    pose: {
                        position: { x: pos.x, y: 0, z: pos.z },
                        rotationY
                    }
                };
            }
            if (validation.error) errors.add(validation.error);
            lastError = validation.error;
        }
    }

    return { ok: false, error: errors.size > 1 ? '没有找到可安全摆放的位置。' : lastError };
}

function saveFurniture() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(furnitureRecords.map(serializeFurniture)));
        return true;
    } catch (err) {
        console.error('[Dream] save failed:', err);
        return false;
    }
}

function loadFurniture() {
    furnitureRecords.length = 0;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return;
        data.forEach(item => {
            const record = deserializeFurniture(item);
            if (record) furnitureRecords.push(record);
        });
    } catch (err) {
        console.warn('[Dream] furniture load failed:', err);
    }
}

function removeRuntimeFurniture(id) {
    const item = runtime.get(id);
    if (!item) return;
    scene.remove(item.group);
    item.group.traverse(child => {
        if (child.geometry) child.geometry.dispose?.();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose?.());
            else child.material.dispose?.();
        }
    });
    runtime.delete(id);
}

function getSpecFrontVector(spec) {
    switch (spec?.frontDirection) {
        case '+X': return new THREE.Vector3(1, 0, 0);
        case '-X': return new THREE.Vector3(-1, 0, 0);
        case '-Z': return new THREE.Vector3(0, 0, -1);
        case '+Z':
        default:
            return new THREE.Vector3(0, 0, 1);
    }
}

function getWorldFurnitureFrontVector(record, group) {
    const front = getSpecFrontVector(record?.spec).applyAxisAngle(dreamYAxis, group.rotation.y);
    front.y = 0;
    if (front.lengthSq() < 0.0001) return { x: 0, z: 1 };
    front.normalize();
    return { x: front.x, z: front.z };
}

function estimateDreamBedSurfaceY(record, group) {
    if (record?.category !== 'bed') return null;
    const spec = record.spec || {};
    const components = Array.isArray(spec.components) ? spec.components : [];
    const dimensions = spec.dimensions || {};
    const footprintArea = Math.max(0.08, (Number(dimensions.width) || 1) * (Number(dimensions.depth) || 1) * 0.12);
    let best = null;
    let bestScore = -Infinity;

    for (const component of components) {
        const size = component?.size || {};
        const position = component?.position || {};
        const sx = Math.abs(Number(size.x) || 0);
        const sy = Math.abs(Number(size.y) || 0);
        const sz = Math.abs(Number(size.z) || 0);
        const area = sx * sz;
        if (sx < 0.35 || sz < 0.55 || sy <= 0 || area < footprintArea) continue;

        const name = `${component.name || ''} ${component.material || ''}`.toLowerCase();
        if (/headboard|pillow|枕|床头|靠背|leg|脚|rail|栏|sideboard|床栏/.test(name)) continue;

        const topY = (Number(group?.position?.y) || 0) + (Number(position.y) || 0) + sy / 2;
        const maxReasonableY = (Number(group?.position?.y) || 0) + Math.max(0.35, (Number(dimensions.height) || 1) * 0.72);
        let score = area;
        if (/mattress|matress|cushion|sleep|surface|top|床垫|床面|垫|睡眠面/.test(name)) score *= 3.5;
        if (/base|platform|frame|主体|床架|底座/.test(name)) score *= 1.4;
        if (sy > Math.max(0.42, (Number(dimensions.height) || 1) * 0.45)) score *= 0.45;
        if (topY > maxReasonableY) score *= 0.25;

        if (score > bestScore) {
            bestScore = score;
            best = topY;
        }
    }

    if (Number.isFinite(best)) return best;
    const collider = createFurnitureCollider(group);
    const sizeY = collider.max.y - collider.min.y;
    return collider.min.y + Math.min(Math.max(sizeY * 0.45, 0.28), 0.75);
}

function createWaypoint(record, group) {
    const offset = record.spec.interaction?.waypoint?.offset || { x: 0, y: 0, z: 1 };
    const localOffset = new THREE.Vector3(offset.x, 0, offset.z);
    const worldOffset = localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y);
    const position = group.position.clone().add(worldOffset);
    position.y = 0;

    const usable = getUsableBounds(0.55);
    position.x = clamp(position.x, usable.minX, usable.maxX);
    position.z = clamp(position.z, usable.minZ, usable.maxZ);
    if (doorClearanceZone?.containsPoint(position)) {
        position.x = Math.max(position.x, doorClearanceZone.max.x + 0.45);
    }

    const interactionType = record.category === 'bed' ? 'bed' : (record.category === 'seat' ? 'seat' : '');
    const interactionRate = interactionType === 'bed' ? BED_INTERACTION_RATE : (interactionType === 'seat' ? SEAT_INTERACTION_RATE : 0);
    const frontVector = getWorldFurnitureFrontVector(record, group);
    const bedSurfaceY = interactionType === 'bed' ? estimateDreamBedSurfaceY(record, group) : null;

    return {
        name: `dream_furniture_${record.id}`,
        roomId: 'dream',
        position,
        isFurniture: Boolean(interactionType),
        furnitureType: interactionType || record.spec.interaction?.waypoint?.furnitureType || record.category,
        sitCollider: interactionType ? createFurnitureCollider(group) : null,
        interactionRate,
        frontVector,
        bedSurfaceY,
        isDynamicDreamFurniture: true,
        furnitureId: record.id,
        furnitureName: record.name,
        furnitureDescription: record.description,
        category: record.category,
        dialogueTags: record.spec.interaction?.waypoint?.dialogueTags || []
    };
}

function deployRecord(record) {
    removeRuntimeFurniture(record.id);
    const { group, spec } = createFurnitureFromSpec(record.spec);
    group.name = record.name;
    group.userData.dreamFurnitureId = record.id;
    group.userData.anchor = isWallFurniture(record) ? 'wall' : 'floor';
    if (isWallFurniture(record)) {
        group.userData.panoramaLayer = 'wallDecor';
        group.userData.panoramaWall = record.pose?.wall || '';
    }
    group.userData.interactionCenter = new THREE.Vector3(
        record.pose.position.x,
        isWallFurniture(record) ? record.pose.position.y : Math.min(1.4, spec.dimensions.height * 0.65),
        record.pose.position.z
    );
    applyRecordPoseToGroup(group, record);
    group.userData.interactionCenter = new THREE.Vector3(
        group.position.x,
        isWallFurniture(record) ? group.position.y : Math.min(1.4, spec.dimensions.height * 0.65),
        group.position.z
    );
    scene.add(group);

    const collider = createFurnitureCollider(group);
    const colliders = createFurnitureColliders(group);
    const waypoint = createWaypoint(record, group);
    runtime.set(record.id, {
        id: record.id,
        group,
        collider,
        colliders,
        waypoint
    });
    if (record.category === 'painting' && record.customTexture) {
        applyDreamPaintingTexture(record, record.customTexture);
    }
    return runtime.get(record.id);
}

function refreshRuntimeFurniture() {
    Array.from(runtime.keys()).forEach(removeRuntimeFurniture);
    for (const record of furnitureRecords) {
        try {
            deployRecord(record);
        } catch (err) {
            console.warn('[Dream] skip invalid furniture:', record?.id, err);
        }
    }
    onFurnitureChanged();
}

function updateProgress(stageIndex, text) {
    if (els.progressFill) {
        const pct = Math.max(0, Math.min(100, (stageIndex / 6) * 100));
        els.progressFill.style.width = `${pct}%`;
    }
    if (els.progress) {
        els.progress.textContent = text;
    }
}

function setStatus(text, kind = '') {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.dataset.kind = kind;
}

function renderBalance() {
    if (els.balance) {
        const text = `余额：${formatMoney(getMoney())}`;
        const label = els.balance.querySelector('span');
        if (label) label.textContent = text;
        else els.balance.textContent = text;
    }
    if (els.editorStyleBalance) {
        els.editorStyleBalance.textContent = `余额：${formatMoney(getMoney())}`;
    }
}

function closeById(id) {
    const panel = document.getElementById(id);
    panel?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id } }));
}

export function initDreamSystem(options) {
    scene = options.scene;
    camera = options.camera;
    dreamTerminalMesh = options.dreamTerminalMesh;
    dreamRoomBounds = options.dreamRoomBounds;
    oldRoomBounds = options.oldRoomBounds;
    doorClearanceZone = options.doorClearanceZone;
    controlsModule = options.controlsModule;
    onFurnitureChanged = options.onFurnitureChanged || (() => {});
    onFurnitureCreated = typeof options.onFurnitureCreated === 'function' ? options.onFurnitureCreated : (() => {});
    getGameTimeText = options.getGameTimeText || getGameTimeText;
    getCharacterRoot = options.getCharacterRoot || getCharacterRoot;
    canShowFurnitureDialogue = options.canShowFurnitureDialogue || canShowFurnitureDialogue;
    getOcclusionColliders = typeof options.getOcclusionColliders === 'function'
        ? options.getOcclusionColliders
        : getOcclusionColliders;

    els.panel = document.getElementById('dream-terminal-panel');
    els.close = document.getElementById('dream-terminal-close');
    els.description = document.getElementById('dream-furniture-description');
    els.templateStrip = document.getElementById('dream-template-strip');
    els.placement = document.getElementById('dream-placement-input');
    els.create = document.getElementById('dream-create-button');
    els.progress = document.getElementById('dream-progress');
    els.progressFill = document.getElementById('dream-progress-fill');
    els.status = document.getElementById('dream-status');
    els.balance = document.getElementById('dream-balance');
    els.editor = document.getElementById('dream-furniture-editor-panel');
    els.editorClose = document.getElementById('dream-editor-close');
    els.editorTitle = document.getElementById('dream-editor-title');
    els.editorMeta = document.getElementById('dream-editor-meta');
    els.editorName = document.getElementById('dream-editor-name');
    els.editorStyleInstruction = document.getElementById('dream-editor-style-instruction');
    els.editorStyleButton = document.getElementById('dream-editor-style-apply');
    els.editorStyleBalance = document.getElementById('dream-editor-style-balance');
    els.editorStyleProgress = document.getElementById('dream-editor-style-progress');
    els.editorStyleProgressFill = document.getElementById('dream-editor-style-progress-fill');
    els.editorStatus = document.getElementById('dream-editor-status');
    els.placementPanel = document.getElementById('dream-placement-editor-panel');
    els.placementClose = document.getElementById('dream-placement-editor-close');
    els.editorPlacement = document.getElementById('dream-editor-placement');
    els.revisionConfirmBar = document.getElementById('dream-revision-confirm-bar');
    els.revisionConfirm = document.getElementById('dream-revision-confirm');
    els.revisionRollback = document.getElementById('dream-revision-rollback');
    els.objectControls = document.getElementById('dream-object-controls');
    els.screenToast = document.getElementById('dream-screen-toast');

    els.close?.addEventListener('click', closeDreamPanel);
    els.create?.addEventListener('click', handleCreateFurniture);
    els.editorClose?.addEventListener('click', closeFurnitureEditPanel);

    document.getElementById('dream-editor-save-name')?.addEventListener('click', handleRename);
    els.editorStyleButton?.addEventListener('click', handleStyleRevision);
    els.placementClose?.addEventListener('click', closePlacementEditPanel);
    document.getElementById('dream-editor-auto-place')?.addEventListener('click', handleAutoPlaceEdit);
    document.getElementById('dream-object-reset')?.addEventListener('click', resetEditingFurniture);
    bindMoveHold('dream-object-move-forward', 'forward');
    bindMoveHold('dream-object-move-back', 'back');
    bindMoveHold('dream-object-move-left', 'left');
    bindMoveHold('dream-object-move-right', 'right');
    document.getElementById('dream-object-edit')?.addEventListener('click', openFurnitureEditPanel);
    document.getElementById('dream-object-placement')?.addEventListener('click', openPlacementEditPanel);
    document.getElementById('dream-object-close')?.addEventListener('click', closeDreamFurnitureEditor);
    document.getElementById('dream-object-delete')?.addEventListener('click', handleDeleteFurniture);
    els.revisionConfirm?.addEventListener('click', () => dispatchRevisionAction('Digit1'));
    els.revisionRollback?.addEventListener('click', () => dispatchRevisionAction('Digit2'));
    bindRotateHold('dream-object-rotate-left', -ROTATE_STEP);
    bindRotateHold('dream-object-rotate-right', ROTATE_STEP);
    bindObjectLookDrag();

    document.addEventListener('fritia-dream-furniture-visited', handleFurnitureVisited);

    loadFurniture();
    refreshRuntimeFurniture();
}

function sampleDreamFurnitureTemplates(count = 3) {
    const pool = [...DREAM_FURNITURE_TEMPLATES];
    const picked = [];
    while (pool.length > 0 && picked.length < count) {
        const index = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
}

function renderDreamFurnitureTemplates() {
    if (!els.templateStrip) return;
    els.templateStrip.textContent = '';
    for (const template of sampleDreamFurnitureTemplates(3)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dream-template-btn';
        button.textContent = template.title;
        button.title = template.description;
        button.addEventListener('click', () => applyDreamFurnitureTemplate(template));
        els.templateStrip.appendChild(button);
    }
}

function applyDreamFurnitureTemplate(template) {
    if (!els.description || !template) return;
    els.description.value = template.description;
    els.description.focus();
    els.description.setSelectionRange?.(els.description.value.length, els.description.value.length);
    setStatus(`已填入模板：${template.title}`, 'ok');
}

function bindObjectLookDrag() {
    if (!els.objectControls) return;
    els.objectControls.addEventListener('pointerdown', (event) => {
        if (event.target.closest('.dream-object-btn')) return;
        event.preventDefault();
        lookDragPointerId = event.pointerId;
        lastLookDrag = { x: event.clientX, y: event.clientY };
        els.objectControls.setPointerCapture?.(event.pointerId);
    });
    els.objectControls.addEventListener('pointermove', (event) => {
        if (lookDragPointerId !== event.pointerId) return;
        event.preventDefault();
        const dx = event.clientX - lastLookDrag.x;
        const dy = event.clientY - lastLookDrag.y;
        lastLookDrag = { x: event.clientX, y: event.clientY };
        if (controlsModule?.rotateView?.(dx, dy) !== false) {
            positionObjectControls();
        }
    });
    const endDrag = (event) => {
        if (lookDragPointerId !== event.pointerId) return;
        lookDragPointerId = null;
        els.objectControls.releasePointerCapture?.(event.pointerId);
    };
    els.objectControls.addEventListener('pointerup', endDrag);
    els.objectControls.addEventListener('pointercancel', endDrag);
    els.objectControls.addEventListener('lostpointercapture', () => {
        lookDragPointerId = null;
    });
}

function bindMoveHold(id, intent) {
    const btn = document.getElementById(id);
    if (!btn) return;
    let isPressed = false;
    const start = (event) => {
        if (btn.disabled) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        isPressed = true;
        clearTimeout(moveHoldDelayTimer);
        clearInterval(moveHoldTimer);
        btn.dataset.longPress = '';
        moveHoldDelayTimer = setTimeout(() => {
            btn.dataset.longPress = '1';
            const smoothStep = MOVE_STEP / 5;
            moveEditingFurnitureByIntent(intent, smoothStep);
            moveHoldTimer = setInterval(() => moveEditingFurnitureByIntent(intent, smoothStep), 40);
        }, 500);
    };
    const stop = (event) => {
        event?.preventDefault?.();
        if (!isPressed) return;
        isPressed = false;
        clearTimeout(moveHoldDelayTimer);
        moveHoldDelayTimer = null;
        clearInterval(moveHoldTimer);
        moveHoldTimer = null;
        if (btn.dataset.longPress === '1') {
            btn.dataset.longPress = '';
            return;
        }
        moveEditingFurnitureByIntent(intent, MOVE_STEP);
    };
    const cancel = (event) => {
        event?.preventDefault?.();
        if (!isPressed) return;
        isPressed = false;
        clearTimeout(moveHoldDelayTimer);
        moveHoldDelayTimer = null;
        clearInterval(moveHoldTimer);
        moveHoldTimer = null;
        btn.dataset.longPress = '';
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('pointercancel', cancel);
}

function bindRotateHold(id, amount) {
    const btn = document.getElementById(id);
    if (!btn) return;
    let isPressed = false;
    const start = (event) => {
        if (btn.disabled) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        isPressed = true;
        clearTimeout(rotateHoldDelayTimer);
        clearInterval(rotateHoldTimer);
        btn.dataset.longPress = '';
        rotateHoldDelayTimer = setTimeout(() => {
            btn.dataset.longPress = '1';
            rotateEditingFurniture(amount);
            rotateHoldTimer = setInterval(() => rotateEditingFurniture(amount / 3), 40);
        }, 500);
    };
    const stop = (event) => {
        event?.preventDefault?.();
        if (!isPressed) return;
        isPressed = false;
        clearTimeout(rotateHoldDelayTimer);
        rotateHoldDelayTimer = null;
        clearInterval(rotateHoldTimer);
        rotateHoldTimer = null;
        if (btn.dataset.longPress === '1') {
            btn.dataset.longPress = '';
            return;
        }
        rotateEditingFurniture(amount);
    };
    const cancel = (event) => {
        event?.preventDefault?.();
        if (!isPressed) return;
        isPressed = false;
        clearTimeout(rotateHoldDelayTimer);
        rotateHoldDelayTimer = null;
        clearInterval(rotateHoldTimer);
        rotateHoldTimer = null;
        btn.dataset.longPress = '';
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', cancel);
    btn.addEventListener('pointercancel', cancel);
}

export function openDreamPanel() {
    renderBalance();
    renderDreamFurnitureTemplates();
    updateProgress(0, '等待输入家具愿望');
    setStatus('');
    els.panel?.classList.remove('hidden');
    controlsModule?.releaseControlMode({ resumeOnClose: true });
    setTimeout(() => els.description?.focus(), 80);
}

export function closeDreamPanel() {
    closeById('dream-terminal-panel');
}

export function isDreamOverlayVisible() {
    return (els.panel && !els.panel.classList.contains('hidden'))
        || (els.editor && !els.editor.classList.contains('hidden'))
        || (els.placementPanel && !els.placementPanel.classList.contains('hidden'))
        || (els.objectControls && !els.objectControls.classList.contains('hidden'));
}

export function isDreamRevisionPending() {
    return Boolean(pendingRevision);
}

export function isLookingAtDreamTerminal(activeCamera = camera) {
    if (!dreamTerminalMesh || !activeCamera) return false;
    const centerZ = dreamTerminalMesh.userData?.interactionCenter?.z ?? dreamTerminalMesh.position.z;
    if (activeCamera.position.z > centerZ - 0.02) return false;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), activeCamera);
    const hits = raycaster.intersectObject(dreamTerminalMesh, true);
    if (hits.length > 0) return hasClearOcclusionLine(activeCamera, hits[0].point, hits[0].distance);
    if (!isLookingAtObjectPoint(dreamTerminalMesh, activeCamera, 0.72, MAX_LOOK_DISTANCE)) return false;
    getObjectInteractionPoint(dreamTerminalMesh, lookTarget);
    return hasClearOcclusionLine(activeCamera, lookTarget, lookTarget.distanceTo(activeCamera.position));
}

export function isLookingAtDreamFurniture(activeCamera = camera) {
    const target = getLookingDreamFurniture(activeCamera);
    return Boolean(target);
}

export function getLookingDreamFurniture(activeCamera = camera) {
    if (!activeCamera) return null;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), activeCamera);
    raycaster.far = MAX_LOOK_DISTANCE;
    const groups = Array.from(runtime.values()).map(item => item.group);
    const hits = raycaster.intersectObjects(groups, true);
    if (hits.length > 0) {
        const hit = hits[0];
        let obj = hit.object;
        while (obj && !obj.userData?.dreamFurnitureId) obj = obj.parent;
        const furnitureId = obj?.userData?.dreamFurnitureId;
        if (furnitureId && hasClearFurnitureLineOfSight(activeCamera, hit.point, hit.distance, furnitureId)) {
            return furnitureId;
        }
        return null;
    }

    for (const item of runtime.values()) {
        if (isLookingAtObjectPoint(item.group, activeCamera, 0.85, MAX_LOOK_DISTANCE)) {
            getObjectInteractionPoint(item.group, lookTarget);
            const distance = lookTarget.distanceTo(activeCamera.position);
            if (hasClearFurnitureLineOfSight(activeCamera, lookTarget, distance, item.id)) {
                return item.id;
            }
        }
    }
    return null;
}

function getObjectInteractionPoint(target, out) {
    if (target.userData?.interactionCenter) {
        out.copy(target.userData.interactionCenter);
    } else {
        target.getWorldPosition(out);
    }
    return out;
}

function getIgnoredFurnitureColliders(furnitureId) {
    const item = runtime.get(furnitureId);
    if (!item) return new Set();
    return new Set([item.collider, ...(item.colliders || [])].filter(Boolean));
}

function hasClearFurnitureLineOfSight(activeCamera, targetPoint, targetDistance, furnitureId) {
    if (!activeCamera || !targetPoint || !Number.isFinite(targetDistance) || targetDistance <= 0.001) return false;
    occlusionRay.origin.copy(activeCamera.position);
    occlusionRay.direction.copy(targetPoint).sub(activeCamera.position);
    const rayLength = occlusionRay.direction.length();
    if (rayLength <= 0.001) return false;
    occlusionRay.direction.divideScalar(rayLength);

    const ignoredColliders = getIgnoredFurnitureColliders(furnitureId);
    return hasClearOcclusionLine(activeCamera, targetPoint, targetDistance, ignoredColliders);
}

function hasClearOcclusionLine(activeCamera, targetPoint, targetDistance, ignoredColliders = new Set()) {
    if (!activeCamera || !targetPoint || !Number.isFinite(targetDistance) || targetDistance <= 0.001) return false;
    occlusionRay.origin.copy(activeCamera.position);
    occlusionRay.direction.copy(targetPoint).sub(activeCamera.position);
    const rayLength = occlusionRay.direction.length();
    if (rayLength <= 0.001) return false;
    occlusionRay.direction.divideScalar(rayLength);

    const colliders = typeof getOcclusionColliders === 'function' ? getOcclusionColliders() : [];
    for (const collider of colliders) {
        if (!collider || ignoredColliders.has(collider)) continue;
        if (collider.containsPoint?.(targetPoint)) continue;
        const hit = occlusionRay.intersectBox(collider, occlusionPoint);
        if (!hit) continue;
        const distance = hit.distanceTo(activeCamera.position);
        if (distance > 0.04 && distance < targetDistance - 0.05) {
            return false;
        }
    }
    return true;
}

function isLookingAtObjectPoint(target, activeCamera, radius = 0.5, maxDistance = 4) {
    if (!target || !activeCamera) return false;
    getObjectInteractionPoint(target, lookTarget);
    activeCamera.getWorldDirection(lookDirection);
    const toTarget = lookTarget.sub(activeCamera.position);
    const distance = toTarget.length();
    if (distance <= 0.001 || distance > maxDistance) return false;
    const forwardDistance = toTarget.dot(lookDirection);
    if (forwardDistance <= 0) return false;
    const perpendicularSq = Math.max(0, distance * distance - forwardDistance * forwardDistance);
    return Math.sqrt(perpendicularSq) <= radius;
}

async function handleCreateFurniture() {
    if (isCreating) return;
    const description = els.description?.value.trim() || '';
    const placementText = els.placement?.value.trim() || '';
    if (!description) {
        setStatus('请先填写家具描述。', 'warn');
        return;
    }

    isCreating = true;
    els.create.disabled = true;

    try {
        updateProgress(1, '检查余额与 API 设置');
        setStatus('');
        renderBalance();
        if (!canAfford(DREAM_COST)) {
            setStatus(`余额不足，需要 ${formatMoney(DREAM_COST)}，当前 ${formatMoney(getMoney())}。`, 'warn');
            return;
        }
        const settings = getSettings();
        if (!settings.apiKey) {
            setStatus('未配置 API Key。请先在设置面板填写 API Key。', 'warn');
            return;
        }

        updateProgress(2, '正在解析家具愿望');
        const roomContext = {
            bounds: vectorToPlainBounds(dreamRoomBounds),
            doorClearanceZone: vectorToPlainBounds(doorClearanceZone)
        };
        updateProgress(3, '正在生成家具结构');
        const llm = await requestDreamFurnitureSpec({
            description,
            placementText,
            roomContext,
            existingFurniture: furnitureRecords,
            settings
        });
        if (!llm.ok) {
            setStatus(llm.error || 'LLM 请求失败。', 'warn');
            return;
        }

        let spec;
        try {
            spec = normalizeFurnitureSpec(llm.spec);
            if (hasExplicitWallMountIntent(`${description} ${placementText}`)) {
                spec.anchor = 'wall';
                spec.category = hasPaintingIntent(`${description} ${placementText}`) ? 'painting' : 'hanging';
            } else if (isWallFurniture(spec)) {
                spec.anchor = 'floor';
                if (spec.category === 'hanging' || spec.category === 'painting') spec.category = 'decor';
            }
        } catch (err) {
            setStatus(`JSON schema 校验失败：${err.message}`, 'warn');
            return;
        }

        let created;
        try {
            created = createFurnitureFromSpec(spec);
        } catch (err) {
            setStatus(`家具尺寸或组件校验失败：${err.message}`, 'warn');
            return;
        }

        updateProgress(4, '正在寻找安全摆放位置');
        const placement = findSafePlacement(created.group, created.spec, placementText);
        if (!placement.ok) {
            setStatus(`家具生成成功但无法安全摆放：${placement.error}`, 'warn');
            return;
        }

        updateProgress(5, '正在部署到房间');
        const timeInfo = getGameTimeInfo({ quantize: 1 });
        const record = {
            id: makeId(),
            name: created.spec.name,
            category: created.spec.category,
            description: created.spec.description,
            playerDescription: description,
            spec: created.spec,
            pose: placement.pose,
            createdAt: new Date().toISOString(),
            gameDateTime: getGameTimeText(),
            gameMinutes: timeInfo.totalMinutes,
            revisionCount: 0,
            lastDialogueAt: 0
        };

        furnitureRecords.push(record);
        const deployed = deployRecord(record);
        if (!saveFurniture()) {
            removeRuntimeFurniture(record.id);
            furnitureRecords.pop();
            setStatus('localStorage 保存失败。', 'warn');
            return;
        }
        if (!spendMoney(DREAM_COST)) {
            removeRuntimeFurniture(record.id);
            furnitureRecords.pop();
            saveFurniture();
            setStatus('扣款失败，家具未保存。', 'warn');
            return;
        }

        updateProgress(6, '完成');
        renderBalance();
        setStatus(`制造完成：${record.name} 已部署到造梦房间。`, 'ok');
        addAffinity(5);
        if (els.description) els.description.value = '';
        if (els.placement) els.placement.value = '';
        onFurnitureChanged();
        closeDreamPanel();
        onFurnitureCreated(record, deployed);
    } catch (err) {
        console.error('[Dream] create failed:', err);
        setStatus(`未知错误：${err.message || err}`, 'warn');
    } finally {
        isCreating = false;
        if (els.create) els.create.disabled = false;
    }
}

export function openDreamFurnitureEditor(furnitureId) {
    const id = furnitureId || getLookingDreamFurniture();
    const record = furnitureRecords.find(item => item.id === id);
    if (!record) return;
    editingId = id;
    editSnapshot = copyPose(record.pose);
    els.objectControls?.classList.remove('hidden');
    updateObjectControlModes(record);
    document.dispatchEvent(new CustomEvent('fritia-dream-furniture-manage-started', {
        detail: { id }
    }));
    startObjectControlsProjection();
}

function updateObjectControlModes(record) {
    const wallMounted = isWallFurniture(record);
    document.getElementById('dream-object-rotate-left')?.toggleAttribute('disabled', wallMounted);
    document.getElementById('dream-object-rotate-right')?.toggleAttribute('disabled', wallMounted);
    const forward = document.getElementById('dream-object-move-forward');
    const back = document.getElementById('dream-object-move-back');
    if (forward) forward.title = wallMounted ? '向上移动' : '向前移动';
    if (back) back.title = wallMounted ? '向下移动' : '向后移动';
}

export function hasEditableDreamPainting() {
    const record = getEditingRecord();
    return Boolean(record && record.category === 'painting');
}

export function isDreamPaintingFurniture(furnitureId) {
    const record = furnitureRecords.find(item => item.id === furnitureId);
    return Boolean(record && record.category === 'painting');
}

export function requestDreamPaintingTextureUpload(furnitureId = '') {
    const record = furnitureId
        ? furnitureRecords.find(item => item.id === furnitureId)
        : getEditingRecord();
    if (!record || record.category !== 'painting') return false;
    clearTimeout(pendingDreamPaintingTextureTimer);
    pendingDreamPaintingTextureId = record.id;
    pendingDreamPaintingTextureTimer = setTimeout(() => {
        pendingDreamPaintingTextureId = '';
        pendingDreamPaintingTextureTimer = null;
    }, 60000);
    showDreamScreenToast('选择图片后会替换画框中的内容。', 'ok');
    document.getElementById('painting-upload')?.click();
    return true;
}

function openFurnitureEditPanel() {
    const record = getEditingRecord();
    if (!record) return;
    document.dispatchEvent(new CustomEvent('fritia-dream-furniture-manage-ended'));
    controlsModule?.releaseControlMode({ resumeOnClose: true });
    stopObjectControlsProjection();
    els.objectControls?.classList.add('hidden');
    if (els.editorTitle) els.editorTitle.textContent = record.name;
    if (els.editorMeta) {
        els.editorMeta.innerHTML = `
            <span>${escapeHtml(record.category)}</span>
            <span>${escapeHtml(record.description)}</span>
        `;
    }
    if (els.editorName) els.editorName.value = record.name;
    if (els.editorStyleInstruction) {
        els.editorStyleInstruction.value = '';
        els.editorStyleInstruction.disabled = isWallFurniture(record);
        els.editorStyleInstruction.placeholder = isWallFurniture(record)
            ? '悬挂式家具无法进行样式修改'
            : '例如：在桌子上放一台电脑、把床加宽一些';
    }
    if (els.editorStyleButton) {
        els.editorStyleButton.disabled = isWallFurniture(record);
    }
    renderBalance();
    updateStyleRevisionProgress(false);
    if (record.category === 'painting') {
        setEditorStatus('painting 类悬挂画框无法编辑样式；按 1 可从本地选择图片替换画框内容。');
    } else {
        setEditorStatus(isWallFurniture(record) ? '悬挂式家具无法编辑样式，只能沿墙面移动或删除。' : '');
    }
    els.editor?.classList.remove('hidden');
    setTimeout(() => els.editorName?.focus(), 80);
}

function returnToObjectControls() {
    if (!editingId || pendingRevision) return;
    els.objectControls?.classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('fritia-dream-furniture-manage-started', {
        detail: { id: editingId }
    }));
    startObjectControlsProjection();
}

function closeFurnitureEditPanel() {
    els.editor?.classList.add('hidden');
    returnToObjectControls();
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'dream-furniture-editor-panel' } }));
}

function openPlacementEditPanel() {
    const record = getEditingRecord();
    if (!record) return;
    document.dispatchEvent(new CustomEvent('fritia-dream-furniture-manage-ended'));
    controlsModule?.releaseControlMode({ resumeOnClose: true });
    stopObjectControlsProjection();
    els.objectControls?.classList.add('hidden');
    if (els.editorPlacement) els.editorPlacement.value = '';
    setEditorStatus('');
    els.placementPanel?.classList.remove('hidden');
    setTimeout(() => els.editorPlacement?.focus(), 80);
}

function closePlacementEditPanel() {
    els.placementPanel?.classList.add('hidden');
    returnToObjectControls();
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'dream-placement-editor-panel' } }));
}

export function closeDreamFurnitureEditor() {
    if (pendingRevision) return;
    const editorWasOpen = els.editor && !els.editor.classList.contains('hidden');
    const placementWasOpen = els.placementPanel && !els.placementPanel.classList.contains('hidden');
    const controlsWereOpen = els.objectControls && !els.objectControls.classList.contains('hidden');
    clearTimeout(moveHoldDelayTimer);
    clearInterval(moveHoldTimer);
    clearTimeout(rotateHoldDelayTimer);
    clearInterval(rotateHoldTimer);
    moveHoldDelayTimer = null;
    moveHoldTimer = null;
    rotateHoldDelayTimer = null;
    rotateHoldTimer = null;
    editingId = null;
    editSnapshot = null;
    document.getElementById('dream-object-rotate-left')?.removeAttribute('disabled');
    document.getElementById('dream-object-rotate-right')?.removeAttribute('disabled');
    stopObjectControlsProjection();
    els.objectControls?.classList.add('hidden');
    if (editorWasOpen) closeById('dream-furniture-editor-panel');
    else els.editor?.classList.add('hidden');
    if (placementWasOpen) closeById('dream-placement-editor-panel');
    else els.placementPanel?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('fritia-dream-furniture-manage-ended'));
    if (controlsWereOpen) {
        document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'dream-object-controls' } }));
    }
}

function startObjectControlsProjection() {
    stopObjectControlsProjection();
    const tick = () => {
        positionObjectControls();
        objectControlsFrame = requestAnimationFrame(tick);
    };
    tick();
}

function stopObjectControlsProjection() {
    if (objectControlsFrame) {
        cancelAnimationFrame(objectControlsFrame);
        objectControlsFrame = null;
    }
}

function positionObjectControls() {
    if (!els.objectControls || els.objectControls.classList.contains('hidden') || !camera) return;
    const item = runtime.get(editingId);
    if (!item) {
        els.objectControls.classList.add('hidden');
        return;
    }
    item.collider.getCenter(projectedControlPosition);
    projectedControlPosition.project(camera);
    const visible = projectedControlPosition.z > -1
        && projectedControlPosition.z < 1
        && projectedControlPosition.x > -1.2
        && projectedControlPosition.x < 1.2
        && projectedControlPosition.y > -1.2
        && projectedControlPosition.y < 1.2;
    els.objectControls.dataset.offscreen = visible ? '' : '1';
    const x = (projectedControlPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projectedControlPosition.y * 0.5 + 0.5) * window.innerHeight;
    els.objectControls.style.setProperty('--dream-controls-x', `${x}px`);
    els.objectControls.style.setProperty('--dream-controls-y', `${y}px`);
}

function setEditorStatus(text, kind = '') {
    if (!els.editorStatus) return;
    els.editorStatus.textContent = text;
    els.editorStatus.dataset.kind = kind;
}

function updateStyleRevisionProgress(active, text = '') {
    if (els.editorStyleProgress) {
        els.editorStyleProgress.classList.toggle('active', Boolean(active));
        els.editorStyleProgress.setAttribute('aria-hidden', active ? 'false' : 'true');
    }
    if (els.editorStyleProgressFill) {
        els.editorStyleProgressFill.style.width = active ? '100%' : '0%';
    }
    if (text) setEditorStatus(text);
}

function getEditingRecord() {
    return furnitureRecords.find(item => item.id === editingId) || null;
}

function findPaintingDisplayMesh(group) {
    let best = null;
    let bestArea = 0;
    group?.traverse(child => {
        if (!child.isMesh || !child.geometry) return;
        const box = new THREE.Box3().setFromObject(child);
        const size = new THREE.Vector3();
        box.getSize(size);
        const thin = Math.min(size.x, size.z);
        const broadArea = Math.max(size.x, size.z) * size.y;
        const name = String(child.name || '').toLowerCase();
        const score = broadArea * (/image|photo|picture|canvas|display|画|图|相片/.test(name) ? 1.8 : 1);
        if (thin <= 0.18 && score > bestArea) {
            best = child;
            bestArea = score;
        }
    });
    return best;
}

function applyDreamPaintingTexture(record, dataUrl) {
    const item = runtime.get(record?.id);
    const mesh = findPaintingDisplayMesh(item?.group);
    if (!mesh || !mesh.material) {
        console.warn('[Dream] painting texture skipped: no rectangular display surface.', record?.id);
        return false;
    }
    const img = new Image();
    img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        material.map = tex;
        material.color?.set?.(0xffffff);
        material.needsUpdate = true;
    };
    img.src = dataUrl;
    return true;
}

export function consumeDreamPaintingTextureFile(file) {
    const record = furnitureRecords.find(item => item.id === pendingDreamPaintingTextureId);
    clearTimeout(pendingDreamPaintingTextureTimer);
    pendingDreamPaintingTextureTimer = null;
    pendingDreamPaintingTextureId = '';
    if (!record || record.category !== 'painting' || !file) return false;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const dataUrl = String(ev.target?.result || '');
        if (!dataUrl) return;
        if (applyDreamPaintingTexture(record, dataUrl)) {
            record.customTexture = dataUrl;
            saveFurniture();
        }
    };
    reader.readAsDataURL(file);
    return true;
}

function refreshRecordRuntime(record, options = {}) {
    const deployed = deployRecord(record);
    const validation = validateRuntimePlacement(deployed.group, record.id);
    if (!validation.ok) {
        return validation;
    }
    deployed.collider = createFurnitureCollider(deployed.group);
    deployed.colliders = createFurnitureColliders(deployed.group);
    deployed.waypoint = createWaypoint(record, deployed.group);
    runtime.set(record.id, deployed);
    saveFurniture();
    onFurnitureChanged({
        furnitureId: record.id,
        forceCharacterRepath: Boolean(options.forceCharacterRepath)
    });
    controlsModule?.resolveCameraCollisions?.();
    return { ok: true };
}

function tryPoseEdit(record, nextPose, successText) {
    const previous = copyPose(record.pose);
    record.pose = copyPose(nextPose);
    const result = refreshRecordRuntime(record);
    if (!result.ok) {
        record.pose = previous;
        refreshRecordRuntime(record);
        const error = result.error || '移动失败，已回滚。';
        setEditorStatus(error, 'warn');
        showDreamScreenToast(error, 'warn');
        return false;
    }
    if (successText) setEditorStatus(successText, 'ok');
    positionObjectControls();
    return true;
}

function getEditMoveDelta(intent, amount) {
    let forwardX = 0;
    let forwardZ = -1;
    if (camera) {
        camera.getWorldDirection(lookDirection);
        lookDirection.y = 0;
        if (lookDirection.lengthSq() > 0.0001) {
            lookDirection.normalize();
            if (Math.abs(lookDirection.x) >= Math.abs(lookDirection.z)) {
                forwardX = Math.sign(lookDirection.x) || 1;
                forwardZ = 0;
            } else {
                forwardX = 0;
                forwardZ = Math.sign(lookDirection.z) || 1;
            }
        }
    }

    let axisX = forwardX;
    let axisZ = forwardZ;
    if (intent === 'back') {
        axisX = -forwardX;
        axisZ = -forwardZ;
    } else if (intent === 'left') {
        axisX = forwardZ;
        axisZ = -forwardX;
    } else if (intent === 'right') {
        axisX = -forwardZ;
        axisZ = forwardX;
    }

    return { dx: axisX * amount, dz: axisZ * amount };
}

function getWallMoveDelta(record, intent, amount) {
    if (intent === 'forward') return { dx: 0, dy: amount, dz: 0 };
    if (intent === 'back') return { dx: 0, dy: -amount, dz: 0 };
    const wall = record.pose?.wall || 'front';
    let tangentX = wall === 'front' || wall === 'back' ? 1 : 0;
    let tangentZ = wall === 'front' || wall === 'back' ? 0 : 1;

    if (camera) {
        camera.getWorldDirection(lookDirection);
        lookDirection.y = 0;
        if (lookDirection.lengthSq() > 0.0001) {
            lookDirection.normalize();
            const rightX = -lookDirection.z;
            const rightZ = lookDirection.x;
            const dot = rightX * tangentX + rightZ * tangentZ;
            if (dot < 0) {
                tangentX *= -1;
                tangentZ *= -1;
            }
        }
    }

    const sign = intent === 'left' ? -1 : 1;
    return { dx: tangentX * sign * amount, dy: 0, dz: tangentZ * sign * amount };
}

function moveEditingFurnitureByIntent(intent, amount) {
    const record = getEditingRecord();
    if (!record) return;
    if (isWallFurniture(record)) {
        const wallAmount = Math.max(0.01, Math.abs(amount || MOVE_STEP) / MOVE_STEP * WALL_MOVE_STEP);
        const delta = getWallMoveDelta(record, intent, wallAmount);
        moveEditingWallFurniture(delta);
        return;
    }
    const delta = getEditMoveDelta(intent, amount);
    moveEditingFurniture(delta.dx, delta.dz);
}

function moveEditingWallFurniture(delta) {
    const record = getEditingRecord();
    if (!record) return;
    const next = copyPose(record.pose);
    next.position.x += delta.dx || 0;
    next.position.y += delta.dy || 0;
    next.position.z += delta.dz || 0;
    next.wall = record.pose?.wall || next.wall;
    next.anchor = 'wall';
    if (!tryPoseEdit(record, next, '')) {
        const axisText = delta.dy > 0 ? '天花板' : delta.dy < 0 ? '地板' : '墙面边缘';
        showDreamScreenToast(`已到达${axisText}边缘，无法继续移动。`, 'warn');
    }
}

function moveEditingFurniture(dx, dz) {
    const record = getEditingRecord();
    if (!record) return;
    const next = copyPose(record.pose);
    next.position.x += dx;
    next.position.z += dz;
    tryPoseEdit(record, next, '');
}

function rotateEditingFurniture(amount) {
    const record = getEditingRecord();
    if (!record) return;
    if (isWallFurniture(record)) {
        showDreamScreenToast('悬挂式家具不能旋转。', 'warn');
        return;
    }
    const next = copyPose(record.pose);
    next.rotationY += amount;
    tryPoseEdit(record, next, '');
}

function handleAutoPlaceEdit() {
    const record = getEditingRecord();
    if (!record) return;
    const text = els.editorPlacement?.value.trim() || '';
    try {
        const { group, spec } = createFurnitureFromSpec(record.spec);
        const placement = findSafePlacement(group, spec, text, record.id);
        if (!placement.ok) {
            setEditorStatus(placement.error || '没有安全摆放位置。', 'warn');
            return;
        }
        if (tryPoseEdit(record, placement.pose, '')) {
            closePlacementEditPanel();
        }
    } catch (err) {
        setEditorStatus(err.message || '重新摆放失败。', 'warn');
    }
}

async function handleStyleRevision() {
    if (isRevising || pendingRevision) return;
    const record = getEditingRecord();
    if (!record) return;
    if (isWallFurniture(record)) {
        setEditorStatus('悬挂式家具无法编辑样式。', 'warn');
        return;
    }
    const instruction = els.editorStyleInstruction?.value.trim() || '';
    if (!instruction) {
        setEditorStatus('请先填写家具样式修改要求。', 'warn');
        return;
    }

    if (!canAfford(DREAM_REVISION_COST)) {
        setEditorStatus(`余额不足，需要 ${formatMoney(DREAM_REVISION_COST)}。`, 'warn');
        return;
    }
    const settings = getSettings();
    if (!settings.apiKey) {
        setEditorStatus('未配置 API Key。请先在设置面板填写 API Key。', 'warn');
        return;
    }

    isRevising = true;
    if (els.editorStyleButton) els.editorStyleButton.disabled = true;
    updateStyleRevisionProgress(true, '正在解析样式修改要求...');

    try {
        const previousSpec = copyJson(record.spec);
        const roomContext = {
            bounds: vectorToPlainBounds(dreamRoomBounds),
            doorClearanceZone: vectorToPlainBounds(doorClearanceZone)
        };
        const llm = await requestDreamFurnitureRevision({
            furniture: record,
            instruction,
            roomContext,
            settings
        });
        if (!llm.ok) {
            setEditorStatus(llm.error || '家具样式修改请求失败。', 'warn');
            return;
        }

        updateStyleRevisionProgress(true, '正在校验新的家具结构...');
        let revisedSpec;
        try {
            revisedSpec = normalizeFurnitureSpec(llm.spec);
            revisedSpec.name = previousSpec.name || record.name;
            revisedSpec.description = previousSpec.description || record.description;
            revisedSpec.anchor = previousSpec.anchor || 'floor';
            revisedSpec.category = previousSpec.category || record.category;
            revisedSpec = alignHangingAttachmentsOnFurniture(revisedSpec, instruction);
            revisedSpec.anchor = previousSpec.anchor || 'floor';
            revisedSpec.category = previousSpec.category || record.category;
        } catch (err) {
            setEditorStatus(`JSON schema 校验失败：${err.message}`, 'warn');
            return;
        }

        let created;
        try {
            created = createFurnitureFromSpec(revisedSpec);
            applyRecordPoseToGroup(created.group, {
                ...record,
                spec: revisedSpec,
                pose: copyPose(record.pose)
            });
        } catch (err) {
            setEditorStatus(`家具尺寸或组件校验失败：${err.message}`, 'warn');
            return;
        }

        updateStyleRevisionProgress(true, '正在检查房间安全边界...');
        const validation = validateRuntimePlacement(created.group, record.id);
        if (!validation.ok) {
            setEditorStatus(validation.error || '修改后的家具无法安全放置。', 'warn');
            return;
        }

        updateStyleRevisionProgress(true, '正在部署样式预览...');
        record.spec = revisedSpec;
        const refresh = refreshRecordRuntime(record, { forceCharacterRepath: true });
        if (!refresh.ok) {
            record.spec = previousSpec;
            refreshRecordRuntime(record, { forceCharacterRepath: true });
            setEditorStatus(refresh.error || '样式预览部署失败。', 'warn');
            return;
        }
        if (!spendMoney(DREAM_REVISION_COST)) {
            record.spec = previousSpec;
            refreshRecordRuntime(record, { forceCharacterRepath: true });
            setEditorStatus('扣款失败，样式修改已回滚。', 'warn');
            return;
        }
        renderBalance();

        pendingRevision = {
            furnitureId: record.id,
            previousSpec,
            previewSpec: copyJson(revisedSpec),
            createdAt: Date.now()
        };
        closeRevisionOverlaysForPreview();
        showRevisionConfirmBar();
        showDreamScreenToast('样式预览已生成，请确认或回退。', 'ok');
    } catch (err) {
        console.error('[Dream] style revision failed:', err);
        setEditorStatus(`未知错误：${err.message || err}`, 'warn');
    } finally {
        isRevising = false;
        if (els.editorStyleButton) els.editorStyleButton.disabled = isWallFurniture(getEditingRecord());
        updateStyleRevisionProgress(false);
    }
}

function closeRevisionOverlaysForPreview() {
    stopObjectControlsProjection();
    els.objectControls?.classList.add('hidden');
    els.editor?.classList.add('hidden');
    els.placementPanel?.classList.add('hidden');
    controlsModule?.setMovementLocked?.(false);
    editingId = null;
    editSnapshot = null;
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: 'dream-furniture-editor-panel' } }));
}

function showRevisionConfirmBar() {
    els.revisionConfirmBar?.classList.remove('hidden');
    document.body?.classList.add('dream-revision-pending');
}

function hideRevisionConfirmBar() {
    els.revisionConfirmBar?.classList.add('hidden');
    document.body?.classList.remove('dream-revision-pending');
}

function dispatchRevisionAction(code) {
    document.dispatchEvent(new CustomEvent('fritia-action', { detail: { code } }));
}

function restoreControlAfterRevision() {
    controlsModule?.setMovementLocked?.(false);
    controlsModule?.setLookLocked?.(false);
    controlsModule?.resolveCameraCollisions?.();
    controlsModule?.forceEnterControlMode?.();
}

export function confirmPendingDreamRevision() {
    if (!pendingRevision) return;
    const record = furnitureRecords.find(item => item.id === pendingRevision.furnitureId);
    if (record) {
        refreshRecordRuntime(record, { forceCharacterRepath: true });
        record.revisionCount = Math.max(0, Math.round(Number(record.revisionCount) || 0)) + 1;
        saveFurniture();
        recordDreamFurnitureRevision(record.revisionCount);
    }
    pendingRevision = null;
    hideRevisionConfirmBar();
    restoreControlAfterRevision();
    showDreamScreenToast('家具样式已确认。', 'ok');
}

export function rollbackPendingDreamRevision() {
    if (!pendingRevision) return;
    const record = furnitureRecords.find(item => item.id === pendingRevision.furnitureId);
    if (record) {
        record.spec = pendingRevision.previousSpec;
        refreshRecordRuntime(record, { forceCharacterRepath: true });
        saveFurniture();
    }
    addMoney(DREAM_REVISION_REFUND, 'dream_furniture_revision_refund');
    pendingRevision = null;
    hideRevisionConfirmBar();
    restoreControlAfterRevision();
    showDreamScreenToast(`已回退样式，并返还 ${formatMoney(DREAM_REVISION_REFUND)}。`, 'warn');
}

function handleRename() {
    const record = getEditingRecord();
    if (!record) return;
    const name = clampName(els.editorName?.value, record.name);
    record.name = name;
    if (record.spec) record.spec.name = name;
    if (els.editorTitle) els.editorTitle.textContent = name;
    const runtimeItem = runtime.get(record.id);
    if (runtimeItem) {
        runtimeItem.group.name = name;
        runtimeItem.waypoint.furnitureName = name;
    }
    saveFurniture();
    onFurnitureChanged();
    setEditorStatus('名称已保存。', 'ok');
}

function resetEditingFurniture() {
    const record = getEditingRecord();
    if (!record || !editSnapshot) return;
    tryPoseEdit(record, editSnapshot, '已重置到打开面板时的位置。');
}

function handleDeleteFurniture() {
    const record = getEditingRecord();
    if (!record) return;
    if (!confirm(`确定删除「${record.name}」吗？`)) return;
    const index = furnitureRecords.findIndex(item => item.id === record.id);
    if (index >= 0) furnitureRecords.splice(index, 1);
    removeRuntimeFurniture(record.id);
    saveFurniture();
    addMoney(DREAM_DELETE_REFUND, 'dream_furniture_refund');
    onFurnitureChanged();
    closeDreamFurnitureEditor();
}

function showDreamScreenToast(text, kind = '') {
    if (!els.screenToast || !text) return;
    els.screenToast.textContent = text;
    els.screenToast.dataset.kind = kind;
    els.screenToast.classList.remove('hidden', 'show');
    void els.screenToast.offsetWidth;
    els.screenToast.classList.add('show');
    clearTimeout(screenToastTimer);
    screenToastTimer = setTimeout(() => {
        els.screenToast.classList.remove('show');
        setTimeout(() => els.screenToast?.classList.add('hidden'), 260);
    }, 2600);
}

function getFallbackFurnitureLine() {
    const lines = FALLBACK_FURNITURE_LINES
        .map(line => String(line || '').trim())
        .filter(Boolean);
    return lines[Math.floor(Math.random() * lines.length)] || '分析员打造的家具太棒啦。';
}

function easeInOutCubic(t) {
    const x = clamp(Number(t) || 0, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function lerpAngle(a, b, t) {
    const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
    return a + diff * t;
}

function getFurnitureLookTarget(record, out) {
    const item = runtime.get(record?.id);
    if (!item) return false;
    if (item.collider) {
        item.collider.getCenter(out);
        return true;
    }
    if (item.group) {
        item.group.updateMatrixWorld(true);
        characterBubbleBox.setFromObject(item.group);
        characterBubbleBox.getCenter(out);
        return Number.isFinite(out.x);
    }
    return false;
}

function waitForCharacterFacingFurniture(record, duration = 460) {
    const root = getCharacterRoot?.();
    if (!root || !getFurnitureLookTarget(record, furnitureSpeechTarget)) return Promise.resolve(false);

    const dx = furnitureSpeechTarget.x - root.position.x;
    const dz = furnitureSpeechTarget.z - root.position.z;
    if (Math.hypot(dx, dz) < 0.05) return Promise.resolve(false);

    const token = ++furnitureSpeechTurnToken;
    const startYaw = root.rotation.y;
    const targetYaw = Math.atan2(dx, dz);
    const startedAt = performance.now();

    return new Promise(resolve => {
        const tick = (now) => {
            if (token !== furnitureSpeechTurnToken) {
                resolve(false);
                return;
            }
            const t = clamp((now - startedAt) / duration, 0, 1);
            root.rotation.y = lerpAngle(startYaw, targetYaw, easeInOutCubic(t));
            if (t < 1) {
                requestAnimationFrame(tick);
                return;
            }
            root.rotation.y = targetYaw;
            resolve(true);
        };
        requestAnimationFrame(tick);
    });
}

async function handleFurnitureVisited(event) {
    const furnitureId = event.detail?.furnitureId;
    const record = furnitureRecords.find(item => item.id === furnitureId);
    if (!record) return;
    if (!canShowFurnitureDialogue()) return;
    const now = Date.now();
    if (now - (Number(record.lastDialogueAt) || 0) < getDreamDialogueCooldownMs()) return;

    let line = '';
    const shouldCallLlm = Math.random() < FURNITURE_DIALOGUE_LLM_RATE;
    const settings = getSettings();
    if (shouldCallLlm && settings.apiKey) {
        const result = await requestFurnitureRomanticLine({
            furniture: record,
            gameTimeContext: getGameTimeContext(),
            settings
        });
        if (result.ok && result.line) {
            line = result.line;
            console.log('[Dream] furniture romantic line bubble:', line);
        } else {
            console.warn('[Dream] furniture romantic line fallback:', result.error || result);
        }
    } else {
        console.log('[Dream] furniture romantic line fallback: skipped LLM');
    }
    if (!line) line = getFallbackFurnitureLine();
    await waitForCharacterFacingFurniture(record);
    showCharacterSpeechBubble(line);
    record.lastDialogueAt = now;
    saveFurniture();
}

function ensureCharacterBubble() {
    if (els.characterBubble) return els.characterBubble;
    const bubble = document.createElement('div');
    bubble.className = 'dream-character-bubble';
    document.body.appendChild(bubble);
    els.characterBubble = bubble;
    return bubble;
}

function getCharacterBubbleWorldPosition(out) {
    const root = getCharacterRoot?.();
    if (!root) return false;
    root.updateMatrixWorld(true);
    const headBone = root.skeleton?.bones?.find(bone => /head|頭|头|闋/i.test(bone.name || ''));
    if (headBone) {
        headBone.getWorldPosition(out);
        out.y += 0.34;
    } else {
        characterBubbleBox.setFromObject(root);
        characterBubbleBox.getCenter(out);
        out.y = characterBubbleBox.max.y + 0.28;
    }
    return true;
}

function isCharacterBubbleInCameraView() {
    if (!camera || !getCharacterBubbleWorldPosition(projectedBubblePosition)) return false;
    projectedBubblePosition.project(camera);
    return projectedBubblePosition.z > -1
        && projectedBubblePosition.z < 1
        && projectedBubblePosition.x > -0.98
        && projectedBubblePosition.x < 0.98
        && projectedBubblePosition.y > -0.98
        && projectedBubblePosition.y < 0.98;
}

function updateCharacterBubblePosition() {
    if (!els.characterBubble || els.characterBubble.classList.contains('hidden') || !camera) return;
    if (!getCharacterBubbleWorldPosition(projectedBubblePosition)) {
        els.characterBubble.classList.add('hidden');
        return;
    }
    projectedBubbleNdc.copy(projectedBubblePosition).project(camera);
    const rect = els.characterBubble.getBoundingClientRect();
    const bubbleWidth = rect.width || 360;
    const bubbleHeight = rect.height || 80;
    const margin = 14;
    const bubbleLift = 18;
    const halfWidth = bubbleWidth / 2;
    const minX = margin + halfWidth;
    const maxX = window.innerWidth - margin - halfWidth;
    const inFront = projectedBubbleNdc.z > -1 && projectedBubbleNdc.z < 1;
    const ndcX = inFront ? projectedBubbleNdc.x : -projectedBubbleNdc.x;
    const ndcY = inFront ? projectedBubbleNdc.y : -projectedBubbleNdc.y;
    const attached = inFront
        && projectedBubbleNdc.x >= -0.96
        && projectedBubbleNdc.x <= 0.96
        && projectedBubbleNdc.y >= -0.96
        && projectedBubbleNdc.y <= 0.96;
    const arrowExtra = attached ? 8 : 0;
    const minAnchorY = margin + bubbleHeight + bubbleLift;
    const maxAnchorY = window.innerHeight - margin + bubbleLift - arrowExtra;
    const rawX = (ndcX * 0.5 + 0.5) * window.innerWidth;
    const rawAnchorY = (-ndcY * 0.5 + 0.5) * window.innerHeight;
    const x = THREE.MathUtils.clamp(rawX, minX, Math.max(minX, maxX));
    const y = THREE.MathUtils.clamp(rawAnchorY, minAnchorY, Math.max(minAnchorY, maxAnchorY));
    els.characterBubble.style.opacity = '';
    els.characterBubble.style.left = `${x}px`;
    els.characterBubble.style.top = `${y}px`;
    els.characterBubble.dataset.edge = attached ? '' : '1';
}

function stopCharacterBubbleProjection() {
    if (characterBubbleFrame) {
        cancelAnimationFrame(characterBubbleFrame);
        characterBubbleFrame = null;
    }
}

function showCharacterSpeechBubble(line) {
    const bubble = ensureCharacterBubble();
    bubble.textContent = line;
    bubble.classList.remove('hidden', 'show');
    updateCharacterBubblePosition();
    void bubble.offsetWidth;
    bubble.classList.add('show');
    stopCharacterBubbleProjection();
    const tick = () => {
        updateCharacterBubblePosition();
        characterBubbleFrame = requestAnimationFrame(tick);
    };
    tick();
    clearTimeout(characterBubbleTimer);
    characterBubbleTimer = setTimeout(() => {
        bubble.classList.remove('show');
        stopCharacterBubbleProjection();
        setTimeout(() => bubble.classList.add('hidden'), 220);
    }, 5200);
}

function showDreamToast(line, furnitureName) {
    const host = document.getElementById('achievement-toast-host') || document.body;
    const toast = document.createElement('div');
    toast.className = 'dream-line-toast';
    toast.innerHTML = `
        <img src="src/_logos/Profile_Fritia.png" alt="">
        <div>
            <strong>${escapeHtml(furnitureName || '梦造家具')}</strong>
            <span>${escapeHtml(line)}</span>
        </div>
    `;
    host.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 20);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 5200);
}

export function getDreamFurnitureInteractables() {
    return Array.from(runtime.values()).map(item => item.group);
}

export function getDreamFurnitureColliders() {
    return Array.from(runtime.values())
        .flatMap(item => item.colliders || (item.collider ? [item.collider] : []))
        .filter(Boolean);
}

export function getDreamFurnitureWaypoints() {
    return Array.from(runtime.values()).map(item => item.waypoint).filter(Boolean);
}

export function getDreamFurnitureLabel(furnitureId) {
    const record = furnitureRecords.find(item => item.id === furnitureId);
    return escapeHtml(record?.name || '家具');
}

function buildDreamFurnitureDialogueContext() {
    if (furnitureRecords.length === 0) return '';
    const lines = furnitureRecords.slice(0, 20).map((item, index) => {
        const desc = item.playerDescription || item.description || item.spec?.description || '';
        return `${index + 1}. ${item.name} (${item.category || 'custom'}): ${desc}`;
    });
    return [
        'Dream room furniture context. The player personally created these items. In daily chat, if the player asks about or mentions them, answer using the furniture names and player-provided descriptions:',
        ...lines
    ].join('\n');
}

export function getDreamFurnitureDialogueContext() {
    return buildDreamFurnitureDialogueContext();
    if (furnitureRecords.length === 0) return '';
    const lines = furnitureRecords.slice(0, 20).map((item, index) => {
        const desc = item.playerDescription || item.description || item.spec?.description || '';
        return `${index + 1}. ${item.name}（${item.category || 'custom'}）：${desc}`;
    });
    return [
        '玩家在造梦房间亲手制造的家具如下。回答日常对话时，如果玩家询问或提到这些家具，请结合家具名称和玩家原始描述作答：',
        ...lines
    ].join('\n');
}

export function exportDreamFurniture() {
    return furnitureRecords.map(serializeFurniture);
}

export function importDreamFurniture(data) {
    if (!Array.isArray(data)) return { added: 0, skipped: 0 };
    const existingIds = new Set(furnitureRecords.map(item => item.id));
    const acceptedColliders = [];
    let added = 0;
    let skipped = 0;
    for (const item of data) {
        const record = deserializeFurniture(item);
        if (!record) {
            skipped++;
            continue;
        }
        if (existingIds.has(record.id)) continue;
        const tempDoor = doorClearanceZone;
        doorClearanceZone = doorClearanceZone || boxFromPlain(item.doorClearanceZone);
        try {
            const { group } = createFurnitureFromSpec(record.spec);
            applyRecordPoseToGroup(group, record);
            const validation = validateRuntimePlacement(group, record.id);
            if (!validation.ok) {
                skipped++;
                continue;
            }
            const colliders = createFurnitureColliders(group);
            if (colliders.some(collider => acceptedColliders.some(existing => existing.intersectsBox(collider)))) {
                skipped++;
                continue;
            }
            furnitureRecords.push(record);
            acceptedColliders.push(...colliders);
            existingIds.add(record.id);
            added++;
        } catch {
            skipped++;
        } finally {
            doorClearanceZone = tempDoor;
        }
    }
    if (added > 0) {
        saveFurniture();
        refreshRuntimeFurniture();
    }
    return { added, skipped };
}

export function refreshDreamFurnitureAfterImport() {
    refreshRuntimeFurniture();
}
