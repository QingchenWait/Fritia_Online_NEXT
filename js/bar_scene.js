import * as THREE from 'three';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';

export const BAR_ROOM_ID = 'bar';

const BAR_MAP_PATH = 'src/_maps/bar/酒吧.pmx';
const FRITIA_RAW_HEIGHT = 20.189645633101463;
const FRITIA_WORLD_HEIGHT = 1.55;
const PMX_TO_WORLD_SCALE = FRITIA_WORLD_HEIGHT / FRITIA_RAW_HEIGHT;
const BAR_MAP_SIZE_SCALE = 0.8;
const BAR_OFFSET = new THREE.Vector3(0, 0, 42);
const WALKABLE_STEP_HEIGHT = 0.92 * BAR_MAP_SIZE_SCALE;
const BAR_PLAYER_SPAWN_RADIUS = 0.25;
const BAR_CHARACTER_SPAWN_RADIUS = 0.22;
const BAR_PLAYER_EYE_HEIGHT = 1.6;
const BAR_EXIT_STAIR_BASE_CAMERA_Y = 2.268;
const BAR_EXIT_STAIR_BASE_Y = BAR_EXIT_STAIR_BASE_CAMERA_Y - BAR_PLAYER_EYE_HEIGHT;
const BAR_EXIT_STAIR_TOP_CAMERA_Y = 2.672;
const BAR_EXIT_STAIR_TOP_Y = BAR_EXIT_STAIR_TOP_CAMERA_Y - BAR_PLAYER_EYE_HEIGHT;
const BAR_EXIT_STAIR_WALKABLE_HEIGHT = BAR_EXIT_STAIR_TOP_Y + 0.12;
const BAR_EXIT_STAIR_Z_MIN = 47.4;
const BAR_EXIT_STAIR_Z_MAX = 49.0;
const BAR_EXIT_STAIR_TOP_LANDING_Z_MAX = 50.85;
const BAR_EXIT_STAIR_BOTTOM_INNER_X = 3.7;
const BAR_EXIT_STAIR_BOTTOM_OUTER_X = 7.3;
const BAR_EXIT_STAIR_TOP_INNER_X = 5.1;
const BAR_EXIT_STAIR_TOP_OUTER_X = 6.0;
const BAR_EXIT_STAIR_TOP_LANDING_INNER_X = 4.95;
const BAR_EXIT_STAIR_TOP_LANDING_OUTER_X = 6.72;
const BAR_EXIT_STAIR_X_MARGIN = 0.16;
const BAR_EXIT_STAIR_SLICE_LENGTH = 0.24;
const BAR_UPPER_WALKABLE_SURFACE_CAMERA_Y = 2.672;
const BAR_UPPER_WALKABLE_SURFACE_Y = BAR_UPPER_WALKABLE_SURFACE_CAMERA_Y - BAR_PLAYER_EYE_HEIGHT;
const BAR_UPPER_WALKABLE_MIN_X = -8.4;
const BAR_UPPER_WALKABLE_MAX_X = 8.4;
const BAR_UPPER_WALKABLE_MIN_Z = 49.0;
const BAR_UPPER_WALKABLE_MAX_Z = 55.0;
const BAR_EXIT_PLANE_MIN_X = -1.3;
const BAR_EXIT_PLANE_MAX_X = 1.3;
const BAR_EXIT_PLANE_MIN_Y = 1.072;
const BAR_EXIT_PLANE_MAX_Y = 5.072;
const BAR_EXIT_PLANE_Z = 54.0;

let barScenePromise = null;
let barSceneData = null;

function scaleMapPoint(x, y, z, options = {}) {
    const scaleY = options.scaleY !== false;
    return new THREE.Vector3(
        BAR_OFFSET.x + (x - BAR_OFFSET.x) * BAR_MAP_SIZE_SCALE,
        scaleY ? BAR_OFFSET.y + (y - BAR_OFFSET.y) * BAR_MAP_SIZE_SCALE : y,
        BAR_OFFSET.z + (z - BAR_OFFSET.z) * BAR_MAP_SIZE_SCALE
    );
}

function makeRuntimeCollider(box, options = {}) {
    const collider = box.clone();
    collider.userData = {
        roomId: BAR_ROOM_ID,
        label: options.label || '',
        source: options.source || '',
        walkableHeight: Number.isFinite(options.walkableHeight) ? options.walkableHeight : null,
        surfaceYAt: typeof options.surfaceYAt === 'function' ? options.surfaceYAt : null,
        ignoreZones: Array.isArray(options.ignoreZones) ? options.ignoreZones.map(zone => ({ ...zone })) : null
    };
    return collider;
}

