import React, { useState } from 'react';
import {
  Landmark,
  LogOut,
  MessageSquare,
  Navigation,
  Send,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { ENTERABLE_BUILDINGS, HEIST_TARGETS } from '../game/gameConfig';
import { formatNCoins } from '../economy/EconomyManager';
import { computeDistance2D } from '../map/Navigation';
import { coopClient, computePairedCodesClient } from '../multiplayer/CoopClient';
import { useGameStore } from '../state/gameStore';
import { useSettingsStore } from '../state/settingsStore';
import { getTranslations, resolveNestedKey } from '../i18n';

export const CoopModal: React.FC = () => {
  const coop = useGameStore((s) => s.coop);
  const player = useGameStore((s) => s.player);
  const robbedUntilByBuilding = useGameStore((s) => s.heist.robbedUntilByBuilding);
  const setActiveModal = useGameStore((s) => s.setActiveModal);
  const setCustomWaypoint = useGameStore((s) => s.setCustomWaypoint);
  const teleportToCoopFriend = useGameStore((s) => s.teleportToCoopFriend);
  const showToast = useGameStore((s) => s.showToast);

  const language = useSettingsStore((s) => s.language);
  const theme = useSettingsStore((s) => s.theme);
  const t = getTranslations(language);
  const isDark = theme === 'dark';

  const [tab, setTab] = useState<'create' | 'join'>(coop.mode === 'join' ? 'join' : 'create');
  const [playerName, setPlayerName] = useState<string>(coop.playerName || t.coop.playerNamePlaceholder);
  const [createCode, setCreateCode] = useState<string>(coop.hostCode || '01072015');
  const [joinCode, setJoinCode] = useState<string>(coop.joinCode || '01072016');
  const [chatText, setChatText] = useState<string>('');

  const peerList = coop.peers;
  const isConnected = coop.mode !== 'solo' && coop.status === 'connected';
  const isConnecting = coop.mode !== 'solo' && coop.status === 'connecting';

  const createPaired = computePairedCodesClient('create', createCode);
  const joinPaired = computePairedCodesClient('join', joinCode);

  const surfaceCls = isDark
    ? 'bg-slate-950/95 border-slate-800 text-slate-100'
    : 'bg-white/95 border-slate-300 text-slate-900';
  const cardCls = isDark
    ? 'bg-slate-900/85 border-slate-800'
    : 'bg-slate-50 border-slate-200';
  const inputCls = isDark
    ? 'bg-slate-950 border-slate-700 text-slate-100 focus:border-sky-400'
    : 'bg-white border-slate-300 text-slate-900 focus:border-sky-500';
  const mutedCls = isDark ? 'text-slate-400' : 'text-slate-600';

  const handleConnect = (mode: 'create' | 'join') => {
    const code = mode === 'create' ? createCode : joinCode;
    coopClient.connectAndJoin(mode, code, playerName);
  };

  const handleTeleportFriend = (peerId?: string) => {
    const ok = teleportToCoopFriend(peerId);
    if (ok) {
      showToast(t.coop.teleportedToFriendToast, 'success');
      setActiveModal('none');
    } else {
      showToast(`${t.coop.noFriendYetToast} ${coop.joinCode}`, 'warning');
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    coopClient.sendChat(chatText);
    setChatText('');
  };

  const now = Date.now();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-3 md:p-6">
      <div
        className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border p-5 md:p-6 shadow-2xl space-y-5 ${surfaceCls}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800/50 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2 className="text-xl md:text-2xl font-bold font-display">{t.coop.modalTitle}</h2>
            </div>
            <p className={`text-xs md:text-sm ${mutedCls}`}>{t.coop.modalSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveModal('none')}
            className="p-2 rounded-lg border border-slate-700/60 hover:bg-slate-800/60 transition-colors"
            aria-label={t.menu.back}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* LEFT COLUMN: Room Setup & Active Session */}
          <div className="space-y-4">
            {/* Step-by-step Code Pairing Guide */}
            <div className={`rounded-xl border p-3.5 space-y-1.5 ${cardCls}`}>
              <div className="text-xs font-bold text-sky-400">{t.coop.howItWorksTitle}</div>
              <p className="text-xs leading-relaxed font-medium">{t.coop.howItWorksCreate}</p>
              <p className="text-xs leading-relaxed font-medium text-emerald-400">
                {t.coop.howItWorksJoin}
              </p>
            </div>

            {/* Player Display Name */}
            <div className="space-y-1">
              <label className={`block text-xs font-semibold ${mutedCls}`}>
                {t.coop.playerNameLabel}
              </label>
              <input
                type="text"
                maxLength={24}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder={t.coop.playerNamePlaceholder}
                className={`w-full px-3.5 py-2 rounded-lg border text-sm font-medium outline-none transition-colors ${inputCls}`}
              />
            </div>

            {/* Create vs Join Segmented Control */}
            <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${cardCls}`}>
              <button
                type="button"
                onClick={() => setTab('create')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  tab === 'create'
                    ? 'bg-sky-500 text-slate-950'
                    : `${mutedCls} hover:text-slate-200`
                }`}
              >
                {t.coop.createTab}
              </button>
              <button
                type="button"
                onClick={() => setTab('join')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  tab === 'join'
                    ? 'bg-emerald-500 text-slate-950'
                    : `${mutedCls} hover:text-slate-200`
                }`}
              >
                {t.coop.joinTab}
              </button>
            </div>

            {tab === 'create' ? (
              <div className={`rounded-xl border p-4 space-y-3 ${cardCls}`}>
                <div className="space-y-1">
                  <label className={`block text-xs font-semibold ${mutedCls}`}>
                    {t.coop.createCodeLabel}
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-base font-mono-num tabular-nums font-bold tracking-wider outline-none ${inputCls}`}
                  />
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className={mutedCls}>{t.coop.friendJoinHintPrefix}</span>
                  <span className="font-mono-num tabular-nums font-bold text-sm text-emerald-400">
                    {createPaired.joinCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleConnect('create')}
                  className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-colors whitespace-nowrap"
                >
                  {isConnecting && coop.mode === 'create'
                    ? t.coop.connectingBtn
                    : t.coop.createAndPlayBtn}
                </button>
              </div>
            ) : (
              <div className={`rounded-xl border p-4 space-y-3 ${cardCls}`}>
                <div className="space-y-1">
                  <label className={`block text-xs font-semibold ${mutedCls}`}>
                    {t.coop.joinCodeLabel}
                  </label>
                  <input
                    type="text"
                    maxLength={16}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-base font-mono-num tabular-nums font-bold tracking-wider outline-none ${inputCls}`}
                  />
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className={mutedCls}>{t.coop.pairedHostHintPrefix}</span>
                  <span className="font-mono-num tabular-nums font-bold text-sm text-sky-400">
                    {joinPaired.hostCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleConnect('join')}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-colors whitespace-nowrap"
                >
                  {isConnecting && coop.mode === 'join'
                    ? t.coop.connectingBtn
                    : t.coop.joinAndPlayBtn}
                </button>
              </div>
            )}

            {/* Active Room Roster & Controls */}
            {coop.mode !== 'solo' && (
              <div className={`rounded-xl border border-emerald-500/50 p-4 space-y-3 ${cardCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-emerald-400">
                    {isConnected ? t.coop.connectedStatus : t.coop.connectingBtn}
                  </span>
                  <span className="font-mono-num tabular-nums">
                    {t.coop.hostCodeShort}: <strong>{coop.hostCode}</strong> · {t.coop.joinCodeShort}:{' '}
                    <strong className="text-emerald-400">{coop.joinCode}</strong> · {t.coop.onlineLabel}:{' '}
                    <strong>{peerList.length + 1}</strong>
                  </span>
                </div>

                {peerList.length === 0 ? (
                  <p className={`text-xs ${mutedCls}`}>{t.coop.waitingFriend}</p>
                ) : (
                  <div className="space-y-2">
                    <div className={`text-xs font-semibold ${mutedCls}`}>{t.coop.friendsInRoom}</div>
                    {peerList.map((peer) => {
                      const dist = Math.round(
                        computeDistance2D(player.position, { x: peer.x, y: peer.y, z: peer.z }),
                      );
                      return (
                        <div
                          key={peer.playerId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/60 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-emerald-300 truncate">{peer.name}</div>
                            <div className={`font-mono-num text-[11px] ${mutedCls}`}>
                              {dist} m · {peer.inVehicle && peer.vehicleId ? t.vehicles[peer.vehicleId].name : t.hud.onFoot}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleTeleportFriend(peer.playerId)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs whitespace-nowrap shrink-0 transition-colors"
                          >
                            {t.coop.teleportToFriendBtn}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleTeleportFriend()}
                    className="flex-1 py-2 px-3 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold text-xs whitespace-nowrap transition-colors"
                  >
                    {t.coop.teleportToFriendBtn}
                  </button>
                  <button
                    type="button"
                    onClick={() => coopClient.disconnectToSolo()}
                    className="py-2 px-3 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/15 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t.coop.leaveRoomBtn}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Co-op Chat & 9 Heist Targets (3 Banks, 4 Museums, 2 Shops) */}
          <div className="space-y-4">
            {/* Live Co-op Quick Pings & Chat */}
            <div className={`rounded-xl border p-4 space-y-3 ${cardCls}`}>
              <div className="flex items-center gap-2 text-xs font-bold">
                <MessageSquare className="w-4 h-4 text-sky-400" />
                <span>Co-op Chat</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {t.coop.quickPings.map((ping, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={!isConnected}
                    onClick={() => coopClient.sendChat(ping)}
                    className="px-2.5 py-1 rounded-lg border border-slate-700/70 hover:border-sky-400 disabled:opacity-45 text-xs font-medium whitespace-nowrap transition-colors"
                  >
                    {ping}
                  </button>
                ))}
              </div>

              <div className="h-28 overflow-y-auto rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5 space-y-1.5 text-xs">
                {coop.messages.length === 0 ? (
                  <div className={`text-xs ${mutedCls}`}>{t.coop.chatPlaceholder}</div>
                ) : (
                  coop.messages.map((m) => (
                    <div key={m.id} className="leading-snug">
                      <span
                        className={`font-bold ${
                          m.senderId === coop.playerId ? 'text-sky-400' : 'text-emerald-400'
                        }`}
                      >
                        {m.senderName}:
                      </span>{' '}
                      <span>{m.text}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendChat} className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={140}
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder={t.coop.chatPlaceholder}
                  disabled={!isConnected}
                  className={`flex-1 px-3 py-2 rounded-lg border text-xs outline-none disabled:opacity-50 ${inputCls}`}
                />
                <button
                  type="submit"
                  disabled={!isConnected || !chatText.trim()}
                  className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-45 text-slate-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t.coop.sendBtn}</span>
                </button>
              </form>
            </div>

            {/* 9 Heist Targets Directory (3 Banks, 4 Museums, 2 Shops) */}
            <div className={`rounded-xl border p-4 space-y-2.5 ${cardCls}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <Landmark className="w-4 h-4 shrink-0" />
                  <span>{t.heist.targetsSummary}</span>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {Object.values(HEIST_TARGETS).map((ht) => {
                  const bld = ENTERABLE_BUILDINGS.find((b) => b.id === ht.buildingId);
                  if (!bld) return null;
                  const fSign = bld.doorFacing === 'south' ? 1 : -1;
                  const doorZ = Math.round(bld.centerZ + fSign * (bld.depth * 0.5 + 2.5));
                  const coolLeft = Math.max(
                    0,
                    Math.ceil(((robbedUntilByBuilding[ht.buildingId] ?? 0) - now) / 1000),
                  );
                  return (
                    <div
                      key={ht.buildingId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-800/80 px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-1.5">
                          {ht.kind === 'bank' ? (
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          )}
                          <span className="truncate">{resolveNestedKey(t, bld.nameKey)}</span>
                        </div>
                        <div className="font-mono-num tabular-nums text-[11px] text-amber-300">
                          +{formatNCoins(ht.rewardCoins)} N-Coin
                          {coolLeft > 0 ? ` · ${t.heist.cooldownPrefix} ${coolLeft}s` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomWaypoint({ x: bld.centerX, y: 0, z: doorZ });
                          showToast(t.enterprises.gpsSetToast, 'info');
                          setActiveModal('none');
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>GPS</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
