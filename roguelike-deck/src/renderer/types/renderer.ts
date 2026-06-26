import type { GameState } from "../../core/types";
import type { StartingDeckType } from "../../core/types";
import type { OriginalCard } from "../../core/types/originalCard";
import type { ForgeEffect } from "../../core/types/card";
import type { Relic } from "../../core/types/relic";

// 入力イベントのコールバック定義
// AsciiRenderer がDOMイベントを受け取り、main.ts に委譲する境界
export interface RendererCallbacks {
  readonly onPlayCard: (cardId: string) => void;
  readonly onEndTurn: () => void;
  readonly onSelectRewardCard: (cardId: string) => void;
  readonly onSkipReward: () => void;
  // タイトル画面コールバック
  readonly onGoToWorkshop: () => void;
  readonly onGoToRunSetup: () => void;
  readonly onGoToAchievements: () => void;
  readonly onGoToCodex: () => void;
  readonly onReturnToTitle: () => void;
  // 工房画面コールバック
  readonly onSaveOriginalCard: (card: OriginalCard) => void;
  readonly onDeleteOriginalCard: (cardId: string) => void;
  readonly onRenameOriginalCard: (id: string, newName: string) => void;
  readonly onAttachOrb: (cardId: string, orbId: string) => void;
  readonly onDetachOrb: (cardId: string) => void;
  // ラン準備画面コールバック（onSelectStartingDeck を置き換え）
  readonly onConfirmRunSetup: (
    deckType: StartingDeckType,
    originalCardId: string | null,
    trialLevel: 0 | 1,
  ) => void;
  // マップ画面
  readonly onSelectNode: (nodeId: string) => void;
  // 休憩所
  readonly onSelectRest: (choice: "heal" | "upgrade") => void;
  readonly onSelectUpgradeCard: (cardId: string) => void;
  readonly onLeaveRest: () => void;
  // 鍛冶所
  readonly onForgeCard: (cardId: string, effect: ForgeEffect) => void;
  readonly onConvertRelics: (
    relicIdA: string,
    relicIdB: string,
  ) => Relic | null;
  readonly onCompleteForge: () => void;
  readonly onLeaveForge: () => void;
  // ショップ
  readonly onBuyShopCard: (cardId: string) => void;
  readonly onBuyShopRelic: (relicId: string) => void;
  readonly onRemoveShopCard: (cardId: string) => void;
  readonly onLeaveShop: () => void;
  readonly onBuyShopPotion: (itemIndex: number) => void;
  // リザルト画面（onReturnToTitle に移動済み）
  // 戦闘中のポーション使用
  readonly onUsePotion: (potionIndex: number) => void;
  // 報酬ポーション取得
  readonly onClaimRewardPotion: () => void;
  // 捨て札選択（pendingDiscard 解決）
  readonly onSelectDiscardCard: (cardId: string) => void;
}

// Renderer インターフェース
// - ASCII 実装・ドット絵実装ともにこのインターフェースを満たす
// - GameState を受け取るだけで、描画内部の実装に関知しない
export interface Renderer {
  // ゲーム画面全体を再描画する
  render(state: GameState): void;

  // 初期化（DOM 構築 / Canvas セットアップなど）
  init(callbacks: RendererCallbacks): void;

  // クリーンアップ（イベントリスナー解除など）
  destroy(): void;
}