function makeWalkableBox(minX, maxX, minZ, maxZ, y, label, walkableHeight = y + 0.12) {
    return makeRuntimeCollider(
        new THREE.Box3(
            new THREE.Vector3(minX, 0, minZ),
            new THREE.Vector3(maxX, y, maxZ)
        ),
        {
            label,
            source: 'bar special walkable surface',
            walkableHeight
        }
    );
}

function createSpecialWalkableColliders() {
    const slopeColliders = [
        makeExitStairSlopeCollider('right'),
        makeExitStairSlopeCollider('left')
    ];
    const topLanding = makeExitStairTopLandingZones().map(zone => makeWalkableBox(
        zone.minX,
        zone.maxX,
        zone.minZ,
        zone.maxZ,
        BAR_EXIT_STAIR_TOP_Y,
        zone.label,
        BAR_EXIT_STAIR_WALKABLE_HEIGHT
    ));
    const upperWalkable = makeWalkableBox(
        BAR_UPPER_WALKABLE_MIN_X,
        BAR_UPPER_WALKABLE_MAX_X,
        BAR_UPPER_WALKABLE_MIN_Z,
        BAR_UPPER_WALKABLE_MAX_Z,
        BAR_UPPER_WALKABLE_SURFACE_Y,
        'bar upper lounge walkable fill',
        BAR_UPPER_WALKABLE_SURFACE_Y + 0.12
    );
    return [
        ...slopeColliders,
        ...topLanding,
        upperWalkable
    ];
}

