import * as THREE from 'three';

export const DREAM_FURNITURE_SCHEMA_VERSION = 1;

const ALLOWED_CATEGORIES = new Set(['seat', 'table', 'bed', 'storage', 'lighting', 'decor', 'plant', 'toy', 'custom']);
const ALLOWED_PRIMITIVES = new Set(['box', 'cylinder', 'sphere', 'cone', 'torus', 'plane']);
const ALLOWED_FRONT_DIRECTIONS = new Set(['+X', '-X', '+Z', '-Z']);
const MAX_COMPONENTS = 24;
const DEFAULT_COLOR = '#b8c7e8';
const MAX_DIMENSIONS = { width: 4.2, depth: 3.2, height: 2.6 };
const MIN_COMPONENT_SIZE = 0.03;
const MAX_COMPONENT_SIZE = 4.2;

const MATERIAL_PRESETS = {
    wood: { roughness: 0.72, metalness: 0.03 },
    fabric: { roughness: 0.9, metalness: 0.0 },
    metal: { roughness: 0.36, metalness: 0.75 },
    glass: { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.48 },
    plastic: { roughness: 0.55, metalness: 0.02 },
    ceramic: { roughness: 0.62, metalness: 0.0 },
    light: { roughness: 0.35, metalness: 0.0, emissiveIntensity: 0.65 },
    default: { roughness: 0.72, metalness: 0.05 }
};

function clamp(value, min, max) {
    const num = Number(value);
    if (!Number.isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
}

function finite(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function clampText(value, fallback, maxLength) {
    const text = String(value || fallback || '').trim().replace(/\s+/g, ' ');
    const chars = Array.from(text || fallback);
    return chars.slice(0, maxLength).join('') || fallback;
}

function normalizeColor(value) {
    const text = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : DEFAULT_COLOR;
}

function normalizeVec3(value, fallback = { x: 0, y: 0, z: 0 }, limit = 10) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        x: clamp(source.x ?? fallback.x, -limit, limit),
        y: clamp(source.y ?? fallback.y, -limit, limit),
        z: clamp(source.z ?? fallback.z, -limit, limit)
    };
}

function normalizeSize(value, fallback = { x: 0.4, y: 0.4, z: 0.4 }) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        x: clamp(source.x ?? source.width ?? fallback.x, MIN_COMPONENT_SIZE, MAX_COMPONENT_SIZE),
        y: clamp(source.y ?? source.height ?? fallback.y, MIN_COMPONENT_SIZE, MAX_COMPONENT_SIZE),
        z: clamp(source.z ?? source.depth ?? fallback.z, MIN_COMPONENT_SIZE, MAX_COMPONENT_SIZE)
    };
}

function normalizeMaterialName(value) {
    const key = String(value || 'default').trim().toLowerCase();
    return MATERIAL_PRESETS[key] ? key : 'default';
}

function makeMaterial(component) {
    const color = new THREE.Color(component.color);
    const preset = MATERIAL_PRESETS[component.material] || MATERIAL_PRESETS.default;
    const options = {
        color,
        roughness: clamp(component.roughness ?? preset.roughness ?? 0.72, 0, 1),
        metalness: clamp(component.metalness ?? preset.metalness ?? 0.05, 0, 1)
    };

    if (preset.transparent || component.transparent) {
        options.transparent = true;
        options.opacity = clamp(component.opacity ?? preset.opacity ?? 0.65, 0.15, 1);
        options.depthWrite = options.opacity >= 0.95;
    }

    const mat = new THREE.MeshStandardMaterial(options);
    if (component.material === 'light' || component.emissive) {
        mat.emissive = color.clone();
        mat.emissiveIntensity = clamp(component.emissiveIntensity ?? preset.emissiveIntensity ?? 0.45, 0, 1.5);
    }
    if (component.type === 'plane') {
        mat.side = THREE.DoubleSide;
    }
    return mat;
}

