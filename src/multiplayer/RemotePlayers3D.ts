import * as THREE from 'three';
import type { CoopPeerSnapshot, VehicleId, WeaponId } from '../types/game';
import { getDefaultVehicleTuning, VEHICLE_CONFIGS } from '../game/gameConfig';
import { createProceduralHumanoid, type HumanoidRig } from '../player/Player';
import { createPlayerArsenalSystem, type PlayerArsenalSystem } from '../player/Weapons';
import { createProceduralVehicleModel, type VehicleRig } from '../vehicles/Vehicle';
import { createHeistLootBag } from '../world/HeistSystem';
import { disposeObject3D } from '../utils/performance';

interface RemoteFriendActor {
  playerId: string;
  name: string;
  root: THREE.Group;
  humanoid: HumanoidRig;
  arsenal: PlayerArsenalSystem;
  lootBag: THREE.Group;
  nameSprite: THREE.Sprite;
  nameTexture: THREE.CanvasTexture;
  vehicleId: VehicleId | null;
  vehicleColor: string;
  vehicleTuningKey: string;
  vehicleRig: VehicleRig | null;
  currX: number;
  currY: number;
  currZ: number;
  currRotY: number;
  wheelSpin: number;
  lastEquippedWeapon: WeaponId;
}

export interface RemotePlayers3DSystem {
  group: THREE.Group;
  update: (
    dt: number,
    peers: CoopPeerSnapshot[],
    headlightsNeeded: boolean,
  ) => void;
  getObstacleCircles: () => Array<{ x: number; z: number; radius: number }>;
  dispose: () => void;
}

const FRIEND_JACKET_PALETTE = [0x10b981, 0x06b6d4, 0xf59e0b, 0x8b5cf6];

function shortestAngleLerp(current: number, target: number, alpha: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * alpha;
}

