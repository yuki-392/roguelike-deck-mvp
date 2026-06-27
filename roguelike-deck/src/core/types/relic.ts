import type { StartingDeckType } from "./runSetup";

export type RelicRarity = "normal" | "uncommon" | "rare" | "legendary";

// 遺物効果（Discriminated Union）
export type RelicEffect =
  // ---- 既存 ----
  | { kind: "firstTurnFirstAttackBonus"; amount: number } // 古びた紋章
  | { kind: "firstTurnMultiAttackFollowUpBonus"; amount: number } // 小さな歯車
  | { kind: "blockOnTurnStartIfEmpty"; amount: number } // ひび割れた盾
  | { kind: "poisonAllEnemiesOnBattleStart"; stacks: number } // 黒い小瓶
  // ---- 新規 ----
  | { kind: "attackDamageBonus"; amount: number } // 鋭い針
  | { kind: "blockOnBattleStart"; amount: number } // 厚手の外套
  | { kind: "extraEnergyOnFirstTurn"; amount: number } // 予備電池
  | { kind: "highCostAttackDamageBonus"; amount: number; minCost: number } // 曲がった剣
  | { kind: "healOnBattleWin"; amount: number } // 乾いた包帯
  | { kind: "goldGainBonus"; percentBonus: number } // 古い財布（例: 20 → +20%）
  | { kind: "blockOnEliteBattleStart"; amount: number } // 鉄の護符
  | { kind: "shopPriceDiscount"; percent: number } // 商人の鈴（例: 10 → -10%）
  | { kind: "bonusPoisonOnApply"; bonus: number } // 毒蛇の牙
  | { kind: "bonusLacerationOnApply"; bonus: number } // 裂けた爪
  | { kind: "damageAllOnZeroCostCount"; countThreshold: number; damage: number } // 錆びた歯車
  | { kind: "drawOnOriginalCardFirstUse"; count: number }; // 空紋の欠片

// 遺物1個のメタデータ＋効果
export interface Relic {
  readonly id: string;
  readonly name: string;
  readonly deckType?: StartingDeckType; // スターター遺物のみ使用
  readonly effect: RelicEffect;
  readonly description: string;
  readonly rarity: RelicRarity;
  readonly isStarter: boolean;
}
