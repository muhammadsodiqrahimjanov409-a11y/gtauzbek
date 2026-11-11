import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Check, Lock, ShoppingBag, Sparkles, Truck, X } from 'lucide-react';
import type { CargoLoadId, RimStyleId, VehicleBodyStyle, VehicleId } from '../types/game';
import {
  ALL_CARGO_LOADS,
  ALL_RIM_STYLES,
  ALL_VEHICLE_IDS,
  BIG_VEHICLE_IDS,
  getDefaultVehicleTuning,
  INTERIOR_COLOR_PALETTE,
  RIM_COLOR_PALETTE,
  TIRE_COLOR_PALETTE,
  VEHICLE_CONFIGS,
} from '../game/gameConfig';
import { formatNCoins } from '../economy/EconomyManager';
import { createProceduralVehicleModel, type VehicleRig } from '../vehicles/Vehicle';
import { detectSoftwareWebGL, disposeObject3D } from '../utils/performance';
import { startPacedRenderLoop } from '../game/GameLoop';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations } from '../i18n';

interface GarageProps {
  mode: 'garage' | 'dealership';
}

type ShowroomFilter =
  | 'all'
  | 'owned'
  | 'heavy_machinery'
  | 'sport_super'
  | 'everyday'
  | 'suv_truck';

type ShowroomCameraView = 'exterior' | 'interior' | 'wheels' | 'cargo';

// Pre-allocated camera target math helpers (zero per-frame GC)
const _camGoalPos = new THREE.Vector3();
const _camGoalLook = new THREE.Vector3();
const _camCurLook = new THREE.Vector3(0, 0.85, 0);

function computeShowroomCameraTargets(
  view: ShowroomCameraView,
  style: VehicleBodyStyle,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
): number | null {
  const isFura = style === 'fura';
  const isHowo = style === 'howo';
  const isKamaz = style === 'kamaz';
  const isIsuzu = style === 'isuzu';
  const isGazel = style === 'gazel';
  const isLabo = style === 'labo';
  const isZil = style === 'zil';
  const isExcavator = style === 'excavator';
  const isHeavy = isFura || isHowo || isKamaz || isIsuzu || isGazel || isLabo || isZil || isExcavator;

  if (view === 'interior') {
    if (isFura || isHowo) {
      outPos.set(2.85, 2.88, 4.15);
      outLook.set(0.15, 2.02, 2.65);
    } else if (isKamaz || isIsuzu) {
      outPos.set(2.72, 2.58, 3.55);
      outLook.set(0.15, 1.82, 2.1);
    } else if (isGazel) {
      outPos.set(2.52, 2.24, 2.75);
      outLook.set(0.12, 1.56, 1.38);
    } else if (isLabo) {
      outPos.set(2.22, 1.98, 2.35);
      outLook.set(0.1, 1.38, 1.15);
    } else if (isZil) {
      outPos.set(2.6, 2.28, 2.25);
      outLook.set(0.1, 1.56, 0.88);
    } else if (isExcavator) {
      outPos.set(2.45, 2.38, 1.75);
      outLook.set(0.56, 1.72, 0.22);
    } else if (style === 'suv' || style === 'pickup') {
      outPos.set(2.25, 1.72, 1.55);
      outLook.set(0.1, 1.18, 0.12);
    } else if (style === 'hypercar' || style === 'sport') {
      outPos.set(1.95, 1.24, 1.25);
      outLook.set(0.08, 0.72, -0.05);
    } else {
      outPos.set(2.08, 1.48, 1.38);
      outLook.set(0.08, 0.94, -0.06);
    }
    return -0.22; // Fixed podium yaw so driver cabin & windshield face camera cleanly
  }

  if (view === 'wheels') {
    if (isFura || isHowo) {
      outPos.set(3.55, 0.92, 2.2);
      outLook.set(0.95, 0.55, 0.65);
    } else if (isKamaz || isIsuzu || isGazel || isZil || isExcavator) {
      outPos.set(3.15, 0.85, 1.85);
      outLook.set(0.95, 0.55, 0.35);
    } else {
      outPos.set(2.42, 0.68, 1.58);
      outLook.set(0.85, 0.42, 0.35);
    }
    return -0.18;
  }

  if (view === 'cargo') {
    if (isFura || isHowo) {
      outPos.set(4.85, 3.15, -4.45);
      outLook.set(0, 1.38, -1.45);
    } else if (isKamaz || isIsuzu || isGazel || isZil) {
      outPos.set(4.15, 2.85, -3.85);
      outLook.set(0, 1.32, -1.25);
    } else if (isLabo) {
      outPos.set(3.25, 2.2, -2.95);
      outLook.set(0, 1.05, -0.95);
    } else if (isExcavator) {
      outPos.set(3.85, 2.45, 3.95);
      outLook.set(0, 1.15, 1.55);
    } else {
      // Pickup truck bed
      outPos.set(3.35, 2.25, -3.15);
      outLook.set(0, 1.15, -1.35);
    }
    return 0.15;
  }

  // 'exterior' — wide 360° turntable view
  const scale = isFura
    ? 1.48
    : isHowo
      ? 1.42
      : isLabo
        ? 1.05
        : isHeavy
          ? 1.28
          : style === 'limo'
            ? 1.14
            : 1.0;
  outPos.set(4.9 * scale, 2.32 * scale, 5.9 * scale);
  outLook.set(0, 0.85 * (isHeavy && !isLabo ? 1.25 : 1.0), 0);
  return null; // Free orbit / auto-spin
}

