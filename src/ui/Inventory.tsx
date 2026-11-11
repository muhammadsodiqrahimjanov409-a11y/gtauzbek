import React from 'react';
import { Award, Building2, Car, CreditCard, Home, Key, PlusCircle, TrainFront, X } from 'lucide-react';
import { ALL_PURCHASABLE_PLACES, ALL_VEHICLE_IDS, ECONOMY_CONFIG } from '../game/gameConfig';
import { computeEnterpriseIncomePerTick, formatNCoins } from '../economy/EconomyManager';
import { MISSION_DEFINITIONS } from '../missions/missionDefinitions';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

export const Inventory: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const coins = useGameStore((s) => s.economy.coins);
  const inventory = useGameStore((s) => s.inventory);
  const missions = useGameStore((s) => s.missions);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const openEnterprisesModal = useGameStore((s) => s.openEnterprisesModal);
  const openMetroModal = useGameStore((s) => s.openMetroModal);
  const topUpVipCoins = useGameStore((s) => s.topUpVipCoins);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const completedCount = Object.values(missions).filter((m) => m.status === 'completed').length;
  const ownedEnterpriseCount = ALL_PURCHASABLE_PLACES.filter((e) =>
    inventory.ownedProperties.includes(e.id),
  ).length;
  const passiveIncome = computeEnterpriseIncomePerTick(inventory.ownedProperties);
  const totalDist = player.distanceWalked + player.distanceDriven;

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div className={`w-full max-w-3xl rounded-xl border p-5 md:p-6 shadow-2xl modal-scroll-zone max-h-[90vh] overflow-y-auto ${surfaceCls}`}>
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800/50">
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide">{t.menu.inventory}</h2>
            <p className={`text-xs mt-0.5 font-mono-num ${subText}`}>
              {t.hud.level} {player.level} · {player.xp} / {ECONOMY_CONFIG.xpPerLevel} {t.hud.xp}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
          {/* Career Stats + VIP Instant Top-Up */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-display tracking-wide">{t.profile.statsTitle}</h3>
            <div className="divide-y divide-slate-800/40 text-sm">
              {[
                { label: t.hud.coins, value: `${formatNCoins(coins)} N-Coin` },
                { label: t.enterprises.ownedCount, value: `${ownedEnterpriseCount} / ${ALL_PURCHASABLE_PLACES.length}` },
                { label: t.enterprises.totalPassiveIncome, value: `+${formatNCoins(passiveIncome)} ${t.enterprises.incomeUnit}` },
                { label: t.profile.completedMissions, value: `${completedCount} / ${MISSION_DEFINITIONS.length}` },
                { label: t.profile.unlockedCars, value: `${inventory.ownedVehicles.length} / ${ALL_VEHICLE_IDS.length}` },
                { label: t.profile.distanceWalked, value: formatDistance(player.distanceWalked) },
                { label: t.profile.distanceDriven, value: formatDistance(player.distanceDriven) },
                { label: t.profile.totalDistance, value: formatDistance(totalDist) },
                { label: t.profile.playTime, value: formatDuration(player.playTimeSeconds) },
              ].map((row) => (
                <div key={row.label} className="py-2 flex items-center justify-between gap-3">
                  <span className={`shrink-0 ${subText}`}>{row.label}</span>
                  <span className="font-mono-num font-semibold text-right break-all">{row.value}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => openMetroModal()}
                className="w-full py-2.5 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <TrainFront className="w-4 h-4 shrink-0" />
                <span>{t.menu.metro}</span>
              </button>

              <button
                type="button"
                onClick={() => openEnterprisesModal()}
                className="w-full py-2.5 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Building2 className="w-4 h-4 shrink-0" />
                <span>{t.menu.enterprises}</span>
              </button>

              <button
                type="button"
                onClick={() => topUpVipCoins(t.hud.vipTopUpSuccess)}
                className="w-full py-2.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <PlusCircle className="w-4 h-4 shrink-0" />
                <span>{t.hud.vipTopUp}</span>
              </button>
            </div>
          </div>

          {/* Owned Vehicles & Inventory Items */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold font-display tracking-wide">{t.profile.inventoryTitle}</h3>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {inventory.ownedVehicles.map((vid) => (
                <div
                  key={vid}
                  className={`p-2.5 rounded-lg border flex items-center justify-between gap-3 ${
                    isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Car className="w-4 h-4 text-sky-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{t.vehicles[vid].name}</div>
                      <div className={`text-[11px] ${subText}`}>
                        {inventory.selectedVehicle === vid ? t.vehicles.stats.selected : t.vehicles.stats.owned}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal('garage')}
                    className="px-2.5 py-1 rounded text-xs font-medium text-sky-400 hover:bg-sky-500/10 whitespace-nowrap shrink-0"
                  >
                    {t.menu.garage}
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/40">
              {inventory.items.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                    isDark ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {item.category === 'cosmetic' ? (
                    <CreditCard className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  ) : item.category === 'property' ? (
                    <Home className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  ) : item.category === 'key' ? (
                    <Key className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                  ) : (
                    <Award className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="text-xs font-semibold">{resolveNestedKey(t, item.titleKey)}</div>
                    <div className={`text-[11px] mt-0.5 ${subText}`}>{resolveNestedKey(t, item.descKey)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
