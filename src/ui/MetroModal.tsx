import React from 'react';
import { Building2, Check, Navigation, PlusCircle, TrainFront, TrendingUp, X } from 'lucide-react';
import { detectDistrict, findNearestMetroStation, METRO_STATIONS } from '../game/gameConfig';
import { formatNCoins } from '../economy/EconomyManager';
import { computeDistance2D } from '../map/Navigation';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';

export const MetroModal: React.FC = () => {
  const player = useGameStore((s) => s.player);
  const coins = useGameStore((s) => s.economy.coins);
  const ownedProperties = useGameStore((s) => s.inventory.ownedProperties);
  const selectedMetroStationId = useGameStore((s) => s.selectedMetroStationId);
  const buyEnterprise = useGameStore((s) => s.buyEnterprise);
  const requestMetroRide = useGameStore((s) => s.requestMetroRide);
  const openEnterprisesModal = useGameStore((s) => s.openEnterprisesModal);
  const topUpVipCoins = useGameStore((s) => s.topUpVipCoins);
  const setCustomWaypoint = useGameStore((s) => s.setCustomWaypoint);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const showToast = useGameStore((s) => s.showToast);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const nearestStation = findNearestMetroStation(player.position.x, player.position.z);
  const nearestDist = Math.round(computeDistance2D(player.position, nearestStation.entrancePos));
  const ownedMetroCount = METRO_STATIONS.filter((st) => ownedProperties.includes(st.id)).length;
  const inVehicle = Boolean(player.inVehicleInstanceId);

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-200 text-slate-900';
  const cardSurfaceCls = isDark
    ? 'bg-slate-900/65 border-slate-800'
    : 'bg-slate-50 border-slate-200';
  const subText = isDark ? 'text-slate-400' : 'text-slate-600';

  const handleBoardMetro = (stationIdx: number) => {
    const dest = METRO_STATIONS[stationIdx];
    if (!dest) return;
    if (inVehicle) {
      showToast(t.metro.exitCarFirstToast, 'warning');
      return;
    }
    const distToDest = computeDistance2D(player.position, dest.entrancePos);
    let originId = nearestStation.id;
    if (originId === dest.id && distToDest > 20) {
      const prevIdx = (stationIdx + METRO_STATIONS.length - 1) % METRO_STATIONS.length;
      originId = METRO_STATIONS[prevIdx].id;
    }
    const destName = resolveNestedKey(t, dest.nameKey);
    requestMetroRide(dest.id, originId, `${t.metro.departToastPrefix}: ${destName}`);
  };

  const handleBuyStation = (stationId: string) => {
    const res = buyEnterprise(stationId);
    if (res.ok) {
      showToast(t.enterprises.buySuccess, 'success');
    } else if (res.reason === 'already_owned') {
      showToast(t.enterprises.alreadyOwned, 'info');
    } else {
      showToast(t.enterprises.insufficientCoins, 'warning');
    }
  };

  const handleSetGps = (stationIdx: number) => {
    const st = METRO_STATIONS[stationIdx];
    if (!st) return;
    setCustomWaypoint({ ...st.entrancePos });
    showToast(t.enterprises.gpsSetToast, 'info');
    setActiveModal('none');
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
      <div
        className={`w-full max-w-5xl rounded-xl border p-5 md:p-6 shadow-2xl modal-scroll-zone max-h-[92vh] overflow-y-auto ${surfaceCls}`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800/50">
          <div className="max-w-2xl">
            <h2 className="text-xl md:text-2xl font-bold font-display tracking-wide flex items-center gap-2.5">
              <TrainFront className="w-6 h-6 text-sky-400 shrink-0" />
              <span>{t.metro.title}</span>
            </h2>
            <p className={`text-xs md:text-sm mt-1 ${subText}`}>{t.metro.subtitle}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openEnterprisesModal(selectedMetroStationId)}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                isDark
                  ? 'border-slate-700 hover:bg-slate-800 text-emerald-400'
                  : 'border-slate-300 hover:bg-slate-100 text-emerald-600'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>{t.menu.enterprises}</span>
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
            <div className={`text-xs ${subText}`}>{t.metro.nearestBadge}</div>
            <div className="text-sm md:text-base font-bold mt-0.5 truncate">
              {resolveNestedKey(t, nearestStation.nameKey)}{' '}
              <span className="font-mono-num text-sky-400">({nearestDist} m)</span>
            </div>
          </div>
          <div>
            <div className={`text-xs ${subText}`}>{t.enterprises.ownedCount}</div>
            <div className="text-base md:text-lg font-bold font-mono-num text-emerald-400 mt-0.5 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>
                {ownedMetroCount} / {METRO_STATIONS.length}
              </span>
            </div>
          </div>
        </div>

        {inVehicle && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 font-medium">
            {t.metro.exitCarFirstToast}
          </div>
        )}

        {/* 6 Metro Stations Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {METRO_STATIONS.map((st, idx) => {
            const isOwned = ownedProperties.includes(st.id);
            const isSelected = st.id === selectedMetroStationId;
            const distMeters = Math.round(computeDistance2D(player.position, st.entrancePos));
            const isStandingAtStation = distMeters <= 18;
            const canAfford = coins >= st.purchasePrice;
            const districtId = detectDistrict(st.entrancePos.x, st.entrancePos.z);

            return (
              <div
                key={st.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${cardSurfaceCls} ${
                  isSelected
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
                        0{idx + 1}. {resolveNestedKey(t, st.nameKey)}
                      </h3>
                      <div className={`flex flex-wrap items-center gap-1.5 text-xs mt-1 ${subText}`}>
                        <span>{resolveNestedKey(t, `districts.${districtId}`)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          {distMeters} {t.metro.distanceUnit}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          ({Math.round(st.entrancePos.x)}, {Math.round(st.entrancePos.z)})
                        </span>
                      </div>
                    </div>
                    <TrainFront
                      className="w-5 h-5 shrink-0 mt-0.5"
                      style={{ color: isOwned ? '#10b981' : st.accentColor }}
                    />
                  </div>

                  <p className={`text-xs mt-2.5 leading-relaxed ${subText}`}>
                    {resolveNestedKey(t, st.descKey)}
                  </p>

                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-800/35 text-xs">
                    <div>
                      <div className={subText}>{t.enterprises.price}</div>
                      <div className="font-mono-num font-bold text-sm mt-0.5">
                        {formatNCoins(st.purchasePrice)} N-Coin
                      </div>
                    </div>
                    <div>
                      <div className={subText}>{t.enterprises.income}</div>
                      <div className="font-mono-num font-bold text-sm text-emerald-400 mt-0.5">
                        +{formatNCoins(st.incomePerTick)} {t.enterprises.incomeUnit}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleBoardMetro(idx)}
                    disabled={inVehicle}
                    className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                      inVehicle
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : isStandingAtStation
                          ? 'bg-sky-600/90 hover:bg-sky-500 text-white'
                          : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
                    }`}
                  >
                    <TrainFront className="w-4 h-4 shrink-0" />
                    <span>{t.metro.rideBtn}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    {isOwned ? (
                      <div className="flex-1 py-2 px-3 rounded-lg border border-emerald-500/40 text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>{t.enterprises.ownedLabel}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBuyStation(st.id)}
                        disabled={!canAfford}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                          canAfford
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {canAfford ? t.metro.buyStationBtn : t.enterprises.insufficientCoins}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSetGps(idx)}
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
