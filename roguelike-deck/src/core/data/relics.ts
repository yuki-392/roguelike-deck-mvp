// 遺物データ定義
import type { Relic } from "../types";

// ---- 遺物の効果数値（名前付き定数） ----
export const ANCIENT_EMBLEM_BLOCK = 4; // 古びた紋章: 戦闘開始時のブロック量
export const SMALL_GEAR_DAMAGE = 3; // 小さな歯車: 3枚目プレイ時の敵へのダメージ
export const RENEWAL_CHARM_HEAL = 3; // 再生のお守り: ターン開始時の回復量
export const WAR_HORN_STRENGTH = 1; // 戦角笛: 戦闘開始時の strength 付与数
export const STONE_ATTACK_BONUS = 2; // 石: 攻撃カードのダメージ+2

// 均衡型の初期遺物: 古びた紋章
// 戦闘開始時にブロックを得る
export const ANCIENT_EMBLEM: Relic = {
  id: "ancient-emblem",
  name: "古びた紋章",
  effect: { kind: "blockOnBattleStart" },
  description: `バトル開始時に${ANCIENT_EMBLEM_BLOCK}ブロックを得る。`,
  rarity: "normal",
  isStarter: true,
};

// 連撃型の初期遺物: 小さな歯車
// 同一ターンに3枚目のカードをプレイした時点で敵に小ダメージ
export const SMALL_GEAR: Relic = {
  id: "small-gear",
  name: "小さな歯車",
  effect: { kind: "damageOnThirdCardPlayed" },
  description: `同一ターンに3枚目のカードをプレイすると、敵に${SMALL_GEAR_DAMAGE}ダメージを与える。`,
  rarity: "normal",
  isStarter: true,
};

// ターン開始時にHPを回復する通常遺物
export const RENEWAL_CHARM: Relic = {
  id: "renewal-charm",
  name: "再生のお守り",
  effect: { kind: "healOnTurnStart", amount: RENEWAL_CHARM_HEAL },
  description: `ターン開始時にHPを${RENEWAL_CHARM_HEAL}回復する。`,
  rarity: "normal",
  isStarter: false,
};

// 戦闘開始時に strength を得るレア遺物
export const WAR_HORN: Relic = {
  id: "war-horn",
  name: "戦角笛",
  effect: {
    kind: "strengthOnBattleStart",
    stacks: WAR_HORN_STRENGTH,
  },
  description: `バトル開始時にstrengthを${WAR_HORN_STRENGTH}得る。`,
  rarity: "rare",
  isStarter: false,
};

// 攻撃カードのダメージ+2 コモン遺物（「初心者」実績解放でアンロック）
export const STONE: Relic = {
  id: "stone",
  name: "石",
  effect: { kind: "attackCardDamageBonus", amount: STONE_ATTACK_BONUS },
  description: `攻撃カードのダメージが${STONE_ATTACK_BONUS}増加する。`,
  rarity: "normal",
  isStarter: false,
};

// 全遺物のマスターリスト
export const ALL_RELICS: readonly Relic[] = [
  ANCIENT_EMBLEM,
  SMALL_GEAR,
  RENEWAL_CHARM,
  WAR_HORN,
  STONE,
];