function xzRangesOverlap(box, range) {
    return box.max.x >= range.minX && box.min.x <= range.maxX
        && box.max.z >= range.minZ && box.min.z <= range.maxZ;
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function getExitStairXRangeAtZ(z) {
    const t = clamp01((z - BAR_EXIT_STAIR_Z_MIN) / (BAR_EXIT_STAIR_Z_MAX - BAR_EXIT_STAIR_Z_MIN));
    return {
        inner: BAR_EXIT_STAIR_BOTTOM_INNER_X + (BAR_EXIT_STAIR_TOP_INNER_X - BAR_EXIT_STAIR_BOTTOM_INNER_X) * t,
        outer: BAR_EXIT_STAIR_BOTTOM_OUTER_X + (BAR_EXIT_STAIR_TOP_OUTER_X - BAR_EXIT_STAIR_BOTTOM_OUTER_X) * t
    };
}

function isPointInExitStairFan(position) {
    if (!position || position.z < BAR_EXIT_STAIR_Z_MIN || position.z > BAR_EXIT_STAIR_Z_MAX) {
        return false;
    }
    const range = getExitStairXRangeAtZ(position.z);
    const absX = Math.abs(position.x);
    return absX >= range.inner - BAR_EXIT_STAIR_X_MARGIN
        && absX <= range.outer + BAR_EXIT_STAIR_X_MARGIN;
}

function getExitStairSlopeSurfaceY(position) {
    if (!isPointInExitStairFan(position)) return null;
    const t = clamp01((position.z - BAR_EXIT_STAIR_Z_MIN) / (BAR_EXIT_STAIR_Z_MAX - BAR_EXIT_STAIR_Z_MIN));
    return lerp(BAR_EXIT_STAIR_BASE_Y, BAR_EXIT_STAIR_TOP_Y, t);
}

function makeExitStairSlopeCollider(side) {
    const right = side !== 'left';
    const minAbsX = BAR_EXIT_STAIR_BOTTOM_INNER_X - BAR_EXIT_STAIR_X_MARGIN;
    const maxAbsX = BAR_EXIT_STAIR_BOTTOM_OUTER_X + BAR_EXIT_STAIR_X_MARGIN;
    const minX = right ? minAbsX : -maxAbsX;
    const maxX = right ? maxAbsX : -minAbsX;
    return makeRuntimeCollider(
        new THREE.Box3(
            new THREE.Vector3(minX, 0, BAR_EXIT_STAIR_Z_MIN),
            new THREE.Vector3(maxX, BAR_EXIT_STAIR_TOP_Y, BAR_EXIT_STAIR_Z_MAX)
        ),
        {
            label: `bar exit stair continuous slope ${side}`,
            source: 'bar special walkable slope',
            walkableHeight: BAR_EXIT_STAIR_WALKABLE_HEIGHT,
            surfaceYAt: getExitStairSlopeSurfaceY
        }
    );
}

function makeExitStairTopLandingZones() {
    return [
        {
            label: 'bar exit stair top landing right',
            minX: BAR_EXIT_STAIR_TOP_LANDING_INNER_X,
            maxX: BAR_EXIT_STAIR_TOP_LANDING_OUTER_X,
            minZ: BAR_EXIT_STAIR_Z_MAX,
            maxZ: BAR_EXIT_STAIR_TOP_LANDING_Z_MAX
        },
        {
            label: 'bar exit stair top landing left',
            minX: -BAR_EXIT_STAIR_TOP_LANDING_OUTER_X,
            maxX: -BAR_EXIT_STAIR_TOP_LANDING_INNER_X,
            minZ: BAR_EXIT_STAIR_Z_MAX,
            maxZ: BAR_EXIT_STAIR_TOP_LANDING_Z_MAX
        }
    ];
}

function makeExitStairFanZones(zMin, zMax, labelPrefix = 'bar exit stair fan pass zone') {
    const zones = [];
    const clampedMinZ = Math.max(BAR_EXIT_STAIR_Z_MIN, Math.min(zMin, zMax));
    const clampedMaxZ = Math.min(BAR_EXIT_STAIR_Z_MAX, Math.max(zMin, zMax));
    const sliceCount = Math.max(1, Math.ceil((clampedMaxZ - clampedMinZ) / BAR_EXIT_STAIR_SLICE_LENGTH));

    for (let i = 0; i < sliceCount; i += 1) {
        const z0 = clampedMinZ + (clampedMaxZ - clampedMinZ) * (i / sliceCount);
        const z1 = clampedMinZ + (clampedMaxZ - clampedMinZ) * ((i + 1) / sliceCount);
        const a = getExitStairXRangeAtZ(z0);
        const b = getExitStairXRangeAtZ(z1);
        const inner = Math.min(a.inner, b.inner) - BAR_EXIT_STAIR_X_MARGIN;
        const outer = Math.max(a.outer, b.outer) + BAR_EXIT_STAIR_X_MARGIN;

        zones.push({
            label: `${labelPrefix} right ${i + 1}`,
            minX: inner,
            maxX: outer,
            minZ: z0,
            maxZ: z1
        });
        zones.push({
            label: `${labelPrefix} left ${i + 1}`,
            minX: -outer,
            maxX: -inner,
            minZ: z0,
            maxZ: z1
        });
    }

    return zones;
}

const BAR_EXIT_STAIR_IGNORE_ZONES = makeExitStairFanZones(
    BAR_EXIT_STAIR_Z_MIN,
    BAR_EXIT_STAIR_Z_MAX
).concat(makeExitStairTopLandingZones());

function getExitStairIgnoreZones(box) {
    if (box.min.y > BAR_EXIT_STAIR_WALKABLE_HEIGHT + 1.7) return null;
    const zones = BAR_EXIT_STAIR_IGNORE_ZONES.filter(zone => xzRangesOverlap(box, zone));
    return zones.length > 0 ? zones : null;
}

function blocksFootPath(collider) {
    const walkableHeight = Number(collider?.userData?.walkableHeight);
    if (Number.isFinite(walkableHeight) && collider.max.y <= walkableHeight) {
        return false;
    }
    return true;
}

function makeMapWaypoint(name, x, z, options = {}) {
    return {
        name,
        roomId: BAR_ROOM_ID,
        position: scaleMapPoint(x, 0, z),
        isFurniture: false,
        ...options
    };
}

function tuneStaticMapMaterial(material) {
    if (!material) return;
    if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
        material.map.needsUpdate = true;
    }
    if (material.emissiveMap) {
        material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        material.emissiveMap.needsUpdate = true;
    }
    material.side = THREE.DoubleSide;
    material.fog = false;
    material.depthWrite = material.transparent ? material.depthWrite : true;
    if (material.roughness !== undefined) material.roughness = Math.max(material.roughness, 0.72);
    if (material.emissive) {
        material.emissive.set(0x2a160f);
        material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, 0.18);
    }
    material.needsUpdate = true;
}

