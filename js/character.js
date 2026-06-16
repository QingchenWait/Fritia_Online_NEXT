import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';

const MODEL_PATH = 'src/_fritia_3d_model/驰掣-毛绒派对.pmx';
const TARGET_HEIGHT = 1.55;
const WALK_SPEED = 1.0;
const WALK_CYCLE_SPEED = 6.0;
const IDLE_MIN = 3;
const IDLE_MAX = 8;
const SIT_MIN = 8;
const SIT_MAX = 20;
const SIT_COOLDOWN = 5.0;

const STATES = {
    LOADING: 'loading',
    IDLE: 'idle',
    WALKING: 'walking',
    TURNING_TO_SIT: 'turning_to_sit',
    STAND_TO_SIT: 'stand_to_sit',
    SITTING: 'sitting',
    SIT_TO_STAND: 'sit_to_stand',
    INTERACTING: 'interacting'
};

const BONE_MAP = {
    center:    ['センター', 'center', 'Center', 'Hips'],
    groove:    ['グルーブ', 'Groove'],
    spine:     ['上半身', 'UpperBody', 'Spine'],
    spine2:    ['上半身2', 'UpperBody2', 'Chest'],
    neck:      ['首', 'Neck'],
    head:      ['頭', 'Head'],
    leftShoulder: ['左肩', 'LeftShoulder'],
    leftShoulderC: ['左肩C'],
    leftArm:   ['左腕捩', '左腕', 'LeftArm', 'LeftUpperArm'],
    leftElbow: ['左ひじ', 'LeftElbow', 'LeftLowerArm'],
    rightShoulder: ['右肩', 'RightShoulder'],
    rightShoulderC: ['右肩C'],
    rightArm:  ['右腕捩', '右腕', 'RightArm', 'RightUpperArm'],
    rightElbow:['右ひじ', 'RightElbow', 'RightLowerArm'],
    leftLeg:   ['左足D', '左足', 'LeftLeg', 'LeftUpperLeg'],
    leftKnee:  ['左ひざD', '左ひざ', 'LeftKnee', 'LeftLowerLeg'],
    leftAnkle: ['左足首D', '左足首', 'LeftAnkle', 'LeftFoot'],
    rightLeg:  ['右足D', '右足', 'RightLeg', 'RightUpperLeg'],
    rightKnee: ['右ひざD', '右ひざ', 'RightKnee', 'RightLowerLeg'],
    rightAnkle:['右足首D', '右足首', 'RightAnkle', 'RightFoot'],
};

function buildBoneRef(bones) {
    const ref = {};
    const nameSet = new Set(bones.map(b => b.name));
    for (const [key, candidates] of Object.entries(BONE_MAP)) {
        for (const name of candidates) {
            if (nameSet.has(name)) {
                ref[key] = bones.find(b => b.name === name);
                break;
            }
        }
    }
    return ref;
}

function randomRange(min, max) { return min + Math.random() * (max - min); }

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

function addRot(bone, x, y, z) {
    if (!bone) return;
    bone.rotation.x += x;
    bone.rotation.y += y;
    bone.rotation.z += z;
}

function resetAllBones(cd) {
    for (const bone of cd.bones) {
        bone.rotation.set(0, 0, 0);
    }
    for (const [key, bone] of Object.entries(cd.boneRef)) {
        if (bone && cd.initialPositions[key]) {
            bone.position.copy(cd.initialPositions[key]);
        }
    }
}

function forceUpdate(cd) {
    if (cd.skeleton) cd.skeleton.update();
    if (cd.mesh) cd.mesh.updateMatrixWorld(true);
}

