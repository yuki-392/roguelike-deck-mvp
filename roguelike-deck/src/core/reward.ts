import { ALL_RELICS } from "./data/relics";
import type {
  AffinityTag,
  Card,
  Relic,
  RelicRarity,
  StartingDeckType,
} from "./types";
import type { RngFn } from "./rng";

const NEUTRAL_WEIGHT = 1;

const AFFINITY_WEIGHTS: Readonly<
  Record<StartingDeckType, Readonly<Partial<Record<AffinityTag, number>>>>
> = {
  balanced: {
    attack: 2,
    defense: 2,
  },
  combo: {
    combo: 3,
    draw: 2,
  },
  guardian: {
    defense: 3,
  },
  erosion: {
    poison: 3,
    laceration: 2,
  },
};

/**
 * 開始デッキに対するカードの報酬重みを返す。
 * 複数の優先タグを持つ場合は最大値を採用し、倍率の過剰な増加を防ぐ。
 */
export function getRewardWeight(
  card: Card,
  startingDeckType: StartingDeckType,
): number {
  const weights = AFFINITY_WEIGHTS[startingDeckType];
  return (card.affinityTags ?? []).reduce(
    (highestWeight, tag) =>
      Math.max(highestWeight, weights[tag] ?? NEUTRAL_WEIGHT),
    NEUTRAL_WEIGHT,
  );
}

/**
 * 重みに応じてカード参照を複製した新しい報酬プールを返す。
 * 入力配列とカードオブジェクトは変更しない。
 */
export function createWeightedRewardPool(
  pool: readonly Card[],
  startingDeckType: StartingDeckType,
): readonly Card[] {
  return pool.flatMap((card) =>
    Array.from(
      { length: getRewardWeight(card, startingDeckType) },
      () => card,
    ),
  );
}

export function pickRelicReward(
  rng: RngFn,
  ownedRelicIds: ReadonlySet<string>,
  rarities: readonly RelicRarity[] = ["normal", "uncommon"],
): Relic | null {
  const pool = ALL_RELICS.filter(
    (relic) =>
      !relic.isStarter &&
      rarities.includes(relic.rarity) &&
      !ownedRelicIds.has(relic.id),
  );

  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}
