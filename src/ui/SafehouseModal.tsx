import React from 'react';
import { Home, Moon, Save, Sun, X } from 'lucide-react';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations } from '../i18n';

export const SafehouseModal: React.FC = () => {
  const saveCurrentProgress = useGameStore((s) => s.saveCurrentProgress);
  const setExactTimeHours = useGameStore((s) => s.setExactTimeHours);
  const clearWantedOnEscape = useGameStore((s) => s.clearWantedOnEscape);
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
      <div className={`w-full max-w-lg rounded-xl border p-6 shadow-2xl space-y-5 ${surfaceCls}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/15 text-emerald-400">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold font-display">{t.safehouse.title}</h2>
              <p className={`text-xs mt-0.5 ${subText}`}>{t.safehouse.desc}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveModal('none')}
            className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          <button
            type="button"
            onClick={() => {
              saveCurrentProgress(t.hud.savedSuccess, t.hud.saveError);
            }}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            {t.safehouse.saveNow}
          </button>

          <button
            type="button"
            onClick={() => {
              setExactTimeHours(7.0, true);
              clearWantedOnEscape();
              saveCurrentProgress(t.hud.savedSuccess, t.hud.saveError);
              setActiveModal('none');
            }}
            className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-400" />
            {t.safehouse.restMorning}
          </button>

          <button
            type="button"
            onClick={() => {
              setExactTimeHours(21.5, true);
              clearWantedOnEscape();
              saveCurrentProgress(t.hud.savedSuccess, t.hud.saveError);
              setActiveModal('none');
            }}
            className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
              isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Moon className="w-4 h-4 text-sky-400" />
            {t.safehouse.restNight}
          </button>
        </div>

        <div className={`text-xs pt-3 border-t border-slate-800/40 flex items-center justify-between gap-3 ${subText}`}>
          <span>{t.safehouse.futureExpansion}</span>
          <button
            type="button"
            onClick={() => setActiveModal('none')}
            className="px-3 py-1.5 rounded-lg font-medium text-sky-400 hover:bg-sky-500/10 whitespace-nowrap shrink-0"
          >
            {t.safehouse.leave}
          </button>
        </div>
      </div>
    </div>
  );
};
