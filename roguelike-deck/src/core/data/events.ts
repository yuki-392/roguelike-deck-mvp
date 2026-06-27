import type { EventDefinition } from "../types/event";

const MYSTERIOUS_SHADOW_CHAIN_ID = "mysterious-shadow";

export const DARK_TRADE_MERCHANT: EventDefinition = {
  id: "dark-trade-merchant",
  title: "闇取引の商人に出会った",
  description: "薄暗い道端で、商人が音もなく箱を開いた。",
  choices: [
    {
      label: "ゴールドを100払う",
      effects: [
        { kind: "loseGold", amount: 100 },
        { kind: "gainRelic", rarities: ["normal", "uncommon"] },
      ],
    },
    { label: "何もしない", effects: [] },
  ],
};

export const PITFALL: EventDefinition = {
  id: "pitfall",
  title: "落とし穴",
  description: "足元が崩れ、荷物の一部と引き換えに古い金貨を見つけた。",
  choices: [],
  forcedEffects: [{ kind: "loseRelic" }, { kind: "gainGold", amount: 120 }],
};

export const SUSPICIOUS_CAMPFIRE: EventDefinition = {
  id: "suspicious-campfire",
  title: "怪しげな焚き火を発見",
  description: "火はまだ暖かい。近くに誰かがいた気配はない。",
  choices: [
    {
      label: "休憩する",
      effects: [
        {
          kind: "randomOutcome",
          outcomes: [
            {
              weight: 1,
              effects: [{ kind: "heal", amount: 40, isPercent: true }],
            },
            {
              weight: 1,
              effects: [{ kind: "takeDamage", amount: 20, isPercent: true }],
            },
          ],
        },
      ],
    },
    { label: "素通りする", effects: [] },
  ],
};

export const MYSTERIOUS_SHADOW_1: EventDefinition = {
  id: "mysterious-shadow-1",
  title: "謎の人影を見た",
  description: "通路の先で、人影がこちらを見てすぐに消えた。",
  chainId: MYSTERIOUS_SHADOW_CHAIN_ID,
  choices: [
    {
      label: "後を追ってみる",
      effects: [{ kind: "takeDamage", amount: 5, isPercent: true }],
      nextChainFlag: { chainId: MYSTERIOUS_SHADOW_CHAIN_ID, value: 2 },
    },
    { label: "見なかったことにする", effects: [] },
  ],
};

export const MYSTERIOUS_SHADOW_2: EventDefinition = {
  id: "mysterious-shadow-2",
  title: "人影を再度見た...",
  description: "二つの分かれ道の間で、人影が小さく手招きしている。",
  chainId: MYSTERIOUS_SHADOW_CHAIN_ID,
  requiredFlag: { chainId: MYSTERIOUS_SHADOW_CHAIN_ID, value: 2 },
  choices: [
    {
      label: "右へ進む",
      effects: [{ kind: "gainRelic", rarities: ["normal", "uncommon"] }],
    },
    {
      label: "左へ進む",
      effects: [{ kind: "gainPotion" }],
      nextChainFlag: { chainId: MYSTERIOUS_SHADOW_CHAIN_ID, value: 3 },
    },
  ],
};

export const MYSTERIOUS_SHADOW_3: EventDefinition = {
  id: "mysterious-shadow-3",
  title: "人影は伝説の商人だった",
  description: "人影は笑い、古い包みをあなたに押し付けて去っていった。",
  chainId: MYSTERIOUS_SHADOW_CHAIN_ID,
  requiredFlag: { chainId: MYSTERIOUS_SHADOW_CHAIN_ID, value: 3 },
  choices: [],
  forcedEffects: [{ kind: "gainRelic", rarities: ["rare"] }],
};

export const ALL_NORMAL_EVENTS: readonly EventDefinition[] = [
  DARK_TRADE_MERCHANT,
  PITFALL,
  SUSPICIOUS_CAMPFIRE,
  MYSTERIOUS_SHADOW_1,
];

export const ALL_CHAIN_EVENTS: readonly EventDefinition[] = [
  MYSTERIOUS_SHADOW_2,
  MYSTERIOUS_SHADOW_3,
];

export const ALL_EVENTS: readonly EventDefinition[] = [
  ...ALL_NORMAL_EVENTS,
  ...ALL_CHAIN_EVENTS,
];