export function loadCharacter(scene, waypoints, colliders, onProgress) {
    return new Promise((resolve, reject) => {
        if (onProgress) onProgress(10);
        const loader = new MMDLoader();
        loader.load(
            MODEL_PATH,
            (mesh) => {
                try {
                    mesh.name = 'FritiaPMX';
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    if (onProgress) onProgress(60);

                    const box = new THREE.Box3().setFromObject(mesh);
                    const rawHeight = box.max.y - box.min.y;
                    const autoScale = rawHeight > 0 ? TARGET_HEIGHT / rawHeight : 1;
                    mesh.scale.set(autoScale, autoScale, autoScale);
                    const scaledBox = new THREE.Box3().setFromObject(mesh);
                    const groundOffset = -scaledBox.min.y;
                    mesh.position.set(0, groundOffset, 0);
                    scene.add(mesh);
                    if (onProgress) onProgress(80);

                    const skeleton = mesh.skeleton;
                    const bones = skeleton ? skeleton.bones : [];
                    const boneRef = buildBoneRef(bones);

                    console.log('[Bone] 匹配:', Object.entries(boneRef)
                        .filter(([, v]) => v).map(([k, v]) => `${k}→${v?.name}`).join(', '));
                    console.log('[Bone] 左肩C:', boneRef.leftShoulderC?.name, '右肩C:', boneRef.rightShoulderC?.name);

                    const initialPositions = {};
                    for (const [key, bone] of Object.entries(boneRef)) {
                        if (bone) initialPositions[key] = bone.position.clone();
                    }

                    let blinkIndex = -1;
                    if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
                        for (const name of ['まばたき', 'blink', '眨眼']) {
                            if (mesh.morphTargetDictionary[name] !== undefined) {
                                blinkIndex = mesh.morphTargetDictionary[name];
                                break;
                            }
                        }
                    }

                    const charData = {
                        root: mesh, mesh, skeleton, bones, boneRef,
                        initialPositions, colliders: colliders || [],
                        state: STATES.IDLE,
                        currentWaypoint: null, stateTimer: 0,
                        idleDuration: randomRange(IDLE_MIN, IDLE_MAX),
                        sitDuration: randomRange(SIT_MIN, SIT_MAX),
                        walkProgress: 0,
                        walkStart: new THREE.Vector3(),
                        walkEnd: new THREE.Vector3(),
                        transitionProgress: 0, transitionDuration: 1.2,
                        blinkIndex, nextBlink: Math.random() * 3 + 2,
                        blinkTimer: 0, isBlinking: false,
                        waypoints, faceDirection: 0,
                        baseY: groundOffset,
                        hasAnimation: bones.length > 0,
                        walkCycle: 0
                    };

                    applyIdlePose(charData);

                    if (onProgress) onProgress(100);
                    console.log('[PMX] ✓ 角色加载完成!');
                    resolve(charData);
                } catch (err) {
                    console.error('[PMX] 处理失败:', err.message, err.stack);
                    reject(err);
                }
            },
            (xhr) => {
                if (xhr.lengthComputable && onProgress)
                    onProgress(10 + (xhr.loaded / xhr.total) * 45);
            },
            (err) => reject(err)
        );
    });
}

export function updateCharacter(cd, delta) {
    if (!cd || cd.state === STATES.LOADING) return;
    cd.stateTimer += delta;
    updateBlink(cd, delta);

    switch (cd.state) {
        case STATES.IDLE: updateIdle(cd, delta); break;
        case STATES.WALKING: updateWalking(cd, delta); break;
        case STATES.TURNING_TO_SIT: updateTurningToSit(cd, delta); break;
        case STATES.STAND_TO_SIT: updateSitTransition(cd, delta); break;
        case STATES.SITTING: updateSitting(cd, delta); break;
        case STATES.SIT_TO_STAND: updateStandTransition(cd, delta); break;
        case STATES.INTERACTING: updateBreathing(cd); break;
    }
}

function updateBlink(cd, delta) {
    if (cd.blinkIndex < 0 || !cd.mesh.morphTargetInfluences) return;
    cd.blinkTimer += delta;
    if (!cd.isBlinking && cd.blinkTimer >= cd.nextBlink) {
        cd.isBlinking = true;
        cd.blinkTimer = 0;
    }
    if (cd.isBlinking) {
        const d = 0.15;
        if (cd.blinkTimer < d / 2)
            cd.mesh.morphTargetInfluences[cd.blinkIndex] = cd.blinkTimer / (d / 2);
        else if (cd.blinkTimer < d)
            cd.mesh.morphTargetInfluences[cd.blinkIndex] = 1 - (cd.blinkTimer - d / 2) / (d / 2);
        else {
            cd.mesh.morphTargetInfluences[cd.blinkIndex] = 0;
            cd.isBlinking = false;
            cd.blinkTimer = 0;
            cd.nextBlink = Math.random() * 4 + 2;
        }
    }
}

function updateBreathing(cd) {
    if (!cd.hasAnimation) return;
    const t = performance.now() * 0.001;
    const sp = cd.boneRef.spine2 || cd.boneRef.spine;
    if (sp) sp.rotation.x = Math.sin(t * 1.5) * 0.008;
    forceUpdate(cd);
}

