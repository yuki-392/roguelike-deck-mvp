// オリジナルカード型定義
// Phase 3: 合成カードの基本型。エネミーオーブ装着は Phase 7 以降
import type { Card } from "./card";

// エネミースロットの状態（Phase 3 では常に "empty"）
export type EnemySlotState =
  | { kind: "empty" }
  | { kind: "filled"; orbId: string } // Phase 7 以降
  | { kind: "locked" }; // ラン中は locked

// 代償（コスト圧縮時に付与されるデメリット）
// Phase 3 では型として定義し表示するだけ。battle.ts での機械的効果適用は Phase 5 以降
export type Compensation =
  | { kind: "exhaust" }
  | { kind: "hpCost"; amount: number }
  | { kind: "discardCard" }
  | { kind: "weakNextTurn" }
  | { kind: "polluteDiscard" }
  | { kind: "buffEnemy" }
  | { kind: "randomTarget" }
  | { kind: "playCondition"; description: string };

// 素材情報（合成元カード2枚の記録）
export interface OriginalCardMaterials {
  readonly cardAId: string;
  readonly cardBId: string;
}

// Card を extends することで battle.ts は OriginalCard を特別扱い不要
// エフェクトはそのまま処理される（代償の機械的適用は Phase 5 以降）
export interface OriginalCard extends Card {
  readonly isOriginal: true;
  readonly materials: OriginalCardMaterials;
  readonly enemySlot: EnemySlotState; // Phase 3 では常に { kind: "empty" }
  readonly compensation: Compensation | null;
}
