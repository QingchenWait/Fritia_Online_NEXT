import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { getBarCollisionCandidates } from './bar_performance.js';

const MODEL_PATH = 'src/_fritia_3d_model/驰掣-毛绒派对.pmx';
const TARGET_HEIGHT = 1.55;
const WALK_SPEED = 1.0;
const WALK_CYCLE_SPEED = 5.2;
const WALK_BLEND_EDGE = 0.18;
const PATH_GRID_STEP = 0.45;
const PATH_SAMPLE_STEP = 0.18;
const PATH_MAX_NODES = 3600;
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
    WAVING: 'waving',
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
    leftArm:   ['左腕', 'LeftArm', 'LeftUpperArm', '左腕捩'],
    leftArmTwist: ['左腕捩', 'LeftArmTwist', 'LeftUpperArmTwist'],
    leftElbow: ['左ひじ', 'LeftElbow', 'LeftLowerArm'],
    rightShoulder: ['右肩', 'RightShoulder'],
    rightShoulderC: ['右肩C'],
    rightArm:  ['右腕', 'RightArm', 'RightUpperArm', '右腕捩'],
    rightArmTwist: ['右腕捩', 'RightArmTwist', 'RightUpperArmTwist'],
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

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function smoothstep01(value) {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
}

function setupTransparentShadows(mesh) {
    if (!mesh.skeleton) return;

    const needsAlphaShadow = mesh.material.some(m => m.transparent || m.alphaTest > 0);
    if (!needsAlphaShadow) return;

    const targetMat = mesh.material.find(m => m.alphaTest > 0) || mesh.material.find(m => m.transparent) || mesh.material[0];

    const vertexShader = `
        #define USE_SKINNING
        #include <common>
        #include <skinning_pars_vertex>
        varying vec2 vUv;
        void main() {
            vUv = uv;
            #include <skinbase_vertex>
            vec3 transformed = vec3(0.0);
            #include <skinning_vertex>
            #include <project_vertex>
        }
    `;
    const fragmentShader = `
        #include <packing>
        uniform sampler2D alphaMap;
        uniform float alphaTest;
        varying vec2 vUv;
        void main() {
            float alpha = texture2D(alphaMap, vUv).a;
            if (alpha < alphaTest) discard;
            gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
        }
    `;

    const customDepthMat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            ...THREE.UniformsLib.common,
            alphaMap: { value: targetMat.map || null },
            alphaTest: { value: targetMat.alphaTest > 0 ? targetMat.alphaTest : 0.5 }
        },
        side: targetMat.side || THREE.FrontSide
    });
    customDepthMat.isMeshDepthMaterial = true;

    mesh.customDepthMaterial = customDepthMat;
    mesh.castShadow = true;
}

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

const _lookTargetPos = new THREE.Vector3();
const _headWorldPos = new THREE.Vector3();
const _headLookDir = new THREE.Vector3();
const _headParentQuat = new THREE.Quaternion();

function resolveLookTarget(getLookTarget) {
    if (typeof getLookTarget !== 'function') return null;
    const target = getLookTarget();
    if (!target) return null;
    if (target.isVector3) return target;
    if (Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z)) {
        return _lookTargetPos.set(target.x, target.y, target.z);
    }
    return null;
}

function faceRootToward(cd, targetPos, delta = 0, options = {}) {
    if (!cd?.root || !targetPos) return;
    const dx = targetPos.x - cd.root.position.x;
    const dz = targetPos.z - cd.root.position.z;
    if (Math.hypot(dx, dz) <= 0.01) return;
    const targetAngle = Math.atan2(dx, dz);
    cd.faceDirection = targetAngle;
    if (options.immediate) {
        cd.root.rotation.y = targetAngle;
        cd.faceDirection = targetAngle;
        return;
    }
    const factor = delta > 0 ? 1 - Math.exp(-(options.lerpSpeed ?? 8.0) * delta) : 1;
    cd.root.rotation.y = lerpAngle(cd.root.rotation.y, targetAngle, factor);
    cd.faceDirection = cd.root.rotation.y;
}

function applyHeadLookAt(cd, targetPos, delta, options = {}) {
    const headBone = cd?.boneRef?.head;
    if (!headBone || !headBone.parent || !targetPos) return false;

    forceUpdate(cd);
    headBone.getWorldPosition(_headWorldPos);
    _headLookDir.subVectors(targetPos, _headWorldPos);
    if (_headLookDir.lengthSq() <= 0.01) return false;

    headBone.parent.getWorldQuaternion(_headParentQuat).invert();
    _headLookDir.applyQuaternion(_headParentQuat).normalize();

    const yaw = Math.atan2(-_headLookDir.x, _headLookDir.z);
    const pitch = Math.atan2(-_headLookDir.y, Math.sqrt(_headLookDir.x * _headLookDir.x + _headLookDir.z * _headLookDir.z));
    const yawLimit = options.yawLimit ?? 0.7;
    const pitchLimit = options.pitchLimit ?? 0.6;
    const clampedYaw = Math.max(-yawLimit, Math.min(yawLimit, yaw));
    const clampedPitch = Math.max(-pitchLimit, Math.min(pitchLimit, pitch));
    const factor = options.immediate ? 1 : 1 - Math.exp(-(options.lerpSpeed ?? 5.0) * delta);

    headBone.rotation.y += (clampedYaw - headBone.rotation.y) * factor;
    headBone.rotation.x += (clampedPitch - headBone.rotation.x) * factor;
    return true;
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
    return loadCharacterFromModel(scene, MODEL_PATH, waypoints, colliders, onProgress, {
        meshName: 'FritiaPMX',
        displayName: '芙提雅'
    });
}

