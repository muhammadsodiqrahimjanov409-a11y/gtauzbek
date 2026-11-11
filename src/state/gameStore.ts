import { create } from 'zustand';
import type {
  ActiveHeistState,
  ActiveModal,
  CameraMode,
  CargoLoadId,
  CoopChatItem,
  CoopPeerSnapshot,
  CoopSessionState,
  DistrictId,
  EconomyState,
  InteractablePoint,
  InventoryItem,
  InventoryState,
  MetroRideState,
  MissionProgress,
  PlayerState,
  PoliceUnitSnapshot,
  RaceStateSnapshot,
  SavedVehiclePlacement,
  SaveState,
  TimeOfDayPreset,
  Vec3,
  VehicleCustomTuning,
  VehicleId,
  VehicleInstanceState,
  WeaponId,
  WeatherMode,
  WorldState,
} from '../types/game';
import {
  ALL_CARGO_LOADS,
  ALL_VEHICLE_IDS,
  ALL_WEAPON_IDS,
  CITY_RACE_CHECKPOINTS,
  DEALERSHIP_SPAWN_POS,
  ECONOMY_CONFIG,
  findNearestMetroStation,
  getDefaultVehicleTuning,
  METRO_STATIONS,
  PLAYER_START_POS,
  STARTER_UNLOCKED_VEHICLES,
  VEHICLE_CONFIGS,
  WORLD_PLAYABLE_LIMIT,
} from '../game/gameConfig';
import { createInitialMissionProgress, getMissionDefinition } from '../missions/missionDefinitions';
import { startOrRetryMission } from '../missions/MissionManager';
import {
  computeEnterpriseIncomePerTick,
  creditCityRaceReward,
  creditMissionReward,
  purchaseEnterpriseTransaction,
  purchaseVehicleTransaction,
} from '../economy/EconomyManager';
import { clearSavedGame, hasSavedGame, loadSavedGame, writeSavedGame } from '../persistence/saveGame';
import { CURRENT_SAVE_VERSION } from '../persistence/saveValidation';
import { useSettingsStore } from './settingsStore';
import { audioEngine } from '../utils/audio';

export interface TouchInputVector {
  moveX: number;
  moveY: number;
  sprint: boolean;
  jump: boolean;
  fire: boolean;
  gas: boolean;
  brake: boolean;
  reverse: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
}

export const touchInputRef: TouchInputVector = {
  moveX: 0,
  moveY: 0,
  sprint: false,
  jump: false,
  fire: false,
  gas: false,
  brake: false,
  reverse: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
};

export interface PendingEngineCommand {
  teleportPlayer?: Vec3;
  spawnOrSelectVehicle?: { vehicleId: VehicleId; nearPlayer: boolean };
  syncVehiclesFromStore?: boolean;
  applyLiveVehicleCosmetics?: boolean;
  toggleVehicleHydraulics?: boolean;
  resetCurrentVehicle?: boolean;
  toggleEnterExitVehicle?: boolean;
  triggerInteract?: boolean;
  startStreetRace?: boolean;
  stopStreetRace?: boolean;
  startMetroRide?: { fromStationId: string; toStationId: string };
  toggleBoardMetro?: boolean;
  setMetroStopWhileRiding?: string;
  skipMetroRide?: boolean;
  selectCinemaMovieIndex?: number;
  loadCustomCinemaVideo?: { url: string; fileName: string };
  toggleCinemaPlayPause?: boolean;
  triggerStartHeist?: boolean;
  teleportToFriend?: Vec3;
  triggerSpiderWebZip?: boolean;
  triggerTankCannon?: boolean;
  triggerAirplaneGun?: boolean;
  triggerAirplaneBomb?: boolean;
}

export const engineCommandRef: PendingEngineCommand = {};

