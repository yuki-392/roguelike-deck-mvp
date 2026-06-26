export type RelicRarity = "normal" | "rare" | "legendary";

// 遺物効果（Discriminated Union）
export type RelicEffect =
  | { kind: "blockOnBattleStart" } // 古びた紋章: 戦闘開始時にブロックを得る
  | { kind: "damageOnThirdCardPlayed" } // 小さな歯車: 同一ターン3枚目プレイ時に敵にダメージ
  | { kind: "healOnTurnStart"; amount: number }
  | { kind: "strengthOnBattleStart"; stacks: number }
  | { kind: "attackCardDamageBonus"; amount: number }; // 石: 攻撃カードのダメージ+N（パッシブ）

// 遺物1個のメタデータ＋効果
export interface Relic {
  readonly id: string;
  readonly name: string;
  readonly effect: RelicEffect;
  readonly description: string;
  readonly rarity: RelicRarity;
  readonly isStarter: boolean;
}
