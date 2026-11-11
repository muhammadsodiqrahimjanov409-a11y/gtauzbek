import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { RawData } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const HEIST_COOLDOWN_MS = 90_000;
const ROOM_IDLE_TTL_MS = 15 * 60 * 1000;

interface PeerTuningSnapshot {
  tireColor: string;
  interiorColor: string;
  rimColor: string;
  rimStyle: string;
  cargoType: string;
}

interface PeerState {
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
  weapon: string;
  firingUntil: number;
  inVehicle: boolean;
  vehicleId: string | null;
  vehicleColor: string;
  vehicleTuning: PeerTuningSnapshot | null;
  steerAngle: number;
  wheelSpin: number;
  headlightsOn: boolean;
  braking: boolean;
  workAnimPhase: number;
  carryingLoot: boolean;
  currentBuildingId: string | null;
  updatedAt: number;
}

interface RobbedVenueRecord {
  buildingId: string;
  robbedUntil: number;
  robbedBy: string;
}

interface CoopChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
}

interface CoopRoom {
  roomKey: string;
  hostCode: string;
  joinCode: string;
  peers: Map<string, PeerState>;
  sockets: Map<string, WebSocket>;
  robbedVenues: Map<string, RobbedVenueRecord>;
  messages: CoopChatMessage[];
  lastActiveAt: number;
}

const rooms = new Map<string, CoopRoom>();
const codeToRoomKey = new Map<string, string>();

function sanitizeCode(raw: unknown, fallback: string): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 16);
  return cleaned || fallback;
}

function shiftNumericCode(code: string, delta: number): string {
  if (!/^\d+$/.test(code)) {
    return delta > 0 ? `${code}2` : code;
  }
  const width = code.length;
  const num = BigInt(code);
  const next = num + BigInt(delta);
  if (next < 0n) return code;
  return next.toString().padStart(width, '0');
}

function resolveOrProvisionRoom(rawCode: unknown, mode: 'create' | 'join'): CoopRoom {
  const defaultCode = mode === 'create' ? '01072015' : '01072016';
  const code = sanitizeCode(rawCode, defaultCode);

  // Explicit canonical pairing for the signature codes 01072015 (Host) <-> 01072016 (Friend Join)
  if (code === '01072015' || code === '01072016') {
    const canonicalKey = 'room_01072015';
    let room = rooms.get(canonicalKey);
    if (!room) {
      room = {
        roomKey: canonicalKey,
        hostCode: '01072015',
        joinCode: '01072016',
        peers: new Map(),
        sockets: new Map(),
        robbedVenues: new Map(),
        messages: [],
        lastActiveAt: Date.now(),
      };
      rooms.set(canonicalKey, room);
      codeToRoomKey.set('01072015', canonicalKey);
      codeToRoomKey.set('01072016', canonicalKey);
    }
    room.lastActiveAt = Date.now();
    return room;
  }

  const existingKey = codeToRoomKey.get(code);
  if (existingKey) {
    const found = rooms.get(existingKey);
    if (found) {
      found.lastActiveAt = Date.now();
      return found;
    }
  }

  let hostCode = code;
  let joinCode = shiftNumericCode(code, 1);
  if (mode === 'join' && /^\d+$/.test(code)) {
    hostCode = shiftNumericCode(code, -1);
    joinCode = code;
  }

  const roomKey = `room_${hostCode}`;
  let room = rooms.get(roomKey);
  if (!room) {
    room = {
      roomKey,
      hostCode,
      joinCode,
      peers: new Map(),
      sockets: new Map(),
      robbedVenues: new Map(),
      messages: [],
      lastActiveAt: Date.now(),
    };
    rooms.set(roomKey, room);
  }
  codeToRoomKey.set(room.hostCode, roomKey);
  codeToRoomKey.set(room.joinCode, roomKey);
  room.lastActiveAt = Date.now();
  return room;
}