function createInitialCoopState(): CoopSessionState {
  const savedPlayerId = (() => {
    try {
      const existing = window.sessionStorage.getItem('nexus_coop_pid');
      if (existing) return existing;
      const fresh = `p_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem('nexus_coop_pid', fresh);
      return fresh;
    } catch {
      return `p_${Math.random().toString(36).slice(2, 10)}`;
    }
  })();

  return {
    status: 'offline',
    mode: 'solo',
    playerId: savedPlayerId,
    playerName: '',
    hostCode: '01072015',
    joinCode: '01072016',
    peerCount: 1,
    peers: [],
    messages: [],
  };
}

function createInitialHeistState(): ActiveHeistState {
  return {
    activeBuildingId: null,
    progress: 0,
    robbedUntilByBuilding: {},
    carryingLootUntil: 0,
  };
}

function createIdleMetroRide(): MetroRideState {
  return {
    active: false,
    fromStationId: null,
    toStationId: null,
    progress: 0,
  };
}

function createIdleRaceState(): RaceStateSnapshot {
  return {
    status: 'idle',
    countdown: 0,
    elapsedSeconds: 0,
    playerRank: 11,
    totalRacers: 11,
    checkpointIndex: 0,
    totalCheckpoints: CITY_RACE_CHECKPOINTS.length,
    playerWon: false,
    winnerVehicleId: null,
    rivals: [],
  };
}

function createStarterItems(): InventoryItem[] {
  const now = Date.now();
  return [
    {
      id: 'vip_black_card',
      category: 'cosmetic',
      titleKey: 'profile.items.vip_black_card',
      descKey: 'profile.items.vip_black_card_desc',
      acquiredAt: now,
    },
    {
      id: 'safehouse_deed',
      category: 'property',
      titleKey: 'profile.items.safehouse_deed',
      descKey: 'profile.items.safehouse_deed_desc',
      acquiredAt: now,
    },
    {
      id: 'sedan_key',
      category: 'key',
      titleKey: 'profile.items.sedan_key',
      descKey: 'profile.items.sedan_key_desc',
      acquiredAt: now,
    },
  ];
}

function createDefaultVehicleColors(): Record<VehicleId, string> {
  const map = {} as Record<VehicleId, string>;
  for (const vid of ALL_VEHICLE_IDS) {
    map[vid] = VEHICLE_CONFIGS[vid].defaultColor;
  }
  return map;
}

function createDefaultVehicleTuningMap(): Partial<Record<VehicleId, VehicleCustomTuning>> {
  const map: Partial<Record<VehicleId, VehicleCustomTuning>> = {};
  for (const vid of ALL_VEHICLE_IDS) {
    map[vid] = getDefaultVehicleTuning(vid);
  }
  return map;
}

function createInitialVehicles(
  colors?: Record<VehicleId, string>,
  placements?: Record<string, SavedVehiclePlacement>,
  tuningMap?: Partial<Record<VehicleId, VehicleCustomTuning>>,
): VehicleInstanceState[] {
  return ALL_VEHICLE_IDS.map((id) => {
    const cfg = VEHICLE_CONFIGS[id];
    const savedSpot = placements?.[id];
    return {
      instanceId: `veh_${id}`,
      vehicleId: id,
      position: savedSpot ? { x: savedSpot.x, y: 0, z: savedSpot.z } : { ...cfg.spawnPosition },
      rotationY: savedSpot ? savedSpot.rotationY : cfg.spawnRotationY,
      speed: 0,
      steerAngle: 0,
      wheelSpin: 0,
      color: colors?.[id] ?? cfg.defaultColor,
      tuning: tuningMap?.[id] ?? getDefaultVehicleTuning(id),
      workAnimPhase: 0,
      headlightsOn: false,
      braking: false,
    };
  });
}

function createFreshPlayer(): PlayerState {
  return {
    position: { ...PLAYER_START_POS },
    rotationY: Math.PI,
    velocityY: 0,
    isGrounded: true,
    isMoving: false,
    isSprinting: false,
    inVehicleInstanceId: null,
    level: 1,
    xp: 0,
    distanceWalked: 0,
    distanceDriven: 0,
    playTimeSeconds: 0,
    currentDistrict: 'residential',
  };
}

function createFreshWorld(): WorldState {
  return {
    timeHours: 10.2,
    autoTimeCycle: true,
    timePreset: 'day',
    weather: 'sunny',
    trafficCount: 16,
  };
}

function ensureVipCardInItems(items: InventoryItem[]): InventoryItem[] {
  if (items.some((i) => i.id === 'vip_black_card')) return items;
  return [
    {
      id: 'vip_black_card',
      category: 'cosmetic',
      titleKey: 'profile.items.vip_black_card',
      descKey: 'profile.items.vip_black_card_desc',
      acquiredAt: Date.now(),
    },
    ...items,
  ];
}

function ensureStarterBigVehicles(owned: VehicleId[]): VehicleId[] {
  const merged = [...owned];
  for (const vid of STARTER_UNLOCKED_VEHICLES) {
    if (!merged.includes(vid)) {
      merged.push(vid);
    }
  }
  return merged;
}

const LEGACY_HEAVY_SPAWNS: Partial<Record<VehicleId, Array<{ x: number; z: number }>>> = {
  fura: [
    { x: 102, z: 88 },
    { x: -66, z: 149.8 },
  ],
  kamaz: [
    { x: 162, z: -26 },
    { x: -86, z: 149.8 },
  ],
  excavator: [
    { x: -214, z: -42 },
    { x: -46, z: 149.8 },
  ],
  zil: [
    { x: -98, z: 162 },
    { x: -104, z: 149.8 },
  ],
  sedan: [
    { x: -48, z: 156 },
    { x: -55, z: 160.5 },
  ],
  compact: [
    { x: -82, z: 156 },
    { x: -118, z: 156 },
  ],
};

function migrateLegacyHeavyPlacements(
  placements?: Record<string, SavedVehiclePlacement>,
): Record<string, SavedVehiclePlacement> | undefined {
  if (!placements) return undefined;
  const next: Record<string, SavedVehiclePlacement> = { ...placements };
  for (const [vid, oldSpots] of Object.entries(LEGACY_HEAVY_SPAWNS) as Array<
    [VehicleId, Array<{ x: number; z: number }>]
  >) {
    const saved = next[vid];
    if (saved && oldSpots.some((spot) => Math.hypot(saved.x - spot.x, saved.z - spot.z) < 4.5)) {
      delete next[vid]; // Use new front-plaza spawnPosition from VEHICLE_CONFIGS
    }
  }
  return next;
}

function hydrateBootState() {
  const { state: loaded } = loadSavedGame();
  if (!loaded) {
    const freshMissions = createInitialMissionProgress();
    freshMissions.first_steps.status = 'active';
    const colors = createDefaultVehicleColors();
    const tuningMap = createDefaultVehicleTuningMap();
    return {
      saveAvailable: false,
      player: createFreshPlayer(),
      vehicles: createInitialVehicles(colors, undefined, tuningMap),
      economy: {
        coins: ECONOMY_CONFIG.startingCoins,
        vip: true,
        rewardedMissionIds: [],
      } as EconomyState,
      inventory: {
        ownedVehicles: [...STARTER_UNLOCKED_VEHICLES] as VehicleId[],
        selectedVehicle: 'sedan' as VehicleId,
        vehicleColors: colors,
        vehicleTuning: tuningMap,
        ownedProperties: ['safehouse_starter'],
        items: createStarterItems(),
      } as InventoryState,
      equippedWeapon: 'pistol' as WeaponId,
      missions: freshMissions,
      activeMissionId: 'first_steps' as string | null,
      world: createFreshWorld(),
    };
  }

  // Preserve exact saved N-Coin balance if already VIP, while keeping player Level & XP strictly intact!
  const vipCoins = loaded.economy.vip
    ? Math.max(0, loaded.economy.coins)
    : Math.max(loaded.economy.coins, ECONOMY_CONFIG.startingCoins);
  const mergedTuning = { ...createDefaultVehicleTuningMap(), ...loaded.inventory.vehicleTuning };

  const migratedPlacements = migrateLegacyHeavyPlacements(loaded.vehiclePlacements);

  return {
    saveAvailable: true,
    player: {
      ...createFreshPlayer(),
      position: { ...loaded.player.position },
      rotationY: loaded.player.rotationY,
      level: loaded.player.level,
      xp: loaded.player.xp,
      distanceWalked: loaded.player.distanceWalked,
      distanceDriven: loaded.player.distanceDriven,
      playTimeSeconds: loaded.player.playTimeSeconds,
    },
    vehicles: createInitialVehicles(loaded.inventory.vehicleColors, migratedPlacements, mergedTuning),
    economy: {
      coins: vipCoins,
      vip: true,
      rewardedMissionIds: loaded.economy.rewardedMissionIds,
    } as EconomyState,
    inventory: {
      ...loaded.inventory,
      ownedVehicles: ensureStarterBigVehicles(loaded.inventory.ownedVehicles),
      vehicleTuning: mergedTuning,
      items: ensureVipCardInItems(loaded.inventory.items),
    },
    equippedWeapon: loaded.equippedWeapon ?? ('pistol' as WeaponId),
    missions: loaded.missions,
    activeMissionId: loaded.activeMissionId,
    world: loaded.world,
  };
}

export interface ToastNotice {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'warning';
}

interface GameStore {
  gameStarted: boolean;
  saveAvailable: boolean;
  activeModal: ActiveModal;
  garageInitialFilter: 'all' | 'heavy_machinery';
  dockCollapsed: boolean;
  cameraMode: CameraMode;
  fps: number;
  speedKmh: number;

  player: PlayerState;
  vehicles: VehicleInstanceState[];
  economy: EconomyState;
  inventory: InventoryState;
  equippedWeapon: WeaponId;
  currentBuildingId: string | null;
  activeCinemaMovieIndex: number;
  cinemaCustomVideoName: string | null;
  cinemaPaused: boolean;
  selectedEnterpriseId: string | null;
  selectedMetroStationId: string | null;
  metroRide: MetroRideState;
  missions: Record<string, MissionProgress>;
  activeMissionId: string | null;
  world: WorldState;

  nearestInteractable: InteractablePoint | null;
  customWaypoint: Vec3 | null;
  wantedLevel: number;
  escapeRatio: number;
  policeUnits: PoliceUnitSnapshot[];
  raceState: RaceStateSnapshot;
  coop: CoopSessionState;
  heist: ActiveHeistState;
  entryPromptAnswered: boolean;
  toast: ToastNotice | null;
  spiderWebTarget: { distance: number; label: string } | null;
  activeViltrumiteBoss: { name: string; hp: number; maxHp: number; location: string } | null;
  isInsidePoliceHQ: boolean;

  // Actions
  triggerSpiderWebZip: () => void;
  triggerTankCannon: () => void;
  triggerAirplaneGun: () => void;
  triggerAirplaneBomb: () => void;
  setEntryPromptAnswered: (answered: boolean) => void;
  setCoopPatch: (patch: Partial<CoopSessionState>) => void;
  upsertCoopPeer: (peer: CoopPeerSnapshot, peerCount?: number) => void;
  removeCoopPeer: (playerId: string, peerCount?: number) => void;
  appendCoopMessage: (msg: CoopChatItem) => void;
  teleportToCoopFriend: (friendId?: string, toastMsg?: string) => boolean;

  requestStartHeist: () => void;
  setHeistProgress: (activeBuildingId: string | null, progress: number) => void;
  syncRobbedVenuesFromServer: (records: Array<{ buildingId: string; robbedUntil: number }>) => void;
  completeHeistReward: (
    buildingId: string,
    rewardCoins: number,
    robbedUntil: number,
    wantedStars: number,
    toastMsg?: string,
  ) => boolean;
  playOrContinue: (corruptedMsg: string, noSaveMsg: string) => void;
  startNewGame: () => void;
  continueSavedGame: (corruptedMsg: string, noSaveMsg: string) => void;
  returnToMainMenu: () => void;
  setActiveModal: (modal: ActiveModal) => void;
  toggleDock: () => void;
  cycleCameraMode: () => void;

  setEquippedWeapon: (weapon: WeaponId) => void;
  cycleWeapon: () => void;
  topUpVipCoins: (toastMsg?: string) => void;

  startCityRace: (startedToast?: string) => void;
  stopCityRace: () => void;
  completeCityRace: (
    playerWon: boolean,
    playerRank: number,
    winnerVehicleId: VehicleId | null,
    winMsg: string,
    loseMsg: string,
  ) => void;

  setTimePreset: (preset: TimeOfDayPreset, auto?: boolean) => void;
  setExactTimeHours: (hours: number, auto?: boolean) => void;
  setWeather: (weather: WeatherMode) => void;
  setTrafficCount: (count: number) => void;

  startMission: (missionId: string, startedLabel?: string) => void;
  abortActiveMission: () => void;
  applyMissionTickOutcome: (
    updated?: MissionProgress,
    unlockedIds?: string[],
    completedId?: string,
    failedReason?: 'timeout' | 'crash',
    messages?: { completed: string; timeout: string; crash: string },
  ) => void;

  openGarageModal: (initialFilter?: 'all' | 'heavy_machinery') => void;
  unlockVehicleImmediate: (vehicleId: VehicleId) => void;
  buyVehicle: (vehicleId: VehicleId) => { ok: boolean; reason?: string };
  selectAndSpawnVehicle: (vehicleId: VehicleId, nearPlayer?: boolean) => void;
  setVehiclePaint: (vehicleId: VehicleId, color: string) => void;
  setVehicleTuning: (vehicleId: VehicleId, patch: Partial<VehicleCustomTuning>) => void;
  cycleVehicleCargo: (vehicleId: VehicleId) => CargoLoadId;
  triggerVehicleHydraulics: () => void;
  creditVehicleJobReward: (amount: number) => void;

  selectCinemaMovie: (index: number, toastMsg?: string) => void;
  uploadCustomCinemaVideo: (url: string, fileName: string, toastMsg?: string) => void;
  toggleCinemaPlayPause: () => void;

  openEnterprisesModal: (focusEnterpriseId?: string | null) => void;
  buyEnterprise: (enterpriseId: string) => { ok: boolean; reason?: string };
  collectEnterpriseDividendTick: () => number;

  openMetroModal: (focusStationId?: string | null) => void;
  requestMetroRide: (toStationId: string, fromStationId?: string | null, departToast?: string) => boolean;
  boardOrExitMetro: () => void;
  selectMetroStopWhileRiding: (toStationId: string) => void;
  skipActiveMetroRide: () => void;

  incrementWantedLevel: (warningMsg: string) => void;
  clearWantedOnEscape: (escapedMsg?: string) => void;
  applyPoliceBustFine: (finePrefixMsg: string) => void;

  setCustomWaypoint: (pt: Vec3 | null) => void;
  showToast: (text: string, tone?: ToastNotice['tone']) => void;

  syncTelemetryFromEngine: (patch: {
    playerPos: Vec3;
    playerRotY: number;
    inVehicleId: string | null;
    district: DistrictId;
    speedKmh: number;
    walkedDelta: number;
    drivenDelta: number;
    dtSeconds: number;
    timeHours: number;
    nearestInteractable: InteractablePoint | null;
    vehiclesSnapshot: VehicleInstanceState[];
    escapeRatio?: number;
    policeUnits?: PoliceUnitSnapshot[];
    raceState?: RaceStateSnapshot;
    metroRide?: MetroRideState;
    currentBuildingId?: string | null;
    activeCinemaMovieIndex?: number;
    fps?: number;
    spiderWebTarget?: { distance: number; label: string } | null;
    activeViltrumiteBoss?: { name: string; hp: number; maxHp: number; location: string } | null;
    isInsidePoliceHQ?: boolean;
  }) => void;

  saveCurrentProgress: (successMsg?: string, errorMsg?: string) => boolean;
  resetAllProgress: () => void;
}

const initialBoot = hydrateBootState();

export const useGameStore = create<GameStore>((set, get) => ({
  gameStarted: false,
  saveAvailable: initialBoot.saveAvailable,
  activeModal: 'none',
  garageInitialFilter: 'all',
  dockCollapsed: false,
  cameraMode: 'third_person',
  fps: 60,
  speedKmh: 0,

  player: initialBoot.player,
  vehicles: initialBoot.vehicles,
  economy: initialBoot.economy,
  inventory: initialBoot.inventory,
  equippedWeapon: initialBoot.equippedWeapon,
  currentBuildingId: null,
  activeCinemaMovieIndex: 0,
  cinemaCustomVideoName: null,
  cinemaPaused: false,
  selectedEnterpriseId: null,
  selectedMetroStationId: null,
  metroRide: createIdleMetroRide(),
  missions: initialBoot.missions,
  activeMissionId: initialBoot.activeMissionId,
  world: initialBoot.world,

  nearestInteractable: null,
  customWaypoint: null,
  wantedLevel: 0,
  escapeRatio: 0,
  policeUnits: [],
  raceState: createIdleRaceState(),
  coop: createInitialCoopState(),
  heist: createInitialHeistState(),
  entryPromptAnswered: false,
  toast: null,
  spiderWebTarget: null,
  activeViltrumiteBoss: null,
  isInsidePoliceHQ: false,

  triggerSpiderWebZip: () => {
    engineCommandRef.triggerSpiderWebZip = true;
  },
  triggerTankCannon: () => {
    engineCommandRef.triggerTankCannon = true;
  },
  triggerAirplaneGun: () => {
    engineCommandRef.triggerAirplaneGun = true;
  },
  triggerAirplaneBomb: () => {
    engineCommandRef.triggerAirplaneBomb = true;
  },

  setEntryPromptAnswered: (answered) => {
    set({ entryPromptAnswered: answered });
  },

  setCoopPatch: (patch) => {
    set((s) => ({
      coop: {
        ...s.coop,
        ...patch,
      },
    }));
  },

  upsertCoopPeer: (peer, peerCount) => {
    set((s) => {
      if (peer.playerId === s.coop.playerId) return s;
      const idx = s.coop.peers.findIndex((p) => p.playerId === peer.playerId);
      const nextPeers =
        idx >= 0
          ? s.coop.peers.map((p, i) => (i === idx ? peer : p))
          : [...s.coop.peers, peer];
      return {
        coop: {
          ...s.coop,
          peers: nextPeers,
          peerCount: peerCount ?? nextPeers.length + 1,
        },
      };
    });
  },

  removeCoopPeer: (playerId, peerCount) => {
    set((s) => {
      const nextPeers = s.coop.peers.filter((p) => p.playerId !== playerId);
      return {
        coop: {
          ...s.coop,
          peers: nextPeers,
          peerCount: peerCount ?? nextPeers.length + 1,
        },
      };
    });
  },

  appendCoopMessage: (msg) => {
    set((s) => {
      if (s.coop.messages.some((m) => m.id === msg.id)) return s;
      const nextMsgs = [...s.coop.messages, msg].slice(-20);
      return {
        coop: {
          ...s.coop,
          messages: nextMsgs,
        },
      };
    });
  },

  teleportToCoopFriend: (friendId, toastMsg) => {
    const s = get();
    const target = friendId
      ? s.coop.peers.find((p) => p.playerId === friendId)
      : s.coop.peers[0];
    if (!target) return false;
    audioEngine.playUiClick();
    engineCommandRef.teleportToFriend = {
      x: target.x,
      y: target.y,
      z: target.z,
    };
    set({ activeModal: 'none' });
    if (toastMsg) {
      get().showToast(toastMsg, 'info');
    }
    return true;
  },

  requestStartHeist: () => {
    audioEngine.playUiClick();
    engineCommandRef.triggerStartHeist = true;
  },

  setHeistProgress: (activeBuildingId, progress) => {
    set((s) => ({
      heist: {
        ...s.heist,
        activeBuildingId,
        progress,
      },
    }));
  },

  syncRobbedVenuesFromServer: (records) => {
    const now = Date.now();
    set((s) => {
      const nextMap: Record<string, number> = { ...s.heist.robbedUntilByBuilding };
      for (const r of records) {
        if (r.robbedUntil > now) {
          nextMap[r.buildingId] = r.robbedUntil;
        }
      }
      return {
        heist: {
          ...s.heist,
          robbedUntilByBuilding: nextMap,
        },
      };
    });
  },

  completeHeistReward: (buildingId, rewardCoins, robbedUntil, wantedStars, toastMsg) => {
    const now = Date.now();
    const s = get();
    // Idempotency guard: if this venue was already robbed and still has > 2s cooldown left, skip duplicate payout
    if ((s.heist.robbedUntilByBuilding[buildingId] ?? 0) > now + 2000) {
      return false;
    }

    audioEngine.playMissionComplete();
    audioEngine.vibrate(110, useSettingsStore.getState().vibrationEnabled);

    // Keep player.level & player.xp strictly unchanged ("daraja o'zgarmasin")
    const nextWanted = Math.min(5, Math.max(s.wantedLevel, wantedStars));
    set({
      wantedLevel: nextWanted,
      escapeRatio: 0,
      economy: {
        ...s.economy,
        vip: true,
        coins: Math.max(s.economy.coins, s.economy.coins + Math.max(0, rewardCoins)),
      },
      heist: {
        activeBuildingId: s.heist.activeBuildingId === buildingId ? null : s.heist.activeBuildingId,
        progress: s.heist.activeBuildingId === buildingId ? 0 : s.heist.progress,
        robbedUntilByBuilding: {
          ...s.heist.robbedUntilByBuilding,
          [buildingId]: robbedUntil,
        },
        carryingLootUntil: now + 90_000,
      },
    });
    if (toastMsg) {
      get().showToast(toastMsg, 'success');
    }
    get().saveCurrentProgress();
    return true;
  },

  playOrContinue: (corruptedMsg, noSaveMsg) => {
    const s = get();
    if (s.saveAvailable || hasSavedGame()) {
      get().continueSavedGame(corruptedMsg, noSaveMsg);
    } else {
      // Enter world preserving any vehicles already bought in Garage from Main Menu!
      audioEngine.playUiClick();
      engineCommandRef.teleportPlayer = { ...s.player.position };
      engineCommandRef.syncVehiclesFromStore = true;
      set({
        gameStarted: true,
        activeModal: 'none',
        currentBuildingId: null,
        wantedLevel: 0,
        escapeRatio: 0,
      });
      get().saveCurrentProgress();
    }
  },

  startNewGame: () => {
    audioEngine.playUiClick();
    const s = get();
    const freshMissions = createInitialMissionProgress();
    freshMissions.first_steps.status = 'active';
    const freshPlayer = createFreshPlayer();
    // Preserve player's current level & XP as requested ("daraja o'zgarmasin"), plus owned cars if any!
    freshPlayer.level = s.player.level;
    freshPlayer.xp = s.player.xp;
    const defaultColors = createDefaultVehicleColors();
    const mergedColors = { ...defaultColors, ...s.inventory.vehicleColors };
    const mergedTuning = { ...createDefaultVehicleTuningMap(), ...s.inventory.vehicleTuning };
    const freshVehicles = createInitialVehicles(mergedColors, undefined, mergedTuning);

    engineCommandRef.teleportPlayer = { ...freshPlayer.position };
    engineCommandRef.syncVehiclesFromStore = true;

    set({
      gameStarted: true,
      activeModal: 'none',
      player: freshPlayer,
      vehicles: freshVehicles,
      economy: {
        coins: Math.max(s.economy.coins, ECONOMY_CONFIG.startingCoins),
        vip: true,
        rewardedMissionIds: [],
      },
      inventory: {
        ...s.inventory,
        ownedVehicles: ensureStarterBigVehicles(s.inventory.ownedVehicles),
        vehicleColors: mergedColors,
        vehicleTuning: mergedTuning,
        items: ensureVipCardInItems(s.inventory.items),
      },
      equippedWeapon: s.equippedWeapon || 'pistol',
      currentBuildingId: null,
      metroRide: createIdleMetroRide(),
      missions: freshMissions,
      activeMissionId: 'first_steps',
      world: createFreshWorld(),
      customWaypoint: null,
      wantedLevel: 0,
      escapeRatio: 0,
      raceState: createIdleRaceState(),
    });
    engineCommandRef.stopStreetRace = true;
    engineCommandRef.skipMetroRide = true;
    get().saveCurrentProgress();
  },

  continueSavedGame: (corruptedMsg, noSaveMsg) => {
    audioEngine.playUiClick();
    const { state: loaded, corrupted } = loadSavedGame();
    if (corrupted) {
      get().startNewGame();
      get().showToast(corruptedMsg, 'warning');
      return;
    }
    if (!loaded) {
      get().startNewGame();
      get().showToast(noSaveMsg, 'info');
      return;
    }

    useSettingsStore.getState().replaceAllSettings(loaded.settings);
    const mergedTuning = { ...createDefaultVehicleTuningMap(), ...loaded.inventory.vehicleTuning };
    const migratedPlacements = migrateLegacyHeavyPlacements(loaded.vehiclePlacements);
    const vehicles = createInitialVehicles(
      loaded.inventory.vehicleColors,
      migratedPlacements,
      mergedTuning,
    );

    const vipCoins = loaded.economy.vip
      ? Math.max(0, loaded.economy.coins)
      : Math.max(loaded.economy.coins, ECONOMY_CONFIG.startingCoins);

    engineCommandRef.teleportPlayer = { ...loaded.player.position };
    engineCommandRef.syncVehiclesFromStore = true;

    set({
      gameStarted: true,
      activeModal: 'none',
      player: {
        ...createFreshPlayer(),
        position: { ...loaded.player.position },
        rotationY: loaded.player.rotationY,
        level: loaded.player.level,
        xp: loaded.player.xp,
        distanceWalked: loaded.player.distanceWalked,
        distanceDriven: loaded.player.distanceDriven,
        playTimeSeconds: loaded.player.playTimeSeconds,
      },
      vehicles,
      economy: {
        coins: vipCoins,
        vip: true,
        rewardedMissionIds: loaded.economy.rewardedMissionIds,
      },
      inventory: {
        ...loaded.inventory,
        ownedVehicles: ensureStarterBigVehicles(loaded.inventory.ownedVehicles),
        vehicleTuning: mergedTuning,
        items: ensureVipCardInItems(loaded.inventory.items),
      },
      equippedWeapon: loaded.equippedWeapon ?? 'pistol',
      currentBuildingId: null,
      missions: loaded.missions,
      activeMissionId: loaded.activeMissionId,
      world: loaded.world,
      customWaypoint: null,
      wantedLevel: 0,
      escapeRatio: 0,
      saveAvailable: true,
    });
    // Persist VIP upgrade immediately so subsequent loads have it saved
    get().saveCurrentProgress();
  },

  returnToMainMenu: () => {
    audioEngine.playUiClick();
    audioEngine.updateSiren(0, 999, 0, true);
    engineCommandRef.stopStreetRace = true;
    engineCommandRef.skipMetroRide = true;
    get().saveCurrentProgress();
    set({
      gameStarted: false,
      activeModal: 'none',
      currentBuildingId: null,
      metroRide: createIdleMetroRide(),
      wantedLevel: 0,
      escapeRatio: 0,
      raceState: createIdleRaceState(),
      saveAvailable: hasSavedGame(),
    });
  },

  setActiveModal: (modal) => {
    audioEngine.playUiClick();
    audioEngine.setAmbientPaused(modal !== 'none');
    set((s) => ({
      activeModal: modal,
      garageInitialFilter: modal === 'none' ? 'all' : s.garageInitialFilter,
    }));
  },

  openGarageModal: (initialFilter = 'all') => {
    audioEngine.playUiClick();
    audioEngine.setAmbientPaused(true);
    set({
      garageInitialFilter: initialFilter,
      activeModal: 'garage',
    });
  },

  unlockVehicleImmediate: (vehicleId) => {
    const s = get();
    if (s.inventory.ownedVehicles.includes(vehicleId)) return;
    const price = VEHICLE_CONFIGS[vehicleId]?.price ?? 0;
    const nextCoins = s.economy.coins >= price ? s.economy.coins - price : s.economy.coins;
    set({
      economy: { ...s.economy, coins: nextCoins, vip: true },
      inventory: {
        ...s.inventory,
        ownedVehicles: [...s.inventory.ownedVehicles, vehicleId],
        selectedVehicle: vehicleId,
      },
    });
    get().saveCurrentProgress();
  },

  toggleDock: () => {
    audioEngine.playUiClick();
    set((s) => ({ dockCollapsed: !s.dockCollapsed }));
  },

  cycleCameraMode: () => {
    audioEngine.playUiClick();
    const order: CameraMode[] = ['third_person', 'far_chase', 'hood', 'first_person'];
    const current = get().cameraMode;
    const idx = order.indexOf(current);
    set({ cameraMode: order[(idx + 1) % order.length] });
  },

  setEquippedWeapon: (weapon) => {
    audioEngine.playUiClick();
    set({
      equippedWeapon: weapon,
    });
  },

  cycleWeapon: () => {
    const s = get();
    const idx = ALL_WEAPON_IDS.indexOf(s.equippedWeapon);
    const next = ALL_WEAPON_IDS[(idx + 1) % ALL_WEAPON_IDS.length];
    get().setEquippedWeapon(next);
  },

  topUpVipCoins: (toastMsg) => {
    audioEngine.playMissionComplete();
    set((s) => ({
      economy: {
        ...s.economy,
        vip: true,
        coins: Math.max(s.economy.coins, Math.min(1e35, s.economy.coins + ECONOMY_CONFIG.vipTopUpAmount)),
      },
    }));
    if (toastMsg) get().showToast(toastMsg, 'success');
    get().saveCurrentProgress();
  },

  startCityRace: (startedToast) => {
    audioEngine.playNotification();
    audioEngine.setAmbientPaused(false);
    engineCommandRef.startStreetRace = true;
    set((s) => ({
      activeModal: 'none',
      currentBuildingId: null,
      wantedLevel: 0,
      escapeRatio: 0,
      raceState: {
        ...s.raceState,
        status: 'countdown',
        countdown: 3.0,
        elapsedSeconds: 0,
        playerRank: 11,
        checkpointIndex: 0,
        playerWon: false,
        winnerVehicleId: null,
      },
    }));
    if (startedToast) {
      get().showToast(startedToast, 'info');
    }
  },

  stopCityRace: () => {
    audioEngine.playUiClick();
    engineCommandRef.stopStreetRace = true;
    set({
      raceState: createIdleRaceState(),
    });
  },

  completeCityRace: (playerWon, playerRank, winnerVehicleId, winMsg, loseMsg) => {
    const s = get();
    if (playerWon) {
      const nextEconomy = creditCityRaceReward(s.economy);
      let nextItems = s.inventory.items;
      if (!nextItems.some((it) => it.id === 'grand_prix_trophy')) {
        nextItems = [
          {
            id: 'grand_prix_trophy',
            category: 'trophy',
            titleKey: 'profile.items.grand_prix_trophy',
            descKey: 'profile.items.grand_prix_trophy_desc',
            acquiredAt: Date.now(),
          },
          ...nextItems,
        ];
      }
      audioEngine.playMissionComplete();
      audioEngine.vibrate(110, useSettingsStore.getState().vibrationEnabled);
      // Keep player.level & player.xp strictly unchanged ("daraja o'zgarmasin")
      set({
        economy: nextEconomy,
        inventory: {
          ...s.inventory,
          items: nextItems,
        },
        raceState: {
          ...s.raceState,
          status: 'finished',
          playerRank: 1,
          playerWon: true,
          winnerVehicleId: null,
        },
      });
      get().showToast(winMsg, 'success');
      get().saveCurrentProgress();
    } else {
      audioEngine.playNotification();
      audioEngine.vibrate(80, useSettingsStore.getState().vibrationEnabled);
      set({
        raceState: {
          ...s.raceState,
          status: 'finished',
          playerRank,
          playerWon: false,
          winnerVehicleId,
        },
      });
      get().showToast(loseMsg, 'warning');
    }
  },

  setTimePreset: (preset, auto = false) => {
    const presetHours: Record<TimeOfDayPreset, number> = {
      dawn: 6.3,
      day: 12.5,
      sunset: 18.4,
      night: 22.0,
    };
    set((s) => ({
      world: {
        ...s.world,
        timePreset: preset,
        timeHours: presetHours[preset],
        autoTimeCycle: auto,
      },
    }));
  },

  setExactTimeHours: (hours, auto = false) => {
    const normalized = ((hours % 24) + 24) % 24;
    set((s) => ({
      world: {
        ...s.world,
        timeHours: normalized,
        autoTimeCycle: auto,
      },
    }));
  },

  setWeather: (weather) => {
    audioEngine.playUiClick();
    set((s) => ({
      world: {
        ...s.world,
        weather,
      },
    }));
  },

  setTrafficCount: (count) => {
    set((s) => ({
      world: {
        ...s.world,
        trafficCount: Math.max(0, Math.min(28, Math.round(count))),
      },
    }));
  },

  startMission: (missionId, startedLabel) => {
    const s = get();
    const nextMissions = startOrRetryMission(s.missions, missionId);
    if (!nextMissions) return;
    audioEngine.playNotification();
    set({
      missions: nextMissions,
      activeMissionId: missionId,
      activeModal: 'none',
    });
    audioEngine.setAmbientPaused(false);
    if (startedLabel) {
      get().showToast(startedLabel, 'info');
    }
  },

  abortActiveMission: () => {
    const s = get();
    if (!s.activeMissionId) return;
    const current = s.missions[s.activeMissionId];
    if (!current) return;
    audioEngine.playUiClick();
    set({
      missions: {
        ...s.missions,
        [s.activeMissionId]: {
          ...current,
          status: 'available',
          currentStep: 0,
          distanceAccumulated: 0,
        },
      },
      activeMissionId: null,
    });
  },

  applyMissionTickOutcome: (updated, unlockedIds, completedId, failedReason, messages) => {
    if (!updated) return;
    const s = get();
    const nextMissions: Record<string, MissionProgress> = {
      ...s.missions,
      [updated.id]: updated,
    };

    if (unlockedIds && unlockedIds.length > 0) {
      for (const uid of unlockedIds) {
        if (nextMissions[uid]) {
          nextMissions[uid] = { ...nextMissions[uid], status: 'available' };
        }
      }
    }

    if (completedId) {
      const def = getMissionDefinition(completedId);
      let nextEconomy = s.economy;
      let nextItems = s.inventory.items;

      if (def) {
        const tx = creditMissionReward(
          s.economy,
          s.player.level,
          s.player.xp,
          completedId,
          def.rewardCoins,
          def.rewardXp,
        );
        nextEconomy = { ...tx.economy, vip: true };
      }

      if (completedId === 'city_explorer' && !nextItems.some((i) => i.id === 'explorer_badge')) {
        nextItems = [
          ...nextItems,
          {
            id: 'explorer_badge',
            category: 'trophy',
            titleKey: 'profile.items.explorer_badge',
            descKey: 'profile.items.explorer_badge_desc',
            acquiredAt: Date.now(),
          },
        ];
      }
      if (completedId === 'traffic_test' && !nextItems.some((i) => i.id === 'pro_driver_trophy')) {
        nextItems = [
          ...nextItems,
          {
            id: 'pro_driver_trophy',
            category: 'trophy',
            titleKey: 'profile.items.pro_driver_trophy',
            descKey: 'profile.items.pro_driver_trophy_desc',
            acquiredAt: Date.now(),
          },
        ];
      }

      audioEngine.playMissionComplete();
      audioEngine.vibrate(80, useSettingsStore.getState().vibrationEnabled);

      // Keep player.level unchanged per user instruction ("daraja o'zgarmasin")
      set({
        missions: nextMissions,
        activeMissionId: null,
        economy: nextEconomy,
        inventory: {
          ...s.inventory,
          items: nextItems,
        },
      });

      if (messages?.completed) {
        get().showToast(messages.completed, 'success');
      }
      get().saveCurrentProgress();
      return;
    }

    if (failedReason) {
      audioEngine.playNotification();
      audioEngine.vibrate(120, useSettingsStore.getState().vibrationEnabled);
      set({
        missions: nextMissions,
        activeMissionId: null,
      });
      if (failedReason === 'timeout' && messages?.timeout) {
        get().showToast(messages.timeout, 'warning');
      } else if (failedReason === 'crash' && messages?.crash) {
        get().showToast(messages.crash, 'warning');
      }
      return;
    }

    set({ missions: nextMissions });
  },

  buyVehicle: (vehicleId) => {
    const s = get();
    const res = purchaseVehicleTransaction(s.economy, s.inventory, vehicleId);
    if (!res.success) {
      return { ok: false, reason: res.reason };
    }
    audioEngine.playMissionComplete();
    set({
      economy: { ...res.economy, vip: true },
      inventory: res.inventory,
    });
    get().saveCurrentProgress();
    return { ok: true };
  },

  selectAndSpawnVehicle: (vehicleId, nearPlayer = true) => {
    const s = get();
    if (!s.inventory.ownedVehicles.includes(vehicleId)) return;
    if (s.gameStarted && s.player.inVehicleInstanceId) {
      audioEngine.playNotification();
      return;
    }
    audioEngine.playUiClick();
    engineCommandRef.spawnOrSelectVehicle = {
      vehicleId,
      nearPlayer,
    };
    if (!nearPlayer) {
      engineCommandRef.teleportPlayer = { ...DEALERSHIP_SPAWN_POS };
    }
    set({
      inventory: {
        ...s.inventory,
        selectedVehicle: vehicleId,
      },
      currentBuildingId: null,
      activeModal: 'none',
    });
    audioEngine.setAmbientPaused(false);
    get().saveCurrentProgress();
  },

  setVehiclePaint: (vehicleId, color) => {
    audioEngine.playUiClick();
    engineCommandRef.applyLiveVehicleCosmetics = true;
    set((s) => ({
      inventory: {
        ...s.inventory,
        vehicleColors: {
          ...s.inventory.vehicleColors,
          [vehicleId]: color,
        },
      },
      vehicles: s.vehicles.map((v) => (v.vehicleId === vehicleId ? { ...v, color } : v)),
    }));
    get().saveCurrentProgress();
  },

  setVehicleTuning: (vehicleId, patch) => {
    audioEngine.playUiClick();
    engineCommandRef.applyLiveVehicleCosmetics = true;
    set((s) => {
      const prev = s.inventory.vehicleTuning?.[vehicleId] ?? getDefaultVehicleTuning(vehicleId);
      const nextTuning: VehicleCustomTuning = {
        ...prev,
        ...patch,
      };
      return {
        inventory: {
          ...s.inventory,
          vehicleTuning: {
            ...(s.inventory.vehicleTuning ?? {}),
            [vehicleId]: nextTuning,
          },
        },
        vehicles: s.vehicles.map((v) => (v.vehicleId === vehicleId ? { ...v, tuning: nextTuning } : v)),
      };
    });
    get().saveCurrentProgress();
  },

  cycleVehicleCargo: (vehicleId) => {
    const s = get();
    const prev = s.inventory.vehicleTuning?.[vehicleId] ?? getDefaultVehicleTuning(vehicleId);
    const idx = ALL_CARGO_LOADS.indexOf(prev.cargoType);
    const nextCargo = ALL_CARGO_LOADS[(idx + 1) % ALL_CARGO_LOADS.length];
    get().setVehicleTuning(vehicleId, { cargoType: nextCargo });
    return nextCargo;
  },

  triggerVehicleHydraulics: () => {
    audioEngine.playUiClick();
    engineCommandRef.toggleVehicleHydraulics = true;
  },

  creditVehicleJobReward: (amount) => {
    if (amount <= 0) return;
    audioEngine.playMissionComplete();
    audioEngine.vibrate(45, useSettingsStore.getState().vibrationEnabled);
    // Keep player.level strictly unchanged ("daraja o'zgarmasin")
    set((s) => ({
      economy: {
        ...s.economy,
        vip: true,
        coins: Math.max(s.economy.coins, s.economy.coins + amount),
      },
    }));
    get().saveCurrentProgress();
  },

  selectCinemaMovie: (index, toastMsg) => {
    audioEngine.playUiClick();
    engineCommandRef.selectCinemaMovieIndex = index;
    set({
      activeCinemaMovieIndex: index,
      cinemaCustomVideoName: null,
      cinemaPaused: false,
    });
    if (toastMsg) get().showToast(toastMsg, 'info');
  },

  uploadCustomCinemaVideo: (url, fileName, toastMsg) => {
    audioEngine.playMissionComplete();
    engineCommandRef.loadCustomCinemaVideo = { url, fileName };
    set({
      cinemaCustomVideoName: fileName,
      cinemaPaused: false,
    });
    if (toastMsg) get().showToast(toastMsg, 'success');
  },

  toggleCinemaPlayPause: () => {
    audioEngine.playUiClick();
    engineCommandRef.toggleCinemaPlayPause = true;
    set((s) => ({ cinemaPaused: !s.cinemaPaused }));
  },

  openEnterprisesModal: (focusEnterpriseId = null) => {
    audioEngine.playUiClick();
    audioEngine.setAmbientPaused(true);
    set({
      selectedEnterpriseId: focusEnterpriseId,
      activeModal: 'enterprises',
    });
  },

  buyEnterprise: (enterpriseId) => {
    const s = get();
    const res = purchaseEnterpriseTransaction(s.economy, s.inventory, enterpriseId);
    if (!res.success) {
      return { ok: false, reason: res.reason };
    }
    audioEngine.playMissionComplete();
    audioEngine.vibrate(80, useSettingsStore.getState().vibrationEnabled);
    // Keep player.level strictly unchanged ("daraja o'zgarmasin")
    set({
      economy: { ...res.economy, vip: true },
      inventory: res.inventory,
      selectedEnterpriseId: enterpriseId,
    });
    get().saveCurrentProgress();
    return { ok: true };
  },

  collectEnterpriseDividendTick: () => {
    const s = get();
    const income = computeEnterpriseIncomePerTick(s.inventory.ownedProperties);
    if (income <= 0) return 0;
    set({
      economy: {
        ...s.economy,
        vip: true,
        coins: Math.max(s.economy.coins, s.economy.coins + income),
      },
    });
    return income;
  },

  openMetroModal: (focusStationId = null) => {
    audioEngine.playUiClick();
    audioEngine.setAmbientPaused(true);
    set((s) => ({
      selectedMetroStationId:
        focusStationId ?? findNearestMetroStation(s.player.position.x, s.player.position.z).id,
      activeModal: 'metro',
    }));
  },

  requestMetroRide: (toStationId, fromStationId = null, departToast) => {
    const s = get();
    if (s.player.inVehicleInstanceId) {
      audioEngine.playNotification();
      return false;
    }
    const originId =
      fromStationId ?? findNearestMetroStation(s.player.position.x, s.player.position.z).id;
    engineCommandRef.startMetroRide = {
      fromStationId: originId,
      toStationId,
    };
    audioEngine.playMetroChime();
    audioEngine.setAmbientPaused(false);
    set({
      activeModal: 'none',
      currentBuildingId: null,
      selectedMetroStationId: toStationId,
      metroRide: {
        active: true,
        fromStationId: originId,
        toStationId,
        progress: 0,
      },
    });
    if (departToast) {
      get().showToast(departToast, 'info');
    }
    return true;
  },

  boardOrExitMetro: () => {
    const s = get();
    if (s.player.inVehicleInstanceId) {
      audioEngine.playNotification();
      return;
    }
    audioEngine.playUiClick();
    engineCommandRef.toggleBoardMetro = true;
  },

  selectMetroStopWhileRiding: (toStationId) => {
    if (!get().metroRide.active) return;
    audioEngine.playUiClick();
    engineCommandRef.setMetroStopWhileRiding = toStationId;
    set((s) => ({
      selectedMetroStationId: toStationId,
      metroRide: {
        ...s.metroRide,
        toStationId,
      },
    }));
  },

  skipActiveMetroRide: () => {
    if (!get().metroRide.active) return;
    audioEngine.playUiClick();
    engineCommandRef.skipMetroRide = true;
  },

  incrementWantedLevel: (warningMsg) => {
    const s = get();
    const nextLevel = Math.min(5, s.wantedLevel + 1);
    audioEngine.playNotification();
    audioEngine.vibrate(95, useSettingsStore.getState().vibrationEnabled);
    set({
      wantedLevel: nextLevel,
      escapeRatio: 0,
    });
    get().showToast(warningMsg, 'warning');
  },

  clearWantedOnEscape: (escapedMsg) => {
    const s = get();
    if (s.wantedLevel === 0) return;
    audioEngine.playMissionComplete();
    set({
      wantedLevel: 0,
      escapeRatio: 0,
    });
    if (escapedMsg) {
      get().showToast(escapedMsg, 'success');
    }
  },

  applyPoliceBustFine: (finePrefixMsg) => {
    const s = get();
    const rawFine = Math.max(200, s.wantedLevel * 250);
    const deducted = Math.min(s.economy.coins, rawFine);
    audioEngine.playNotification();
    audioEngine.vibrate(140, useSettingsStore.getState().vibrationEnabled);
    set({
      wantedLevel: 0,
      escapeRatio: 0,
      economy: {
        ...s.economy,
        vip: true,
        coins: Math.max(0, s.economy.coins - deducted),
      },
    });
    get().showToast(`${finePrefixMsg} -${deducted} N-Coin`, 'warning');
    get().saveCurrentProgress();
  },

  setCustomWaypoint: (pt) => {
    audioEngine.playUiClick();
    set({ customWaypoint: pt });
  },

  showToast: (text, tone = 'info') => {
    const id = Date.now();
    set({ toast: { id, text, tone } });
    window.setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 3400);
  },

  syncTelemetryFromEngine: (patch) => {
    set((s) => {
      let nextWaypoint = s.customWaypoint;
      if (nextWaypoint) {
        const dx = patch.playerPos.x - nextWaypoint.x;
        const dz = patch.playerPos.z - nextWaypoint.z;
        if (dx * dx + dz * dz < 64) {
          nextWaypoint = null;
        }
      }

      return {
        fps: patch.fps ?? s.fps,
        speedKmh: patch.speedKmh,
        nearestInteractable: patch.nearestInteractable,
        vehicles: patch.vehiclesSnapshot,
        escapeRatio: patch.escapeRatio ?? s.escapeRatio,
        policeUnits: patch.policeUnits ?? s.policeUnits,
        raceState: patch.raceState ?? s.raceState,
        metroRide: patch.metroRide ?? s.metroRide,
        currentBuildingId: patch.currentBuildingId !== undefined ? patch.currentBuildingId : s.currentBuildingId,
        activeCinemaMovieIndex:
          patch.activeCinemaMovieIndex !== undefined ? patch.activeCinemaMovieIndex : s.activeCinemaMovieIndex,
        spiderWebTarget: patch.spiderWebTarget !== undefined ? patch.spiderWebTarget : s.spiderWebTarget,
        activeViltrumiteBoss:
          patch.activeViltrumiteBoss !== undefined ? patch.activeViltrumiteBoss : s.activeViltrumiteBoss,
        isInsidePoliceHQ: patch.isInsidePoliceHQ !== undefined ? patch.isInsidePoliceHQ : s.isInsidePoliceHQ,
        customWaypoint: nextWaypoint,
        world: {
          ...s.world,
          timeHours: patch.timeHours,
        },
        player: {
          ...s.player,
          position: patch.playerPos,
          rotationY: patch.playerRotY,
          inVehicleInstanceId: patch.inVehicleId,
          currentDistrict: patch.district,
          distanceWalked: s.player.distanceWalked + patch.walkedDelta,
          distanceDriven: s.player.distanceDriven + patch.drivenDelta,
          playTimeSeconds: s.player.playTimeSeconds + patch.dtSeconds,
        },
      };
    });
  },

  saveCurrentProgress: (successMsg, errorMsg) => {
    const s = get();
    const settings = useSettingsStore.getState();

    const saveBound = WORLD_PLAYABLE_LIMIT - 4;
    const activeDestStation =
      s.metroRide.active && s.metroRide.toStationId
        ? METRO_STATIONS.find((st) => st.id === s.metroRide.toStationId)
        : undefined;
    const rawSavePos = activeDestStation
      ? activeDestStation.arrivalPos
      : s.player.position.y > 2.0
        ? findNearestMetroStation(s.player.position.x, s.player.position.z).arrivalPos
        : s.player.position;
    const safePos: Vec3 = {
      x: Math.max(-saveBound, Math.min(saveBound, rawSavePos.x)),
      y: 0,
      z: Math.max(-saveBound, Math.min(saveBound, rawSavePos.z)),
    };

    const vehiclePlacements: Record<string, SavedVehiclePlacement> = {};
    for (const v of s.vehicles) {
      vehiclePlacements[v.vehicleId] = {
        x: Math.max(-saveBound, Math.min(saveBound, v.position.x)),
        z: Math.max(-saveBound, Math.min(saveBound, v.position.z)),
        rotationY: v.rotationY,
      };
    }

    const payload: SaveState = {
      version: CURRENT_SAVE_VERSION,
      savedAt: Date.now(),
      player: {
        position: safePos,
        rotationY: s.player.rotationY,
        level: s.player.level,
        xp: s.player.xp,
        distanceWalked: s.player.distanceWalked,
        distanceDriven: s.player.distanceDriven,
        playTimeSeconds: s.player.playTimeSeconds,
      },
      economy: {
        ...s.economy,
        vip: true,
      },
      inventory: s.inventory,
      vehiclePlacements,
      equippedWeapon: s.equippedWeapon,
      missions: s.missions,
      activeMissionId: s.activeMissionId,
      world: s.world,
      settings: {
        language: settings.language,
        theme: settings.theme,
        masterVolume: settings.masterVolume,
        musicVolume: settings.musicVolume,
        sfxVolume: settings.sfxVolume,
        mouseSensitivity: settings.mouseSensitivity,
        cameraSensitivity: settings.cameraSensitivity,
        touchSensitivity: settings.touchSensitivity,
        graphicsQuality: settings.graphicsQuality,
        shadowsEnabled: settings.shadowsEnabled,
        fpsCounter: settings.fpsCounter,
        vibrationEnabled: settings.vibrationEnabled,
        cameraDistance: settings.cameraDistance,
        cameraFov: settings.cameraFov,
        showTouchControls: settings.showTouchControls,
      },
    };

    const ok = writeSavedGame(payload);
    if (ok) {
      set({ saveAvailable: true });
      if (successMsg) get().showToast(successMsg, 'success');
    } else if (errorMsg) {
      get().showToast(errorMsg, 'warning');
    }
    return ok;
  },

  resetAllProgress: () => {
    const prevLevel = get().player.level;
    const prevXp = get().player.xp;
    clearSavedGame();
    const colors = createDefaultVehicleColors();
    const tuningMap = createDefaultVehicleTuningMap();
    const freshMissions = createInitialMissionProgress();
    freshMissions.first_steps.status = 'active';
    const freshPlayer = createFreshPlayer();
    // Preserve level ("daraja o'zgarmasin")
    freshPlayer.level = prevLevel;
    freshPlayer.xp = prevXp;

    engineCommandRef.teleportPlayer = { ...freshPlayer.position };
    engineCommandRef.syncVehiclesFromStore = true;

    set({
      saveAvailable: false,
      gameStarted: true,
      activeModal: 'none',
      player: freshPlayer,
      vehicles: createInitialVehicles(colors, undefined, tuningMap),
      economy: {
        coins: ECONOMY_CONFIG.startingCoins,
        vip: true,
        rewardedMissionIds: [],
      },
      inventory: {
        ownedVehicles: [...STARTER_UNLOCKED_VEHICLES],
        selectedVehicle: 'sedan',
        vehicleColors: colors,
        vehicleTuning: tuningMap,
        ownedProperties: ['safehouse_starter'],
        items: createStarterItems(),
      },
      equippedWeapon: 'pistol',
      currentBuildingId: null,
      metroRide: createIdleMetroRide(),
      missions: freshMissions,
      activeMissionId: 'first_steps',
      world: createFreshWorld(),
      wantedLevel: 0,
      escapeRatio: 0,
      raceState: createIdleRaceState(),
    });
    engineCommandRef.stopStreetRace = true;
    engineCommandRef.skipMetroRide = true;
  },
}));
