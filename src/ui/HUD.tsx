import React, { useRef } from 'react';
import {
  Briefcase,
  Building2,
  Camera,
  Car,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Film,
  Flag,
  Landmark,
  Map as MapIcon,
  Pause,
  Play,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldAlert,
  Star,
  Target,
  TrainFront,
  Trophy,
  Truck,
  Upload,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { VehicleId, WeaponId } from '../types/game';
import {
  ALL_PURCHASABLE_PLACES,
  ALL_WEAPON_IDS,
  CITY_RACE_CHECKPOINTS,
  ECONOMY_CONFIG,
  ENTERABLE_BUILDINGS,
  getDefaultVehicleTuning,
  getHeistTarget,
  METRO_STATIONS,
  VEHICLE_CONFIGS,
} from '../game/gameConfig';
import { formatNCoins } from '../economy/EconomyManager';
import { getMissionDefinition } from '../missions/missionDefinitions';
import { computeDistance2D } from '../map/Navigation';
import { MiniMap } from '../map/MiniMap';
import { isJobCapableVehicle } from '../vehicles/VehicleJobs';
import { engineCommandRef, useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';

function formatClock(hoursFloat: number): string {
  const totalMins = Math.floor((((hoursFloat % 24) + 24) % 24) * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatRaceTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  const whole = Math.floor(rem);
  const tenths = Math.floor((rem - whole) * 10);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenths}`;
}

export const HUD: React.FC = () => {
  const gameStarted = useGameStore((s) => s.gameStarted);
  const activeModal = useGameStore((s) => s.activeModal);
  const dockCollapsed = useGameStore((s) => s.dockCollapsed);
  const toggleDock = useGameStore((s) => s.toggleDock);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const openGarageModal = useGameStore((s) => s.openGarageModal);
  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);
  const cameraMode = useGameStore((s) => s.cameraMode);

  const player = useGameStore((s) => s.player);
  const vehicles = useGameStore((s) => s.vehicles);
  const vehicleTuning = useGameStore((s) => s.inventory.vehicleTuning);
  const coins = useGameStore((s) => s.economy.coins);
  const ownedProperties = useGameStore((s) => s.inventory.ownedProperties);
  const buyEnterprise = useGameStore((s) => s.buyEnterprise);
  const openEnterprisesModal = useGameStore((s) => s.openEnterprisesModal);
  const openMetroModal = useGameStore((s) => s.openMetroModal);
  const metroRide = useGameStore((s) => s.metroRide);
  const boardOrExitMetro = useGameStore((s) => s.boardOrExitMetro);
  const selectMetroStopWhileRiding = useGameStore((s) => s.selectMetroStopWhileRiding);
  const skipActiveMetroRide = useGameStore((s) => s.skipActiveMetroRide);
  const showToast = useGameStore((s) => s.showToast);
  const equippedWeapon = useGameStore((s) => s.equippedWeapon);
  const currentBuildingId = useGameStore((s) => s.currentBuildingId);
  const activeCinemaMovieIndex = useGameStore((s) => s.activeCinemaMovieIndex);
  const cinemaCustomVideoName = useGameStore((s) => s.cinemaCustomVideoName);
  const cinemaPaused = useGameStore((s) => s.cinemaPaused);
  const selectCinemaMovie = useGameStore((s) => s.selectCinemaMovie);
  const uploadCustomCinemaVideo = useGameStore((s) => s.uploadCustomCinemaVideo);
  const toggleCinemaPlayPause = useGameStore((s) => s.toggleCinemaPlayPause);
  const cycleVehicleCargo = useGameStore((s) => s.cycleVehicleCargo);
  const triggerVehicleHydraulics = useGameStore((s) => s.triggerVehicleHydraulics);
  const setEquippedWeapon = useGameStore((s) => s.setEquippedWeapon);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fps = useGameStore((s) => s.fps);
  const speedKmh = useGameStore((s) => s.speedKmh);
  const world = useGameStore((s) => s.world);
  const missions = useGameStore((s) => s.missions);
  const activeMissionId = useGameStore((s) => s.activeMissionId);
  const nearestInteractable = useGameStore((s) => s.nearestInteractable);
  const customWaypoint = useGameStore((s) => s.customWaypoint);
  const wantedLevel = useGameStore((s) => s.wantedLevel);
  const escapeRatio = useGameStore((s) => s.escapeRatio);
  const raceState = useGameStore((s) => s.raceState);
  const startCityRace = useGameStore((s) => s.startCityRace);
  const stopCityRace = useGameStore((s) => s.stopCityRace);
  const coop = useGameStore((s) => s.coop);
  const heist = useGameStore((s) => s.heist);
  const requestStartHeist = useGameStore((s) => s.requestStartHeist);
  const teleportToCoopFriend = useGameStore((s) => s.teleportToCoopFriend);
  const toast = useGameStore((s) => s.toast);
  const spiderWebTarget = useGameStore((s) => s.spiderWebTarget);
  const activeViltrumiteBoss = useGameStore((s) => s.activeViltrumiteBoss);
  const isInsidePoliceHQ = useGameStore((s) => s.isInsidePoliceHQ);
  const triggerSpiderWebZip = useGameStore((s) => s.triggerSpiderWebZip);
  const triggerTankCannon = useGameStore((s) => s.triggerTankCannon);
  const triggerAirplaneGun = useGameStore((s) => s.triggerAirplaneGun);
  const triggerAirplaneBomb = useGameStore((s) => s.triggerAirplaneBomb);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const fpsCounter = useSettingsStore((s) => s.fpsCounter);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  if (!gameStarted) return null;

  const panelSurface = isDark
    ? 'bg-slate-950/90 border-slate-800/90 text-slate-100'
    : 'bg-white/92 border-slate-300 text-slate-900';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  const activeDef = activeMissionId ? getMissionDefinition(activeMissionId) : undefined;
  const activeProg = activeMissionId ? missions[activeMissionId] : undefined;
  const activeCheckpoint = activeDef && activeProg ? activeDef.checkpoints[activeProg.currentStep] : undefined;

  const isRaceActive = raceState.status === 'countdown' || raceState.status === 'racing';
  const currentRaceGate = isRaceActive
    ? CITY_RACE_CHECKPOINTS[Math.min(raceState.checkpointIndex, CITY_RACE_CHECKPOINTS.length - 1)]
    : undefined;
  const raceGateDist = currentRaceGate
    ? Math.round(computeDistance2D(player.position, currentRaceGate))
    : null;

  let navDistance: number | null = null;
  if (raceGateDist !== null) {
    navDistance = raceGateDist;
  } else if (activeCheckpoint) {
    navDistance = Math.round(computeDistance2D(player.position, activeCheckpoint.position));
  } else if (customWaypoint) {
    navDistance = Math.round(computeDistance2D(player.position, customWaypoint));
  }

  const weaponNames: Record<WeaponId, string> = {
    unarmed: t.weapons.unarmed,
    pistol: t.weapons.pistol,
    ak47: t.weapons.ak47,
    golf_club: t.weapons.golf_club,
  };

  const activeVenue = currentBuildingId
    ? ENTERABLE_BUILDINGS.find((b) => b.id === currentBuildingId) ?? null
    : null;
  const activeHeistTarget = activeVenue ? getHeistTarget(activeVenue.id) : null;
  const coopPeersList = coop.peers;
  const nowMs = Date.now();
  const heistCooldownLeftSec = activeHeistTarget
    ? Math.max(0, Math.ceil(((heist.robbedUntilByBuilding[activeHeistTarget.buildingId] ?? 0) - nowMs) / 1000))
    : 0;
  const isCrackingCurrentVenue = Boolean(
    activeHeistTarget && heist.activeBuildingId === activeHeistTarget.buildingId,
  );

  const contextualPlaceId =
    activeVenue?.id ??
    (nearestInteractable?.type === 'metro_station' ? nearestInteractable.payloadId ?? null : null);
  const contextualPlace = contextualPlaceId
    ? ALL_PURCHASABLE_PLACES.find((p) => p.id === contextualPlaceId) ?? null
    : null;
  const isContextualPlaceOwned = contextualPlace
    ? ownedProperties.includes(contextualPlace.id)
    : false;

  const activeMetroDest =
    metroRide.active && metroRide.toStationId
      ? METRO_STATIONS.find((st) => st.id === metroRide.toStationId) ?? null
      : null;
  const activeMetroCurrentStation =
    metroRide.active && metroRide.currentStationId
      ? METRO_STATIONS.find((st) => st.id === metroRide.currentStationId) ?? null
      : null;

  const formattedCoins = formatNCoins(coins);

  const activeDrivenVeh = player.inVehicleInstanceId
    ? vehicles.find((v) => v.instanceId === player.inVehicleInstanceId) ?? null
    : null;
  const activeDrivenCfg = activeDrivenVeh ? VEHICLE_CONFIGS[activeDrivenVeh.vehicleId] : null;
  const activeDrivenCargo = activeDrivenVeh
    ? (vehicleTuning?.[activeDrivenVeh.vehicleId] ?? getDefaultVehicleTuning(activeDrivenVeh.vehicleId))
        .cargoType
    : null;
  const hasHydraulics = activeDrivenVeh ? isJobCapableVehicle(activeDrivenVeh.vehicleId) : false;
  const activeJobBtnLabel = (() => {
    if (!activeDrivenVeh) return t.vehicles.stats.hydraulicsBtn;
    if ((activeDrivenVeh.workAnimPhase ?? 0) > 0.45) {
      return t.vehicles.stats.retractMechBtn;
    }
    if (
      activeDrivenVeh.vehicleId !== 'excavator' &&
      activeDrivenCfg?.canCarryCargo &&
      activeDrivenCargo === 'empty'
    ) {
      return t.vehicles.stats.reloadCargoBtn;
    }
    return t.vehicles.stats.jobButtons[activeDrivenVeh.vehicleId] ?? t.vehicles.stats.hydraulicsBtn;
  })();

  const handleQuickBuyPlace = () => {
    if (!contextualPlace) return;
    if (isContextualPlaceOwned) {
      openEnterprisesModal(contextualPlace.id);
      return;
    }
    const res = buyEnterprise(contextualPlace.id);
    if (res.ok) {
      showToast(t.enterprises.buySuccess, 'success');
    } else {
      showToast(t.enterprises.insufficientCoins, 'warning');
      openEnterprisesModal(contextualPlace.id);
    }
  };

  const handleCustomMovieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    uploadCustomCinemaVideo(objUrl, file.name, t.venues.customMovieLoadedToast);
    e.target.value = '';
  };

  return (
    <>
      {/* Subtle Aim Reticle when holding Pistol / AK-47 / Golf Club */}
      {!player.inVehicleInstanceId && !metroRide.active && equippedWeapon !== 'unarmed' && activeModal === 'none' && (
        <div className="fixed inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="w-5 h-5 relative flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow" />
            <span className="absolute inset-0 rounded-full border border-white/55" />
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-5">
        {/* TOP BAR: Left Brand/World Status + Mini-Map, Center Live Race / Metro Telemetry, Right VIP Economy/Level/Settings */}
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          {/* Top-Left Corner: Brand + Status + Clock + Weather + Indoor Venue + Non-Interactive Mini-Map */}
          <div className="flex flex-col items-start gap-2">
            <div className={`pointer-events-auto rounded-xl border px-3.5 py-2.5 shadow-lg ${panelSurface}`}>
              <div className="flex items-center gap-3">
                <span className="font-display font-bold tracking-wider text-sm md:text-base whitespace-nowrap">
                  {t.brand}
                </span>
                <span className={mutedText} aria-hidden="true">·</span>
                <span className="text-xs font-medium whitespace-nowrap">
                  {metroRide.active
                    ? t.metro.ridingTitle
                    : player.inVehicleInstanceId
                      ? t.hud.driving
                      : t.hud.onFoot}
                </span>
                {fpsCounter && (
                  <>
                    <span className={mutedText} aria-hidden="true">·</span>
                    <span className="text-xs font-mono-num text-sky-400 whitespace-nowrap">
                      {fps} {t.hud.fps}
                    </span>
                  </>
                )}
              </div>
              <div className={`flex items-center gap-2 text-xs mt-1 ${mutedText}`}>
                <span className="font-mono-num">{formatClock(world.timeHours)}</span>
                <span aria-hidden="true">·</span>
                <span>{t.weatherModes[world.weather]}</span>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[150px] md:max-w-none">
                  {resolveNestedKey(t, `districts.${player.currentDistrict}`)}
                </span>
              </div>
              {activeVenue && (
                <div className="flex items-center gap-2 text-xs mt-1 font-medium text-emerald-400">
                  <span>{t.venues.categories[activeVenue.category]}</span>
                  <span className={mutedText} aria-hidden="true">·</span>
                  <span className="truncate max-w-[190px] md:max-w-none">
                    {resolveNestedKey(t, activeVenue.nameKey)}
                  </span>
                  {ownedProperties.includes(activeVenue.id) && (
                    <>
                      <span className={mutedText} aria-hidden="true">·</span>
                      <span className="text-amber-300 whitespace-nowrap">{t.enterprises.ownedLabel}</span>
                    </>
                  )}
                  {activeVenue.category === 'cinema' && (
                    <>
                      <span className={mutedText} aria-hidden="true">·</span>
                      <span className="text-sky-300 truncate max-w-[180px] md:max-w-none">
                        {t.venues.nowPlayingPrefix}: «
                        {cinemaCustomVideoName ??
                          t.venues.cinemaMovies[activeCinemaMovieIndex] ??
                          t.venues.cinemaMovies[0]}
                        »
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {activeModal === 'none' && <MiniMap />}

            {/* Live Co-op Room Strip (Codes + Online Count + Instant Friend Teleport) */}
            {activeModal === 'none' && coop.mode !== 'solo' && (
              <div className={`pointer-events-auto rounded-xl border border-emerald-500/65 px-3 py-2 shadow-lg space-y-1.5 ${panelSurface}`}>
                <button
                  type="button"
                  onClick={() => setActiveModal('coop')}
                  className="flex items-center gap-2 text-xs font-mono-num tabular-nums whitespace-nowrap text-left"
                >
                  <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    {t.coop.hostCodeShort}: <strong>{coop.hostCode}</strong>
                  </span>
                  <span className={mutedText} aria-hidden="true">·</span>
                  <span className="text-emerald-400">
                    {t.coop.joinCodeShort}: <strong>{coop.joinCode}</strong>
                  </span>
                  <span className={mutedText} aria-hidden="true">·</span>
                  <span>
                    {t.coop.onlineLabel}: <strong>{coopPeersList.length + 1}</strong>
                  </span>
                </button>
                {coopPeersList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (teleportToCoopFriend()) {
                        showToast(t.coop.teleportedToFriendToast, 'success');
                      }
                    }}
                    className="w-full py-1 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] whitespace-nowrap transition-colors"
                  >
                    {t.coop.teleportToFriendBtn} ({coopPeersList[0].name})
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Top-Center: Active Sky-Metro Cabin Ride Banner */}
          {metroRide.active && activeModal === 'none' && (
            <div className={`pointer-events-auto rounded-xl border border-sky-500/75 px-4 py-2.5 shadow-xl flex flex-col gap-2 ${panelSurface}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <TrainFront className="w-5 h-5 text-sky-400 shrink-0" />
                  <div>
                    <div className={`text-[10px] font-medium flex items-center gap-1.5 ${mutedText}`}>
                      <span>{t.metro.ridingTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {activeMetroCurrentStation && metroRide.doorsOpen
                          ? t.metro.doorsOpenStatus
                          : t.metro.nextStationPrefix}
                      </span>
                    </div>
                    <div className="text-xs md:text-sm font-bold font-display whitespace-nowrap">
                      {activeMetroCurrentStation && metroRide.doorsOpen
                        ? resolveNestedKey(t, activeMetroCurrentStation.nameKey)
                        : activeMetroDest
                          ? resolveNestedKey(t, activeMetroDest.nameKey)
                          : t.menu.metro}
                    </div>
                    <svg
                      viewBox="0 0 100 6"
                      preserveAspectRatio="none"
                      className="w-40 h-1.5 rounded-full overflow-hidden mt-1 block"
                    >
                      <rect width="100" height="6" className="fill-slate-800" />
                      <rect
                        width={Math.round(Math.max(6, Math.min(100, metroRide.progress * 100)))}
                        height="6"
                        className="fill-sky-400"
                      />
                    </svg>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={boardOrExitMetro}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs whitespace-nowrap transition-colors shrink-0"
                  >
                    {t.metro.exitTrainBtn}
                  </button>
                  <button
                    type="button"
                    onClick={skipActiveMetroRide}
                    className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs whitespace-nowrap transition-colors shrink-0"
                  >
                    {t.metro.skipArriveBtn}
                  </button>
                </div>
              </div>

              {/* In-Cabin 6-Station Quick Destination Selector (1..6) */}
              <div className="flex items-center gap-1 pt-1 border-t border-slate-700/50 overflow-x-auto">
                {METRO_STATIONS.map((st) => {
                  const isTarget = metroRide.toStationId === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => selectMetroStopWhileRiding(st.id)}
                      className={`px-2 py-1 rounded text-[11px] font-mono-num font-semibold whitespace-nowrap transition-colors shrink-0 ${
                        isTarget
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : isDark
                            ? 'bg-slate-900/90 text-slate-300 hover:bg-slate-800'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {st.stationNumber}-bekat
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top-Center: Live 10-Car Street Race Leaderboard Bar */}
          {isRaceActive && activeModal === 'none' && (
            <div className={`pointer-events-auto rounded-xl border border-amber-500/70 px-4 py-2 shadow-xl flex items-center gap-4 ${panelSurface}`}>
              <div className="flex items-center gap-2">
                <Trophy className={`w-4 h-4 shrink-0 ${raceState.playerRank === 1 ? 'text-amber-400' : 'text-sky-400'}`} />
                <div>
                  <div className={`text-[10px] font-medium ${mutedText}`}>{t.race.rank}</div>
                  <div className="text-base md:text-lg font-bold font-display font-mono-num leading-tight">
                    <span className={raceState.playerRank === 1 ? 'text-amber-400' : 'text-sky-400'}>
                      {raceState.playerRank}
                    </span>
                    <span className={`text-xs ${mutedText}`}> / {raceState.totalRacers}</span>
                  </div>
                </div>
              </div>

              <div className="h-7 w-px bg-slate-700/50" />

              <div>
                <div className={`text-[10px] font-medium ${mutedText}`}>{t.race.checkpoint}</div>
                <div className="text-sm font-bold font-mono-num leading-tight">
                  {Math.min(raceState.checkpointIndex + 1, raceState.totalCheckpoints)} / {raceState.totalCheckpoints}
                  {raceGateDist !== null && (
                    <span className="text-xs text-sky-400 ml-1.5">({raceGateDist}m)</span>
                  )}
                </div>
              </div>

              <div className="h-7 w-px bg-slate-700/50" />

              <div>
                <div className={`text-[10px] font-medium ${mutedText}`}>{t.hud.time}</div>
                <div className="text-sm font-bold font-mono-num leading-tight">
                  {formatRaceTime(raceState.elapsedSeconds)}
                </div>
              </div>

              <button
                type="button"
                onClick={stopCityRace}
                className="p-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/15 transition-colors"
                title={t.race.abort}
                aria-label={t.race.abort}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Top-Center: 4 Viltrumites ("Vilteroytlar") Boss Battle Health Bar */}
          {activeViltrumiteBoss && activeModal === 'none' && (
            <div className="pointer-events-auto rounded-xl border border-red-500/90 bg-slate-950/95 text-red-100 px-4 py-2 shadow-2xl flex flex-col items-center gap-1.5 min-w-[280px]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-400">
                <span>🔥 VILTEROYT: {activeViltrumiteBoss.name}</span>
                <span>·</span>
                <span className="text-amber-300 font-normal">{activeViltrumiteBoss.location}</span>
              </div>
              <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-red-600/70 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.max(0, Math.min(100, (activeViltrumiteBoss.hp / activeViltrumiteBoss.maxHp) * 100))}%`,
                  }}
                />
              </div>
              <div className="text-[10px] text-red-300 font-mono flex items-center justify-between w-full">
                <span>HP: {activeViltrumiteBoss.hp} / {activeViltrumiteBoss.maxHp}</span>
                <span className="text-amber-400 font-semibold animate-pulse">QIZIL KO'Z LAZERI!</span>
              </div>
            </div>
          )}

          {/* Top-Center: Police HQ Restricted Perimeter Shoot-On-Sight Alert */}
          {isInsidePoliceHQ && activeModal === 'none' && (
            <div className="pointer-events-auto rounded-xl border-2 border-red-500 bg-red-950/95 text-red-100 px-4 py-2 shadow-2xl flex items-center gap-2.5 animate-pulse">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 animate-bounce" />
              <div className="text-left">
                <div className="text-xs font-extrabold uppercase tracking-wide text-red-300">
                  HARBIY MILITSIYA CHEKLANGAN HUDUD!
                </div>
                <div className="text-[10px] text-amber-300 font-medium">
                  Policelar o't ochmoqda! Samalyot va Tank shu yerda joylashgan!
                </div>
              </div>
            </div>
          )}

          {/* Top-Right: Wanted Indicator, VIP N-Coins, Level, Settings Trigger */}
          <div className="flex items-center gap-2 pointer-events-auto">
            {wantedLevel > 0 && (
              <div className="rounded-xl border border-red-500/70 bg-slate-950/92 px-3 py-2 shadow-lg text-slate-100">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-[11px] font-bold tracking-wider text-red-300 whitespace-nowrap">
                    {t.hud.wanted}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((starIdx) => (
                      <Star
                        key={starIdx}
                        className={`w-3.5 h-3.5 ${
                          starIdx <= wantedLevel ? 'text-red-400 fill-red-400' : 'text-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {escapeRatio > 0.04 && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[10px] text-sky-300 whitespace-nowrap">{t.hud.escaping}</span>
                    <svg
                      viewBox="0 0 100 6"
                      preserveAspectRatio="none"
                      className="flex-1 h-1.5 rounded-full overflow-hidden min-w-[64px] block"
                    >
                      <rect width="100" height="6" className="fill-slate-800" />
                      <rect width={Math.round(escapeRatio * 100)} height="6" className="fill-sky-400" />
                    </svg>
                  </div>
                )}
              </div>
            )}

            <div className={`rounded-xl border px-3.5 py-2 shadow-lg flex items-center gap-3 ${panelSurface}`}>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-amber-400 whitespace-nowrap">
                  {t.hud.coins}
                </div>
                <div
                  className="text-xs sm:text-sm font-bold font-mono-num tabular-nums text-amber-300 whitespace-nowrap max-w-[165px] sm:max-w-[310px] truncate"
                  title={formattedCoins}
                >
                  {formattedCoins}
                </div>
              </div>
              <div className="h-7 w-px bg-slate-700/50 shrink-0" />
              <div className="shrink-0">
                <div className={`text-[11px] ${mutedText}`}>
                  {t.hud.level} {player.level}
                </div>
                <svg
                  viewBox="0 0 100 6"
                  preserveAspectRatio="none"
                  className="w-16 h-1.5 rounded-full mt-1 overflow-hidden block"
                >
                  <rect width="100" height="6" className="fill-slate-700/60" />
                  <rect
                    width={Math.min(100, Math.round((player.xp / ECONOMY_CONFIG.xpPerLevel) * 100))}
                    height="6"
                    className="fill-sky-400"
                  />
                </svg>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveModal(activeModal === 'settings' ? 'none' : 'settings')}
              className={`p-3 rounded-xl border shadow-lg transition-colors ${panelSurface} hover:border-sky-500`}
              aria-label={t.menu.settings}
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CENTER OVERLAYS: 3-2-1-GO Countdown, Finished Result Card, or Toast */}
        <div className="self-center flex flex-col items-center gap-2.5">
          {raceState.status === 'countdown' && activeModal === 'none' && (
            <div className="pointer-events-none rounded-2xl border border-amber-500/80 bg-slate-950/92 px-8 py-4 text-center shadow-2xl">
              <div className="text-xs font-semibold tracking-wider text-amber-400">
                {t.race.getReady}
              </div>
              <div className="text-5xl md:text-6xl font-bold font-display font-mono-num text-white mt-1">
                {Math.max(1, Math.ceil(raceState.countdown))}
              </div>
              <div className="text-[11px] font-mono-num text-slate-300 mt-1">
                {t.race.prizeLabel}
              </div>
            </div>
          )}

          {raceState.status === 'racing' && raceState.elapsedSeconds < 1.3 && activeModal === 'none' && (
            <div className="pointer-events-none rounded-2xl border border-emerald-500/80 bg-emerald-950/92 px-8 py-3 text-center shadow-2xl">
              <div className="text-4xl md:text-5xl font-bold font-display tracking-wider text-emerald-300">
                {t.race.go}
              </div>
            </div>
          )}

          {raceState.status === 'finished' && activeModal === 'none' && (
            <div className={`pointer-events-auto rounded-2xl border p-5 shadow-2xl max-w-md w-full text-center ${panelSurface} ${
              raceState.playerWon ? 'border-amber-400' : 'border-slate-700'
            }`}>
              <div className="flex items-center justify-center gap-2">
                <Trophy className={`w-6 h-6 ${raceState.playerWon ? 'text-amber-400' : 'text-slate-400'}`} />
                <h3 className="text-lg font-bold font-display">
                  {raceState.playerWon ? t.race.winTitle : t.race.loseTitle}
                </h3>
              </div>
              <p className={`text-xs font-mono-num mt-2 ${raceState.playerWon ? 'text-amber-300 font-semibold' : mutedText}`}>
                {raceState.playerWon
                  ? t.race.winDesc
                  : `${t.race.rank}: ${raceState.playerRank} / ${raceState.totalRacers} · ${t.race.loseDescPrefix} ${
                      raceState.winnerVehicleId ? t.vehicles[raceState.winnerVehicleId].name : 'AI'
                    }`}
              </p>
              <div className="flex items-center justify-center gap-2.5 mt-4">
                <button
                  type="button"
                  onClick={() => startCityRace(t.race.startedToast)}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap transition-colors"
                >
                  {t.race.retry}
                </button>
                <button
                  type="button"
                  onClick={stopCityRace}
                  className={`px-4 py-2 rounded-lg border text-xs font-medium whitespace-nowrap transition-colors ${
                    isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {t.race.close}
                </button>
              </div>
            </div>
          )}

          {toast && (
            <div className="pointer-events-none">
              <div
                className={`px-4 py-2 rounded-lg border text-xs md:text-sm font-medium shadow-xl ${
                  toast.tone === 'success'
                    ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200'
                    : toast.tone === 'warning'
                      ? 'bg-amber-950/95 border-amber-500/60 text-amber-200'
                      : panelSurface
                }`}
              >
                {toast.text}
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM CLUSTER: Arsenal Bar + Mission Tracker + Interaction Prompt + Collapsible Dock */}
        <div className="flex flex-col items-center gap-2 mb-0 md:mb-1">
          {/* Contextual Interaction Prompt (E / F) & On-the-Spot Property Purchase Button (B) */}
          {activeModal === 'none' && !metroRide.active && (nearestInteractable || contextualPlace) && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {nearestInteractable?.type === 'metro_station' && !player.inVehicleInstanceId && (
                <button
                  type="button"
                  onClick={boardOrExitMetro}
                  className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-xl border shadow-xl transition-transform active:scale-95 ${panelSurface} border-emerald-500/80`}
                >
                  <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono-num font-bold text-xs">
                    E
                  </span>
                  <TrainFront className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs md:text-sm font-semibold whitespace-nowrap">
                    {t.prompts.enterMetroTrain}
                  </span>
                </button>
              )}

              {nearestInteractable && (
                <button
                  type="button"
                  onClick={() => {
                    if (nearestInteractable.keyHint === 'E') {
                      engineCommandRef.toggleEnterExitVehicle = true;
                    } else {
                      engineCommandRef.triggerInteract = true;
                    }
                  }}
                  className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-xl border shadow-xl transition-transform active:scale-95 ${panelSurface} border-sky-500/70`}
                >
                  <span className="px-2 py-0.5 rounded bg-sky-500 text-slate-950 font-mono-num font-bold text-xs">
                    {nearestInteractable.keyHint}
                  </span>
                  <span className="text-xs md:text-sm font-medium whitespace-nowrap">
                    {resolveNestedKey(t, nearestInteractable.labelKey)}
                    {nearestInteractable.type === 'vehicle' &&
                    nearestInteractable.payloadId &&
                    t.vehicles[nearestInteractable.payloadId as VehicleId]
                      ? ` · ${t.vehicles[nearestInteractable.payloadId as VehicleId].name}`
                      : ''}
                  </span>
                </button>
              )}

              {contextualPlace && (
                <button
                  type="button"
                  onClick={handleQuickBuyPlace}
                  className={`pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-xl border shadow-xl transition-transform active:scale-95 ${panelSurface} ${
                    isContextualPlaceOwned ? 'border-emerald-500/70' : 'border-amber-500/75'
                  }`}
                >
                  <span
                    className={`px-2 py-0.5 rounded font-mono-num font-bold text-xs ${
                      isContextualPlaceOwned ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    B
                  </span>
                  {isContextualPlaceOwned ? (
                    <span className="text-xs md:text-sm font-semibold text-emerald-400 flex items-center gap-1.5 whitespace-nowrap">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.enterprises.ownedLabel}</span>
                      <span className="font-mono-num text-emerald-300">
                        (+{formatNCoins(contextualPlace.incomePerTick)} {t.enterprises.incomeUnit})
                      </span>
                    </span>
                  ) : (
                    <span className="text-xs md:text-sm font-semibold whitespace-nowrap">
                      {t.enterprises.quickBuyBtn} ·{' '}
                      <span className="font-mono-num text-amber-400">
                        {formatNCoins(contextualPlace.purchasePrice)} N-Coin
                      </span>
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Indoor Bank / Museum / Shop Heist Action Bar (Key H) */}
          {activeModal === 'none' && !player.inVehicleInstanceId && !metroRide.active && activeHeistTarget && (
            <div className="pointer-events-auto flex items-center justify-center">
              {isCrackingCurrentVenue ? (
                <div
                  className={`rounded-xl border border-red-500/80 px-4 py-2.5 shadow-xl space-y-1.5 min-w-[270px] ${panelSurface}`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs font-bold">
                    <span className="text-red-300 flex items-center gap-1.5 whitespace-nowrap">
                      <Landmark className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        {activeHeistTarget.kind === 'bank'
                          ? t.heist.crackingBank
                          : activeHeistTarget.kind === 'museum'
                            ? t.heist.crackingMuseum
                            : t.heist.crackingShop}
                      </span>
                    </span>
                    <span className="font-mono-num tabular-nums text-amber-300 whitespace-nowrap">
                      {Math.round(heist.progress * 100)}%
                    </span>
                  </div>
                  <svg
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                    className="w-full h-2 rounded-full overflow-hidden block"
                  >
                    <rect width="100" height="6" className="fill-slate-800" />
                    <rect
                      width={Math.max(4, Math.min(100, Math.round(heist.progress * 100)))}
                      height="6"
                      className="fill-amber-400"
                    />
                  </svg>
                </div>
              ) : heistCooldownLeftSec > 0 ? (
                <div
                  className={`rounded-xl border border-slate-700 px-3.5 py-2 shadow-lg text-xs font-mono-num tabular-nums flex items-center gap-2 whitespace-nowrap ${panelSurface}`}
                >
                  <Landmark className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>
                    {t.heist.cooldownPrefix} <strong>{heistCooldownLeftSec}s</strong>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={requestStartHeist}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-red-500/80 bg-slate-950/95 hover:bg-red-950/80 text-white shadow-xl transition-transform active:scale-95 whitespace-nowrap"
                >
                  <span className="px-2 py-0.5 rounded bg-red-500 text-white font-mono-num font-bold text-xs">
                    H
                  </span>
                  <Landmark className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs md:text-sm font-bold">
                    {activeHeistTarget.kind === 'bank'
                      ? t.heist.robBankBtn
                      : activeHeistTarget.kind === 'museum'
                        ? t.heist.robMuseumBtn
                        : t.heist.robShopBtn}
                  </span>
                  <span className="font-mono-num tabular-nums text-xs md:text-sm font-bold text-amber-300">
                    +{formatNCoins(activeHeistTarget.rewardCoins)} N-Coin
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Indoor Real Cinema Video Controller Bar */}
          {activeModal === 'none' && !player.inVehicleInstanceId && activeVenue?.category === 'cinema' && (
            <div className={`pointer-events-auto rounded-xl border p-1.5 shadow-xl flex flex-wrap items-center justify-center gap-1.5 ${panelSurface}`}>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/*"
                onChange={handleCustomMovieUpload}
                className="hidden"
              />
              <Film className="w-4 h-4 text-sky-400 ml-1.5 shrink-0" />
              {t.venues.cinemaMovies.map((mTitle, mIdx) => {
                const isSelected = !cinemaCustomVideoName && activeCinemaMovieIndex === mIdx;
                return (
                  <button
                    key={mIdx}
                    type="button"
                    onClick={() =>
                      selectCinemaMovie(mIdx, `${t.venues.movieSwitchedPrefix} «${mTitle}»`)
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : isDark
                          ? 'text-slate-300 hover:bg-slate-800'
                          : 'text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {mIdx + 1}-Kino
                  </button>
                );
              })}
              <button
                type="button"
                onClick={toggleCinemaPlayPause}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
              >
                {cinemaPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                <span>{t.venues.playPauseBtn}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t.venues.uploadMovieBtn}</span>
              </button>
            </div>
          )}

          {/* 4-Slot On-Foot Arsenal Selector (1: Unarmed, 2: Pistol, 3: AK-47, 4: Golf Club) */}
          {!player.inVehicleInstanceId && !metroRide.active && activeModal === 'none' && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5">
              <div className={`rounded-xl border p-1 shadow-lg flex items-center gap-1 ${panelSurface}`}>
                {ALL_WEAPON_IDS.map((wid, idx) => {
                  const active = equippedWeapon === wid;
                  return (
                    <button
                      key={wid}
                      type="button"
                      onClick={() => setEquippedWeapon(wid)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : isDark
                            ? 'text-slate-300 hover:bg-slate-800/80'
                            : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      <span className="font-mono-num opacity-75">{idx + 1}.</span>
                      <span>{weaponNames[wid]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Mission & Speedometer Row */}
          {!dockCollapsed && (
            <div className="w-full max-w-4xl flex flex-col md:flex-row items-stretch md:items-end justify-between gap-2.5">
              {!isRaceActive && activeDef && activeProg ? (
                <div className={`pointer-events-auto rounded-xl border px-3.5 py-2.5 shadow-lg max-w-sm ${panelSurface}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold font-display text-amber-400 truncate">
                      {resolveNestedKey(t, activeDef.titleKey)}
                    </span>
                    {activeProg.remainingSeconds !== null && (
                      <span className="text-xs font-mono-num font-semibold text-red-400 whitespace-nowrap">
                        {Math.ceil(activeProg.remainingSeconds)}s
                      </span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>
                    {activeCheckpoint
                      ? resolveNestedKey(t, activeCheckpoint.labelKey)
                      : resolveNestedKey(t, activeDef.objectiveKey)}
                  </p>
                  <div className={`flex items-center gap-2 text-[11px] font-mono-num mt-1.5 ${mutedText}`}>
                    {activeDef.type === 'safe_traffic' ? (
                      <span>
                        {Math.round(activeProg.distanceAccumulated)} / {activeDef.targetDistanceMeters} m
                      </span>
                    ) : (
                      <span>
                        {t.missions.actions.progress}: {activeProg.currentStep}/{activeProg.totalSteps}
                      </span>
                    )}
                    {navDistance !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-sky-400">{navDistance} m</span>
                      </>
                    )}
                  </div>
                </div>
              ) : !isRaceActive && navDistance !== null ? (
                <div className={`pointer-events-auto rounded-xl border px-3.5 py-2 shadow-lg flex items-center gap-2 text-xs ${panelSurface}`}>
                  <Compass className="w-4 h-4 text-sky-400" />
                  <span className="font-mono-num">
                    {t.hud.waypoint}: {navDistance} m
                  </span>
                </div>
              ) : (
                <div />
              )}

              {player.inVehicleInstanceId && (
                <div className="pointer-events-auto self-end flex flex-wrap items-center justify-end gap-2">
                  {activeDrivenVeh && activeDrivenCfg?.canCarryCargo && activeDrivenCargo && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextCargo = cycleVehicleCargo(activeDrivenVeh.vehicleId);
                        showToast(
                          `${t.vehicles.stats.cargoChangedToast} ${t.vehicles.stats.cargoTypes[nextCargo]}`,
                          'info',
                        );
                      }}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-colors whitespace-nowrap shrink-0 ${panelSurface} border-amber-500/70 hover:bg-amber-500/15`}
                    >
                      <Truck className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        {t.vehicles.stats.cargoTypes[activeDrivenCargo]} · {t.vehicles.stats.cycleCargoBtn}
                      </span>
                    </button>
                  )}

                  {activeDrivenVeh && hasHydraulics && (
                    <button
                      type="button"
                      onClick={triggerVehicleHydraulics}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-colors whitespace-nowrap shrink-0 ${panelSurface} border-sky-500/70 hover:bg-sky-500/15`}
                    >
                      <Wrench className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>{activeJobBtnLabel}</span>
                    </button>
                  )}

                  {activeDrivenVeh && activeDrivenCfg?.bodyStyle === 'tank' && (
                    <button
                      type="button"
                      onClick={triggerTankCannon}
                      className="px-3.5 py-2 rounded-xl border border-red-500 bg-red-950/90 hover:bg-red-800 text-red-100 text-xs font-bold flex items-center gap-1.5 shadow-xl transition-all active:scale-90 animate-pulse shrink-0 cursor-pointer"
                    >
                      <span className="text-base">💥</span>
                      <span>120mm ZAMBARAK [Space / F / Bosish]</span>
                    </button>
                  )}

                  {activeDrivenVeh && activeDrivenCfg?.bodyStyle === 'airplane' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={triggerAirplaneGun}
                        className="px-3 py-2 rounded-xl border border-amber-400 bg-amber-950/90 hover:bg-amber-800 text-amber-100 text-xs font-bold flex items-center gap-1.5 shadow-xl transition-all active:scale-90 shrink-0 cursor-pointer"
                      >
                        <span className="text-sm">🔥</span>
                        <span>30mm PULEMYOT [F / Space]</span>
                      </button>
                      <button
                        type="button"
                        onClick={triggerAirplaneBomb}
                        className="px-3 py-2 rounded-xl border border-red-500 bg-red-950/90 hover:bg-red-800 text-red-100 text-xs font-bold flex items-center gap-1.5 shadow-xl transition-all active:scale-90 animate-pulse shrink-0 cursor-pointer"
                      >
                        <span className="text-base">💣</span>
                        <span>BOMBA TASHLASH [B / X]</span>
                      </button>
                      <div className={`px-3 py-2 rounded-xl border border-sky-400 text-xs font-semibold flex items-center gap-2 shadow-lg shrink-0 ${panelSurface}`}>
                        <span className="text-sm">✈️</span>
                        <span className="font-mono-num text-sky-400">
                          Balandlik: {Math.round(player.position.y || 0)}m
                        </span>
                      </div>
                    </div>
                  )}

                  <div className={`rounded-xl border px-4 py-2 shadow-lg flex items-baseline gap-2 ${panelSurface}`}>
                    <span className="text-2xl md:text-3xl font-bold font-display font-mono-num tabular-nums tracking-tight text-sky-400">
                      {speedKmh}
                    </span>
                    <span className={`text-xs font-semibold ${mutedText}`}>{t.hud.speed}</span>
                  </div>
                </div>
              )}

              {!player.inVehicleInstanceId && (
                <div className="pointer-events-auto self-end flex items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerSpiderWebZip}
                    className="px-3.5 py-2 rounded-xl border border-sky-400/90 bg-slate-950/90 hover:bg-sky-950 text-sky-200 text-xs font-bold flex items-center gap-2 shadow-xl transition-all active:scale-95"
                  >
                    <span className="text-base">🕸️</span>
                    <span>
                      {spiderWebTarget
                        ? `To'r Uchish (${spiderWebTarget.distance}m) [E / Q / Bosish]`
                        : "Spiderman To'ri (E / Q / O'ng Click)"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Unified Collapsible Bottom Control Dock (Desktop & Tablet quick bar) */}
          <div className="hidden md:flex flex-col items-center pointer-events-auto">
            <button
              type="button"
              onClick={toggleDock}
              className={`px-3 py-1 rounded-t-lg border border-b-0 text-[11px] font-medium flex items-center gap-1 ${panelSurface}`}
            >
              {dockCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{dockCollapsed ? t.hud.showControls : t.hud.hideControls}</span>
            </button>

            {!dockCollapsed && (
              <div className={`rounded-xl border px-3 py-2 shadow-xl flex items-center gap-1.5 ${panelSurface}`}>
                <button
                  type="button"
                  onClick={() => {
                    if (isRaceActive) {
                      stopCityRace();
                    } else {
                      startCityRace(t.race.startedToast);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                    isRaceActive
                      ? 'bg-amber-500 text-slate-950'
                      : 'hover:bg-amber-500/20 text-amber-400'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>{isRaceActive ? t.race.abort : t.race.dockBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('coop')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                    coop.mode !== 'solo'
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'hover:bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>{t.coop.dockBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('map')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-500/15 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <MapIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t.menu.map} (M)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('missions')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-500/15 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.menu.missions} (J)</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openMetroModal(
                      nearestInteractable?.type === 'metro_station'
                        ? nearestInteractable.payloadId ?? null
                        : null,
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-500/15 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <TrainFront className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t.menu.metro} (T)</span>
                </button>

                <button
                  type="button"
                  onClick={() => openEnterprisesModal(contextualPlaceId)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-emerald-500/15 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.menu.enterprises} (K)</span>
                </button>

                {!player.inVehicleInstanceId && (
                  <button
                    type="button"
                    onClick={() => openGarageModal('heavy_machinery')}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-amber-500/20 text-amber-400 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <Truck className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t.vehicles.stats.heavyDockBtn}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openGarageModal('all')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-500/15 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Car className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t.menu.garage}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('inventory')}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-500/15 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Briefcase className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t.menu.inventory} (I)</span>
                </button>

                <button
                  type="button"
                  onClick={cycleCameraMode}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-sky-500/15 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t.cameras[cameraMode]} (V)</span>
                </button>

                {player.inVehicleInstanceId && (
                  <button
                    type="button"
                    onClick={() => {
                      engineCommandRef.resetCurrentVehicle = true;
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-500/15 text-amber-400 flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t.hud.resetCar}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile compact top-level quick buttons strip */}
          <div className="flex md:hidden flex-wrap justify-center items-center gap-1.5 pointer-events-auto mb-32">
            <button
              type="button"
              onClick={() => {
                if (isRaceActive) {
                  stopCityRace();
                } else {
                  startCityRace(t.race.startedToast);
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                isRaceActive
                  ? 'bg-amber-500 border-amber-400 text-slate-950'
                  : `${panelSurface} text-amber-400`
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>{t.race.dockBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('coop')}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 ${
                coop.mode !== 'solo'
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 font-bold'
                  : `${panelSurface} text-emerald-400`
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{t.coop.dockBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('map')}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${panelSurface}`}
            >
              <MapIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.menu.map}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openMetroModal(
                  nearestInteractable?.type === 'metro_station'
                    ? nearestInteractable.payloadId ?? null
                    : null,
                )
              }
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${panelSurface}`}
            >
              <TrainFront className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.menu.metro}</span>
            </button>
            <button
              type="button"
              onClick={() => openEnterprisesModal(contextualPlaceId)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${panelSurface}`}
            >
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.menu.enterprises}</span>
            </button>
            {!player.inVehicleInstanceId && (
              <button
                type="button"
                onClick={() => openGarageModal('heavy_machinery')}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold text-amber-400 flex items-center gap-1 whitespace-nowrap shrink-0 ${panelSurface}`}
              >
                <Truck className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.vehicles.stats.heavyDockBtn}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => openGarageModal('all')}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0 ${panelSurface}`}
            >
              <Car className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.menu.garage}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('inventory')}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 shrink-0 ${panelSurface}`}
            >
              <Briefcase className="w-3.5 h-3.5 text-purple-400" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