function applyIdlePose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);
    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) lc.rotation.z = -0.5;
    if (rc) rc.rotation.z = 0.5;
    addRot(cd.boneRef.leftElbow, 0.15, 0, 0);
    addRot(cd.boneRef.rightElbow, 0.15, 0, 0);
    updateBreathing(cd);
}

function applyWalkPose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);

    const s = Math.sin(cd.walkCycle);
    const cs = Math.cos(cd.walkCycle);

    const cb = cd.boneRef.center;
    if (cb && cd.initialPositions.center) {
        cb.position.y = cd.initialPositions.center.y + Math.abs(cs) * 0.04;
    }

    addRot(cd.boneRef.spine, 0, -s * 0.08, 0);
    addRot(cd.boneRef.spine2, 0, -s * 0.05, s * 0.015);

    addRot(cd.boneRef.leftLeg, s * 0.5, 0, 0);
    addRot(cd.boneRef.rightLeg, -s * 0.5, 0, 0);
    addRot(cd.boneRef.leftKnee, Math.max(0, s) * 0.6, 0, 0);
    addRot(cd.boneRef.rightKnee, Math.max(0, -s) * 0.6, 0, 0);

    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) lc.rotation.z = -0.5;
    if (rc) rc.rotation.z = 0.5;

    const la = cd.boneRef.leftArm;
    const ra = cd.boneRef.rightArm;
    if (la) la.rotation.x = -s * 0.4;
    if (ra) ra.rotation.x = s * 0.4;

    const elbowBendL = 0.15 + Math.max(0, -s) * 0.25;
    const elbowBendR = 0.15 + Math.max(0, s) * 0.25;
    addRot(cd.boneRef.leftElbow, elbowBendL * 0.5, 0, 0.15);
    addRot(cd.boneRef.rightElbow, elbowBendR * 0.5, 0, -0.15);

    addRot(cd.boneRef.head, 0, s * 0.03, 0);
    forceUpdate(cd);
}

function applySittingPose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);

    const centerBone = cd.boneRef.center;
    if (centerBone && cd.initialPositions.center) {
        centerBone.position.y = cd.initialPositions.center.y + 0.7;
    }

    addRot(cd.boneRef.spine, 0.15, 0, 0);
    addRot(cd.boneRef.spine2, 0.1, 0, 0);
    addRot(cd.boneRef.leftLeg, -1.1, 0, 0);
    addRot(cd.boneRef.rightLeg, -1.1, 0, 0);
    addRot(cd.boneRef.leftKnee, 1.5, 0, 0);
    addRot(cd.boneRef.rightKnee, 1.5, 0, 0);

    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) { lc.rotation.z = -0.5; }
    if (rc) { rc.rotation.z = 0.5; }

    const ls = cd.boneRef.leftShoulder;
    const rs = cd.boneRef.rightShoulder;
    if (ls) ls.rotation.x = -0.5;
    if (rs) rs.rotation.x = -0.5;

    addRot(cd.boneRef.leftElbow, 0.8, 0, 0);
    addRot(cd.boneRef.rightElbow, 0.8, 0, 0);
    forceUpdate(cd);
}

function capturePose(cd) {
    const pose = {};
    for (const bone of cd.bones) {
        pose[bone.name] = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
    }
    pose.__positions = {};
    for (const [key, bone] of Object.entries(cd.boneRef)) {
        if (bone) pose.__positions[key] = bone.position.clone();
    }
    return pose;
}

function applySnapshot(cd, pose) {
    for (const bone of cd.bones) {
        const r = pose[bone.name];
        if (r) bone.rotation.set(r.x, r.y, r.z);
    }
    if (pose.__positions) {
        for (const [key, pos] of Object.entries(pose.__positions)) {
            const bone = cd.boneRef[key];
            if (bone) bone.position.copy(pos);
        }
    }
    forceUpdate(cd);
}

function lerpPose(cd, from, to, t) {
    for (const bone of cd.bones) {
        const f = from[bone.name];
        const tt = to[bone.name];
        if (f && tt) {
            bone.rotation.x = f.x + (tt.x - f.x) * t;
            bone.rotation.y = f.y + (tt.y - f.y) * t;
            bone.rotation.z = f.z + (tt.z - f.z) * t;
        }
    }
    if (from.__positions && to.__positions) {
        for (const [key] of Object.entries(cd.boneRef)) {
            const bone = cd.boneRef[key];
            if (bone && from.__positions[key] && to.__positions[key]) {
                bone.position.lerpVectors(from.__positions[key], to.__positions[key], t);
            }
        }
    }
    forceUpdate(cd);
}

