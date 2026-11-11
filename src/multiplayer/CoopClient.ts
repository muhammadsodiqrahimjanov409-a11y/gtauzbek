import type {
  CoopChatItem,
  CoopPeerSnapshot,
  VehicleCustomTuning,
  VehicleId,
  WeaponId,
} from '../types/game';
import { ENTERABLE_BUILDINGS, getHeistTarget } from '../game/gameConfig';
import { formatNCoins } from '../economy/EconomyManager';
import { engineCommandRef, useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';
import { audioEngine } from '../utils/audio';

export function computePairedCodesClient(
  mode: 'create' | 'join',
  rawCode: string,
): { hostCode: string; joinCode: string } {
  const clean = rawCode.trim().replace(/\s+/g, '') || (mode === 'create' ? '01072015' : '01072016');
  if (clean === '01072015' || clean === '01072016') {
    return {
      hostCode: '01072015',
      joinCode: '01072016',
    };
  }
  if (/^\d{3,16}$/.test(clean)) {
    const len = clean.length;
    const val = BigInt(clean);
    if (mode === 'create') {
      const nextStr = (val + 1n).toString().padStart(len, '0');
      return { hostCode: clean, joinCode: nextStr };
    } else {
      const prevVal = val > 0n ? val - 1n : 0n;
      const prevStr = prevVal.toString().padStart(len, '0');
      return { hostCode: prevStr, joinCode: clean };
    }
  }
  return {
    hostCode: clean,
    joinCode: `${clean}2`,
  };
}

export interface OutgoingPlayerSyncPayload {
  x: number;
  y: number;
  z: number;
  rotY: number;
  speed: number;
  sprinting: boolean;
  weapon: WeaponId;
  firedNow: boolean;
  inVehicle: boolean;
  vehicleId: VehicleId | null;
  vehicleColor: string;
  vehicleTuning?: VehicleCustomTuning;
  steerAngle: number;
  wheelSpin: number;
  headlightsOn: boolean;
  braking: boolean;
  workAnimPhase: number;
  carryingLoot: boolean;
  currentBuildingId: string | null;
}

class CoopMultiplayerClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private desiredMode: 'solo' | 'create' | 'join' = 'solo';
  private desiredCode = '01072015';
  private desiredName = 'O‘yinchi';
  private lastSentUpdateMs = 0;
  private lastSentInVehicle = false;
  private lastSentVehicleId: VehicleId | null = null;
  private hasAutoTeleportedOnJoin = false;

  public connectAndJoin(mode: 'create' | 'join', rawCode: string, rawPlayerName: string): void {
    const cleanCode = rawCode.trim().replace(/\s+/g, '') || (mode === 'create' ? '01072015' : '01072016');
    const dict = getTranslations(useSettingsStore.getState().language);
    const cleanName =
      (rawPlayerName || dict.coop.playerNamePlaceholder).trim().slice(0, 22) ||
      dict.coop.playerNamePlaceholder;
    const paired = computePairedCodesClient(mode, cleanCode);

    this.desiredMode = mode;
    this.desiredCode = cleanCode;
    this.desiredName = cleanName;
    this.hasAutoTeleportedOnJoin = false;

    this.cleanupSocketOnly();

    useGameStore.getState().setCoopPatch({
      mode,
      status: 'connecting',
      hostCode: paired.hostCode,
      joinCode: paired.joinCode,
      playerName: cleanName,
      peerCount: 1,
      peers: [],
    });

    this.openSocket();
  }

  public disconnectToSolo(): void {
    this.desiredMode = 'solo';
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'room:leave' }));
      } catch {
        // Ignore close race
      }
    }
    this.cleanupSocketOnly();

    useGameStore.getState().setCoopPatch({
      mode: 'solo',
      status: 'offline',
      peerCount: 1,
      peers: [],
    });
  }

  public sendLocalUpdate(payload: OutgoingPlayerSyncPayload, forceImmediate = false): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.desiredMode === 'solo') {
      return;
    }

    const now = performance.now();
    const vehicleChanged =
      payload.inVehicle !== this.lastSentInVehicle || payload.vehicleId !== this.lastSentVehicleId;

    if (!forceImmediate && !payload.firedNow && !vehicleChanged && now - this.lastSentUpdateMs < 55) {
      return;
    }

    this.lastSentUpdateMs = now;
    this.lastSentInVehicle = payload.inVehicle;
    this.lastSentVehicleId = payload.vehicleId;

    try {
      this.ws.send(
        JSON.stringify({
          type: 'player:update',
          state: payload,
        }),
      );
    } catch {
      // Handled by onclose
    }
  }

  public sendHeistStart(buildingId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.desiredMode === 'solo') return;
    try {
      this.ws.send(
        JSON.stringify({
          type: 'heist:start',
          buildingId,
        }),
      );
    } catch {
      // Ignore
    }
  }

  public sendHeistComplete(buildingId: string, rewardCoins: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.desiredMode === 'solo') return;
    try {
      this.ws.send(
        JSON.stringify({
          type: 'heist:complete',
          buildingId,
          rewardCoins,
        }),
      );
    } catch {
      // Ignore
    }
  }

  public sendChat(rawText: string): void {
    const clean = rawText.trim().slice(0, 140);
    if (!clean) return;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.desiredMode === 'solo') return;
    try {
      this.ws.send(
        JSON.stringify({
          type: 'chat:send',
          text: clean,
        }),
      );
    } catch {
      // Ignore
    }
  }

  private openSocket(): void {
    if (typeof window === 'undefined' || this.desiredMode === 'solo') return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws`;

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket || this.desiredMode === 'solo') return;

      const store = useGameStore.getState();
      const activeVeh = store.player.inVehicleInstanceId
        ? store.vehicles.find((v) => v.instanceId === store.player.inVehicleInstanceId) ?? null
        : null;

      socket.send(
        JSON.stringify({
          type: 'room:join',
          playerId: store.coop.playerId,
          playerName: this.desiredName,
          mode: this.desiredMode,
          code: this.desiredCode,
          state: {
            x: store.player.position.x,
            y: store.player.position.y,
            z: store.player.position.z,
            rotY: store.player.rotationY,
            speed: 0,
            sprinting: false,
            weapon: store.equippedWeapon,
            inVehicle: Boolean(activeVeh),
            vehicleId: activeVeh ? activeVeh.vehicleId : null,
            vehicleColor: activeVeh ? activeVeh.color : '#3b82f6',
            vehicleTuning: activeVeh ? activeVeh.tuning : null,
            steerAngle: 0,
            wheelSpin: 0,
            headlightsOn: false,
            braking: false,
            workAnimPhase: activeVeh?.workAnimPhase ?? 0,
            carryingLoot: store.heist.carryingLootUntil > Date.now(),
            currentBuildingId: store.currentBuildingId,
          },
        }),
      );

      if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => {
        if (this.ws === socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // Ignore
          }
        }
      }, 15_000);
    };

    socket.onmessage = (ev) => {
      if (this.ws !== socket) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    socket.onerror = () => {
      // Handled cleanly in onclose
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      if (this.pingTimer !== null) {
        window.clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (this.desiredMode !== 'solo') {
        useGameStore.getState().setCoopPatch({
          status: 'connecting',
        });
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.desiredMode === 'solo') return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.desiredMode !== 'solo') {
        this.openSocket();
      }
    }, 1500);
  }

  private cleanupSocketOnly(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      try {
        old.close();
      } catch {
        // Ignore
      }
    }
  }

  private handleServerMessage(msg: Record<string, unknown>): void {
    const type = typeof msg.type === 'string' ? msg.type : '';
    const store = useGameStore.getState();
    const lang = useSettingsStore.getState().language;
    const dict = getTranslations(lang);

    if (type === 'room:welcome') {
      const playerId = typeof msg.playerId === 'string' ? msg.playerId : store.coop.playerId;
      const hostCode = typeof msg.hostCode === 'string' ? msg.hostCode : store.coop.hostCode;
      const joinCode = typeof msg.joinCode === 'string' ? msg.joinCode : store.coop.joinCode;
      const rawPeers = Array.isArray(msg.peers) ? (msg.peers as CoopPeerSnapshot[]) : [];
      const filteredPeers = rawPeers.filter(
        (p) => p && typeof p.playerId === 'string' && p.playerId !== playerId,
      );
      const peerCount = typeof msg.peerCount === 'number' ? msg.peerCount : filteredPeers.length + 1;
      const welcomeMsgs = Array.isArray(msg.messages) ? (msg.messages as CoopChatItem[]) : store.coop.messages;

      store.setCoopPatch({
        status: 'connected',
        playerId,
        hostCode,
        joinCode,
        peerCount,
        peers: filteredPeers,
        messages: welcomeMsgs,
      });

      if (Array.isArray(msg.robbedVenues)) {
        store.syncRobbedVenuesFromServer(
          msg.robbedVenues as Array<{ buildingId: string; robbedUntil: number }>,
        );
      }

      audioEngine.playNotification();
      if (this.desiredMode === 'create') {
        store.showToast(`${dict.coop.roomCreatedToast} ${joinCode}`, 'success');
      } else {
        store.showToast(dict.coop.roomJoinedToast, 'success');
        if (!this.hasAutoTeleportedOnJoin && filteredPeers.length > 0) {
          this.hasAutoTeleportedOnJoin = true;
          const firstFriend = filteredPeers[0];
          engineCommandRef.teleportToFriend = {
            x: firstFriend.x,
            y: firstFriend.y,
            z: firstFriend.z,
          };
        }
      }
      return;
    }

    if (type === 'peer:joined') {
      const peer = msg.peer as CoopPeerSnapshot | undefined;
      const peerCount = typeof msg.peerCount === 'number' ? msg.peerCount : undefined;
      if (peer && typeof peer.playerId === 'string' && peer.playerId !== store.coop.playerId) {
        store.upsertCoopPeer(peer, peerCount);
        audioEngine.playNotification();
        store.showToast(`${dict.coop.friendJoinedToast} ${peer.name}`, 'success');
      }
      return;
    }

    if (type === 'peer:updated') {
      const peer = msg.peer as CoopPeerSnapshot | undefined;
      const firedNow = Boolean(msg.firedNow);
      if (peer && typeof peer.playerId === 'string' && peer.playerId !== store.coop.playerId) {
        store.upsertCoopPeer(peer);
        if (firedNow && peer.weapon && peer.weapon !== 'unarmed') {
          const dist = Math.hypot(
            peer.x - store.player.position.x,
            peer.z - store.player.position.z,
          );
          if (dist < 68) {
            audioEngine.playWeaponSound(peer.weapon);
          }
        }
      }
      return;
    }

    if (type === 'peer:left') {
      const leftId = typeof msg.playerId === 'string' ? msg.playerId : '';
      const peerCount = typeof msg.peerCount === 'number' ? msg.peerCount : undefined;
      if (leftId) {
        const prevPeer = store.coop.peers.find((p) => p.playerId === leftId);
        store.removeCoopPeer(leftId, peerCount);
        if (prevPeer) {
          store.showToast(`${dict.coop.friendLeftToast} ${prevPeer.name}`, 'info');
        }
      }
      return;
    }

    if (type === 'heist:started') {
      const buildingId = typeof msg.buildingId === 'string' ? msg.buildingId : '';
      const initiatorId = typeof msg.initiatorId === 'string' ? msg.initiatorId : '';
      if (buildingId && initiatorId && initiatorId !== store.coop.playerId) {
        const bld = ENTERABLE_BUILDINGS.find((b) => b.id === buildingId);
        const venueLabel = bld ? resolveNestedKey(dict, bld.nameKey) : buildingId;
        audioEngine.playNotification();
        store.showToast(`${dict.heist.friendStartedToast} ${venueLabel}`, 'warning');
      }
      return;
    }

    if (type === 'heist:completed') {
      const buildingId = typeof msg.buildingId === 'string' ? msg.buildingId : '';
      const rewardCoins = Number(msg.rewardCoins) || 0;
      const robbedUntil = Number(msg.robbedUntil) || Date.now() + 90_000;
      if (buildingId && rewardCoins > 0) {
        const targetCfg = getHeistTarget(buildingId);
        const bld = ENTERABLE_BUILDINGS.find((b) => b.id === buildingId);
        const venueLabel = bld ? resolveNestedKey(dict, bld.nameKey) : buildingId;
        const wantedStars = targetCfg ? targetCfg.wantedStars : 2;
        const toastMsg = `${dict.heist.completedCoopPrefix} ${venueLabel} (+${formatNCoins(rewardCoins)} N-Coin)`;
        store.completeHeistReward(buildingId, rewardCoins, robbedUntil, wantedStars, toastMsg);
      }
      return;
    }

    if (type === 'heist:cooldown') {
      const buildingId = typeof msg.buildingId === 'string' ? msg.buildingId : '';
      const robbedUntil = Number(msg.robbedUntil) || 0;
      if (buildingId && robbedUntil > Date.now()) {
        store.syncRobbedVenuesFromServer([{ buildingId, robbedUntil }]);
      }
      return;
    }

    if (type === 'chat:message') {
      const item = msg.message as CoopChatItem | undefined;
      if (item && typeof item.id === 'string' && typeof item.text === 'string') {
        store.appendCoopMessage(item);
        audioEngine.playNotification();
        if (item.senderId !== store.coop.playerId) {
          store.showToast(`${item.senderName}: ${item.text}`, 'info');
        }
      }
    }
  }
}

export const coopClient = new CoopMultiplayerClient();
