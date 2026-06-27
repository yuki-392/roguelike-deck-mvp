// ステータス効果（Discriminated Union）
import type { EnemyInstanceId } from "./enemy";

export type StatusEffect =
  | { kind: "vulnerable" } // 受けるダメージ増加
  | { kind: "weak" } // 与えるダメージ減少
  | { kind: "poison" } // ターン終了時にダメージ
  | { kind: "laceration" } // 裂傷: ターン終了時にダメージ（毒と別スタック）
  | { kind: "strength" }; // 攻撃力増加

// カード1枚の効果（Discriminated Union）
// - 複数効果カードに対応するため CardEffect は配列で保持する
// - amount は型としては number のみ定義し、バランス数値はゲームデータ層で決める
export type AttackTarget =
  | { kind: "single"; instanceId: EnemyInstanceId }
  | { kind: "allEnemies" };

export type CardEffect =
  | { kind: "attack"; amount: number; target?: AttackTarget }
  | { kind: "block"; amount: number }
  | { kind: "draw"; count: number }
  | { kind: "gainEnergy"; amount: number }
  | { kind: "applyStatus"; status: StatusEffect; stacks: number }
  | { kind: "multiAttack"; amount: number; times: number; target?: AttackTarget } // 複数回攻撃
  | { kind: "selfDamage"; amount: number } // 自分にダメージ（ブロック無視）
  | { kind: "discard"; count: number } // 手札からランダムに捨てる
  | {
      kind: "conditionalAttack";
      baseAmount: number;
      bonusAmount: number;
      condition: "attackedThisTurn";
      target?: AttackTarget;
    } // 条件付き追加ダメージ
  | { kind: "costReductionNextCard"; amount: number } // 次に使うカードのコスト削減
  | { kind: "buffNextDefense"; amount: number } // 次に使う防御カードにボーナスブロック
  | { kind: "amplifyEnemyStatus"; amount: number }; // 敵の毒と裂傷を増幅

// カードの希少度
export type CardRarity = "common" | "uncommon" | "rare";

// カード図鑑で使用する表示カテゴリ
export type CardCategory =
  | "attack"
  | "defense"
  | "skill"
  | "evolve"
  | "original";

// 開始デッキとの内部相性判定に使うタグ（プレイヤーには表示しない）
export type AffinityTag =
  | "attack"
  | "defense"
  | "combo"
  | "poison"
  | "laceration"
  | "weaken"
  | "draw"
  | "forge"
  | "evolve";

// 鍛冶でカードの通常スロットに付与できる特殊効果
// OriginalCard.enemySlot のエネミーオーブとは別の仕組みとして扱う
export type ForgeEffect =
  | { kind: "poisonOnAttack"; stacks: number }
  | { kind: "healOnUse"; amount: number }
  | { kind: "reflectOnBlock"; amount: number }
  | { kind: "retain" }
  | { kind: "lightweight" };

// 通常カードの特殊効果スロット状態
export type CardSlotState =
  | { kind: "empty" }
  | { kind: "filled"; effect: ForgeEffect };

// ラン中のカード進化条件
export type EvolveCondition =
  | { kind: "useCount"; threshold: number }
  | {
      kind: "statusApplied";
      status: StatusEffect["kind"];
      threshold: number;
    }
  | { kind: "blockTotal"; threshold: number };

// カードのコスト種別（将来の「コスト0」「X コスト」に備える）
export type CardCost =
  | { kind: "fixed"; energy: number }
  | { kind: "zero" }
  | { kind: "variable" }; // X コスト

// カード1枚のメタデータ＋効果
export interface Card {
  readonly id: string; // ユニーク識別子
  readonly no: string; // カード図鑑のカタログNo
  readonly category: CardCategory; // カード図鑑の表示カテゴリ
  readonly name: string; // 表示名
  readonly cost: CardCost;
  readonly effects: readonly CardEffect[]; // 複数効果に対応
  readonly rarity: CardRarity;
  readonly description: string; // ルール文（Renderer が表示するが、テキスト生成はロジック側）
  readonly affinityTags?: readonly AffinityTag[]; // 報酬補正専用。Renderer には表示しない
  readonly cardSlot?: CardSlotState; // 鍛冶用。OriginalCard.enemySlot とは独立
  readonly exhaust?: boolean; // 使用後廃棄（捨て札でなく廃棄置き場へ）
  readonly upgraded?: boolean; // 通常強化済みの場合 true（1回のみ）
}

// 進化可能カード。進化進行度は RunState.evolveProgress で外部管理する
export interface EvolveCard extends Card {
  readonly isEvolvable: true;
  readonly evolveCondition: EvolveCondition;
  readonly evolvedCardId: string;
}