function updateIdle(cd, delta) {
    updateBreathing(cd);
    if (cd.stateTimer > cd.idleDuration) {
        const avail = cd.waypoints.filter(w => w.name !== cd.currentWaypoint?.name);
        if (avail.length === 0) return;
        const target = avail[Math.floor(Math.random() * avail.length)];
        cd.walkEnd.copy(target.position);
        cd.walkStart.copy(cd.root.position);
        cd.walkStart.y = cd.baseY;
        cd.walkProgress = 0;
        cd.walkCycle = 0;
        cd.targetWaypoint = target;
        cd.state = STATES.WALKING;
        cd.stateTimer = 0;
    }
}

const _charBox = new THREE.Box3();
const _charSize = new THREE.Vector3(0.25, 1.5, 0.25);

function checkCollision(cd, pos) {
    if (!cd.colliders || cd.colliders.length === 0) return false;
    _charBox.setFromCenterAndSize(pos, _charSize);
    for (const col of cd.colliders) {
        if (_charBox.intersectsBox(col)) return true;
    }
    return false;
}

function updateWalking(cd, delta) {
    const dist = cd.walkStart.distanceTo(cd.walkEnd);
    if (dist < 0.05) { finishWalking(cd); return; }
    cd.walkProgress += (WALK_SPEED * delta) / dist;
    cd.walkCycle += delta * WALK_CYCLE_SPEED;
    if (cd.walkProgress >= 1) {
        cd.root.position.copy(cd.walkEnd);
        cd.root.position.y = cd.baseY;
        finishWalking(cd);
        return;
    }
    const t = easeInOutCubic(cd.walkProgress);
    const newPos = new THREE.Vector3().lerpVectors(cd.walkStart, cd.walkEnd, t);
    newPos.y = cd.baseY;
    if (checkCollision(cd, newPos)) {
        finishWalking(cd);
        return;
    }
    cd.root.position.copy(newPos);
    const dir = new THREE.Vector3().subVectors(cd.walkEnd, cd.walkStart);
    dir.y = 0;
    if (dir.length() > 0.01) {
        cd.faceDirection = lerpAngle(cd.faceDirection, Math.atan2(dir.x, dir.z), 0.15);
        cd.root.rotation.y = cd.faceDirection;
    }
    applyWalkPose(cd);
}

function finishWalking(cd) {
    const t = cd.targetWaypoint;
    cd.currentWaypoint = t;
    if (t.isFurniture) {
        const now = performance.now() * 0.001;
        const timeSinceStand = cd.standUpTime ? now - cd.standUpTime : Infinity;
        if (timeSinceStand < SIT_COOLDOWN) {
            cd.state = STATES.IDLE;
            cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
            cd.stateTimer = 0;
            applyIdlePose(cd);
            return;
        }
        cd.turnTarget = cd.faceDirection + Math.PI;
        cd.turnStart = cd.faceDirection;
        cd.state = STATES.TURNING_TO_SIT;
        cd.transitionProgress = 0;
        cd.stateTimer = 0;
        applyIdlePose(cd);
    } else {
        cd.state = STATES.IDLE;
        cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
        cd.stateTimer = 0;
        applyIdlePose(cd);
    }
}

const SIT_DROP = 0.35;
const BED_SIT_RAISE = 0.08;

function updateTurningToSit(cd, delta) {
    const TURN_DURATION = 0.8;
    cd.transitionProgress += delta / TURN_DURATION;
    if (cd.transitionProgress >= 1) {
        cd.faceDirection = cd.turnTarget;
        cd.root.rotation.y = cd.faceDirection;
        
        const BACK_OFFSET = 0.4;
        const isBed = cd.currentWaypoint?.furnitureType === 'bed';
        cd.sitStartX = cd.root.position.x;
        cd.sitStartZ = cd.root.position.z;
        cd.sitEndX = cd.root.position.x - Math.sin(cd.faceDirection) * BACK_OFFSET;
        cd.sitEndZ = cd.root.position.z - Math.cos(cd.faceDirection) * BACK_OFFSET;
        
        cd.sitStartY = cd.root.position.y;
        cd.sitEndY = cd.baseY - SIT_DROP + (isBed ? BED_SIT_RAISE : 0);
        cd.sitStart = capturePose(cd);
        applySittingPose(cd);
        cd.sitEnd = capturePose(cd);
        applySnapshot(cd, cd.sitStart);
        cd.state = STATES.STAND_TO_SIT;
        cd.transitionProgress = 0;
        cd.stateTimer = 0;
        return;
    }
    const t = easeInOutCubic(cd.transitionProgress);
    cd.faceDirection = lerpAngle(cd.turnStart, cd.turnTarget, t);
    cd.root.rotation.y = cd.faceDirection;
    updateBreathing(cd);
}

