import type { EconomyState, InventoryState, VehicleId } from '../types/game';
import { ALL_PURCHASABLE_PLACES, CITY_RACE_PRIZE_COINS, VEHICLE_CONFIGS } from '../game/gameConfig';

/**
 * Formats N-Coin balances cleanly without scientific notation ("1e+25"),
 * rendering exact comma-grouped digits such as "10,000,000,000,000,000,000,000,000".
 */
export function formatNCoins(coins: number): string {
  if (!Number.isFinite(coins) || coins <= 0) return '0';
  if (coins < 1e15) {
    return Math.floor(coins).toLocaleString('en-US');
  }
  const expStr = coins.toExponential();
  const [mantissa, expPart] = expStr.split('e+');
  const exp = Number(expPart);
  if (!expPart || !Number.isFinite(exp)) {
    return Math.floor(coins).toLocaleString('en-US');
  }
  const cleanDigits = mantissa.replace('.', '');
  const fracLen = mantissa.includes('.') ? mantissa.split('.')[1].length : 0;
  const zeroCount = Math.max(0, exp - fracLen);
  const fullDigits = cleanDigits + '0'.repeat(zeroCount);
  return fullDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function creditCityRaceReward(economy: EconomyState): EconomyState {
  const nextCoins = Math.max(economy.coins, economy.coins + CITY_RACE_PRIZE_COINS);
  return {
    ...economy,
    vip: true,
    coins: nextCoins,
  };
}

export interface RewardTransactionResult {
  economy: EconomyState;
  newLevel: number;
  newXp: number;
  awarded: boolean;
}

export function creditMissionReward(
  economy: EconomyState,
  currentLevel: number,
  currentXp: number,
  missionId: string,
  rewardCoins: number,
  _rewardXp: number,
): RewardTransactionResult {
  // Prevent duplicate payout if mission was already rewarded; keep player level unchanged ("daraja o'zgarmasin")
  if (economy.rewardedMissionIds.includes(missionId)) {
    return {
      economy,
      newLevel: currentLevel,
      newXp: currentXp,
      awarded: false,
    };
  }

  const safeCoins = Math.max(0, economy.coins + Math.max(0, rewardCoins));

  return {
    economy: {
      ...economy,
      coins: safeCoins,
      rewardedMissionIds: [...economy.rewardedMissionIds, missionId],
    },
    newLevel: currentLevel,
    newXp: currentXp,
    awarded: true,
  };
}

export interface VehiclePurchaseResult {
  success: boolean;
  reason?: 'already_owned' | 'insufficient_funds' | 'invalid_vehicle';
  economy: EconomyState;
  inventory: InventoryState;
}

export function purchaseVehicleTransaction(
  economy: EconomyState,
  inventory: InventoryState,
  vehicleId: VehicleId,
): VehiclePurchaseResult {
  const cfg = VEHICLE_CONFIGS[vehicleId];
  if (!cfg) {
    return { success: false, reason: 'invalid_vehicle', economy, inventory };
  }
  if (inventory.ownedVehicles.includes(vehicleId)) {
    return { success: false, reason: 'already_owned', economy, inventory };
  }
  if (economy.coins < cfg.price) {
    return { success: false, reason: 'insufficient_funds', economy, inventory };
  }

  const nextCoins = Math.max(0, economy.coins - cfg.price);
  return {
    success: true,
    economy: {
      ...economy,
      coins: nextCoins,
    },
    inventory: {
      ...inventory,
      ownedVehicles: [...inventory.ownedVehicles, vehicleId],
      selectedVehicle: vehicleId,
    },
  };
}

export interface EnterprisePurchaseResult {
  success: boolean;
  reason?: 'already_owned' | 'insufficient_funds' | 'invalid_enterprise';
  economy: EconomyState;
  inventory: InventoryState;
}

export function purchaseEnterpriseTransaction(
  economy: EconomyState,
  inventory: InventoryState,
  placeId: string,
): EnterprisePurchaseResult {
  const place = ALL_PURCHASABLE_PLACES.find((p) => p.id === placeId);
  if (!place || typeof place.purchasePrice !== 'number') {
    return { success: false, reason: 'invalid_enterprise', economy, inventory };
  }
  if (inventory.ownedProperties.includes(placeId)) {
    return { success: false, reason: 'already_owned', economy, inventory };
  }
  if (economy.coins < place.purchasePrice) {
    return { success: false, reason: 'insufficient_funds', economy, inventory };
  }

  const nextCoins = Math.max(0, economy.coins - place.purchasePrice);
  const deedId = `deed_${placeId}`;
  const nextItems = inventory.items.some((i) => i.id === deedId)
    ? inventory.items
    : [
        {
          id: deedId,
          category: 'property' as const,
          titleKey: place.nameKey,
          descKey: 'enterprises.deedDesc',
          acquiredAt: Date.now(),
        },
        ...inventory.items,
      ];

  return {
    success: true,
    economy: {
      ...economy,
      vip: true,
      coins: nextCoins,
    },
    inventory: {
      ...inventory,
      ownedProperties: [...inventory.ownedProperties, placeId],
      items: nextItems,
    },
  };
}

export function computeEnterpriseIncomePerTick(ownedProperties: string[]): number {
  let sum = 0;
  for (let i = 0; i < ALL_PURCHASABLE_PLACES.length; i++) {
    const place = ALL_PURCHASABLE_PLACES[i];
    if (ownedProperties.includes(place.id) && typeof place.incomePerTick === 'number') {
      sum += place.incomePerTick;
    }
  }
  return sum;
}
