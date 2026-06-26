import type { StartingDeckType } from "./runSetup";

export type RelicRarity = "normal" | "uncommon" | "rare" | "legendary";

// 遺物効果（Discriminated Union）
export type RelicEffect =
  | { kind: "firstTurnFirstAttackBonus"; amount: number } // 古びた紋章
  | { kind: "firstTurnMultiAttackFollowUpBonus"; amount: number } // 小さな歯車
  | { kind: "blockOnTurnStartIfEmpty"; amount: number } // ひび割れた盾
  | { kind: "poisonAllEnemiesOnBattleStart"; stacks: number }; // 黒い小瓶

// 遺物1個のメタデータ＋効果
export interface Relic {
  readonly id: string;
  readonly name: string;
  readonly deckType: StartingDeckType;
  readonly effect: RelicEffect;
  readonly description: string;
  readonly rarity: RelicRarity;
  readonly isStarter: boolean;
}
