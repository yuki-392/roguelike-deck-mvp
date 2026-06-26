import type { Card, ForgeEffect } from "./types/card";
import type { GameState } from "./types/gameState";
import type { Relic, RelicRarity } from "./types/relic";
import { ALL_RELICS } from "./data/relics";
import { shuffleArray, type RngFn } from "./rng";
import { isOriginalCard } from "./workshop";

const FORGE_EFFECT_CANDIDATE_COUNT = 3;
const MAX_LOG_ENTRIES = 20;

const ATTACK_FORGE_EFFECTS: readonly ForgeEffect[] = [
  { kind: "poisonOnAttack", stacks: 2 },
  { kind: "healOnUse", amount: 2 },
  { kind: "lightweight" },
];

const BLOCK_FORGE_EFFECTS: readonly ForgeEffect[] = [
  { kind: "reflectOnBlock", amount: 2 },
  { kind: "healOnUse", amount: 2 },
  { kind: "retain" },
];

const UTILITY_FORGE_EFFECTS: readonly ForgeEffect[] = [
  { kind: "retain" },
  { kind: "lightweight" },
  { kind: "healOnUse", amount: 2 },
];

const RARITY_ORDER: readonly RelicRarity[] = [
  "normal",
  "uncommon",
  "rare",
  "legendary",
];

function addLog(log: readonly string[], message: string): readonly string[] {
  return [...log, message].slice(-MAX_LOG_ENTRIES);
}

function getRelicRarityIndex(rarity: RelicRarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

function getConversionRarity(relicA: Relic, relicB: Relic): RelicRarity {
  const indexA = getRelicRarityIndex(relicA.rarity);
  const indexB = getRelicRarityIndex(relicB.rarity);
  const targetIndex =
    indexA === indexB
      ? Math.min(indexA + 1, RARITY_ORDER.length - 1)
      : Math.max(indexA, indexB);
  return RARITY_ORDER[targetIndex] ?? "normal";
}

function getNearestAvailableRelics(
  targetRarity: RelicRarity,
): readonly Relic[] {
  const availableRelics = ALL_RELICS.filter((relic) => !relic.isStarter);
  const targetIndex = getRelicRarityIndex(targetRarity);

  return availableRelics
    .map((relic) => ({
      relic,
      distance: Math.abs(getRelicRarityIndex(relic.rarity) - targetIndex),
    }))
    .sort((a, b) => a.distance - b.distance)
    .filter(
      (candidate, _index, candidates) =>
        candidate.distance === candidates[0]?.distance,
    )
    .map((candidate) => candidate.relic);
}

export function getForgeableCards(state: GameState): readonly Card[] {
  return state.player.deck.filter((card) => {
    if (isOriginalCard(card)) return false;
    if (card.cardSlot === undefined || card.cardSlot.kind !== "empty")
      return false;
    // 試練レベル1ではコスト0のカードは鍛冶不可
    if (state.run.trialLevel === 1) {
      const cost = card.cost;
      if (
        cost.kind === "zero" ||
        (cost.kind === "fixed" && cost.energy === 0)
      ) {
        return false;
      }
    }
    return true;
  });
}

export function getForgeEffectCandidates(
  card: Card,
  rng: RngFn,
): readonly ForgeEffect[] {
  const hasAttack = card.effects.some(
    (effect) =>
      effect.kind === "attack" ||
      effect.kind === "multiAttack" ||
      effect.kind === "conditionalAttack",
  );
  const hasBlock = card.effects.some((effect) => effect.kind === "block");
  const pool = hasAttack
    ? ATTACK_FORGE_EFFECTS
    : hasBlock
      ? BLOCK_FORGE_EFFECTS
      : UTILITY_FORGE_EFFECTS;

  return shuffleArray(pool, rng).slice(0, FORGE_EFFECT_CANDIDATE_COUNT);
}

export function applyForge(
  state: GameState,
  cardId: string,
  effect: ForgeEffect,
): GameState {
  if (state.phase !== "forge") return state;

  // lightweight はコストを0にする効果。すでにコスト0のカードには付与できない
  if (effect.kind === "lightweight") {
    const target = state.player.deck.find((card) => card.id === cardId);
    if (
      target !== undefined &&
      (target.cost.kind === "zero" ||
        (target.cost.kind === "fixed" && target.cost.energy === 0))
    ) {
      return {
        ...state,
        log: addLog(
          state.log,
          `${target.name}はすでにコスト0のため、軽量化を付与できません。`,
        ),
      };
    }
  }

  let forged = false;
  let forgedCardName = "";
  const deck = state.player.deck.map((card) => {
    if (
      forged ||
      card.id !== cardId ||
      isOriginalCard(card) ||
      card.cardSlot?.kind !== "empty"
    ) {
      return card;
    }

    forged = true;
    forgedCardName = card.name;
    return {
      ...card,
      cardSlot: { kind: "filled", effect } as const,
    };
  });

  if (!forged) return state;

  return {
    ...state,
    player: { ...state.player, deck },
    phase: "map",
    log: addLog(state.log, `${forgedCardName}を鍛冶した。`),
  };
}

export function getRelicConversionResult(
  relicA: Relic,
  relicB: Relic,
  rng: RngFn,
): Relic {
  const targetRarity = getConversionRarity(relicA, relicB);
  const exactCandidates = ALL_RELICS.filter(
    (relic) => !relic.isStarter && relic.rarity === targetRarity,
  );
  const candidates =
    exactCandidates.length > 0
      ? exactCandidates
      : getNearestAvailableRelics(targetRarity);
  const selectedIndex = Math.floor(rng() * candidates.length);
  const selected = candidates[selectedIndex] ?? candidates[0];

  if (selected === undefined) {
    throw new Error("遺物変換の候補がありません。");
  }
  return selected;
}

export function applyRelicConversion(
  state: GameState,
  relicIdA: string,
  relicIdB: string,
  rng: RngFn,
): GameState {
  if (state.phase !== "forge" || relicIdA === relicIdB) return state;

  const relicA = state.relics.find((relic) => relic.id === relicIdA);
  const relicB = state.relics.find((relic) => relic.id === relicIdB);
  if (
    relicA === undefined ||
    relicB === undefined ||
    relicA.isStarter ||
    relicB.isStarter
  ) {
    return state;
  }

  let convertedRelic: Relic;
  try {
    convertedRelic = getRelicConversionResult(relicA, relicB, rng);
  } catch {
    return state;
  }
  const relics = [
    ...state.relics.filter(
      (relic) => relic.id !== relicIdA && relic.id !== relicIdB,
    ),
    convertedRelic,
  ];

  return {
    ...state,
    relics,
    phase: "map",
    log: addLog(
      state.log,
      `${relicA.name}と${relicB.name}を${convertedRelic.name}に変換した。`,
    ),
  };
}

export function getConvertibleRelics(state: GameState): readonly Relic[] {
  return state.relics.filter((relic) => !relic.isStarter);
}
