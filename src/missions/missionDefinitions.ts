import type { MissionDefinition, MissionProgress } from '../types/game';
import { PARKING_CHALLENGE_BAY } from '../game/gameConfig';

export const MISSION_DEFINITIONS: MissionDefinition[] = [
  {
    id: 'first_steps',
    order: 1,
    titleKey: 'missions.first_steps.title',
    descKey: 'missions.first_steps.desc',
    objectiveKey: 'missions.first_steps.objective',
    startPosition: { x: -65, y: 0, z: 149 },
    rewardCoins: 600,
    rewardXp: 180,
    type: 'explore_points',
    checkpoints: [
      { position: { x: -65, y: 0, z: 130 }, radius: 8.5, labelKey: 'missions.first_steps.cp1' },
      { position: { x: 0, y: 0, z: 130 }, radius: 10.0, labelKey: 'missions.first_steps.cp2' },
      { position: { x: -130, y: 0, z: 130 }, radius: 10.0, labelKey: 'missions.first_steps.cp3' },
    ],
  },
  {
    id: 'first_ride',
    order: 2,
    prerequisiteId: 'first_steps',
    titleKey: 'missions.first_ride.title',
    descKey: 'missions.first_ride.desc',
    objectiveKey: 'missions.first_ride.objective',
    startPosition: { x: -34, y: 0, z: 149 },
    rewardCoins: 900,
    rewardXp: 250,
    type: 'enter_and_drive',
    checkpoints: [
      { position: { x: 0, y: 0, z: -65 }, radius: 12.0, labelKey: 'missions.first_ride.cp1' },
    ],
  },
  {
    id: 'city_explorer',
    order: 3,
    prerequisiteId: 'first_ride',
    titleKey: 'missions.city_explorer.title',
    descKey: 'missions.city_explorer.desc',
    objectiveKey: 'missions.city_explorer.objective',
    startPosition: { x: 0, y: 0, z: -32 },
    rewardCoins: 1400,
    rewardXp: 350,
    type: 'visit_districts',
    checkpoints: [
      { position: { x: -65, y: 0, z: 65 }, radius: 10.5, labelKey: 'missions.city_explorer.cp1' },
      { position: { x: 28, y: 0, z: 56 }, radius: 10.5, labelKey: 'missions.city_explorer.cp2' },
      { position: { x: 130, y: 0, z: -95 }, radius: 12.0, labelKey: 'missions.city_explorer.cp3' },
    ],
  },
  {
    id: 'delivery_run',
    order: 4,
    prerequisiteId: 'city_explorer',
    titleKey: 'missions.delivery_run.title',
    descKey: 'missions.delivery_run.desc',
    objectiveKey: 'missions.delivery_run.objective',
    startPosition: { x: 130, y: 0, z: 105 },
    rewardCoins: 1800,
    rewardXp: 420,
    type: 'timed_delivery',
    timeLimitSeconds: 110,
    checkpoints: [
      { position: { x: 130, y: 0, z: 45 }, radius: 12.0, labelKey: 'missions.delivery_run.cp1' },
      { position: { x: 0, y: 0, z: -195 }, radius: 13.0, labelKey: 'missions.delivery_run.cp2' },
    ],
  },
  {
    id: 'parking_challenge',
    order: 5,
    prerequisiteId: 'delivery_run',
    titleKey: 'missions.parking_challenge.title',
    descKey: 'missions.parking_challenge.desc',
    objectiveKey: 'missions.parking_challenge.objective',
    startPosition: { x: 12, y: 0, z: 88 },
    rewardCoins: 1600,
    rewardXp: 400,
    type: 'parking',
    requiresStopInZone: true,
    checkpoints: [
      { position: { ...PARKING_CHALLENGE_BAY }, radius: 5.0, labelKey: 'missions.parking_challenge.cp1' },
    ],
  },
  {
    id: 'traffic_test',
    order: 6,
    prerequisiteId: 'parking_challenge',
    titleKey: 'missions.traffic_test.title',
    descKey: 'missions.traffic_test.desc',
    objectiveKey: 'missions.traffic_test.objective',
    startPosition: { x: 0, y: 0, z: 24 },
    rewardCoins: 2400,
    rewardXp: 600,
    type: 'safe_traffic',
    targetDistanceMeters: 650,
    maxCollisions: 0,
    checkpoints: [],
  },
];

export function createInitialMissionProgress(): Record<string, MissionProgress> {
  const map: Record<string, MissionProgress> = {};
  for (const def of MISSION_DEFINITIONS) {
    map[def.id] = {
      id: def.id,
      status: def.prerequisiteId ? 'locked' : 'available',
      currentStep: 0,
      totalSteps: Math.max(1, def.checkpoints.length),
      distanceAccumulated: 0,
      remainingSeconds: def.timeLimitSeconds ?? null,
      collisionsCount: 0,
    };
  }
  return map;
}

export function getMissionDefinition(id: string): MissionDefinition | undefined {
  return MISSION_DEFINITIONS.find((m) => m.id === id);
}