function createStaticMapMaterial(source) {
    const material = new THREE.MeshStandardMaterial({
        color: source?.color ? source.color.clone() : new THREE.Color(0xffffff),
        map: source?.map || null,
        normalMap: source?.normalMap || null,
        roughnessMap: source?.roughnessMap || null,
        metalnessMap: source?.metalnessMap || null,
        alphaMap: source?.alphaMap || null,
        transparent: Boolean(source?.transparent) || (Number(source?.opacity) < 1),
        opacity: Number.isFinite(source?.opacity) ? source.opacity : 1,
        alphaTest: Number.isFinite(source?.alphaTest) ? source.alphaTest : 0,
        side: THREE.DoubleSide,
        roughness: 0.82,
        metalness: 0.02
    });
    material.name = source?.name ? `${source.name}_static` : 'bar_static_material';
    material.fog = false;
    material.emissive.set(0x2a160f);
    material.emissiveIntensity = 0.18;
    tuneStaticMapMaterial(material);
    return material;
}

function createStaticGeometry(sourceGeometry) {
    const geometry = sourceGeometry.clone();
    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');
    geometry.morphAttributes = {};
    geometry.morphTargetsRelative = false;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function getMaterialArray(material) {
    if (!material) return [];
    return Array.isArray(material) ? material : [material];
}

function hasMmdToonMaterial(material) {
    return getMaterialArray(material).some(mat => mat?.type === 'MMDToonMaterial' || mat?.isMMDToonMaterial);
}

function neutralizeSourceMmdObject(sourceRoot) {
    sourceRoot.visible = false;
    const hiddenMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        visible: false,
        depthWrite: false,
        depthTest: false
    });

    sourceRoot.traverse((object) => {
        if (!object.isMesh) return;
        object.visible = false;
        object.frustumCulled = true;
        object.material = hiddenMaterial;
        object.morphTargetInfluences = [];
        object.morphTargetDictionary = {};
    });
}

function hideResidualMmdToonObjects(root) {
    const hidden = [];
    root.traverse((object) => {
        if (!object.isMesh || !hasMmdToonMaterial(object.material)) return;
        const materialNames = getMaterialArray(object.material).map(mat => mat?.name || '').join(' ');
        const sourceName = `${object.name || ''} ${materialNames}`.toLowerCase();
        const looksLikeBarMap = /house_|pub_|hall_|interact|wj\d+|ar12_|pl10_|katyamarry|girl\d+/.test(sourceName);
        if (!looksLikeBarMap) return;
        object.visible = false;
        hidden.push({
            object: object.name || '(unnamed mesh)',
            materials: getMaterialArray(object.material).map(mat => `${mat?.name || '(unnamed)'}:${mat?.type || 'unknown'}`)
        });
    });

    if (hidden.length > 0) {
        console.warn('[BarScene] hid residual MMDToonMaterial map objects', hidden);
    }
}

function convertMmdMapToStaticObject(sourceRoot) {
    const staticRoot = new THREE.Group();
    staticRoot.name = 'WarmGatheringBarPMX';

    sourceRoot.updateMatrixWorld(true);
    let staticMeshCount = 0;
    sourceRoot.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;
        const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
        const materials = sourceMaterials.map(createStaticMapMaterial);
        const mesh = new THREE.Mesh(createStaticGeometry(object.geometry), materials.length === 1 ? materials[0] : materials);
        mesh.name = `${object.name || 'bar_mesh'}_static`;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.matrix.copy(object.matrix);
        mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
        staticRoot.add(mesh);
        staticMeshCount += 1;
    });

    console.info('[BarScene] converted PMX to static meshes', { staticMeshCount });
    return staticRoot;
}

function prepareMapMesh(sourceMesh) {
    const mesh = convertMmdMapToStaticObject(sourceMesh);
    mesh.scale.setScalar(PMX_TO_WORLD_SCALE * BAR_MAP_SIZE_SCALE);
    mesh.position.copy(BAR_OFFSET);
    mesh.rotation.set(0, 0, 0);
    mesh.traverse((object) => {
        if (!object.isMesh) return;
        object.frustumCulled = false;
    });
    return mesh;
}

function classifyTriangle(a, b, c) {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
    const minY = Math.min(a.y, b.y, c.y);
    const maxY = Math.max(a.y, b.y, c.y);
    const height = maxY - minY;
    const minX = Math.min(a.x, b.x, c.x);
    const maxX = Math.max(a.x, b.x, c.x);
    const minZ = Math.min(a.z, b.z, c.z);
    const maxZ = Math.max(a.z, b.z, c.z);
    const sx = maxX - minX;
    const sz = maxZ - minZ;
    const footprint = sx * sz;

    if (maxY <= WALKABLE_STEP_HEIGHT + 0.12 && footprint > 0.015) {
        return 'walkable';
    }
    if (maxY < 0.22) return 'ignore';
    if (Math.abs(normal.y) < 0.38 && maxY > 0.55 && height > 0.16) {
        return 'solid';
    }
    if (Math.abs(normal.y) < 0.58 && maxY > 1.05 && footprint > 0.035 && footprint < 3.5 && height > 0.22) {
        return 'solid';
    }
    return 'ignore';
}

