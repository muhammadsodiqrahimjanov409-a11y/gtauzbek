import type {
  CargoLoadId,
  GraphicsQuality,
  Language,
  MissionStatus,
  RimStyleId,
  SavedVehiclePlacement,
  SaveState,
  ThemeMode,
  TimeOfDayPreset,
  VehicleCustomTuning,
  VehicleId,
  WeaponId,
  WeatherMode,
} from '../types/game';
import {
  ALL_CARGO_LOADS,
  ALL_RIM_STYLES,
  ALL_VEHICLE_IDS,
  ALL_WEAPON_IDS,
  getDefaultVehicleTuning,
  VEHICLE_CONFIGS,
  WORLD_PLAYABLE_LIMIT,
} from '../game/gameConfig';
import { createInitialMissionProgress, MISSION_DEFINITIONS } from '../missions/missionDefinitions';

export const CURRENT_SAVE_VERSION = 1;

function isFiniteNumber(v: unknown, min = -Infinity, max = Infinity): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

const VALID_LANGUAGES: Language[] = ['uz', 'en', 'ru'];
const VALID_THEMES: ThemeMode[] = ['dark', 'light'];
const VALID_QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high'];
const VALID_WEATHER: WeatherMode[] = ['sunny', 'cloudy', 'rainy'];
const VALID_TIME_PRESETS: TimeOfDayPreset[] = ['dawn', 'day', 'sunset', 'night'];
const VALID_STATUSES: MissionStatus[] = ['locked', 'available', 'active', 'completed', 'failed'];

