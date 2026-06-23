const PANEL_ID = 'side-scroller-adventure';
const CANVAS_ID = 'side-scroller-canvas';
const ASSET_BASE = 'src/_2d_adventure/2d_fritia/';
const PART_SOURCES = {
    body: 'Simple_Body.png',
    arm: 'Simple_Arm.png',
    legFront: 'Simple_Leg_Front.png',
    legBack: 'Simple_Leg_Behind.png',
    fire: 'Fire.png'
};

const CHARACTER_SCALE_FACTOR = 0.7;
const BODY_ANCHOR = { x: 0, y: -338, pivotX: 0.5, pivotY: 0.68 };
const ARM_SHOULDER_ANCHOR = {
    x: -11,
    y: -413,
    pivotX: 0.9,
    pivotY: 0.02,
    scale: 0.92,
    idleAngle: 2,
    swingAngle: 4
};
const FIRE_COMPANION = {
    backOffsetX: -124,
    anchorY: -350,
    pivotX: 0.5,
    pivotY: 0.72,
    scale: 0.34,
    floatAmplitude: 13,
    floatSpeed: 2.2,
    followSpeed: 12
};

const state = {
    controlsModule: null,
    panel: null,
    canvas: null,
    ctx: null,
    images: {},
    ready: false,
    visible: false,
    inputLeft: false,
    inputRight: false,
    facing: 1,
    playerWorldX: 0,
    cameraX: 0,
    walkClock: 0,
    walkBlend: 0,
    stopBlend: 0,
    fireOffsetX: FIRE_COMPANION.backOffsetX,
    snowClock: 0,
    dpr: 1,
    width: 1,
    height: 1
};

const MOUNTAIN_LAYERS = [
    {
        y: 0.48,
        height: 0.24,
        speed: 0.16,
        colorA: '#b9d9e9',
        colorB: '#7caec5',
        alpha: 0.52,
        seed: 11,
        width: 620
    },
    {
        y: 0.58,
        height: 0.28,
        speed: 0.28,
        colorA: '#8ebbd0',
        colorB: '#5687a1',
        alpha: 0.72,
        seed: 31,
        width: 520
    },
    {
        y: 0.69,
        height: 0.22,
        speed: 0.46,
        colorA: '#4f7b91',
        colorB: '#274b63',
        alpha: 0.9,
        seed: 53,
        width: 460
    }
];

const SNOW_PARTICLES = Array.from({ length: 70 }, (_, i) => ({
    x: fract(Math.sin(i * 39.17) * 9973),
    y: fract(Math.sin(i * 17.31) * 4627),
    r: 0.8 + fract(Math.sin(i * 91.7) * 613) * 2.2,
    speed: 0.18 + fract(Math.sin(i * 57.1) * 1123) * 0.35,
    drift: -0.18 + fract(Math.sin(i * 24.9) * 733) * 0.36
}));

export function initSideScrollerAdventure({ controlsModule } = {}) {
    state.controlsModule = controlsModule || null;
    state.panel = document.getElementById(PANEL_ID);
    state.canvas = document.getElementById(CANVAS_ID);
    state.ctx = state.canvas?.getContext('2d') || null;
    if (!state.panel || !state.canvas || !state.ctx) {
        console.warn('[SideScroller] Missing adventure DOM.');
        return;
    }

    bindEvents();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
    void preloadImages();
}

export function openSideScrollerAdventure() {
    if (!state.panel || state.visible) return;
    state.visible = true;
    state.inputLeft = false;
    state.inputRight = false;
    state.facing = 1;
    state.playerWorldX = 0;
    state.cameraX = 0;
    state.walkClock = 0;
    state.walkBlend = 0;
    state.stopBlend = 0;
    state.fireOffsetX = FIRE_COMPANION.backOffsetX;
    state.snowClock = 0;
    resizeCanvas();
    state.panel.classList.remove('hidden');
    document.body.classList.add('side-scroller-active');
    state.controlsModule?.releaseControlMode?.({ resumeOnClose: true });
    render();
}

export function closeSideScrollerAdventure() {
    if (!state.panel || !state.visible) return;
    state.visible = false;
    state.inputLeft = false;
    state.inputRight = false;
    state.panel.classList.add('hidden');
    document.body.classList.remove('side-scroller-active');
    document.dispatchEvent(new CustomEvent('fritia-overlay-closed', { detail: { id: PANEL_ID } }));
}

export function isSideScrollerAdventureVisible() {
    return state.visible;
}

