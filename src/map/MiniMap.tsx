import React from 'react';
import {
  CITY_RACE_CHECKPOINTS,
  CITY_RACE_START_POS,
  DEALERSHIP_LOCATION,
  DISTRICTS,
  ENTERABLE_BUILDINGS,
  GAS_STATION_LOCATION,
  METRO_LOOP_CORNERS,
  METRO_STATIONS,
  ROAD_COORDS,
  ROAD_WIDTH,
  SAFEHOUSE_LOCATION,
  WORLD_PLAYABLE_LIMIT,
} from '../game/gameConfig';
import { MISSION_DEFINITIONS } from '../missions/missionDefinitions';
import { computeNavigationRoute } from './Navigation';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations } from '../i18n';

const RADAR_SIZE = 148;
const RADAR_HALF = RADAR_SIZE * 0.5;

export const MiniMap: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const vehicles = useGameStore((s) => s.vehicles);
  const missions = useGameStore((s) => s.missions);
  const activeMissionId = useGameStore((s) => s.activeMissionId);
  const customWaypoint = useGameStore((s) => s.customWaypoint);
  const policeUnits = useGameStore((s) => s.policeUnits);
  const raceState = useGameStore((s) => s.raceState);
  const metroRide = useGameStore((s) => s.metroRide);
  const ownedProperties = useGameStore((s) => s.inventory.ownedProperties);
  const coopPeers = useGameStore((s) => s.coop.peers);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const px = player.position.x;
  const pz = player.position.z;

  // Wider lookahead when driving or riding Sky-Metro, zoomed street-level view when walking
  const spanMeters = player.inVehicleInstanceId || metroRide.active ? 380 : 260;
  const scale = RADAR_SIZE / spanMeters;

  const toRadar = (wx: number, wz: number) => ({
    rx: RADAR_HALF + (wx - px) * scale,
    ry: RADAR_HALF + (wz - pz) * scale,
  });

  // In Nexus City:
  // rotationY = PI -> facing North (-Z, 0 deg)
  // rotationY = PI/2 -> facing East (+X, 90 deg)
  // rotationY = 0 -> facing South (+Z, 180 deg)
  // rotationY = -PI/2 -> facing West (-X, 270 deg)
  const headingDeg = (((-player.rotationY * 180) / Math.PI + 180) % 360 + 360) % 360;
  const roundedHeading = Math.round(headingDeg) % 360;
  const cardinalIdx = Math.round(headingDeg / 45) % 8;
  const cardinalLabel = t.mapHelp.cardinals[cardinalIdx] ?? 'N';

  // Resolve active navigation target (Street Race Gate > Active Mission > Custom Waypoint)
  const isRaceActive = raceState.status === 'countdown' || raceState.status === 'racing';
  let navTarget = customWaypoint;
  if (isRaceActive) {
    navTarget =
      CITY_RACE_CHECKPOINTS[Math.min(raceState.checkpointIndex, CITY_RACE_CHECKPOINTS.length - 1)] ?? null;
  } else if (activeMissionId) {
    const def = MISSION_DEFINITIONS.find((m) => m.id === activeMissionId);
    const prog = missions[activeMissionId];
    const cp = def && prog ? def.checkpoints[prog.currentStep] : undefined;
    if (cp) navTarget = cp.position;
  }

  const routePoints = navTarget
    ? computeNavigationRoute(player.position, navTarget)
        .map((pt) => {
          const rp = toRadar(pt.x, pt.z);
          return `${rp.rx.toFixed(1)},${rp.ry.toFixed(1)}`;
        })
        .join(' ')
    : '';

  // Clamped edge indicator when destination lies outside current radar window
  let clampedTargetPip: { x: number; y: number; isClamped: boolean; color: string } | null = null;
  if (navTarget) {
    const raw = toRadar(navTarget.x, navTarget.z);
    const margin = 8;
    const dx = raw.rx - RADAR_HALF;
    const dy = raw.ry - RADAR_HALF;
    const maxOffset = RADAR_HALF - margin;
    const absMax = Math.max(Math.abs(dx), Math.abs(dy));
    if (absMax > maxOffset && absMax > 0.001) {
      const factor = maxOffset / absMax;
      clampedTargetPip = {
        x: RADAR_HALF + dx * factor,
        y: RADAR_HALF + dy * factor,
        isClamped: true,
        color: isRaceActive ? '#f59e0b' : '#38bdf8',
      };
    } else {
      clampedTargetPip = {
        x: raw.rx,
        y: raw.ry,
        isClamped: false,
        color: isRaceActive ? '#f59e0b' : '#38bdf8',
      };
    }
  }

  const landTopLeft = toRadar(-WORLD_PLAYABLE_LIMIT, -WORLD_PLAYABLE_LIMIT);
  const landSizePx = WORLD_PLAYABLE_LIMIT * 2 * scale;
  const roadExtentWorld = Math.abs(ROAD_COORDS[0]) + ROAD_WIDTH * 0.5;
  const roadStrokePx = Math.max(4, ROAD_WIDTH * scale);

  const surfaceCls = isDark
    ? 'bg-slate-950/90 border-slate-800/90 text-slate-100'
    : 'bg-white/92 border-slate-300 text-slate-900';
  const mutedCls = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <div
      aria-label="Mini-map"
      className={`pointer-events-none select-none w-[144px] md:w-[164px] rounded-xl border p-1.5 shadow-lg ${surfaceCls}`}
    >
      <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-slate-800/80 bg-slate-950">
        <svg
          viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
          className="block w-full h-full"
          aria-hidden="true"
        >
          <defs>
            <clipPath id="hudMiniMapClip">
              <rect x={0} y={0} width={RADAR_SIZE} height={RADAR_SIZE} rx={6} />
            </clipPath>
          </defs>

          <g clipPath="url(#hudMiniMapClip)">
            {/* Ocean Backdrop & City Peninsula */}
            <rect x={0} y={0} width={RADAR_SIZE} height={RADAR_SIZE} fill="#082f49" />
            <rect
              x={landTopLeft.rx}
              y={landTopLeft.ry}
              width={landSizePx}
              height={landSizePx}
              rx={4}
              fill="#0f172a"
              stroke="#334155"
              strokeWidth={1}
            />

            {/* District Zones */}
            {DISTRICTS.filter((d) => d.id !== 'highway').map((d) => {
              const tl = toRadar(d.minX, d.minZ);
              const br = toRadar(d.maxX, d.maxZ);
              return (
                <rect
                  key={d.id}
                  x={tl.rx}
                  y={tl.ry}
                  width={br.rx - tl.rx}
                  height={br.ry - tl.ry}
                  fill={d.accentColor}
                  fillOpacity={0.13}
                  stroke={d.accentColor}
                  strokeOpacity={0.26}
                  strokeWidth={0.75}
                />
              );
            })}

            {/* 7x7 Boulevard Grid */}
            {ROAD_COORDS.map((rc) => {
              const v1 = toRadar(rc, -roadExtentWorld);
              const v2 = toRadar(rc, roadExtentWorld);
              const h1 = toRadar(-roadExtentWorld, rc);
              const h2 = toRadar(roadExtentWorld, rc);
              return (
                <g key={rc}>
                  <line
                    x1={v1.rx}
                    y1={v1.ry}
                    x2={v2.rx}
                    y2={v2.ry}
                    stroke="#334155"
                    strokeWidth={roadStrokePx}
                    strokeLinecap="square"
                  />
                  <line
                    x1={h1.rx}
                    y1={h1.ry}
                    x2={h2.rx}
                    y2={h2.ry}
                    stroke="#334155"
                    strokeWidth={roadStrokePx}
                    strokeLinecap="square"
                  />
                </g>
              );
            })}

            {/* Boulevard Center Medians */}
            {ROAD_COORDS.map((rc) => {
              const v1 = toRadar(rc, -roadExtentWorld);
              const v2 = toRadar(rc, roadExtentWorld);
              const h1 = toRadar(-roadExtentWorld, rc);
              const h2 = toRadar(roadExtentWorld, rc);
              return (
                <g key={`m_${rc}`}>
                  <line
                    x1={v1.rx}
                    y1={v1.ry}
                    x2={v2.rx}
                    y2={v2.ry}
                    stroke="#f59e0b"
                    strokeOpacity={0.42}
                    strokeWidth={0.7}
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={h1.rx}
                    y1={h1.ry}
                    x2={h2.rx}
                    y2={h2.ry}
                    stroke="#f59e0b"
                    strokeOpacity={0.42}
                    strokeWidth={0.7}
                    strokeDasharray="3 3"
                  />
                </g>
              );
            })}

            {/* Sky-Metro Loop Line */}
            {(() => {
              const metroLoop = [...METRO_LOOP_CORNERS, METRO_LOOP_CORNERS[0]]
                .map((pt) => {
                  const rp = toRadar(pt.x, pt.z);
                  return `${rp.rx.toFixed(1)},${rp.ry.toFixed(1)}`;
                })
                .join(' ');
              return (
                <polyline
                  points={metroLoop}
                  fill="none"
                  stroke="#06b6d4"
                  strokeOpacity={0.68}
                  strokeWidth={1.3}
                  strokeDasharray="3 2"
                />
              );
            })()}

            {/* Walk-In Enterable Venues (Footprint Rectangles) */}
            {ENTERABLE_BUILDINGS.map((b) => {
              const tl = toRadar(b.centerX - b.width * 0.5, b.centerZ - b.depth * 0.5);
              const wPx = Math.max(4.5, b.width * scale);
              const dPx = Math.max(4.5, b.depth * scale);
              const isOwned = ownedProperties.includes(b.id);
              const col = isOwned ? '#10b981' : b.accentColor;
              return (
                <rect
                  key={b.id}
                  x={tl.rx}
                  y={tl.ry}
                  width={wPx}
                  height={dPx}
                  rx={1.2}
                  fill={col}
                  fillOpacity={isOwned ? 0.65 : 0.45}
                  stroke={col}
                  strokeWidth={1}
                />
              );
            })}

            {/* 6 Sky-Metro Stations */}
            {METRO_STATIONS.map((st) => {
              const mp = toRadar(st.entrancePos.x, st.entrancePos.z);
              if (mp.rx < -6 || mp.rx > RADAR_SIZE + 6 || mp.ry < -6 || mp.ry > RADAR_SIZE + 6) return null;
              const isOwned = ownedProperties.includes(st.id);
              return (
                <circle
                  key={st.id}
                  cx={mp.rx}
                  cy={mp.ry}
                  r={3.2}
                  fill={isOwned ? '#10b981' : '#0ea5e9'}
                  stroke="#ffffff"
                  strokeWidth={0.9}
                />
              );
            })}

            {/* Core City Landmarks */}
            {(() => {
              const sh = toRadar(SAFEHOUSE_LOCATION.x, SAFEHOUSE_LOCATION.z);
              const dl = toRadar(DEALERSHIP_LOCATION.x, DEALERSHIP_LOCATION.z);
              const gs = toRadar(GAS_STATION_LOCATION.x, GAS_STATION_LOCATION.z);
              const rs = toRadar(CITY_RACE_START_POS.x, CITY_RACE_START_POS.z);
              return (
                <g>
                  <rect x={sh.rx - 3} y={sh.ry - 3} width={6} height={6} rx={1} fill="#10b981" stroke="#0f172a" strokeWidth={0.9} />
                  <rect x={dl.rx - 3} y={dl.ry - 3} width={6} height={6} rx={1} fill="#3b82f6" stroke="#0f172a" strokeWidth={0.9} />
                  <circle cx={gs.rx} cy={gs.ry} r={2.6} fill="#f97316" />
                  <rect x={rs.rx - 3.2} y={rs.ry - 3.2} width={6.4} height={6.4} rx={1.2} fill="#f59e0b" stroke="#0f172a" strokeWidth={1} />
                </g>
              );
            })()}

            {/* Active Navigation Polyline */}
            {routePoints && (
              <polyline
                points={routePoints}
                fill="none"
                stroke={isRaceActive ? '#f59e0b' : '#38bdf8'}
                strokeWidth={2.2}
                strokeDasharray="4 3"
              />
            )}

            {/* Nearby Parked Vehicles */}
            {vehicles.map((v) => {
              if (v.instanceId === player.inVehicleInstanceId) return null;
              if (Math.abs(v.position.x - px) > spanMeters * 0.6 || Math.abs(v.position.z - pz) > spanMeters * 0.6) {
                return null;
              }
              const vp = toRadar(v.position.x, v.position.z);
              return (
                <rect
                  key={v.instanceId}
                  x={vp.rx - 1.8}
                  y={vp.ry - 1.8}
                  width={3.6}
                  height={3.6}
                  rx={0.8}
                  fill="#cbd5e1"
                  opacity={0.85}
                />
              );
            })}

            {/* Street Race Rivals */}
            {raceState.rivals.map((rv) => {
              const rp = toRadar(rv.x, rv.z);
              if (rp.rx < -6 || rp.rx > RADAR_SIZE + 6 || rp.ry < -6 || rp.ry > RADAR_SIZE + 6) return null;
              return (
                <circle
                  key={rv.id}
                  cx={rp.rx}
                  cy={rp.ry}
                  r={2.8}
                  fill={rv.color}
                  stroke="#0f172a"
                  strokeWidth={0.9}
                />
              );
            })}

            {/* Police Units */}
            {policeUnits.map((pu) => {
              const pp = toRadar(pu.position.x, pu.position.z);
              if (pp.rx < -6 || pp.rx > RADAR_SIZE + 6 || pp.ry < -6 || pp.ry > RADAR_SIZE + 6) return null;
              return (
                <circle
                  key={pu.id}
                  cx={pp.rx}
                  cy={pp.ry}
                  r={pu.pursuing ? 3.2 : 2.3}
                  fill={pu.pursuing ? '#ef4444' : '#3b82f6'}
                  stroke="#f8fafc"
                  strokeWidth={0.8}
                />
              );
            })}

            {/* Co-op Friends on Radar (Clamped to Edge if Far) */}
            {coopPeers.map((fp) => {
              const raw = toRadar(fp.x, fp.z);
              const margin = 7;
              const dx = raw.rx - RADAR_HALF;
              const dy = raw.ry - RADAR_HALF;
              const maxOffset = RADAR_HALF - margin;
              const absMax = Math.max(Math.abs(dx), Math.abs(dy));
              const factor = absMax > maxOffset && absMax > 0.001 ? maxOffset / absMax : 1;
              const fx = RADAR_HALF + dx * factor;
              const fy = RADAR_HALF + dy * factor;
              return (
                <circle
                  key={fp.playerId}
                  cx={fx}
                  cy={fy}
                  r={4.2}
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth={1.3}
                />
              );
            })}

            {/* Destination Pip (In-view or Clamped to Edge) */}
            {clampedTargetPip && (
              <g>
                <circle
                  cx={clampedTargetPip.x}
                  cy={clampedTargetPip.y}
                  r={clampedTargetPip.isClamped ? 3.6 : 4.6}
                  fill={clampedTargetPip.isClamped ? clampedTargetPip.color : 'none'}
                  stroke={clampedTargetPip.color}
                  strokeWidth={1.8}
                />
                {!clampedTargetPip.isClamped && (
                  <circle cx={clampedTargetPip.x} cy={clampedTargetPip.y} r={2} fill={clampedTargetPip.color} />
                )}
              </g>
            )}

            {/* Subtle Radar Range Ring */}
            <circle
              cx={RADAR_HALF}
              cy={RADAR_HALF}
              r={46}
              fill="none"
              stroke="#94a3b8"
              strokeOpacity={0.16}
              strokeWidth={0.8}
            />

            {/* Player Orientation Cone + Heading Dart (Centered) */}
            <g transform={`translate(${RADAR_HALF}, ${RADAR_HALF}) rotate(${headingDeg.toFixed(1)})`}>
              <polygon
                points="0,0 -17,-34 17,-34"
                fill="#38bdf8"
                fillOpacity={0.18}
              />
              <polygon
                points="0,-7.5 5.4,5.5 0,2.6 -5.4,5.5"
                fill="#facc15"
                stroke="#0f172a"
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
            </g>

            {/* North Cardinal Bezel Tick */}
            <rect x={RADAR_HALF - 7} y={2} width={14} height={11} rx={2} fill="rgba(2, 6, 23, 0.82)" />
            <text
              x={RADAR_HALF}
              y={10.2}
              fill="#38bdf8"
              fontSize={7.5}
              fontWeight={700}
              textAnchor="middle"
            >
              {t.mapHelp.northShort}
            </text>
          </g>
        </svg>
      </div>

      {/* Clean Unboxed Coordinate & Orientation Readout */}
      <div className="mt-1.5 px-0.5 flex items-center justify-between gap-1 text-[10px] font-mono-num leading-tight">
        <span className="truncate font-medium">
          X {Math.round(px)} <span className={mutedCls}>·</span> Z {Math.round(pz)}
        </span>
        <span className="shrink-0 text-sky-400 font-semibold">
          {String(roundedHeading).padStart(3, '0')}° {cardinalLabel}
        </span>
      </div>
    </div>
  );
};