export function validateSaveData(raw: unknown): { valid: boolean; data: SaveState | null; migrated: boolean } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, data: null, migrated: false };
  }

  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === 'number' ? obj.version : 0;
  if (version < 1 || version > CURRENT_SAVE_VERSION) {
    return { valid: false, data: null, migrated: false };
  }

  const player = obj.player as Record<string, unknown> | undefined;
  const economy = obj.economy as Record<string, unknown> | undefined;
  const inventory = obj.inventory as Record<string, unknown> | undefined;
  const settings = obj.settings as Record<string, unknown> | undefined;
  const world = obj.world as Record<string, unknown> | undefined;

  if (!player || !economy || !inventory || !settings || !world) {
    return { valid: false, data: null, migrated: false };
  }

  const pos = player.position as Record<string, unknown> | undefined;
  if (
    !pos ||
    !isFiniteNumber(pos.x, -WORLD_PLAYABLE_LIMIT, WORLD_PLAYABLE_LIMIT) ||
    !isFiniteNumber(pos.z, -WORLD_PLAYABLE_LIMIT, WORLD_PLAYABLE_LIMIT)
  ) {
    return { valid: false, data: null, migrated: false };
  }

  if (!isFiniteNumber(economy.coins, 0, 1e36)) {
    return { valid: false, data: null, migrated: false };
  }

  const ownedRaw = Array.isArray(inventory.ownedVehicles) ? inventory.ownedVehicles : ['sedan'];
  const ownedVehicles = ownedRaw.filter((v): v is VehicleId => ALL_VEHICLE_IDS.includes(v as VehicleId));
  if (!ownedVehicles.includes('sedan')) {
    ownedVehicles.unshift('sedan');
  }

  const selectedVehicle: VehicleId =
    ALL_VEHICLE_IDS.includes(inventory.selectedVehicle as VehicleId) &&
    ownedVehicles.includes(inventory.selectedVehicle as VehicleId)
      ? (inventory.selectedVehicle as VehicleId)
      : 'sedan';

  const baseMissions = createInitialMissionProgress();
  const rawMissions = (obj.missions ?? {}) as Record<string, Record<string, unknown>>;
  for (const def of MISSION_DEFINITIONS) {
    const savedM = rawMissions[def.id];
    if (savedM && VALID_STATUSES.includes(savedM.status as MissionStatus)) {
      baseMissions[def.id] = {
        id: def.id,
        status: savedM.status as MissionStatus,
        currentStep: isFiniteNumber(savedM.currentStep, 0, 20) ? savedM.currentStep : 0,
        totalSteps: Math.max(1, def.checkpoints.length),
        distanceAccumulated: isFiniteNumber(savedM.distanceAccumulated, 0, 100000) ? savedM.distanceAccumulated : 0,
        remainingSeconds: isFiniteNumber(savedM.remainingSeconds, 0, 3600)
          ? savedM.remainingSeconds
          : (def.timeLimitSeconds ?? null),
        collisionsCount: isFiniteNumber(savedM.collisionsCount, 0, 999) ? savedM.collisionsCount : 0,
      };
    }
  }

  const rawColors = (inventory.vehicleColors ?? {}) as Record<string, unknown>;
  const vehicleColors = {} as Record<VehicleId, string>;
  const rawTuning = (inventory.vehicleTuning ?? {}) as Record<string, Record<string, unknown>>;
  const vehicleTuning: Partial<Record<VehicleId, VehicleCustomTuning>> = {};
  for (const vid of ALL_VEHICLE_IDS) {
    vehicleColors[vid] =
      typeof rawColors[vid] === 'string' ? (rawColors[vid] as string) : VEHICLE_CONFIGS[vid].defaultColor;
    const defTuning = getDefaultVehicleTuning(vid);
    const rt = rawTuning[vid];
    if (rt && typeof rt === 'object') {
      vehicleTuning[vid] = {
        tireColor:
          typeof rt.tireColor === 'string' && rt.tireColor.length <= 24 ? rt.tireColor : defTuning.tireColor,
        interiorColor:
          typeof rt.interiorColor === 'string' && rt.interiorColor.length <= 24
            ? rt.interiorColor
            : defTuning.interiorColor,
        rimStyle: ALL_RIM_STYLES.includes(rt.rimStyle as RimStyleId)
          ? (rt.rimStyle as RimStyleId)
          : defTuning.rimStyle,
        rimColor: typeof rt.rimColor === 'string' && rt.rimColor.length <= 24 ? rt.rimColor : defTuning.rimColor,
        cargoType: ALL_CARGO_LOADS.includes(rt.cargoType as CargoLoadId)
          ? (rt.cargoType as CargoLoadId)
          : defTuning.cargoType,
      };
    } else {
      vehicleTuning[vid] = defTuning;
    }
  }

  // Validate saved parked vehicle positions across the city
  const rawPlacements = (obj.vehiclePlacements ?? {}) as Record<string, Record<string, unknown>>;
  const vehiclePlacements: Record<string, SavedVehiclePlacement> = {};
  for (const vid of ALL_VEHICLE_IDS) {
    const pl = rawPlacements[vid];
    if (
      pl &&
      isFiniteNumber(pl.x, -WORLD_PLAYABLE_LIMIT, WORLD_PLAYABLE_LIMIT) &&
      isFiniteNumber(pl.z, -WORLD_PLAYABLE_LIMIT, WORLD_PLAYABLE_LIMIT) &&
      isFiniteNumber(pl.rotationY, -1000, 1000)
    ) {
      vehiclePlacements[vid] = {
        x: pl.x,
        z: pl.z,
        rotationY: pl.rotationY,
      };
    }
  }

  const equippedWeapon: WeaponId = ALL_WEAPON_IDS.includes(obj.equippedWeapon as WeaponId)
    ? (obj.equippedWeapon as WeaponId)
    : 'pistol';

  const validated: SaveState = {
    version: CURRENT_SAVE_VERSION,
    savedAt: isFiniteNumber(obj.savedAt) ? obj.savedAt : Date.now(),
    player: {
      position: {
        x: pos.x,
        y: 0,
        z: pos.z,
      },
      rotationY: isFiniteNumber(player.rotationY) ? player.rotationY : 0,
      level: isFiniteNumber(player.level, 1, 999) ? Math.floor(player.level) : 1,
      xp: isFiniteNumber(player.xp, 0, 1_000_000) ? Math.floor(player.xp) : 0,
      distanceWalked: isFiniteNumber(player.distanceWalked, 0, 1e9) ? player.distanceWalked : 0,
      distanceDriven: isFiniteNumber(player.distanceDriven, 0, 1e9) ? player.distanceDriven : 0,
      playTimeSeconds: isFiniteNumber(player.playTimeSeconds, 0, 1e9) ? player.playTimeSeconds : 0,
    },
    economy: {
      coins: economy.coins >= 1e15 ? economy.coins : Math.floor(economy.coins),
      vip: Boolean(economy.vip),
      rewardedMissionIds: Array.isArray(economy.rewardedMissionIds)
        ? economy.rewardedMissionIds.filter((id): id is string => typeof id === 'string')
        : [],
    },
    inventory: {
      ownedVehicles,
      selectedVehicle,
      vehicleColors,
      vehicleTuning,
      ownedProperties: Array.isArray(inventory.ownedProperties)
        ? inventory.ownedProperties.filter((p): p is string => typeof p === 'string')
        : ['safehouse_starter'],
      items: Array.isArray(inventory.items) ? (inventory.items as SaveState['inventory']['items']) : [],
    },
    vehiclePlacements,
    equippedWeapon,
    missions: baseMissions,
    activeMissionId:
      typeof obj.activeMissionId === 'string' && baseMissions[obj.activeMissionId]
        ? obj.activeMissionId
        : null,
    world: {
      timeHours: isFiniteNumber(world.timeHours, 0, 24) ? world.timeHours : 10.5,
      autoTimeCycle: typeof world.autoTimeCycle === 'boolean' ? world.autoTimeCycle : true,
      timePreset: VALID_TIME_PRESETS.includes(world.timePreset as TimeOfDayPreset)
        ? (world.timePreset as TimeOfDayPreset)
        : 'day',
      weather: VALID_WEATHER.includes(world.weather as WeatherMode) ? (world.weather as WeatherMode) : 'sunny',
      trafficCount: isFiniteNumber(world.trafficCount, 0, 32) ? Math.floor(world.trafficCount) : 16,
    },
    settings: {
      language: VALID_LANGUAGES.includes(settings.language as Language) ? (settings.language as Language) : 'uz',
      theme: VALID_THEMES.includes(settings.theme as ThemeMode) ? (settings.theme as ThemeMode) : 'dark',
      masterVolume: isFiniteNumber(settings.masterVolume, 0, 1) ? settings.masterVolume : 0.7,
      musicVolume: isFiniteNumber(settings.musicVolume, 0, 1) ? settings.musicVolume : 0.45,
      sfxVolume: isFiniteNumber(settings.sfxVolume, 0, 1) ? settings.sfxVolume : 0.75,
      mouseSensitivity: isFiniteNumber(settings.mouseSensitivity, 0.2, 3) ? settings.mouseSensitivity : 1.0,
      cameraSensitivity: isFiniteNumber(settings.cameraSensitivity, 0.2, 3) ? settings.cameraSensitivity : 1.0,
      touchSensitivity: isFiniteNumber(settings.touchSensitivity, 0.2, 3) ? settings.touchSensitivity : 1.0,
      graphicsQuality: VALID_QUALITIES.includes(settings.graphicsQuality as GraphicsQuality)
        ? (settings.graphicsQuality as GraphicsQuality)
        : 'high',
      shadowsEnabled: typeof settings.shadowsEnabled === 'boolean' ? settings.shadowsEnabled : true,
      fpsCounter: typeof settings.fpsCounter === 'boolean' ? settings.fpsCounter : true,
      vibrationEnabled: typeof settings.vibrationEnabled === 'boolean' ? settings.vibrationEnabled : true,
      cameraDistance: isFiniteNumber(settings.cameraDistance, 4, 14) ? settings.cameraDistance : 7.2,
      cameraFov: isFiniteNumber(settings.cameraFov, 50, 90) ? settings.cameraFov : 62,
      showTouchControls:
        settings.showTouchControls === 'always' || settings.showTouchControls === 'off'
          ? settings.showTouchControls
          : 'auto',
    },
  };

  return { valid: true, data: validated, migrated: false };
}
