// 遺物データ定義
import type { Relic } from "../types";

// ---- 遺物の効果数値（名前付き定数） ----
export const ANCIENT_EMBLEM_ATTACK_BONUS = 2;
export const SMALL_GEAR_FOLLOW_UP_ATTACK_BONUS = 1;
export const CRACKED_SHIELD_BLOCK = 2;
export const BLACK_VIAL_POISON = 2;

// 均衡型の初期遺物: 古びた紋章
export const ANCIENT_EMBLEM: Relic = {
  id: "ancient-emblem",
  name: "古びた紋章",
  deckType: "balanced",
  effect: {
    kind: "firstTurnFirstAttackBonus",
    amount: ANCIENT_EMBLEM_ATTACK_BONUS,
  },
  description: `各戦闘の1ターン目、最初に使う攻撃カードの攻撃力+${ANCIENT_EMBLEM_ATTACK_BONUS}。`,
  rarity: "uncommon",
  isStarter: true,
};

// 連撃型の初期遺物: 小さな歯車
export const SMALL_GEAR: Relic = {
  id: "small-gear",
  name: "小さな歯車",
  deckType: "combo",
  effect: {
    kind: "firstTurnMultiAttackFollowUpBonus",
    amount: SMALL_GEAR_FOLLOW_UP_ATTACK_BONUS,
  },
  description: `各戦闘の1ターン目、1度に2回以上攻撃する場合2回目以降の攻撃力+${SMALL_GEAR_FOLLOW_UP_ATTACK_BONUS}。`,
  rarity: "uncommon",
  isStarter: true,
};

// 守護型の初期遺物: ひび割れた盾
export const CRACKED_SHIELD: Relic = {
  id: "cracked-shield",
  name: "ひび割れた盾",
  deckType: "guardian",
  effect: { kind: "blockOnTurnStartIfEmpty", amount: CRACKED_SHIELD_BLOCK },
  description: `ターン開始時、ブロックが0なら${CRACKED_SHIELD_BLOCK}ブロック。`,
  rarity: "uncommon",
  isStarter: true,
};

// 侵蝕型の初期遺物: 黒い小瓶
export const BLACK_VIAL: Relic = {
  id: "black-vial",
  name: "黒い小瓶",
  deckType: "erosion",
  effect: { kind: "poisonAllEnemiesOnBattleStart", stacks: BLACK_VIAL_POISON },
  description: `戦闘開始時、敵全体に毒${BLACK_VIAL_POISON}。`,
  rarity: "uncommon",
  isStarter: true,
};

// 全遺物のマスターリスト
export const ALL_RELICS: readonly Relic[] = [
  ANCIENT_EMBLEM,
  SMALL_GEAR,
  CRACKED_SHIELD,
  BLACK_VIAL,
];