const ColorSwatchButton: React.FC<{
  hex: string;
  active: boolean;
  onClick: () => void;
}> = ({ hex, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={hex}
    className={`w-6 h-6 rounded-full p-0.5 border-2 transition-transform shrink-0 ${
      active ? 'border-sky-400 scale-110' : 'border-slate-500/60 hover:scale-105'
    }`}
  >
    <svg viewBox="0 0 20 20" className="w-full h-full block">
      <circle cx="10" cy="10" r="9" fill={hex} />
    </svg>
  </button>
);

export const Garage: React.FC<GarageProps> = ({ mode }) => {
  const inventory = useGameStore((s) => s.inventory);
  const vehicles = useGameStore((s) => s.vehicles);
  const coins = useGameStore((s) => s.economy.coins);
  const gameStarted = useGameStore((s) => s.gameStarted);
  const garageInitialFilter = useGameStore((s) => s.garageInitialFilter);
  const inVehicleInstanceId = useGameStore((s) => s.player.inVehicleInstanceId);
  const buyVehicle = useGameStore((s) => s.buyVehicle);
  const selectAndSpawnVehicle = useGameStore((s) => s.selectAndSpawnVehicle);
  const setVehiclePaint = useGameStore((s) => s.setVehiclePaint);
  const setVehicleTuning = useGameStore((s) => s.setVehicleTuning);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const playOrContinue = useGameStore((s) => s.playOrContinue);
  const showToast = useGameStore((s) => s.showToast);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const activeDrivenVehicleId: VehicleId | null = inVehicleInstanceId
    ? (vehicles.find((v) => v.instanceId === inVehicleInstanceId)?.vehicleId ?? null)
    : null;
  const inVehicle = Boolean(inVehicleInstanceId);

  const [filter, setFilter] = useState<ShowroomFilter>(() => garageInitialFilter);
  const [inspectedId, setInspectedId] = useState<VehicleId>(
    () =>
      activeDrivenVehicleId ??
      (garageInitialFilter === 'heavy_machinery' ? 'gazel' : inventory.selectedVehicle),
  );
  const [camView, setCamView] = useState<ShowroomCameraView>('exterior');

  const previewMountRef = useRef<HTMLDivElement | null>(null);
  const activeRigRef = useRef<{ id: VehicleId; rig: VehicleRig } | null>(null);
  const camViewRef = useRef<ShowroomCameraView>('exterior');
  camViewRef.current = camView;

  const dragStateRef = useRef<{
    dragging: boolean;
    lastX: number;
    manualYaw: number | null;
  }>({
    dragging: false,
    lastX: 0,
    manualYaw: null,
  });

  const filteredIds: VehicleId[] =
    filter === 'heavy_machinery'
      ? [...BIG_VEHICLE_IDS]
      : ALL_VEHICLE_IDS.filter((vid) => {
          if (filter === 'all') return true;
          if (filter === 'owned') return inventory.ownedVehicles.includes(vid);
          return VEHICLE_CONFIGS[vid].category === filter;
        });

  const currentCfg = VEHICLE_CONFIGS[inspectedId] ?? VEHICLE_CONFIGS.sedan;
  const currentPaint = inventory.vehicleColors[inspectedId] ?? currentCfg.defaultColor;
  const currentTuning = inventory.vehicleTuning?.[inspectedId] ?? getDefaultVehicleTuning(inspectedId);
  const isOwned = inventory.ownedVehicles.includes(inspectedId);
  const isTuningCurrentDrivenCar = gameStarted && inVehicle && activeDrivenVehicleId === inspectedId;

  // Reset cargo view if switching to a car without open cargo bed
  useEffect(() => {
    if (camView === 'cargo' && !currentCfg.canCarryCargo) {
      setCamView('exterior');
    }
    dragStateRef.current.manualYaw = null;
  }, [inspectedId, currentCfg.canCarryCargo, camView]);

  // Isolated 3D Showroom Preview Canvas with Smooth Camera Presets & Drag-to-Orbit
  useEffect(() => {
    const container = previewMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !isSoftwareGl, alpha: false });
    } catch {
      return;
    }

    const w = container.clientWidth || 460;
    const h = container.clientHeight || 280;
    renderer.setSize(w, h);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? '#0B1120' : '#E2E8F0');

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, w / Math.max(1, h), 0.2, 65);
    computeShowroomCameraTargets(camViewRef.current, currentCfg.bodyStyle, _camGoalPos, _camGoalLook);
    camera.position.copy(_camGoalPos);
    _camCurLook.copy(_camGoalLook);
    camera.lookAt(_camCurLook);

    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.95);
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    keyLight.position.set(6, 9, 7);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
    rimLight.position.set(-6, 5, -6);
    scene.add(hemi, keyLight, rimLight);

    const podium = new THREE.Group();
    const padRadius =
      currentCfg.bodyStyle === 'fura' || currentCfg.bodyStyle === 'howo'
        ? 5.05
        : currentCfg.category === 'heavy_machinery'
          ? 4.35
          : 3.55;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(padRadius, padRadius + 0.22, 0.2, 42),
      new THREE.MeshStandardMaterial({
        color: isDark ? 0x1e293b : 0xcbd5e1,
        roughness: 0.3,
        metalness: 0.62,
      }),
    );
    pad.position.y = -0.1;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(padRadius + 0.05, 0.045, 8, 52).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 }),
    );
    ring.position.y = 0.012;
    podium.add(pad, ring);
    scene.add(podium);

    const rig = createProceduralVehicleModel(inspectedId, currentPaint, false, currentTuning);
    podium.add(rig.root);
    activeRigRef.current = { id: inspectedId, rig };

    const loop = startPacedRenderLoop(renderer, isSoftwareGl, (dt, elapsed) => {
      const safeDt = Math.min(0.08, Math.max(0.001, dt));
      const fixedYaw = computeShowroomCameraTargets(
        camViewRef.current,
        currentCfg.bodyStyle,
        _camGoalPos,
        _camGoalLook,
      );

      if (dragStateRef.current.manualYaw !== null) {
        podium.rotation.y = THREE.MathUtils.damp(
          podium.rotation.y,
          dragStateRef.current.manualYaw,
          8,
          safeDt,
        );
      } else if (fixedYaw !== null) {
        podium.rotation.y = THREE.MathUtils.damp(podium.rotation.y, fixedYaw, 6, safeDt);
      } else {
        podium.rotation.y += safeDt * 0.52;
      }

      camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoalPos.x, 6.5, safeDt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoalPos.y, 6.5, safeDt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoalPos.z, 6.5, safeDt);

      _camCurLook.x = THREE.MathUtils.damp(_camCurLook.x, _camGoalLook.x, 7.5, safeDt);
      _camCurLook.y = THREE.MathUtils.damp(_camCurLook.y, _camGoalLook.y, 7.5, safeDt);
      _camCurLook.z = THREE.MathUtils.damp(_camCurLook.z, _camGoalLook.z, 7.5, safeDt);
      camera.lookAt(_camCurLook);

      const demoHydraulics =
        camViewRef.current === 'cargo'
          ? 0.45 * (0.5 + 0.5 * Math.sin(elapsed * 1.5))
          : 0.14 * (0.5 + 0.5 * Math.sin(elapsed * 0.9));

      activeRigRef.current?.rig.updateVisuals(
        elapsed * 2.1,
        Math.sin(elapsed * 0.9) * 0.18,
        true,
        false,
        0,
        0,
        demoHydraulics,
      );
      renderer.render(scene, camera);
    });

    const onResize = () => {
      if (!previewMountRef.current) return;
      const nw = previewMountRef.current.clientWidth;
      const nh = previewMountRef.current.clientHeight;
      if (nw > 0 && nh > 0) {
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      loop.stop();
      envRT.dispose();
      disposeObject3D(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      activeRigRef.current = null;
    };
  }, [inspectedId, isDark, currentCfg.bodyStyle, currentCfg.category]);

  // Live paint & tuning updates without tearing down WebGL canvas
  useEffect(() => {
    if (activeRigRef.current && activeRigRef.current.id === inspectedId) {
      activeRigRef.current.rig.setPaintColor(currentPaint);
      activeRigRef.current.rig.applyTuning(currentTuning);
    }
  }, [currentPaint, currentTuning, inspectedId]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current.dragging = true;
    dragStateRef.current.lastX = e.clientX;
    if (dragStateRef.current.manualYaw === null) {
      dragStateRef.current.manualYaw = 0;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.dragging) return;
    const dx = e.clientX - dragStateRef.current.lastX;
    dragStateRef.current.lastX = e.clientX;
    dragStateRef.current.manualYaw = (dragStateRef.current.manualYaw ?? 0) + dx * 0.011;
  };

  const handlePointerUp = () => {
    dragStateRef.current.dragging = false;
  };

  const switchCameraView = (view: ShowroomCameraView) => {
    dragStateRef.current.manualYaw = null;
    setCamView(view);
  };

  const handleBuy = () => {
    const res = buyVehicle(inspectedId);
    if (!res.ok && res.reason === 'insufficient_funds') {
      showToast(t.vehicles.stats.insufficientCoins, 'warning');
      return;
    }
    if (res.ok && !(gameStarted && inVehicle)) {
      if (!gameStarted) {
        playOrContinue(t.hud.corruptedSave, t.menu.noSaveFound);
      }
      selectAndSpawnVehicle(inspectedId, true);
    }
  };

  const handleDrive = () => {
    if (!isOwned) return;
    if (isTuningCurrentDrivenCar) {
      setActiveModal('none');
      return;
    }
    if (gameStarted && inVehicle) {
      showToast(t.vehicles.stats.exitCurrentCarFirst, 'warning');
      return;
    }
    if (!gameStarted) {
      playOrContinue(t.hud.corruptedSave, t.menu.noSaveFound);
    }
    selectAndSpawnVehicle(inspectedId, true);
  };

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-600';
  const chipIdle = isDark
    ? 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200';

  const vehicleInfo = t.vehicles[inspectedId];
  const speedPct = Math.min(100, Math.round((currentCfg.maxSpeed / 60) * 100));
  const accelPct = Math.min(100, Math.round((currentCfg.acceleration / 32) * 100));
  const handlePct = Math.min(100, Math.round((currentCfg.turnSpeed / 2.95) * 100));
  const brakePct = Math.min(100, Math.round((currentCfg.braking / 40) * 100));

  const cameraButtons: Array<[ShowroomCameraView, string]> = [
    ['exterior', t.vehicles.stats.camViews.exterior],
    ['interior', t.vehicles.stats.camViews.interior],
    ['wheels', t.vehicles.stats.camViews.wheels],
    ...(currentCfg.canCarryCargo
      ? ([['cargo', t.vehicles.stats.camViews.cargo]] as Array<[ShowroomCameraView, string]>)
      : []),
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-2.5 md:p-4">
      <div
        className={`w-full max-w-6xl rounded-xl border p-4 md:p-5 shadow-2xl modal-scroll-zone max-h-[94vh] overflow-y-auto ${surfaceCls}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800/50">
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide">
              {mode === 'dealership' ? t.menu.dealership : t.menu.garage}
            </h2>
            <p className={`text-xs mt-0.5 font-mono-num tabular-nums ${subText}`}>
              <span className="text-amber-400 font-semibold">
                {t.hud.coins}: {formatNCoins(coins)}
              </span>
              <span aria-hidden="true"> · </span>
              <span>
                {t.profile.unlockedCars}: {inventory.ownedVehicles.length} / {ALL_VEHICLE_IDS.length}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModal('none')}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}
            aria-label={t.menu.back}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filter Segmented Controls */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {(
            [
              ['all', t.vehicles.filters.all],
              ['owned', `${t.vehicles.filters.owned} (${inventory.ownedVehicles.length})`],
              ['heavy_machinery', t.vehicles.filters.heavy_machinery],
              ['sport_super', t.vehicles.filters.sport_super],
              ['everyday', t.vehicles.filters.everyday],
              ['suv_truck', t.vehicles.filters.suv_truck],
            ] as Array<[ShowroomFilter, string]>
          ).map(([fid, label]) => (
            <button
              key={fid}
              type="button"
              onClick={() => {
                setFilter(fid);
                if (fid === 'heavy_machinery' && !inVehicle && !BIG_VEHICLE_IDS.includes(inspectedId)) {
                  setInspectedId('gazel');
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === fid
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : isDark
                    ? 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 24-Vehicle Scrollable Showroom Roster */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3 max-h-36 overflow-y-auto pr-1">
          {filteredIds.map((vid) => {
            const owned = inventory.ownedVehicles.includes(vid);
            const active = inspectedId === vid;
            const cfg = VEHICLE_CONFIGS[vid];
            return (
              <button
                key={vid}
                type="button"
                onClick={() => setInspectedId(vid)}
                className={`px-2.5 py-2 rounded-lg border text-left transition-colors ${
                  active
                    ? 'border-sky-500 bg-sky-500/15'
                    : isDark
                      ? 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-xs font-semibold truncate">{t.vehicles[vid].name}</span>
                  {owned ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                </div>
                <div className={`text-[11px] font-mono-num tabular-nums mt-0.5 truncate ${subText}`}>
                  {owned
                    ? t.vehicles.stats.owned
                    : cfg.price === 0
                      ? t.vehicles.stats.free
                      : `${cfg.price.toLocaleString()} N-Coin`}
                </div>
              </button>
            );
          })}
        </div>

        {/* 3D Interactive Showroom + Full Tuning Studio */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4 items-stretch">
          {/* Left 7 Cols: 3D Viewport + Camera Focus Tabs + Performance */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-bold font-display">{vehicleInfo.name}</h3>
                  <p className={`text-xs mt-0.5 ${subText}`}>{vehicleInfo.desc}</p>
                  {t.vehicles.stats.jobRoles[inspectedId] && (
                    <p className="text-xs mt-1 text-amber-400 font-medium">
                      {t.vehicles.stats.jobRoles[inspectedId]}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {cameraButtons.map(([viewKey, label]) => (
                    <button
                      key={viewKey}
                      type="button"
                      onClick={() => switchCameraView(viewKey)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        camView === viewKey
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : chipIdle
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                ref={previewMountRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="w-full h-60 md:h-72 rounded-lg overflow-hidden border border-slate-700/60 bg-slate-900 cursor-grab active:cursor-grabbing select-none"
              />
            </div>

            {/* Compact 2x2 Performance Telemetry */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
              {[
                {
                  label: t.vehicles.stats.topSpeed,
                  val: `${Math.round(currentCfg.maxSpeed * 3.6)} km/h`,
                  pct: speedPct,
                },
                {
                  label: t.vehicles.stats.acceleration,
                  val: `${currentCfg.acceleration.toFixed(1)} m/s²`,
                  pct: accelPct,
                },
                {
                  label: t.vehicles.stats.handling,
                  val: `${handlePct}%`,
                  pct: handlePct,
                },
                {
                  label: t.vehicles.stats.braking,
                  val: `${brakePct}%`,
                  pct: brakePct,
                },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`truncate ${subText}`}>{row.label}</span>
                    <span className="font-mono-num tabular-nums font-semibold shrink-0">{row.val}</span>
                  </div>
                  <svg
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                    className="w-full h-1.5 rounded-full overflow-hidden block"
                  >
                    <rect
                      width="100"
                      height="6"
                      className={isDark ? 'fill-slate-800' : 'fill-slate-200'}
                    />
                    <rect width={row.pct} height="6" className="fill-sky-500" />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Right 5 Cols: Full Garage Customization Controls */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-3.5">
            <div className="space-y-3">
              {/* 1. Body Paint */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.vehicles.stats.paint}</span>
                  <input
                    type="color"
                    value={currentPaint.startsWith('#') && currentPaint.length === 7 ? currentPaint : '#2563EB'}
                    onChange={(e) => setVehiclePaint(inspectedId, e.target.value)}
                    aria-label={t.vehicles.stats.paint}
                    className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {currentCfg.availableColors.map((hex) => (
                    <ColorSwatchButton
                      key={hex}
                      hex={hex}
                      active={currentPaint.toLowerCase() === hex.toLowerCase()}
                      onClick={() => setVehiclePaint(inspectedId, hex)}
                    />
                  ))}
                </div>
              </div>

              {/* 2. Tire Rubber & Sidewall Color (Balon rangi) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.vehicles.stats.tireColor}</span>
                  <input
                    type="color"
                    value={
                      currentTuning.tireColor.startsWith('#') && currentTuning.tireColor.length === 7
                        ? currentTuning.tireColor
                        : '#171717'
                    }
                    onChange={(e) => {
                      setCamView('wheels');
                      setVehicleTuning(inspectedId, { tireColor: e.target.value });
                    }}
                    aria-label={t.vehicles.stats.tireColor}
                    className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {TIRE_COLOR_PALETTE.map((hex) => (
                    <ColorSwatchButton
                      key={hex}
                      hex={hex}
                      active={currentTuning.tireColor.toLowerCase() === hex.toLowerCase()}
                      onClick={() => {
                        setCamView('wheels');
                        setVehicleTuning(inspectedId, { tireColor: hex });
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* 3. Cabin Interior Leather/Console Color (Moshinani ichkarisi) */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.vehicles.stats.interiorColor}</span>
                  <input
                    type="color"
                    value={
                      currentTuning.interiorColor.startsWith('#') &&
                      currentTuning.interiorColor.length === 7
                        ? currentTuning.interiorColor
                        : '#1E293B'
                    }
                    onChange={(e) => {
                      setCamView('interior');
                      setVehicleTuning(inspectedId, { interiorColor: e.target.value });
                    }}
                    aria-label={t.vehicles.stats.interiorColor}
                    className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {INTERIOR_COLOR_PALETTE.map((hex) => (
                    <ColorSwatchButton
                      key={hex}
                      hex={hex}
                      active={currentTuning.interiorColor.toLowerCase() === hex.toLowerCase()}
                      onClick={() => {
                        setCamView('interior');
                        setVehicleTuning(inspectedId, { interiorColor: hex });
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* 4. 3D Wheel Rim Style & Alloy Color (Moshina disklari) */}
              <div className="space-y-2 pt-2 border-t border-slate-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{t.vehicles.stats.rimStyle}</span>
                  <input
                    type="color"
                    value={
                      currentTuning.rimColor.startsWith('#') && currentTuning.rimColor.length === 7
                        ? currentTuning.rimColor
                        : '#E2E8F0'
                    }
                    onChange={(e) => {
                      setCamView('wheels');
                      setVehicleTuning(inspectedId, { rimColor: e.target.value });
                    }}
                    aria-label={t.vehicles.stats.rimColor}
                    className="w-6 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_RIM_STYLES.map((rs: RimStyleId) => (
                    <button
                      key={rs}
                      type="button"
                      onClick={() => {
                        setCamView('wheels');
                        setVehicleTuning(inspectedId, { rimStyle: rs });
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap truncate ${
                        currentTuning.rimStyle === rs
                          ? 'bg-sky-500 text-slate-950 font-semibold'
                          : chipIdle
                      }`}
                    >
                      {t.vehicles.stats.rimStyles[rs]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {RIM_COLOR_PALETTE.map((hex) => (
                    <ColorSwatchButton
                      key={hex}
                      hex={hex}
                      active={currentTuning.rimColor.toLowerCase() === hex.toLowerCase()}
                      onClick={() => {
                        setCamView('wheels');
                        setVehicleTuning(inspectedId, { rimColor: hex });
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* 5. Heavy Truck & Pickup Cargo Load Selector (Taxta / Temir / Beton / Shag'al / Bo'sh) */}
              {currentCfg.canCarryCargo && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800/40">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold">{t.vehicles.stats.cargoType}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ALL_CARGO_LOADS.map((cargo: CargoLoadId) => (
                      <button
                        key={cargo}
                        type="button"
                        onClick={() => {
                          setCamView('cargo');
                          setVehicleTuning(inspectedId, { cargoType: cargo });
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          currentTuning.cargoType === cargo
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : chipIdle
                        }`}
                      >
                        {t.vehicles.stats.cargoTypes[cargo]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Purchase / Drive Action Bar */}
            <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between gap-3">
              <div>
                <div className={`text-xs ${subText}`}>{t.vehicles.stats.price}</div>
                <div className="text-base font-bold font-mono-num tabular-nums">
                  {isOwned
                    ? t.vehicles.stats.owned
                    : currentCfg.price === 0
                      ? t.vehicles.stats.free
                      : `${currentCfg.price.toLocaleString()} N-Coin`}
                </div>
              </div>

              {isOwned ? (
                <button
                  type="button"
                  onClick={handleDrive}
                  disabled={gameStarted && inVehicle && !isTuningCurrentDrivenCar}
                  className={`px-4 py-2.5 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    gameStarted && inVehicle && !isTuningCurrentDrivenCar
                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                      : isTuningCurrentDrivenCar
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                  }`}
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  {isTuningCurrentDrivenCar
                    ? t.vehicles.stats.continueDriving
                    : gameStarted && inVehicle
                      ? t.vehicles.stats.exitCurrentCarFirst
                      : t.vehicles.stats.use}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={coins < currentCfg.price}
                  className={`px-4 py-2.5 rounded-lg font-semibold text-xs sm:text-sm flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                    coins >= currentCfg.price
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4 shrink-0" />
                  {coins >= currentCfg.price
                    ? !(gameStarted && inVehicle)
                      ? `${t.vehicles.stats.buyAndDrive} (${currentCfg.price.toLocaleString()})`
                      : `${t.vehicles.stats.buy} (${currentCfg.price.toLocaleString()})`
                    : t.vehicles.stats.insufficientCoins}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
