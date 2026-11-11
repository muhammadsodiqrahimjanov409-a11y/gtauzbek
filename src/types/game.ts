export type Language = 'uz' | 'en' | 'ru';
export type ThemeMode = 'dark' | 'light';
export type GraphicsQuality = 'low' | 'medium' | 'high';
export type TimeOfDayPreset = 'dawn' | 'day' | 'sunset' | 'night';
export type WeatherMode = 'sunny' | 'cloudy' | 'rainy';
export type CameraMode = 'third_person' | 'far_chase' | 'hood' | 'first_person';

export type WeaponId = 'unarmed' | 'pistol' | 'ak47' | 'golf_club';

export type BuildingCategory = 'shop' | 'enterprise' | 'restaurant' | 'museum' | 'cinema' | 'arcade';

export interface EnterableBuildingConfig {
  id: string;
  category: BuildingCategory;
  nameKey: string;
  interactLabelKey: string;
  interactToastKey: string;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  ceilingHeight: number;
  doorFacing: 'north' | 'south';
  doorWidth: number;
  roadZ: number;
  sidewalkZ: number;
  accentColor: string;
  signTitle: string;
  signSubtitle: string;
  towerHeight?: number;
  hasSpire?: boolean;
  purchasePrice?: number;
  incomePerTick?: number;
}

export interface MetroStationConfig {
  id: string;
  stationNumber: number;
  nameKey: string;
  descKey: string;
  trackX: number;
  trackZ: number;
  axis: 'ns' | 'ew';
  entrancePos: Vec3;
  arrivalPos: Vec3;
  arrivalYaw: number;
  accentColor: string;
  purchasePrice: number;
  incomePerTick: number;
}

export type PurchasablePlaceKind = BuildingCategory | 'metro';

export interface PurchasablePlaceConfig {
  id: string;
  kind: PurchasablePlaceKind;
  nameKey: string;
  centerX: number;
  centerZ: number;
  gpsTarget: Vec3;
  accentColor: string;
  heightMeters: number;
  purchasePrice: number;
  incomePerTick: number;
}

export interface MetroRideState {
  active: boolean;
  mode?: 'express' | 'live_loop';
  fromStationId: string | null;
  toStationId: string | null;
  currentStationId?: string | null;
  doorsOpen?: boolean;
  progress: number;
}

export type VehicleBodyStyle =
  | 'sedan'
  | 'suv'
  | 'sport'
  | 'hypercar'
  | 'muscle'
  | 'pickup'
  | 'limo'
  | 'hatchback'
  | 'labo'
  | 'gazel'
  | 'isuzu'
  | 'howo'
  | 'fura'
  | 'kamaz'
  | 'zil'
  | 'excavator'
  | 'tank'
  | 'airplane';

export type VehicleId =
  | 'sedan'
  | 'suv'
  | 'sport'
  | 'compact'
  | 'coupe'
  | 'muscle'
  | 'pickup'
  | 'limo'
  | 'rally'
  | 'roadster'
  | 'lux_suv'
  | 'cyber'
  | 'gt_tourer'
  | 'drift'
  | 'armored'
  | 'classic'
  | 'supercar'
  | 'track'
  | 'electric_gt'
  | 'hypercar'
  | 'labo'
  | 'gazel'
  | 'isuzu'
  | 'howo'
  | 'zil'
  | 'kamaz'
  | 'excavator'
  | 'fura'
  | 'tank'
  | 'airplane';

export type RimStyleId = 'classic' | 'sport' | 'luxury' | 'heavy';
export type CargoLoadId = 'wood' | 'steel' | 'concrete' | 'gravel' | 'empty';

export interface VehicleCustomTuning {
  tireColor: string;
  interiorColor: string;
  rimColor: string;
  rimStyle: RimStyleId;
  cargoType: CargoLoadId;
}

export type DistrictId = 'downtown' | 'residential' | 'industrial' | 'park' | 'highway' | 'commercial';
export type MissionStatus = 'locked' | 'available' | 'active' | 'completed' | 'failed';
export type ActiveModal =
  | 'none'
  | 'pause'
  | 'coop'
  | 'settings'
  | 'garage'
  | 'dealership'
  | 'map'
  | 'missions'
  | 'inventory'
  | 'safehouse'
  | 'enterprises'
  | 'metro'
  | 'credits';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  tag: 'building' | 'wall' | 'prop' | 'water';
}

export interface VehicleConfig {
  id: VehicleId;
  bodyStyle: VehicleBodyStyle;
  category: 'everyday' | 'suv_truck' | 'sport_super' | 'heavy_machinery';
  price: number;
  maxSpeed: number; // m/s
  reverseSpeed: number; // m/s
  acceleration: number; // m/s^2
  braking: number; // m/s^2
  turnSpeed: number; // rad/s
  grip: number; // 0..1 lateral grip
  halfWidth: number;
  halfLength: number;
  defaultColor: string;
  availableColors: string[];
  canCarryCargo?: boolean;
  spawnPosition: Vec3;
  spawnRotationY: number;
}

export interface VehicleInstanceState {
  instanceId: string;
  vehicleId: VehicleId;
  position: Vec3;
  rotationY: number;
  speed: number;
  steerAngle: number;
  wheelSpin: number;
  color: string;
  tuning?: VehicleCustomTuning;
  workAnimPhase?: number;
  headlightsOn: boolean;
  braking: boolean;
}

export interface SavedVehiclePlacement {
  x: number;
  z: number;
  rotationY: number;
}

export interface PlayerState {
  position: Vec3;
  rotationY: number;
  velocityY: number;
  isGrounded: boolean;
  isMoving: boolean;
  isSprinting: boolean;
  inVehicleInstanceId: string | null;
  level: number;
  xp: number;
  distanceWalked: number;
  distanceDriven: number;
  playTimeSeconds: number;
  currentDistrict: DistrictId;
}

