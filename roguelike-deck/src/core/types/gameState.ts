import type { Card } from "./card";
import type { Enemy } from "./enemy";
import type { StatusEffect } from "./card";
import type { Relic } from "./relic";
import type { FloorMap } from "./map";
import type { StartingDeckType } from "./runSetup";
import type { Potion } from "./potion";
import type { CodexState, EnemyOrb } from "./enemy";

export interface ShopCardItem {
  readonly card: Card;
  readonly price: number;
}

export interface ShopRelicItem {
  readonly relic: Relic;
  readonly price: number;
}

export interface ShopPotionItem {
  readonly potion: Potion;
  readonly price: number;
}

export interface ShopItems {
  readonly cards: readonly ShopCardItem[];
  readonly relics: readonly ShopRelicItem[];
  readonly potions: readonly ShopPotionItem[];
  readonly cardRemovalPrice: number;
}

// プレイヤーの状態
export interface Player {
  readonly maxHp: number;
  readonly currentHp: number;
  readonly block: number;
  readonly energy: number; // 現在の使用可能エネルギー
  readonly maxEnergy: number; // ターン開始時の最大エネルギー
  readonly hand: readonly Card[]; // 手札
  readonly deck: readonly Card[]; // 山札（残り）
  readonly discard: readonly Card[]; // 捨て札
  readonly exhaust: readonly Card[]; // 廃棄置き場（使用後廃棄カード。デッキに戻らない）
  readonly statuses: ReadonlyMap<StatusEffect["kind"], number>;
}

// ゲームの進行フェーズ
export type GamePhase =
  | "battle" // 戦闘中
  | "reward" // 戦闘後報酬選択
  | "map" // ノード選択中（マップ画面）
  | "rest" // 休憩所（新規）
  | "forge" // 鍛冶所
  | "shop" // ショップ
  | "result" // リザルト（新規）
  | "gameover" // 後方互換のため残す
  | "victory"; // 後方互換のため残す

// ターンの所有者
export type TurnOwner = "player" | "enemy";

// ラン累積統計（リザルト表示用）
export interface RunStats {
  readonly totalDamageDealt: number; // ラン中の総与ダメージ
  readonly totalDamageBlocked: number; // ラン中の総ブロックダメージ
  readonly originalCardUsedCount: number; // オリジナルカードの使用回数
  readonly relicEffectCount: number; // 初期遺物の発動回数
}

// ラン進行状態（バトル状態と独立して管理）
export interface RunState {
  readonly map: FloorMap;
  readonly currentNodeId: string; // 現在いるノードの id（ラン開始時は ""）
  readonly visitedNodeIds: ReadonlySet<string>;
  readonly gold: number; // 現在ゴールド（Phase 4 では消費先なし。Phase 5 のショップで使用）
  readonly stats: RunStats;
  readonly startingDeckType: StartingDeckType; // リザルト表示用
  readonly evolveProgress: ReadonlyMap<string, number>; // カードインスタンスIDごとの進化進行度
  readonly potions: readonly Potion[]; // 所持ポーション（上限2。Player ではなくここで管理し、部屋移動後も保持）
  readonly codexState: CodexState; // 敵図鑑ポイント（ラン開始時に PersistentData から復元）
  readonly acquiredOrbIds: readonly string[]; // 入手済みエネミーオーブID
  readonly encounteredEnemyIds: ReadonlySet<string>; // 初遭遇判定用（このランで遭遇済みの敵ID）
  readonly lastBattleDamageReceived: number; // 今バトルでプレイヤーが受けたダメージ合計（ノーダメ撃破判定用）
  readonly trialLevel: 0 | 1; // 試練レベル（RunConfig から引き継ぎ）
}

// ゲーム全体の状態（readonly で副作用なし更新を型レベルで強制）
export interface GameState {
  readonly player: Player;
  readonly enemy: Enemy;
  readonly turn: TurnOwner;
  readonly phase: GamePhase;
  readonly outcome: "victory" | "defeat" | null; // ラン結果（null = 継続中）
  readonly log: readonly string[]; // 直近のイベントログ（Renderer が表示する文字列だが、生成はロジック側）
  readonly rewardCandidates: readonly Card[]; // 報酬フェーズ中の候補（3枚）。他フェーズでは空配列
  readonly rewardGold: number; // 今回の戦闘で得たゴールド（報酬画面に表示。他フェーズでは 0）
  readonly lastDefeatedEnemyName: string; // 最後に倒した敵の名前（報酬画面に表示。他フェーズでは ""）
  readonly roomNumber: number; // 現在の部屋番号（1始まり）
  readonly relics: readonly Relic[]; // ラン中に所持している遺物（ラン間で永続）
  readonly cardsPlayedThisTurn: number; // 今ターンにプレイしたカード枚数（小さな歯車の発火カウンタ）
  readonly attackCardsPlayedThisTurn: number; // 今ターンに攻撃カードをプレイした枚数（追撃の条件判定用）
  readonly nextCardCostReduction: number; // 次に使うカードのコスト削減量（集中の効果。カード使用後リセット）
  readonly nextDefenseCardBonus: number; // 次に使う防御カードのボーナスブロック（防御指示の効果。防御カード使用後リセット）
  readonly shopItems: ShopItems; // ショップの商品。在庫外では空
  readonly run: RunState; // ラン進行状態（マップ・ゴールド・統計）
  // null = 通常状態（捨て選択待ちなし）、{ count: N } = プレイヤーがあと N 枚を手動で捨て札に選ぶ必要がある状態
  readonly pendingDiscard: { readonly count: number } | null;
  readonly attackBonusThisTurn: number; // 攻撃ポーション効果：このターン中の攻撃カードダメージボーナス（ターン終了時リセット）
  readonly rewardPotion: Potion | null; // 報酬フェーズで出現したポーション（null = なし）
  readonly rewardUnlockedOrb: EnemyOrb | null; // このバトルで解放されたオーブ（報酬画面に表示。他フェーズでは null）
}
