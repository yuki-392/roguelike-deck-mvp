import type { StatusEffect } from "./card";

// 敵種別IDとは別の、バトル中の個体識別子
export type EnemyInstanceId = string;

// エネミーオーブの効果（Discriminated Union）
// Phase 7 MVP: blockOnOriginalCardPlay のみ
export type EnemyOrbEffect = {
  kind: "blockOnOriginalCardPlay";
  amount: number;
};

// エネミーオーブ本体
export interface EnemyOrb {
  readonly id: string;
  readonly name: string;
  readonly sourceEnemyId: string;
  readonly effect: EnemyOrbEffect;
}

// 1敵の図鑑エントリ
export interface EnemyCodexEntry {
  readonly enemyId: string;
  readonly points: number; // 0〜100
  readonly isUnlocked: boolean;
  readonly orbId: string | null; // 対応するオーブがない敵は null
}

// 図鑑全体の状態（enemyId → エントリ）
export type CodexState = ReadonlyMap<string, EnemyCodexEntry>;

// 敵の1ターンの行動（Discriminated Union）
// - Renderer は nextAction を読んで「意図」を表示する（StS スタイルの敵意図表示）
export type EnemyAction =
  | { kind: "attack"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "multiAttack"; amount: number; times: number } // 複数回攻撃
  | {
      kind: "attackAndApplyStatus";
      amount: number;
      status: StatusEffect;
      stacks: number;
    } // 攻撃と同時にデバフ付与
  | {
      kind: "applyStatus";
      target: "player" | "self";
      status: StatusEffect;
      stacks: number;
    }
  | {
      kind: "buff";
      status: StatusEffect;
      stacks: number;
      description: string;
    }
  | { kind: "omen"; description: string }
  | {
      kind: "blockAndAttack";
      blockAmount: number;
      attackAmount: number;
    }
  | { kind: "idle" }; // 何もしない

// 敵の格付け（ボス判別・エリート追加に対応）
export type EnemyTier = "normal" | "elite" | "boss";

// selectAction に渡すコンテキスト（案A: HP しきい値による行動変化に対応）
export interface EnemyActionContext {
  readonly turn: number;
  readonly enemyHp: number;
  readonly playerHp: number;
}

// 敵の行動パターン定義（フェーズでローテーションするなど）
export interface EnemyBehavior {
  readonly selectAction: (context: EnemyActionContext) => EnemyAction;
}

// 敵1体の状態
export interface Enemy {
  readonly instanceId: EnemyInstanceId;
  readonly id: string;
  readonly name: string;
  readonly maxHp: number;
  readonly currentHp: number;
  readonly block: number;
  readonly battleTurn: number; // バトル内ターン番号（0始まり）
  readonly tier: EnemyTier; // 敵の格付け（ボス判別に使用）
  readonly statuses: ReadonlyMap<StatusEffect["kind"], number>; // status => スタック数
  readonly nextAction: EnemyAction; // Renderer が意図表示に使う（読み取り専用）
  readonly behavior: EnemyBehavior; // ロジック層がターン処理に使う
}