export function loadCharacterFromModel(scene, modelPath, waypoints, colliders, onProgress, options = {}) {
    return new Promise((resolve, reject) => {
        if (onProgress) onProgress(10);
        const loader = options.loadingManager
            ? new MMDLoader(options.loadingManager)
            : new MMDLoader();
        loader.load(
            modelPath || MODEL_PATH,
            (mesh) => {
                try {
                    mesh.name = options.meshName || 'FritiaPMX';
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    if (mesh.material) {
                        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        for (let i = 0; i < materials.length; i++) {
                            const oldMat = materials[i];
                            const newMat = new THREE.MeshToonMaterial();
                            if (oldMat.color) newMat.color.copy(oldMat.color).multiplyScalar(0.85);
                            if (oldMat.emissive) newMat.emissive.copy(oldMat.emissive).multiplyScalar(0.3);
                            if (oldMat.map) newMat.map = oldMat.map;
                            if (oldMat.gradientMap) newMat.gradientMap = oldMat.gradientMap;
                            if (oldMat.normalMap) newMat.normalMap = oldMat.normalMap;
                            newMat.side = oldMat.side !== undefined ? oldMat.side : THREE.FrontSide;

                            const isHairLike = oldMat.transparent || oldMat.alphaTest > 0
                                || (oldMat.name && /hair|髪|头发/i.test(oldMat.name));

                            console.log(`[PMX] 材质 #${i}:`, {
                                name: oldMat.name,
                                transparent: oldMat.transparent,
                                opacity: oldMat.opacity,
                                alphaTest: oldMat.alphaTest,
                                hasMap: !!oldMat.map,
                                isHairLike
                            });

                            if (isHairLike && oldMat.map) {
                                newMat.alphaTest = oldMat.alphaTest > 0 ? oldMat.alphaTest : 0.5;
                                newMat.transparent = false;
                                newMat.depthWrite = true;
                                newMat.side = THREE.DoubleSide;
                            } else if (oldMat.transparent || (oldMat.opacity !== undefined && oldMat.opacity < 1)) {
                                newMat.transparent = true;
                                newMat.opacity = oldMat.opacity !== undefined ? oldMat.opacity : 1.0;
                            } else {
                                newMat.transparent = false;
                                newMat.depthWrite = true;
                            }

                            materials[i] = newMat;
                        }
                        mesh.material = materials;
                    }

                    setupTransparentShadows(mesh);

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
                    let smileIndex = -1;
                    if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
                        for (const name of ['まばたき', 'blink', '眨眼']) {
                            if (mesh.morphTargetDictionary[name] !== undefined) {
                                blinkIndex = mesh.morphTargetDictionary[name];
                                break;
                            }
                        }
                        for (const name of ['笑い', '微笑み', 'smile', 'にっこり']) {
                            if (mesh.morphTargetDictionary[name] !== undefined) {
                                smileIndex = mesh.morphTargetDictionary[name];
                                break;
                            }
                        }
                    }

                    const charData = {
                        root: mesh, mesh, skeleton, bones, boneRef,
                        displayName: options.displayName || '芙提雅',
                        modelPath: modelPath || MODEL_PATH,
                        initialPositions, colliders: colliders || [],
                        navigationScope: { roomId: 'bedroom' },
                        state: STATES.IDLE,
                        disableSitting: false,
                        lastStoodFromFurnitureWaypointName: null,
                        currentWaypoint: null, stateTimer: 0,
                        idleDuration: randomRange(IDLE_MIN, IDLE_MAX),
                        sitDuration: randomRange(SIT_MIN, SIT_MAX),
                        walkProgress: 0,
                        walkStart: new THREE.Vector3(),
                        walkEnd: new THREE.Vector3(),
                        transitionProgress: 0, transitionDuration: 1.2,
                        blinkIndex, nextBlink: Math.random() * 3 + 2,
                        blinkTimer: 0, isBlinking: false,
                        smileIndex,
                        waypoints, faceDirection: 0,
                        baseY: groundOffset,
                        hasAnimation: bones.length > 0,
                        walkCycle: 0,
                        walkBlend: 0
                    };

                    applyIdlePose(charData);
                    if (smileIndex >= 0 && mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[smileIndex] = 0.3;
                    }

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
                    onProgress(10 + (xhr.loaded / xhr.total) * 45, xhr);
            },
            (err) => reject(err)
        );
    });
}

export function updateCharacter(cd, delta) {
    if (!cd || cd.state === STATES.LOADING) return;
    cd.stateTimer += delta;
    updateBlink(cd, delta);

    if (cd.headReturnProgress !== undefined && cd.headReturnProgress < 1 && cd.boneRef.head) {
        cd.headReturnProgress += delta / cd.headReturnDuration;
        const t = Math.min(1, cd.headReturnProgress);
        const et = easeInOutCubic(t);
        cd.boneRef.head.rotation.x = cd.headReturnFrom.x + (cd.headReturnTo.x - cd.headReturnFrom.x) * et;
        cd.boneRef.head.rotation.y = cd.headReturnFrom.y + (cd.headReturnTo.y - cd.headReturnFrom.y) * et;
        cd.boneRef.head.rotation.z = cd.headReturnFrom.z + (cd.headReturnTo.z - cd.headReturnFrom.z) * et;
        forceUpdate(cd);
    }

    switch (cd.state) {
        case STATES.IDLE: updateIdle(cd, delta); break;
        case STATES.WALKING: updateWalking(cd, delta); break;
        case STATES.TURNING_TO_SIT: updateTurningToSit(cd, delta); break;
        case STATES.STAND_TO_SIT: updateSitTransition(cd, delta); break;
        case STATES.SITTING: updateSitting(cd, delta); break;
        case STATES.SIT_TO_STAND: updateStandTransition(cd, delta); break;
        case STATES.WAVING: updateWaving(cd, delta); break;
        case STATES.INTERACTING: updateInteracting(cd, delta); break;
    }
}

export function updateBlink(cd, delta) {
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

export function startWaving(cd, options = {}) {
    if (!cd || !cd.hasAnimation) return;
    cd.wavingTimer = 0;
    cd.wavingDuration = 2.5;
    cd.wavingLookTargetGetter = typeof options.getLookTarget === 'function' ? options.getLookTarget : null;
    cd.state = STATES.WAVING;
    resetAllBones(cd);
    applyIdlePose(cd);
    const lookTarget = resolveLookTarget(cd.wavingLookTargetGetter);
    if (lookTarget) {
        faceRootToward(cd, lookTarget, 0, { immediate: true });
        if (applyHeadLookAt(cd, lookTarget, 0, { immediate: true })) {
            forceUpdate(cd);
        }
    }
}

function updateWaving(cd, delta) {
    cd.wavingTimer += delta;
    const t = cd.wavingTimer;
    const returnDuration = 0.6;
    const totalDuration = cd.wavingDuration + returnDuration;

    if (t >= totalDuration) {
        cd.state = STATES.IDLE;
        cd.stateTimer = 0;
        cd.idleDuration = 2.0;
        cd.wavingLookTargetGetter = null;
        applyIdlePose(cd);
        forceUpdate(cd);
        return;
    }

    let raise;
    if (t < cd.wavingDuration) {
        raise = 1 - Math.pow(1 - Math.min(1, t / 0.5), 2);
    } else {
        const returnT = (t - cd.wavingDuration) / returnDuration;
        raise = 1 - easeInOutCubic(returnT);
    }

    resetAllBones(cd);

    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) lc.rotation.z = -0.5;
    if (rc) rc.rotation.z = 0.5;

    const rs = cd.boneRef.rightShoulder;
    const re = cd.boneRef.rightElbow;
    if (rs) {
        rs.rotation.x = -0.8 * raise;
    }
    if (re) {
        re.rotation.x = -1.5 * raise;
        re.rotation.z = Math.sin(t * 7) * 0.3 * raise;
    }

    const breathe = Math.sin(performance.now() * 0.001 * 1.5) * 0.008;
    const sp = cd.boneRef.spine2 || cd.boneRef.spine;
    if (sp) sp.rotation.x = breathe;

    const lookTarget = resolveLookTarget(cd.wavingLookTargetGetter);
    if (lookTarget) {
        faceRootToward(cd, lookTarget, delta, { immediate: true });
        applyHeadLookAt(cd, lookTarget, delta);
    }

    forceUpdate(cd);
}

export function applyIdlePose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);
    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) lc.rotation.z = -0.5;
    if (rc) rc.rotation.z = 0.5;
    addRot(cd.boneRef.leftElbow, 0, 0, -0.12);
    addRot(cd.boneRef.rightElbow, 0, 0, 0.12);
    updateBreathing(cd);
}

