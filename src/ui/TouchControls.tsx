import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Car,
  Flame,
  Hand,
  TrainFront,
  Zap,
} from 'lucide-react';
import { engineCommandRef, touchInputRef, useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations } from '../i18n';

export const TouchControls: React.FC = () => {
  const gameStarted = useGameStore((s) => s.gameStarted);
  const activeModal = useGameStore((s) => s.activeModal);
  const inVehicleId = useGameStore((s) => s.player.inVehicleInstanceId);
  const metroRideActive = useGameStore((s) => s.metroRide.active);
  const equippedWeapon = useGameStore((s) => s.equippedWeapon);
  const nearestInteractable = useGameStore((s) => s.nearestInteractable);
  const cycleCameraMode = useGameStore((s) => s.cycleCameraMode);

  const showTouchControls = useSettingsStore((s) => s.showTouchControls);
  const language = useSettingsStore((s) => s.language);
  const t = getTranslations(language);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const joyPointerId = useRef<number | null>(null);
  const joyCenter = useRef({ x: 0, y: 0 });
  const joyBaseRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia?.('(pointer: coarse)').matches;
      const touchPoints = navigator.maxTouchPoints > 0;
      setIsTouchDevice(Boolean(coarse || touchPoints || window.innerWidth < 900));
    };
    check();
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('resize', check);
      touchInputRef.moveX = 0;
      touchInputRef.moveY = 0;
      touchInputRef.sprint = false;
      touchInputRef.jump = false;
      touchInputRef.fire = false;
      touchInputRef.gas = false;
      touchInputRef.brake = false;
      touchInputRef.reverse = false;
      touchInputRef.steerLeft = false;
      touchInputRef.steerRight = false;
      touchInputRef.handbrake = false;
    };
  }, []);

  const visible =
    gameStarted &&
    activeModal === 'none' &&
    (showTouchControls === 'always' || (showTouchControls === 'auto' && isTouchDevice));

  if (!visible) return null;

  const maxRadius = 44;

  const onJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyPointerId.current = e.pointerId;
    joyCenter.current = {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.5,
    };
    updateJoyPosition(e.clientX, e.clientY);
  };

  const updateJoyPosition = (clientX: number, clientY: number) => {
    let dx = clientX - joyCenter.current.x;
    let dy = clientY - joyCenter.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    touchInputRef.moveX = dx / maxRadius;
    touchInputRef.moveY = -dy / maxRadius;
  };

  const onJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerId.current) return;
    e.stopPropagation();
    updateJoyPosition(e.clientX, e.clientY);
  };

  const onJoyEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPointerId.current) return;
    e.stopPropagation();
    joyPointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    touchInputRef.moveX = 0;
    touchInputRef.moveY = 0;
  };

  const makeHoldHandlers = (field: keyof typeof touchInputRef) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      (touchInputRef[field] as boolean) = true;
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      (touchInputRef[field] as boolean) = false;
    },
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      (touchInputRef[field] as boolean) = false;
    },
    onLostPointerCapture: () => {
      (touchInputRef[field] as boolean) = false;
    },
  });

  const btnBase =
    'touch-game-zone flex flex-col items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/85 text-slate-100 active:bg-sky-500 active:text-slate-950 transition-colors select-none shadow-lg';

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 pointer-events-none p-4 pb-5 flex items-end justify-between">
      {/* LEFT ZONE: Virtual Joystick (on foot) OR Steering Buttons (in car) */}
      {!inVehicleId ? (
        <div
          ref={joyBaseRef}
          onPointerDown={onJoyDown}
          onPointerMove={onJoyMove}
          onPointerUp={onJoyEnd}
          onPointerCancel={onJoyEnd}
          onLostPointerCapture={() => {
            joyPointerId.current = null;
            setKnobOffset({ x: 0, y: 0 });
            touchInputRef.moveX = 0;
            touchInputRef.moveY = 0;
          }}
          className="pointer-events-auto touch-game-zone relative w-32 h-32 rounded-full border-2 border-slate-600/80 bg-slate-950/75 flex items-center justify-center shadow-xl"
        >
          <div
            style={{ transform: `translate3d(${knobOffset.x}px, ${knobOffset.y}px, 0)` }}
            className="w-12 h-12 rounded-full bg-sky-400/90 border border-white/40 shadow-md"
          />
        </div>
      ) : (
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            {...makeHoldHandlers('steerLeft')}
            className={`${btnBase} w-16 h-16`}
            aria-label="Steer Left"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <button
            type="button"
            {...makeHoldHandlers('steerRight')}
            className={`${btnBase} w-16 h-16`}
            aria-label="Steer Right"
          >
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* RIGHT ZONE: Action Pedals & Weapon/Foot Buttons */}
      {!inVehicleId ? (
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {/* Dedicated Fire / Swing Button when armed */}
          {equippedWeapon !== 'unarmed' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                {...makeHoldHandlers('fire')}
                className={`${btnBase} w-20 h-14 text-xs font-bold border-amber-500/80 bg-amber-500/20 text-amber-300`}
              >
                <Flame className="w-5 h-5 mb-0.5" />
                <span>{equippedWeapon === 'golf_club' ? t.mobile.swing : t.mobile.fire}</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 items-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cycleCameraMode();
              }}
              className={`${btnBase} w-13 h-12 text-[11px]`}
            >
              <Camera className="w-4 h-4 mb-0.5" />
              <span>{t.mobile.cam}</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                engineCommandRef.toggleEnterExitVehicle = true;
              }}
              className={`${btnBase} w-13 h-12 text-[11px] ${
                metroRideActive || nearestInteractable?.type === 'metro_station'
                  ? 'border-emerald-400 text-emerald-300'
                  : nearestInteractable?.type === 'vehicle'
                    ? 'border-sky-400 text-sky-300'
                    : ''
              }`}
            >
              {metroRideActive || nearestInteractable?.type === 'metro_station' ? (
                <TrainFront className="w-4 h-4 mb-0.5" />
              ) : (
                <Car className="w-4 h-4 mb-0.5" />
              )}
              <span>
                {metroRideActive || nearestInteractable?.type === 'metro_station'
                  ? t.menu.metro
                  : t.mobile.car}
              </span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                engineCommandRef.triggerInteract = true;
              }}
              className={`${btnBase} w-13 h-12 text-[11px] ${
                nearestInteractable ? 'border-amber-400 text-amber-300' : ''
              }`}
            >
              <Hand className="w-4 h-4 mb-0.5" />
              <span>{t.mobile.interact}</span>
            </button>

            <button
              type="button"
              {...makeHoldHandlers('sprint')}
              className={`${btnBase} col-span-2 h-13 text-xs font-semibold`}
            >
              <Zap className="w-4 h-4 mb-0.5" />
              <span>{t.mobile.sprint}</span>
            </button>

            <button
              type="button"
              {...makeHoldHandlers('jump')}
              className={`${btnBase} h-13 text-xs font-semibold`}
            >
              <ArrowUp className="w-4 h-4 mb-0.5" />
              <span>{t.mobile.jump}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="pointer-events-auto flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cycleCameraMode();
              }}
              className={`${btnBase} w-13 h-12 text-[11px]`}
            >
              <Camera className="w-4 h-4" />
              <span>{t.mobile.cam}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                engineCommandRef.toggleEnterExitVehicle = true;
              }}
              className={`${btnBase} w-14 h-12 text-[11px] border-amber-500/60 text-amber-300`}
            >
              <Car className="w-4 h-4" />
              <span>{t.mobile.car}</span>
            </button>
          </div>

          <div className="flex items-end gap-2.5">
            <button
              type="button"
              {...makeHoldHandlers('handbrake')}
              className={`${btnBase} w-14 h-14 text-[11px] font-semibold`}
            >
              <span>{t.mobile.handbrake}</span>
            </button>
            <button
              type="button"
              {...makeHoldHandlers('reverse')}
              className={`${btnBase} w-15 h-16 text-xs font-semibold border-red-500/50`}
            >
              <ArrowDown className="w-5 h-5 mb-0.5" />
              <span>{t.mobile.brake}</span>
            </button>
            <button
              type="button"
              {...makeHoldHandlers('gas')}
              className={`${btnBase} w-16 h-20 text-xs font-bold border-emerald-500/60 text-emerald-300`}
            >
              <ArrowUp className="w-6 h-6 mb-0.5" />
              <span>{t.mobile.gas}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
