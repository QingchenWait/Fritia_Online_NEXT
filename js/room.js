import * as THREE from 'three';

function makeBox(w, h, d, color, x, y, z, castShadow = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
}

function makeAABB(cx, cy, cz, hw, hh, hd) {
    const min = new THREE.Vector3(cx - hw, cy, cz - hd);
    const max = new THREE.Vector3(cx + hw, cy + hh * 2, cz + hd);
    return new THREE.Box3(min, max);
}

function makeCollider(minX, minY, minZ, maxX, maxY, maxZ) {
    return new THREE.Box3(
        new THREE.Vector3(minX, minY, minZ),
        new THREE.Vector3(maxX, maxY, maxZ)
    );
}

function markPanoramaObject(object, layer, wall = '') {
    if (!object) return object;
    object.userData.panoramaLayer = layer;
    if (wall) object.userData.panoramaWall = wall;
    return object;
}

export function createRoom(scene) {
    const colliders = [];
    const group = new THREE.Group();

    const floorGeo = new THREE.PlaneGeometry(6, 5);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    markPanoramaObject(floor, 'floor');
    group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xFAF0E6, roughness: 0.9, side: THREE.DoubleSide });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat);
    backWall.position.set(0, 1.5, -2.5);
    backWall.receiveShadow = true;
    markPanoramaObject(backWall, 'wall', 'north');
    group.add(backWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat);
    frontWall.position.set(0, 1.5, 2.5);
    frontWall.rotation.y = Math.PI;
    frontWall.receiveShadow = true;
    markPanoramaObject(frontWall, 'wall', 'south');
    group.add(frontWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), wallMat);
    leftWall.position.set(-3, 1.5, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    markPanoramaObject(leftWall, 'wall', 'west');
    group.add(leftWall);

    const logoTexture = new THREE.TextureLoader().load('src/snowbreak_logo.png');
    const logoMat = new THREE.MeshStandardMaterial({
        map: logoTexture,
        transparent: true,
        roughness: 0.8
    });
    const logoPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), logoMat);
    logoPlane.position.set(-2.99, 1.8, 0);
    logoPlane.rotation.y = Math.PI / 2;
    markPanoramaObject(logoPlane, 'wallDecor', 'west');
    group.add(logoPlane);

    // Coordinate convention: the original 6m x 5m bedroom occupies X [-3, 3], Z [-2.5, 2.5].
    // The dream room is attached to the shopping-terminal wall on +X and occupies X [3, 13], Z [-3, 3].
    // Shared-wall convention: the bedroom face stays almost flush at X=3, while extra thickness grows into +X.
    // The sliding door moves along Z into the negative-Z wall segment, so the wall itself acts as the door pocket.
    const sharedDoor = {
        centerZ: 0.65,
        minZ: 0.05,
        maxZ: 1.25,
        width: 1.2,
        height: 2.25
    };
    const sharedWallBedroomFaceX = 2.995;
    const sharedWallDreamFaceX = 3.30;
    const sharedWallCenterX = (sharedWallBedroomFaceX + sharedWallDreamFaceX) / 2;
    const sharedWallThickness = sharedWallDreamFaceX - sharedWallBedroomFaceX;

    function addSharedWallBlock(zMin, zMax, yMin = 0, yMax = 3) {
        const length = zMax - zMin;
        const height = yMax - yMin;
        if (length <= 0.05 || height <= 0.05) return;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(sharedWallThickness, height, length), wallMat);
        wall.position.set(sharedWallCenterX, yMin + height / 2, (zMin + zMax) / 2);
        wall.receiveShadow = true;
        markPanoramaObject(wall, 'wall', 'shared');
        group.add(wall);
    }

    addSharedWallBlock(-3, sharedDoor.minZ);
    addSharedWallBlock(sharedDoor.maxZ, 3);
    addSharedWallBlock(sharedDoor.minZ, sharedDoor.maxZ, sharedDoor.height, 3);

    const sharedDoorFrameMat = new THREE.MeshStandardMaterial({ color: 0x252f3f, roughness: 0.45, metalness: 0.18 });
    function addDoorFrameTrim(x, outwardSign) {
        const frameThickness = 0.035;
        const frameDepth = 0.07;
        const frameX = x + outwardSign * frameThickness / 2;
        const sideA = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, sharedDoor.height, frameDepth), sharedDoorFrameMat);
        sideA.position.set(frameX, sharedDoor.height / 2, sharedDoor.minZ - 0.04);
        group.add(sideA);
        const sideB = sideA.clone();
        sideB.position.z = sharedDoor.maxZ + 0.04;
        group.add(sideB);
        const top = new THREE.Mesh(new THREE.BoxGeometry(frameThickness, 0.07, sharedDoor.width + 0.18), sharedDoorFrameMat);
        top.position.set(frameX, sharedDoor.height + 0.035, sharedDoor.centerZ);
        group.add(top);
    }
    addDoorFrameTrim(sharedWallBedroomFaceX, -1);
    addDoorFrameTrim(sharedWallDreamFaceX, 1);

    const dreamDoorHeight = sharedDoor.height - 0.015;
    const dreamDoorX = 3.08;
    const dreamDoorClosedPosition = new THREE.Vector3(dreamDoorX, dreamDoorHeight / 2, sharedDoor.centerZ);
    const dreamDoorOpenPosition = new THREE.Vector3(
        dreamDoorX,
        dreamDoorHeight / 2,
        sharedDoor.minZ - sharedDoor.width / 2 - 0.88
    );
    const dreamDoorWoodCanvas = document.createElement('canvas');
    dreamDoorWoodCanvas.width = 96;
    dreamDoorWoodCanvas.height = 384;
    const dreamDoorWoodCtx = dreamDoorWoodCanvas.getContext('2d');
    dreamDoorWoodCtx.fillStyle = '#3b2a25';
    dreamDoorWoodCtx.fillRect(0, 0, dreamDoorWoodCanvas.width, dreamDoorWoodCanvas.height);
    for (let x = 0; x < dreamDoorWoodCanvas.width; x += 2) {
        const wave = Math.sin(x * 0.23) * 12 + Math.sin(x * 0.071) * 18;
        const alpha = 0.18 + ((x % 11) / 60);
        dreamDoorWoodCtx.strokeStyle = `rgba(${74 + wave}, ${51 + wave * 0.4}, ${39 + wave * 0.25}, ${alpha})`;
        dreamDoorWoodCtx.beginPath();
        dreamDoorWoodCtx.moveTo(x + Math.sin(x) * 0.8, 0);
        dreamDoorWoodCtx.lineTo(x + Math.sin(x * 0.05) * 3, dreamDoorWoodCanvas.height);
        dreamDoorWoodCtx.stroke();
    }
    dreamDoorWoodCtx.fillStyle = 'rgba(22, 14, 11, 0.26)';
    dreamDoorWoodCtx.fillRect(0, 0, 8, dreamDoorWoodCanvas.height);
    dreamDoorWoodCtx.fillRect(dreamDoorWoodCanvas.width - 8, 0, 8, dreamDoorWoodCanvas.height);
    const dreamDoorWoodTex = new THREE.CanvasTexture(dreamDoorWoodCanvas);
    dreamDoorWoodTex.colorSpace = THREE.SRGBColorSpace;
    dreamDoorWoodTex.wrapS = THREE.RepeatWrapping;
    dreamDoorWoodTex.wrapT = THREE.RepeatWrapping;
    const dreamDoorMat = new THREE.MeshStandardMaterial({
        map: dreamDoorWoodTex,
        color: 0xffffff,
        roughness: 0.86,
        metalness: 0.02
    });
    const dreamDoorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, dreamDoorHeight, sharedDoor.width), dreamDoorMat);
    dreamDoorMesh.position.copy(dreamDoorClosedPosition);
    dreamDoorMesh.castShadow = true;
    dreamDoorMesh.receiveShadow = true;
    dreamDoorMesh.userData.interactionCenter = new THREE.Vector3(dreamDoorX, 1.2, sharedDoor.centerZ);
    group.add(dreamDoorMesh);

    const stripeMat = new THREE.MeshStandardMaterial({
        color: 0x221815,
        roughness: 0.92,
        metalness: 0.0
    });
    for (const zOffset of [-0.48, -0.34, -0.2, -0.06, 0.08, 0.22, 0.36, 0.5]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.014, dreamDoorHeight * 0.9, 0.012), stripeMat);
        stripe.position.set(-0.043, 0, zOffset);
        dreamDoorMesh.add(stripe);
    }
    const goldLineMat = new THREE.MeshStandardMaterial({ color: 0xc7a45e, roughness: 0.62, metalness: 0.25 });
    const dreamDoorGoldLine = new THREE.Mesh(new THREE.BoxGeometry(0.016, dreamDoorHeight * 0.72, 0.018), goldLineMat);
    dreamDoorGoldLine.position.set(-0.045, -0.1, -0.24);
    dreamDoorMesh.add(dreamDoorGoldLine);
    const dreamDoorLogoTex = new THREE.TextureLoader().load('src/_logos/dream_wood_mark.svg');
    const dreamDoorLogo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshStandardMaterial({
            map: dreamDoorLogoTex,
            transparent: true,
            roughness: 0.35,
            side: THREE.DoubleSide
        })
    );
    dreamDoorLogo.position.set(-0.047, 0.58, 0);
    dreamDoorLogo.rotation.y = -Math.PI / 2;
    dreamDoorMesh.add(dreamDoorLogo);

    const dreamDoorInteractionMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, sharedDoor.height, sharedDoor.width + 0.18),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
    );
    dreamDoorInteractionMesh.position.set(3.03, sharedDoor.height / 2, sharedDoor.centerZ);
    dreamDoorInteractionMesh.userData.interactionCenter = new THREE.Vector3(3.03, 1.2, sharedDoor.centerZ);
    group.add(dreamDoorInteractionMesh);

    const ceilGeo = new THREE.PlaneGeometry(6, 5);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3;
    markPanoramaObject(ceiling, 'ceiling');
    group.add(ceiling);

    // Window
    const winGeo = new THREE.PlaneGeometry(1.8, 1.2);
    const winMat = new THREE.MeshStandardMaterial({
        color: 0x88bbff,
        emissive: 0x88bbff,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.7,
        roughness: 0.1
    });
    const window1 = new THREE.Mesh(winGeo, winMat);
    window1.position.set(0, 1.8, -2.49);
    markPanoramaObject(window1, 'wallDecor', 'north');
    group.add(window1);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3 });
    const frameH = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 0.05), frameMat);
    frameH.position.set(0, 2.4, -2.48);
    markPanoramaObject(frameH, 'wallDecor', 'north');
    group.add(frameH);
    const frameH2 = frameH.clone();
    frameH2.position.y = 1.2;
    markPanoramaObject(frameH2, 'wallDecor', 'north');
    group.add(frameH2);
    const frameV1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.05), frameMat);
    frameV1.position.set(-0.975, 1.8, -2.48);
    markPanoramaObject(frameV1, 'wallDecor', 'north');
    group.add(frameV1);
    const frameV2 = frameV1.clone();
    frameV2.position.x = 0.975;
    markPanoramaObject(frameV2, 'wallDecor', 'north');
    group.add(frameV2);
    const frameVMid = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.05), frameMat);
    frameVMid.position.set(0, 1.8, -2.48);
    markPanoramaObject(frameVMid, 'wallDecor', 'north');
    group.add(frameVMid);

    // Bed
    const bedGroup = new THREE.Group();
    const bedFrame = makeBox(1.2, 0.35, 2.0, 0x5C4033, -2.1, 0.175, -1.3);
    bedGroup.add(bedFrame);
    const bedMattress = makeBox(1.1, 0.15, 1.9, 0xE6E6FA, -2.1, 0.425, -1.3);
    bedGroup.add(bedMattress);
    const bedPillow = makeBox(0.5, 0.1, 0.35, 0xffffff, -2.1, 0.55, -2.1);
    bedGroup.add(bedPillow);
    const bedBlanket = makeBox(1.05, 0.08, 1.1, 0xFFB6C1, -2.1, 0.53, -0.95);
    bedGroup.add(bedBlanket);
    const bedHeadboard = makeBox(1.2, 0.6, 0.08, 0x4A3520, -2.1, 0.7, -2.26);
    bedGroup.add(bedHeadboard);
    group.add(bedGroup);
    const bedCollider = makeAABB(-2.1, 0, -1.3, 0.65, 0.55, 1.05);
    colliders.push(bedCollider);
    colliders.push(makeAABB(-2.1, 0, -2.15, 0.3, 0.55, 0.2));

    // Desk
    const deskTop = makeBox(1.2, 0.06, 0.65, 0x8B6914, 2.1, 0.75, -2.0);
    group.add(deskTop);
    const deskLeg1 = makeBox(0.06, 0.72, 0.06, 0x6B4914, 1.55, 0.36, -2.28);
    group.add(deskLeg1);
    const deskLeg2 = makeBox(0.06, 0.72, 0.06, 0x6B4914, 2.65, 0.36, -2.28);
    group.add(deskLeg2);
    const deskLeg3 = makeBox(0.06, 0.72, 0.06, 0x6B4914, 1.55, 0.36, -1.72);
    group.add(deskLeg3);
    const deskLeg4 = makeBox(0.06, 0.72, 0.06, 0x6B4914, 2.65, 0.36, -1.72);
    group.add(deskLeg4);
    colliders.push(makeAABB(2.1, 0, -2.0, 0.65, 0.4, 0.35));

    // Book on desk
    const bookGeo = new THREE.BoxGeometry(0.3, 0.03, 0.4);
    const bookMat = new THREE.MeshStandardMaterial({ color: 0xf5e6d0, roughness: 0.9 });
    const book = new THREE.Mesh(bookGeo, bookMat);
    book.position.set(2.0, 0.795, -1.95);
    book.rotation.y = 0.1;
    group.add(book);
    const bookPage = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.005, 0.38),
        new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.95 })
    );
    bookPage.position.set(2.0, 0.81, -1.95);
    bookPage.rotation.y = 0.1;
    group.add(bookPage);
    const deskMesh = deskTop;

    // Desk lamp
    const lampBase = makeBox(0.15, 0.02, 0.15, 0x333333, 2.4, 0.79, -2.15);
    group.add(lampBase);
    const lampPole = makeBox(0.03, 0.3, 0.03, 0x555555, 2.4, 0.95, -2.15);
    group.add(lampPole);
    const lampShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.1, 8, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffd080, emissiveIntensity: 0.5, side: THREE.DoubleSide })
    );
    lampShade.position.set(2.4, 1.1, -2.15);
    lampShade.rotation.x = Math.PI;
    group.add(lampShade);

    // Shopping terminal on the wall opposite the Snowbreak logo.
    const terminalGroup = new THREE.Group();
    const terminalBodyMat = new THREE.MeshStandardMaterial({
        color: 0x101725,
        roughness: 0.35,
        metalness: 0.55
    });
    const terminalBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.64), terminalBodyMat);
    terminalBody.position.set(0, 0, 0);
    terminalBody.castShadow = true;
    terminalGroup.add(terminalBody);

    const terminalScreenCanvas = document.createElement('canvas');
    terminalScreenCanvas.width = 512;
    terminalScreenCanvas.height = 384;
    const termCtx = terminalScreenCanvas.getContext('2d');
    termCtx.fillStyle = '#07111f';
    termCtx.fillRect(0, 0, 512, 384);
    termCtx.strokeStyle = '#6ee7ff';
    termCtx.lineWidth = 8;
    termCtx.strokeRect(18, 18, 476, 348);
    termCtx.fillStyle = '#6ee7ff';
    termCtx.font = 'bold 54px Microsoft YaHei, sans-serif';
    termCtx.textAlign = 'center';
    termCtx.fillText('SHOP', 256, 150);
    termCtx.font = '30px Microsoft YaHei, sans-serif';
    termCtx.fillText('GIFT TERMINAL', 256, 218);
    termCtx.fillStyle = 'rgba(110, 231, 255, 0.45)';
    for (let i = 0; i < 5; i++) {
        termCtx.fillRect(92 + i * 72, 280, 42, 8);
    }
    const terminalScreenTex = new THREE.CanvasTexture(terminalScreenCanvas);
    const terminalScreenMat = new THREE.MeshStandardMaterial({
        map: terminalScreenTex,
        color: 0xffffff,
        emissive: 0x2fc7ff,
        emissiveIntensity: 0.45,
        roughness: 0.2
    });
    const terminalScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.42), terminalScreenMat);
    terminalScreen.position.set(-0.045, 0.06, 0);
    terminalScreen.rotation.y = -Math.PI / 2;
    terminalGroup.add(terminalScreen);

    const terminalGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.015, 0.05, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x66e8ff, emissive: 0x66e8ff, emissiveIntensity: 1.2 })
    );
    terminalGlow.position.set(-0.052, -0.32, 0);
    terminalGroup.add(terminalGlow);
    terminalGroup.position.set(2.955, 1.55, -0.95);
    group.add(terminalGroup);
    const terminalMesh = terminalBody;
    terminalMesh.userData.interactionCenter = new THREE.Vector3(2.955, 1.58, -0.95);

    // Dream room shell. It starts empty by design; dynamic furniture is injected by dream_system.js.
    const dreamRoomBounds = {
        roomId: 'dream',
        min: new THREE.Vector3(3, 0, -3),
        max: new THREE.Vector3(13, 3, 3)
    };
    const oldRoomBounds = {
        roomId: 'bedroom',
        min: new THREE.Vector3(-3, 0, -2.5),
        max: new THREE.Vector3(3, 3, 2.5)
    };
    const doorClearanceZone = makeCollider(2.35, 0, -0.2, 4.55, 2.1, 1.6);

    const dreamGroup = new THREE.Group();
    const dreamFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 6),
        new THREE.MeshStandardMaterial({ color: 0x505866, roughness: 0.78 })
    );
    dreamFloor.rotation.x = -Math.PI / 2;
    dreamFloor.position.set(8, 0.002, 0);
    dreamFloor.receiveShadow = true;
    markPanoramaObject(dreamFloor, 'floor');
    dreamGroup.add(dreamFloor);

    const dreamCeiling = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 6),
        new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 1 })
    );
    dreamCeiling.rotation.x = Math.PI / 2;
    dreamCeiling.position.set(8, 3, 0);
    markPanoramaObject(dreamCeiling, 'ceiling');
    dreamGroup.add(dreamCeiling);

    const dreamBackWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3), wallMat);
    dreamBackWall.position.set(8, 1.5, -3);
    markPanoramaObject(dreamBackWall, 'wall', 'north');
    dreamGroup.add(dreamBackWall);

    const dreamFrontWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3), wallMat);
    dreamFrontWall.position.set(8, 1.5, 3);
    dreamFrontWall.rotation.y = Math.PI;
    markPanoramaObject(dreamFrontWall, 'wall', 'south');
    dreamGroup.add(dreamFrontWall);

    const dreamRightWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat);
    dreamRightWall.position.set(13, 1.5, 0);
    dreamRightWall.rotation.y = -Math.PI / 2;
    markPanoramaObject(dreamRightWall, 'wall', 'east');
    dreamGroup.add(dreamRightWall);

    const dreamWindowMat = new THREE.MeshStandardMaterial({
        color: 0x9bd7ff,
        emissive: 0x5ab7ff,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.72,
        roughness: 0.18
    });
    const dreamWindow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.15), dreamWindowMat);
    dreamWindow.position.set(8.3, 1.78, -2.99);
    markPanoramaObject(dreamWindow, 'wallDecor', 'north');
    dreamGroup.add(dreamWindow);
    const dreamWindowFrameMat = new THREE.MeshStandardMaterial({ color: 0xe8edf6, roughness: 0.42 });
    const dwTop = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.05, 0.05), dreamWindowFrameMat);
    dwTop.position.set(8.3, 2.38, -2.96);
    markPanoramaObject(dwTop, 'wallDecor', 'north');
    dreamGroup.add(dwTop);
    const dwBottom = dwTop.clone();
    dwBottom.position.y = 1.18;
    markPanoramaObject(dwBottom, 'wallDecor', 'north');
    dreamGroup.add(dwBottom);
    const dwLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.05), dreamWindowFrameMat);
    dwLeft.position.set(7.15, 1.78, -2.96);
    markPanoramaObject(dwLeft, 'wallDecor', 'north');
    dreamGroup.add(dwLeft);
    const dwRight = dwLeft.clone();
    dwRight.position.x = 9.45;
    markPanoramaObject(dwRight, 'wallDecor', 'north');
    dreamGroup.add(dwRight);
    const dwMid = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.05), dreamWindowFrameMat);
    dwMid.position.set(8.3, 1.78, -2.955);
    markPanoramaObject(dwMid, 'wallDecor', 'north');
    dreamGroup.add(dwMid);

    const dreamTerminalGroup = new THREE.Group();
    const dreamTerminalBodyMat = new THREE.MeshStandardMaterial({
        color: 0x0c111d,
        roughness: 0.32,
        metalness: 0.48
    });
    const dreamTerminalBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.7), dreamTerminalBodyMat);
    dreamTerminalBody.castShadow = true;
    dreamTerminalGroup.add(dreamTerminalBody);

    const dreamTerminalCanvas = document.createElement('canvas');
    dreamTerminalCanvas.width = 512;
    dreamTerminalCanvas.height = 384;
    const dreamCtx = dreamTerminalCanvas.getContext('2d');
    dreamCtx.fillStyle = '#06111d';
    dreamCtx.fillRect(0, 0, 512, 384);
    dreamCtx.strokeStyle = '#8af7ff';
    dreamCtx.lineWidth = 8;
    dreamCtx.strokeRect(20, 20, 472, 344);
    dreamCtx.fillStyle = '#8af7ff';
    dreamCtx.font = 'bold 50px Microsoft YaHei, sans-serif';
    dreamCtx.textAlign = 'center';
    dreamCtx.fillText('DREAM', 256, 142);
    dreamCtx.font = '30px Microsoft YaHei, sans-serif';
    dreamCtx.fillText('造梦终端', 256, 210);
    dreamCtx.fillStyle = 'rgba(196, 181, 253, 0.52)';
    for (let i = 0; i < 4; i++) {
        dreamCtx.fillRect(112 + i * 78, 278, 48, 10);
    }
    const dreamTerminalScreenTex = new THREE.CanvasTexture(dreamTerminalCanvas);
    const dreamTerminalScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.58, 0.45),
        new THREE.MeshStandardMaterial({
            map: dreamTerminalScreenTex,
            color: 0xffffff,
            emissive: 0x6befff,
            emissiveIntensity: 0.5,
            roughness: 0.16
        })
    );
    dreamTerminalScreen.position.set(0.052, 0.08, 0);
    dreamTerminalScreen.rotation.y = Math.PI / 2;
    dreamTerminalGroup.add(dreamTerminalScreen);
    const dreamTerminalGlow = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.05, 0.54),
        new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: 0xc4b5fd, emissiveIntensity: 1.1 })
    );
    dreamTerminalGlow.position.set(0.058, -0.35, 0);
    dreamTerminalGroup.add(dreamTerminalGlow);
    dreamTerminalGroup.position.set(5.25, 1.5, 2.955);
    dreamTerminalGroup.rotation.y = Math.PI / 2;
    dreamGroup.add(dreamTerminalGroup);
    const dreamTerminalMesh = dreamTerminalBody;
    dreamTerminalMesh.userData.interactionCenter = new THREE.Vector3(5.25, 1.58, 2.955);

    group.add(dreamGroup);

    // Chair
    const chairSeat = makeBox(0.45, 0.05, 0.45, 0x5C4033, 2.1, 0.45, -1.2);
    group.add(chairSeat);
    const chairBack = makeBox(0.45, 0.5, 0.05, 0x5C4033, 2.1, 0.725, -1.4);
    group.add(chairBack);
    const chairLeg1 = makeBox(0.04, 0.43, 0.04, 0x4A3520, 1.92, 0.215, -1.02);
    group.add(chairLeg1);
    const chairLeg2 = makeBox(0.04, 0.43, 0.04, 0x4A3520, 2.28, 0.215, -1.02);
    group.add(chairLeg2);
    const chairLeg3 = makeBox(0.04, 0.43, 0.04, 0x4A3520, 1.92, 0.215, -1.38);
    group.add(chairLeg3);
    const chairLeg4 = makeBox(0.04, 0.43, 0.04, 0x4A3520, 2.28, 0.215, -1.38);
    group.add(chairLeg4);
    const cushion = makeBox(0.42, 0.04, 0.42, 0x8B0000, 2.1, 0.49, -1.2);
    group.add(cushion);
    const chairCollider = makeAABB(2.1, 0, -1.2, 0.28, 0.25, 0.28);
    colliders.push(chairCollider);

    // Bookshelf
    const shelfGroup = new THREE.Group();
    const shelfZ = 1.3;
    const shelfBase = makeBox(0.8, 1.4, 0.35, 0x4A3520, -2.6, 0.7, shelfZ);
    shelfGroup.add(shelfBase);
    const shelf1 = makeBox(0.72, 0.03, 0.3, 0x5C4033, -2.6, 0.45, shelfZ);
    shelfGroup.add(shelf1);
    const shelf2 = makeBox(0.72, 0.03, 0.3, 0x5C4033, -2.6, 0.9, shelfZ);
    shelfGroup.add(shelf2);
    const bookColors = [0x8B0000, 0x006400, 0x00008B, 0x8B4513, 0x4B0082, 0xB8860B];
    for (let row = 0; row < 2; row++) {
        const baseY = row === 0 ? 0.25 : 0.7;
        for (let i = 0; i < 5; i++) {
            const bookH = 0.15 + Math.random() * 0.1;
            const book = makeBox(0.08 + Math.random() * 0.04, bookH, 0.2,
                bookColors[i % bookColors.length],
                -2.85 + i * 0.14, baseY + bookH / 2, shelfZ, false);
            shelfGroup.add(book);
        }
    }
    const cabinetLabelCanvas = document.createElement('canvas');
    cabinetLabelCanvas.width = 256;
    cabinetLabelCanvas.height = 64;
    const cabinetCtx = cabinetLabelCanvas.getContext('2d');
    cabinetCtx.fillStyle = 'rgba(20, 14, 10, 0.82)';
    cabinetCtx.fillRect(0, 0, 256, 64);
    cabinetCtx.strokeStyle = 'rgba(230, 190, 120, 0.8)';
    cabinetCtx.strokeRect(6, 6, 244, 52);
    cabinetCtx.fillStyle = '#f0d59b';
    cabinetCtx.font = '24px Microsoft YaHei, sans-serif';
    cabinetCtx.textAlign = 'center';
    cabinetCtx.fillText('礼物收藏', 128, 40);
    const cabinetLabelTex = new THREE.CanvasTexture(cabinetLabelCanvas);
    const cabinetLabel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.48, 0.12),
        new THREE.MeshStandardMaterial({ map: cabinetLabelTex, transparent: true })
    );
    cabinetLabel.position.set(-2.6, 1.18, shelfZ + 0.215);
    shelfGroup.add(cabinetLabel);
    shelfGroup.userData.interactionCenter = new THREE.Vector3(-2.6, 0.85, shelfZ);
    group.add(shelfGroup);
    colliders.push(makeAABB(-2.6, 0, shelfZ, 0.45, 0.75, 0.22));

    // Wall collisions mirror the visual wall blocks. The shared wall uses the same thick
    // segments as the mesh above, keeping the door opening physically passable.
    const sharedWallColliders = [
        makeCollider(sharedWallBedroomFaceX, 0, -3, sharedWallDreamFaceX, 3, sharedDoor.minZ),
        makeCollider(sharedWallBedroomFaceX, 0, sharedDoor.maxZ, sharedWallDreamFaceX, 3, 3),
        makeCollider(sharedWallBedroomFaceX, sharedDoor.height, sharedDoor.minZ, sharedWallDreamFaceX, 3, sharedDoor.maxZ)
    ];
    const wallColliders = [
        makeCollider(-3.5, 0, -3.0, 3.5, 3, -2.4),
        makeCollider(-3.5, 0, 2.4, 3.5, 3, 3.0),
        makeCollider(-3.5, 0, -3.0, -2.9, 3, 3.0),
        makeCollider(2.5, 0, -3.55, 13.5, 3, -2.9),
        makeCollider(2.5, 0, 2.9, 13.5, 3, 3.55),
        makeCollider(12.9, 0, -3.5, 13.5, 3, 3.5),
        ...sharedWallColliders
    ];
    const dreamDoorCollider = makeCollider(sharedWallBedroomFaceX, 0, sharedDoor.minZ, sharedWallDreamFaceX, dreamDoorHeight, sharedDoor.maxZ);
    const playerColliders = [...colliders, ...wallColliders, dreamDoorCollider];

    // Rug
    const rugGeo = new THREE.PlaneGeometry(2.0, 1.5);
    const rugMat = new THREE.MeshStandardMaterial({ color: 0x8B4553, roughness: 0.95 });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.005, 0);
    rug.receiveShadow = true;
    group.add(rug);

    // Painting area (16:9)
    const paintW = 1.6, paintH = 0.9;
    const paintGeo = new THREE.PlaneGeometry(paintW, paintH);
    const paintMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e8, roughness: 0.8 });
    const painting = new THREE.Mesh(paintGeo, paintMat);
    painting.position.set(0, 1.6, 2.48);
    painting.rotation.y = Math.PI;
    markPanoramaObject(painting, 'wallDecor', 'south');
    group.add(painting);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 32;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.font = '18px Microsoft YaHei, sans-serif';
    labelCtx.fillStyle = 'rgba(120, 100, 80, 0.7)';
    labelCtx.textAlign = 'center';
    labelCtx.fillText('青尘工作室 | CyanDust_青尘', 256, 22);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, transparent: true });
    const paintingLabel = new THREE.Mesh(new THREE.PlaneGeometry(paintW * 0.6, 0.05), labelMat);
    paintingLabel.position.set(0, 1.6 - paintH / 2 + 0.06, 2.49);
    paintingLabel.rotation.y = Math.PI;
    markPanoramaObject(paintingLabel, 'wallDecor', 'south');
    group.add(paintingLabel);

    const pfMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.5 });
    const pfT = new THREE.Mesh(new THREE.BoxGeometry(paintW + 0.08, 0.04, 0.03), pfMat);
    pfT.position.set(0, 1.6 + paintH / 2, 2.48);
    markPanoramaObject(pfT, 'wallDecor', 'south');
    group.add(pfT);
    const pfB = pfT.clone();
    pfB.position.y = 1.6 - paintH / 2;
    markPanoramaObject(pfB, 'wallDecor', 'south');
    group.add(pfB);
    const pfL = new THREE.Mesh(new THREE.BoxGeometry(0.04, paintH + 0.08, 0.03), pfMat);
    pfL.position.set(-paintW / 2, 1.6, 2.48);
    markPanoramaObject(pfL, 'wallDecor', 'south');
    group.add(pfL);
    const pfR = pfL.clone();
    pfR.position.x = paintW / 2;
    markPanoramaObject(pfR, 'wallDecor', 'south');
    group.add(pfR);

    // Wardrobe
    const wardrobeGroup = new THREE.Group();
    const wdBMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.7 });
    const wdBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.6), wdBMat);
    wdBody.position.set(0, 1.0, 0);
    wdBody.castShadow = true;
    wardrobeGroup.add(wdBody);
    const wdDoorL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.8, 0.05), new THREE.MeshStandardMaterial({ color: 0x6B4914, roughness: 0.6 }));
    wdDoorL.position.set(-0.24, 1.0, 0.33);
    wardrobeGroup.add(wdDoorL);
    const wdDoorR = wdDoorL.clone();
    wdDoorR.position.x = 0.24;
    wardrobeGroup.add(wdDoorR);
    const wdHandle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0xccaa44, roughness: 0.3, metalness: 0.8 }));
    wdHandle.position.set(-0.1, 1.0, 0.37);
    wardrobeGroup.add(wdHandle);
    const wdHandle2 = wdHandle.clone();
    wdHandle2.position.x = 0.1;
    wardrobeGroup.add(wdHandle2);
    wardrobeGroup.position.set(2.4, 0, 2.2);
    wardrobeGroup.rotation.y = Math.PI;
    group.add(wardrobeGroup);
    colliders.push(makeAABB(2.4, 0, 2.2, 0.55, 1.05, 0.32));
    const wardrobeMesh = wdBody;

    const paintingZone = new THREE.Vector3(0, 0, 1.8);

    // Date door (decorative, left side of painting wall). Visual style matches the dream-room sliding door,
    // but it remains a static date trigger and does not alter the south wall thickness.
    const doorGroup = new THREE.Group();
    markPanoramaObject(doorGroup, 'wallDecor', 'south');
    const doorWidth = sharedDoor.width;
    const doorHeight = dreamDoorHeight;
    const doorX = -2.2;
    const doorZ = 2.48;
    const dateDoorFrameZ = 2.455;
    const dateDoorFrameThickness = 0.035;
    const dateDoorFrameDepth = 0.07;
    const doorFrameL = new THREE.Mesh(new THREE.BoxGeometry(dateDoorFrameDepth, doorHeight, dateDoorFrameThickness), sharedDoorFrameMat);
    doorFrameL.position.set(doorX - doorWidth / 2 - 0.04, doorHeight / 2, dateDoorFrameZ);
    doorGroup.add(doorFrameL);
    const doorFrameR = doorFrameL.clone();
    doorFrameR.position.x = doorX + doorWidth / 2 + 0.04;
    doorGroup.add(doorFrameR);
    const doorFrameT = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.18, 0.07, dateDoorFrameThickness), sharedDoorFrameMat);
    doorFrameT.position.set(doorX, doorHeight + 0.035, dateDoorFrameZ);
    doorGroup.add(doorFrameT);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.07), dreamDoorMat);
    doorPanel.position.set(doorX, doorHeight / 2, doorZ);
    doorPanel.castShadow = true;
    doorPanel.receiveShadow = true;
    doorPanel.userData.interactionCenter = new THREE.Vector3(doorX, 1.2, doorZ);
    doorGroup.add(doorPanel);

    for (const xOffset of [-0.5, -0.36, -0.22, -0.08, 0.06, 0.2, 0.34, 0.48]) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, doorHeight * 0.9, 0.014), stripeMat);
        stripe.position.set(xOffset, 0, -0.043);
        doorPanel.add(stripe);
    }
    const dateDoorGoldLine = new THREE.Mesh(new THREE.BoxGeometry(0.018, doorHeight * 0.72, 0.016), goldLineMat);
    dateDoorGoldLine.position.set(-0.24, -0.1, -0.045);
    doorPanel.add(dateDoorGoldLine);
    const dateDoorLogo = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshStandardMaterial({
            map: dreamDoorLogoTex,
            transparent: true,
            roughness: 0.35,
            side: THREE.DoubleSide
        })
    );
    dateDoorLogo.position.set(0, 0.58, -0.047);
    doorPanel.add(dateDoorLogo);

    group.add(doorGroup);
    const doorMesh = doorPanel;

    scene.add(group);

    const waypoints = [
        { name: 'center', position: new THREE.Vector3(0, 0, 0), isFurniture: false },
        { name: 'window', position: new THREE.Vector3(0, 0, -1.5), isFurniture: false },
        { name: 'door', position: new THREE.Vector3(0, 0, 1.5), isFurniture: false },
        { name: 'bookshelf', position: new THREE.Vector3(-1.8, 0, 1.2), isFurniture: false },
        {
            name: 'bed_sit',
            position: new THREE.Vector3(-2.1, 0, -1.0),
            isFurniture: true,
            furnitureType: 'bed',
            sitCollider: bedCollider
        },
        {
            name: 'chair_sit',
            position: new THREE.Vector3(2.1, 0, -1.2),
            isFurniture: true,
            furnitureType: 'chair',
            sitCollider: chairCollider
        },
    ];

    const dreamRoomWaypoints = [
        { name: 'dream_entry', roomId: 'dream', position: new THREE.Vector3(4.25, 0, sharedDoor.centerZ), isFurniture: false },
        { name: 'dream_center', roomId: 'dream', position: new THREE.Vector3(8, 0, 0), isFurniture: false },
        { name: 'dream_window', roomId: 'dream', position: new THREE.Vector3(8.2, 0, -1.95), isFurniture: false },
        { name: 'dream_far_wall', roomId: 'dream', position: new THREE.Vector3(11.3, 0, 1.85), isFurniture: false },
        { name: 'dream_terminal', roomId: 'dream', position: new THREE.Vector3(5.25, 0, 1.85), isFurniture: false }
    ];

    const dreamRoomColliders = [];

    return {
        group,
        colliders,
        playerColliders,
        waypoints,
        oldRoomBounds,
        dreamRoomBounds,
        dreamRoomColliders,
        dreamRoomWaypoints,
        doorClearanceZone,
        dreamDoorMesh,
        dreamDoorInteractionMesh,
        dreamDoorCollider,
        dreamDoorClosedPosition,
        dreamDoorOpenPosition,
        painting,
        paintingLabel,
        paintingZone,
        wardrobeMesh,
        bedMesh: bedGroup,
        bedBlanket,
        deskMesh,
        doorMesh,
        windowMesh: window1,
        terminalMesh,
        dreamTerminalMesh,
        dreamWindowMesh: dreamWindow,
        collectionCabinetMesh: shelfGroup
    };
}