function expandBox(box, point) {
    box.expandByPoint(point);
}

function makeTriangleBox(a, b, c) {
    const box = new THREE.Box3();
    expandBox(box, a);
    expandBox(box, b);
    expandBox(box, c);
    return box;
}

function mergeCloseBoxes(boxes, options = {}) {
    const maxPasses = options.maxPasses || 4;
    const maxMergedArea = options.maxMergedArea || 8.5;
    const maxMergedWidth = options.maxMergedWidth || 6.5;
    const maxMergedDepth = options.maxMergedDepth || 6.5;
    const gap = options.gap || 0.08;
    const result = boxes.map(box => box.clone());

    for (let pass = 0; pass < maxPasses; pass += 1) {
        let mergedAny = false;
        outer:
        for (let i = 0; i < result.length; i += 1) {
            for (let j = i + 1; j < result.length; j += 1) {
                const a = result[i];
                const b = result[j];
                const xGap = Math.max(0, Math.max(a.min.x, b.min.x) - Math.min(a.max.x, b.max.x));
                const zGap = Math.max(0, Math.max(a.min.z, b.min.z) - Math.min(a.max.z, b.max.z));
                const yOverlap = a.min.y <= b.max.y + 0.18 && a.max.y + 0.18 >= b.min.y;
                if (!yOverlap || xGap > gap || zGap > gap) continue;

                const merged = a.clone().union(b);
                const sx = merged.max.x - merged.min.x;
                const sz = merged.max.z - merged.min.z;
                if (sx * sz > maxMergedArea || sx > maxMergedWidth || sz > maxMergedDepth) continue;

                result[i] = merged;
                result.splice(j, 1);
                mergedAny = true;
                break outer;
            }
        }
        if (!mergedAny) break;
    }

    return result;
}

function createCollidersFromMapGeometry(mapMesh, mapBox) {
    const solidBoxes = [];
    const walkableBoxes = [];
    const position = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();

    mapMesh.updateMatrixWorld(true);
    mapMesh.traverse((object) => {
        if (!object.isMesh || !object.geometry?.attributes?.position) return;
        const geometry = object.geometry;
        const positions = geometry.attributes.position;
        const index = geometry.index;
        const triCount = index ? index.count / 3 : positions.count / 3;
        const materialName = getMaterialArray(object.material).map(mat => mat?.name || '').join('|');

        for (let tri = 0; tri < triCount; tri += 1) {
            const ia = index ? index.getX(tri * 3) : tri * 3;
            const ib = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
            const ic = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
            a.copy(position.fromBufferAttribute(positions, ia)).applyMatrix4(object.matrixWorld);
            b.copy(position.fromBufferAttribute(positions, ib)).applyMatrix4(object.matrixWorld);
            c.copy(position.fromBufferAttribute(positions, ic)).applyMatrix4(object.matrixWorld);

            const kind = classifyTriangle(a, b, c);
            if (kind === 'ignore') continue;

            const box = makeTriangleBox(a, b, c);
            box.expandByScalar(kind === 'solid' ? 0.035 : 0.015);
            box.min.y = Math.max(0, box.min.y);
            box.userData = { source: materialName };
            if (kind === 'walkable') walkableBoxes.push(box);
            else solidBoxes.push(box);
        }
    });

    const solidMerged = mergeCloseBoxes(solidBoxes, {
        gap: 0.09,
        maxPasses: 5,
        maxMergedArea: 6.2,
        maxMergedWidth: 5.2,
        maxMergedDepth: 5.2
    });
    const walkableMerged = mergeCloseBoxes(walkableBoxes, {
        gap: 0.12,
        maxPasses: 4,
        maxMergedArea: 12,
        maxMergedWidth: 8,
        maxMergedDepth: 8
    });

    const minX = mapBox.min.x + 0.25;
    const maxX = mapBox.max.x - 0.25;
    const minZ = mapBox.min.z + 0.25;
    const maxZ = mapBox.max.z - 0.25;
    const wallThickness = 0.32;
    const edgeWalls = [
        new THREE.Box3(new THREE.Vector3(minX, 0, minZ - wallThickness), new THREE.Vector3(maxX, 3.6, minZ + wallThickness)),
        new THREE.Box3(new THREE.Vector3(minX, 0, maxZ - wallThickness), new THREE.Vector3(maxX, 3.6, maxZ + wallThickness)),
        new THREE.Box3(new THREE.Vector3(minX - wallThickness, 0, minZ), new THREE.Vector3(minX + wallThickness, 3.6, maxZ)),
        new THREE.Box3(new THREE.Vector3(maxX - wallThickness, 0, minZ), new THREE.Vector3(maxX + wallThickness, 3.6, maxZ))
    ];

    const specialWalkableColliders = createSpecialWalkableColliders();
    const colliders = [
        ...edgeWalls.map((box, index) => makeRuntimeCollider(box, { label: `bar edge wall ${index + 1}`, source: 'map bounds' })),
        ...solidMerged
            .filter(box => {
                const sx = box.max.x - box.min.x;
                const sz = box.max.z - box.min.z;
                return box.max.y > 0.45 && sx * sz > 0.003;
            })
            .map((box, index) => makeRuntimeCollider(box, {
                label: `bar geometry solid ${index + 1}`,
                source: box.userData?.source || '',
                ignoreZones: getExitStairIgnoreZones(box)
            })),
        ...specialWalkableColliders,
        ...walkableMerged
            .filter(box => box.max.y <= WALKABLE_STEP_HEIGHT + 0.18)
            .map((box, index) => makeRuntimeCollider(box, {
                label: `bar walkable low ${index + 1}`,
                source: box.userData?.source || '',
                walkableHeight: WALKABLE_STEP_HEIGHT + 0.16
            }))
    ];

    console.info('[BarScene] generated geometry colliders', {
        solidTriangles: solidBoxes.length,
        walkableTriangles: walkableBoxes.length,
        solidColliders: solidMerged.length,
        walkableColliders: walkableMerged.length,
        totalColliders: colliders.length
    });

    return colliders;
}