function buildFriendNameTexture(name: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 10, 368, 60, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(36, 40, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 26px Inter, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const label = name.length > 18 ? `${name.slice(0, 17)}…` : name;
  ctx.fillText(label, 56, 41);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createRemotePlayers3D(isSoftwareGl: boolean): RemotePlayers3DSystem {
  const group = new THREE.Group();
  const actors = new Map<string, RemoteFriendActor>();
  let paletteIndex = 0;

  const createActor = (peer: CoopPeerSnapshot): RemoteFriendActor => {
    const root = new THREE.Group();
    const jacketColor =
      peer.jacketColor || FRIEND_JACKET_PALETTE[paletteIndex % FRIEND_JACKET_PALETTE.length];
    paletteIndex++;

    const humanoid = createProceduralHumanoid(jacketColor, 0x0f172a, 0xf1c27d, !isSoftwareGl);
    const arsenal = createPlayerArsenalSystem(false);
    humanoid.weaponMount.add(arsenal.handGroup);
    const initWep: WeaponId = peer.weapon || 'unarmed';
    arsenal.setEquippedWeapon(initWep);

    const lootBag = createHeistLootBag();
    lootBag.visible = Boolean(peer.carryingLoot);
    humanoid.bodyGroup.add(lootBag);

    root.add(humanoid.root);

    const nameTexture = buildFriendNameTexture(peer.name || 'Do‘st');
    const nameMat = new THREE.SpriteMaterial({
      map: nameTexture,
      transparent: true,
      depthTest: false,
    });
    const nameSprite = new THREE.Sprite(nameMat);
    nameSprite.scale.set(2.5, 0.52, 1);
    nameSprite.position.set(0, 2.42, 0);
    nameSprite.renderOrder = 12;
    root.add(nameSprite);

    root.position.set(peer.x, peer.y, peer.z);
    group.add(root);

    return {
      playerId: peer.playerId,
      name: peer.name,
      root,
      humanoid,
      arsenal,
      lootBag,
      nameSprite,
      nameTexture,
      vehicleId: null,
      vehicleColor: '',
      vehicleTuningKey: '',
      vehicleRig: null,
      currX: peer.x,
      currY: peer.y,
      currZ: peer.z,
      currRotY: peer.rotY,
      wheelSpin: peer.wheelSpin || 0,
      lastEquippedWeapon: initWep,
    };
  };

  const destroyActor = (actor: RemoteFriendActor) => {
    group.remove(actor.root);
    actor.nameTexture.dispose();
    (actor.nameSprite.material as THREE.SpriteMaterial).dispose();
    disposeObject3D(actor.root);
  };

  const update = (
    dt: number,
    peers: CoopPeerSnapshot[],
    headlightsNeeded: boolean,
  ) => {
    const activeIds = new Set(peers.map((p) => p.playerId));

    for (const [id, actor] of actors.entries()) {
      if (!activeIds.has(id)) {
        destroyActor(actor);
        actors.delete(id);
      }
    }

    const nowMs = Date.now();

    for (const peer of peers) {
      let actor = actors.get(peer.playerId);
      if (!actor) {
        actor = createActor(peer);
        actors.set(peer.playerId, actor);
      }

      if (peer.name && peer.name !== actor.name) {
        actor.name = peer.name;
        const nextTex = buildFriendNameTexture(peer.name);
        (actor.nameSprite.material as THREE.SpriteMaterial).map = nextTex;
        actor.nameTexture.dispose();
        actor.nameTexture = nextTex;
      }

      const jumpDist = Math.hypot(peer.x - actor.currX, peer.z - actor.currZ);
      if (jumpDist > 38) {
        actor.currX = peer.x;
        actor.currY = peer.y;
        actor.currZ = peer.z;
        actor.currRotY = peer.rotY;
      } else {
        const posAlpha = 1 - Math.exp(-13 * dt);
        const rotAlpha = 1 - Math.exp(-15 * dt);
        actor.currX += (peer.x - actor.currX) * posAlpha;
        actor.currY += (peer.y - actor.currY) * posAlpha;
        actor.currZ += (peer.z - actor.currZ) * posAlpha;
        actor.currRotY = shortestAngleLerp(actor.currRotY, peer.rotY, rotAlpha);
      }

      actor.root.position.set(actor.currX, actor.currY, actor.currZ);

      const validVehId =
        peer.inVehicle && peer.vehicleId && VEHICLE_CONFIGS[peer.vehicleId]
          ? peer.vehicleId
          : null;

      if (validVehId) {
        actor.humanoid.root.visible = false;
        const tuning = peer.vehicleTuning ?? getDefaultVehicleTuning(validVehId);
        const tuningKey = `${tuning.rimColor}|${tuning.tireColor}|${tuning.interiorColor}|${tuning.rimStyle}|${tuning.cargoType}`;

        if (actor.vehicleId !== validVehId || !actor.vehicleRig) {
          if (actor.vehicleRig) {
            actor.root.remove(actor.vehicleRig.root);
            disposeObject3D(actor.vehicleRig.root);
          }
          actor.vehicleRig = createProceduralVehicleModel(
            validVehId,
            peer.vehicleColor || '#10b981',
            !isSoftwareGl,
            tuning,
          );
          actor.vehicleId = validVehId;
          actor.vehicleColor = peer.vehicleColor || '#10b981';
          actor.vehicleTuningKey = tuningKey;
          actor.root.add(actor.vehicleRig.root);
        } else {
          if (peer.vehicleColor && peer.vehicleColor !== actor.vehicleColor) {
            actor.vehicleColor = peer.vehicleColor;
            actor.vehicleRig.setPaintColor(peer.vehicleColor);
          }
          if (tuningKey !== actor.vehicleTuningKey) {
            actor.vehicleTuningKey = tuningKey;
            actor.vehicleRig.applyTuning(tuning);
          }
        }

        actor.vehicleRig.root.visible = true;
        actor.vehicleRig.root.rotation.y = actor.currRotY;
        actor.wheelSpin += (peer.speed || 0) * dt * 2.3;
        actor.vehicleRig.updateVisuals(
          actor.wheelSpin,
          peer.steerAngle || 0,
          headlightsNeeded || Boolean(peer.headlightsOn),
          Boolean(peer.braking),
          0,
          0,
          peer.workAnimPhase ?? 0,
        );

        const bodyStyle = VEHICLE_CONFIGS[validVehId].bodyStyle;
        const labelHeight =
          bodyStyle === 'fura' || bodyStyle === 'howo' || bodyStyle === 'kamaz' || bodyStyle === 'excavator'
            ? 4.15
            : 2.95;
        actor.nameSprite.position.set(0, labelHeight, 0);
      } else {
        if (actor.vehicleRig) {
          actor.vehicleRig.root.visible = false;
        }
        actor.humanoid.root.visible = true;
        actor.humanoid.root.rotation.y = actor.currRotY;
        actor.lootBag.visible = Boolean(peer.carryingLoot);

        const eqWep: WeaponId = peer.weapon || 'unarmed';
        if (eqWep !== actor.lastEquippedWeapon) {
          actor.lastEquippedWeapon = eqWep;
          actor.arsenal.setEquippedWeapon(eqWep);
        }

        const actionRemain = peer.firingUntil > nowMs ? (peer.firingUntil - nowMs) / 1000 : 0;

        actor.humanoid.animate(
          dt,
          Math.abs(peer.speed || 0),
          Boolean(peer.sprinting),
          true,
          eqWep,
          actionRemain,
        );
        actor.nameSprite.position.set(0, 2.42, 0);
      }
    }
  };

  const getObstacleCircles = (): Array<{ x: number; z: number; radius: number }> => {
    const out: Array<{ x: number; z: number; radius: number }> = [];
    for (const actor of actors.values()) {
      if (actor.vehicleId && actor.vehicleRig?.root.visible) {
        out.push({ x: actor.currX, z: actor.currZ, radius: 1.85 });
      }
    }
    return out;
  };

  const dispose = () => {
    for (const actor of actors.values()) {
      destroyActor(actor);
    }
    actors.clear();
  };

  return {
    group,
    update,
    getObstacleCircles,
    dispose,
  };
}
