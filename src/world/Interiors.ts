import * as THREE from 'three';
import type { BuildingCategory, EnterableBuildingConfig, InteractablePoint } from '../types/game';
import { ENTERABLE_BUILDINGS } from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import { createProceduralHumanoid, type HumanoidRig } from '../player/Player';
import { createProceduralVehicleModel } from '../vehicles/Vehicle';
import type { ProceduralTextureSet } from './textures';
import {
  CINEMA_MOVIE_COUNT,
  createCinemaHallRuntime,
  disposeCinemaHallRuntime,
  setCinemaHallCustomVideo,
  setCinemaHallMovieIndex,
  stepCinemaHallRuntime,
  toggleCinemaHallPlayPause,
  type CinemaHallRuntime,
} from './CinemaMoviePlayer';

export interface EnterableBuildingsHandle {
  group: THREE.Group;
  interactPoints: InteractablePoint[];
  update: (
    dt: number,
    elapsed: number,
    ownedProperties?: string[],
    viewerPos?: { x: number; z: number },
    activeCinemaBuildingId?: string | null,
    cinemaAudioGain?: number,
  ) => void;
  cycleCinemaMovie: (buildingId: string) => number;
  setCinemaMovie: (buildingId: string, index: number) => number;
  loadCustomCinemaVideo: (buildingId: string, objectUrl: string, fileName: string) => void;
  toggleCinemaPlayPause: (buildingId: string) => boolean;
  isCinemaPlayingRealAudio: (buildingId: string) => boolean;
  getCinemaMovieIndex: (buildingId: string) => number;
  dispose: () => void;
}

interface AnimatedInteriorStaff {
  rig: HumanoidRig;
  phaseOffset: number;
  baseYaw: number;
  seated?: boolean;
}

interface EnterpriseBeaconRef {
  buildingId: string;
  material: THREE.MeshStandardMaterial;
  defaultColor: THREE.Color;
  ownedState: boolean;
}

const OWNED_EMERALD_COLOR = new THREE.Color(0x10b981);

function getCategoryGlyph(category: BuildingCategory): string {
  switch (category) {
    case 'shop':
      return 'D';
    case 'enterprise':
      return 'K';
    case 'restaurant':
      return 'R';
    case 'museum':
      return 'M';
    case 'cinema':
      return 'C';
    case 'arcade':
      return 'A';
  }
}