function createColliderDebugGroup(colliders) {
    if (localStorage.getItem('fritia_bar_debug_colliders') !== '1') return null;
    const group = new THREE.Group();
    group.name = 'BarColliderDebug';
    const solidMat = new THREE.MeshBasicMaterial({
        color: 0xff3b30,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
    });
    const walkableMat = new THREE.MeshBasicMaterial({
        color: 0x37d67a,
        transparent: true,
        opacity: 0.22,
        depthWrite: false
    });
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (const collider of colliders) {
        collider.getSize(size);
        if (size.x <= 0 || size.y <= 0 || size.z <= 0) continue;
        collider.getCenter(center);
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(size.x, size.y, size.z),
            Number.isFinite(collider.userData?.walkableHeight) ? walkableMat : solidMat
        );
        mesh.position.copy(center);
        mesh.renderOrder = 20;
        group.add(mesh);
    }
    return group;
}

function createExitMarker() {
    const interactionMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(
            BAR_EXIT_PLANE_MAX_X - BAR_EXIT_PLANE_MIN_X,
            BAR_EXIT_PLANE_MAX_Y - BAR_EXIT_PLANE_MIN_Y
        ),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            side: THREE.DoubleSide
        })
    );
    interactionMesh.name = 'BarExitInvisiblePlane';
    interactionMesh.position.set(
        (BAR_EXIT_PLANE_MIN_X + BAR_EXIT_PLANE_MAX_X) * 0.5,
        (BAR_EXIT_PLANE_MIN_Y + BAR_EXIT_PLANE_MAX_Y) * 0.5,
        BAR_EXIT_PLANE_Z
    );
    interactionMesh.userData.interactionCenter = new THREE.Vector3(0, BAR_EXIT_PLANE_MIN_Y + 0.7, BAR_EXIT_PLANE_Z);

    return { interactionMesh };
}

function createBarLights() {
    const group = new THREE.Group();
    group.name = 'BarSceneLights';

    const ambient = new THREE.HemisphereLight(0xffdfb5, 0x241612, 1.1);
    group.add(ambient);

    const counterGlow = new THREE.PointLight(0xffa85d, 2.2, 18, 1.8);
    counterGlow.position.copy(scaleMapPoint(5.4, 2.6, 40.8));
    counterGlow.castShadow = false;
    group.add(counterGlow);

    const loungeGlow = new THREE.PointLight(0xffd28a, 1.65, 16, 1.7);
    loungeGlow.position.copy(scaleMapPoint(-4.6, 2.25, 46.2));
    loungeGlow.castShadow = false;
    group.add(loungeGlow);

    const doorwayGlow = new THREE.PointLight(0xffc678, 1.25, 8, 1.5);
    doorwayGlow.position.copy(scaleMapPoint(0, 1.5, 53.65));
    group.add(doorwayGlow);

    return group;
}