function updateSitTransition(cd, delta) {
    cd.transitionProgress += delta / cd.transitionDuration;
    if (cd.transitionProgress >= 1) {
        applySnapshot(cd, cd.sitEnd);
        cd.root.position.x = cd.sitEndX;
        cd.root.position.y = cd.sitEndY;
        cd.root.position.z = cd.sitEndZ;
        cd.state = STATES.SITTING;
        cd.stateTimer = 0;
        cd.sitDuration = randomRange(SIT_MIN, SIT_MAX);
        return;
    }
    const t = easeInOutCubic(cd.transitionProgress);
    lerpPose(cd, cd.sitStart, cd.sitEnd, t);
    cd.root.position.x = cd.sitStartX + (cd.sitEndX - cd.sitStartX) * t;
    cd.root.position.y = cd.sitStartY + (cd.sitEndY - cd.sitStartY) * t;
    cd.root.position.z = cd.sitStartZ + (cd.sitEndZ - cd.sitStartZ) * t;
}

function updateSitting(cd, delta) {
    updateBreathing(cd);
    cd.root.position.x = cd.sitEndX;
    cd.root.position.y = cd.sitEndY;
    cd.root.position.z = cd.sitEndZ;
    if (cd.stateTimer > cd.sitDuration) {
        cd.sitStart = capturePose(cd);
        cd.sitStandStartX = cd.root.position.x;
        cd.sitStandStartY = cd.root.position.y;
        cd.sitStandStartZ = cd.root.position.z;
        cd.sitStandEndX = cd.sitStartX;
        cd.sitStandEndZ = cd.sitStartZ;
        applyIdlePose(cd);
        cd.sitEnd = capturePose(cd);
        applySnapshot(cd, cd.sitStart);
        cd.state = STATES.SIT_TO_STAND;
        cd.transitionProgress = 0;
        cd.stateTimer = 0;
    }
}

function updateStandTransition(cd, delta) {
    cd.transitionProgress += delta / cd.transitionDuration;
    if (cd.transitionProgress >= 1) {
        applySnapshot(cd, cd.sitEnd);
        cd.root.position.x = cd.sitStandEndX;
        cd.root.position.y = cd.baseY;
        cd.root.position.z = cd.sitStandEndZ;
        cd.state = STATES.IDLE;
        cd.stateTimer = 0;
        cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
        cd.currentWaypoint = null;
        cd.standUpTime = performance.now() * 0.001;
        return;
    }
    const t = easeInOutCubic(cd.transitionProgress);
    lerpPose(cd, cd.sitStart, cd.sitEnd, t);
    cd.root.position.x = cd.sitStandStartX + (cd.sitStandEndX - cd.sitStandStartX) * t;
    cd.root.position.y = cd.sitStandStartY + (cd.baseY - cd.sitStandStartY) * t;
    cd.root.position.z = cd.sitStandStartZ + (cd.sitStandEndZ - cd.sitStandStartZ) * t;
}

export function getCharacterPosition(cd) {
    if (!cd?.root) return new THREE.Vector3();
    return cd.root.position.clone();
}

export function startInteraction(cd, playerPos) {
    if (!cd) return;
    cd.prevState = cd.state;
    cd.state = STATES.INTERACTING;
    const dir = new THREE.Vector3().subVectors(playerPos, cd.root.position);
    dir.y = 0;
    if (dir.length() > 0.01) cd.root.rotation.y = Math.atan2(dir.x, dir.z);
}

export function endInteraction(cd) {
    if (!cd) return;
    if (cd.prevState === STATES.SITTING || cd.prevState === STATES.STAND_TO_SIT || cd.prevState === STATES.TURNING_TO_SIT) {
        cd.state = STATES.SITTING;
    } else {
        cd.state = STATES.IDLE;
        cd.root.position.y = cd.baseY;
        applyIdlePose(cd);
    }
    cd.stateTimer = 0;
}