function applyWalkPose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);

    const cycle = cd.walkCycle;
    const s = Math.sin(cycle);
    const cs = Math.cos(cycle);
    const doubleStep = Math.sin(cycle * 2);
    const blend = cd.walkBlend ?? 1;

    const stride = 0.32 * blend;
    const shoulderSwing = 0.08 * blend;
    const upperArmSwing = 0.28 * blend;
    const bodyTwist = 0.035 * blend;
    const bodyRoll = 0.012 * blend;
    const bodyBob = (0.01 + Math.pow(Math.abs(cs), 0.8) * 0.018) * blend;
    const leftPhase = cycle;
    const rightPhase = cycle + Math.PI;
    const leftSwing = smoothstep01(Math.max(0, Math.cos(leftPhase + Math.PI / 4)));
    const rightSwing = smoothstep01(Math.max(0, Math.cos(rightPhase + Math.PI / 4)));
    const leftToeOff = smoothstep01(Math.max(0, -Math.sin(leftPhase)));
    const rightToeOff = smoothstep01(Math.max(0, -Math.sin(rightPhase)));
    const leftHip = s * stride;
    const rightHip = -s * stride;
    const armPhase = Math.sin(cycle + 0.15);

    const cb = cd.boneRef.center;
    if (cb && cd.initialPositions.center) {
        cb.position.y = cd.initialPositions.center.y + bodyBob;
        cb.position.x = cd.initialPositions.center.x + cs * 0.01 * blend;
    }

    addRot(cd.boneRef.spine, 0.025 * blend, -s * bodyTwist, doubleStep * bodyRoll);
    addRot(cd.boneRef.spine2, 0.012 * blend, -s * bodyTwist * 0.65, -doubleStep * bodyRoll * 0.55);

    addRot(cd.boneRef.leftLeg, leftHip, 0, -cs * 0.018 * blend);
    addRot(cd.boneRef.rightLeg, rightHip, 0, -cs * 0.018 * blend);
    addRot(cd.boneRef.leftKnee, (0.05 + leftSwing * 0.32 + leftToeOff * 0.06) * blend, 0, 0);
    addRot(cd.boneRef.rightKnee, (0.05 + rightSwing * 0.32 + rightToeOff * 0.06) * blend, 0, 0);
    addRot(cd.boneRef.leftAnkle, (-leftHip * 0.55 - leftSwing * 0.12 + leftToeOff * 0.08) * blend, 0, 0);
    addRot(cd.boneRef.rightAnkle, (-rightHip * 0.55 - rightSwing * 0.12 + rightToeOff * 0.08) * blend, 0, 0);

    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) lc.rotation.z = -0.5;
    if (rc) rc.rotation.z = 0.5;

    const ls = cd.boneRef.leftShoulder;
    const rs = cd.boneRef.rightShoulder;
    const la = cd.boneRef.leftArm;
    const ra = cd.boneRef.rightArm;
    const latRelax = 0.015 * Math.cos(cycle * 2) * blend;
    if (ls) {
        ls.rotation.x = -armPhase * shoulderSwing;
        ls.rotation.z = -latRelax;
    }
    if (rs) {
        rs.rotation.x = armPhase * shoulderSwing;
        rs.rotation.z = latRelax;
    }
    if (la) {
        la.rotation.x = -armPhase * upperArmSwing - 0.03 * blend;
        la.rotation.y = -0.015 * armPhase * blend;
    }
    if (ra) {
        ra.rotation.x = armPhase * upperArmSwing - 0.03 * blend;
        ra.rotation.y = -0.015 * armPhase * blend;
    }

    const elbowBendL = (0.12 + Math.max(0, -armPhase) * 0.04) * blend;
    const elbowBendR = (0.12 + Math.max(0, armPhase) * 0.04) * blend;
    addRot(cd.boneRef.leftElbow, 0, 0, -elbowBendL);
    addRot(cd.boneRef.rightElbow, 0, 0, elbowBendR);

    addRot(cd.boneRef.head, 0, s * 0.012 * blend, 0);
    forceUpdate(cd);
}

function applySittingPose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);

    const centerBone = cd.boneRef.center;
    if (centerBone && cd.initialPositions.center) {
        centerBone.position.y = cd.initialPositions.center.y + 0.6;
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

    addRot(cd.boneRef.leftElbow, 0, 0, -0.24);
    addRot(cd.boneRef.rightElbow, 0, 0, 0.24);
    forceUpdate(cd);
}

export function applySleepingPose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);

    const centerBone = cd.boneRef.center;
    if (centerBone && cd.initialPositions.center) {
        centerBone.position.y = cd.initialPositions.center.y + 0.35;
        centerBone.rotation.x = -1.5;
        centerBone.rotation.y = 1.5;
    }

    addRot(cd.boneRef.spine, 0.1, 0, 0);
    addRot(cd.boneRef.spine2, 0.05, 0, 0);

    addRot(cd.boneRef.leftLeg, -0.1, 0, 0);
    addRot(cd.boneRef.rightLeg, -0.1, 0, 0);
    addRot(cd.boneRef.leftKnee, 0.15, 0, 0);
    addRot(cd.boneRef.rightKnee, 0.15, 0, 0);

    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) lc.rotation.z = -0.75;
    if (rc) rc.rotation.z = 0.75;

    const ls = cd.boneRef.leftShoulder;
    const rs = cd.boneRef.rightShoulder;
    if (ls) ls.rotation.x = 0.15;
    if (rs) rs.rotation.x = 0.15;

    addRot(cd.boneRef.leftElbow, 0.3, 0, 0);
    addRot(cd.boneRef.rightElbow, 0.3, 0, 0);

    if (cd.boneRef.head) {
        cd.boneRef.head.rotation.x = -0.05;
    }

    forceUpdate(cd);
}

function applyDreamBedPose(cd) {
    if (!cd.hasAnimation) return;
    resetAllBones(cd);

    const centerBone = cd.boneRef.center;
    if (centerBone && cd.initialPositions.center) {
        centerBone.position.y = cd.initialPositions.center.y + 0.18;
        centerBone.rotation.x = -Math.PI / 2;
        centerBone.rotation.y = 0;
        centerBone.rotation.z = 0;
    }

    addRot(cd.boneRef.spine, 0.02, 0, 0);
    addRot(cd.boneRef.spine2, 0.02, 0, 0);
    addRot(cd.boneRef.leftLeg, 0, 0, 0);
    addRot(cd.boneRef.rightLeg, 0, 0, 0);
    addRot(cd.boneRef.leftKnee, 0.04, 0, 0);
    addRot(cd.boneRef.rightKnee, 0.04, 0, 0);

    const lc = cd.boneRef.leftShoulderC;
    const rc = cd.boneRef.rightShoulderC;
    if (lc) lc.rotation.z = -0.55;
    if (rc) rc.rotation.z = 0.55;

    const ls = cd.boneRef.leftShoulder;
    const rs = cd.boneRef.rightShoulder;
    if (ls) ls.rotation.x = 0.05;
    if (rs) rs.rotation.x = 0.05;

    addRot(cd.boneRef.leftElbow, 0.12, 0, 0);
    addRot(cd.boneRef.rightElbow, 0.12, 0, 0);

    if (cd.boneRef.head) {
        cd.boneRef.head.rotation.x = 0.02;
        cd.boneRef.head.rotation.y = 0;
    }

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
        const avail = cd.waypoints.filter(w => canChooseWaypoint(cd, w));
        if (avail.length === 0) return;
        const target = avail[Math.floor(Math.random() * avail.length)];
        if (!beginWalkToWaypoint(cd, target)) {
            cd.stateTimer = 0;
            cd.idleDuration = 1.5;
        }
    }
}

function canChooseWaypoint(cd, waypoint) {
    if (!waypoint) return false;
    if (waypoint.name === cd.currentWaypoint?.name) return false;
    if (cd.disableSitting && waypoint.isFurniture) return false;
    if (
        isPostStandCooldownActive(cd)
        && waypoint.isFurniture
        && waypoint.name === cd.lastStoodFromFurnitureWaypointName
    ) {
        return false;
    }
    return true;
}

const _charBox = new THREE.Box3();
const CHARACTER_COLLISION_RADIUS = 0.22;
const CHARACTER_COLLISION_HEIGHT = 1.5;
const CHARACTER_COLLISION_FOOT_OFFSET = 0.04;
const CHARACTER_HEIGHT_SMOOTH_SPEED = 10;

function getNavigationFloorY(cd) {
    const y = Number(cd?.navigationScope?.bounds?.min?.y);
    return Number.isFinite(y) ? y : 0;
}

function isWalkableCollider(collider) {
    const walkableHeight = Number(collider?.userData?.walkableHeight);
    return Number.isFinite(walkableHeight) && collider.max.y <= walkableHeight;
}

function overlapsCharacterFootprint(pos, collider, radius = CHARACTER_COLLISION_RADIUS) {
    return pos.x + radius > collider.min.x && pos.x - radius < collider.max.x
        && pos.z + radius > collider.min.z && pos.z - radius < collider.max.z;
}