function createGeometry(component) {
    const size = component.size;
    switch (component.type) {
        case 'cylinder': {
            const radius = Math.max(size.x, size.z) / 2;
            return new THREE.CylinderGeometry(radius, radius, size.y, 18);
        }
        case 'sphere': {
            const geo = new THREE.SphereGeometry(0.5, 18, 12);
            geo.scale(size.x, size.y, size.z);
            return geo;
        }
        case 'cone': {
            const radius = Math.max(size.x, size.z) / 2;
            return new THREE.ConeGeometry(radius, size.y, 18);
        }
        case 'torus': {
            const major = Math.max(size.x, size.z) * 0.32;
            const tube = Math.max(MIN_COMPONENT_SIZE, Math.min(size.x, size.y, size.z) * 0.16);
            const geo = new THREE.TorusGeometry(major, tube, 10, 24);
            geo.scale(1, clamp(size.y / Math.max(MIN_COMPONENT_SIZE, size.x), 0.25, 2.5), 1);
            return geo;
        }
        case 'plane':
            return new THREE.PlaneGeometry(size.x, size.y);
        case 'box':
        default:
            return new THREE.BoxGeometry(size.x, size.y, size.z);
    }
}

export function normalizeFurnitureSpec(rawSpec) {
    if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) {
        throw new Error('家具规格必须是 JSON object。');
    }

    const dimensionsSource = rawSpec.dimensions && typeof rawSpec.dimensions === 'object' ? rawSpec.dimensions : {};
    const dimensions = {
        width: clamp(dimensionsSource.width, 0.2, MAX_DIMENSIONS.width),
        depth: clamp(dimensionsSource.depth, 0.2, MAX_DIMENSIONS.depth),
        height: clamp(dimensionsSource.height, 0.15, MAX_DIMENSIONS.height)
    };

    const rawComponents = Array.isArray(rawSpec.components) ? rawSpec.components : [];
    if (rawComponents.length < 1) {
        throw new Error('家具至少需要 1 个组件。');
    }
    if (rawComponents.length > MAX_COMPONENTS) {
        throw new Error(`家具组件数量不能超过 ${MAX_COMPONENTS}。`);
    }

    const components = rawComponents.map((component, index) => {
        const source = component && typeof component === 'object' ? component : {};
        const type = ALLOWED_PRIMITIVES.has(source.type) ? source.type : 'box';
        const fallbackSize = {
            x: Math.min(dimensions.width, 0.5),
            y: Math.min(dimensions.height, 0.5),
            z: Math.min(dimensions.depth, 0.5)
        };
        const size = normalizeSize(source.size, fallbackSize);
        size.x = clamp(size.x, MIN_COMPONENT_SIZE, dimensions.width);
        size.y = clamp(size.y, MIN_COMPONENT_SIZE, dimensions.height);
        size.z = clamp(size.z, MIN_COMPONENT_SIZE, dimensions.depth);

        const halfX = Math.max(0, dimensions.width / 2 - size.x / 2);
        const halfZ = Math.max(0, dimensions.depth / 2 - size.z / 2);
        const position = normalizeVec3(source.position, { x: 0, y: size.y / 2, z: 0 }, 5);
        position.x = clamp(position.x, -halfX, halfX);
        position.y = clamp(position.y, size.y / 2, Math.max(size.y / 2, dimensions.height - size.y / 2));
        position.z = clamp(position.z, -halfZ, halfZ);

        const rotation = normalizeVec3(source.rotation, { x: 0, y: 0, z: 0 }, Math.PI * 2);

        return {
            type,
            name: clampText(source.name, `part_${index + 1}`, 28),
            position,
            rotation,
            size,
            color: normalizeColor(source.color),
            material: normalizeMaterialName(source.material),
            roughness: source.roughness,
            metalness: source.metalness,
            transparent: Boolean(source.transparent),
            opacity: source.opacity,
            emissive: Boolean(source.emissive),
            emissiveIntensity: source.emissiveIntensity
        };
    });

    const interaction = rawSpec.interaction && typeof rawSpec.interaction === 'object' ? rawSpec.interaction : {};
    const rawWaypoint = interaction.waypoint && typeof interaction.waypoint === 'object' ? interaction.waypoint : {};
    const waypointOffset = normalizeVec3(rawWaypoint.offset, { x: 0, y: 0, z: Math.min(1.0, dimensions.depth / 2 + 0.55) }, 2);

    const placement = rawSpec.placement && typeof rawSpec.placement === 'object' ? rawSpec.placement : {};
    const frontDirection = ALLOWED_FRONT_DIRECTIONS.has(rawSpec.frontDirection) ? rawSpec.frontDirection : '+Z';
    const category = ALLOWED_CATEGORIES.has(rawSpec.category) ? rawSpec.category : 'custom';

    return {
        schemaVersion: DREAM_FURNITURE_SCHEMA_VERSION,
        name: clampText(rawSpec.name, '梦造家具', 12),
        category,
        description: clampText(rawSpec.description, '由造梦终端生成的家具。', 120),
        dimensions,
        frontDirection,
        anchor: rawSpec.anchor === 'wall' ? 'wall' : 'floor',
        components,
        interaction: {
            canRename: interaction.canRename !== false,
            canMove: interaction.canMove !== false,
            canRotate: interaction.canRotate !== false,
            canDelete: interaction.canDelete !== false,
            waypoint: {
                enabled: rawWaypoint.enabled !== false,
                offset: waypointOffset,
                furnitureType: clampText(rawWaypoint.furnitureType, category, 24),
                dialogueTags: Array.isArray(rawWaypoint.dialogueTags)
                    ? rawWaypoint.dialogueTags.map(tag => clampText(tag, '', 12)).filter(Boolean).slice(0, 8)
                    : [category]
            }
        },
        placement: {
            intent: clampText(placement.intent, '', 80),
            preferredWall: clampText(placement.preferredWall, '', 24),
            avoidDoor: placement.avoidDoor !== false
        }
    };
}

