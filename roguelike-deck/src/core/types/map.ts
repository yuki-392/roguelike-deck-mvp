// Phase 4 マップ型定義
// DOM 依存ゼロ。純粋なデータ構造のみ

// Phase 4 で使うノード種類（Phase 5 以降で elite/shop/event 等を拡張）
export type NodeKind = "battle" | "rest" | "forge" | "shop" | "boss";

// マップ上の 1 ノード
export interface MapNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly nextNodeIds: readonly string[]; // 接続先ノードの id（最終段は空配列）
}

// 1 フロアのマップ
export interface FloorMap {
  readonly nodes: readonly MapNode[];
  readonly startNodeIds: readonly string[]; // 最初に選べるノードの id
  readonly bossNodeId: string; // 常に最終段の唯一ノード
}