export function updateSideScrollerAdventure(delta) {
    if (!state.visible) return;
    const direction = Number(state.inputRight) - Number(state.inputLeft);
    const dt = Math.max(0, delta);
    if (direction !== 0) {
        state.facing = direction > 0 ? 1 : -1;
        state.playerWorldX += direction * 285 * dt;
        state.walkClock += dt * 7.4;
        state.walkBlend = approach(state.walkBlend, 1, dt * 7.5);
        state.stopBlend = 0;
    } else {
        state.walkClock += dt * 2.0;
        if (state.walkBlend > 0.02) state.stopBlend = Math.min(1, state.stopBlend + dt * 4.2);
        state.walkBlend = approach(state.walkBlend, 0, dt * 5.2);
    }

    state.cameraX += (state.playerWorldX - state.cameraX) * (1 - Math.exp(-8 * dt));
    const targetFireOffsetX = FIRE_COMPANION.backOffsetX * state.facing;
    state.fireOffsetX += (targetFireOffsetX - state.fireOffsetX) * (1 - Math.exp(-FIRE_COMPANION.followSpeed * dt));
    state.snowClock += dt;
    render();
}

async function preloadImages() {
    try {
        const entries = await Promise.all(Object.entries(PART_SOURCES).map(async ([key, file]) => {
            const img = await loadImage(`${ASSET_BASE}${file}`);
            return [key, img];
        }));
        state.images = Object.fromEntries(entries);
        state.ready = true;
        if (state.visible) render();
    } catch (err) {
        console.error('[SideScroller] Failed to load Fritia 2D assets:', err);
    }
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

function bindEvents() {
    document.getElementById('side-scroller-close')?.addEventListener('click', closeSideScrollerAdventure);
    bindHoldButton('side-scroller-left', 'left');
    bindHoldButton('side-scroller-right', 'right');

    document.addEventListener('keydown', (event) => {
        if (!state.visible || event.repeat) return;
        event.stopImmediatePropagation();
        if (event.code === 'Escape') {
            event.preventDefault();
            closeSideScrollerAdventure();
            return;
        }
        if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
            event.preventDefault();
            state.inputLeft = true;
        } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
            event.preventDefault();
            state.inputRight = true;
        }
    });

    document.addEventListener('keyup', (event) => {
        if (!state.visible) return;
        event.stopImmediatePropagation();
        if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
            event.preventDefault();
            state.inputLeft = false;
        } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
            event.preventDefault();
            state.inputRight = false;
        }
    });

    window.addEventListener('blur', () => {
        state.inputLeft = false;
        state.inputRight = false;
    });
}

function bindHoldButton(id, side) {
    const button = document.getElementById(id);
    if (!button) return;
    const setActive = (active) => {
        if (side === 'left') state.inputLeft = active;
        else state.inputRight = active;
        button.classList.toggle('is-active', active);
    };

    button.addEventListener('pointerdown', (event) => {
        if (!state.visible) return;
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        setActive(true);
    });
    button.addEventListener('pointerup', (event) => {
        event.preventDefault();
        button.releasePointerCapture?.(event.pointerId);
        setActive(false);
    });
    button.addEventListener('pointercancel', () => setActive(false));
    button.addEventListener('pointerleave', () => setActive(false));
}

function resizeCanvas() {
    if (!state.canvas || !state.ctx) return;
    const rect = state.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width || window.innerWidth || 1));
    const height = Math.max(1, Math.floor(rect.height || window.innerHeight || 1));
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    state.width = width;
    state.height = height;
    state.dpr = dpr;
    state.canvas.width = Math.floor(width * dpr);
    state.canvas.height = Math.floor(height * dpr);
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.visible) render();
}

function render() {
    if (!state.ctx) return;
    const ctx = state.ctx;
    const w = state.width;
    const h = state.height;
    ctx.clearRect(0, 0, w, h);
    drawSky(ctx, w, h);
    drawSnow(ctx, w, h);
    drawSunGlow(ctx, w, h);
    drawMountainLayers(ctx, w, h);
    drawGround(ctx, w, h);
    drawFritia(ctx, w, h);
    if (!state.ready) drawLoading(ctx, w, h);
}

function drawSky(ctx, w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#143b45');
    sky.addColorStop(0.38, '#4f8f8c');
    sky.addColorStop(0.7, '#d8c989');
    sky.addColorStop(1, '#e9f4f8');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.48, h * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.76);
    vignette.addColorStop(0, 'rgba(255,255,255,0)');
    vignette.addColorStop(1, 'rgba(4,20,31,0.46)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
}

