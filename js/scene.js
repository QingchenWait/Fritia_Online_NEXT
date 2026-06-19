import * as THREE from 'three';

export function initScene(canvas) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 8, 15);

    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(0, 1.6, 1.5);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const ambient = new THREE.AmbientLight(0xfff0e0, 0.5);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 0.9);
    sunLight.position.set(-2, 4, -3);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 15;
    sunLight.shadow.camera.left = -5;
    sunLight.shadow.camera.right = 5;
    sunLight.shadow.camera.top = 5;
    sunLight.shadow.camera.bottom = -5;
    sunLight.shadow.bias = -0.001;
    scene.add(sunLight);

    const lampLight = new THREE.PointLight(0xffd080, 0.5, 5);
    lampLight.position.set(2.2, 1.5, -1.7);
    lampLight.castShadow = true;
    lampLight.shadow.mapSize.set(512, 512);
    scene.add(lampLight);

    const windowGlow = new THREE.RectAreaLight(0x88bbff, 0.4, 2, 1.5);
    windowGlow.position.set(0, 1.8, -2.48);
    windowGlow.lookAt(0, 1.8, 0);
    scene.add(windowGlow);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return { scene, camera, renderer };
}