function isPointInColliderIgnoreZone(pos, collider) {
    const zones = collider?.userData?.ignoreZones;
    if (!Array.isArray(zones)) return false;
    return zones.some(zone => pos.x >= zone.minX && pos.x <= zone.maxX
        && pos.z >= zone.minZ && pos.z <= zone.maxZ);
}

function getGroundYAt(cd, pos, radius = CHARACTER_COLLISION_RADIUS) {
    let groundY = getNavigationFloorY(cd);
    if (!Array.isArray(cd?.colliders)) return groundY;
    const candidates = getBarCollisionCandidates(cd.colliders, pos, radius);
    for (const collider of candidates) {
        if (!isWalkableCollider(collider)) continue;
        if (!overlapsCharacterFootprint(pos, collider, radius)) continue;
        const dynamicGroundY = typeof collider.userData?.surfaceYAt === 'function'
            ? collider.userData.surfaceYAt(pos, collider)
            : null;
        groundY = Math.max(groundY, Number.isFinite(dynamicGroundY) ? dynamicGroundY : collider.max.y);
    }
    return groundY;
}

function getStandingRootY(cd, pos) {
    return cd.baseY + getGroundYAt(cd, pos);
}

function setCharacterCollisionBox(cd, pos) {
    const floorY = getGroundYAt(cd, pos);
    _charBox.min.set(
        pos.x - CHARACTER_COLLISION_RADIUS,
        floorY + CHARACTER_COLLISION_FOOT_OFFSET,
        pos.z - CHARACTER_COLLISION_RADIUS
    );
    _charBox.max.set(
        pos.x + CHARACTER_COLLISION_RADIUS,
        floorY + CHARACTER_COLLISION_HEIGHT,
        pos.z + CHARACTER_COLLISION_RADIUS
    );
}

function checkCollision(cd, pos) {
    if (!cd.colliders || cd.colliders.length === 0) return false;
    setCharacterCollisionBox(cd, pos);
    const candidates = getBarCollisionCandidates(cd.colliders, pos, CHARACTER_COLLISION_RADIUS);
    for (const col of candidates) {
        if (isWalkableCollider(col)) continue;
        if (isPointInColliderIgnoreZone(pos, col)) continue;
        if (_charBox.intersectsBox(col)) return true;
    }
    return false;
}

function shouldStrictlyEnforceNavigationCollision(cd) {
    return cd?.navigationScope?.roomId === 'bar';
}

function getWaypointPosition(cd, waypoint) {
    if (!waypoint?.position) return null;
    const sitApproach = waypoint.isFurniture ? getSitApproachPosition(waypoint) : null;
    if (sitApproach) {
        sitApproach.y = getStandingRootY(cd, sitApproach);
        return sitApproach;
    }
    const pos = waypoint.position.clone ? waypoint.position.clone() : new THREE.Vector3(
        Number(waypoint.position.x) || 0,
        Number(waypoint.position.y) || 0,
        Number(waypoint.position.z) || 0
    );
    pos.y = getStandingRootY(cd, pos);
    return pos;
}

function getPathBounds(cd, start, target) {
    const bounds = cd.navigationScope?.bounds;
    const margin = 0.32;
    if (bounds?.min && bounds?.max) {
        return {
            minX: bounds.min.x + margin,
            maxX: bounds.max.x - margin,
            minZ: bounds.min.z + margin,
            maxZ: bounds.max.z - margin
        };
    }
    return {
        minX: Math.min(start.x, target.x) - 3,
        maxX: Math.max(start.x, target.x) + 3,
        minZ: Math.min(start.z, target.z) - 3,
        maxZ: Math.max(start.z, target.z) + 3
    };
}

function isSegmentClear(cd, start, end) {
    const distance = start.distanceTo(end);
    const steps = Math.max(1, Math.ceil(distance / PATH_SAMPLE_STEP));
    const sample = new THREE.Vector3();
    for (let i = 1; i <= steps; i++) {
        sample.lerpVectors(start, end, i / steps);
        sample.y = getStandingRootY(cd, sample);
        if (checkCollision(cd, sample)) return false;
    }
    return true;
}

function isCurrentWalkPathClear(cd) {
    if (!cd?.root || cd.state !== STATES.WALKING || cd.targetWaypoint?.ignoreCollision) return true;
    const points = [cd.walkEnd.clone()];
    if (Array.isArray(cd.walkPathQueue)) {
        points.push(...cd.walkPathQueue.map(point => point.clone ? point.clone() : point));
    }

    let anchor = cd.root.position.clone();
    anchor.y = getStandingRootY(cd, anchor);
    for (const point of points) {
        const next = point.clone ? point.clone() : new THREE.Vector3(point.x, point.y, point.z);
        next.y = getStandingRootY(cd, next);
        if (!isSegmentClear(cd, anchor, next)) return false;
        anchor = next;
    }
    return true;
}

function simplifyPath(cd, start, points) {
    if (points.length <= 1) return points;
    const result = [];
    let anchor = start.clone();
    let index = 0;

    while (index < points.length) {
        let best = index;
        for (let i = points.length - 1; i >= index; i--) {
            if (isSegmentClear(cd, anchor, points[i])) {
                best = i;
                break;
            }
        }
        const next = points[best].clone();
        result.push(next);
        anchor = next;
        index = best + 1;
    }
    return result;
}

function findNearestFreeCell(cell, isBlocked, width, depth) {
    if (!isBlocked(cell.x, cell.z)) return cell;
    for (let radius = 1; radius <= 4; radius++) {
        let best = null;
        let bestDist = Infinity;
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
                const x = cell.x + dx;
                const z = cell.z + dz;
                if (x < 0 || z < 0 || x >= width || z >= depth || isBlocked(x, z)) continue;
                const dist = dx * dx + dz * dz;
                if (dist < bestDist) {
                    bestDist = dist;
                    best = { x, z };
                }
            }
        }
        if (best) return best;
    }
    return null;
}

