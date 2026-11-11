import React, { useRef, useState } from 'react';
import {
  Building2,
  Crosshair,
  Flag,
  LocateFixed,
  MapPin,
  Navigation,
  TrainFront,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CITY_RACE_CHECKPOINTS,
  CITY_RACE_START_POS,
  DEALERSHIP_LOCATION,
  DISTRICTS,
  ENTERABLE_BUILDINGS,
  GAS_STATION_LOCATION,
  getHeistTarget,
  METRO_LOOP_CORNERS,
  METRO_STATIONS,
  ROAD_COORDS,
  ROAD_WIDTH,
  SAFEHOUSE_LOCATION,
  WORLD_PLAYABLE_LIMIT,
} from '../game/gameConfig';
import { MISSION_DEFINITIONS } from '../missions/missionDefinitions';
import { computeDistance2D, computeNavigationRoute } from './Navigation';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';

const MAP_SVG_SIZE = 520;

function worldToSvg(wx: number, wz: number): { sx: number; sy: number } {
  const normX = (wx + WORLD_PLAYABLE_LIMIT) / (WORLD_PLAYABLE_LIMIT * 2);
  const normY = (wz + WORLD_PLAYABLE_LIMIT) / (WORLD_PLAYABLE_LIMIT * 2);
  return {
    sx: normX * MAP_SVG_SIZE,
    sy: normY * MAP_SVG_SIZE,
  };
}

function svgToWorld(sx: number, sy: number): { x: number; z: number } {
  const wx = (sx / MAP_SVG_SIZE) * (WORLD_PLAYABLE_LIMIT * 2) - WORLD_PLAYABLE_LIMIT;
  const wz = (sy / MAP_SVG_SIZE) * (WORLD_PLAYABLE_LIMIT * 2) - WORLD_PLAYABLE_LIMIT;
  const clampBound = WORLD_PLAYABLE_LIMIT - 8;
  return {
    x: Math.max(-clampBound, Math.min(clampBound, Math.round(wx))),
    z: Math.max(-clampBound, Math.min(clampBound, Math.round(wz))),
  };
}