function serializeRobbedVenues(room: CoopRoom): RobbedVenueRecord[] {
  const now = Date.now();
  const list: RobbedVenueRecord[] = [];
  for (const [bid, rec] of room.robbedVenues.entries()) {
    if (rec.robbedUntil > now) {
      list.push(rec);
    } else {
      room.robbedVenues.delete(bid);
    }
  }
  return list;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: CoopRoom, payload: unknown, excludePlayerId?: string): void {
  const encoded = JSON.stringify(payload);
  for (const [pid, sock] of room.sockets.entries()) {
    if (excludePlayerId && pid === excludePlayerId) continue;
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(encoded);
    }
  }
}

function clampFinite(val: unknown, fallback: number, min = -2000, max = 2000): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function bootstrapServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/coop/health', (_req, res) => {
    let onlinePlayers = 0;
    for (const room of rooms.values()) {
      onlinePlayers += room.peers.size;
    }
    res.json({
      ok: true,
      activeRooms: rooms.size,
      onlinePlayers,
    });
  });

  app.get('/api/coop/room/:code', (req, res) => {
    const code = sanitizeCode(req.params.code, '');
    const roomKey = codeToRoomKey.get(code);
    const room = roomKey ? rooms.get(roomKey) : undefined;
    if (!room) {
      res.json({
        exists: false,
        code,
        peerCount: 0,
      });
      return;
    }
    res.json({
      exists: true,
      hostCode: room.hostCode,
      joinCode: room.joinCode,
      peerCount: room.peers.size,
    });
  });

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let attachedRoomKey: string | null = null;
    let attachedPlayerId: string | null = null;

    const detachCurrentRoom = () => {
      if (!attachedRoomKey || !attachedPlayerId) return;
      const room = rooms.get(attachedRoomKey);
      if (room) {
        const existed = room.peers.delete(attachedPlayerId);
        room.sockets.delete(attachedPlayerId);
        room.lastActiveAt = Date.now();
        if (existed) {
          broadcastRoom(room, {
            type: 'peer:left',
            playerId: attachedPlayerId,
            peerCount: room.peers.size,
          });
        }
      }
      attachedRoomKey = null;
      attachedPlayerId = null;
    };

    ws.on('message', (raw: RawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type ?? '');

      if (type === 'ping') {
        sendJson(ws, { type: 'pong', ts: Date.now() });
        return;
      }

      if (type === 'room:leave') {
        detachCurrentRoom();
        sendJson(ws, { type: 'room:left' });
        return;
      }

      if (type === 'room:join') {
        const requestedPlayerId = sanitizeCode(
          msg.playerId,
          `p_${Math.random().toString(36).slice(2, 10)}`,
        );
        const mode: 'create' | 'join' = msg.mode === 'join' ? 'join' : 'create';
        const room = resolveOrProvisionRoom(msg.code, mode);

        if (attachedRoomKey && (attachedRoomKey !== room.roomKey || attachedPlayerId !== requestedPlayerId)) {
          detachCurrentRoom();
        }

        // Guard idempotently if reconnecting with same playerId
        const prevSock = room.sockets.get(requestedPlayerId);
        if (prevSock && prevSock !== ws && prevSock.readyState === WebSocket.OPEN) {
          prevSock.close();
        }

        const safeName =
          String(msg.playerName ?? '')
            .trim()
            .slice(0, 22) || (mode === 'create' ? 'Mezbon' : 'Do‘st');

        const palette = [0x10b981, 0x06b6d4, 0xf59e0b, 0xa855f7, 0xf43f5e, 0x3b82f6];
        const jacketColor =
          typeof msg.jacketColor === 'number' && Number.isFinite(msg.jacketColor)
            ? msg.jacketColor
            : palette[room.peers.size % palette.length];

        const initState = (msg.state ?? {}) as Record<string, unknown>;
        const peerState: PeerState = {
          playerId: requestedPlayerId,
          name: safeName,
          role: mode === 'create' ? 'host' : 'guest',
          jacketColor,
          x: clampFinite(initState.x, -65),
          y: clampFinite(initState.y, 0, -20, 120),
          z: clampFinite(initState.z, 158),
          rotY: clampFinite(initState.rotY, Math.PI, -Math.PI * 4, Math.PI * 4),
          speed: clampFinite(initState.speed, 0, -100, 100),
          sprinting: Boolean(initState.sprinting),
          weapon: String(initState.weapon ?? 'pistol').slice(0, 20),
          firingUntil: 0,
          inVehicle: Boolean(initState.inVehicle),
          vehicleId: initState.vehicleId ? String(initState.vehicleId).slice(0, 24) : null,
          vehicleColor: String(initState.vehicleColor ?? '#10B981').slice(0, 16),
          vehicleTuning:
            initState.vehicleTuning && typeof initState.vehicleTuning === 'object'
              ? (initState.vehicleTuning as PeerTuningSnapshot)
              : null,
          steerAngle: clampFinite(initState.steerAngle, 0, -1.5, 1.5),
          wheelSpin: clampFinite(initState.wheelSpin, 0, -1e6, 1e6),
          headlightsOn: Boolean(initState.headlightsOn),
          braking: Boolean(initState.braking),
          workAnimPhase: clampFinite(initState.workAnimPhase, 0, 0, 1),
          carryingLoot: Boolean(initState.carryingLoot),
          currentBuildingId: initState.currentBuildingId
            ? String(initState.currentBuildingId).slice(0, 40)
            : null,
          updatedAt: Date.now(),
        };

        const alreadyPresent = room.peers.has(requestedPlayerId);
        room.peers.set(requestedPlayerId, peerState);
        room.sockets.set(requestedPlayerId, ws);
        room.lastActiveAt = Date.now();

        attachedRoomKey = room.roomKey;
        attachedPlayerId = requestedPlayerId;

        const otherPeers: PeerState[] = [];
        for (const [pid, ps] of room.peers.entries()) {
          if (pid !== requestedPlayerId) {
            otherPeers.push(ps);
          }
        }

        sendJson(ws, {
          type: 'room:welcome',
          playerId: requestedPlayerId,
          roomKey: room.roomKey,
          hostCode: room.hostCode,
          joinCode: room.joinCode,
          peerCount: room.peers.size,
          self: peerState,
          peers: otherPeers,
          robbedVenues: serializeRobbedVenues(room),
          messages: room.messages.slice(-15),
        });

        broadcastRoom(
          room,
          {
            type: alreadyPresent ? 'peer:updated' : 'peer:joined',
            peer: peerState,
            peerCount: room.peers.size,
          },
          requestedPlayerId,
        );
        return;
      }

      if (!attachedRoomKey || !attachedPlayerId) return;
      const room = rooms.get(attachedRoomKey);
      if (!room) return;
      const currentPeer = room.peers.get(attachedPlayerId);
      if (!currentPeer) return;
      room.lastActiveAt = Date.now();

      if (type === 'player:update') {
        const patch = (msg.state ?? msg) as Record<string, unknown>;
        currentPeer.x = clampFinite(patch.x, currentPeer.x);
        currentPeer.y = clampFinite(patch.y, currentPeer.y, -20, 120);
        currentPeer.z = clampFinite(patch.z, currentPeer.z);
        currentPeer.rotY = clampFinite(patch.rotY, currentPeer.rotY, -Math.PI * 8, Math.PI * 8);
        currentPeer.speed = clampFinite(patch.speed, currentPeer.speed, -120, 120);
        currentPeer.sprinting = Boolean(patch.sprinting);
        if (typeof patch.weapon === 'string') {
          currentPeer.weapon = patch.weapon.slice(0, 20);
        }
        if (patch.firedNow) {
          currentPeer.firingUntil = Date.now() + 260;
        }
        currentPeer.inVehicle = Boolean(patch.inVehicle);
        currentPeer.vehicleId = patch.vehicleId ? String(patch.vehicleId).slice(0, 24) : null;
        if (typeof patch.vehicleColor === 'string') {
          currentPeer.vehicleColor = patch.vehicleColor.slice(0, 16);
        }
        if (patch.vehicleTuning && typeof patch.vehicleTuning === 'object') {
          currentPeer.vehicleTuning = patch.vehicleTuning as PeerTuningSnapshot;
        }
        currentPeer.steerAngle = clampFinite(patch.steerAngle, 0, -1.5, 1.5);
        currentPeer.wheelSpin = clampFinite(patch.wheelSpin, currentPeer.wheelSpin, -1e7, 1e7);
        currentPeer.headlightsOn = Boolean(patch.headlightsOn);
        currentPeer.braking = Boolean(patch.braking);
        currentPeer.workAnimPhase = clampFinite(patch.workAnimPhase, 0, 0, 1);
        currentPeer.carryingLoot = Boolean(patch.carryingLoot);
        currentPeer.currentBuildingId = patch.currentBuildingId
          ? String(patch.currentBuildingId).slice(0, 40)
          : null;
        currentPeer.updatedAt = Date.now();

        broadcastRoom(
          room,
          {
            type: 'peer:updated',
            peer: currentPeer,
            firedNow: Boolean(patch.firedNow),
          },
          attachedPlayerId,
        );
        return;
      }

      if (type === 'heist:start') {
        const buildingId = String(msg.buildingId ?? '').slice(0, 40);
        if (!buildingId) return;
        const now = Date.now();
        const existing = room.robbedVenues.get(buildingId);
        if (existing && existing.robbedUntil > now) return;

        broadcastRoom(
          room,
          {
            type: 'heist:started',
            buildingId,
            initiatorId: attachedPlayerId,
            initiatorName: currentPeer.name,
          },
          attachedPlayerId,
        );
        return;
      }

      if (type === 'heist:complete') {
        const buildingId = String(msg.buildingId ?? '').slice(0, 40);
        if (!buildingId) return;
        const now = Date.now();
        const existing = room.robbedVenues.get(buildingId);
        if (existing && existing.robbedUntil > now) {
          sendJson(ws, {
            type: 'heist:cooldown',
            buildingId,
            robbedUntil: existing.robbedUntil,
          });
          return;
        }

        const rewardCoins = clampFinite(msg.rewardCoins, 250_000, 10_000, 50_000_000);
        const robbedUntil = now + HEIST_COOLDOWN_MS;
        const record: RobbedVenueRecord = {
          buildingId,
          robbedUntil,
          robbedBy: currentPeer.name,
        };
        room.robbedVenues.set(buildingId, record);
        currentPeer.carryingLoot = true;

        const heistEventId = `${buildingId}_${now}`;
        broadcastRoom(room, {
          type: 'heist:completed',
          heistEventId,
          buildingId,
          rewardCoins,
          initiatorId: attachedPlayerId,
          initiatorName: currentPeer.name,
          robbedUntil,
        });
        return;
      }

      if (type === 'chat:send') {
        const text = String(msg.text ?? '')
          .trim()
          .slice(0, 140);
        if (!text) return;
        const chatMsg: CoopChatMessage = {
          id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          senderId: attachedPlayerId,
          senderName: currentPeer.name,
          text,
          createdAt: Date.now(),
        };
        room.messages.push(chatMsg);
        if (room.messages.length > 25) {
          room.messages.splice(0, room.messages.length - 25);
        }
        broadcastRoom(room, {
          type: 'chat:message',
          message: chatMsg,
        });
      }
    });

    ws.on('close', detachCurrentRoom);
    ws.on('error', detachCurrentRoom);
  });

  // Periodic cleanup of long-idle empty rooms
  setInterval(() => {
    const now = Date.now();
    for (const [key, room] of rooms.entries()) {
      if (room.peers.size === 0 && now - room.lastActiveAt > ROOM_IDLE_TTL_MS) {
        codeToRoomKey.delete(room.hostCode);
        codeToRoomKey.delete(room.joinCode);
        rooms.delete(key);
      }
    }
  }, 60_000).unref();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        watch: hmrDisabled ? null : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Nexus City Co-op Server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrapServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