function buildPathAroundColliders(cd, start, target) {
    if (isSegmentClear(cd, start, target)) return [target.clone()];

    const bounds = getPathBounds(cd, start, target);
    const width = Math.max(2, Math.floor((bounds.maxX - bounds.minX) / PATH_GRID_STEP) + 1);
    const depth = Math.max(2, Math.floor((bounds.maxZ - bounds.minZ) / PATH_GRID_STEP) + 1);
    if (width * depth > PATH_MAX_NODES) return null;

    const clampIndex = (value, max) => Math.max(0, Math.min(max - 1, value));
    const toCell = (pos) => ({
        x: clampIndex(Math.round((pos.x - bounds.minX) / PATH_GRID_STEP), width),
        z: clampIndex(Math.round((pos.z - bounds.minZ) / PATH_GRID_STEP), depth)
    });
    const keyOf = (x, z) => `${x},${z}`;
    const useBarPathCache = Boolean(cd.colliders?.barSpatialIndex);
    const positionCache = useBarPathCache ? new Map() : null;
    const blockedCache = useBarPathCache ? new Map() : null;
    const makePos = (x, z) => {
        const worldX = bounds.minX + x * PATH_GRID_STEP;
        const worldZ = bounds.minZ + z * PATH_GRID_STEP;
        return new THREE.Vector3(
            worldX,
            getStandingRootY(cd, { x: worldX, z: worldZ }),
            worldZ
        );
    };
    const toPos = useBarPathCache ? (x, z) => {
        const key = keyOf(x, z);
        const cached = positionCache.get(key);
        if (cached) return cached;
        const pos = makePos(x, z);
        positionCache.set(key, pos);
        return pos;
    } : makePos;
    const isBlocked = useBarPathCache ? (x, z) => {
        const key = keyOf(x, z);
        if (blockedCache.has(key)) return blockedCache.get(key);
        const blocked = checkCollision(cd, toPos(x, z));
        blockedCache.set(key, blocked);
        return blocked;
    } : (x, z) => checkCollision(cd, toPos(x, z));
    const startCell = toCell(start);
    const preferredGoalCell = toCell(target);
    const goalCell = findNearestFreeCell(preferredGoalCell, isBlocked, width, depth);
    if (!goalCell) return null;

    const open = [{
        x: startCell.x,
        z: startCell.z,
        key: keyOf(startCell.x, startCell.z),
        f: 0,
        g: 0
    }];
    const cameFrom = new Map();
    const gScore = new Map([[open[0].key, 0]]);
    const closed = new Set();
    const dirs = [
        [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
        [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
    ];
    const heuristic = (x, z) => Math.hypot(goalCell.x - x, goalCell.z - z);

    while (open.length > 0) {
        open.sort((a, b) => a.f - b.f);
        const current = open.shift();
        if (!current || closed.has(current.key)) continue;
        if (current.x === goalCell.x && current.z === goalCell.z) {
            const cells = [];
            let key = current.key;
            while (key) {
                const [x, z] = key.split(',').map(Number);
                cells.push({ x, z });
                key = cameFrom.get(key);
            }
            cells.reverse();
            const points = cells.slice(1).map(cell => toPos(cell.x, cell.z));
            const lastPoint = points[points.length - 1];
            if (!lastPoint || (isSegmentClear(cd, lastPoint, target) && !checkCollision(cd, target))) {
                points.push(target.clone());
            }
            return simplifyPath(cd, start, points);
        }

        closed.add(current.key);
        for (const [dx, dz, moveCost] of dirs) {
            const nx = current.x + dx;
            const nz = current.z + dz;
            if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
            const nextKey = keyOf(nx, nz);
            if (closed.has(nextKey)) continue;
            if (!(nx === startCell.x && nz === startCell.z) && isBlocked(nx, nz)) continue;
            if (dx !== 0 && dz !== 0 && (isBlocked(current.x + dx, current.z) || isBlocked(current.x, current.z + dz))) continue;

            const tentativeG = (gScore.get(current.key) ?? Infinity) + moveCost;
            if (tentativeG >= (gScore.get(nextKey) ?? Infinity)) continue;
            cameFrom.set(nextKey, current.key);
            gScore.set(nextKey, tentativeG);
            open.push({
                x: nx,
                z: nz,
                key: nextKey,
                g: tentativeG,
                f: tentativeG + heuristic(nx, nz)
            });
        }
    }

    return null;
}

function startWalkSegment(cd, waypoint, end) {
    cd.walkEnd.copy(end);
    cd.walkStart.copy(cd.root.position);
    cd.walkStart.y = getStandingRootY(cd, cd.walkStart);
    cd.walkEnd.y = getStandingRootY(cd, cd.walkEnd);
    cd.walkProgress = 0;
    cd.walkCycle = 0;
    cd.walkBlend = 0;
    cd.walkClipping = false;
    cd.targetWaypoint = waypoint;
    cd.state = STATES.WALKING;
    cd.stateTimer = 0;
    return true;
}

function beginWalkToWaypoint(cd, waypoint) {
    const targetPos = getWaypointPosition(cd, waypoint);
    if (!targetPos) return false;
    const startPos = cd.root.position.clone();
    startPos.y = getStandingRootY(cd, startPos);
    const targetWaypoint = {
        ...waypoint,
        position: targetPos.clone()
    };
    const path = waypoint.ignoreCollision
        ? [targetPos]
        : buildPathAroundColliders(cd, startPos, targetPos);
    if (!path || path.length === 0) {
        if (shouldStrictlyEnforceNavigationCollision(cd)) return false;
        const fallbackPath = [targetPos];
        const finalPath = fallbackPath.map(point => point.clone ? point.clone() : point);
        cd.walkPathQueue = finalPath.slice(1).map(point => point.clone());
        return startWalkSegment(cd, targetWaypoint, finalPath[0]);
    }

    const finalPath = path.map(point => point.clone ? point.clone() : point);
    const lastPathPoint = finalPath[finalPath.length - 1];
    if (
        waypoint.isFurniture
        && waypoint.sitCollider
        && lastPathPoint
        && lastPathPoint.distanceTo(targetPos) > 0.03
    ) {
        finalPath.push(targetPos.clone());
    }
    cd.walkPathQueue = finalPath.slice(1).map(point => point.clone());
    return startWalkSegment(cd, targetWaypoint, finalPath[0]);
}

function updateWalking(cd, delta) {
    const dist = cd.walkStart.distanceTo(cd.walkEnd);
    if (dist < 0.05) { finishWalking(cd); return; }
    cd.walkProgress += (WALK_SPEED * delta) / dist;
    const edge = Math.min(cd.walkProgress, 1 - cd.walkProgress) / WALK_BLEND_EDGE;
    cd.walkBlend = smoothstep01(edge);
    cd.walkCycle += delta * WALK_CYCLE_SPEED * (0.75 + cd.walkBlend * 0.25);
    if (cd.walkProgress >= 1) {
        cd.root.position.copy(cd.walkEnd);
        cd.root.position.y = getStandingRootY(cd, cd.root.position);
        finishWalking(cd);
        return;
    }
    const t = cd.walkProgress;
    const newPos = new THREE.Vector3().lerpVectors(cd.walkStart, cd.walkEnd, t);
    const targetRootY = getStandingRootY(cd, newPos);
    const heightBlend = 1 - Math.exp(-CHARACTER_HEIGHT_SMOOTH_SPEED * Math.max(0, delta));
    newPos.y = cd.root.position.y + (targetRootY - cd.root.position.y) * heightBlend;
    if (Math.abs(newPos.y - targetRootY) < 0.003) newPos.y = targetRootY;
    cd.walkClipping = checkCollision(cd, newPos);
    if (cd.walkClipping && !cd.targetWaypoint?.ignoreCollision && shouldStrictlyEnforceNavigationCollision(cd)) {
        cd.walkPathQueue = null;
        cd.targetWaypoint = null;
        cd.walkProgress = 0;
        cd.walkBlend = 0;
        cd.stateTimer = 0;
        cd.idleDuration = 0.8;
        cd.state = STATES.IDLE;
        applyIdlePose(cd);
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
    cd.walkBlend = 0;
    const t = cd.targetWaypoint;
    const nextPathPoint = Array.isArray(cd.walkPathQueue)
        ? cd.walkPathQueue.shift()
        : null;
    if (nextPathPoint && t) {
        startWalkSegment(cd, t, nextPathPoint);
        return;
    }
    cd.walkPathQueue = null;
    if (!t) {
        cd.state = STATES.IDLE;
        cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
        cd.stateTimer = 0;
        applyIdlePose(cd);
        return;
    }
    cd.currentWaypoint = t;
    const interactionRate = t.isDynamicDreamFurniture && t.isFurniture
        ? Math.max(0, Math.min(1, Number.isFinite(t.interactionRate) ? t.interactionRate : 0))
        : 1;
    const shouldTryFurnitureAction = t.isFurniture
        && !cd.disableSitting
        && !isPostStandCooldownActive(cd)
        && (!t.isDynamicDreamFurniture || Math.random() < interactionRate);
    const nextTransitionWaypoint = Array.isArray(cd.roomTransitionQueue)
        ? cd.roomTransitionQueue.shift()
        : null;
    if (nextTransitionWaypoint) {
        if (beginWalkToWaypoint(cd, nextTransitionWaypoint)) return;
        cd.roomTransitionQueue = null;
    }
    if (t.isDynamicDreamFurniture && !shouldTryFurnitureAction && typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('fritia-dream-furniture-visited', {
            detail: {
                furnitureId: t.furnitureId,
                name: t.furnitureName,
                description: t.furnitureDescription,
                category: t.category,
                dialogueTags: t.dialogueTags || []
            }
        }));
    }
    if (t.isFurniture && !cd.disableSitting && shouldTryFurnitureAction) {
        if (isPostStandCooldownActive(cd)) {
            cd.state = STATES.IDLE;
            cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
            cd.stateTimer = 0;
            applyIdlePose(cd);
            return;
        }
        const sitPose = getFurnitureSitPose(cd, t);
        if (!sitPose) {
            cd.state = STATES.IDLE;
            cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
            cd.stateTimer = 0;
            applyIdlePose(cd);
            return;
        }
        cd.turnTarget = sitPose.faceDirection;
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

function markStoodFromFurniture(cd) {
    const waypoint = cd.currentWaypoint?.isFurniture
        ? cd.currentWaypoint
        : (cd.targetWaypoint?.isFurniture ? cd.targetWaypoint : null);
    cd.lastStoodFromFurnitureWaypointName = waypoint?.name || null;
    cd.standUpTime = performance.now() * 0.001;
}

function isPostStandCooldownActive(cd) {
    if (!cd.standUpTime) return false;
    return performance.now() * 0.001 - cd.standUpTime < SIT_COOLDOWN;
}

const SIT_DROP = 0.35;
const BED_SIT_RAISE = 0.08;
const SIT_APPROACH_GAP = 0.15;
const STATIC_BED_SIT_EDGE_INSET = 0.25;
const DREAM_BED_LIE_EDGE_INSET = 0.45;
const DREAM_BED_LIE_Y_OFFSET = -0.42;

function isSeatWaypoint(waypoint) {
    return waypoint?.furnitureType === 'chair' || waypoint?.furnitureType === 'seat';
}

function shouldUseDreamBedPose(waypoint) {
    return waypoint?.isDynamicDreamFurniture && waypoint?.furnitureType === 'bed';
}

function getWaypointFrontVector(waypoint) {
    const source = waypoint?.frontVector;
    const x = Number(source?.x);
    const z = Number(source?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const length = Math.hypot(x, z);
    if (length < 0.001) return null;
    return { x: x / length, z: z / length };
}

function getFurnitureEdgeCandidates(box, pos) {
    const x = Number(pos?.x) || 0;
    const z = Number(pos?.z) || 0;
    const clampedX = Math.max(box.min.x, Math.min(box.max.x, x));
    const clampedZ = Math.max(box.min.z, Math.min(box.max.z, z));
    return [
        { edge: 'minX', distance: Math.abs(x - box.min.x), x: box.min.x, z: clampedZ, normalX: -1, normalZ: 0 },
        { edge: 'maxX', distance: Math.abs(x - box.max.x), x: box.max.x, z: clampedZ, normalX: 1, normalZ: 0 },
        { edge: 'minZ', distance: Math.abs(z - box.min.z), x: clampedX, z: box.min.z, normalX: 0, normalZ: -1 },
        { edge: 'maxZ', distance: Math.abs(z - box.max.z), x: clampedX, z: box.max.z, normalX: 0, normalZ: 1 }
    ];
}

function pickFurnitureInteractionEdge(box, waypoint, pos) {
    let candidates = getFurnitureEdgeCandidates(box, pos);
    const front = getWaypointFrontVector(waypoint);
    if (front && (waypoint?.furnitureType === 'bed' || isSeatWaypoint(waypoint))) {
        candidates.sort((a, b) => {
            const dotA = a.normalX * front.x + a.normalZ * front.z;
            const dotB = b.normalX * front.x + b.normalZ * front.z;
            return (dotB - dotA) || (a.distance - b.distance);
        });
        return candidates[0] || null;
    }
    if (waypoint?.furnitureType === 'bed') {
        candidates = candidates.filter(candidate => candidate.edge === 'maxX');
    } else if (isSeatWaypoint(waypoint)) {
        candidates = candidates.filter(candidate => candidate.edge === 'maxZ');
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] || null;
}

function getFurnitureEdgePoint(box, edge, waypoint) {
    if (waypoint?.furnitureType !== 'bed') {
        return { x: edge.x, z: edge.z };
    }
    const centerX = (box.min.x + box.max.x) * 0.5;
    const centerZ = (box.min.z + box.max.z) * 0.5;
    return {
        x: edge.normalX === 0 ? centerX : edge.x,
        z: edge.normalZ === 0 ? centerZ : edge.z
    };
}

function getDreamBedLieY(cd, waypoint) {
    const surfaceY = Number(waypoint?.bedSurfaceY);
    if (Number.isFinite(surfaceY)) {
        return surfaceY + DREAM_BED_LIE_Y_OFFSET;
    }
    const box = waypoint?.sitCollider;
    if (box?.min && box?.max) {
        const sizeY = box.max.y - box.min.y;
        return box.min.y + Math.min(Math.max(sizeY * 0.45, 0.28), 0.75) + DREAM_BED_LIE_Y_OFFSET;
    }
    return cd.baseY - SIT_DROP + BED_SIT_RAISE;
}

function getSitApproachPosition(waypoint) {
    const box = waypoint?.sitCollider;
    if (!box?.min || !box?.max) return null;
    const source = waypoint.position || {};
    const edge = pickFurnitureInteractionEdge(box, waypoint, source);
    if (!edge) return null;
    if (waypoint.furnitureType === 'bed' || isSeatWaypoint(waypoint)) {
        const edgePoint = getFurnitureEdgePoint(box, edge, waypoint);
        return new THREE.Vector3(
            edgePoint.x + edge.normalX * SIT_APPROACH_GAP,
            0,
            edgePoint.z + edge.normalZ * SIT_APPROACH_GAP
        );
    }
    return null;
}

function getFurnitureSitPose(cd, waypoint) {
    const box = waypoint?.sitCollider;
    if (!box?.min || !box?.max || !cd?.root) return null;
    const sizeX = box.max.x - box.min.x;
    const sizeY = box.max.y - box.min.y;
    const sizeZ = box.max.z - box.min.z;
    if (waypoint.furnitureType === 'bed' && (sizeX < 0.8 || sizeZ < 1.1 || sizeY < 0.12)) {
        console.info('[Dream] bed interaction skipped: collider is not bed-like.', waypoint.name);
        return null;
    }
    if (isSeatWaypoint(waypoint) && (sizeX < 0.32 || sizeZ < 0.32 || sizeY < 0.12)) {
        console.info('[Dream] seat interaction skipped: collider is not seat-like.', waypoint.name);
        return null;
    }

    const pos = cd.root.position;
    const best = pickFurnitureInteractionEdge(box, waypoint, pos);
    if (!best) return null;
    const edgePoint = getFurnitureEdgePoint(box, best, waypoint);
    const edgeInset = isSeatWaypoint(waypoint)
        ? 0.3
        : (shouldUseDreamBedPose(waypoint) ? DREAM_BED_LIE_EDGE_INSET : STATIC_BED_SIT_EDGE_INSET);
    const isDreamBed = shouldUseDreamBedPose(waypoint);
    const outside = SIT_APPROACH_GAP;
    const sitX = edgePoint.x - best.normalX * edgeInset;
    const sitZ = edgePoint.z - best.normalZ * edgeInset;
    const startX = edgePoint.x + best.normalX * outside;
    const startZ = edgePoint.z + best.normalZ * outside;
    const faceDirection = Math.atan2(best.normalX, best.normalZ);

    return {
        startX,
        startZ,
        sitEndX: sitX,
        sitEndZ: sitZ,
        sitEndY: isDreamBed ? getDreamBedLieY(cd, waypoint) : cd.baseY - SIT_DROP + (waypoint.furnitureType === 'bed' ? BED_SIT_RAISE : 0),
        faceDirection
    };
}

function updateTurningToSit(cd, delta) {
    const TURN_DURATION = 0.8;
    cd.transitionProgress += delta / TURN_DURATION;
    if (cd.transitionProgress >= 1) {
        const sitPose = getFurnitureSitPose(cd, cd.currentWaypoint);
        if (sitPose) {
            cd.faceDirection = sitPose.faceDirection;
            cd.root.rotation.y = cd.faceDirection;
            cd.sitStartX = cd.root.position.x;
            cd.sitStartZ = cd.root.position.z;
            cd.sitEndX = sitPose.sitEndX;
            cd.sitEndZ = sitPose.sitEndZ;
            cd.sitEndY = sitPose.sitEndY;
        } else {
            cd.faceDirection = cd.turnTarget;
            cd.root.rotation.y = cd.faceDirection;
            const BACK_OFFSET = 0.4;
            const isBed = cd.currentWaypoint?.furnitureType === 'bed';
            const isDreamBed = shouldUseDreamBedPose(cd.currentWaypoint);
            cd.sitStartX = cd.root.position.x;
            cd.sitStartZ = cd.root.position.z;
            cd.sitEndX = cd.root.position.x - Math.sin(cd.faceDirection) * BACK_OFFSET;
            cd.sitEndZ = cd.root.position.z - Math.cos(cd.faceDirection) * BACK_OFFSET;
            cd.sitEndY = isDreamBed
                ? getDreamBedLieY(cd, cd.currentWaypoint)
                : cd.baseY - SIT_DROP + (isBed ? BED_SIT_RAISE : 0);
        }
        cd.sitStartY = cd.root.position.y;
        cd.sitStart = capturePose(cd);
        if (shouldUseDreamBedPose(cd.currentWaypoint)) {
            applyDreamBedPose(cd);
        } else {
            applySittingPose(cd);
        }
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
        cd.root.position.z = cd.sitStandEndZ;
        cd.root.position.y = getStandingRootY(cd, cd.root.position);
        markStoodFromFurniture(cd);

        applyIdlePose(cd);
        const avail = cd.waypoints.filter(w => canChooseWaypoint(cd, w));
        if (avail.length > 0) {
            const target = avail[Math.floor(Math.random() * avail.length)];
            if (!beginWalkToWaypoint(cd, target)) {
                cd.state = STATES.IDLE;
                cd.stateTimer = 0;
                cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
                cd.currentWaypoint = null;
            }
        } else {
            cd.state = STATES.IDLE;
            cd.stateTimer = 0;
            cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
            cd.currentWaypoint = null;
        }
        return;
    }
    const t = easeInOutCubic(cd.transitionProgress);
    lerpPose(cd, cd.sitStart, cd.sitEnd, t);
    cd.root.position.x = cd.sitStandStartX + (cd.sitStandEndX - cd.sitStandStartX) * t;
    cd.root.position.z = cd.sitStandStartZ + (cd.sitStandEndZ - cd.sitStandStartZ) * t;
    cd.root.position.y = cd.sitStandStartY + (getStandingRootY(cd, cd.root.position) - cd.sitStandStartY) * t;
}

export function forceStandUp(cd) {
    if (!cd?.root) return;
    const wasSitting = cd.state === STATES.SITTING
        || cd.state === STATES.STAND_TO_SIT
        || cd.state === STATES.TURNING_TO_SIT
        || cd.state === STATES.SIT_TO_STAND;
    if (wasSitting) markStoodFromFurniture(cd);
    cd.state = STATES.IDLE;
    cd.prevState = STATES.IDLE;
    cd.currentWaypoint = null;
    cd.targetWaypoint = null;
    cd.roomTransitionQueue = null;
    cd.walkPathQueue = null;
    cd.transitionProgress = 0;
    cd.walkProgress = 0;
    cd.walkBlend = 0;
    cd.stateTimer = 0;
    cd.idleDuration = randomRange(IDLE_MIN, IDLE_MAX);
    if (wasSitting && Number.isFinite(cd.sitStartX) && Number.isFinite(cd.sitStartZ)) {
        cd.root.position.x = cd.sitStartX;
        cd.root.position.z = cd.sitStartZ;
    }
    cd.root.position.y = getStandingRootY(cd, cd.root.position);
    applyIdlePose(cd);
    forceUpdate(cd);
}

export function setSittingEnabled(cd, enabled) {
    if (!cd) return;
    cd.disableSitting = !enabled;
    if (!enabled) forceStandUp(cd);
}

export function setCharacterNavigationScope(cd, scope = {}) {
    if (!cd) return;
    forceStandUp(cd);
    cd.waypoints = Array.isArray(scope.waypoints) ? scope.waypoints : [];
    cd.colliders = Array.isArray(scope.colliders) ? scope.colliders : [];
    cd.navigationScope = {
        roomId: scope.roomId || '',
        bounds: scope.bounds || null
    };
    cd.lastStoodFromFurnitureWaypointName = null;
    cd.currentWaypoint = null;
    cd.targetWaypoint = null;
    cd.walkPathQueue = null;
    cd.walkProgress = 0;
    cd.walkBlend = 0;
    cd.stateTimer = 0;
    cd.idleDuration = 1.0;
    cd.state = STATES.IDLE;
    applyIdlePose(cd);
    forceUpdate(cd);
}

export function refreshCharacterNavigationData(cd, scope = {}) {
    if (!cd) return;
    cd.waypoints = Array.isArray(scope.waypoints) ? scope.waypoints : cd.waypoints;
    cd.colliders = Array.isArray(scope.colliders) ? scope.colliders : cd.colliders;
    cd.navigationScope = {
        ...(cd.navigationScope || {}),
        ...(scope.roomId ? { roomId: scope.roomId } : {}),
        ...(scope.bounds ? { bounds: scope.bounds } : {})
    };

    if (scope.forceRepath) {
        forceStandUp(cd);
        return;
    }

    if (!isCurrentWalkPathClear(cd)) {
        cd.walkPathQueue = null;
        cd.targetWaypoint = null;
        cd.walkProgress = 0;
        cd.walkBlend = 0;
        cd.stateTimer = 0;
        cd.idleDuration = 0.5;
        cd.state = STATES.IDLE;
        applyIdlePose(cd);
        forceUpdate(cd);
    }
}

export function moveCharacterToWaypoint(cd, waypoint, options = {}) {
    if (!cd?.root || !waypoint?.position) return false;
    forceStandUp(cd);
    const nextWaypoints = Array.isArray(options.nextWaypoints) ? options.nextWaypoints : [];
    cd.roomTransitionQueue = nextWaypoints.map(item => ({
        ...item,
        isRoomTransition: true,
        isDynamicDreamFurniture: false
    }));
    const ok = beginWalkToWaypoint(cd, {
        ...waypoint,
        isRoomTransition: true,
        isDynamicDreamFurniture: false
    });
    if (!ok) cd.roomTransitionQueue = null;
    return ok;
}

export function forceCharacterIntoRoom(cd, roomId, spawnPosition) {
    if (!cd?.root || !spawnPosition) return;
    forceStandUp(cd);
    cd.root.position.set(spawnPosition.x, cd.baseY, spawnPosition.z);
    cd.root.position.y = getStandingRootY(cd, cd.root.position);
    cd.root.rotation.y = Number.isFinite(spawnPosition.rotationY) ? spawnPosition.rotationY : cd.root.rotation.y;
    cd.faceDirection = cd.root.rotation.y;
    cd.navigationScope = {
        ...(cd.navigationScope || {}),
        roomId: roomId || cd.navigationScope?.roomId || ''
    };
    cd.currentWaypoint = null;
    cd.targetWaypoint = null;
    cd.stateTimer = 0;
    applyIdlePose(cd);
    forceUpdate(cd);
}

export function getCharacterPosition(cd) {
    if (!cd?.root) return new THREE.Vector3();
    return cd.root.position.clone();
}

export function startInteraction(cd, getPlayerPos) {
    if (!cd) return;
    cd.prevState = cd.state;
    cd.state = STATES.INTERACTING;
    cd.getPlayerPos = getPlayerPos;

    const playerPos = getPlayerPos();
    const dir = new THREE.Vector3().subVectors(playerPos, cd.root.position);
    dir.y = 0;
    const targetAngle = dir.length() > 0.01 ? Math.atan2(dir.x, dir.z) : cd.faceDirection;

    cd.interactionTurnStart = cd.root.rotation.y;
    cd.interactionTurnTarget = targetAngle;
    cd.interactionTurnProgress = 0;
    cd.interactionTurnDone = false;
    cd.interactionTurnDuration = 0.6;

    if (cd.boneRef.head) {
        cd.interactionHeadOrigRot = cd.boneRef.head.rotation.clone();
    }
}

function updateInteracting(cd, delta) {
    updateBreathing(cd);

    if (!cd.interactionTurnDone) {
        cd.interactionTurnProgress += delta / cd.interactionTurnDuration;
        if (cd.interactionTurnProgress >= 1) {
            cd.interactionTurnProgress = 1;
            cd.interactionTurnDone = true;
        }
        const t = easeInOutCubic(cd.interactionTurnProgress);
        cd.root.rotation.y = lerpAngle(cd.interactionTurnStart, cd.interactionTurnTarget, t);
    }

    if (cd.getPlayerPos && cd.boneRef.head) {
        const playerPos = cd.getPlayerPos();
        applyHeadLookAt(cd, playerPos, delta);
        forceUpdate(cd);
    }
}

export function endInteraction(cd) {
    if (!cd) return;
    if (cd.boneRef.head && cd.interactionHeadOrigRot) {
        cd.headReturnFrom = cd.boneRef.head.rotation.clone();
        cd.headReturnTo = cd.interactionHeadOrigRot.clone();
        cd.headReturnProgress = 0;
        cd.headReturnDuration = 0.4;
    }
    cd.getPlayerPos = null;
    cd.interactionHeadOrigRot = null;

    if (!cd.disableSitting && (cd.prevState === STATES.SITTING || cd.prevState === STATES.STAND_TO_SIT || cd.prevState === STATES.TURNING_TO_SIT)) {
        cd.state = STATES.SITTING;
    } else {
        cd.state = STATES.IDLE;
        cd.root.position.y = getStandingRootY(cd, cd.root.position);
        applyIdlePose(cd);
    }
    cd.stateTimer = 0;
}

export async function swapModel(scene, cd, modelPath) {
    const loader = new MMDLoader();
    return new Promise((resolve, reject) => {
        loader.load(
            modelPath,
            (mesh) => {
                try {
                    mesh.name = 'FritiaPMX';
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    if (mesh.material) {
                        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        for (let i = 0; i < materials.length; i++) {
                            const oldMat = materials[i];
                            const newMat = new THREE.MeshToonMaterial();
                            if (oldMat.color) newMat.color.copy(oldMat.color).multiplyScalar(0.85);
                            if (oldMat.emissive) newMat.emissive.copy(oldMat.emissive).multiplyScalar(0.3);
                            if (oldMat.map) newMat.map = oldMat.map;
                            if (oldMat.gradientMap) newMat.gradientMap = oldMat.gradientMap;
                            if (oldMat.normalMap) newMat.normalMap = oldMat.normalMap;
                            newMat.side = oldMat.side !== undefined ? oldMat.side : THREE.FrontSide;

                            const isHairLike = oldMat.transparent || oldMat.alphaTest > 0
                                || (oldMat.name && /hair|髪|头发/i.test(oldMat.name));

                            console.log(`[PMX] 材质 #${i}:`, {
                                name: oldMat.name,
                                transparent: oldMat.transparent,
                                opacity: oldMat.opacity,
                                alphaTest: oldMat.alphaTest,
                                hasMap: !!oldMat.map,
                                isHairLike
                            });

                            if (isHairLike && oldMat.map) {
                                newMat.alphaTest = oldMat.alphaTest > 0 ? oldMat.alphaTest : 0.5;
                                newMat.transparent = false;
                                newMat.depthWrite = true;
                                newMat.side = THREE.DoubleSide;
                            } else if (oldMat.transparent || (oldMat.opacity !== undefined && oldMat.opacity < 1)) {
                                newMat.transparent = true;
                                newMat.opacity = oldMat.opacity !== undefined ? oldMat.opacity : 1.0;
                            } else {
                                newMat.transparent = false;
                                newMat.depthWrite = true;
                            }

                            materials[i] = newMat;
                        }
                        mesh.material = materials;
                    }

                    setupTransparentShadows(mesh);

                    const box = new THREE.Box3().setFromObject(mesh);
                    const rawHeight = box.max.y - box.min.y;
                    const autoScale = rawHeight > 0 ? TARGET_HEIGHT / rawHeight : 1;
                    mesh.scale.set(autoScale, autoScale, autoScale);
                    const scaledBox = new THREE.Box3().setFromObject(mesh);
                    const groundOffset = -scaledBox.min.y;

                    const savedPos = cd.root.position.clone();
                    const savedRot = cd.root.rotation.clone();
                    const savedState = cd.state;
                    const sittingDisabled = Boolean(cd.disableSitting);

                    scene.remove(cd.root);
                    mesh.position.copy(savedPos);
                    mesh.rotation.copy(savedRot);
                    scene.add(mesh);

                    const skeleton = mesh.skeleton;
                    const bones = skeleton ? skeleton.bones : [];
                    const boneRef = buildBoneRef(bones);
                    const initialPositions = {};
                    for (const [key, bone] of Object.entries(boneRef)) {
                        if (bone) initialPositions[key] = bone.position.clone();
                    }

                    let blinkIndex = -1;
                    let smileIndex = -1;
                    if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
                        for (const name of ['まばたき', 'blink', '眨眼']) {
                            if (mesh.morphTargetDictionary[name] !== undefined) {
                                blinkIndex = mesh.morphTargetDictionary[name];
                                break;
                            }
                        }
                        for (const name of ['笑い', '微笑み', 'smile', 'にっこり']) {
                            if (mesh.morphTargetDictionary[name] !== undefined) {
                                smileIndex = mesh.morphTargetDictionary[name];
                                break;
                            }
                        }
                    }

                    cd.mesh = mesh;
                    cd.root = mesh;
                    cd.skeleton = skeleton;
                    cd.bones = bones;
                    cd.boneRef = boneRef;
                    cd.initialPositions = initialPositions;
                    cd.baseY = groundOffset;
                    cd.hasAnimation = bones.length > 0;
                    cd.blinkIndex = blinkIndex;
                    cd.smileIndex = smileIndex;
                    cd.disableSitting = sittingDisabled;

                    if (smileIndex >= 0 && mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[smileIndex] = 0.3;
                    }

                    if (!cd.disableSitting && (savedState === STATES.SITTING || savedState === STATES.STAND_TO_SIT || savedState === STATES.TURNING_TO_SIT)) {
                        if (shouldUseDreamBedPose(cd.currentWaypoint)) {
                            applyDreamBedPose(cd);
                        } else {
                            applySittingPose(cd);
                        }
                        cd.state = STATES.SITTING;
                    } else {
                        applyIdlePose(cd);
                        cd.state = STATES.IDLE;
                        cd.root.position.y = getStandingRootY(cd, cd.root.position);
                    }

                    resolve(cd);
                } catch (err) {
                    reject(err);
                }
            },
            undefined,
            (err) => reject(err)
        );
    });
}
