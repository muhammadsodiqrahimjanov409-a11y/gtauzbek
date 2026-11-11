import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Car,
  Globe,
  Info,
  Play,
  RotateCw,
  Save,
  Settings as SettingsIcon,
  TrainFront,
  User,
  Users,
} from 'lucide-react';
import type { Language } from '../types/game';
import { coopClient, computePairedCodesClient } from '../multiplayer/CoopClient';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations } from '../i18n';

export const MainMenu: React.FC = () => {
  const gameStarted = useGameStore((s) => s.gameStarted);
  const saveAvailable = useGameStore((s) => s.saveAvailable);
  const activeModal = useGameStore((s) => s.activeModal);
  const entryPromptAnswered = useGameStore((s) => s.entryPromptAnswered);
  const setEntryPromptAnswered = useGameStore((s) => s.setEntryPromptAnswered);
  const coop = useGameStore((s) => s.coop);
  const playOrContinue = useGameStore((s) => s.playOrContinue);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const openEnterprisesModal = useGameStore((s) => s.openEnterprisesModal);
  const openMetroModal = useGameStore((s) => s.openMetroModal);
  const saveCurrentProgress = useGameStore((s) => s.saveCurrentProgress);
  const returnToMainMenu = useGameStore((s) => s.returnToMainMenu);

  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const [entryStep, setEntryStep] = useState<'ask' | 'setup'>('ask');
  const [coopModeTab, setCoopModeTab] = useState<'create' | 'join'>('create');
  const [playerName, setPlayerName] = useState<string>(coop.playerName || t.coop.playerNamePlaceholder);
  const [createCode, setCreateCode] = useState<string>('01072015');
  const [joinCode, setJoinCode] = useState<string>('01072016');

  const cycleLanguage = () => {
    const order: Language[] = ['uz', 'en', 'ru'];
    const idx = order.indexOf(language);
    setLanguage(order[(idx + 1) % order.length]);
  };

  const langDisplay: Record<Language, string> = {
    uz: 'O‘zbek',
    en: 'English',
    ru: 'Русский',
  };

  // Credits Modal Overlay
  if (activeModal === 'credits') {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
        <div
          className={`w-full max-w-lg rounded-xl border p-6 shadow-2xl space-y-4 ${
            isDark ? 'bg-slate-950/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
          }`}
        >
          <h2 className="text-xl font-bold font-display">{t.credits.heading}</h2>
          <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
            {t.credits.body}
          </p>
          <p className={`text-xs leading-relaxed pt-2 border-t border-slate-800/40 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            {t.credits.controlsSummary}
          </p>
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors"
            >
              {t.menu.back}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pause Menu Overlay when Esc is pressed mid-game
  if (gameStarted && activeModal === 'pause') {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
        <div
          className={`w-full max-w-sm rounded-xl border p-6 shadow-2xl space-y-4 ${
            isDark ? 'bg-slate-950/95 border-slate-800 text-slate-100' : 'bg-white/95 border-slate-200 text-slate-900'
          }`}
        >
          <div>
            <h2 className="text-2xl font-bold font-display tracking-wide">{t.brand}</h2>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{t.subtitle}</p>
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className="w-full py-2.5 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Play className="w-4 h-4" />
              {t.menu.resume}
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('coop')}
              className={`w-full py-2.5 px-4 rounded-lg border text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                isDark
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-emerald-500/60 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-400" />
              {t.coop.dockBtn}
            </button>

            <button
              type="button"
              onClick={() => {
                saveCurrentProgress(t.hud.savedSuccess, t.hud.saveError);
                setActiveModal('none');
              }}
              className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Save className="w-4 h-4 text-emerald-400" />
              {t.menu.save}
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('garage')}
              className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Car className="w-4 h-4 text-sky-400" />
              {t.menu.garage}
            </button>

            <button
              type="button"
              onClick={() => openMetroModal()}
              className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
              }`}
            >
              <TrainFront className="w-4 h-4 text-sky-400" />
              {t.menu.metro}
            </button>

            <button
              type="button"
              onClick={() => openEnterprisesModal()}
              className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4 text-emerald-400" />
              {t.menu.enterprises}
            </button>

            <button
              type="button"
              onClick={() => setActiveModal('settings')}
              className={`w-full py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                isDark ? 'border-slate-800 hover:bg-slate-900' : 'border-slate-200 hover:bg-slate-100'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              {t.menu.settings}
            </button>

            <button
              type="button"
              onClick={() => {
                setEntryPromptAnswered(false);
                setEntryStep('ask');
                returnToMainMenu();
              }}
              className="w-full py-2 px-4 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-colors whitespace-nowrap"
            >
              {t.menu.mainMenu}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Start Screen over Live 3D Skyline
  if (gameStarted || activeModal !== 'none') return null;

  const createPaired = computePairedCodesClient('create', createCode);
  const joinPaired = computePairedCodesClient('join', joinCode);

  const handleLaunchCoopGame = (mode: 'create' | 'join') => {
    const code = mode === 'create' ? createCode : joinCode;
    coopClient.connectAndJoin(mode, code, playerName);
    setEntryPromptAnswered(true);
    playOrContinue(t.hud.corruptedSave, t.menu.noSaveFound);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-start p-6 md:p-14 bg-gradient-to-r from-slate-950/92 via-slate-950/65 to-transparent pointer-events-auto">
      <div className="w-full max-w-md space-y-6">
        {/* Hero Brand Lockup */}
        <div className="space-y-2">
          <h1 className="text-4xl md:text-6xl font-bold font-display tracking-wider text-white text-balance">
            {t.brand}
          </h1>
          <p className="text-sm md:text-base text-slate-300 font-medium">{t.subtitle}</p>
        </div>

        {/* ENTRY CO-OP PROMPT ("Do'stingiz bilan o'ynaysizmi?") */}
        {!entryPromptAnswered ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/92 p-5 shadow-2xl space-y-4">
            {entryStep === 'ask' ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-xl md:text-2xl font-bold font-display text-white">
                      {t.coop.entryQuestion}
                    </h2>
                    <button
                      type="button"
                      onClick={cycleLanguage}
                      className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-900 hover:border-slate-700 text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <Globe className="w-3.5 h-3.5 text-amber-400" />
                      <span>{langDisplay[language]}</span>
                    </button>
                  </div>
                  <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                    {t.coop.entrySubtitle}
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setEntryStep('setup')}
                    className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-between transition-colors shadow-lg whitespace-nowrap"
                  >
                    <span className="flex items-center gap-2.5">
                      <Users className="w-4 h-4 shrink-0" />
                      <span>{t.coop.yesWithFriend}</span>
                    </span>
                    <Play className="w-4 h-4 fill-current shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      coopClient.disconnectToSolo();
                      setEntryPromptAnswered(true);
                      playOrContinue(t.hud.corruptedSave, t.menu.noSaveFound);
                    }}
                    className="w-full py-3 px-4 rounded-xl border border-slate-700 bg-slate-900/90 hover:bg-slate-800 text-slate-100 font-semibold text-sm flex items-center justify-between transition-colors whitespace-nowrap"
                  >
                    <span className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-sky-400 shrink-0" />
                      <span>{t.coop.noSolo}</span>
                    </span>
                    <Play className="w-4 h-4 text-sky-400 shrink-0" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryStep('ask')}
                    className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>{t.coop.backToChoice}</span>
                  </button>
                  <button
                    type="button"
                    onClick={cycleLanguage}
                    className="px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-900 hover:border-slate-700 text-xs text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Globe className="w-3.5 h-3.5 text-amber-400" />
                    <span>{langDisplay[language]}</span>
                  </button>
                </div>

                {/* Clear Step-by-Step Instructions ("keyin aytsin: 01072015 xona ochish, 01072016 do'sti kirish") */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 space-y-1.5">
                  <div className="text-xs font-bold text-sky-400">{t.coop.howItWorksTitle}</div>
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {t.coop.howItWorksCreate}
                  </p>
                  <p className="text-xs text-emerald-400 leading-relaxed font-semibold">
                    {t.coop.howItWorksJoin}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-400">
                    {t.coop.playerNameLabel}
                  </label>
                  <input
                    type="text"
                    maxLength={24}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder={t.coop.playerNamePlaceholder}
                    className="w-full px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-sm font-medium outline-none focus:border-sky-400"
                  />
                </div>

                {/* Create (01072015) vs Join (01072016) Tabs */}
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl border border-slate-800 bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setCoopModeTab('create')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      coopModeTab === 'create'
                        ? 'bg-sky-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.coop.createTab}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoopModeTab('join')}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      coopModeTab === 'join'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t.coop.joinTab}
                  </button>
                </div>

                {coopModeTab === 'create' ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-400">
                        {t.coop.createCodeLabel}
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        value={createCode}
                        onChange={(e) => setCreateCode(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-white text-base font-mono-num tabular-nums font-bold tracking-wider outline-none focus:border-sky-400"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="text-slate-400">{t.coop.friendJoinHintPrefix}</span>
                      <span className="font-mono-num tabular-nums font-bold text-sm text-emerald-400">
                        {createPaired.joinCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLaunchCoopGame('create')}
                      className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm flex items-center justify-between transition-colors shadow-lg whitespace-nowrap"
                    >
                      <span>{t.coop.createAndPlayBtn}</span>
                      <Play className="w-4 h-4 fill-current shrink-0" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-400">
                        {t.coop.joinCodeLabel}
                      </label>
                      <input
                        type="text"
                        maxLength={16}
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-700 bg-slate-900 text-white text-base font-mono-num tabular-nums font-bold tracking-wider outline-none focus:border-emerald-400"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="text-slate-400">{t.coop.pairedHostHintPrefix}</span>
                      <span className="font-mono-num tabular-nums font-bold text-sm text-sky-400">
                        {joinPaired.hostCode}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLaunchCoopGame('join')}
                      className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-between transition-colors shadow-lg whitespace-nowrap"
                    >
                      <span>{t.coop.joinAndPlayBtn}</span>
                      <Play className="w-4 h-4 fill-current shrink-0" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Standard Start Menu Stack */
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => playOrContinue(t.hud.corruptedSave, t.menu.noSaveFound)}
              className="w-full py-3.5 px-5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm tracking-wide flex items-center justify-between transition-colors shadow-lg"
            >
              <span className="whitespace-nowrap">{saveAvailable ? t.menu.continue : t.menu.play}</span>
              <Play className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={() => {
                setEntryPromptAnswered(false);
                setEntryStep('setup');
              }}
              className="w-full py-3 px-5 rounded-xl border border-emerald-500/60 bg-slate-950/90 hover:bg-emerald-500/15 text-emerald-300 font-bold text-sm flex items-center justify-between transition-colors"
            >
              <span className="whitespace-nowrap">{t.coop.yesWithFriend}</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </button>

            {saveAvailable && (
              <button
                type="button"
                onClick={startNewGame}
                className="w-full py-3 px-5 rounded-xl border bg-slate-900/85 border-slate-800 text-slate-200 hover:bg-slate-800 font-semibold text-sm flex items-center justify-between transition-colors"
              >
                <span className="whitespace-nowrap">{t.menu.newGame}</span>
                <RotateCw className="w-4 h-4 text-sky-400" />
              </button>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setActiveModal('garage')}
                className="py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950/85 hover:border-slate-700 text-slate-100 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Car className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t.menu.garage}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('settings')}
                className="py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950/85 hover:border-slate-700 text-slate-100 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <SettingsIcon className="w-4 h-4 text-sky-400 shrink-0" />
                <span>{t.menu.settings}</span>
              </button>

              <button
                type="button"
                onClick={cycleLanguage}
                className="py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950/85 hover:border-slate-700 text-slate-100 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{langDisplay[language]}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('credits')}
                className="py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-950/85 hover:border-slate-700 text-slate-100 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Info className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{t.menu.credits}</span>
              </button>
            </div>
          </div>
        )}

        {/* Clean Controls Hint */}
        <p className="text-xs text-slate-400 leading-relaxed hidden sm:block">
          {t.credits.controlsSummary}
        </p>
      </div>
    </div>
  );
};