function createBarWaypoints() {
    return [
        makeMapWaypoint('bar_entry', 0, 49.6),
        makeMapWaypoint('bar_lounge_center', 0, 45.2),
        makeMapWaypoint('bar_counter_front', 6.55, 40.6),
        makeMapWaypoint('bar_stage_left', -6.35, 43.4),
        makeMapWaypoint('bar_back_walkway', 0, 29.2),
        makeMapWaypoint('bar_side_walkway', -6.25, 47.2)
    ];
}

function pointHitsCollider(position, colliders, radius = 0.25) {
    const surfaceY = getWalkableSurfaceY(position, colliders, radius);
    const bodyMinY = surfaceY + 0.04;
    const bodyMaxY = surfaceY + 1.6;
    for (const collider of colliders) {
        if (!blocksFootPath(collider)) continue;
        if (position.x + radius > collider.min.x && position.x - radius < collider.max.x
            && position.z + radius > collider.min.z && position.z - radius < collider.max.z
            && bodyMaxY > collider.min.y && bodyMinY < collider.max.y) {
            return collider;
        }
    }
    return null;
}

function getWalkableSurfaceY(position, colliders, radius = 0.25) {
    let surfaceY = 0;
    for (const collider of colliders) {
        const walkableHeight = Number(collider?.userData?.walkableHeight);
        if (!Number.isFinite(walkableHeight) || collider.max.y > walkableHeight) continue;
        if (position.x + radius > collider.min.x && position.x - radius < collider.max.x
            && position.z + radius > collider.min.z && position.z - radius < collider.max.z) {
            const dynamicSurfaceY = typeof collider.userData?.surfaceYAt === 'function'
                ? collider.userData.surfaceYAt(position, collider)
                : null;
            surfaceY = Math.max(surfaceY, Number.isFinite(dynamicSurfaceY) ? dynamicSurfaceY : collider.max.y);
        }
    }
    return surfaceY;
}

function isPointInsideBounds(position, bounds, radius = 0) {
    if (!position || !bounds?.min || !bounds?.max) return false;
    return position.x - radius >= bounds.min.x
        && position.x + radius <= bounds.max.x
        && position.z - radius >= bounds.min.z
        && position.z + radius <= bounds.max.z;
}

function findClearPointNear(origin, bounds, colliders, radius) {
    const step = 0.42;
    const offsets = [[0, 0]];
    for (let ring = 1; ring <= 10; ring += 1) {
        for (let ix = -ring; ix <= ring; ix += 1) {
            for (let iz = -ring; iz <= ring; iz += 1) {
                if (Math.abs(ix) !== ring && Math.abs(iz) !== ring) continue;
                offsets.push([ix * step, iz * step]);
            }
        }
    }
    offsets.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));

    for (const [dx, dz] of offsets) {
        const candidate = new THREE.Vector3(origin.x + dx, origin.y, origin.z + dz);
        if (!isPointInsideBounds(candidate, bounds, radius)) continue;
        if (!pointHitsCollider(candidate, colliders, radius)) return candidate;
    }

    return origin.clone();
}

function createCenterSpawn(bounds, colliders) {
    const center = new THREE.Vector3(
        (bounds.min.x + bounds.max.x) * 0.5,
        1.6,
        (bounds.min.z + bounds.max.z) * 0.5
    );
    const playerPosition = findClearPointNear(center, bounds, colliders, BAR_PLAYER_SPAWN_RADIUS);
    const spawnShift = Math.hypot(playerPosition.x - center.x, playerPosition.z - center.z);
    playerPosition.y = getWalkableSurfaceY(playerPosition, colliders, BAR_PLAYER_SPAWN_RADIUS) + 1.6;
    if (spawnShift > 0.01) {
        console.warn('[BarScene] map center spawn was blocked; shifted to nearest clear point', {
            center: center.toArray().map(v => Number(v.toFixed(2))),
            playerPosition: playerPosition.toArray().map(v => Number(v.toFixed(2))),
            shift: Number(spawnShift.toFixed(2))
        });
    }

    const characterOrigin = new THREE.Vector3(playerPosition.x + 0.84, 1.6, playerPosition.z + 0.64);
    const characterPosition = findClearPointNear(characterOrigin, bounds, colliders, BAR_CHARACTER_SPAWN_RADIUS);
    return {
        playerPosition,
        lookAt: new THREE.Vector3(playerPosition.x + 2.2, 1.35, playerPosition.z - 4.4),
        character: {
            x: characterPosition.x,
            z: characterPosition.z,
            rotationY: -Math.PI
        }
    };
}