export interface EconomyState {
  coins: number;
  vip?: boolean;
  rewardedMissionIds: string[];
}

export interface InventoryItem {
  id: string;
  category: 'property' | 'key' | 'trophy' | 'cosmetic';
  titleKey: string;
  descKey: string;
  acquiredAt: number;
}

export interface InventoryState {
  ownedVehicles: VehicleId[];
  selectedVehicle: VehicleId;
  vehicleColors: Record<VehicleId, string>;
  vehicleTuning?: Partial<Record<VehicleId, VehicleCustomTuning>>;
  ownedProperties: string[];
  items: InventoryItem[];
}

export interface MissionCheckpoint {
  position: Vec3;
  radius: number;
  labelKey: string;
}

export interface MissionDefinition {
  id: string;
  order: number;
  prerequisiteId?: string;
  titleKey: string;
  descKey: string;
  objectiveKey: string;
  startPosition: Vec3;
  rewardCoins: number;
  rewardXp: number;
  type: 'explore_points' | 'enter_and_drive' | 'visit_districts' | 'timed_delivery' | 'parking' | 'safe_traffic';
  checkpoints: MissionCheckpoint[];
  timeLimitSeconds?: number;
  targetDistanceMeters?: number;
  requiresStopInZone?: boolean;
  maxCollisions?: number;
}

export interface MissionProgress {
  id: string;
  status: MissionStatus;
  currentStep: number;
  totalSteps: number;
  distanceAccumulated: number;
  remainingSeconds: number | null;
  collisionsCount: number;
}

export interface MissionState {
  missions: Record<string, MissionProgress>;
  activeMissionId: string | null;
}

export interface PoliceUnitSnapshot {
  id: string;
  position: Vec3;
  rotationY: number;
  pursuing: boolean;
}

export type RaceStatus = 'idle' | 'countdown' | 'racing' | 'finished';

export interface RaceRivalSnapshot {
  id: string;
  vehicleId: VehicleId;
  color: string;
  x: number;
  z: number;
  rotationY: number;
  checkpointIndex: number;
  finished: boolean;
}

export interface RaceStateSnapshot {
  status: RaceStatus;
  countdown: number;
  elapsedSeconds: number;
  playerRank: number;
  totalRacers: number;
  checkpointIndex: number;
  totalCheckpoints: number;
  playerWon: boolean;
  winnerVehicleId: VehicleId | null;
  rivals: RaceRivalSnapshot[];
}

export interface WorldState {
  timeHours: number; // 0..24
  autoTimeCycle: boolean;
  timePreset: TimeOfDayPreset;
  weather: WeatherMode;
  trafficCount: number;
}

export interface SettingsState {
  language: Language;
  theme: ThemeMode;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  mouseSensitivity: number;
  cameraSensitivity: number;
  touchSensitivity: number;
  graphicsQuality: GraphicsQuality;
  shadowsEnabled: boolean;
  fpsCounter: boolean;
  vibrationEnabled: boolean;
  cameraDistance: number;
  cameraFov: number;
  showTouchControls: 'auto' | 'always' | 'off';
}

export interface InteractablePoint {
  id: string;
  type:
    | 'vehicle'
    | 'dealership'
    | 'safehouse'
    | 'mission'
    | 'gas_station'
    | 'race_start'
    | 'venue_counter'
    | 'metro_station'
    | 'metro_train';
  position: Vec3;
  radius: number;
  keyHint: 'E' | 'F';
  labelKey: string;
  payloadId?: string;
}

export interface DistrictConfig {
  id: DistrictId;
  nameKey: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  accentColor: string;
  center: Vec3;
}

export interface SaveState {
  version: number;
  savedAt: number;
  player: {
    position: Vec3;
    rotationY: number;
    level: number;
    xp: number;
    distanceWalked: number;
    distanceDriven: number;
    playTimeSeconds: number;
  };
  economy: EconomyState;
  inventory: InventoryState;
  vehiclePlacements?: Record<string, SavedVehiclePlacement>;
  equippedWeapon?: WeaponId;
  missions: Record<string, MissionProgress>;
  activeMissionId: string | null;
  world: WorldState;
  settings: SettingsState;
}

export type HeistTargetKind = 'bank' | 'museum' | 'shop';

export interface HeistTargetConfig {
  buildingId: string;
  kind: HeistTargetKind;
  rewardCoins: number;
  wantedStars: number;
  durationSeconds: number;
}

export interface ActiveHeistState {
  activeBuildingId: string | null;
  progress: number; // 0..1
  robbedUntilByBuilding: Record<string, number>;
  carryingLootUntil: number;
}

export interface CoopPeerSnapshot {
  playerId: string;
  name: string;
  role: 'host' | 'guest';
  jacketColor: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  speed: number;
  sprinting: boolean;
  weapon: WeaponId;
  firingUntil: number;
  inVehicle: boolean;
  vehicleId: VehicleId | null;
  vehicleColor: string;
  vehicleTuning: VehicleCustomTuning | null;
  steerAngle: number;
  wheelSpin: number;
  headlightsOn: boolean;
  braking: boolean;
  workAnimPhase: number;
  carryingLoot: boolean;
  currentBuildingId: string | null;
  updatedAt: number;
}

export interface CoopChatItem {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}

export interface CoopSessionState {
  status: 'offline' | 'connecting' | 'connected';
  mode: 'solo' | 'create' | 'join';
  playerId: string;
  playerName: string;
  hostCode: string;
  joinCode: string;
  peerCount: number;
  peers: CoopPeerSnapshot[];
  messages: CoopChatItem[];
}

