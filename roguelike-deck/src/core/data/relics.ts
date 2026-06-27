// 遺物データ定義
import type { Relic } from "../types";

// ---- 遺物の効果数値（名前付き定数） ----
export const ANCIENT_EMBLEM_ATTACK_BONUS = 2;
export const SMALL_GEAR_FOLLOW_UP_ATTACK_BONUS = 1;
export const CRACKED_SHIELD_BLOCK = 2;
export const BLACK_VIAL_POISON = 2;

// ---- スターター遺物 ----

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

// ---- コモン遺物 ----

export const SHARP_NEEDLE: Relic = {
  id: "sharp-needle",
  name: "鋭い針",
  effect: { kind: "attackDamageBonus", amount: 1 },
  description: "攻撃カードのダメージ+1。",
  rarity: "normal",
  isStarter: false,
};

export const THICK_COAT: Relic = {
  id: "thick-coat",
  name: "厚手の外套",
  effect: { kind: "blockOnBattleStart", amount: 6 },
  description: "戦闘開始時、6ブロック。",
  rarity: "normal",
  isStarter: false,
};

// ---- アンコモン遺物 ----

export const SPARE_BATTERY: Relic = {
  id: "spare-battery",
  name: "予備電池",
  effect: { kind: "extraEnergyOnFirstTurn", amount: 1 },
  description: "戦闘開始時、1ターン目だけエナジー+1。",
  rarity: "uncommon",
  isStarter: false,
};

export const BENT_SWORD: Relic = {
  id: "bent-sword",
  name: "曲がった剣",
  effect: { kind: "highCostAttackDamageBonus", amount: 4, minCost: 2 },
  description: "2コスト以上の攻撃カードのダメージ+4。",
  rarity: "uncommon",
  isStarter: false,
};

export const DRY_BANDAGE: Relic = {
  id: "dry-bandage",
  name: "乾いた包帯",
  effect: { kind: "healOnBattleWin", amount: 3 },
  description: "戦闘終了時、HPを3回復。",
  rarity: "uncommon",
  isStarter: false,
};

export const OLD_WALLET: Relic = {
  id: "old-wallet",
  name: "古い財布",
  effect: { kind: "goldGainBonus", percentBonus: 20 },
  description: "獲得ゴールド+20%。",
  rarity: "uncommon",
  isStarter: false,
};

export const IRON_TALISMAN: Relic = {
  id: "iron-talisman",
  name: "鉄の護符",
  effect: { kind: "blockOnEliteBattleStart", amount: 10 },
  description: "エリート戦開始時、10ブロック。",
  rarity: "uncommon",
  isStarter: false,
};

export const MERCHANT_BELL: Relic = {
  id: "merchant-bell",
  name: "商人の鈴",
  effect: { kind: "shopPriceDiscount", percent: 10 },
  description: "ショップ価格-10%。",
  rarity: "uncommon",
  isStarter: false,
};

export const VIPER_FANG: Relic = {
  id: "viper-fang",
  name: "毒蛇の牙",
  effect: { kind: "bonusPoisonOnApply", bonus: 1 },
  description: "毒を与えるたび、追加で毒+1。",
  rarity: "uncommon",
  isStarter: false,
};

export const TORN_CLAW: Relic = {
  id: "torn-claw",
  name: "裂けた爪",
  effect: { kind: "bonusLacerationOnApply", bonus: 1 },
  description: "裂傷を与えるたび、追加で裂傷+1。",
  rarity: "uncommon",
  isStarter: false,
};

export const RUSTY_GEAR: Relic = {
  id: "rusty-gear",
  name: "錆びた歯車",
  effect: { kind: "damageAllOnZeroCostCount", countThreshold: 3, damage: 3 },
  description: "0コストカードを3枚使うたび、敵全体に3ダメージ。",
  rarity: "uncommon",
  isStarter: false,
};

// ---- レア遺物 ----

export const VOID_SHARD: Relic = {
  id: "void-shard",
  name: "空紋の欠片",
  effect: { kind: "drawOnOriginalCardFirstUse", count: 2 },
  description: "オリジナルカードの最初の使用時、2ドロー。",
  rarity: "rare",
  isStarter: false,
};

// 全遺物のマスターリスト
export const ALL_RELICS: readonly Relic[] = [
  ANCIENT_EMBLEM,
  SMALL_GEAR,
  CRACKED_SHIELD,
  BLACK_VIAL,
  SHARP_NEEDLE,
  THICK_COAT,
  SPARE_BATTERY,
  BENT_SWORD,
  DRY_BANDAGE,
  OLD_WALLET,
  IRON_TALISMAN,
  MERCHANT_BELL,
  VIPER_FANG,
  TORN_CLAW,
  RUSTY_GEAR,
  VOID_SHARD,
];