export function validateFurnitureSpec(rawSpec) {
    const errors = [];
    let spec = null;

    if (!rawSpec || typeof rawSpec !== 'object' || Array.isArray(rawSpec)) {
        return { valid: false, errors: ['家具规格必须是 JSON object。'], spec: null };
    }

    const dimensions = rawSpec.dimensions && typeof rawSpec.dimensions === 'object' ? rawSpec.dimensions : null;
    if (!dimensions) {
        errors.push('家具缺少 dimensions。');
    } else {
        for (const [key, max] of Object.entries(MAX_DIMENSIONS)) {
            const value = Number(dimensions[key]);
            if (!Number.isFinite(value) || value <= 0) {
                errors.push(`dimensions.${key} 必须是有限正数。`);
            } else if (value > max) {
                errors.push('家具尺寸过大。');
            }
        }
    }

    const rawComponents = Array.isArray(rawSpec.components) ? rawSpec.components : null;
    if (!rawComponents) {
        errors.push('components 必须是数组。');
    } else {
        if (rawComponents.length < 1 || rawComponents.length > MAX_COMPONENTS) {
            errors.push(`家具组件数量必须为 1 到 ${MAX_COMPONENTS}。`);
        }
        rawComponents.forEach((component, index) => {
            if (!component || typeof component !== 'object') {
                errors.push(`component ${index + 1} 必须是 object。`);
                return;
            }
            if (!ALLOWED_PRIMITIVES.has(component.type)) {
                errors.push(`component ${index + 1} 的 type 不受支持。`);
            }
        });
    }

    if (errors.length > 0) {
        return { valid: false, errors, spec: null };
    }

    try {
        spec = normalizeFurnitureSpec(rawSpec);
    } catch (err) {
        errors.push(err.message || '家具规格校验失败。');
        return { valid: false, errors, spec: null };
    }

    const { width, depth, height } = spec.dimensions;
    if (width <= 0 || depth <= 0 || height <= 0) {
        errors.push('家具尺寸必须是有限正数。');
    }
    if (width > MAX_DIMENSIONS.width || depth > MAX_DIMENSIONS.depth || height > MAX_DIMENSIONS.height) {
        errors.push('家具尺寸过大。');
    }
    if (spec.components.length < 1 || spec.components.length > MAX_COMPONENTS) {
        errors.push(`家具组件数量必须为 1 到 ${MAX_COMPONENTS}。`);
    }

    return { valid: errors.length === 0, errors, spec };
}

