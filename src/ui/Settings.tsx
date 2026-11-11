import React, { useState } from 'react';
import { LogOut, RotateCcw, Save, X } from 'lucide-react';
import type { GraphicsQuality, Language, TimeOfDayPreset, WeatherMode } from '../types/game';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations } from '../i18n';

export const Settings: React.FC = () => {
  const settings = useSettingsStore();
  const world = useGameStore((s) => s.world);
  const gameStarted = useGameStore((s) => s.gameStarted);
  const setTimePreset = useGameStore((s) => s.setTimePreset);
  const setExactTimeHours = useGameStore((s) => s.setExactTimeHours);
  const setWeather = useGameStore((s) => s.setWeather);
  const setTrafficCount = useGameStore((s) => s.setTrafficCount);
  const saveCurrentProgress = useGameStore((s) => s.saveCurrentProgress);
  const resetAllProgress = useGameStore((s) => s.resetAllProgress);
  const returnToMainMenu = useGameStore((s) => s.returnToMainMenu);
  const setActiveModal = useGameStore((s) => s.setActiveModal);

  const [confirmingReset, setConfirmingReset] = useState(false);

  const t = getTranslations(settings.language);
  const isDark = settings.theme === 'dark';

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-600';
  const segBg = isDark ? 'bg-slate-900 border border-slate-800' : 'bg-slate-100 border border-slate-200';
  const segActive = 'bg-sky-500 text-slate-950 font-semibold';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div className={`w-full max-w-3xl rounded-xl border p-5 md:p-6 shadow-2xl modal-scroll-zone max-h-[90vh] overflow-y-auto ${surfaceCls}`}>
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800/50">
          <h2 className="text-xl font-bold font-display tracking-wide">{t.menu.settings}</h2>
          <button
            onClick={() => setActiveModal('none')}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'}`}
            aria-label={t.menu.back}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 text-xs">
          {/* 1. Interface, Language & Theme */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-display">{t.settings.interface}</h3>

            {/* Language */}
            <div className="space-y-1.5">
              <div className={subText}>{t.menu.language}</div>
              <div className={`grid grid-cols-3 gap-1 p-1 rounded-lg ${segBg}`}>
                {(
                  [
                    ['uz', 'O‘zbek'],
                    ['en', 'English'],
                    ['ru', 'Русский'],
                  ] as Array<[Language, string]>
                ).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => settings.setLanguage(code)}
                    className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                      settings.language === code ? segActive : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Light / Dark Mode */}
            <div className="space-y-1.5">
              <div className={subText}>{t.settings.theme}</div>
              <div className={`grid grid-cols-2 gap-1 p-1 rounded-lg ${segBg}`}>
                <button
                  type="button"
                  onClick={() => settings.setTheme('dark')}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    settings.theme === 'dark' ? segActive : ''
                  }`}
                >
                  {t.settings.dark}
                </button>
                <button
                  type="button"
                  onClick={() => settings.setTheme('light')}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    settings.theme === 'light' ? segActive : ''
                  }`}
                >
                  {t.settings.light}
                </button>
              </div>
            </div>

            {/* Audio Sliders */}
            <h3 className="text-sm font-bold font-display pt-2">{t.settings.audio}</h3>
            {[
              { label: t.settings.masterVolume, val: settings.masterVolume, key: 'masterVolume' as const },
              { label: t.settings.musicVolume, val: settings.musicVolume, key: 'musicVolume' as const },
              { label: t.settings.sfxVolume, val: settings.sfxVolume, key: 'sfxVolume' as const },
            ].map((item) => (
              <div key={item.key} className="space-y-1">
                <div className="flex justify-between">
                  <span className={subText}>{item.label}</span>
                  <span className="font-mono-num">{Math.round(item.val * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={item.val}
                  onChange={(e) => settings.updateSettings({ [item.key]: parseFloat(e.target.value) })}
                  className="w-full accent-sky-500"
                />
              </div>
            ))}
          </div>

          {/* 2. Graphics, Atmosphere & Controls */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-display">{t.settings.graphics}</h3>

            {/* Quality */}
            <div className="space-y-1.5">
              <div className={subText}>{t.settings.quality}</div>
              <div className={`grid grid-cols-3 gap-1 p-1 rounded-lg ${segBg}`}>
                {(
                  [
                    ['low', t.settings.low],
                    ['medium', t.settings.medium],
                    ['high', t.settings.high],
                  ] as Array<[GraphicsQuality, string]>
                ).map(([q, label]) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => settings.setGraphicsQuality(q)}
                    className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                      settings.graphicsQuality === q ? segActive : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Shadows & FPS Toggles */}
            <div className="flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.shadowsEnabled}
                  onChange={(e) => settings.updateSettings({ shadowsEnabled: e.target.checked })}
                  className="accent-sky-500 w-4 h-4"
                />
                <span>{t.settings.shadows}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.fpsCounter}
                  onChange={(e) => settings.updateSettings({ fpsCounter: e.target.checked })}
                  className="accent-sky-500 w-4 h-4"
                />
                <span>{t.settings.fpsCounter}</span>
              </label>
            </div>

            {/* Time of Day */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={subText}>{t.settings.timeOfDay}</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={world.autoTimeCycle}
                    onChange={(e) => setExactTimeHours(world.timeHours, e.target.checked)}
                    className="accent-sky-500"
                  />
                  <span>{t.timePresets.auto}</span>
                </label>
              </div>
              <div className={`grid grid-cols-4 gap-1 p-1 rounded-lg ${segBg}`}>
                {(['dawn', 'day', 'sunset', 'night'] as TimeOfDayPreset[]).map((tp) => (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => setTimePreset(tp, false)}
                    className={`py-1.5 rounded-md transition-colors truncate ${
                      !world.autoTimeCycle && world.timePreset === tp ? segActive : ''
                    }`}
                  >
                    {t.timePresets[tp]}
                  </button>
                ))}
              </div>
            </div>

            {/* Weather */}
            <div className="space-y-1.5">
              <div className={subText}>{t.settings.weather}</div>
              <div className={`grid grid-cols-3 gap-1 p-1 rounded-lg ${segBg}`}>
                {(['sunny', 'cloudy', 'rainy'] as WeatherMode[]).map((wm) => (
                  <button
                    key={wm}
                    type="button"
                    onClick={() => setWeather(wm)}
                    className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                      world.weather === wm ? segActive : ''
                    }`}
                  >
                    {t.weatherModes[wm]}
                  </button>
                ))}
              </div>
            </div>

            {/* Traffic Density */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className={subText}>{t.settings.trafficDensity}</span>
                <span className="font-mono-num">{world.trafficCount}</span>
              </div>
              <input
                type="range"
                min={0}
                max={28}
                step={1}
                value={world.trafficCount}
                onChange={(e) => setTrafficCount(parseInt(e.target.value, 10))}
                className="w-full accent-sky-500"
              />
            </div>
          </div>
        </div>

        {/* Camera & Sensitivity Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 pt-4 border-t border-slate-800/40 text-xs">
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className={subText}>{t.settings.mouseSensitivity}</span>
              <span className="font-mono-num">{settings.mouseSensitivity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.3}
              max={2.5}
              step={0.1}
              value={settings.mouseSensitivity}
              onChange={(e) => settings.updateSettings({ mouseSensitivity: parseFloat(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between">
              <span className={subText}>{t.settings.cameraDistance}</span>
              <span className="font-mono-num">{settings.cameraDistance.toFixed(1)}m</span>
            </div>
            <input
              type="range"
              min={4.5}
              max={12}
              step={0.5}
              value={settings.cameraDistance}
              onChange={(e) => settings.updateSettings({ cameraDistance: parseFloat(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>

          <div className="space-y-1.5">
            <div className={subText}>{t.settings.touchMode}</div>
            <div className={`grid grid-cols-3 gap-1 p-1 rounded-lg ${segBg}`}>
              {(
                [
                  ['auto', t.settings.touchAuto],
                  ['always', t.settings.touchAlways],
                  ['off', t.settings.touchOff],
                ] as const
              ).map(([modeKey, label]) => (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => settings.updateSettings({ showTouchControls: modeKey })}
                  className={`py-1 rounded-md transition-colors whitespace-nowrap ${
                    settings.showTouchControls === modeKey ? segActive : ''
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Persistence Actions */}
        {gameStarted && (
          <div className="mt-6 pt-4 border-t border-slate-800/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => saveCurrentProgress(t.hud.savedSuccess, t.hud.saveError)}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Save className="w-4 h-4" />
                {t.menu.save}
              </button>

              <button
                type="button"
                onClick={returnToMainMenu}
                className={`px-4 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isDark ? 'border-slate-700 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-100'
                }`}
              >
                <LogOut className="w-4 h-4" />
                {t.menu.mainMenu}
              </button>
            </div>

            {!confirmingReset ? (
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                className="px-3.5 py-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {t.menu.resetProgress}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400">{t.menu.confirmReset}</span>
                <button
                  type="button"
                  onClick={() => {
                    resetAllProgress();
                    setConfirmingReset(false);
                  }}
                  className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold whitespace-nowrap"
                >
                  {t.menu.confirm}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingReset(false)}
                  className="px-3 py-1.5 rounded border border-slate-600 text-xs whitespace-nowrap"
                >
                  {t.menu.cancel}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
