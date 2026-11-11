import React, { useState } from 'react';
import { Building2, Check, Navigation, PlusCircle, TrainFront, TrendingUp, X } from 'lucide-react';
import { ALL_PURCHASABLE_PLACES, detectDistrict, findNearestMetroStation } from '../game/gameConfig';
import { computeEnterpriseIncomePerTick, formatNCoins } from '../economy/EconomyManager';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';

type PlaceFilter = 'all' | 'owned' | 'enterprise' | 'metro' | 'cinema_arcade' | 'museum_shop_rest';

const FILTER_KEYS: PlaceFilter[] = [
  'all',
  'owned',
  'enterprise',
  'metro',
  'cinema_arcade',
  'museum_shop_rest',
];

export const EnterprisesModal: React.FC = () => {
  const [filter, setFilter] = useState<PlaceFilter>('all');

  const player = useGameStore((s) => s.player);
  const coins = useGameStore((s) => s.economy.coins);
  const ownedProperties = useGameStore((s) => s.inventory.ownedProperties);
  const selectedEnterpriseId = useGameStore((s) => s.selectedEnterpriseId);
  const buyEnterprise = useGameStore((s) => s.buyEnterprise);
  const requestMetroRide = useGameStore((s) => s.requestMetroRide);
  const openMetroModal = useGameStore((s) => s.openMetroModal);
  const topUpVipCoins = useGameStore((s) => s.topUpVipCoins);
  const setCustomWaypoint = useGameStore((s) => s.setCustomWaypoint);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const showToast = useGameStore((s) => s.showToast);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const ownedPlaceCount = ALL_PURCHASABLE_PLACES.filter((p) => ownedProperties.includes(p.id)).length;
  const totalPassiveIncome = computeEnterpriseIncomePerTick(ownedProperties);

  const orderedPlaces = [...ALL_PURCHASABLE_PLACES].sort((a, b) => {
    if (a.id === selectedEnterpriseId) return -1;
    if (b.id === selectedEnterpriseId) return 1;
    return a.purchasePrice - b.purchasePrice;
  });

  const visiblePlaces = orderedPlaces.filter((place) => {
    const isOwned = ownedProperties.includes(place.id);
    if (filter === 'owned') return isOwned;
    if (filter === 'enterprise') return place.kind === 'enterprise';
    if (filter === 'metro') return place.kind === 'metro';
    if (filter === 'cinema_arcade') return place.kind === 'cinema' || place.kind === 'arcade';
    if (filter === 'museum_shop_rest') {
      return place.kind === 'museum' || place.kind === 'shop' || place.kind === 'restaurant';
    }
    return true;
  });

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900';
  const cardSurfaceCls = isDark
    ? 'bg-slate-900/65 border-slate-800'
    : 'bg-slate-50 border-slate-200';
  const subText = isDark ? 'text-slate-400' : 'text-slate-600';

  const handleBuy = (placeId: string) => {
    const res = buyEnterprise(placeId);
    if (res.ok) {
      showToast(t.enterprises.buySuccess, 'success');
    } else if (res.reason === 'already_owned') {
      showToast(t.enterprises.alreadyOwned, 'info');
    } else {
      showToast(t.enterprises.insufficientCoins, 'warning');
    }
  };

  const handleSetGps = (x: number, z: number) => {
    setCustomWaypoint({ x, y: 0, z });
    showToast(t.enterprises.gpsSetToast, 'info');
    setActiveModal('none');
  };

  const handleRideMetroTo = (stationId: string, nameKey: string) => {
    if (player.inVehicleInstanceId) {
      showToast(t.metro.exitCarFirstToast, 'warning');
      return;
    }
    const nearest = findNearestMetroStation(player.position.x, player.position.z);
    const destName = resolveNestedKey(t, nameKey);
    requestMetroRide(stationId, nearest.id, `${t.metro.departToastPrefix}: ${destName}`);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div
        className={`w-full max-w-5xl rounded-xl border p-5 md:p-6 shadow-2xl modal-scroll-zone max-h-[92vh] overflow-y-auto ${surfaceCls}`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800/50">
          <div className="max-w-2xl">
            <h2 className="text-xl md:text-2xl font-bold font-display tracking-wide">
              {t.enterprises.title}
            </h2>
            <p className={`text-xs md:text-sm mt-1 ${subText}`}>{t.enterprises.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openMetroModal()}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isDark
                  ? 'border-slate-700 hover:bg-slate-800 text-sky-400'
                  : 'border-slate-300 hover:bg-slate-100 text-sky-600'
              }`}
            >
              <TrainFront className="w-4 h-4 shrink-0" />
              <span>{t.menu.metro}</span>
            </button>
            <button
              type="button"
              onClick={() => topUpVipCoins(t.hud.vipTopUpSuccess)}
              className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>{t.hud.vipTopUp}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('none')}
              className={`p-2 rounded-lg transition-colors ${
                isDark ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-700'
              }`}
              aria-label={t.menu.back}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 border-b border-slate-800/40">
          <div>
            <div className={`text-xs ${subText}`}>{t.hud.coins}</div>
            <div className="text-base md:text-lg font-bold font-mono-num text-amber-400 mt-0.5 truncate">
              {formatNCoins(coins)} N-Coin
            </div>
          </div>
          <div>
            <div className={`text-xs ${subText}`}>{t.enterprises.ownedCount}</div>
            <div className="text-base md:text-lg font-bold font-mono-num mt-0.5">
              {ownedPlaceCount} / {ALL_PURCHASABLE_PLACES.length}
            </div>
          </div>
          <div>
            <div className={`text-xs ${subText}`}>{t.enterprises.totalPassiveIncome}</div>
            <div className="text-base md:text-lg font-bold font-mono-num text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>
                +{formatNCoins(totalPassiveIncome)} {t.enterprises.incomeUnit}
              </span>
            </div>
          </div>
        </div>

        {/* Segmented Filter Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div
            className={`flex flex-wrap items-center gap-1 p-1 rounded-lg border ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {FILTER_KEYS.map((key) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? isDark
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'bg-white text-slate-900 shadow-sm'
                      : `${subText} hover:text-sky-400`
                  }`}
                >
                  {t.enterprises.filters[key]}
                </button>
              );
            })}
          </div>
        </div>

        {/* All 26 Purchasable Places Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {visiblePlaces.map((place) => {
            const isOwned = ownedProperties.includes(place.id);
            const isSelectedHere = place.id === selectedEnterpriseId;
            const canAfford = coins >= place.purchasePrice;
            const districtId = detectDistrict(place.centerX, place.centerZ);

            return (
              <div
                key={place.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${cardSurfaceCls} ${
                  isSelectedHere
                    ? 'border-sky-500/80'
                    : isOwned
                      ? 'border-emerald-500/50'
                      : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-base font-bold font-display truncate">
                        {resolveNestedKey(t, place.nameKey)}
                      </h3>
                      <div className={`flex flex-wrap items-center gap-1.5 text-xs mt-1 ${subText}`}>
                        <span>{t.enterprises.kindLabels[place.kind]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{resolveNestedKey(t, `districts.${districtId}`)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">{Math.round(place.heightMeters)}m</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          ({Math.round(place.centerX)}, {Math.round(place.centerZ)})
                        </span>
                      </div>
                    </div>
                    {place.kind === 'metro' ? (
                      <TrainFront
                        className="w-5 h-5 shrink-0 mt-0.5"
                        style={{ color: isOwned ? '#10b981' : place.accentColor }}
                      />
                    ) : (
                      <Building2
                        className="w-5 h-5 shrink-0 mt-0.5"
                        style={{ color: isOwned ? '#10b981' : place.accentColor }}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800/35 text-xs">
                    <div>
                      <div className={subText}>{t.enterprises.price}</div>
                      <div className="font-mono-num font-bold text-sm mt-0.5">
                        {formatNCoins(place.purchasePrice)} N-Coin
                      </div>
                    </div>
                    <div>
                      <div className={subText}>{t.enterprises.income}</div>
                      <div className="font-mono-num font-bold text-sm text-emerald-400 mt-0.5">
                        +{formatNCoins(place.incomePerTick)} {t.enterprises.incomeUnit}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isOwned ? (
                    <div className="flex-1 py-2 px-3 rounded-lg border border-emerald-500/40 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <Check className="w-4 h-4 shrink-0" />
                      <span>{t.enterprises.ownedLabel}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleBuy(place.id)}
                      disabled={!canAfford}
                      className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                        canAfford
                          ? 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {canAfford ? t.enterprises.buyBtn : t.enterprises.insufficientCoins}
                    </button>
                  )}

                  {place.kind === 'metro' && (
                    <button
                      type="button"
                      onClick={() => handleRideMetroTo(place.id, place.nameKey)}
                      className="py-2 px-3 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-400 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <TrainFront className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.enterprises.rideMetroBtn}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSetGps(place.gpsTarget.x, place.gpsTarget.z)}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                      isDark
                        ? 'border-slate-700 hover:bg-slate-800 text-slate-200'
                        : 'border-slate-300 hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <Navigation className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>{t.enterprises.gpsBtn}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
