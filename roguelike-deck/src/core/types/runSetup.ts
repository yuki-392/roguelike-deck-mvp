// ラン開始設定の型定義
export type StartingDeckType = "balanced" | "combo" | "guardian" | "erosion";

// 開始デッキのメタデータ（説明用。遺物IDも保持する）
export interface StartingDeck {
  readonly type: StartingDeckType;
  readonly name: string;
  readonly description: string;
  readonly starterRelicId: string; // data/relics.ts の Relic.id と一致させる
}

// ラン開始時の選択内容（GameState の外側で管理）
export interface RunConfig {
  readonly startingDeckType: StartingDeckType;
  readonly originalCardId: string | null; // null = 持ち込まない（代わりに攻撃を1枚追加）
  readonly trialLevel: 0 | 1; // 試練レベル（0 = 通常、1 = 高難易度）
}
