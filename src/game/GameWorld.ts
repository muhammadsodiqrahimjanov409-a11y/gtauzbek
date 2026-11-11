import * as THREE from 'three';
import type { InteractablePoint, VehicleInstanceState, WeaponId } from '../types/game';
import {
  CITY_RACE_START_POS,
  DEALERSHIP_INTERACT_POS,
  detectDistrict,
  ENTERABLE_BUILDINGS,
  findBuildingContainingPoint,
  findNearestMetroStation,
  GAS_STATION_INTERACT_POS,
  getDefaultVehicleTuning,
  getHeistTarget,
  HEIST_COOLDOWN_SECONDS,
  METRO_STATIONS,
  PLAYER_START_POS,
  SAFEHOUSE_INTERACT_POS,
  VEHICLE_CONFIGS,
} from './gameConfig';
import { formatNCoins } from '../economy/EconomyManager';
import { CollisionWorld } from '../utils/collision';
import { disposeObject3D, FpsMonitor } from '../utils/performance';
import { createCityTextures, type ProceduralTextureSet } from '../world/textures';
import { buildRoadNetwork } from '../world/Roads';
import { buildCityBuildings } from '../world/Buildings';
import { buildEnterableBuildings } from '../world/Interiors';
import { createHeistLootBag, createHeistWorldSystem } from '../world/HeistSystem';
import { buildMetroSystem } from '../world/MetroSystem';
import { buildCityEnvironmentAndPark } from '../world/CityWorld';
import { createLightingSystem } from '../world/Lighting';
import { createWeatherSystem } from '../world/Weather';
import { coopClient } from '../multiplayer/CoopClient';
import { createRemotePlayers3D } from '../multiplayer/RemotePlayers3D';
import { createProceduralHumanoid } from '../player/Player';
import { createPlayerArsenalSystem } from '../player/Weapons';
import { stepPlayerController, type PlayerRuntimeState } from '../player/PlayerController';
import { ThirdPersonCameraController } from '../player/PlayerCamera';
import { createProceduralVehicleModel, type VehicleRig } from '../vehicles/Vehicle';
import { stepVehiclePhysics } from '../vehicles/VehiclePhysics';
import { readVehicleControlInputs, resetVehicleOntoRoad } from '../vehicles/VehicleController';
import { computeVehicleEdgeDistance, createTrafficAISystem } from '../vehicles/TrafficAI';
import { createPedestrianSystem, type MovingVehicleThreat } from '../vehicles/Pedestrians';
import { createPoliceAISystem } from '../vehicles/PoliceAI';
import { createStreetRaceSystem } from '../vehicles/StreetRace';
import { createTeleportEffectsSystem, type BlockingCarObstacle } from '../vehicles/TeleportEffects';
import { createVehicleJobsSystem } from '../vehicles/VehicleJobs';
import { MISSION_DEFINITIONS } from '../missions/missionDefinitions';
import { evaluateActiveMission } from '../missions/MissionManager';
import { computeNavigationRoute } from '../map/Navigation';
import { engineCommandRef, touchInputRef, useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';
import { audioEngine } from '../utils/audio';
import { createSpiderWebSystem } from '../player/SpiderWebSystem';
import { createViltrumiteSystem } from '../world/ViltrumiteSystem';
import { createPoliceHQCompound } from '../world/PoliceHQCompound';
import { createVehicleCombatSystem } from '../vehicles/VehicleCombatSystem';
import { startPacedRenderLoop } from './GameLoop';

export interface NexusWorldInstance {
  cameraController: ThirdPersonCameraController;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export function createNexusGameWorld(
  container: HTMLElement,
  isSoftwareGl: boolean,
  onWebGLError: () => void,
): NexusWorldInstance | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
  } catch {
    onWebGLError();
    return null;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const initW = container.clientWidth || window.innerWidth;
  const initH = container.clientHeight || window.innerHeight;
  renderer.setSize(initW, initH);
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));

  renderer.domElement.className = 'block w-full h-full outline-none';
  container.appendChild(renderer.domElement);

  const onContextLost = (e: Event) => {
    e.preventDefault();
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('contextmenu', onContextMenu);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, initW / Math.max(1, initH), 0.2, 1400);

  // Build modular 3D subsystems
  const collisionWorld = new CollisionWorld();
  const textures: ProceduralTextureSet = createCityTextures(renderer);
  const lighting = createLightingSystem(scene, renderer, isSoftwareGl);
  const roads = buildRoadNetwork(textures);
  const buildings = buildCityBuildings(textures, collisionWorld, isSoftwareGl);
  const enterableBuildings = buildEnterableBuildings(
    collisionWorld,
    isSoftwareGl,
    textures,
    buildings.nightMaterials,
  );
  const metroSystem = buildMetroSystem(collisionWorld, isSoftwareGl);
  const heistSystem = createHeistWorldSystem(isSoftwareGl);
  const remotePlayers = createRemotePlayers3D(isSoftwareGl);
  const cityEnv = buildCityEnvironmentAndPark(textures, collisionWorld, isSoftwareGl);
  const weather = createWeatherSystem(isSoftwareGl ? 420 : 950);

  scene.add(cityEnv.group);
  scene.add(roads.group);
  scene.add(buildings.group);
  scene.add(enterableBuildings.group);
  scene.add(heistSystem.group);
  scene.add(metroSystem.group);
  scene.add(remotePlayers.group);
  scene.add(weather.group);

  // Showroom turntable display hypercar inside glass Dealership
  const displayHyperCar = createProceduralVehicleModel('hypercar', '#06B6D4', false);
  displayHyperCar.root.scale.setScalar(0.84);
  buildings.showroomTurntable.add(displayHyperCar.root);

  // 3D Navigation Route Line on ground
  const routeLineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const routeLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.22, 0),
    new THREE.Vector3(0, 0.22, 0),
  ]);
  const routeLine = new THREE.Line(routeLineGeo, routeLineMat);
  routeLine.frustumCulled = false;
  routeLine.visible = false;
  scene.add(routeLine);

  // Player Humanoid Rig + 3D Arsenal (Pistol, AK-47, Golf Club) + 3D Heist Loot Bag
  const playerRig = createProceduralHumanoid(0x2563eb, 0x1e293b, 0xf1c27d, !isSoftwareGl);
  const arsenal = createPlayerArsenalSystem(!isSoftwareGl);
  const playerLootBag = createHeistLootBag();
  playerLootBag.visible = false;
  playerRig.weaponMount.add(arsenal.handGroup);
  playerRig.bodyGroup.add(playerLootBag);
  scene.add(playerRig.root);
  scene.add(arsenal.worldEffectsGroup);

  const initialStore = useGameStore.getState();
  arsenal.setEquippedWeapon(initialStore.equippedWeapon);

  const bootSafePlayer = collisionWorld.resolveCircle(
    initialStore.player.position.x,
    initialStore.player.position.z,
    0.65,
  );
  const playerRuntime: PlayerRuntimeState = {
    position: { x: bootSafePlayer.x, y: 0, z: bootSafePlayer.z },
    rotationY: initialStore.player.rotationY,
    velocityY: 0,
    isGrounded: true,
    horizontalSpeed: 0,
    isSprinting: false,
  };
  playerRig.root.position.set(playerRuntime.position.x, 0, playerRuntime.position.z);

  // Playable 28 Vehicles Rigs & Runtime States (cars + Gruzovoy cargo trucks parked safely across Nexus City)
  const vehicleJobs = createVehicleJobsSystem(scene, !isSoftwareGl);
  const vehicleRigs = new Map<string, VehicleRig>();
  const vehicleHydraulicsTarget = new Map<string, number>();
  const vehicleStates: VehicleInstanceState[] = initialStore.vehicles.map((v) => {
    const safeSpot = collisionWorld.resolveCircle(v.position.x, v.position.z, 1.65);
    return {
      ...v,
      tuning: v.tuning ?? getDefaultVehicleTuning(v.vehicleId),
      workAnimPhase: v.workAnimPhase ?? 0,
      position: { x: safeSpot.x, y: 0, z: safeSpot.z },
    };
  });

  for (const vs of vehicleStates) {
    const rig = createProceduralVehicleModel(
      vs.vehicleId,
      vs.color,
      !isSoftwareGl,
      vs.tuning ?? getDefaultVehicleTuning(vs.vehicleId),
    );
    rig.root.position.set(vs.position.x, 0, vs.position.z);
    rig.root.rotation.y = vs.rotationY;
    scene.add(rig.root);
    vehicleRigs.set(vs.instanceId, rig);
    vehicleHydraulicsTarget.set(vs.instanceId, 0);
  }

  let activeVehicleInstanceId: string | null = null;
  let lastEquippedWeapon: WeaponId = initialStore.equippedWeapon;

  // Traffic AI, Pedestrians (outdoor + indoor visitors), Police Pursuit Cruisers, 10-Car Street Race & Quantum Teleport-Overpass FX
  const trafficAI = createTrafficAISystem(28, isSoftwareGl);
  const pedestrians = createPedestrianSystem(58, isSoftwareGl);
  const policeAI = createPoliceAISystem(isSoftwareGl);
  const streetRace = createStreetRaceSystem(isSoftwareGl);
  const teleportEffects = createTeleportEffectsSystem(28);
  scene.add(trafficAI.group);
  scene.add(pedestrians.group);
  scene.add(policeAI.group);
  scene.add(streetRace.group);
  scene.add(teleportEffects.group);

  // 3D Spider-Man Web Targeting & Trajectory Slingshot Flight System
  const spiderWebSystem = createSpiderWebSystem(isSoftwareGl);
  scene.add(spiderWebSystem.group);

  // 4 Viltrumites ("Vilteroytlar" with cape animation, eye lasers & supersonic hover rings)
  const viltrumiteSystem = createViltrumiteSystem(isSoftwareGl);
  scene.add(viltrumiteSystem.group);

  // Military Police HQ Compound ("MILITSIYA BOSH BOSH QARMASI" with runway, tank bay, 6 armed shoot-on-sight sentries)
  const policeHQCompound = createPoliceHQCompound(collisionWorld, isSoftwareGl);
  scene.add(policeHQCompound.group);

  // 3D Vehicle Combat System (120mm Tank Cannon Shells, 30mm Fighter Autocannons & 500kg Aerial Bombs)
  const vehicleCombatSystem = createVehicleCombatSystem();
  scene.add(vehicleCombatSystem.group);

  const trafficBlockingScratch: BlockingCarObstacle[] = [];
  const policeBlockingScratch: BlockingCarObstacle[] = [];
  const raceBlockingScratch: BlockingCarObstacle[] = [];
  const pedParkedScratch: BlockingCarObstacle[] = [];

  let latestEscapeRatio = 0;
  let latestPoliceSnapshots = useGameStore.getState().policeUnits;
  let latestRaceSnapshot = useGameStore.getState().raceState;
  let latestMetroRide = useGameStore.getState().metroRide;
  let latestHQStatus: { isPlayerInHQ: boolean; policeFiringNow: boolean } | null = null;
  let latestNearBoss: { id: string; name: string; hp: number; maxHp: number; locationTitle: string; isFiringLaser: boolean } | null = null;
  let tankCannonCooldown = 0;
  let gunfireWantedCooldown = 0;
  let autoSaveAccumSec = 0;
  let enterpriseDividendAccumSec = 0;
  let enterpriseDividendToastStep = 0;
  let activeHeistBuildingId: string | null = null;
  let activeHeistElapsedSec = 0;
  let frameWeaponFiredNow = false;

  const tryBeginVenueHeist = (buildingId: string): boolean => {
    const targetCfg = getHeistTarget(buildingId);
    if (!targetCfg) return false;
    if (activeHeistBuildingId === buildingId) return false;

    const curStore = useGameStore.getState();
    const dict = getTranslations(useSettingsStore.getState().language);
    const now = Date.now();
    const coolUntil = curStore.heist.robbedUntilByBuilding[buildingId] ?? 0;
    if (coolUntil > now) {
      const secsLeft = Math.max(1, Math.ceil((coolUntil - now) / 1000));
      curStore.showToast(`${dict.heist.cooldownPrefix} ${secsLeft}s`, 'warning');
      return false;
    }

    activeHeistBuildingId = buildingId;
    activeHeistElapsedSec = 0;
    curStore.setHeistProgress(buildingId, 0.02);
    audioEngine.playNotification();
    pedestrians.scatterFromSound(playerRuntime.position.x, playerRuntime.position.z, 28);

    // Trigger alarm & dispatch Police units immediately
    const neededIncreases = Math.max(1, targetCfg.wantedStars - curStore.wantedLevel);
    for (let i = 0; i < neededIncreases; i++) {
      useGameStore
        .getState()
        .incrementWantedLevel(i === neededIncreases - 1 ? dict.heist.startedPoliceAlert : '');
    }
    if (curStore.wantedLevel >= targetCfg.wantedStars) {
      useGameStore.getState().showToast(dict.heist.startedPoliceAlert, 'warning');
    }
    policeAI.repositionNearPlayerForChase(
      playerRuntime.position,
      useGameStore.getState().wantedLevel,
      collisionWorld,
    );

    coopClient.sendHeistStart(buildingId);
    return true;
  };

  const cameraController = new ThirdPersonCameraController();
  cameraController.snapBehind(initialStore.player.position || PLAYER_START_POS, initialStore.player.rotationY || Math.PI);

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Keyboard & Pointer Listeners
  const pressedKeys = new Set<string>();
  let mouseFireHeld = false;

  const isTextInputFocused = (): boolean => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
  };

  const findNearestInteractable = (
    px: number,
    py: number,
    pz: number,
    inVehId: string | null,
  ): InteractablePoint | null => {
    if (metroSystem.isRiding()) return null;
    const store = useGameStore.getState();
    let best: InteractablePoint | null = null;
    let bestDistSq = Infinity;

    const consider = (pt: InteractablePoint) => {
      if (Math.abs(py - pt.position.y) > 3.8) return;
      const dx = px - pt.position.x;
      const dz = pz - pt.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= pt.radius * pt.radius && dSq < bestDistSq) {
        bestDistSq = dSq;
        best = pt;
      }
    };

    if (!inVehId) {
      if (Math.abs(py) <= 3.8) {
        for (const vs of vehicleStates) {
          const vCfg = VEHICLE_CONFIGS[vs.vehicleId];
          const edgeDist = computeVehicleEdgeDistance(
            px,
            pz,
            vs.position.x,
            vs.position.z,
            vs.rotationY,
            vCfg.halfWidth,
            vCfg.halfLength,
          );
          if (edgeDist <= 3.6 && edgeDist * edgeDist < bestDistSq) {
            bestDistSq = edgeDist * edgeDist;
            best = {
              id: vs.instanceId,
              type: 'vehicle',
              position: vs.position,
              radius: 3.6,
              keyHint: 'E',
              labelKey: 'prompts.enterVehicle',
              payloadId: vs.vehicleId,
            };
          }
        }

        const trafficCand = trafficAI.findNearestBoardableAgent(px, pz, 3.6);
        if (trafficCand && trafficCand.edgeDist * trafficCand.edgeDist < bestDistSq) {
          bestDistSq = trafficCand.edgeDist * trafficCand.edgeDist;
          best = {
            id: `traffic_${trafficCand.index}`,
            type: 'vehicle',
            position: { x: trafficCand.x, y: 0, z: trafficCand.z },
            radius: 3.6,
            keyHint: 'E',
            labelKey: 'prompts.enterVehicle',
            payloadId: trafficCand.vehicleId,
          };
        }
      }

      consider({
        id: 'safehouse_door',
        type: 'safehouse',
        position: SAFEHOUSE_INTERACT_POS,
        radius: 6.5,
        keyHint: 'F',
        labelKey: 'prompts.enterSafehouse',
      });

      for (let i = 0; i < metroSystem.interactPoints.length; i++) {
        const pt = metroSystem.interactPoints[i];
        if (pt.payloadId && store.inventory.ownedProperties.includes(pt.payloadId)) {
          consider({
            ...pt,
            labelKey: 'prompts.boardOwnedMetro',
          });
        } else {
          consider(pt);
        }
      }

      for (let i = 0; i < enterableBuildings.interactPoints.length; i++) {
        const pt = enterableBuildings.interactPoints[i];
        if (
          pt.labelKey === 'prompts.buyOrManageEnterprise' &&
          pt.payloadId &&
          store.inventory.ownedProperties.includes(pt.payloadId)
        ) {
          consider({
            ...pt,
            labelKey: 'enterprises.manageOwnedPrompt',
          });
        } else {
          consider(pt);
        }
      }
    }

    consider({
      id: 'dealership_entrance',
      type: 'dealership',
      position: DEALERSHIP_INTERACT_POS,
      radius: 8.5,
      keyHint: 'F',
      labelKey: 'prompts.openDealership',
    });

    consider({
      id: 'gas_station_bay',
      type: 'gas_station',
      position: GAS_STATION_INTERACT_POS,
      radius: 8.5,
      keyHint: 'F',
      labelKey: 'prompts.refuelVehicle',
    });

    if (streetRace.getStatus() === 'idle' || streetRace.getStatus() === 'finished') {
      consider({
        id: 'city_street_race_gantry',
        type: 'race_start',
        position: CITY_RACE_START_POS,
        radius: 16,
        keyHint: 'F',
        labelKey: 'prompts.startRace',
      });
    }

    if (!store.activeMissionId && streetRace.getStatus() !== 'countdown' && streetRace.getStatus() !== 'racing') {
      for (const def of MISSION_DEFINITIONS) {
        const st = store.missions[def.id]?.status;
        if (st === 'available' || st === 'failed') {
          consider({
            id: `mission_${def.id}`,
            type: 'mission',
            position: def.startPosition,
            radius: 5.2,
            keyHint: 'F',
            labelKey: 'prompts.startMission',
            payloadId: def.id,
          });
        }
      }
    }

    return best;
  };

  const persistParkedVehiclesImmediate = () => {
    const store = useGameStore.getState();
    store.syncTelemetryFromEngine({
      playerPos: { ...playerRuntime.position },
      playerRotY: playerRuntime.rotationY,
      inVehicleId: activeVehicleInstanceId,
      district: detectDistrict(playerRuntime.position.x, playerRuntime.position.z),
      speedKmh: 0,
      walkedDelta: 0,
      drivenDelta: 0,
      dtSeconds: 0,
      timeHours: store.world.timeHours,
      nearestInteractable: null,
      vehiclesSnapshot: vehicleStates.map((v) => ({ ...v, position: { ...v.position } })),
    });
    store.saveCurrentProgress();
  };

  const handleBoardOrExitMetroExplicit = () => {
    const store = useGameStore.getState();
    const dict = getTranslations(useSettingsStore.getState().language);

    if (metroSystem.isRiding()) {
      const exitRes = metroSystem.disembarkLiveTrain();
      if (exitRes) {
        playerRuntime.position = { ...exitRes.position };
        playerRuntime.rotationY = exitRes.yaw;
        playerRuntime.velocityY = 0;
        playerRuntime.isGrounded = true;
        playerRig.root.visible = true;
        cameraController.snapBehind(playerRuntime.position, playerRuntime.rotationY);
        audioEngine.playMetroChime();
        store.showToast(
          `${dict.metro.exitedPlatformToast}: ${resolveNestedKey(dict, exitRes.station.nameKey)}`,
          'success',
        );
      }
      latestMetroRide = { active: false, fromStationId: null, toStationId: null, progress: 0 };
      return;
    }

    if (activeVehicleInstanceId) return;
    const boardableSt = metroSystem.findBoardableStation(playerRuntime.position);
    if (boardableSt) {
      if (streetRace.getStatus() === 'countdown' || streetRace.getStatus() === 'racing') {
        streetRace.stopRace();
      }
      const boarded = metroSystem.boardLiveTrain(boardableSt.id);
      if (boarded) {
        playerRig.root.visible = true;
        audioEngine.playMetroChime();
        store.showToast(
          `${dict.metro.boardedLiveToast}: ${resolveNestedKey(dict, boarded.nameKey)}`,
          'info',
        );
      }
    }
  };

  const handleEnterOrExitVehicle = () => {
    if (streetRace.getStatus() === 'countdown') return;
    const store = useGameStore.getState();

    // 1. If currently riding the 3D Metro train, E disembarks onto the Elevated Station Platform!
    if (metroSystem.isRiding()) {
      handleBoardOrExitMetroExplicit();
      return;
    }

    // 2. If currently driving a car/truck, E exits cleanly beside the driver's cab
    if (activeVehicleInstanceId) {
      const currentVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
      if (currentVeh) {
        currentVeh.speed = 0;
        currentVeh.braking = false;
        const vCfg = VEHICLE_CONFIGS[currentVeh.vehicleId];
        const exitSideOffset = vCfg.halfWidth + 1.4;
        const exitCabForward = vCfg.halfLength > 3.0 ? vCfg.halfLength * 0.46 : 0;
        const sinY = Math.sin(currentVeh.rotationY);
        const cosY = Math.cos(currentVeh.rotationY);
        const sideX = currentVeh.position.x + sinY * exitCabForward + cosY * exitSideOffset;
        const sideZ = currentVeh.position.z + cosY * exitCabForward - sinY * exitSideOffset;
        const safeExit = collisionWorld.resolveCircle(sideX, sideZ, 0.5);
        playerRuntime.position.x = safeExit.x;
        playerRuntime.position.z = safeExit.z;
        playerRuntime.position.y = 0;
        playerRuntime.rotationY = currentVeh.rotationY;
      }
      activeVehicleInstanceId = null;
      playerRig.root.visible = true;
      audioEngine.playUiClick();
      persistParkedVehiclesImmediate();
      return;
    }

    // 3. On foot: check closest world vehicle (OBB edge distance) AND live Traffic AI big trucks/cars
    let closestVeh: VehicleInstanceState | null = null;
    let closestEdgeDist = 3.85;
    if (Math.abs(playerRuntime.position.y) <= 3.0) {
      for (const vs of vehicleStates) {
        const vCfg = VEHICLE_CONFIGS[vs.vehicleId];
        const edgeDist = computeVehicleEdgeDistance(
          playerRuntime.position.x,
          playerRuntime.position.z,
          vs.position.x,
          vs.position.z,
          vs.rotationY,
          vCfg.halfWidth,
          vCfg.halfLength,
        );
        if (edgeDist <= closestEdgeDist) {
          closestEdgeDist = edgeDist;
          closestVeh = vs;
        }
      }
    }

    const trafficCand =
      Math.abs(playerRuntime.position.y) <= 3.0
        ? trafficAI.findNearestBoardableAgent(
            playerRuntime.position.x,
            playerRuntime.position.z,
            3.85,
          )
        : null;

    const boardableMetro = metroSystem.findBoardableStation(playerRuntime.position);
    if (boardableMetro && !closestVeh && !trafficCand) {
      handleBoardOrExitMetroExplicit();
      return;
    }

    if (trafficCand && (!closestVeh || trafficCand.edgeDist < closestEdgeDist)) {
      const claimed = trafficAI.claimBoardedAgent(trafficCand.index);
      const targetVeh = claimed
        ? vehicleStates.find((v) => v.vehicleId === claimed.vehicleId)
        : undefined;
      if (claimed && targetVeh) {
        store.unlockVehicleImmediate(claimed.vehicleId);
        targetVeh.position.x = claimed.x;
        targetVeh.position.y = 0;
        targetVeh.position.z = claimed.z;
        targetVeh.rotationY = claimed.rotationY;
        targetVeh.speed = 0;
        targetVeh.steerAngle = 0;
        targetVeh.color = claimed.color;
        const rig = vehicleRigs.get(targetVeh.instanceId);
        if (rig) {
          rig.setPaintColor(claimed.color);
          rig.root.position.set(targetVeh.position.x, 0, targetVeh.position.z);
          rig.root.rotation.y = targetVeh.rotationY;
        }
        activeVehicleInstanceId = targetVeh.instanceId;
        playerRig.root.visible = false;
        cameraController.snapBehind(targetVeh.position, targetVeh.rotationY);
        audioEngine.playUiClick();
        persistParkedVehiclesImmediate();
        return;
      }
    }

    if (closestVeh) {
      store.unlockVehicleImmediate(closestVeh.vehicleId);
      activeVehicleInstanceId = closestVeh.instanceId;
      playerRig.root.visible = false;
      cameraController.snapBehind(closestVeh.position, closestVeh.rotationY);
      audioEngine.playUiClick();
    } else {
      // If no vehicle nearby, E acts as Spider-Man Web-Zip!
      spiderWebSystem.triggerWebZip(playerRuntime.position);
    }
  };

  const triggerTankCannonFire = (activeVeh: VehicleInstanceState) => {
    vehicleCombatSystem.fireTankCannon(activeVeh.position, activeVeh.rotationY, activeVeh.speed);
  };

  const triggerAirplaneGunFire = (activeVeh: VehicleInstanceState) => {
    vehicleCombatSystem.fireAirplaneGuns(activeVeh.position, activeVeh.rotationY, activeVeh.speed);
  };

  const triggerAirplaneBombDrop = (activeVeh: VehicleInstanceState) => {
    vehicleCombatSystem.dropAirplaneBomb(activeVeh.position, activeVeh.rotationY, activeVeh.speed);
  };

  const handleContextInteract = () => {
    const store = useGameStore.getState();
    const dict = getTranslations(useSettingsStore.getState().language);
    const focus = activeVehicleInstanceId
      ? vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId)?.position ?? playerRuntime.position
      : playerRuntime.position;

    const nearest = findNearestInteractable(focus.x, focus.y, focus.z, activeVehicleInstanceId);
    if (!nearest) return;

    if (nearest.type === 'vehicle') {
      handleEnterOrExitVehicle();
    } else if (nearest.type === 'dealership') {
      store.setActiveModal('dealership');
    } else if (nearest.type === 'safehouse') {
      store.setActiveModal('safehouse');
    } else if (nearest.type === 'mission' && nearest.payloadId) {
      store.startMission(nearest.payloadId, dict.missions.messages.started);
    } else if (nearest.type === 'race_start') {
      store.startCityRace(dict.race.startedToast);
    } else if (nearest.type === 'gas_station') {
      if (activeVehicleInstanceId) {
        const cv = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
        if (cv) cv.speed = 0;
      }
      audioEngine.playNotification();
      store.showToast(dict.prompts.refuelVehicle, 'success');
    } else if (nearest.type === 'metro_station') {
      store.openMetroModal(nearest.payloadId ?? null);
    } else if (nearest.type === 'venue_counter' && nearest.payloadId) {
      const venue = ENTERABLE_BUILDINGS.find((b) => b.id === nearest.payloadId);
      if (venue) {
        if (venue.category === 'enterprise') {
          audioEngine.playNotification();
          store.openEnterprisesModal(venue.id);
        } else if (venue.category === 'cinema') {
          const nextMovieIdx = enterableBuildings.cycleCinemaMovie(venue.id);
          audioEngine.playMissionComplete();
          const movieName = dict.venues.cinemaMovies[nextMovieIdx] ?? '';
          store.showToast(`${dict.venues.movieSwitchedPrefix} «${movieName}»`, 'success');
        } else {
          audioEngine.playNotification();
          store.showToast(resolveNestedKey(dict, venue.interactToastKey), 'success');
        }
      }
    }
  };

  const launchStreetRaceGrid = () => {
    const store = useGameStore.getState();
    const grid = streetRace.startRace();

    // Respect standing rule: if player is already inside a vehicle, keep that exact vehicle!
    // If on foot, seat them in their selected owned vehicle (or starter sedan).
    let playerVeh: VehicleInstanceState | undefined;
    if (activeVehicleInstanceId) {
      playerVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
    } else {
      const preferredId = store.inventory.ownedVehicles.includes(store.inventory.selectedVehicle)
        ? store.inventory.selectedVehicle
        : 'sedan';
      playerVeh = vehicleStates.find((v) => v.vehicleId === preferredId) ?? vehicleStates[0];
      if (playerVeh) {
        activeVehicleInstanceId = playerVeh.instanceId;
        playerRig.root.visible = false;
      }
    }

    // Ensure no other parked player car sits inside the Starting Grid zone
    let shoulderIdx = 0;
    for (const vs of vehicleStates) {
      if (playerVeh && vs.instanceId === playerVeh.instanceId) continue;
      if (
        Math.abs(vs.position.x - CITY_RACE_START_POS.x) < 42 &&
        Math.abs(vs.position.z - CITY_RACE_START_POS.z) < 16
      ) {
        vs.position.x = CITY_RACE_START_POS.x - 42 - shoulderIdx * 7.5;
        vs.position.z = CITY_RACE_START_POS.z - 15.2;
        vs.rotationY = Math.PI * 0.5;
        vs.speed = 0;
        shoulderIdx++;
        const rig = vehicleRigs.get(vs.instanceId);
        if (rig) {
          rig.root.position.set(vs.position.x, 0, vs.position.z);
          rig.root.rotation.y = vs.rotationY;
        }
      }
    }

    if (playerVeh) {
      playerVeh.position.x = grid.playerStartPos.x;
      playerVeh.position.y = 0;
      playerVeh.position.z = grid.playerStartPos.z;
      playerVeh.rotationY = grid.playerStartRotationY;
      playerVeh.speed = 0;
      playerVeh.steerAngle = 0;
      playerVeh.braking = true;
      playerRuntime.position.x = playerVeh.position.x;
      playerRuntime.position.y = 0;
      playerRuntime.position.z = playerVeh.position.z;
      playerRuntime.rotationY = playerVeh.rotationY;

      const rig = vehicleRigs.get(playerVeh.instanceId);
      if (rig) {
        rig.root.position.set(playerVeh.position.x, 0, playerVeh.position.z);
        rig.root.rotation.y = playerVeh.rotationY;
        rig.updateVisuals(0, 0, true, true, 0, 0);
      }
      cameraController.snapBehind(playerVeh.position, playerVeh.rotationY);
    }

    policeAI.resetPursuitTimers();
  };

  const triggerActiveVehicleWorkAction = () => {
    if (!activeVehicleInstanceId) return;
    const activeVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
    if (!activeVeh) return;

    const store = useGameStore.getState();
    const dict = getTranslations(useSettingsStore.getState().language);
    const curTarget = vehicleHydraulicsTarget.get(activeVeh.instanceId) ?? 0;

    const outcome = vehicleJobs.executeVehicleJob(activeVeh, vehicleStates, curTarget);
    if (outcome.kind === 'none') {
      vehicleHydraulicsTarget.set(activeVeh.instanceId, curTarget > 0.5 ? 0 : 1);
      audioEngine.playUiClick();
      return;
    }

    vehicleHydraulicsTarget.set(activeVeh.instanceId, outcome.nextHydraulicsTarget);

    if (outcome.updatedOwnCargo) {
      store.setVehicleTuning(activeVeh.vehicleId, { cargoType: outcome.updatedOwnCargo });
      const prevTuning = activeVeh.tuning ?? getDefaultVehicleTuning(activeVeh.vehicleId);
      activeVeh.tuning = { ...prevTuning, cargoType: outcome.updatedOwnCargo };
      vehicleRigs.get(activeVeh.instanceId)?.applyTuning(activeVeh.tuning);
    }

    if (outcome.loadedNearbyTruck) {
      const loadedInfo = outcome.loadedNearbyTruck;
      store.setVehicleTuning(loadedInfo.vehicleId, { cargoType: loadedInfo.cargoType });
      const targetTruck = vehicleStates.find((v) => v.instanceId === loadedInfo.instanceId);
      if (targetTruck) {
        const prevT = targetTruck.tuning ?? getDefaultVehicleTuning(targetTruck.vehicleId);
        targetTruck.tuning = { ...prevT, cargoType: loadedInfo.cargoType };
        vehicleHydraulicsTarget.set(targetTruck.instanceId, 0);
        vehicleRigs.get(targetTruck.instanceId)?.applyTuning(targetTruck.tuning);
      }
    }

    if (outcome.rewardCoins > 0) {
      store.creditVehicleJobReward(outcome.rewardCoins);
    } else {
      audioEngine.playUiClick();
    }

    const bonusTxt = outcome.bonusApplied ? ` ${dict.vehicles.stats.jobToasts.bonusSuffix}` : '';
    if (outcome.kind === 'unloaded_cargo' && outcome.unloadedCargoType) {
      const cargoLabel = dict.vehicles.stats.cargoTypes[outcome.unloadedCargoType];
      store.showToast(
        `${dict.vehicles.stats.jobToasts.unloadedPrefix} ${cargoLabel} · +${formatNCoins(outcome.rewardCoins)} N-Coin${bonusTxt}`,
        'success',
      );
    } else if (outcome.kind === 'reloaded_cargo' && outcome.updatedOwnCargo) {
      const cargoLabel = dict.vehicles.stats.cargoTypes[outcome.updatedOwnCargo];
      store.showToast(`${dict.vehicles.stats.jobToasts.reloadedPrefix} ${cargoLabel}`, 'info');
    } else if (outcome.kind === 'excavator_loaded_truck' && outcome.loadedNearbyTruck) {
      const truckName = dict.vehicles[outcome.loadedNearbyTruck.vehicleId].name;
      store.showToast(
        `${dict.vehicles.stats.jobToasts.excavatorLoadedTruck} ${truckName} · +${formatNCoins(outcome.rewardCoins)} N-Coin${bonusTxt}`,
        'success',
      );
    } else if (outcome.kind === 'excavator_dug') {
      store.showToast(
        `${dict.vehicles.stats.jobToasts.excavatorDig} +${formatNCoins(outcome.rewardCoins)} N-Coin${bonusTxt}`,
        'success',
      );
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    audioEngine.unlock();
    if (isTextInputFocused()) return;

    const store = useGameStore.getState();
    if (!store.gameStarted) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      store.setActiveModal(store.activeModal === 'none' ? 'pause' : 'none');
      return;
    }

    if (e.code === 'KeyM') {
      e.preventDefault();
      store.setActiveModal(store.activeModal === 'map' ? 'none' : 'map');
      return;
    }
    if (e.code === 'KeyI') {
      e.preventDefault();
      store.setActiveModal(store.activeModal === 'inventory' ? 'none' : 'inventory');
      return;
    }
    if (e.code === 'KeyJ') {
      e.preventDefault();
      store.setActiveModal(store.activeModal === 'missions' ? 'none' : 'missions');
      return;
    }
    if (e.code === 'KeyK') {
      e.preventDefault();
      if (store.activeModal === 'enterprises') {
        store.setActiveModal('none');
      } else {
        const focusId =
          store.currentBuildingId ??
          (store.nearestInteractable?.type === 'metro_station'
            ? store.nearestInteractable.payloadId ?? null
            : null);
        store.openEnterprisesModal(focusId);
      }
      return;
    }
    if (e.code === 'KeyT') {
      e.preventDefault();
      if (store.activeModal === 'metro') {
        store.setActiveModal('none');
      } else {
        const focusStation =
          store.nearestInteractable?.type === 'metro_station'
            ? store.nearestInteractable.payloadId ?? null
            : null;
        store.openMetroModal(focusStation);
      }
      return;
    }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (store.activeModal === 'none') store.toggleDock();
      return;
    }

    if (store.activeModal !== 'none') return;

    if (e.code === 'Space' && metroSystem.isRiding() && !e.repeat) {
      e.preventDefault();
      store.skipActiveMetroRide();
      return;
    }

    pressedKeys.add(e.code);

    // In-Ride Station Stop Selection (Digit1..Digit6 while riding inside the Metro!)
    if (metroSystem.isRiding() && !e.repeat) {
      const digitMatch = /^Digit([1-6])$/.exec(e.code);
      if (digitMatch) {
        const stIdx = Number(digitMatch[1]) - 1;
        const targetSt = METRO_STATIONS[stIdx];
        if (targetSt) {
          const dict = getTranslations(useSettingsStore.getState().language);
          store.selectMetroStopWhileRiding(targetSt.id);
          store.showToast(
            `${dict.metro.arrivingTo}: ${resolveNestedKey(dict, targetSt.nameKey)}`,
            'info',
          );
        }
        return;
      }
    }

    // Quick Weapon Switching (1..4 and Q)
    if (!activeVehicleInstanceId && !metroSystem.isRiding() && !e.repeat) {
      if (e.code === 'Digit1') store.setEquippedWeapon('unarmed');
      else if (e.code === 'Digit2') store.setEquippedWeapon('pistol');
      else if (e.code === 'Digit3') store.setEquippedWeapon('ak47');
      else if (e.code === 'Digit4') store.setEquippedWeapon('golf_club');
      else if (e.code === 'KeyQ') store.cycleWeapon();
    }

    if (e.code === 'KeyB' && !e.repeat) {
      const dict = getTranslations(useSettingsStore.getState().language);
      const targetPlaceId =
        store.currentBuildingId ??
        (store.nearestInteractable?.type === 'metro_station'
          ? store.nearestInteractable.payloadId ?? null
          : null);
      if (targetPlaceId) {
        if (store.inventory.ownedProperties.includes(targetPlaceId)) {
          store.openEnterprisesModal(targetPlaceId);
        } else {
          const res = store.buyEnterprise(targetPlaceId);
          if (res.ok) {
            store.showToast(dict.enterprises.buySuccess, 'success');
          } else {
            store.showToast(dict.enterprises.insufficientCoins, 'warning');
            store.openEnterprisesModal(targetPlaceId);
          }
        }
      } else {
        store.openEnterprisesModal(null);
      }
    } else if (e.code === 'KeyE' && !e.repeat) {
      handleEnterOrExitVehicle();
    } else if (e.code === 'KeyH' && !e.repeat && !activeVehicleInstanceId && !metroSystem.isRiding()) {
      const indoorBld = findBuildingContainingPoint(
        playerRuntime.position.x,
        playerRuntime.position.z,
        -0.25,
      );
      if (indoorBld && getHeistTarget(indoorBld.id)) {
        tryBeginVenueHeist(indoorBld.id);
      }
    } else if (e.code === 'KeyF' && !e.repeat && !metroSystem.isRiding()) {
      handleContextInteract();
    } else if (e.code === 'KeyP' && !e.repeat && !metroSystem.isRiding()) {
      const dict = getTranslations(useSettingsStore.getState().language);
      if (streetRace.getStatus() === 'countdown' || streetRace.getStatus() === 'racing') {
        store.stopCityRace();
      } else {
        store.startCityRace(dict.race.startedToast);
      }
    } else if (e.code === 'KeyG' && !e.repeat && !metroSystem.isRiding()) {
      if (activeVehicleInstanceId) {
        const cv = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
        if (cv && VEHICLE_CONFIGS[cv.vehicleId].canCarryCargo) {
          const dict = getTranslations(useSettingsStore.getState().language);
          const nextCargo = store.cycleVehicleCargo(cv.vehicleId);
          if (nextCargo !== 'empty') {
            vehicleHydraulicsTarget.set(cv.instanceId, 0);
          }
          store.showToast(
            `${dict.vehicles.stats.cargoChangedToast} ${dict.vehicles.stats.cargoTypes[nextCargo]}`,
            'info',
          );
        } else {
          store.setActiveModal('garage');
        }
      } else {
        store.setActiveModal('garage');
      }
    } else if (e.code === 'KeyX' && !e.repeat && activeVehicleInstanceId) {
      const cv = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
      if (cv && VEHICLE_CONFIGS[cv.vehicleId].bodyStyle === 'airplane') {
        triggerAirplaneBombDrop(cv);
      } else {
        triggerActiveVehicleWorkAction();
      }
    } else if (e.code === 'KeyB' && !e.repeat && activeVehicleInstanceId) {
      const cv = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
      if (cv && VEHICLE_CONFIGS[cv.vehicleId].bodyStyle === 'airplane') {
        triggerAirplaneBombDrop(cv);
      }
    } else if (e.code === 'KeyV' && !e.repeat) {
      store.cycleCameraMode();
    } else if ((e.code === 'KeyT' || e.code === 'KeyZ') && !e.repeat && !activeVehicleInstanceId) {
      spiderWebSystem.triggerWebZip(playerRuntime.position);
    } else if ((e.code === 'Space' || e.code === 'KeyC' || e.code === 'KeyF') && !e.repeat && activeVehicleInstanceId) {
      const cv = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
      if (cv) {
        const style = VEHICLE_CONFIGS[cv.vehicleId].bodyStyle;
        if (style === 'tank') {
          triggerTankCannonFire(cv);
        } else if (style === 'airplane') {
          triggerAirplaneGunFire(cv);
        }
      }
    } else if (e.code === 'KeyR' && !e.repeat && activeVehicleInstanceId) {
      const cv = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
      if (cv) resetVehicleOntoRoad(cv);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    pressedKeys.delete(e.code);
  };

  const onWindowBlur = () => {
    pressedKeys.clear();
    mouseFireHeld = false;
  };

  // Mouse / Touch Camera Look + Desktop Left-Click Fire
  let draggingLook = false;
  let lookPointerId: number | null = null;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const onPointerDown = (e: PointerEvent) => {
    audioEngine.unlock();
    const store = useGameStore.getState();
    if (store.activeModal !== 'none' || !store.gameStarted) return;

    draggingLook = true;
    lookPointerId = e.pointerId;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;

    // Desktop mouse left-click fires equipped weapon, or fires Tank Cannon / Airplane guns!
    if (e.pointerType !== 'touch' && e.button === 0) {
      if (activeVehicleInstanceId) {
        const activeVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
        if (activeVeh) {
          const style = VEHICLE_CONFIGS[activeVeh.vehicleId].bodyStyle;
          if (style === 'tank') {
            triggerTankCannonFire(activeVeh);
          } else if (style === 'airplane') {
            mouseFireHeld = true;
            triggerAirplaneGunFire(activeVeh);
          }
        }
      } else if (store.equippedWeapon !== 'unarmed') {
        mouseFireHeld = true;
      }
    } else if (e.button === 2 && !activeVehicleInstanceId) {
      // Right-click: Spider-Man Web-Zip!
      spiderWebSystem.triggerWebZip(playerRuntime.position);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!draggingLook || e.pointerId !== lookPointerId) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    const s = useSettingsStore.getState();
    cameraController.rotate(dx, dy, s.mouseSensitivity * s.cameraSensitivity);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === lookPointerId) {
      draggingLook = false;
      lookPointerId = null;
    }
    if (e.button === 0 || e.pointerType !== 'touch') {
      mouseFireHeld = false;
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onWindowBlur);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  const fpsMonitor = new FpsMonitor();
  let telemetryAccumSec = 0;
  let accumWalked = 0;
  let accumDriven = 0;
  let lastAppliedQuality = '';
  let lastAppliedShadows: boolean | null = null;
  let lastRouteKey = '';

  const loopHandle = startPacedRenderLoop(renderer, isSoftwareGl, (dt, elapsed, nowMs) => {
    const store = useGameStore.getState();
    const settings = useSettingsStore.getState();

    if (gunfireWantedCooldown > 0) {
      gunfireWantedCooldown = Math.max(0, gunfireWantedCooldown - dt);
    }

    // Sync graphics quality if changed
    if (settings.graphicsQuality !== lastAppliedQuality || settings.shadowsEnabled !== lastAppliedShadows) {
      lighting.applyQuality(settings.graphicsQuality, settings.shadowsEnabled, isSoftwareGl);
      lastAppliedQuality = settings.graphicsQuality;
      lastAppliedShadows = settings.shadowsEnabled;
    }

    // Sync equipped 3D weapon model
    if (store.equippedWeapon !== lastEquippedWeapon) {
      lastEquippedWeapon = store.equippedWeapon;
      arsenal.setEquippedWeapon(store.equippedWeapon);
    }

    // Sync all 24 vehicle parked positions & tuning from store when continuing/reloading
    if (engineCommandRef.syncVehiclesFromStore) {
      engineCommandRef.syncVehiclesFromStore = undefined;
      for (const vs of vehicleStates) {
        const storedVeh = store.vehicles.find((sv) => sv.vehicleId === vs.vehicleId);
        if (storedVeh) {
          const safeSpot = collisionWorld.resolveCircle(storedVeh.position.x, storedVeh.position.z, 1.65);
          vs.position.x = safeSpot.x;
          vs.position.z = safeSpot.z;
          vs.rotationY = storedVeh.rotationY;
          vs.speed = 0;
          vs.color = storedVeh.color;
          vs.tuning =
            store.inventory.vehicleTuning?.[vs.vehicleId] ??
            storedVeh.tuning ??
            getDefaultVehicleTuning(vs.vehicleId);
          const rig = vehicleRigs.get(vs.instanceId);
          if (rig) {
            rig.setPaintColor(vs.color);
            rig.applyTuning(vs.tuning);
            rig.root.position.set(vs.position.x, 0, vs.position.z);
            rig.root.rotation.y = vs.rotationY;
          }
        }
      }
    }

    // Live-apply Garage paint, tire color, cabin interior, rim style/color, and truck cargo edits!
    if (engineCommandRef.applyLiveVehicleCosmetics) {
      engineCommandRef.applyLiveVehicleCosmetics = undefined;
      for (const vs of vehicleStates) {
        const targetColor = store.inventory.vehicleColors[vs.vehicleId] ?? vs.color;
        const targetTuning =
          store.inventory.vehicleTuning?.[vs.vehicleId] ??
          vs.tuning ??
          getDefaultVehicleTuning(vs.vehicleId);
        vs.color = targetColor;
        vs.tuning = targetTuning;
        const rig = vehicleRigs.get(vs.instanceId);
        if (rig) {
          rig.setPaintColor(targetColor);
          rig.applyTuning(targetTuning);
        }
      }
    } else {
      for (const vs of vehicleStates) {
        const targetColor = store.inventory.vehicleColors[vs.vehicleId];
        if (targetColor && vs.color !== targetColor) {
          vs.color = targetColor;
          vehicleRigs.get(vs.instanceId)?.setPaintColor(targetColor);
        }
      }
    }

    if (engineCommandRef.toggleVehicleHydraulics) {
      engineCommandRef.toggleVehicleHydraulics = undefined;
      triggerActiveVehicleWorkAction();
    }

    if (engineCommandRef.selectCinemaMovieIndex !== undefined) {
      const idx = engineCommandRef.selectCinemaMovieIndex;
      engineCommandRef.selectCinemaMovieIndex = undefined;
      enterableBuildings.setCinemaMovie(store.currentBuildingId ?? 'cinema_star', idx);
    }

    if (engineCommandRef.loadCustomCinemaVideo) {
      const cmd = engineCommandRef.loadCustomCinemaVideo;
      engineCommandRef.loadCustomCinemaVideo = undefined;
      enterableBuildings.loadCustomCinemaVideo(
        store.currentBuildingId ?? 'cinema_star',
        cmd.url,
        cmd.fileName,
      );
    }

    if (engineCommandRef.toggleCinemaPlayPause) {
      engineCommandRef.toggleCinemaPlayPause = undefined;
      enterableBuildings.toggleCinemaPlayPause(store.currentBuildingId ?? 'cinema_star');
    }

    // Handle pending UI commands
    if (engineCommandRef.teleportPlayer) {
      const tp = engineCommandRef.teleportPlayer;
      engineCommandRef.teleportPlayer = undefined;
      if (metroSystem.isRiding()) {
        metroSystem.skipRideImmediate();
        latestMetroRide = { active: false, fromStationId: null, toStationId: null, progress: 0 };
      }
      activeVehicleInstanceId = null;
      playerRig.root.visible = true;
      playerRuntime.position = { ...tp };
      playerRuntime.velocityY = 0;
      cameraController.snapBehind(tp, playerRuntime.rotationY);
    }

    if (engineCommandRef.skipMetroRide) {
      engineCommandRef.skipMetroRide = undefined;
      const dest = metroSystem.skipRideImmediate();
      if (dest) {
        playerRuntime.position = { ...dest.arrivalPos };
        playerRuntime.rotationY = dest.arrivalYaw;
        playerRuntime.velocityY = 0;
        playerRig.root.visible = true;
        cameraController.snapBehind(playerRuntime.position, playerRuntime.rotationY);
        audioEngine.playMetroChime();
        const dict = getTranslations(settings.language);
        useGameStore
          .getState()
          .showToast(`${dict.metro.arriveToastPrefix}: ${resolveNestedKey(dict, dest.nameKey)}`, 'success');
      }
      latestMetroRide = { active: false, fromStationId: null, toStationId: null, progress: 0 };
    }

    if (engineCommandRef.toggleBoardMetro) {
      engineCommandRef.toggleBoardMetro = undefined;
      handleBoardOrExitMetroExplicit();
    }

    if (engineCommandRef.setMetroStopWhileRiding) {
      const stopId = engineCommandRef.setMetroStopWhileRiding;
      engineCommandRef.setMetroStopWhileRiding = undefined;
      if (metroSystem.isRiding()) {
        if (!metroSystem.setDestinationWhileRiding(stopId)) {
          const curFrom = latestMetroRide.fromStationId ?? METRO_STATIONS[0].id;
          metroSystem.startRide(curFrom, stopId);
        }
      }
    }

    if (engineCommandRef.startMetroRide) {
      const rideCmd = engineCommandRef.startMetroRide;
      engineCommandRef.startMetroRide = undefined;
      if (!activeVehicleInstanceId) {
        if (streetRace.getStatus() === 'countdown' || streetRace.getStatus() === 'racing') {
          streetRace.stopRace();
        }
        if (metroSystem.startRide(rideCmd.fromStationId, rideCmd.toStationId)) {
          playerRig.root.visible = true;
        }
      }
    }

    if (engineCommandRef.spawnOrSelectVehicle) {
      const cmd = engineCommandRef.spawnOrSelectVehicle;
      engineCommandRef.spawnOrSelectVehicle = undefined;

      // Never allow switching directly into another vehicle while sitting in a vehicle ("mashinada turgan bo'lsa boshqasiga o'ta olmasin")
      if (!activeVehicleInstanceId) {
        if (metroSystem.isRiding()) {
          metroSystem.skipRideImmediate();
        }
        if (playerRuntime.position.y > 2.0) {
          const stNear = findNearestMetroStation(playerRuntime.position.x, playerRuntime.position.z);
          playerRuntime.position = { ...stNear.arrivalPos };
        }
        const targetVeh = vehicleStates.find((v) => v.vehicleId === cmd.vehicleId);
        if (targetVeh) {
          const targetCfg = VEHICLE_CONFIGS[targetVeh.vehicleId];
          const fwdDist = Math.max(3.8, targetCfg.halfLength + 2.0);
          const stepGrid = targetCfg.halfLength > 3.0 ? 6.8 : 4.4;
          const minClearance = Math.max(3.8, targetCfg.halfLength + 1.4);

          const base = cmd.nearPlayer
            ? {
                x: playerRuntime.position.x + Math.sin(playerRuntime.rotationY) * fwdDist,
                z: playerRuntime.position.z + Math.cos(playerRuntime.rotationY) * fwdDist,
              }
            : { x: playerRuntime.position.x, z: playerRuntime.position.z };

          // Find a clear spot that does NOT overlap any other standing vehicle
          let chosenX = base.x;
          let chosenZ = base.z;
          const candidateOffsets = [
            [0, 0],
            [stepGrid, 0],
            [-stepGrid, 0],
            [0, stepGrid],
            [0, -stepGrid],
            [stepGrid * 1.35, stepGrid],
            [-stepGrid * 1.35, stepGrid],
            [stepGrid * 1.35, -stepGrid],
            [-stepGrid * 1.35, -stepGrid],
          ];
          const spawnSin = Math.sin(playerRuntime.rotationY);
          const spawnCos = Math.cos(playerRuntime.rotationY);
          const checkR = Math.max(1.5, targetCfg.halfWidth * 1.1);
          const axleOff = Math.max(0, targetCfg.halfLength - checkR * 0.65);

          for (const [ox, oz] of candidateOffsets) {
            const resolved = collisionWorld.resolveCircle(base.x + ox, base.z + oz, checkR + 0.35);
            const fCheck = collisionWorld.resolveCircle(
              resolved.x + spawnSin * axleOff,
              resolved.z + spawnCos * axleOff,
              checkR,
            );
            const rCheck = collisionWorld.resolveCircle(
              resolved.x - spawnSin * axleOff,
              resolved.z - spawnCos * axleOff,
              checkR,
            );
            const insideBuilding = findBuildingContainingPoint(resolved.x, resolved.z, 2.4);
            const occupiedByCar = vehicleStates.some(
              (other) =>
                other.instanceId !== targetVeh.instanceId &&
                Math.hypot(other.position.x - resolved.x, other.position.z - resolved.z) < minClearance,
            );
            if (!occupiedByCar && !insideBuilding && !fCheck.hit && !rCheck.hit) {
              chosenX = resolved.x;
              chosenZ = resolved.z;
              break;
            }
          }

          targetVeh.position.x = chosenX;
          targetVeh.position.y = 0;
          targetVeh.position.z = chosenZ;
          targetVeh.speed = 0;
          targetVeh.rotationY = playerRuntime.rotationY;
          const targetRig = vehicleRigs.get(targetVeh.instanceId);
          if (targetRig) {
            targetRig.root.position.set(chosenX, 0, chosenZ);
            targetRig.root.rotation.y = targetVeh.rotationY;
          }
          activeVehicleInstanceId = targetVeh.instanceId;
          playerRig.root.visible = false;
          cameraController.snapBehind(targetVeh.position, targetVeh.rotationY);
          persistParkedVehiclesImmediate();
        }
      }
    }

    if (engineCommandRef.resetCurrentVehicle) {
      engineCommandRef.resetCurrentVehicle = undefined;
      if (activeVehicleInstanceId) {
        const cv = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
        if (cv) resetVehicleOntoRoad(cv);
      }
    }

    if (engineCommandRef.toggleEnterExitVehicle) {
      engineCommandRef.toggleEnterExitVehicle = undefined;
      handleEnterOrExitVehicle();
    }

    if (engineCommandRef.triggerInteract) {
      engineCommandRef.triggerInteract = undefined;
      handleContextInteract();
    }

    if (engineCommandRef.stopStreetRace) {
      engineCommandRef.stopStreetRace = undefined;
      streetRace.stopRace();
      latestRaceSnapshot = useGameStore.getState().raceState;
    }

    if (engineCommandRef.startStreetRace) {
      engineCommandRef.startStreetRace = undefined;
      launchStreetRaceGrid();
    }

    if (engineCommandRef.triggerStartHeist) {
      engineCommandRef.triggerStartHeist = undefined;
      if (!activeVehicleInstanceId && !metroSystem.isRiding()) {
        const indoorBld = findBuildingContainingPoint(
          playerRuntime.position.x,
          playerRuntime.position.z,
          -0.25,
        );
        if (indoorBld) {
          tryBeginVenueHeist(indoorBld.id);
        }
      }
    }

    if (engineCommandRef.teleportToFriend) {
      const friendTarget = engineCommandRef.teleportToFriend;
      engineCommandRef.teleportToFriend = undefined;
      if (metroSystem.isRiding()) {
        metroSystem.skipRideImmediate();
      }
      if (activeVehicleInstanceId) {
        // Keep current vehicle intact ("mashinada turgan bo'lsa boshqasiga o'ta olmasin") and park right near friend
        const activeVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
        if (activeVeh) {
          const offsets = [
            [6.5, 0],
            [-6.5, 0],
            [0, 6.5],
            [0, -6.5],
            [8.5, 8.5],
            [-8.5, -8.5],
          ];
          let chosenX = friendTarget.x + 6.5;
          let chosenZ = friendTarget.z;
          for (const [ox, oz] of offsets) {
            const cand = collisionWorld.resolveCircle(friendTarget.x + ox, friendTarget.z + oz, 2.1);
            if (!findBuildingContainingPoint(cand.x, cand.z, 2.2)) {
              chosenX = cand.x;
              chosenZ = cand.z;
              break;
            }
          }
          activeVeh.position.x = chosenX;
          activeVeh.position.y = 0;
          activeVeh.position.z = chosenZ;
          activeVeh.speed = 0;
          playerRuntime.position.x = chosenX;
          playerRuntime.position.y = 0;
          playerRuntime.position.z = chosenZ;
          const rig = vehicleRigs.get(activeVeh.instanceId);
          if (rig) {
            rig.root.position.set(chosenX, 0, chosenZ);
          }
          cameraController.snapBehind(activeVeh.position, activeVeh.rotationY);
        }
      } else {
        const resolved = collisionWorld.resolveCircle(friendTarget.x + 2.1, friendTarget.z + 1.8, 0.7);
        playerRuntime.position.x = resolved.x;
        playerRuntime.position.y = friendTarget.y > 4 ? friendTarget.y : 0;
        playerRuntime.position.z = resolved.z;
        playerRuntime.velocityY = 0;
        playerRuntime.isGrounded = true;
        playerRig.root.visible = true;
        playerRig.root.position.set(
          playerRuntime.position.x,
          playerRuntime.position.y,
          playerRuntime.position.z,
        );
        cameraController.snapBehind(playerRuntime.position, playerRuntime.rotationY);
      }
    }

    const isPaused = !store.gameStarted || store.activeModal !== 'none';

    let currentHours = store.world.timeHours;
    if (!isPaused && store.world.autoTimeCycle) {
      currentHours = (currentHours + dt * 0.08) % 24;
    }

    const focusPos = activeVehicleInstanceId
      ? vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId)?.position ?? playerRuntime.position
      : playerRuntime.position;

    const headlightsNeeded = lighting.update(
      currentHours,
      store.world.weather,
      focusPos,
      buildings.nightMaterials,
      roads.lampBulbMaterial,
    );
    buildings.showroomTurntable.rotation.y = elapsed * 0.45;
    roads.trafficController.update(elapsed);

    const emitTeleportOverpass = (
      fromX: number,
      fromZ: number,
      overX: number,
      overZ: number,
      toX: number,
      toZ: number,
      colorHex = 0x22d3ee,
    ) => {
      teleportEffects.spawnOverpassFX(fromX, fromZ, overX, overZ, toX, toZ, colorHex);
      if (store.gameStarted) {
        const dist = Math.hypot(overX - focusPos.x, overZ - focusPos.z);
        audioEngine.playTeleportBlip(dist);
      }
    };

    if (!store.gameStarted) {
      trafficBlockingScratch.length = 0;
      for (let i = 0; i < vehicleStates.length; i++) {
        trafficBlockingScratch.push({
          x: vehicleStates[i].position.x,
          z: vehicleStates[i].position.z,
          radius: 1.65,
        });
      }
      trafficAI.update(
        dt,
        18,
        headlightsNeeded,
        roads.trafficController,
        { x: 0, y: 0, z: 0 },
        [],
        trafficBlockingScratch,
        true,
        collisionWorld,
        (fx, fz, ox, oz, tx, tz) => emitTeleportOverpass(fx, fz, ox, oz, tx, tz, 0x22d3ee),
      );
      enterableBuildings.update(dt, elapsed, store.inventory.ownedProperties, { x: 0, z: -20 });
      heistSystem.update(dt, elapsed, null, 0, store.heist.robbedUntilByBuilding, Date.now());
      metroSystem.update(dt, elapsed, store.inventory.ownedProperties);
      teleportEffects.update(dt);
      weather.update(dt, store.world.weather, { x: 0, y: 0, z: -20 }, roads.asphaltMaterial, roads.intersectionMaterial);
      audioEngine.updateSiren(0, 999, elapsed, true);
      audioEngine.updateCinemaAudio(false, 0, elapsed, true);
      cameraController.updateMenuFlyover(camera, elapsed);
      renderer.render(scene, camera);
      return;
    }

    let currentSpeedMps = 0;
    let frameDrivenMeters = 0;
    let hadCarCrash = false;
    frameWeaponFiredNow = false;

    if (!isPaused) {
      const currentIndoorVenue =
        !activeVehicleInstanceId && !metroSystem.isRiding()
          ? findBuildingContainingPoint(playerRuntime.position.x, playerRuntime.position.z, -0.25)
          : null;
      const activeCinemaHallId =
        currentIndoorVenue?.category === 'cinema' ? currentIndoorVenue.id : null;
      const cinemaGain = settings.masterVolume * settings.sfxVolume * 0.85;

      enterableBuildings.update(
        dt,
        elapsed,
        store.inventory.ownedProperties,
        focusPos,
        activeCinemaHallId,
        cinemaGain,
      );
      const metroStep = metroSystem.update(
        dt,
        elapsed,
        store.inventory.ownedProperties,
        activeVehicleInstanceId ? undefined : playerRuntime.position,
      );
      latestMetroRide = metroStep.rideState;

      if (metroStep.autoBoardedStation) {
        audioEngine.playMetroChime();
        const dict = getTranslations(settings.language);
        useGameStore
          .getState()
          .showToast(
            `${dict.metro.boardedLiveToast}: ${resolveNestedKey(dict, metroStep.autoBoardedStation.nameKey)}`,
            'info',
          );
      } else if (metroStep.justStoppedStation && !metroStep.arrivedStation) {
        audioEngine.playMetroChime();
      }

      if (metroStep.arrivedStation) {
        if (metroStep.rideState.mode === 'live_loop') {
          // Selected 1..6 destination during live ride: step out onto the Elevated Station Platform!
          const exitSt = metroStep.arrivedStation;
          const entDx = exitSt.entrancePos.x - exitSt.trackX;
          const entDz = exitSt.entrancePos.z - exitSt.trackZ;
          const entLen = Math.hypot(entDx, entDz) || 1;
          const uOutX = Math.round(entDx / entLen);
          const uOutZ = Math.round(entDz / entLen);
          playerRuntime.position = {
            x: exitSt.trackX + uOutX * 3.55,
            y: 9.76,
            z: exitSt.trackZ + uOutZ * 3.55,
          };
          playerRuntime.rotationY = Math.atan2(uOutX, uOutZ);
        } else {
          playerRuntime.position = { ...metroStep.arrivedStation.arrivalPos };
          playerRuntime.rotationY = metroStep.arrivedStation.arrivalYaw;
        }
        playerRuntime.velocityY = 0;
        playerRuntime.isGrounded = true;
        playerRig.root.visible = true;
        cameraController.snapBehind(playerRuntime.position, playerRuntime.rotationY);
        audioEngine.playMetroChime();
        const dict = getTranslations(settings.language);
        useGameStore
          .getState()
          .showToast(
            `${dict.metro.arriveToastPrefix}: ${resolveNestedKey(dict, metroStep.arrivedStation.nameKey)}`,
            'success',
          );
      }
      const maxPeds = settings.graphicsQuality === 'low' ? 28 : settings.graphicsQuality === 'medium' ? 44 : 58;
      const pedPositions = pedestrians.getActivePositions();

      // Build blocking vehicle list for Traffic AI (all 20 world/player cars + Police cruisers)
      trafficBlockingScratch.length = 0;
      for (let i = 0; i < vehicleStates.length; i++) {
        trafficBlockingScratch.push({
          x: vehicleStates[i].position.x,
          z: vehicleStates[i].position.z,
          radius: 1.65,
        });
      }
      const policeObsForTraffic = policeAI.getActiveObstacles();
      for (let i = 0; i < policeObsForTraffic.length; i++) {
        trafficBlockingScratch.push(policeObsForTraffic[i]);
      }
      const friendCarObs = remotePlayers.getObstacleCircles();
      for (let i = 0; i < friendCarObs.length; i++) {
        trafficBlockingScratch.push(friendCarObs[i]);
      }

      trafficAI.update(
        dt,
        store.world.trafficCount,
        headlightsNeeded,
        roads.trafficController,
        focusPos,
        pedPositions,
        trafficBlockingScratch,
        Boolean(activeVehicleInstanceId),
        collisionWorld,
        (fx, fz, ox, oz, tx, tz) => emitTeleportOverpass(fx, fz, ox, oz, tx, tz, 0x22d3ee),
      );

      if (activeVehicleInstanceId) {
        playerRig.root.visible = false;
        const activeVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId)!;
        const cfg = VEHICLE_CONFIGS[activeVeh.vehicleId];
        const isCombat = cfg.bodyStyle === 'tank' || cfg.bodyStyle === 'airplane';
        const rawControls = readVehicleControlInputs(pressedKeys, touchInputRef, isCombat);
        // Hold launch on grid during 3-2-1 countdown
        const controls =
          streetRace.getStatus() === 'countdown'
            ? { throttle: 0, reverse: 0, steer: 0, handbrake: true }
            : rawControls;

        const obstacles = [
          ...trafficAI.getActiveObstacles(),
          ...policeAI.getActiveObstacles(),
          ...streetRace.getRivalObstaclesForPlayer(),
        ];
        for (const other of vehicleStates) {
          if (other.instanceId !== activeVeh.instanceId) {
            obstacles.push({ x: other.position.x, z: other.position.z, radius: 1.55 });
          }
        }

        const stepRes = stepVehiclePhysics(activeVeh, cfg, controls, collisionWorld, obstacles, dt);

        // Keep cars outside walk-in building doorways (only people walk inside buildings!)
        const intrudedBld = findBuildingContainingPoint(activeVeh.position.x, activeVeh.position.z, 1.3);
        if (intrudedBld) {
          const fSign = intrudedBld.doorFacing === 'south' ? 1 : -1;
          activeVeh.position.z = intrudedBld.centerZ + fSign * (intrudedBld.depth * 0.5 + 1.45);
          activeVeh.speed = 0;
        }

        currentSpeedMps = activeVeh.speed;
        frameDrivenMeters = stepRes.distanceMeters;
        accumDriven += frameDrivenMeters;
        hadCarCrash = stepRes.collidedHard || Boolean(intrudedBld);

        if (controls.handbrake && Math.abs(activeVeh.speed) > 8) {
          audioEngine.playBrake(activeVeh.speed);
        }
        if (hadCarCrash) {
          audioEngine.vibrate(65, settings.vibrationEnabled);
        }

        playerRuntime.position.x = activeVeh.position.x;
        playerRuntime.position.y = activeVeh.position.y || 0;
        playerRuntime.position.z = activeVeh.position.z;
        playerRuntime.rotationY = activeVeh.rotationY;

        if (cfg.bodyStyle === 'tank') {
          if (
            engineCommandRef.triggerTankCannon ||
            pressedKeys.has('Space') ||
            pressedKeys.has('KeyC') ||
            pressedKeys.has('KeyF') ||
            touchInputRef.fire ||
            mouseFireHeld
          ) {
            engineCommandRef.triggerTankCannon = false;
            triggerTankCannonFire(activeVeh);
          }
        } else if (cfg.bodyStyle === 'airplane') {
          if (
            engineCommandRef.triggerAirplaneGun ||
            pressedKeys.has('KeyF') ||
            pressedKeys.has('KeyC') ||
            touchInputRef.fire ||
            mouseFireHeld
          ) {
            engineCommandRef.triggerAirplaneGun = false;
            triggerAirplaneGunFire(activeVeh);
          }
          if (engineCommandRef.triggerAirplaneBomb || pressedKeys.has('KeyB')) {
            engineCommandRef.triggerAirplaneBomb = false;
            triggerAirplaneBombDrop(activeVeh);
          }
        }

        if (Math.abs(activeVeh.speed) > 9.5 && (vehicleHydraulicsTarget.get(activeVeh.instanceId) ?? 0) > 0.5) {
          vehicleHydraulicsTarget.set(activeVeh.instanceId, 0);
        }
        const hydroGoal = vehicleHydraulicsTarget.get(activeVeh.instanceId) ?? 0;
        activeVeh.workAnimPhase = THREE.MathUtils.damp(
          activeVeh.workAnimPhase ?? 0,
          hydroGoal,
          3.4,
          dt,
        );

        const rig = vehicleRigs.get(activeVeh.instanceId);
        if (rig) {
          rig.root.position.set(activeVeh.position.x, activeVeh.position.y || 0, activeVeh.position.z);
          rig.root.rotation.y = activeVeh.rotationY;
          rig.updateVisuals(
            activeVeh.wheelSpin,
            activeVeh.steerAngle,
            headlightsNeeded,
            activeVeh.braking,
            stepRes.bodyPitch,
            stepRes.bodyRoll,
            activeVeh.workAnimPhase,
          );
        }
      } else if (metroStep.ridingNow) {
        // Keep 3D character visibly standing inside the transparent glass middle Metro carriage!
        playerRig.root.visible = true;
        const prevX = playerRuntime.position.x;
        const prevZ = playerRuntime.position.z;
        playerRuntime.position.x = metroStep.riderPosition.x;
        playerRuntime.position.y = metroStep.riderPosition.y;
        playerRuntime.position.z = metroStep.riderPosition.z;
        playerRuntime.rotationY = metroStep.riderYaw;
        playerRig.root.position.set(
          playerRuntime.position.x,
          playerRuntime.position.y,
          playerRuntime.position.z,
        );
        playerRig.root.rotation.y = playerRuntime.rotationY;
        playerRig.animate(dt, 0, false, true, 'unarmed', 0);

        const stepDist = Math.hypot(playerRuntime.position.x - prevX, playerRuntime.position.z - prevZ);
        currentSpeedMps = dt > 0.001 ? Math.min(65, stepDist / dt) : 38;
        accumDriven += stepDist;
      } else {
        playerRig.root.visible = true;

        if (engineCommandRef.triggerSpiderWebZip) {
          spiderWebSystem.triggerWebZip(playerRuntime.position);
          engineCommandRef.triggerSpiderWebZip = false;
        }

        if (spiderWebSystem.isZipping) {
          spiderWebSystem.stepFlight(
            dt,
            playerRuntime.position,
            (x, y, z) => {
              playerRuntime.position.x = x;
              playerRuntime.position.y = y;
              playerRuntime.position.z = z;
            },
            (g) => {
              playerRuntime.isGrounded = g;
            },
          );
          accumWalked += dt * 36;
          currentSpeedMps = 44;
          playerRig.root.position.set(
            playerRuntime.position.x,
            playerRuntime.position.y,
            playerRuntime.position.z,
          );
          playerRig.animate(dt, 28, false, false, 'unarmed', 0);
        } else {
          spiderWebSystem.update(dt, camera, playerRuntime.position, collisionWorld);

          const walked = stepPlayerController(
            playerRuntime,
            pressedKeys,
            touchInputRef,
            cameraController.yaw,
            settings.touchSensitivity,
            collisionWorld,
            dt,
            (wx, wz, curY) => metroSystem.resolveWalkableSurface(wx, wz, curY),
          );
          accumWalked += walked;

        // Handle Weapon / Golf Club Triggering (Mouse Left-Click, KeyC, or Touch Fire)
        const wantsFire = mouseFireHeld || pressedKeys.has('KeyC') || touchInputRef.fire;
        if (wantsFire && store.equippedWeapon !== 'unarmed') {
          playerRuntime.rotationY = cameraController.yaw + Math.PI;
        }

        if (wantsFire && store.equippedWeapon !== 'unarmed') {
          const policePos = policeAI.getActiveObstacles();
          const pedTargets = pedestrians.getActiveTargets();
          const shotRes = arsenal.triggerAction(
            store.equippedWeapon,
            playerRuntime.position,
            cameraController.yaw + Math.PI,
            cameraController.pitch,
            collisionWorld,
            pedTargets,
            policePos,
          );

          if (shotRes.fired) {
            frameWeaponFiredNow = true;
            if (shotRes.soundType) {
              audioEngine.playWeaponSound(shotRes.soundType);
            }
            audioEngine.vibrate(30, settings.vibrationEnabled);

            // Firing or swinging a weapon inside a Bank, Museum, or Shop also triggers the heist
            if (currentIndoorVenue && getHeistTarget(currentIndoorVenue.id)) {
              tryBeginVenueHeist(currentIndoorVenue.id);
            }

            let eliminatedAny = false;
            for (const hit of shotRes.hitPedestrians) {
              if (pedestrians.eliminatePedestrian(hit.id, hit.dirX, hit.dirZ)) {
                eliminatedAny = true;
              }
            }

            // Gunfire or pedestrian hit causes nearby pedestrians to sprint away
            if (store.equippedWeapon !== 'golf_club' || eliminatedAny) {
              pedestrians.scatterFromSound(playerRuntime.position.x, playerRuntime.position.z, 26);
            }

            // Escalate Police ("Melitsiya") wanted level if eliminating a pedestrian or shooting near public
            if ((eliminatedAny || shotRes.alertedPolice) && gunfireWantedCooldown <= 0) {
              gunfireWantedCooldown = eliminatedAny ? 1.8 : 4.0;
              const dict = getTranslations(settings.language);
              store.incrementWantedLevel(
                eliminatedAny ? dict.hud.pedestrianEliminatedWarning : dict.hud.gunfireWarning,
              );
              policeAI.repositionNearPlayerForChase(
                playerRuntime.position,
                useGameStore.getState().wantedLevel,
                collisionWorld,
              );
            }
          }
        }

        const indoorFloorOffset = findBuildingContainingPoint(
          playerRuntime.position.x,
          playerRuntime.position.z,
          -0.2,
        )
          ? 0.08
          : 0;

        playerRig.root.position.set(
          playerRuntime.position.x,
          playerRuntime.position.y + indoorFloorOffset,
          playerRuntime.position.z,
        );
        playerRig.root.rotation.y = playerRuntime.rotationY;
        playerRig.animate(
          dt,
          playerRuntime.horizontalSpeed,
          playerRuntime.isSprinting,
          playerRuntime.isGrounded,
          store.equippedWeapon,
          arsenal.getActionTimer(),
        );
        }
      }

      const arsenalStep = arsenal.update(dt, collisionWorld, pedestrians.getActiveTargets());
      if (arsenalStep.golfBallHitPedestrians.length > 0) {
        let ballEliminated = false;
        for (const hit of arsenalStep.golfBallHitPedestrians) {
          if (pedestrians.eliminatePedestrian(hit.id, hit.dirX, hit.dirZ)) {
            ballEliminated = true;
          }
        }
        if (ballEliminated) {
          pedestrians.scatterFromSound(playerRuntime.position.x, playerRuntime.position.z, 22);
          if (gunfireWantedCooldown <= 0) {
            gunfireWantedCooldown = 2.0;
            const dict = getTranslations(settings.language);
            store.incrementWantedLevel(dict.hud.pedestrianEliminatedWarning);
            policeAI.repositionNearPlayerForChase(
              playerRuntime.position,
              useGameStore.getState().wantedLevel,
              collisionWorld,
            );
          }
        }
      }

      // Step 10-Car Grand City Street Race
      raceBlockingScratch.length = 0;
      for (let i = 0; i < vehicleStates.length; i++) {
        if (vehicleStates[i].instanceId === activeVehicleInstanceId) continue;
        raceBlockingScratch.push({
          x: vehicleStates[i].position.x,
          z: vehicleStates[i].position.z,
          radius: 1.65,
        });
      }
      const trafficObsForRace = trafficAI.getActiveObstacles();
      for (let i = 0; i < trafficObsForRace.length; i++) {
        raceBlockingScratch.push(trafficObsForRace[i]);
      }

      const playerCarMaxSpd = activeVehicleInstanceId
        ? VEHICLE_CONFIGS[vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId)!.vehicleId].maxSpeed
        : VEHICLE_CONFIGS[store.inventory.selectedVehicle]?.maxSpeed ?? 42;

      const raceStep = streetRace.update(
        dt,
        elapsed,
        headlightsNeeded,
        playerRuntime.position,
        playerCarMaxSpd,
        pedestrians.getActivePositions(),
        raceBlockingScratch,
        collisionWorld,
        (fx, fz, ox, oz, tx, tz, colHex) => emitTeleportOverpass(fx, fz, ox, oz, tx, tz, colHex ?? 0xa855f7),
      );
      latestRaceSnapshot = raceStep.snapshot;

      if (raceStep.justStartedGo || raceStep.justReachedCheckpoint) {
        audioEngine.playNotification();
      }
      if (raceStep.raceCompletedEvent) {
        const dict = getTranslations(settings.language);
        const ev = raceStep.raceCompletedEvent;
        const winnerName = ev.winnerVehicleId ? dict.vehicles[ev.winnerVehicleId].name : 'AI';
        useGameStore
          .getState()
          .completeCityRace(
            ev.playerWon,
            ev.playerRank,
            ev.winnerVehicleId,
            `${dict.race.winTitle} ${dict.race.winDesc}`,
            `${dict.race.loseTitle} — ${dict.race.rank}: ${ev.playerRank}/11 (${dict.race.loseDescPrefix} ${winnerName})`,
          );
        latestRaceSnapshot = useGameStore.getState().raceState;
      }

      // Build moving vehicle threat list so pedestrians proactively dodge oncoming cars & race rivals
      const vehicleThreats: MovingVehicleThreat[] = [
        ...trafficAI.getMovingThreats(),
        ...policeAI.getMovingThreats(),
        ...streetRace.getMovingThreats(),
      ];
      if (activeVehicleInstanceId) {
        const activeVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId)!;
        if (Math.abs(activeVeh.speed) > 1.2) {
          vehicleThreats.push({
            x: activeVeh.position.x,
            z: activeVeh.position.z,
            vx: Math.sin(activeVeh.rotationY) * activeVeh.speed,
            vz: Math.cos(activeVeh.rotationY) * activeVeh.speed,
            speed: activeVeh.speed,
            isPlayer: true,
          });
        }
      }

      // Stationary parked cars so pedestrians teleport cleanly over any car parked on a sidewalk
      pedParkedScratch.length = 0;
      for (let i = 0; i < vehicleStates.length; i++) {
        const vs = vehicleStates[i];
        if (vs.instanceId === activeVehicleInstanceId && Math.abs(vs.speed) > 1.2) continue;
        pedParkedScratch.push({ x: vs.position.x, z: vs.position.z, radius: 1.55 });
      }

      const pedStep = pedestrians.update(
        dt,
        focusPos,
        maxPeds,
        vehicleThreats,
        collisionWorld,
        pedParkedScratch,
        (fx, fz, ox, oz, tx, tz) => emitTeleportOverpass(fx, fz, ox, oz, tx, tz, 0x38bdf8),
      );

      if (pedStep.playerHitPedestrian) {
        hadCarCrash = true;
        if (activeVehicleInstanceId) {
          const activeVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
          if (activeVeh) {
            activeVeh.speed *= 0.62;
            currentSpeedMps = activeVeh.speed;
          }
        }
        const dict = getTranslations(settings.language);
        store.incrementWantedLevel(dict.hud.pedestrianHitWarning);
        const updatedWanted = useGameStore.getState().wantedLevel;
        policeAI.repositionNearPlayerForChase(playerRuntime.position, updatedWanted, collisionWorld);
      }

      const liveWanted = useGameStore.getState().wantedLevel;
      const actorMoveSpeed = activeVehicleInstanceId ? currentSpeedMps : playerRuntime.horizontalSpeed;

      // Police ("Melitsiya") teleport over all parked cars & traffic cars (and calm patrols also teleport over player's car)
      policeBlockingScratch.length = 0;
      for (let i = 0; i < vehicleStates.length; i++) {
        const vs = vehicleStates[i];
        if (liveWanted > 0 && vs.instanceId === activeVehicleInstanceId) continue;
        policeBlockingScratch.push({ x: vs.position.x, z: vs.position.z, radius: 1.65 });
      }
      const trafficObsForPolice = trafficAI.getActiveObstacles();
      for (let i = 0; i < trafficObsForPolice.length; i++) {
        policeBlockingScratch.push(trafficObsForPolice[i]);
      }

      const policeOutcome = policeAI.update(
        dt,
        elapsed,
        liveWanted,
        headlightsNeeded,
        playerRuntime.position,
        actorMoveSpeed,
        Boolean(activeVehicleInstanceId),
        pedestrians.getActivePositions(),
        collisionWorld,
        policeBlockingScratch,
        (fx, fz, ox, oz, tx, tz) => emitTeleportOverpass(fx, fz, ox, oz, tx, tz, 0x3b82f6),
      );

      teleportEffects.update(dt);

      latestEscapeRatio = policeOutcome.escapeRatio;
      latestPoliceSnapshots = policeOutcome.snapshots;

      if (policeOutcome.busted && liveWanted > 0) {
        if (activeVehicleInstanceId) {
          const activeVeh = vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId);
          if (activeVeh) activeVeh.speed = 0;
          currentSpeedMps = 0;
        }
        policeAI.resetPursuitTimers();
        latestEscapeRatio = 0;
        const dict = getTranslations(settings.language);
        store.applyPoliceBustFine(dict.hud.bustedFine);
      } else if (policeOutcome.escaped && liveWanted > 0) {
        policeAI.resetPursuitTimers();
        latestEscapeRatio = 0;
        const dict = getTranslations(settings.language);
        store.clearWantedOnEscape(dict.hud.escapedPolice);
      }

      audioEngine.updateSiren(
        useGameStore.getState().wantedLevel,
        policeOutcome.closestDist,
        elapsed,
        false,
      );

      vehicleJobs.update(dt);

      // Military Police HQ Compound Shoot-on-sight sentry guards & intrusion alert
      const hqStatus = policeHQCompound.update(dt, elapsed, playerRuntime.position);
      latestHQStatus = hqStatus;
      if (hqStatus.isPlayerInHQ) {
        if (useGameStore.getState().wantedLevel < 4) {
          const dict = getTranslations(settings.language);
          store.incrementWantedLevel(dict.hud.policeHqIntrusionWarning || "DIQQAT: HARBIY MILITSIYA BOSH BOSH QARMASI!");
          useGameStore.setState({ wantedLevel: 4 });
          policeAI.repositionNearPlayerForChase(playerRuntime.position, 4, collisionWorld);
        }
        if (hqStatus.policeFiringNow) {
          audioEngine.vibrate(28, settings.vibrationEnabled);
        }
      }

      // 4 Viltrumites ("Vilteroytlar" Bosses)
      const viltrumiteOutcome = viltrumiteSystem.update(dt, elapsed, playerRuntime.position);
      latestNearBoss = viltrumiteOutcome.activeNearBoss;
      if (latestNearBoss && latestNearBoss.isFiringLaser) {
        audioEngine.vibrate(36, settings.vibrationEnabled);
      }

      // 3D Vehicle Combat Projectiles, Bombs & Explosions
      const combatOutcome = vehicleCombatSystem.update(
        dt,
        collisionWorld,
        viltrumiteSystem.getAllBosses(),
        (bossId, dmg) => {
          viltrumiteSystem.damageBoss(bossId, dmg);
        },
        (blastX, blastZ, blastRadius) => {
          pedestrians.scatterFromSound(blastX, blastZ, blastRadius * 2.5);
          policeAI.repositionNearPlayerForChase(
            playerRuntime.position,
            Math.max(2, useGameStore.getState().wantedLevel),
            collisionWorld,
          );
        },
      );
      if (combatOutcome.screenShakeAmount > 0.05) {
        cameraController.rotate(
          (Math.random() - 0.5) * combatOutcome.screenShakeAmount * 6,
          (Math.random() - 0.5) * combatOutcome.screenShakeAmount * 4,
          0.05,
        );
      }

      // Step Active Bank / Museum / Shop Heist Cracking & 3D Vault/Display Animations
      if (activeHeistBuildingId) {
        if (activeVehicleInstanceId || currentIndoorVenue?.id !== activeHeistBuildingId) {
          activeHeistBuildingId = null;
          activeHeistElapsedSec = 0;
          useGameStore.getState().setHeistProgress(null, 0);
        } else {
          const targetCfg = getHeistTarget(activeHeistBuildingId);
          if (!targetCfg) {
            activeHeistBuildingId = null;
            activeHeistElapsedSec = 0;
            useGameStore.getState().setHeistProgress(null, 0);
          } else {
            activeHeistElapsedSec += dt;
            const ratio = Math.min(1, activeHeistElapsedSec / targetCfg.durationSeconds);
            if (ratio >= 1) {
              const completedId = activeHeistBuildingId;
              activeHeistBuildingId = null;
              activeHeistElapsedSec = 0;
              const cooldownUntil = Date.now() + HEIST_COOLDOWN_SECONDS * 1000;
              const bld = ENTERABLE_BUILDINGS.find((b) => b.id === completedId);
              const dict = getTranslations(settings.language);
              const venueLabel = bld ? resolveNestedKey(dict, bld.nameKey) : completedId;
              const hasCoopFriends = useGameStore.getState().coop.peers.length > 0;
              const prefix = hasCoopFriends
                ? dict.heist.completedCoopPrefix
                : dict.heist.completedSoloPrefix;
              const toastMsg = `${prefix} ${venueLabel} (+${formatNCoins(targetCfg.rewardCoins)} N-Coin)`;
              audioEngine.playNotification();
              useGameStore
                .getState()
                .completeHeistReward(
                  completedId,
                  targetCfg.rewardCoins,
                  cooldownUntil,
                  targetCfg.wantedStars,
                  toastMsg,
                );
              policeAI.repositionNearPlayerForChase(
                playerRuntime.position,
                useGameStore.getState().wantedLevel,
                collisionWorld,
              );
              coopClient.sendHeistComplete(completedId, targetCfg.rewardCoins);
            } else {
              useGameStore.getState().setHeistProgress(activeHeistBuildingId, ratio);
            }
          }
        }
      }

      const liveHeistState = useGameStore.getState().heist;
      const crackingCfg = activeHeistBuildingId ? getHeistTarget(activeHeistBuildingId) : null;
      const crackingRatio =
        activeHeistBuildingId && crackingCfg
          ? Math.min(1, activeHeistElapsedSec / crackingCfg.durationSeconds)
          : 0;
      heistSystem.update(
        dt,
        elapsed,
        activeHeistBuildingId,
        crackingRatio,
        liveHeistState.robbedUntilByBuilding,
        Date.now(),
      );
      playerLootBag.visible = liveHeistState.carryingLootUntil > Date.now();

      for (const vs of vehicleStates) {
        if (vs.instanceId === activeVehicleInstanceId) continue;
        const hydroGoal = vehicleHydraulicsTarget.get(vs.instanceId) ?? 0;
        vs.workAnimPhase = THREE.MathUtils.damp(vs.workAnimPhase ?? 0, hydroGoal, 3.0, dt);
        const rig = vehicleRigs.get(vs.instanceId);
        if (rig) {
          rig.root.position.set(vs.position.x, 0, vs.position.z);
          rig.root.rotation.y = vs.rotationY;
          rig.updateVisuals(vs.wheelSpin, 0, false, false, 0, 0, vs.workAnimPhase);
        }
      }

      if (store.activeMissionId) {
        const outcome = evaluateActiveMission(store.activeMissionId, store.missions, {
          dt,
          playerPosition: playerRuntime.position,
          inVehicle: Boolean(activeVehicleInstanceId),
          vehicleSpeed: currentSpeedMps,
          frameDrivenMeters,
          hadVehicleCollision: hadCarCrash,
        });
        if (outcome.updatedProgress) {
          const dict = getTranslations(settings.language);
          store.applyMissionTickOutcome(
            outcome.updatedProgress,
            outcome.unlockedIds,
            outcome.completedMissionId,
            outcome.failedReason,
            {
              completed: dict.missions.messages.completed,
              timeout: dict.missions.messages.failedTimeout,
              crash: dict.missions.messages.failedCrash,
            },
          );
        }
      }

      const isRidingMetroNow = metroSystem.isRiding();
      const activeDrivenVehObj = activeVehicleInstanceId
        ? vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId) ?? null
        : null;
      const activeActorPos = activeDrivenVehObj ? activeDrivenVehObj.position : playerRuntime.position;

      const indoorBldForCam =
        !activeVehicleInstanceId && !isRidingMetroNow
          ? findBuildingContainingPoint(playerRuntime.position.x, playerRuntime.position.z, -0.25)
          : null;

      cameraController.updateGameplay(
        camera,
        activeActorPos,
        playerRuntime.rotationY,
        Boolean(activeVehicleInstanceId || isRidingMetroNow),
        currentSpeedMps,
        store.cameraMode,
        settings.cameraDistance,
        settings.cameraFov,
        collisionWorld,
        dt,
        indoorBldForCam ? indoorBldForCam.ceilingHeight : null,
        activeDrivenVehObj ? VEHICLE_CONFIGS[activeDrivenVehObj.vehicleId].bodyStyle : null,
      );

      // Periodic passive dividend payout every 10 seconds for owned city enterprises
      enterpriseDividendAccumSec += dt;
      if (enterpriseDividendAccumSec >= 10) {
        enterpriseDividendAccumSec -= 10;
        const earned = useGameStore.getState().collectEnterpriseDividendTick();
        if (earned > 0) {
          enterpriseDividendToastStep++;
          const latestState = useGameStore.getState();
          if (!latestState.toast && enterpriseDividendToastStep % 3 === 1) {
            const dict = getTranslations(settings.language);
            latestState.showToast(
              `${dict.enterprises.dividendToastPrefix} +${formatNCoins(earned)} N-Coin`,
              'success',
            );
          }
        }
      }

      // Periodic silent auto-save every 12 seconds so parked cars & progress are never lost
      autoSaveAccumSec += dt;
      if (autoSaveAccumSec >= 12) {
        autoSaveAccumSec = 0;
        useGameStore.getState().saveCurrentProgress();
      }

      const inCinemaNow = indoorBldForCam?.category === 'cinema';
      const realVideoAudioActive =
        inCinemaNow && enterableBuildings.isCinemaPlayingRealAudio(indoorBldForCam!.id);
      const cinemaMovieIdx = inCinemaNow ? enterableBuildings.getCinemaMovieIndex(indoorBldForCam!.id) : 0;
      audioEngine.updateCinemaAudio(
        inCinemaNow && !realVideoAudioActive,
        cinemaMovieIdx,
        elapsed,
        false,
      );
    } else {
      audioEngine.updateSiren(useGameStore.getState().wantedLevel, 999, elapsed, true);
      audioEngine.updateCinemaAudio(false, 0, elapsed, true);
    }

    const activeVehCfg = activeVehicleInstanceId
      ? VEHICLE_CONFIGS[vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId)!.vehicleId]
      : VEHICLE_CONFIGS.sedan;
    audioEngine.updateEngine(Boolean(activeVehicleInstanceId), currentSpeedMps, activeVehCfg.maxSpeed, isPaused);

    cityEnv.updateMarkers(elapsed, store.missions, store.activeMissionId, store.customWaypoint);

    let navTarget = store.customWaypoint;
    const raceCpTarget = streetRace.getCurrentCheckpointTarget();
    if (raceCpTarget) {
      navTarget = raceCpTarget;
    } else if (store.activeMissionId) {
      const def = MISSION_DEFINITIONS.find((m) => m.id === store.activeMissionId);
      const prog = store.missions[store.activeMissionId];
      const cp = def && prog ? def.checkpoints[prog.currentStep] : undefined;
      if (cp) navTarget = cp.position;
    }

    if (navTarget) {
      const key = `${Math.round(playerRuntime.position.x / 4)},${Math.round(playerRuntime.position.z / 4)}->${Math.round(navTarget.x)},${Math.round(navTarget.z)}`;
      if (key !== lastRouteKey) {
        lastRouteKey = key;
        const pts = computeNavigationRoute(playerRuntime.position, navTarget).map(
          (p) => new THREE.Vector3(p.x, 0.22, p.z),
        );
        routeLine.geometry.dispose();
        routeLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      }
      routeLine.visible = true;
    } else {
      routeLine.visible = false;
      lastRouteKey = '';
    }

    const latestStoreForCoop = useGameStore.getState();
    remotePlayers.update(dt, latestStoreForCoop.coop.peers, headlightsNeeded);
    if (latestStoreForCoop.coop.mode !== 'solo') {
      const drivenVehSync = activeVehicleInstanceId
        ? vehicleStates.find((v) => v.instanceId === activeVehicleInstanceId) ?? null
        : null;
      const syncIndoorBld =
        !activeVehicleInstanceId && !metroSystem.isRiding()
          ? findBuildingContainingPoint(playerRuntime.position.x, playerRuntime.position.z, -0.25)
          : null;
      coopClient.sendLocalUpdate({
        x: drivenVehSync ? drivenVehSync.position.x : playerRuntime.position.x,
        y: drivenVehSync ? 0 : playerRuntime.position.y,
        z: drivenVehSync ? drivenVehSync.position.z : playerRuntime.position.z,
        rotY: drivenVehSync ? drivenVehSync.rotationY : playerRuntime.rotationY,
        speed: drivenVehSync ? drivenVehSync.speed : playerRuntime.horizontalSpeed,
        sprinting: playerRuntime.isSprinting,
        weapon: latestStoreForCoop.equippedWeapon,
        firedNow: frameWeaponFiredNow,
        inVehicle: Boolean(drivenVehSync),
        vehicleId: drivenVehSync ? drivenVehSync.vehicleId : null,
        vehicleColor: drivenVehSync ? drivenVehSync.color : '#3b82f6',
        vehicleTuning: drivenVehSync ? drivenVehSync.tuning : undefined,
        steerAngle: drivenVehSync ? drivenVehSync.steerAngle : 0,
        wheelSpin: drivenVehSync ? drivenVehSync.wheelSpin : 0,
        headlightsOn: headlightsNeeded,
        braking: drivenVehSync ? drivenVehSync.braking : false,
        workAnimPhase: drivenVehSync ? drivenVehSync.workAnimPhase ?? 0 : 0,
        carryingLoot: latestStoreForCoop.heist.carryingLootUntil > Date.now(),
        currentBuildingId: syncIndoorBld ? syncIndoorBld.id : null,
      });
    }

    weather.update(dt, store.world.weather, playerRuntime.position, roads.asphaltMaterial, roads.intersectionMaterial);
    renderer.render(scene, camera);

    const sampledFps = fpsMonitor.tick(nowMs);
    telemetryAccumSec += dt;

    if (telemetryAccumSec >= 0.05) {
      const nearest = findNearestInteractable(
        playerRuntime.position.x,
        playerRuntime.position.y,
        playerRuntime.position.z,
        activeVehicleInstanceId,
      );
      const activeIndoorBld =
        !activeVehicleInstanceId && !metroSystem.isRiding()
          ? findBuildingContainingPoint(playerRuntime.position.x, playerRuntime.position.z, -0.25)
          : null;
      store.syncTelemetryFromEngine({
        playerPos: { ...playerRuntime.position },
        playerRotY: playerRuntime.rotationY,
        inVehicleId: activeVehicleInstanceId,
        district: detectDistrict(playerRuntime.position.x, playerRuntime.position.z),
        speedKmh: Math.round(Math.abs(currentSpeedMps) * 3.6),
        walkedDelta: isPaused ? 0 : accumWalked,
        drivenDelta: isPaused ? 0 : accumDriven,
        dtSeconds: isPaused ? 0 : telemetryAccumSec,
        timeHours: currentHours,
        nearestInteractable: nearest,
        vehiclesSnapshot: vehicleStates.map((v) => ({ ...v, position: { ...v.position } })),
        escapeRatio: latestEscapeRatio,
        policeUnits: latestPoliceSnapshots,
        raceState: latestRaceSnapshot,
        metroRide: latestMetroRide,
        currentBuildingId: activeIndoorBld ? activeIndoorBld.id : null,
        activeCinemaMovieIndex:
          activeIndoorBld?.category === 'cinema'
            ? enterableBuildings.getCinemaMovieIndex(activeIndoorBld.id)
            : 0,
        fps: sampledFps ?? undefined,
        spiderWebTarget: spiderWebSystem.aimTarget
          ? {
              distance: Math.round(spiderWebSystem.aimTarget.distance * 10) / 10,
              label: spiderWebSystem.aimTarget.label,
            }
          : null,
        activeViltrumiteBoss: latestNearBoss
          ? {
              name: latestNearBoss.name,
              hp: latestNearBoss.hp,
              maxHp: latestNearBoss.maxHp,
              location: latestNearBoss.locationTitle,
            }
          : null,
        isInsidePoliceHQ: latestHQStatus?.isPlayerInHQ ?? false,
      });
      telemetryAccumSec = 0;
      accumWalked = 0;
      accumDriven = 0;
    }
  });

  return {
    cameraController,
    resize: (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    },
    dispose: () => {
      loopHandle.stop();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      vehicleJobs.dispose();
      vehicleCombatSystem.dispose();
      remotePlayers.dispose();
      enterableBuildings.dispose();
      lighting.dispose();
      textures.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