async function loadBarSceneInternal(scene) {
    const loader = new MMDLoader();
    const mapMesh = await new Promise((resolve, reject) => {
        loader.load(BAR_MAP_PATH, resolve, undefined, reject);
    });

    const staticMapMesh = prepareMapMesh(mapMesh);
    neutralizeSourceMmdObject(mapMesh);
    staticMapMesh.updateMatrixWorld(true);
    const mapBox = new THREE.Box3().setFromObject(staticMapMesh);
    console.info('[BarScene] PMX loaded', {
        scale: PMX_TO_WORLD_SCALE * BAR_MAP_SIZE_SCALE,
        baseScale: PMX_TO_WORLD_SCALE,
        mapSizeScale: BAR_MAP_SIZE_SCALE,
        min: mapBox.min.toArray().map(v => Number(v.toFixed(2))),
        max: mapBox.max.toArray().map(v => Number(v.toFixed(2))),
        materialTypes: [...new Set(staticMapMesh.children
            .filter(child => child.isMesh)
            .flatMap(child => Array.isArray(child.material) ? child.material : [child.material])
            .map(material => material?.type || 'unknown'))]
    });

    const group = new THREE.Group();
    group.name = 'WarmGatheringBarScene';
    group.visible = false;
    group.add(staticMapMesh);

    const lights = createBarLights();
    group.add(lights);

    const exit = createExitMarker();
    group.add(exit.interactionMesh);

    scene.add(group);
    hideResidualMmdToonObjects(scene);

    const bounds = {
        roomId: BAR_ROOM_ID,
        min: new THREE.Vector3(mapBox.min.x + 0.45, 0, mapBox.min.z + 0.45),
        max: new THREE.Vector3(mapBox.max.x - 0.45, 4.0, mapBox.max.z - 0.45)
    };
    const colliders = createCollidersFromMapGeometry(staticMapMesh, mapBox);
    const debugColliders = createColliderDebugGroup(colliders);
    if (debugColliders) group.add(debugColliders);
    const waypoints = createBarWaypoints();
    const spawn = createCenterSpawn(bounds, colliders);

    const spawnHit = pointHitsCollider(spawn.playerPosition, colliders);
    if (spawnHit) {
        console.warn('[BarScene] player spawn overlaps collider', spawnHit.userData?.label || spawnHit);
    }

    barSceneData = {
        group,
        mapMesh: staticMapMesh,
        bounds,
        waypoints,
        playerColliders: colliders,
        characterColliders: colliders,
        exitInteractionMesh: exit.interactionMesh,
        spawn
    };
    return barSceneData;
}

export function ensureBarScene(scene) {
    if (barSceneData) return Promise.resolve(barSceneData);
    if (!barScenePromise) {
        barScenePromise = loadBarSceneInternal(scene).catch((err) => {
            barScenePromise = null;
            throw err;
        });
    }
    return barScenePromise;
}

export function getBarSceneData() {
    return barSceneData;
}

export function setBarSceneVisible(visible) {
    if (barSceneData?.group) {
        barSceneData.group.visible = Boolean(visible);
    }
}

export function isPointInBarBounds(position) {
    const bounds = barSceneData?.bounds;
    if (!position || !bounds) return false;
    return position.x >= bounds.min.x - 0.05
        && position.x <= bounds.max.x + 0.05
        && position.z >= bounds.min.z - 0.05
        && position.z <= bounds.max.z + 0.05;
}

export function getBarPlayerColliders() {
    return barSceneData?.playerColliders || [];
}

export function getBarCharacterColliders() {
    return barSceneData?.characterColliders || [];
}

export function getBarWaypoints() {
    return barSceneData?.waypoints || [];
}

export function getBarBounds() {
    return barSceneData?.bounds || null;
}

export function getBarExitInteractionMesh() {
    return barSceneData?.exitInteractionMesh || null;
}

export function getBarSpawn() {
    return barSceneData?.spawn || null;
}