function drawSunGlow(ctx, w, h) {
    const glow = ctx.createRadialGradient(w * 0.22, h * 0.48, 10, w * 0.22, h * 0.48, w * 0.36);
    glow.addColorStop(0, 'rgba(255,242,166,0.72)');
    glow.addColorStop(0.36, 'rgba(255,198,120,0.24)');
    glow.addColorStop(1, 'rgba(255,198,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
}

function drawSnow(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(236, 252, 255, 0.74)';
    for (const flake of SNOW_PARTICLES) {
        const x = wrap(flake.x * w + flake.drift * state.snowClock * 90, -20, w + 20);
        const y = wrap(flake.y * h + flake.speed * state.snowClock * 110, -20, h + 20);
        ctx.globalAlpha = 0.35 + flake.r * 0.14;
        ctx.beginPath();
        ctx.arc(x, y, flake.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawMountainLayers(ctx, w, h) {
    for (const layer of MOUNTAIN_LAYERS) {
        const baseY = h * layer.y;
        const layerHeight = h * layer.height;
        const tileWidth = Math.max(260, layer.width * Math.max(0.72, w / 1200));
        const offset = modulo(state.cameraX * layer.speed, tileWidth);
        for (let x = -tileWidth - offset; x < w + tileWidth; x += tileWidth) {
            drawMountainTile(ctx, x, baseY, tileWidth, layerHeight, layer);
        }
    }
}

function drawMountainTile(ctx, x, baseY, tileWidth, layerHeight, layer) {
    ctx.save();
    ctx.globalAlpha = layer.alpha;
    const grad = ctx.createLinearGradient(0, baseY - layerHeight, 0, baseY);
    grad.addColorStop(0, layer.colorA);
    grad.addColorStop(1, layer.colorB);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    const peaks = 7;
    for (let i = 0; i <= peaks; i += 1) {
        const px = x + (i / peaks) * tileWidth;
        const noise = fract(Math.sin((i + layer.seed) * 12.9898) * 43758.5453);
        const py = baseY - layerHeight * (0.25 + noise * 0.75);
        ctx.lineTo(px, py);
    }
    ctx.lineTo(x + tileWidth, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha *= 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 1; i < peaks; i += 2) {
        const px = x + (i / peaks) * tileWidth;
        const noise = fract(Math.sin((i + layer.seed) * 19.371) * 2189.12);
        const py = baseY - layerHeight * (0.42 + noise * 0.48);
        ctx.moveTo(px - tileWidth * 0.035, py + layerHeight * 0.14);
        ctx.lineTo(px, py);
        ctx.lineTo(px + tileWidth * 0.04, py + layerHeight * 0.16);
    }
    ctx.fill();
    ctx.restore();
}

function drawGround(ctx, w, h) {
    const horizon = h * 0.66;
    const snow = ctx.createLinearGradient(0, horizon, 0, h);
    snow.addColorStop(0, '#e9fbff');
    snow.addColorStop(0.54, '#b6dce8');
    snow.addColorStop(1, '#6ea3b8');
    ctx.fillStyle = snow;
    ctx.fillRect(0, horizon, w, h - horizon);

    drawRollingSnow(ctx, w, h, horizon + h * 0.07, 0.72, '#d9f5fb', '#9ccbdc');
    drawRollingSnow(ctx, w, h, horizon + h * 0.18, 1.1, '#f7ffff', '#b1d8e4');
    drawIceCracks(ctx, w, h, horizon);
}

function drawRollingSnow(ctx, w, h, y, speed, fillA, fillB) {
    const tileWidth = Math.max(360, w * 0.65);
    const offset = modulo(state.cameraX * speed, tileWidth);
    for (let x = -tileWidth - offset; x < w + tileWidth; x += tileWidth) {
        const grad = ctx.createLinearGradient(0, y - 50, 0, h);
        grad.addColorStop(0, fillA);
        grad.addColorStop(1, fillB);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, y);
        ctx.bezierCurveTo(x + tileWidth * 0.22, y - 36, x + tileWidth * 0.36, y + 24, x + tileWidth * 0.52, y - 10);
        ctx.bezierCurveTo(x + tileWidth * 0.7, y - 48, x + tileWidth * 0.84, y + 18, x + tileWidth, y - 4);
        ctx.lineTo(x + tileWidth, h);
        ctx.closePath();
        ctx.fill();
    }
}

function drawIceCracks(ctx, w, h, horizon) {
    ctx.save();
    ctx.strokeStyle = 'rgba(55, 115, 139, 0.24)';
    ctx.lineWidth = 1.2;
    const tile = 260;
    const offset = modulo(state.cameraX * 1.25, tile);
    for (let x = -tile - offset; x < w + tile; x += tile) {
        const y = horizon + h * (0.16 + fract(Math.sin(x * 0.01) * 10) * 0.12);
        ctx.beginPath();
        ctx.moveTo(x + 24, y);
        ctx.lineTo(x + 78, y + 14);
        ctx.lineTo(x + 124, y + 5);
        ctx.lineTo(x + 172, y + 26);
        ctx.stroke();
    }
    ctx.restore();
}

function drawFritia(ctx, w, h) {
    if (!state.ready) return;
    const groundY = h * 0.87;
    const baseScale = Math.max(0.46, Math.min(0.88, h / 760));
    const scale = baseScale * CHARACTER_SCALE_FACTOR;
    const x = w * 0.5;
    const phase = state.walkClock;
    const blend = easeOutCubic(state.walkBlend);
    const stopEase = 1 - easeOutCubic(state.stopBlend);
    const stride = Math.sin(phase) * blend;
    const counter = -stride;
    const settle = Math.sin(phase * 1.2) * Math.max(0, stopEase - blend) * 0.24;
    const bob = (Math.abs(Math.sin(phase)) * 4.5 * blend + Math.max(0, stopEase - blend) * 1.4) * scale;
    const lean = (stride * 1.8 + blend * 1.6) * Math.PI / 180;
    const frontLegAngle = -4 + stride * 14 - settle * 4;
    const backLegAngle = 4 + counter * 12 + settle * 4;
    const armAngle = ARM_SHOULDER_ANCHOR.idleAngle + counter * ARM_SHOULDER_ANCHOR.swingAngle;

    ctx.save();
    ctx.translate(x, groundY - bob);
    ctx.scale(state.facing, 1);
    ctx.shadowColor = 'rgba(34, 83, 102, 0.28)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(43, 91, 111, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 15 * scale, 58 * scale, 11 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    drawFireCompanion(ctx, scale);
    drawAnchoredImage(ctx, state.images.legBack, 18, -262, 0.47, 0.05, backLegAngle, scale, 0.72, 0.98);
    drawAnchoredImage(ctx, state.images.legFront, -18, -264, 0.5, 0.05, frontLegAngle, scale, 1, 1);
    drawAnchoredImage(ctx, state.images.body, BODY_ANCHOR.x, BODY_ANCHOR.y, BODY_ANCHOR.pivotX, BODY_ANCHOR.pivotY, lean, scale, 1, 1);
    drawAnchoredImage(
        ctx,
        state.images.arm,
        ARM_SHOULDER_ANCHOR.x,
        ARM_SHOULDER_ANCHOR.y,
        ARM_SHOULDER_ANCHOR.pivotX,
        ARM_SHOULDER_ANCHOR.pivotY,
        armAngle,
        scale,
        1,
        ARM_SHOULDER_ANCHOR.scale
    );
    ctx.restore();
}

function drawFireCompanion(ctx, scale) {
    const img = state.images.fire;
    if (!img) return;
    const floatY = Math.sin(state.snowClock * FIRE_COMPANION.floatSpeed) * FIRE_COMPANION.floatAmplitude;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.translate(state.fireOffsetX * state.facing * scale, (FIRE_COMPANION.anchorY + floatY) * scale);
    ctx.drawImage(
        img,
        -img.width * FIRE_COMPANION.pivotX * scale * FIRE_COMPANION.scale,
        -img.height * FIRE_COMPANION.pivotY * scale * FIRE_COMPANION.scale,
        img.width * scale * FIRE_COMPANION.scale,
        img.height * scale * FIRE_COMPANION.scale
    );
    ctx.restore();
}

function drawAnchoredImage(ctx, img, anchorX, anchorY, pivotX, pivotY, angleDeg, scale, alpha = 1, partScale = 1) {
    if (!img) return;
    const drawScale = scale * partScale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(anchorX * scale, anchorY * scale);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.drawImage(img, -img.width * pivotX * drawScale, -img.height * pivotY * drawScale, img.width * drawScale, img.height * drawScale);
    ctx.restore();
}

function drawLoading(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(11, 35, 48, 0.56)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f6feff';
    ctx.font = '700 16px Microsoft YaHei, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('正在整理芙提雅的雪地行装...', w / 2, h / 2);
    ctx.restore();
}

function modulo(value, unit) {
    return ((value % unit) + unit) % unit;
}

function wrap(value, min, max) {
    const range = max - min;
    return min + modulo(value - min, range);
}

function approach(value, target, step) {
    if (value < target) return Math.min(target, value + step);
    if (value > target) return Math.max(target, value - step);
    return target;
}

function easeOutCubic(value) {
    const x = Math.max(0, Math.min(1, value));
    return 1 - Math.pow(1 - x, 3);
}

function fract(value) {
    return value - Math.floor(value);
}
