import type { MissionProgress, Vec3 } from '../types/game';
import { getMissionDefinition, MISSION_DEFINITIONS } from './missionDefinitions';

export interface MissionTickInput {
  dt: number;
  playerPosition: Vec3;
  inVehicle: boolean;
  vehicleSpeed: number;
  frameDrivenMeters: number;
  hadVehicleCollision: boolean;
}

export interface MissionTickOutcome {
  updatedProgress?: MissionProgress;
  unlockedIds?: string[];
  completedMissionId?: string;
  failedReason?: 'timeout' | 'crash';
}

export function startOrRetryMission(
  missions: Record<string, MissionProgress>,
  missionId: string,
): Record<string, MissionProgress> | null {
  const def = getMissionDefinition(missionId);
  const existing = missions[missionId];
  if (!def || !existing) return null;
  if (existing.status === 'locked') return null;

  const next: Record<string, MissionProgress> = { ...missions };
  // Pause any currently active mission back to available
  for (const key of Object.keys(next)) {
    if (next[key].status === 'active' && key !== missionId) {
      next[key] = {
        ...next[key],
        status: 'available',
        currentStep: 0,
        distanceAccumulated: 0,
        remainingSeconds: getMissionDefinition(key)?.timeLimitSeconds ?? null,
        collisionsCount: 0,
      };
    }
  }

  next[missionId] = {
    id: missionId,
    status: 'active',
    currentStep: 0,
    totalSteps: Math.max(1, def.checkpoints.length),
    distanceAccumulated: 0,
    remainingSeconds: def.timeLimitSeconds ?? null,
    collisionsCount: 0,
  };

  return next;
}

export function evaluateActiveMission(
  activeId: string | null,
  missions: Record<string, MissionProgress>,
  input: MissionTickInput,
): MissionTickOutcome {
  if (!activeId) return {};
  const def = getMissionDefinition(activeId);
  const prog = missions[activeId];
  if (!def || !prog || prog.status !== 'active') return {};

  let remainingSeconds = prog.remainingSeconds;
  if (remainingSeconds !== null) {
    remainingSeconds = Math.max(0, remainingSeconds - input.dt);
    if (remainingSeconds <= 0) {
      return {
        updatedProgress: {
          ...prog,
          remainingSeconds: 0,
          status: 'failed',
        },
        failedReason: 'timeout',
      };
    }
  }

  // Safe traffic driving mission
  if (def.type === 'safe_traffic') {
    if (input.inVehicle && input.hadVehicleCollision) {
      return {
        updatedProgress: {
          ...prog,
          collisionsCount: prog.collisionsCount + 1,
          status: 'failed',
        },
        failedReason: 'crash',
      };
    }

    const nextDist = input.inVehicle ? prog.distanceAccumulated + input.frameDrivenMeters : prog.distanceAccumulated;
    const targetDist = def.targetDistanceMeters ?? 450;

    if (nextDist >= targetDist) {
      return completeMissionOutcome(def.id, {
        ...prog,
        distanceAccumulated: targetDist,
        currentStep: 1,
        status: 'completed',
      }, missions);
    }

    if (Math.abs(nextDist - prog.distanceAccumulated) > 0.25) {
      return {
        updatedProgress: {
          ...prog,
          distanceAccumulated: nextDist,
          remainingSeconds,
        },
      };
    }
    return {};
  }

  // Checkpoint-based missions
  const currentCp = def.checkpoints[prog.currentStep];
  if (!currentCp) return {};

  const dx = input.playerPosition.x - currentCp.position.x;
  const dz = input.playerPosition.z - currentCp.position.z;
  const distSq = dx * dx + dz * dz;

  const withinRadius = distSq <= currentCp.radius * currentCp.radius;

  if (withinRadius) {
    if (def.type === 'enter_and_drive' && !input.inVehicle) {
      // Must arrive in a vehicle
    } else if (def.type === 'parking') {
      // Must be in vehicle and stopped cleanly inside bay
      if (input.inVehicle && Math.abs(input.vehicleSpeed) < 0.85) {
        return completeMissionOutcome(
          def.id,
          {
            ...prog,
            currentStep: 1,
            status: 'completed',
            remainingSeconds,
          },
          missions,
        );
      }
    } else {
      const nextStep = prog.currentStep + 1;
      if (nextStep >= def.checkpoints.length) {
        return completeMissionOutcome(
          def.id,
          {
            ...prog,
            currentStep: nextStep,
            status: 'completed',
            remainingSeconds,
          },
          missions,
        );
      }
      return {
        updatedProgress: {
          ...prog,
          currentStep: nextStep,
          remainingSeconds,
        },
      };
    }
  }

  if (remainingSeconds !== prog.remainingSeconds) {
    return {
      updatedProgress: {
        ...prog,
        remainingSeconds,
      },
    };
  }

  return {};
}

function completeMissionOutcome(
  completedId: string,
  completedProgress: MissionProgress,
  missions: Record<string, MissionProgress>,
): MissionTickOutcome {
  const unlockedIds: string[] = [];
  for (const m of MISSION_DEFINITIONS) {
    if (m.prerequisiteId === completedId && missions[m.id]?.status === 'locked') {
      unlockedIds.push(m.id);
    }
  }
  return {
    updatedProgress: completedProgress,
    unlockedIds,
    completedMissionId: completedId,
  };
}
