import * as THREE from 'three';

const BAR_COLLIDER_CELL_SIZE = 1.6;
const BAR_INTERACTION_INTERVAL_MS = 90;

const _queryMin = { x: 0, z: 0 };
const _queryMax = { x: 0, z: 0 };
const _rayCenter = new THREE.Vector2(0, 0);
const _exitHits = [];
const _danceHits = [];

function colliderKey(ix, iz) {
    return `${ix},${iz}`;
}

function cellRangeForAabb(minX, maxX, minZ, maxZ, cellSize, outMin, outMax) {
    outMin.x = Math.floor(minX / cellSize);
    outMax.x = Math.floor(maxX / cellSize);
    outMin.z = Math.floor(minZ / cellSize);
    outMax.z = Math.floor(maxZ / cellSize);
}

export function createBarColliderSpatialIndex(colliders, options = {}) {
    const source = Array.isArray(colliders) ? colliders : [];
    const cellSize = Number.isFinite(options.cellSize) ? options.cellSize : BAR_COLLIDER_CELL_SIZE;
    const cells = new Map();
    const queryStamp = new Uint32Array(source.length);
    let stamp = 0;

    source.forEach((collider, index) => {
        if (!collider?.min || !collider?.max) return;
        cellRangeForAabb(collider.min.x, collider.max.x, collider.min.z, collider.max.z, cellSize, _queryMin, _queryMax);
        for (let ix = _queryMin.x; ix <= _queryMax.x; ix += 1) {
            for (let iz = _queryMin.z; iz <= _queryMax.z; iz += 1) {
                const key = colliderKey(ix, iz);
                const bucket = cells.get(key);
                if (bucket) bucket.push(index);
                else cells.set(key, [index]);
            }
        }
    });

    function query(position, radius = 0.3) {
        if (!position) return source;
        stamp += 1;
        if (stamp >= 0xffffffff) {
            queryStamp.fill(0);
            stamp = 1;
        }

        const result = [];
        cellRangeForAabb(
            position.x - radius,
            position.x + radius,
            position.z - radius,
            position.z + radius,
            cellSize,
            _queryMin,
            _queryMax
        );
        for (let ix = _queryMin.x; ix <= _queryMax.x; ix += 1) {
            for (let iz = _queryMin.z; iz <= _queryMax.z; iz += 1) {
                const bucket = cells.get(colliderKey(ix, iz));
                if (!bucket) continue;
                for (const index of bucket) {
                    if (queryStamp[index] === stamp) continue;
                    queryStamp[index] = stamp;
                    const collider = source[index];
                    if (collider) result.push(collider);
                }
            }
        }
        return result;
    }

    return {
        type: 'bar-collider-spatial-index',
        cellSize,
        colliderCount: source.length,
        cellCount: cells.size,
        query
    };
}

export function attachBarColliderSpatialIndex(colliders, spatialIndex) {
    if (!Array.isArray(colliders) || !spatialIndex) return colliders;
    Object.defineProperty(colliders, 'barSpatialIndex', {
        value: spatialIndex,
        enumerable: false,
        configurable: true
    });
    return colliders;
}

export function getBarCollisionCandidates(colliders, position, radius = 0.3) {
    if (!Array.isArray(colliders)) return [];
    const index = colliders?.barSpatialIndex;
    return index?.query ? index.query(position, radius) : colliders;
}

export function createBarInteractionProbe(options = {}) {
    let lastTime = -Infinity;
    let lastExit = false;
    let lastDance = false;

    return function probeBarInteractions({ active, camera, raycaster, exitMesh, danceMesh, force = false }) {
        if (!active || !camera || !raycaster) {
            lastExit = false;
            lastDance = false;
            return { exit: false, dance: false };
        }

        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        const interval = Number.isFinite(options.intervalMs) ? options.intervalMs : BAR_INTERACTION_INTERVAL_MS;
        if (!force && now - lastTime < interval) {
            return { exit: lastExit, dance: lastDance };
        }
        lastTime = now;

        const oldFar = raycaster.far;
        raycaster.setFromCamera(_rayCenter, camera);

        _exitHits.length = 0;
        if (exitMesh) {
            raycaster.far = 12;
            raycaster.intersectObject(exitMesh, true, _exitHits);
        }

        _danceHits.length = 0;
        if (danceMesh) {
            raycaster.far = 40;
            raycaster.intersectObject(danceMesh, true, _danceHits);
        }

        raycaster.far = oldFar;
        lastExit = _exitHits.length > 0;
        lastDance = _danceHits.length > 0;
        return { exit: lastExit, dance: lastDance };
    };
}