export const CityMap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [focusPlayer, setFocusPlayer] = useState<boolean>(false);

  const player = useGameStore((s) => s.player);
  const vehicles = useGameStore((s) => s.vehicles);
  const missions = useGameStore((s) => s.missions);
  const activeMissionId = useGameStore((s) => s.activeMissionId);
  const customWaypoint = useGameStore((s) => s.customWaypoint);
  const policeUnits = useGameStore((s) => s.policeUnits);
  const raceState = useGameStore((s) => s.raceState);
  const startCityRace = useGameStore((s) => s.startCityRace);
  const ownedProperties = useGameStore((s) => s.inventory.ownedProperties);
  const openEnterprisesModal = useGameStore((s) => s.openEnterprisesModal);
  const openMetroModal = useGameStore((s) => s.openMetroModal);
  const coopPeers = useGameStore((s) => s.coop.peers);
  const setCustomWaypoint = useGameStore((s) => s.setCustomWaypoint);
  const setActiveModal = useGameStore((s) => s.setActiveModal);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const playerSvg = worldToSvg(player.position.x, player.position.z);

  const viewSpan = MAP_SVG_SIZE / zoom;
  const rawCenterX = focusPlayer && zoom > 1 ? playerSvg.sx : MAP_SVG_SIZE * 0.5;
  const rawCenterY = focusPlayer && zoom > 1 ? playerSvg.sy : MAP_SVG_SIZE * 0.5;
  const vbX = Math.max(0, Math.min(MAP_SVG_SIZE - viewSpan, rawCenterX - viewSpan * 0.5));
  const vbY = Math.max(0, Math.min(MAP_SVG_SIZE - viewSpan, rawCenterY - viewSpan * 0.5));

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clickX = vbX + ((e.clientX - rect.left) / rect.width) * viewSpan;
    const clickY = vbY + ((e.clientY - rect.top) / rect.height) * viewSpan;
    const w = svgToWorld(clickX, clickY);
    setCustomWaypoint({ x: w.x, y: 0, z: w.z });
  };

  let navTarget = customWaypoint;
  if (activeMissionId) {
    const def = MISSION_DEFINITIONS.find((m) => m.id === activeMissionId);
    const prog = missions[activeMissionId];
    const cp = def && prog ? def.checkpoints[prog.currentStep] : undefined;
    if (cp) navTarget = cp.position;
  }

  const routePoints = navTarget
    ? computeNavigationRoute(player.position, navTarget)
        .map((p) => {
          const sp = worldToSvg(p.x, p.z);
          return `${sp.sx.toFixed(1)},${sp.sy.toFixed(1)}`;
        })
        .join(' ')
    : '';

  const roadStrokePx = Math.max(12, (ROAD_WIDTH / (WORLD_PLAYABLE_LIMIT * 2)) * MAP_SVG_SIZE);
  const roadExtentWorld = Math.abs(ROAD_COORDS[0]) + ROAD_WIDTH * 0.5;

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900';
  const subTextCls = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className={`w-full max-w-5xl rounded-xl border p-5 md:p-6 shadow-2xl modal-scroll-zone max-h-[92vh] overflow-y-auto ${surfaceCls}`}>
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800/50">
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide">
              {t.menu.map} — NEXUS CITY ({WORLD_PLAYABLE_LIMIT * 2}m × {WORLD_PLAYABLE_LIMIT * 2}m)
            </h2>
            <p className={`text-xs mt-0.5 ${subTextCls}`}>{t.mapHelp.clickToNavigate}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const next = zoom >= 2.6 ? 1 : Number((zoom + 0.8).toFixed(1));
                setZoom(next);
                setFocusPlayer(next > 1);
              }}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'
              }`}
            >
              {zoom > 1.8 ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              <span className="font-mono-num">{zoom.toFixed(1)}x</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(2.0);
                setFocusPlayer(true);
              }}
              className={`p-2 rounded-lg border transition-colors ${
                isDark ? 'border-slate-700 hover:bg-slate-800 text-sky-400' : 'border-slate-300 hover:bg-slate-100 text-sky-600'
              }`}
              title={t.mapHelp.legendPlayer}
              aria-label={t.mapHelp.legendPlayer}
            >
              <LocateFixed className="w-4 h-4" />
            </button>
            {customWaypoint && (
              <button
                onClick={() => setCustomWaypoint(null)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-sky-500/40 text-sky-400 hover:bg-sky-500/10 transition-colors whitespace-nowrap shrink-0"
              >
                {t.hud.clearWaypoint}
              </button>
            )}
            <button
              onClick={() => setActiveModal('none')}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}
              aria-label={t.menu.back}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-5 items-start">
          {/* Interactive Vector Map */}
          <div className="lg:col-span-2 flex justify-center">
            <svg
              ref={svgRef}
              viewBox={`${vbX} ${vbY} ${viewSpan} ${viewSpan}`}
              onClick={handleMapClick}
              className="w-full max-w-[520px] aspect-square rounded-lg border border-slate-700/60 bg-slate-900 cursor-crosshair select-none"
            >
              {/* Ocean background & Peninsula */}
              <rect x={0} y={0} width={MAP_SVG_SIZE} height={MAP_SVG_SIZE} fill="#0c3b54" />
              <rect x={10} y={10} width={MAP_SVG_SIZE - 20} height={MAP_SVG_SIZE - 20} rx={10} fill="#1e293b" />

              {/* District Tints */}
              {DISTRICTS.filter((d) => d.id !== 'highway').map((d) => {
                const tl = worldToSvg(d.minX, d.minZ);
                const br = worldToSvg(d.maxX, d.maxZ);
                return (
                  <g key={d.id}>
                    <rect
                      x={tl.sx}
                      y={tl.sy}
                      width={br.sx - tl.sx}
                      height={br.sy - tl.sy}
                      fill={d.accentColor}
                      fillOpacity={0.14}
                      stroke={d.accentColor}
                      strokeOpacity={0.35}
                      strokeWidth={1}
                    />
                    <text
                      x={(tl.sx + br.sx) * 0.5}
                      y={(tl.sy + br.sy) * 0.5}
                      fill="#cbd5e1"
                      fontSize={9.5}
                      fontWeight={600}
                      textAnchor="middle"
                      opacity={0.82}
                    >
                      {resolveNestedKey(t, d.nameKey)}
                    </text>
                  </g>
                );
              })}

              {/* Wide 7x7 Grand Boulevard Network */}
              {ROAD_COORDS.map((rc) => {
                const p1 = worldToSvg(rc, -roadExtentWorld);
                const p2 = worldToSvg(rc, roadExtentWorld);
                const q1 = worldToSvg(-roadExtentWorld, rc);
                const q2 = worldToSvg(roadExtentWorld, rc);
                return (
                  <g key={rc}>
                    <line
                      x1={p1.sx}
                      y1={p1.sy}
                      x2={p2.sx}
                      y2={p2.sy}
                      stroke="#334155"
                      strokeWidth={roadStrokePx}
                      strokeLinecap="square"
                    />
                    <line
                      x1={q1.sx}
                      y1={q1.sy}
                      x2={q2.sx}
                      y2={q2.sy}
                      stroke="#334155"
                      strokeWidth={roadStrokePx}
                      strokeLinecap="square"
                    />
                  </g>
                );
              })}
              {/* Boulevard Amber Center Medians */}
              {ROAD_COORDS.map((rc) => {
                const p1 = worldToSvg(rc, -roadExtentWorld);
                const p2 = worldToSvg(rc, roadExtentWorld);
                const q1 = worldToSvg(-roadExtentWorld, rc);
                const q2 = worldToSvg(roadExtentWorld, rc);
                return (
                  <g key={`med_${rc}`}>
                    <line
                      x1={p1.sx}
                      y1={p1.sy}
                      x2={p2.sx}
                      y2={p2.sy}
                      stroke="#f59e0b"
                      strokeOpacity={0.55}
                      strokeWidth={1.1}
                      strokeDasharray="4 4"
                    />
                    <line
                      x1={q1.sx}
                      y1={q1.sy}
                      x2={q2.sx}
                      y2={q2.sy}
                      stroke="#f59e0b"
                      strokeOpacity={0.55}
                      strokeWidth={1.1}
                      strokeDasharray="4 4"
                    />
                  </g>
                );
              })}

              {/* Navigation Polyline */}
              {routePoints && (
                <polyline
                  points={routePoints}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={3.5}
                  strokeDasharray="6 4"
                />
              )}

              {/* Grand City Loop Track Outline when Race is Active */}
              {(raceState.status === 'countdown' || raceState.status === 'racing') && (() => {
                const loopPts = [CITY_RACE_START_POS, ...CITY_RACE_CHECKPOINTS]
                  .map((pt) => {
                    const sp = worldToSvg(pt.x, pt.z);
                    return `${sp.sx.toFixed(1)},${sp.sy.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polyline
                    points={loopPts}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={3.2}
                    strokeOpacity={0.75}
                    strokeDasharray="8 5"
                  />
                );
              })()}

              {/* Elevated Sky-Metro Loop Line */}
              {(() => {
                const metroPts = [...METRO_LOOP_CORNERS, METRO_LOOP_CORNERS[0]]
                  .map((pt) => {
                    const sp = worldToSvg(pt.x, pt.z);
                    return `${sp.sx.toFixed(1)},${sp.sy.toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polyline
                    points={metroPts}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth={2.6}
                    strokeOpacity={0.78}
                    strokeDasharray="6 4"
                  />
                );
              })()}

              {/* Walk-In Enterable Buildings & Skyscrapers (Shops, Enterprises, Restaurants, Museums, Cinemas, Arcades) */}
              {ENTERABLE_BUILDINGS.map((b) => {
                const bp = worldToSvg(b.centerX, b.centerZ);
                const isOwnedBld = ownedProperties.includes(b.id);
                const glyph =
                  b.category === 'shop'
                    ? 'D'
                    : b.category === 'enterprise'
                      ? 'K'
                      : b.category === 'restaurant'
                        ? 'R'
                        : b.category === 'cinema'
                          ? 'C'
                          : b.category === 'arcade'
                            ? 'A'
                            : 'U';
                return (
                  <g key={b.id}>
                    <rect
                      x={bp.sx - 6.5}
                      y={bp.sy - 6.5}
                      width={13}
                      height={13}
                      rx={2.5}
                      fill={isOwnedBld ? '#10b981' : b.accentColor}
                      stroke={isOwnedBld ? '#ffffff' : '#0f172a'}
                      strokeWidth={isOwnedBld ? 2 : 1.6}
                    />
                    <text
                      x={bp.sx}
                      y={bp.sy + 2.8}
                      fill="#0f172a"
                      fontSize={7.5}
                      fontWeight={800}
                      textAnchor="middle"
                    >
                      {glyph}
                    </text>
                  </g>
                );
              })}

              {/* 6 Sky-Metro Stations */}
              {METRO_STATIONS.map((st) => {
                const mp = worldToSvg(st.entrancePos.x, st.entrancePos.z);
                const isOwnedStation = ownedProperties.includes(st.id);
                return (
                  <g key={st.id}>
                    <circle
                      cx={mp.sx}
                      cy={mp.sy}
                      r={7.2}
                      fill={isOwnedStation ? '#10b981' : '#0ea5e9'}
                      stroke="#ffffff"
                      strokeWidth={1.8}
                    />
                    <text
                      x={mp.sx}
                      y={mp.sy + 2.7}
                      fill="#020617"
                      fontSize={7.5}
                      fontWeight={800}
                      textAnchor="middle"
                    >
                      M
                    </text>
                  </g>
                );
              })}

              {/* Landmarks: Safehouse, Dealership, Gas Station, & Grand Race Start/Finish */}
              {(() => {
                const sh = worldToSvg(SAFEHOUSE_LOCATION.x, SAFEHOUSE_LOCATION.z);
                const dl = worldToSvg(DEALERSHIP_LOCATION.x, DEALERSHIP_LOCATION.z);
                const gs = worldToSvg(GAS_STATION_LOCATION.x, GAS_STATION_LOCATION.z);
                const rs = worldToSvg(CITY_RACE_START_POS.x, CITY_RACE_START_POS.z);
                return (
                  <g>
                    <rect x={sh.sx - 6} y={sh.sy - 6} width={12} height={12} rx={2} fill="#10b981" stroke="#fff" strokeWidth={1.5} />
                    <rect x={dl.sx - 6} y={dl.sy - 6} width={12} height={12} rx={2} fill="#3b82f6" stroke="#fff" strokeWidth={1.5} />
                    <circle cx={gs.sx} cy={gs.sy} r={5} fill="#f97316" stroke="#fff" strokeWidth={1.2} />
                    <rect x={rs.sx - 7} y={rs.sy - 7} width={14} height={14} rx={3} fill="#f59e0b" stroke="#0f172a" strokeWidth={2} />
                  </g>
                );
              })()}

              {/* Available Missions */}
              {MISSION_DEFINITIONS.map((m) => {
                const st = missions[m.id]?.status;
                if (st !== 'available' && st !== 'failed' && st !== 'active') return null;
                const mp = worldToSvg(m.startPosition.x, m.startPosition.z);
                return (
                  <circle
                    key={m.id}
                    cx={mp.sx}
                    cy={mp.sy}
                    r={6.2}
                    fill={st === 'active' ? '#f59e0b' : '#06b6d4'}
                    stroke="#0f172a"
                    strokeWidth={1.8}
                  />
                );
              })}

              {/* Parked Vehicles */}
              {vehicles.map((v) => {
                if (v.instanceId === player.inVehicleInstanceId) return null;
                const vp = worldToSvg(v.position.x, v.position.z);
                return (
                  <rect
                    key={v.instanceId}
                    x={vp.sx - 3.6}
                    y={vp.sy - 3.6}
                    width={7.2}
                    height={7.2}
                    rx={1.5}
                    fill="#e2e8f0"
                    stroke="#0f172a"
                    strokeWidth={1.1}
                  />
                );
              })}

              {/* 10 Rival Racers on City Loop */}
              {raceState.rivals.map((rv) => {
                const rp = worldToSvg(rv.x, rv.z);
                return (
                  <circle
                    key={rv.id}
                    cx={rp.sx}
                    cy={rp.sy}
                    r={4.8}
                    fill={rv.color}
                    stroke="#0f172a"
                    strokeWidth={1.5}
                  />
                );
              })}

              {/* Police Units */}
              {policeUnits.map((pu) => {
                const pp = worldToSvg(pu.position.x, pu.position.z);
                return (
                  <circle
                    key={pu.id}
                    cx={pp.sx}
                    cy={pp.sy}
                    r={pu.pursuing ? 5.2 : 4.0}
                    fill={pu.pursuing ? '#ef4444' : '#3b82f6'}
                    stroke="#f8fafc"
                    strokeWidth={1.3}
                  />
                );
              })}

              {/* Custom Waypoint */}
              {customWaypoint && (() => {
                const wp = worldToSvg(customWaypoint.x, customWaypoint.z);
                return (
                  <g>
                    <circle cx={wp.sx} cy={wp.sy} r={8} fill="none" stroke="#38bdf8" strokeWidth={2.5} />
                    <circle cx={wp.sx} cy={wp.sy} r={3.5} fill="#38bdf8" />
                  </g>
                );
              })()}

              {/* Co-op Friends on Full City Map */}
              {coopPeers.map((fp) => {
                const fSvg = worldToSvg(fp.x, fp.z);
                return (
                  <g key={fp.playerId}>
                    <circle
                      cx={fSvg.sx}
                      cy={fSvg.sy}
                      r={7}
                      fill="#10b981"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    <text
                      x={fSvg.sx}
                      y={fSvg.sy - 11}
                      fill="#6ee7b7"
                      fontSize={9.5}
                      fontWeight={700}
                      textAnchor="middle"
                    >
                      {fp.name}
                    </text>
                  </g>
                );
              })}

              {/* Player Heading Triangle */}
              <g transform={`translate(${playerSvg.sx}, ${playerSvg.sy}) rotate(${(-player.rotationY * 180) / Math.PI + 180})`}>
                <polygon points="0,-9 7,7 0,4 -7,7" fill="#facc15" stroke="#0f172a" strokeWidth={1.8} />
              </g>
            </svg>
          </div>

          {/* Legend & Quick Destinations */}
          <div className="space-y-5">
            <div className="space-y-2.5 text-xs">
              <div className="font-semibold text-sm">{t.hud.district}: {resolveNestedKey(t, `districts.${player.currentDistrict}`)}</div>
              <div className={`font-mono-num ${subTextCls}`}>
                X: {Math.round(player.position.x)} · Z: {Math.round(player.position.z)}
              </div>
              {navTarget && (
                <div className="font-mono-num text-sky-400">
                  {t.hud.waypoint}: {Math.round(computeDistance2D(player.position, navTarget))} m
                </div>
              )}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-800/40 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm bg-yellow-400 inline-block shrink-0" />
                <span>{t.mapHelp.legendPlayer}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block shrink-0" />
                <span>{t.mapHelp.legendSafehouse}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm bg-blue-500 inline-block shrink-0" />
                <span>{t.mapHelp.legendDealership}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-cyan-400 inline-block shrink-0" />
                <span>{t.mapHelp.legendMission}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm bg-slate-200 inline-block shrink-0" />
                <span>{t.mapHelp.legendVehicle}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-red-500 border border-blue-400 inline-block shrink-0" />
                <span>{t.mapHelp.legendPolice}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block shrink-0" />
                <span>{t.mapHelp.legendRace}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-fuchsia-500 inline-block shrink-0" />
                <span>{t.mapHelp.legendRival}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm bg-teal-400 border border-amber-400 inline-block shrink-0" />
                <span>{t.mapHelp.legendVenues}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-sky-500 border border-white inline-block shrink-0" />
                <span>{t.mapHelp.legendMetro}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white inline-block shrink-0" />
                <span>{t.mapHelp.legendFriend}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm bg-red-500 border border-amber-400 inline-block shrink-0" />
                <span>{t.mapHelp.legendHeist}</span>
              </div>
            </div>

            {/* Grand 10-Car City Race, Co-op, Sky-Metro & Real-Estate Empire Quick Actions */}
            <div className="pt-3 border-t border-slate-800/40 space-y-2">
              <div className="text-[11px] font-mono-num text-amber-400 font-semibold">
                {t.race.prizeLabel}
              </div>
              <button
                type="button"
                onClick={() => setActiveModal('coop')}
                className="w-full py-2.5 px-3.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>{t.coop.dockBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => startCityRace(t.race.startedToast)}
                className="w-full py-2.5 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Flag className="w-4 h-4 shrink-0" />
                <span>{t.race.startFromMap}</span>
              </button>
              <button
                type="button"
                onClick={() => openMetroModal()}
                className="w-full py-2.5 px-3.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <TrainFront className="w-4 h-4 shrink-0" />
                <span>{t.menu.metro} (T)</span>
              </button>
              <button
                type="button"
                onClick={() => openEnterprisesModal()}
                className="w-full py-2.5 px-3.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Building2 className="w-4 h-4 shrink-0" />
                <span>{t.menu.enterprises} (K)</span>
              </button>
            </div>

            {/* Quick GPS Presets */}
            <div className="space-y-2 pt-3 border-t border-slate-800/40">
              <div className={`text-xs font-semibold ${subTextCls}`}>{t.hud.waypoint}</div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setCustomWaypoint({ ...CITY_RACE_START_POS })}
                  className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Flag className="w-3.5 h-3.5 text-amber-400" />
                    {t.mapHelp.legendRace}
                  </span>
                  <Navigation className="w-3.5 h-3.5 opacity-60" />
                </button>
                <button
                  onClick={() => setCustomWaypoint({ ...SAFEHOUSE_LOCATION })}
                  className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    {t.mapHelp.legendSafehouse}
                  </span>
                  <Navigation className="w-3.5 h-3.5 opacity-60" />
                </button>
                <button
                  onClick={() => setCustomWaypoint({ ...DEALERSHIP_LOCATION })}
                  className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <MapPin className="w-3.5 h-3.5 text-blue-400" />
                    {t.mapHelp.legendDealership}
                  </span>
                  <Navigation className="w-3.5 h-3.5 opacity-60" />
                </button>
                <button
                  onClick={() => setCustomWaypoint({ x: -65, y: 0, z: 65 })}
                  className={`flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                    isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Crosshair className="w-3.5 h-3.5 text-teal-400" />
                    {t.districts.park}
                  </span>
                  <Navigation className="w-3.5 h-3.5 opacity-60" />
                </button>
              </div>
            </div>

            {/* Walk-In Venues Directory (Shops, Enterprises, Restaurants, Museums) */}
            <div className="space-y-2 pt-3 border-t border-slate-800/40">
              <div className={`text-xs font-semibold ${subTextCls}`}>{t.venues.sectionTitle}</div>
              <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {ENTERABLE_BUILDINGS.map((b) => {
                  const fSign = b.doorFacing === 'south' ? 1 : -1;
                  const doorWorldZ = Math.round(b.centerZ + fSign * (b.depth * 0.5 + 2.5));
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setCustomWaypoint({ x: b.centerX, y: 0, z: doorWorldZ })}
                      className={`flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg border transition-colors text-left ${
                        isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Building2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            getHeistTarget(b.id) ? 'text-amber-400' : 'text-sky-400'
                          }`}
                        />
                        <span className="truncate font-medium">{resolveNestedKey(t, b.nameKey)}</span>
                        <span className={subTextCls} aria-hidden="true">·</span>
                        <span className={`text-[11px] shrink-0 ${subTextCls}`}>
                          {t.venues.categories[b.category]}
                        </span>
                      </span>
                      <Navigation className="w-3 h-3 opacity-60 shrink-0 ml-2" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
