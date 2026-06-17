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

export function createRoom(scene) {
    const colliders = [];
    const group = new THREE.Group();

    const floorGeo = new THREE.PlaneGeometry(6, 5);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    group.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xFAF0E6, roughness: 0.9 });

    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat);
    backWall.position.set(0, 1.5, -2.5);
    backWall.receiveShadow = true;
    group.add(backWall);

    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat);
    frontWall.position.set(0, 1.5, 2.5);
    frontWall.rotation.y = Math.PI;
    frontWall.receiveShadow = true;
    group.add(frontWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), wallMat);
    leftWall.position.set(-3, 1.5, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), wallMat);
    rightWall.position.set(3, 1.5, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    group.add(rightWall);

    const ceilGeo = new THREE.PlaneGeometry(6, 5);
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3;
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
    group.add(window1);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.3 });
    const frameH = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 0.05), frameMat);
    frameH.position.set(0, 2.4, -2.48);
    group.add(frameH);
    const frameH2 = frameH.clone();
    frameH2.position.y = 1.2;
    group.add(frameH2);
    const frameV1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.25, 0.05), frameMat);
    frameV1.position.set(-0.975, 1.8, -2.48);
    group.add(frameV1);
    const frameV2 = frameV1.clone();
    frameV2.position.x = 0.975;
    group.add(frameV2);
    const frameVMid = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.05), frameMat);
    frameVMid.position.set(0, 1.8, -2.48);
    group.add(frameVMid);

    // Bed
    const bedGroup = new THREE.Group();
    const bedFrame = makeBox(1.2, 0.35, 2.0, 0x5C4033, -2.1, 0.175, -1.3);
    bedGroup.add(bedFrame);
    const bedMattress = makeBox(1.1, 0.15, 1.9, 0xE6E6FA, -2.1, 0.425, -1.3);
    bedGroup.add(bedMattress);
    const bedPillow = makeBox(0.5, 0.1, 0.35, 0xffffff, -2.1, 0.55, -2.1);
    bedGroup.add(bedPillow);
    const bedBlanket = makeBox(1.05, 0.08, 1.3, 0xFFB6C1, -2.1, 0.53, -0.85);
    bedGroup.add(bedBlanket);
    const bedHeadboard = makeBox(1.2, 0.6, 0.08, 0x4A3520, -2.1, 0.7, -2.26);
    bedGroup.add(bedHeadboard);
    group.add(bedGroup);
    colliders.push(makeAABB(-2.1, 0, -1.3, 0.65, 0.55, 1.05));
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
    colliders.push(makeAABB(2.1, 0, -1.2, 0.28, 0.25, 0.28));

    // Bookshelf
    const shelfBase = makeBox(0.8, 1.4, 0.35, 0x4A3520, -2.6, 0.7, 1.5);
    group.add(shelfBase);
    const shelf1 = makeBox(0.72, 0.03, 0.3, 0x5C4033, -2.6, 0.45, 1.5);
    group.add(shelf1);
    const shelf2 = makeBox(0.72, 0.03, 0.3, 0x5C4033, -2.6, 0.9, 1.5);
    group.add(shelf2);
    const bookColors = [0x8B0000, 0x006400, 0x00008B, 0x8B4513, 0x4B0082, 0xB8860B];
    for (let row = 0; row < 2; row++) {
        const baseY = row === 0 ? 0.25 : 0.7;
        for (let i = 0; i < 5; i++) {
            const bookH = 0.15 + Math.random() * 0.1;
            const book = makeBox(0.08 + Math.random() * 0.04, bookH, 0.2,
                bookColors[i % bookColors.length],
                -2.85 + i * 0.14, baseY + bookH / 2, 1.5, false);
            group.add(book);
        }
    }
    colliders.push(makeAABB(-2.6, 0, 1.5, 0.45, 0.75, 0.22));

    // Wall collisions
    colliders.push(new THREE.Box3(
        new THREE.Vector3(-3.1, 0, -2.55),
        new THREE.Vector3(3.1, 3, -2.45)
    ));
    colliders.push(new THREE.Box3(
        new THREE.Vector3(-3.1, 0, 2.45),
        new THREE.Vector3(3.1, 3, 2.55)
    ));
    colliders.push(new THREE.Box3(
        new THREE.Vector3(-3.05, 0, -2.5),
        new THREE.Vector3(-2.95, 3, 2.5)
    ));
    colliders.push(new THREE.Box3(
        new THREE.Vector3(2.95, 0, -2.5),
        new THREE.Vector3(3.05, 3, 2.5)
    ));

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
    group.add(painting);

    const pfMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.5 });
    const pfT = new THREE.Mesh(new THREE.BoxGeometry(paintW + 0.08, 0.04, 0.03), pfMat);
    pfT.position.set(0, 1.6 + paintH / 2, 2.48);
    group.add(pfT);
    const pfB = pfT.clone();
    pfB.position.y = 1.6 - paintH / 2;
    group.add(pfB);
    const pfL = new THREE.Mesh(new THREE.BoxGeometry(0.04, paintH + 0.08, 0.03), pfMat);
    pfL.position.set(-paintW / 2, 1.6, 2.48);
    group.add(pfL);
    const pfR = pfL.clone();
    pfR.position.x = paintW / 2;
    group.add(pfR);

    // Wardrobe
    const wdBMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.7 });
    const wdBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 0.6), wdBMat);
    wdBody.position.set(2.4, 1.0, 1.8);
    wdBody.castShadow = true;
    group.add(wdBody);
    const wdDoorL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.8, 0.05), new THREE.MeshStandardMaterial({ color: 0x6B4914, roughness: 0.6 }));
    wdDoorL.position.set(2.16, 1.0, 2.13);
    group.add(wdDoorL);
    const wdDoorR = wdDoorL.clone();
    wdDoorR.position.x = 2.64;
    group.add(wdDoorR);
    const wdHandle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0xccaa44, roughness: 0.3, metalness: 0.8 }));
    wdHandle.position.set(2.3, 1.0, 2.17);
    group.add(wdHandle);
    const wdHandle2 = wdHandle.clone();
    wdHandle2.position.x = 2.5;
    group.add(wdHandle2);
    colliders.push(makeAABB(2.4, 0, 1.8, 0.55, 1.05, 0.35));
    const wardrobeMesh = wdBody;

    const paintingZone = new THREE.Vector3(0, 0, 1.8);

    scene.add(group);

    const waypoints = [
        { name: 'center', position: new THREE.Vector3(0, 0, 0), isFurniture: false },
        { name: 'window', position: new THREE.Vector3(0, 0, -1.5), isFurniture: false },
        { name: 'door', position: new THREE.Vector3(0, 0, 1.5), isFurniture: false },
        { name: 'bookshelf', position: new THREE.Vector3(-1.8, 0, 1.2), isFurniture: false },
        { name: 'bed_sit', position: new THREE.Vector3(-2.1, 0, -1.0), isFurniture: true, furnitureType: 'bed' },
        { name: 'chair_sit', position: new THREE.Vector3(2.1, 0, -1.2), isFurniture: true, furnitureType: 'chair' },
    ];

    return { colliders, waypoints, painting, paintingZone, wardrobeMesh, bedMesh: bedGroup, bedBlanket };
}