export function createFurnitureFromSpec(rawSpec) {
    const { valid, errors, spec } = validateFurnitureSpec(rawSpec);
    if (!valid) {
        throw new Error(errors.join('；') || '家具规格校验失败。');
    }

    const group = new THREE.Group();
    group.name = spec.name;
    group.userData.dreamSpec = spec;
    group.userData.interactionCenter = new THREE.Vector3(0, Math.min(1.4, spec.dimensions.height * 0.65), 0);

    for (const component of spec.components) {
        const mesh = new THREE.Mesh(createGeometry(component), makeMaterial(component));
        mesh.name = component.name;
        mesh.position.set(component.position.x, component.position.y, component.position.z);
        mesh.rotation.set(component.rotation.x, component.rotation.y, component.rotation.z);
        mesh.castShadow = component.type !== 'plane';
        mesh.receiveShadow = true;
        group.add(mesh);
    }

    return { group, spec };
}

export function applyFurniturePose(group, placement) {
    const position = placement?.position || {};
    group.position.set(finite(position.x), 0, finite(position.z));
    group.rotation.y = finite(placement?.rotationY);
    group.updateMatrixWorld(true);
    return group;
}

export function estimateFurnitureAABB(group) {
    group.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(group);
}

export function createFurnitureCollider(group) {
    const box = estimateFurnitureAABB(group);
    box.min.y = 0;
    box.max.y = Math.max(box.max.y, 0.1);
    return box;
}

function makeColliderFromBox(box) {
    const collider = box.clone();
    const minThickness = 0.04;
    const size = new THREE.Vector3();
    collider.getSize(size);

    if (size.x < minThickness) collider.expandByVector(new THREE.Vector3((minThickness - size.x) / 2, 0, 0));
    if (size.z < minThickness) collider.expandByVector(new THREE.Vector3(0, 0, (minThickness - size.z) / 2));
    collider.max.y = Math.max(collider.max.y, collider.min.y + 0.04);
    return collider;
}

export function createFurnitureColliders(group) {
    group.updateMatrixWorld(true);
    const colliders = [];

    group.traverse(child => {
        if (!child.isMesh || !child.geometry) return;
        const box = new THREE.Box3().setFromObject(child);
        if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;

        const size = new THREE.Vector3();
        box.getSize(size);
        const horizontalArea = Math.max(size.x, 0.04) * Math.max(size.z, 0.04);
        const hasMeaningfulHeight = size.y > 0.08 || box.max.y > 0.16;
        if (horizontalArea < 0.002 || !hasMeaningfulHeight) return;

        colliders.push(makeColliderFromBox(box));
    });

    if (colliders.length === 0) {
        colliders.push(createFurnitureCollider(group));
    }

    return colliders;
}

export function serializeFurniture(furniture) {
    return {
        id: furniture.id,
        name: furniture.name,
        category: furniture.category,
        description: furniture.description,
        playerDescription: furniture.playerDescription || '',
        spec: furniture.spec,
        pose: furniture.pose,
        createdAt: furniture.createdAt,
        gameDateTime: furniture.gameDateTime,
        lastDialogueAt: furniture.lastDialogueAt || 0
    };
}

export function deserializeFurniture(data) {
    if (!data || typeof data !== 'object') return null;
    const { valid, spec } = validateFurnitureSpec(data.spec);
    if (!valid) return null;
    const pose = data.pose && typeof data.pose === 'object' ? data.pose : {};
    return {
        id: String(data.id || `dream_${Date.now()}`),
        name: clampText(data.name || spec.name, spec.name, 12),
        category: ALLOWED_CATEGORIES.has(data.category) ? data.category : spec.category,
        description: clampText(data.description || spec.description, spec.description, 120),
        playerDescription: clampText(data.playerDescription || '', '', 240),
        spec,
        pose: {
            position: {
                x: finite(pose.position?.x),
                y: 0,
                z: finite(pose.position?.z)
            },
            rotationY: finite(pose.rotationY)
        },
        createdAt: String(data.createdAt || new Date().toISOString()),
        gameDateTime: String(data.gameDateTime || ''),
        lastDialogueAt: Math.max(0, Number(data.lastDialogueAt) || 0)
    };
}
