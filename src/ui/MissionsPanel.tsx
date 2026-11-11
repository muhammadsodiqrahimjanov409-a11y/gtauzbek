import React from 'react';
import { CheckCircle2, Lock, MapPin, Play, RotateCcw, X, XCircle } from 'lucide-react';
import { MISSION_DEFINITIONS } from '../missions/missionDefinitions';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';

export const MissionsPanel: React.FC = () => {
  const missions = useGameStore((s) => s.missions);
  const activeMissionId = useGameStore((s) => s.activeMissionId);
  const startMission = useGameStore((s) => s.startMission);
  const abortActiveMission = useGameStore((s) => s.abortActiveMission);
  const setCustomWaypoint = useGameStore((s) => s.setCustomWaypoint);
  const setActiveModal = useGameStore((s) => s.setActiveModal);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div className={`w-full max-w-3xl rounded-xl border p-5 md:p-6 shadow-2xl modal-scroll-zone max-h-[90vh] overflow-y-auto ${surfaceCls}`}>
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800/50">
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide">{t.menu.missions}</h2>
            <p className={`text-xs mt-0.5 ${subText}`}>
              {Object.values(missions).filter((m) => m.status === 'completed').length} / {MISSION_DEFINITIONS.length}{' '}
              {t.missions.status.completed.toLowerCase()}
            </p>
          </div>
          <button
            onClick={() => setActiveModal('none')}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}
            aria-label={t.menu.back}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="divide-y divide-slate-800/40 mt-2">
          {MISSION_DEFINITIONS.map((def) => {
            const prog = missions[def.id];
            const status = prog?.status ?? 'locked';
            const isActive = activeMissionId === def.id;

            return (
              <div key={def.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {status === 'locked' && <Lock className="w-4 h-4 text-slate-500 shrink-0" />}
                    {status === 'failed' && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                    <h3 className="text-sm md:text-base font-bold font-display">
                      {resolveNestedKey(t, def.titleKey)}
                    </h3>
                  </div>

                  <p className={`text-xs md:text-sm ${subText}`}>{resolveNestedKey(t, def.descKey)}</p>

                  {/* Clean Zero-Pill Metadata */}
                  <div className={`flex flex-wrap items-center gap-2 text-xs font-mono-num pt-0.5 ${subText}`}>
                    <span>{t.missions.status[status]}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-400">+{def.rewardCoins.toLocaleString()} N-Coin</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-sky-400">+{def.rewardXp} XP</span>
                    {def.timeLimitSeconds && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{def.timeLimitSeconds}s</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {status !== 'locked' && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomWaypoint({ ...def.startPosition });
                        setActiveModal('none');
                      }}
                      className={`p-2 rounded-lg border transition-colors ${
                        isDark ? 'border-slate-800 hover:bg-slate-900 text-sky-400' : 'border-slate-200 hover:bg-slate-100 text-sky-600'
                      }`}
                      title={t.hud.waypoint}
                    >
                      <MapPin className="w-4 h-4" />
                    </button>
                  )}

                  {isActive ? (
                    <button
                      type="button"
                      onClick={abortActiveMission}
                      className="px-3.5 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                    >
                      {t.missions.actions.abort}
                    </button>
                  ) : status === 'available' ? (
                    <button
                      type="button"
                      onClick={() => startMission(def.id, t.missions.messages.started)}
                      className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {t.missions.actions.start}
                    </button>
                  ) : status === 'failed' || status === 'completed' ? (
                    <button
                      type="button"
                      onClick={() => startMission(def.id, t.missions.messages.started)}
                      className={`px-3.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                        isDark
                          ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                          : 'border-slate-300 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t.missions.actions.retry}
                    </button>
                  ) : (
                    <span className={`text-xs px-3 py-2 ${subText}`}>{t.missions.status.locked}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