function createSignboardTexture(
  title: string,
  subtitle: string,
  accentHex: string,
  category: BuildingCategory,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);

    ctx.fillStyle = accentHex;
    ctx.fillRect(18, 20, 88, 88);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getCategoryGlyph(category), 62, 66);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 31px sans-serif';
    ctx.fillText(title, 122, 50);

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(subtitle, 122, 88);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFramedPaintingTexture(seed: number, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const palettes = [
      ['#0f172a', '#38bdf8', '#f59e0b', '#f43f5e'],
      ['#1e1b4b', '#c084fc', '#2dd4bf', '#fde047'],
      ['#064e3b', '#34d399', '#fbbf24', '#f8fafc'],
      ['#3b0764', '#f472b6', '#60a5fa', '#fef08a'],
    ];
    const pal = palettes[seed % palettes.length];
    ctx.fillStyle = pal[0];
    ctx.fillRect(0, 0, 256, 192);

    ctx.fillStyle = pal[1];
    ctx.beginPath();
    ctx.arc(82 + (seed % 3) * 35, 88, 52, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = pal[2];
    ctx.fillRect(110, 42, 96, 108);

    ctx.strokeStyle = accentHex || pal[3];
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(28, 156);
    ctx.lineTo(132, 36);
    ctx.lineTo(226, 148);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Returns safe world-space browsing coordinates inside a given enterable building
 * so sidewalk pedestrians can walk inside, browse, and walk back out cleanly.
 */
export function getBuildingBrowseSpots(b: EnterableBuildingConfig): Array<{ x: number; z: number; yaw: number }> {
  const fSign = b.doorFacing === 'south' ? 1 : -1;
  const toWorld = (lx: number, lz: number, localYaw: number) => {
    if (fSign === 1) {
      return { x: b.centerX + lx, z: b.centerZ + lz, yaw: localYaw };
    }
    return { x: b.centerX - lx, z: b.centerZ - lz, yaw: localYaw + Math.PI };
  };

  if (b.category === 'shop') {
    return [
      toWorld(-3.8, 2.5, -Math.PI * 0.5),
      toWorld(3.8, 2.5, Math.PI * 0.5),
      toWorld(-3.8, -2.0, -Math.PI * 0.5),
      toWorld(0, -4.5, Math.PI),
    ];
  }
  if (b.category === 'enterprise') {
    return [
      toWorld(-3.8, 2.8, -Math.PI * 0.5),
      toWorld(3.8, 2.8, Math.PI * 0.5),
      toWorld(-3.8, -1.8, -Math.PI * 0.5),
      toWorld(0, -4.4, Math.PI),
    ];
  }
  if (b.category === 'restaurant') {
    return [
      toWorld(-2.0, 2.6, -Math.PI * 0.5),
      toWorld(2.0, 2.6, Math.PI * 0.5),
      toWorld(-2.0, -1.4, -Math.PI * 0.5),
      toWorld(0, -3.6, Math.PI),
    ];
  }
  if (b.category === 'cinema') {
    // Wide 6.0m central aisle facing the giant screen (local -Z = yaw PI)
    return [
      toWorld(-1.5, 2.8, Math.PI),
      toWorld(1.5, 2.8, Math.PI),
      toWorld(-1.4, -1.8, Math.PI),
      toWorld(1.4, -1.8, Math.PI),
    ];
  }
  if (b.category === 'arcade') {
    return [
      toWorld(-3.6, 2.5, -Math.PI * 0.5),
      toWorld(3.6, 2.5, Math.PI * 0.5),
      toWorld(-3.6, -2.2, -Math.PI * 0.5),
      toWorld(0, 3.2, Math.PI),
    ];
  }
  // museum
  return [
    toWorld(-3.4, 2.6, Math.PI * 0.5),
    toWorld(3.4, 2.6, -Math.PI * 0.5),
    toWorld(-3.6, -2.8, -Math.PI * 0.5),
    toWorld(3.6, -2.8, Math.PI * 0.5),
  ];
}

export function buildEnterableBuildings(
  collisionWorld: CollisionWorld,
  isSoftwareGl: boolean,
  textures?: ProceduralTextureSet,
  nightMaterials?: THREE.MeshStandardMaterial[],
): EnterableBuildingsHandle {
  const group = new THREE.Group();
  const interactPoints: InteractablePoint[] = [];
  const kineticSculptures: THREE.Object3D[] = [];
  const cinemaHalls: CinemaHallRuntime[] = [];
  let cinemaOrderCounter = 0;
  const enterpriseBeacons: EnterpriseBeaconRef[] = [];
  const staffAgents: AnimatedInteriorStaff[] = [];

  // Shared Architectural Materials
  const darkFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.34,
    metalness: 0.82,
  });
  const brushedBrassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.24,
    metalness: 0.88,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.9,
  });
  const storefrontGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  const warmLightPanelMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 0.95,
    roughness: 0.2,
  });
  const coolLightPanelMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x7dd3fc,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.58,
    metalness: 0.06,
  });
  const creamMarbleMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.22,
    metalness: 0.12,
  });
  const darkCounterMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.36,
    metalness: 0.45,
  });
  const screenGlowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.85,
    roughness: 0.15,
  });
  const magentaGlowMat = new THREE.MeshStandardMaterial({
    color: 0xf472b6,
    emissive: 0xdb2777,
    emissiveIntensity: 0.85,
    roughness: 0.18,
  });
  const amberStripMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });
  const velvetRedMat = new THREE.MeshStandardMaterial({
    color: 0xbe123c,
    roughness: 0.85,
    metalness: 0.04,
  });
  const foliageGreenMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.8,
  });

  // Procedural illuminated tower window materials for walk-in skyscrapers
  const towerWindowTints = [0xe2e8f0, 0xbae6fd, 0xcbd5e1, 0x93c5fd, 0xfde68a];
  const towerFacadeMaterials = towerWindowTints.map((tint) => {
    const mat = new THREE.MeshStandardMaterial({
      color: tint,
      map: textures?.officeFacade ?? null,
      emissive: 0xffffff,
      emissiveMap: textures?.officeEmissive ?? null,
      emissiveIntensity: textures ? 0.08 : 0,
      roughness: 0.24,
      metalness: 0.68,
    });
    if (textures && nightMaterials) {
      nightMaterials.push(mat);
    }
    return mat;
  });

  ENTERABLE_BUILDINGS.forEach((b, bIdx) => {
    const hw = b.width * 0.5;
    const hd = b.depth * 0.5;
    const h = b.ceilingHeight;
    const wallT = 0.75;
    const doorW = b.doorWidth;
    const fSign = b.doorFacing === 'south' ? 1 : -1;

    // Root container positioned at building center and rotated so local +Z ALWAYS faces the street entrance!
    const venueRoot = new THREE.Group();
    venueRoot.position.set(b.centerX, 0, b.centerZ);
    venueRoot.rotation.y = b.doorFacing === 'south' ? 0 : Math.PI;
    group.add(venueRoot);

    const accentColorObj = new THREE.Color(b.accentColor);
    const accentNeonMat = new THREE.MeshStandardMaterial({
      color: accentColorObj,
      emissive: accentColorObj,
      emissiveIntensity: 0.8,
      roughness: 0.25,
    });
    enterpriseBeacons.push({
      buildingId: b.id,
      material: accentNeonMat,
      defaultColor: accentColorObj.clone(),
      ownedState: false,
    });

    const facadeColorByCat: Record<BuildingCategory, number> = {
      shop: 0xf1f5f9,
      enterprise: 0xcbd5e1,
      restaurant: 0xfef3c7,
      museum: 0xf8fafc,
      cinema: 0x1e293b,
      arcade: 0x0f172a,
    };
    const floorColorByCat: Record<BuildingCategory, number> = {
      shop: 0xe2e8f0,
      enterprise: 0x334155,
      restaurant: 0x92400e,
      museum: 0xf1f5f9,
      cinema: 0x111827,
      arcade: 0x1e1b4b,
    };

    const wallMat = new THREE.MeshStandardMaterial({
      color: facadeColorByCat[b.category],
      roughness: 0.64,
      metalness: b.category === 'cinema' || b.category === 'arcade' ? 0.35 : 0.12,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: floorColorByCat[b.category],
      roughness: b.category === 'museum' ? 0.24 : b.category === 'cinema' ? 0.85 : 0.45,
      metalness: b.category === 'enterprise' || b.category === 'arcade' ? 0.28 : 0.08,
    });

    // 1. Interior Floor Slab + Paved Entrance Walkway to Boulevard Sidewalk
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(b.width - 0.2, 0.1, b.depth - 0.2), floorMat);
    floorMesh.position.set(0, 0.05, 0);
    floorMesh.receiveShadow = true;
    venueRoot.add(floorMesh);

    const frontWorldZ = b.centerZ + fSign * hd;
    const walkwayLen = Math.max(2, Math.abs(b.sidewalkZ - frontWorldZ));
    const walkwayGeo = new THREE.PlaneGeometry(doorW + 2.8, walkwayLen + 1.2);
    walkwayGeo.rotateX(-Math.PI / 2);
    const walkwayMesh = new THREE.Mesh(
      walkwayGeo,
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.78,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    walkwayMesh.position.set(0, 0.032, hd + walkwayLen * 0.5);
    walkwayMesh.receiveShadow = true;
    venueRoot.add(walkwayMesh);

    // Glowing welcome threshold strip at open doorway
    const welcomeMat = new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.4, 0.06, 1.1), accentNeonMat);
    welcomeMat.position.set(0, 0.04, hd - 0.2);
    venueRoot.add(welcomeMat);

    // 2. Perimeter Lobby Walls (Back, Left, Right) + Storefront Glass Facade with Wide Open Doorway
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(b.width, h, wallT), wallMat);
    backWall.position.set(0, h * 0.5, -hd + wallT * 0.5);
    backWall.castShadow = !isSoftwareGl;
    backWall.receiveShadow = true;

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, b.depth), wallMat);
    leftWall.position.set(-hw + wallT * 0.5, h * 0.5, 0);
    leftWall.castShadow = !isSoftwareGl;
    leftWall.receiveShadow = true;

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, b.depth), wallMat);
    rightWall.position.set(hw - wallT * 0.5, h * 0.5, 0);
    rightWall.castShadow = !isSoftwareGl;
    rightWall.receiveShadow = true;

    venueRoot.add(backWall, leftWall, rightWall);

    const sideSegW = (b.width - doorW) * 0.5;
    const doorH = 4.3;
    for (const side of [-1, 1] as const) {
      const segCenterX = side * (doorW * 0.5 + sideSegW * 0.5);
      const kneeWall = new THREE.Mesh(new THREE.BoxGeometry(sideSegW, 0.85, wallT), darkFrameMat);
      kneeWall.position.set(segCenterX, 0.425, hd - wallT * 0.5);

      const glassPane = new THREE.Mesh(new THREE.BoxGeometry(sideSegW - 0.4, doorH - 0.9, 0.14), storefrontGlassMat);
      glassPane.position.set(segCenterX, 0.85 + (doorH - 0.9) * 0.5, hd - wallT * 0.5);
      glassPane.renderOrder = 2;

      const upperSeg = new THREE.Mesh(new THREE.BoxGeometry(sideSegW, h - doorH, wallT), wallMat);
      upperSeg.position.set(segCenterX, doorH + (h - doorH) * 0.5, hd - wallT * 0.5);

      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.38, doorH, wallT + 0.18), darkFrameMat);
      jamb.position.set(side * (doorW * 0.5 + 0.12), doorH * 0.5, hd - wallT * 0.5);

      const openLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.65, doorH - 0.3, 0.1), storefrontGlassMat);
      openLeaf.position.set(side * (doorW * 0.5 + 0.98), (doorH - 0.3) * 0.5 + 0.1, hd - 0.15);
      openLeaf.renderOrder = 2;

      venueRoot.add(kneeWall, glassPane, upperSeg, jamb, openLeaf);
    }

    const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.4, h - doorH, wallT), wallMat);
    doorHeader.position.set(0, doorH + (h - doorH) * 0.5, hd - wallT * 0.5);
    venueRoot.add(doorHeader);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(doorW + 3.4, 0.38, 2.6), darkFrameMat);
    canopy.position.set(0, doorH + 0.15, hd + 1.08);
    const canopyTrim = new THREE.Mesh(new THREE.BoxGeometry(doorW + 3.5, 0.16, 2.68), accentNeonMat);
    canopyTrim.position.set(0, doorH + 0.33, hd + 1.08);
    venueRoot.add(canopy, canopyTrim);

    const signTex = createSignboardTexture(b.signTitle, b.signSubtitle, b.accentColor, b.category);
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(b.width - 2.0, 12.6), 2.15, 0.3),
      new THREE.MeshBasicMaterial({ map: signTex }),
    );
    signBoard.position.set(0, h - 1.25, hd + 0.2);
    venueRoot.add(signBoard);

    // 3. Lobby Ceiling Slab + Multi-Tier Skyscraper Tower Rising Above Lobby!
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(b.width + 1.0, 0.6, b.depth + 1.0), darkFrameMat);
    roofSlab.position.set(0, h + 0.3, 0);
    roofSlab.castShadow = !isSoftwareGl;
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(b.width + 1.3, 0.44, b.depth + 1.3), accentNeonMat);
    parapet.position.set(0, h + 0.78, 0);
    venueRoot.add(roofSlab, parapet);

    if (b.towerHeight && b.towerHeight > 12) {
      const baseTopY = h + 0.95;
      const shaftW = b.width * 0.88;
      const shaftD = b.depth * 0.86;
      const shaftH = b.towerHeight * 0.72;
      const shaftMat = towerFacadeMaterials[bIdx % towerFacadeMaterials.length];
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(shaftW, shaftH, shaftD), shaftMat);
      shaft.position.set(0, baseTopY + shaftH * 0.5, -0.35);
      shaft.castShadow = !isSoftwareGl;
      shaft.receiveShadow = true;
      venueRoot.add(shaft);

      const upperW = b.width * 0.68;
      const upperD = b.depth * 0.66;
      const upperH = b.towerHeight * 0.28;
      const upperMat = towerFacadeMaterials[(bIdx + 2) % towerFacadeMaterials.length];
      const upper = new THREE.Mesh(new THREE.BoxGeometry(upperW, upperH, upperD), upperMat);
      upper.position.set(0, baseTopY + shaftH + upperH * 0.5, -0.35);
      upper.castShadow = !isSoftwareGl;
      venueRoot.add(upper);

      const crownY = baseTopY + shaftH + upperH;
      const crownBand = new THREE.Mesh(new THREE.BoxGeometry(upperW + 0.7, 0.85, upperD + 0.7), accentNeonMat);
      crownBand.position.set(0, crownY + 0.42, -0.35);
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(upperW * 0.34, 2.1, upperD * 0.34), chromeMat);
      hvac.position.set(upperW * 0.16, crownY + 1.5, -0.35 - upperD * 0.14);
      venueRoot.add(crownBand, hvac);

      if (b.hasSpire) {
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.45, 12.5, 8), chromeMat);
        spire.position.set(0, crownY + 6.8, -0.35);
        venueRoot.add(spire);
      }
    }

    // Recessed Interior Ceiling Light Panels (dimmer warm strips in cinemas, bright panels elsewhere)
    const ceilingLightMat =
      b.category === 'cinema'
        ? amberStripMat
        : b.category === 'restaurant' || b.category === 'museum'
          ? warmLightPanelMat
          : coolLightPanelMat;
    const panelW = b.category === 'cinema' ? 1.8 : 3.2;
    const panelD = b.category === 'cinema' ? 0.45 : 1.4;
    for (const lx of [-b.width * 0.26, b.width * 0.26]) {
      for (const lz of [-b.depth * 0.24, b.depth * 0.22]) {
        const lightPanel = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.1, panelD), ceilingLightMat);
        lightPanel.position.set(lx, h - 0.08, lz);
        venueRoot.add(lightPanel);
      }
    }

    // 4. Register World-Space Wall Colliders (5 segments leaving the wide center doorway 100% open!)
    const backWorldZ = b.centerZ - fSign * (hd - wallT * 0.5);
    const frontWallWorldZ = b.centerZ + fSign * (hd - wallT * 0.5);
    const totalColHeight = h + (b.towerHeight ?? 0) + 4;
    collisionWorld.addBox(`${b.id}_back_wall`, b.centerX, backWorldZ, b.width, wallT + 0.15, totalColHeight, 'wall');
    collisionWorld.addBox(
      `${b.id}_left_wall`,
      b.centerX - hw + wallT * 0.5,
      b.centerZ,
      wallT + 0.15,
      b.depth,
      totalColHeight,
      'wall',
    );
    collisionWorld.addBox(
      `${b.id}_right_wall`,
      b.centerX + hw - wallT * 0.5,
      b.centerZ,
      wallT + 0.15,
      b.depth,
      totalColHeight,
      'wall',
    );
    collisionWorld.addBox(
      `${b.id}_front_w`,
      b.centerX - (doorW * 0.5 + sideSegW * 0.5),
      frontWallWorldZ,
      sideSegW,
      wallT + 0.15,
      totalColHeight,
      'wall',
    );
    collisionWorld.addBox(
      `${b.id}_front_e`,
      b.centerX + (doorW * 0.5 + sideSegW * 0.5),
      frontWallWorldZ,
      sideSegW,
      wallT + 0.15,
      totalColHeight,
      'wall',
    );

    const localToWorldXZ = (lx: number, lz: number) => ({
      x: fSign === 1 ? b.centerX + lx : b.centerX - lx,
      z: fSign === 1 ? b.centerZ + lz : b.centerZ - lz,
    });

    const addInteriorNpc = (
      lx: number,
      lz: number,
      localYaw: number,
      jacketHex: number,
      pantsHex = 0x1e293b,
      yOffset = 0.1,
      seated = false,
    ) => {
      const npc = createProceduralHumanoid(jacketHex, pantsHex, 0xf1c27d, false);
      npc.root.position.set(lx, yOffset, lz);
      npc.root.rotation.y = localYaw;
      if (seated) {
        npc.leftLegPivot.rotation.x = -Math.PI * 0.45;
        npc.rightLegPivot.rotation.x = -Math.PI * 0.45;
      }
      venueRoot.add(npc.root);
      staffAgents.push({
        rig: npc,
        phaseOffset: bIdx * 1.7 + lx * 0.5,
        baseYaw: localYaw,
        seated,
      });
    };

    // 5. Category-Specific Rich 3D Interiors
    if (b.category === 'shop') {
      const counter = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.08, 1.2), darkCounterMat);
      counter.position.set(0, 0.58, -hd + 3.0);
      const counterTop = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.1, 1.35), creamMarbleMat);
      counterTop.position.set(0, 1.15, -hd + 3.0);
      const posScreen = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.08), screenGlowMat);
      posScreen.position.set(-0.9, 1.42, -hd + 3.0);
      venueRoot.add(counter, counterTop, posScreen);

      const cwPos = localToWorldXZ(0, -hd + 3.0);
      collisionWorld.addBox(`${b.id}_counter`, cwPos.x, cwPos.z, 5.6, 1.25, 1.2, 'prop');
      addInteriorNpc(0, -hd + 1.75, 0, 0x059669);

      const itemColors = [0xef4444, 0x3b82f6, 0xf59e0b, 0x10b981, 0xa855f7, 0xec4899];
      for (const sx of [-6.6, 6.6]) {
        for (const sz of [-1.8, 3.2]) {
          const shelfGroup = new THREE.Group();
          shelfGroup.position.set(sx, 0.1, sz);
          const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.1, 3.8), darkFrameMat);
          frame.position.y = 1.05;
          shelfGroup.add(frame);

          for (let tier = 0; tier < 3; tier++) {
            for (let boxIdx = 0; boxIdx < 4; boxIdx++) {
              const prodMat = new THREE.MeshStandardMaterial({
                color: itemColors[(tier * 3 + boxIdx + bIdx) % itemColors.length],
                roughness: 0.42,
              });
              const prod = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.36, 0.65), prodMat);
              prod.position.set(0, 0.48 + tier * 0.62, -1.25 + boxIdx * 0.84);
              shelfGroup.add(prod);
            }
          }
          venueRoot.add(shelfGroup);
          const sw = localToWorldXZ(sx, sz);
          collisionWorld.addBox(`${b.id}_shelf_${sx}_${sz}`, sw.x, sw.z, 1.4, 3.9, 1.5, 'prop');
        }
      }

      for (const fx of [-6.2, 6.2]) {
        const fridge = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.5, 0.9), coolLightPanelMat);
        fridge.position.set(fx, 1.35, -hd + 1.1);
        venueRoot.add(fridge);
      }

      const ipPos = localToWorldXZ(0, -hd + 4.4);
      interactPoints.push({
        id: `venue_${b.id}`,
        type: 'venue_counter',
        position: { x: ipPos.x, y: 0, z: ipPos.z },
        radius: 4.6,
        keyHint: 'F',
        labelKey: b.interactLabelKey,
        payloadId: b.id,
      });
    } else if (b.category === 'enterprise') {
      // Dynamic Corporate Beacon Material (turns Emerald when player owns this Enterprise!)
      const beaconMat = new THREE.MeshStandardMaterial({
        color: accentColorObj,
        emissive: accentColorObj,
        emissiveIntensity: 0.85,
        roughness: 0.22,
      });
      enterpriseBeacons.push({
        buildingId: b.id,
        material: beaconMat,
        defaultColor: accentColorObj.clone(),
        ownedState: false,
      });

      const recDesk = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.12, 1.28), darkCounterMat);
      recDesk.position.set(0, 0.62, -hd + 3.2);
      const recStripe = new THREE.Mesh(new THREE.BoxGeometry(5.55, 0.16, 1.36), beaconMat);
      recStripe.position.set(0, 1.16, -hd + 3.2);
      const wallLogo = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.15, 10, 28), beaconMat);
      wallLogo.position.set(0, 3.55, -hd + 0.55);
      venueRoot.add(recDesk, recStripe, wallLogo);

      // Executive Ownership Pillars flanking the reception zone & doorway crown
      for (const bx of [-3.4, 3.4]) {
        const totemBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 2.2, 12), darkFrameMat);
        totemBase.position.set(bx, 1.2, -hd + 3.2);
        const totemRing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.35, 12), beaconMat);
        totemRing.position.set(bx, 2.25, -hd + 3.2);
        venueRoot.add(totemBase, totemRing);
      }

      const rwPos = localToWorldXZ(0, -hd + 3.2);
      collisionWorld.addBox(`${b.id}_recdesk`, rwPos.x, rwPos.z, 5.4, 1.35, 1.2, 'prop');
      addInteriorNpc(0, -hd + 1.85, 0, 0x0284c7);
      addInteriorNpc(-5.4, 0.4, Math.PI * 0.5, 0x334155);

      for (const wx of [-6.8, 6.8]) {
        for (const wz of [-1.6, 3.2]) {
          const desk = new THREE.Group();
          desk.position.set(wx, 0.1, wz);
          const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 3.2), creamMarbleMat);
          top.position.y = 0.82;
          const legA = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.15), darkFrameMat);
          legA.position.set(0, 0.4, -1.4);
          const legB = legA.clone();
          legB.position.set(0, 0.4, 1.4);

          const mon1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.95), screenGlowMat);
          mon1.position.set(wx < 0 ? -0.35 : 0.35, 1.22, -0.65);
          const mon2 = mon1.clone();
          mon2.position.z = 0.65;

          desk.add(top, legA, legB, mon1, mon2);
          venueRoot.add(desk);
          const dw = localToWorldXZ(wx, wz);
          collisionWorld.addBox(`${b.id}_desk_${wx}_${wz}`, dw.x, dw.z, 1.8, 3.3, 1.15, 'prop');
        }
      }

      for (const sx of [-7.2, 7.2]) {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 1.2), darkFrameMat);
        rack.position.set(sx, 1.5, -hd + 1.4);
        const led = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.26), beaconMat);
        led.position.set(sx, 2.2, -hd + 1.4);
        venueRoot.add(rack, led);
      }

      const ipPos = localToWorldXZ(0, -hd + 4.6);
      interactPoints.push({
        id: `venue_${b.id}`,
        type: 'venue_counter',
        position: { x: ipPos.x, y: 0, z: ipPos.z },
        radius: 5.2,
        keyHint: 'F',
        labelKey: b.interactLabelKey,
        payloadId: b.id,
      });
    } else if (b.category === 'restaurant') {
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.12, 1.3), woodMat);
      barBase.position.set(0, 0.62, -hd + 3.0);
      const barTop = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.12, 1.5), creamMarbleMat);
      barTop.position.set(0, 1.22, -hd + 3.0);
      const espresso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.58, 0.6), chromeMat);
      espresso.position.set(1.6, 1.55, -hd + 2.95);
      const menuBoard = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.3, 0.15), warmLightPanelMat);
      menuBoard.position.set(0, 3.4, -hd + 0.55);
      venueRoot.add(barBase, barTop, espresso, menuBoard);

      const bwPos = localToWorldXZ(0, -hd + 3.0);
      collisionWorld.addBox(`${b.id}_bar`, bwPos.x, bwPos.z, 6.9, 1.4, 1.2, 'prop');
      addInteriorNpc(0, -hd + 1.7, 0, 0xf8fafc, 0x0f172a);

      const tableX = b.width > 21 ? 5.6 : 4.6;
      for (const tx of [-tableX, tableX]) {
        for (const tz of [-1.2, 3.4]) {
          const dGroup = new THREE.Group();
          dGroup.position.set(tx, 0.1, tz);

          const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.38, 0.78, 12), darkFrameMat);
          pedestal.position.y = 0.39;
          const tabletop = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.1, 20), creamMarbleMat);
          tabletop.position.y = 0.82;
          const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.32, 10), warmLightPanelMat);
          lamp.position.y = 1.02;
          dGroup.add(pedestal, tabletop, lamp);

          for (const cAngle of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
            const chair = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.52), velvetRedMat);
            chair.position.set(Math.cos(cAngle) * 1.45, 0.24, Math.sin(cAngle) * 1.45);
            dGroup.add(chair);
          }

          venueRoot.add(dGroup);
          const tw = localToWorldXZ(tx, tz);
          collisionWorld.addBox(`${b.id}_table_${tx}_${tz}`, tw.x, tw.z, 2.2, 2.2, 1.05, 'prop');
        }
      }

      for (const px of [-hw + 1.8, hw - 1.8]) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.65, 10), brushedBrassMat);
        pot.position.set(px, 0.4, hd - 1.8);
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 1), foliageGreenMat);
        bush.position.set(px, 1.3, hd - 1.8);
        venueRoot.add(pot, bush);
      }

      const ipPos = localToWorldXZ(0, -hd + 4.4);
      interactPoints.push({
        id: `venue_${b.id}`,
        type: 'venue_counter',
        position: { x: ipPos.x, y: 0, z: ipPos.z },
        radius: 4.6,
        keyHint: 'F',
        labelKey: b.interactLabelKey,
        payloadId: b.id,
      });
    } else if (b.category === 'cinema') {
      // KINOTEATR: Giant Glowing IMAX Screen + Stage Riser + Dolby Speakers + Tiered Plush Red Theater Rows + Popcorn Stand
      const aisleCarpet = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.03, b.depth - 2.2), velvetRedMat);
      aisleCarpet.position.set(0, 0.11, 0.3);
      venueRoot.add(aisleCarpet);

      for (const stripX of [-2.35, 2.35]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, b.depth - 3.6), amberStripMat);
        strip.position.set(stripX, 0.12, 0.4);
        venueRoot.add(strip);
      }

      // Stage Riser, Dynamic Bounce-Light Trim, Ceiling IMAX Projector & Live 24-FPS Movie Screen
      const stageW = Math.min(b.width - 3.6, 15.6);
      const stage = new THREE.Mesh(new THREE.BoxGeometry(stageW, 0.42, 1.8), darkCounterMat);
      stage.position.set(0, 0.31, -hd + 1.45);
      const stageBounceMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.95,
        roughness: 0.2,
      });
      const stageTrim = new THREE.Mesh(new THREE.BoxGeometry(stageW + 0.2, 0.08, 1.88), stageBounceMat);
      stageTrim.position.set(0, 0.53, -hd + 1.45);
      venueRoot.add(stage, stageTrim);

      const stPos = localToWorldXZ(0, -hd + 1.45);
      collisionWorld.addBox(`${b.id}_stage`, stPos.x, stPos.z, stageW, 1.9, 0.65, 'prop');

      const screenW = Math.min(b.width - 5.2, 13.8);
      const screenH = Math.min(h - 2.3, 4.7);
      const screenCenterY = 0.95 + screenH * 0.5 + 0.35;

      const hallRuntime = createCinemaHallRuntime(
        b.id,
        b.centerX,
        b.centerZ,
        cinemaOrderCounter++,
        h,
        hd,
        screenCenterY,
        stageBounceMat,
      );
      cinemaHalls.push(hallRuntime);

      const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(screenW + 0.6, screenH + 0.6, 0.24), darkFrameMat);
      screenFrame.position.set(0, screenCenterY, -hd + 0.62);
      const screenSurface = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), hallRuntime.screenMaterial);
      screenSurface.position.z = 0.14;
      screenFrame.add(screenSurface);
      venueRoot.add(screenFrame, hallRuntime.projector.group);

      // Left & Right Dolby Line-Array Speaker Columns
      for (const spkSide of [-1, 1] as const) {
        const spkX = spkSide * (screenW * 0.5 + 1.05);
        const spkBox = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.2, 0.75), darkCounterMat);
        spkBox.position.set(spkX, 2.8, -hd + 0.9);
        const coneTop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14).rotateX(Math.PI * 0.5), chromeMat);
        coneTop.position.set(spkX, 3.5, -hd + 1.3);
        const coneBot = coneTop.clone();
        coneBot.position.set(spkX, 2.2, -hd + 1.3);
        venueRoot.add(spkBox, coneTop, coneBot);
      }

      // 3 Tiered Rows of Plush Red Cinema Seats on Left & Right (leaving a wide 6.0m central aisle!)
      const seatBankCenterX = b.width > 22.5 ? 5.3 : 4.9;
      const bankW = 4.2;
      const rowZs = [-3.4, -0.4, 2.5];
      rowZs.forEach((rz, rIdx) => {
        const riserH = 0.12 + rIdx * 0.14;
        for (const side of [-1, 1] as const) {
          const bx = side * seatBankCenterX;
          const rowGroup = new THREE.Group();
          rowGroup.position.set(bx, 0.1, rz);

          const riser = new THREE.Mesh(new THREE.BoxGeometry(bankW, riserH, 1.25), darkFrameMat);
          riser.position.y = riserH * 0.5;
          rowGroup.add(riser);

          for (let seatIdx = 0; seatIdx < 4; seatIdx++) {
            const sx = -1.5 + seatIdx * 1.0;
            const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.32, 0.68), velvetRedMat);
            cushion.position.set(sx, riserH + 0.2, -0.05);
            const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.78, 0.2), velvetRedMat);
            backrest.position.set(sx, riserH + 0.58, 0.34);
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.68), darkCounterMat);
            arm.position.set(sx - 0.44, riserH + 0.32, -0.05);
            rowGroup.add(cushion, backrest, arm);
          }

          venueRoot.add(rowGroup);
          const rw = localToWorldXZ(bx, rz);
          collisionWorld.addBox(`${b.id}_seats_${side}_${rIdx}`, rw.x, rw.z, bankW + 0.1, 1.3, 1.2, 'prop');
        }
      });

      // Seated Movie Spectators facing the screen
      addInteriorNpc(-seatBankCenterX + 0.5, -0.45, Math.PI, 0x0284c7, 0x1e293b, 0.35, true);
      addInteriorNpc(seatBankCenterX - 0.5, 2.45, Math.PI, 0xd97706, 0x0f172a, 0.48, true);

      // Front-Corner Popcorn & Ticket Concession Stand (clear of open doorway!)
      const popX = hw - 3.2;
      const popZ = hd - 2.8;
      const popCounter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.05, 1.15), darkCounterMat);
      popCounter.position.set(popX, 0.6, popZ);
      const popMachine = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.92, 0.75), warmLightPanelMat);
      popMachine.position.set(popX - 0.7, 1.55, popZ);
      const popRoof = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.18, 0.85), velvetRedMat);
      popRoof.position.set(popX - 0.7, 2.08, popZ);
      venueRoot.add(popCounter, popMachine, popRoof);

      const pw = localToWorldXZ(popX, popZ);
      collisionWorld.addBox(`${b.id}_popcorn`, pw.x, pw.z, 3.3, 1.2, 1.2, 'prop');
      addInteriorNpc(popX, popZ + 1.1, Math.PI, 0xe11d48, 0x0f172a);

      const ipPos = localToWorldXZ(0, 3.6);
      interactPoints.push({
        id: `venue_${b.id}`,
        type: 'venue_counter',
        position: { x: ipPos.x, y: 0, z: ipPos.z },
        radius: 5.0,
        keyHint: 'F',
        labelKey: b.interactLabelKey,
        payloadId: b.id,
      });
    } else if (b.category === 'arcade') {
      // CYBER-ARCADE & ENTERTAINMENT HALL: Upright Neon Arcade Cabinets + Central Holographic Arena Table + Prize Counter
      const prizeCounter = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.1, 1.25), darkCounterMat);
      prizeCounter.position.set(0, 0.6, -hd + 3.0);
      const prizeNeon = new THREE.Mesh(new THREE.BoxGeometry(5.75, 0.16, 1.34), accentNeonMat);
      prizeNeon.position.set(0, 1.16, -hd + 3.0);
      venueRoot.add(prizeCounter, prizeNeon);

      const pcPos = localToWorldXZ(0, -hd + 3.0);
      collisionWorld.addBox(`${b.id}_arcade_desk`, pcPos.x, pcPos.z, 5.7, 1.3, 1.2, 'prop');
      addInteriorNpc(0, -hd + 1.75, 0, 0x7c3aed, 0x0f172a);

      // Central Futuristic Air-Hockey & Hologram Trophy Table
      const arenaTable = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.88, 1.55), darkFrameMat);
      arenaTable.position.set(0, 0.54, -0.4);
      const arenaField = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.08, 1.32), coolLightPanelMat);
      arenaField.position.set(0, 1.0, -0.4);
      const holoTrophy = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), magentaGlowMat);
      holoTrophy.position.set(0, 1.95, -0.4);
      kineticSculptures.push(holoTrophy);
      venueRoot.add(arenaTable, arenaField, holoTrophy);

      const atPos = localToWorldXZ(0, -0.4);
      collisionWorld.addBox(`${b.id}_arena_table`, atPos.x, atPos.z, 2.6, 1.65, 1.1, 'prop');

      // 8 Composite Neon Arcade Cabinets along Left & Right Walls
      const cabZs = [-3.4, -0.8, 1.8, 4.4];
      cabZs.forEach((cz, cIdx) => {
        for (const side of [-1, 1] as const) {
          const cx = side * (hw - 2.3);
          const cab = new THREE.Group();
          cab.position.set(cx, 0.1, cz);
          cab.rotation.y = side === -1 ? Math.PI * 0.5 : -Math.PI * 0.5;

          const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.05, 0.95), darkCounterMat);
          body.position.y = 1.025;
          const marquee = new THREE.Mesh(
            new THREE.BoxGeometry(1.18, 0.32, 1.02),
            cIdx % 2 === 0 ? accentNeonMat : magentaGlowMat,
          );
          marquee.position.set(0, 2.05, 0.05);
          const screen = new THREE.Mesh(
            new THREE.BoxGeometry(0.96, 0.72, 0.08),
            cIdx % 2 === 0 ? screenGlowMat : magentaGlowMat,
          );
          screen.position.set(0, 1.42, 0.46);
          screen.rotation.x = -0.22;
          const deck = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.16, 0.42), brushedBrassMat);
          deck.position.set(0, 0.98, 0.56);

          cab.add(body, marquee, screen, deck);
          venueRoot.add(cab);

          const cw = localToWorldXZ(cx, cz);
          collisionWorld.addBox(`${b.id}_cab_${side}_${cIdx}`, cw.x, cw.z, 1.3, 1.3, 1.8, 'prop');
        }
      });

      addInteriorNpc(-(hw - 3.6), -0.8, -Math.PI * 0.5, 0x059669);
      addInteriorNpc(hw - 3.6, 1.8, Math.PI * 0.5, 0xd97706);

      const ipPos = localToWorldXZ(0, 2.4);
      interactPoints.push({
        id: `venue_${b.id}`,
        type: 'venue_counter',
        position: { x: ipPos.x, y: 0, z: ipPos.z },
        radius: 5.0,
        keyHint: 'F',
        labelKey: b.interactLabelKey,
        payloadId: b.id,
      });
    } else {
      // DIVERSE MUSEUMS: Art, History/Archaeology, Auto-Tech Hypercar Prototype, & Cosmos!
      const runner = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.03, b.depth - 2.4), velvetRedMat);
      runner.position.set(0, 0.11, 0.2);
      venueRoot.add(runner);

      const plinthRadius = b.id === 'museum_autotech' ? 2.15 : 1.5;
      const centerPlinth = new THREE.Mesh(
        new THREE.CylinderGeometry(plinthRadius, plinthRadius + 0.2, 0.95, 28),
        creamMarbleMat,
      );
      centerPlinth.position.set(0, 0.58, -0.8);
      const goldTrim = new THREE.Mesh(
        new THREE.TorusGeometry(plinthRadius + 0.08, 0.07, 8, 28).rotateX(Math.PI / 2),
        brushedBrassMat,
      );
      goldTrim.position.set(0, 1.06, -0.8);
      venueRoot.add(centerPlinth, goldTrim);

      if (b.id === 'museum_autotech') {
        // Rotating Concept Hypercar Prototype Showcase!
        const protoHolder = new THREE.Group();
        protoHolder.position.set(0, 1.08, -0.8);
        const protoCar = createProceduralVehicleModel('hypercar', b.accentColor, false);
        protoCar.root.scale.setScalar(0.54);
        protoHolder.add(protoCar.root);
        kineticSculptures.push(protoHolder);
        venueRoot.add(protoHolder);
      } else if (b.id === 'museum_history') {
        // Ancient Golden Obelisk & Royal Crown Relic
        const histGroup = new THREE.Group();
        histGroup.position.set(0, 1.08, -0.8);
        const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.72, 2.2, 4), brushedBrassMat);
        obelisk.position.y = 1.1;
        const capPyramid = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.65, 4), amberStripMat);
        capPyramid.position.y = 2.52;
        const crownHalo = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.08, 10, 24), brushedBrassMat);
        crownHalo.position.y = 1.35;
        histGroup.add(obelisk, capPyramid, crownHalo);
        kineticSculptures.push(histGroup);
        venueRoot.add(histGroup);
      } else if (b.id === 'museum_cosmos') {
        const cosmosGroup = new THREE.Group();
        cosmosGroup.position.set(0, 2.4, -0.8);
        const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 1), screenGlowMat);
        const orbitRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 10, 32), chromeMat);
        orbitRing.rotation.x = Math.PI * 0.35;
        cosmosGroup.add(planet, orbitRing);
        kineticSculptures.push(cosmosGroup);
        venueRoot.add(cosmosGroup);
      } else {
        const sculptureMesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.95, 0.24, 56, 12), brushedBrassMat);
        sculptureMesh.position.set(0, 2.45, -0.8);
        kineticSculptures.push(sculptureMesh);
        venueRoot.add(sculptureMesh);
      }

      const cpWorld = localToWorldXZ(0, -0.8);
      const cpSpan = plinthRadius * 2 + 0.1;
      collisionWorld.addBox(`${b.id}_center_plinth`, cpWorld.x, cpWorld.z, cpSpan, cpSpan, 1.3, 'prop');
      addInteriorNpc(0, -hd + 2.2, 0, 0x7c3aed, 0x0f172a);

      const relicCoords: Array<[number, number, number]> = [
        [-6.4, -2.8, 0],
        [6.4, -2.8, 1],
        [-6.4, 2.8, 2],
        [6.4, 2.8, 3],
      ];
      for (const [rx, rz, rType] of relicCoords) {
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1.5), creamMarbleMat);
        plinth.position.set(rx, 0.65, rz);
        let relic: THREE.Mesh;
        if (rType === 0) {
          const pts = [
            new THREE.Vector2(0.18, 0),
            new THREE.Vector2(0.42, 0.35),
            new THREE.Vector2(0.22, 0.8),
            new THREE.Vector2(0.32, 1.05),
          ];
          relic = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), brushedBrassMat);
          relic.position.set(rx, 1.2, rz);
        } else if (rType === 1) {
          relic = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), screenGlowMat);
          relic.position.set(rx, 1.82, rz);
          kineticSculptures.push(relic);
        } else if (rType === 2) {
          relic = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.14, 12, 24), chromeMat);
          relic.position.set(rx, 1.82, rz);
          kineticSculptures.push(relic);
        } else {
          relic = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.25, 4), brushedBrassMat);
          relic.position.set(rx, 1.82, rz);
        }
        venueRoot.add(plinth, relic);
        const rw = localToWorldXZ(rx, rz);
        collisionWorld.addBox(`${b.id}_relic_${rType}`, rw.x, rw.z, 1.6, 1.6, 1.2, 'prop');
      }

      for (let pIdx = 0; pIdx < 3; pIdx++) {
        const paintTex = createFramedPaintingTexture(bIdx * 5 + pIdx, b.accentColor);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 0.14), brushedBrassMat);
        const canvasPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(3.05, 1.95),
          new THREE.MeshBasicMaterial({ map: paintTex }),
        );
        canvasPlane.position.z = 0.08;
        frame.add(canvasPlane);

        if (pIdx === 0) {
          frame.position.set(0, 3.2, -hd + 0.52);
        } else if (pIdx === 1) {
          frame.position.set(-hw + 0.52, 3.2, 0);
          frame.rotation.y = Math.PI * 0.5;
        } else {
          frame.position.set(hw - 0.52, 3.2, 0);
          frame.rotation.y = -Math.PI * 0.5;
        }
        venueRoot.add(frame);
      }

      const ipPos = localToWorldXZ(0, 2.2);
      interactPoints.push({
        id: `venue_${b.id}`,
        type: 'venue_counter',
        position: { x: ipPos.x, y: 0, z: ipPos.z },
        radius: 4.8,
        keyHint: 'F',
        labelKey: b.interactLabelKey,
        payloadId: b.id,
      });
    }
  });

  return {
    group,
    interactPoints,
    cycleCinemaMovie: (buildingId: string) => {
      const hall = cinemaHalls.find((c) => c.buildingId === buildingId) ?? cinemaHalls[0];
      if (!hall) return 0;
      return setCinemaHallMovieIndex(hall, (hall.movieIndex + 1) % CINEMA_MOVIE_COUNT);
    },
    setCinemaMovie: (buildingId: string, index: number) => {
      const hall = cinemaHalls.find((c) => c.buildingId === buildingId) ?? cinemaHalls[0];
      if (!hall) return 0;
      return setCinemaHallMovieIndex(hall, index);
    },
    loadCustomCinemaVideo: (buildingId: string, objectUrl: string, fileName: string) => {
      const hall = cinemaHalls.find((c) => c.buildingId === buildingId);
      if (hall) {
        setCinemaHallCustomVideo(hall, objectUrl, fileName);
      } else {
        for (const ch of cinemaHalls) {
          setCinemaHallCustomVideo(ch, objectUrl, fileName);
        }
      }
    },
    toggleCinemaPlayPause: (buildingId: string) => {
      const hall = cinemaHalls.find((c) => c.buildingId === buildingId) ?? cinemaHalls[0];
      if (!hall) return false;
      return toggleCinemaHallPlayPause(hall);
    },
    isCinemaPlayingRealAudio: (buildingId: string) => {
      const hall = cinemaHalls.find((c) => c.buildingId === buildingId);
      if (!hall || !hall.videoEl) return false;
      return !hall.videoEl.paused && !hall.videoEl.muted && hall.videoEl.readyState >= 2;
    },
    getCinemaMovieIndex: (buildingId: string) => {
      const hall = cinemaHalls.find((c) => c.buildingId === buildingId);
      return hall ? hall.movieIndex : 0;
    },
    dispose: () => {
      for (const hall of cinemaHalls) {
        disposeCinemaHallRuntime(hall);
      }
    },
    update: (
      dt: number,
      elapsed: number,
      ownedProperties?: string[],
      viewerPos?: { x: number; z: number },
      activeCinemaBuildingId?: string | null,
      cinemaAudioGain = 0,
    ) => {
      for (let i = 0; i < kineticSculptures.length; i++) {
        const obj = kineticSculptures[i];
        obj.rotation.y = elapsed * 0.62 + i;
        if (obj instanceof THREE.Mesh) {
          obj.rotation.x = Math.sin(elapsed * 0.5 + i) * 0.2;
        }
      }

      for (let i = 0; i < cinemaHalls.length; i++) {
        const hall = cinemaHalls[i];
        stepCinemaHallRuntime(
          hall,
          dt,
          elapsed,
          viewerPos,
          activeCinemaBuildingId === hall.buildingId,
          cinemaAudioGain,
        );
      }

      if (ownedProperties) {
        for (let i = 0; i < enterpriseBeacons.length; i++) {
          const ref = enterpriseBeacons[i];
          const isOwned = ownedProperties.includes(ref.buildingId);
          if (isOwned !== ref.ownedState) {
            ref.ownedState = isOwned;
            const targetCol = isOwned ? OWNED_EMERALD_COLOR : ref.defaultColor;
            ref.material.color.copy(targetCol);
            ref.material.emissive.copy(targetCol);
            ref.material.emissiveIntensity = isOwned ? 1.05 : 0.85;
          }
        }
      }

      for (let i = 0; i < staffAgents.length; i++) {
        const st = staffAgents[i];
        if (st.seated) {
          st.rig.headGroup.rotation.y = Math.sin(elapsed * 0.7 + st.phaseOffset) * 0.14;
        } else {
          st.rig.root.rotation.y = st.baseYaw + Math.sin(elapsed * 0.9 + st.phaseOffset) * 0.24;
          st.rig.animate(dt, 0, false, true);
        }
      }
    },
  };
}
