// フロアマップ生成ロジック
// DOM 依存ゼロの純粋関数。Renderer・screens を一切インポートしない
import type { FloorMap, MapNode, NodeKind } from "./types/map";
import type { RngFn } from "./rng";

// マップ構成の定数
// Phase 4: 6段構成（ボス段含む）
// 段0〜1: 戦闘ノード2つ（固定）
// 段2〜3: 1〜2ノード。各ノードの種別はランダム（戦闘 or 休憩、50%）。全ノードが休憩になる場合もある
// 段4: 休憩のみ（ボス前必須休憩。全経路が必ずここを通る）
// 段5: ボス（1ノード固定）

// 各段に生成するノード数（1 or 2）
const FLOOR_LAYOUT: readonly ("battle" | "rest" | "mixed" | "boss")[] = [
  "battle", // 段0: 戦闘のみ（スタート段）
  "battle", // 段1: 戦闘のみ
  "mixed", // 段2: 1〜2ノード（戦闘 or 休憩）
  "mixed", // 段3: 1〜2ノード（戦闘 or 休憩）
  "rest", // 段4: 休憩（ボス前必須。全経路が通る唯一ノード）
  "boss", // 段5: ボス
];

// 段0〜1で生成するノード数（固定 or ランダム）
const BATTLE_TIER_NODE_COUNT = 2;
// 混合段で生成するノード数の候補
const MIXED_TIER_NODE_COUNTS = [1, 2] as const;
const BATTLE_THRESHOLD = 0.4;
const REST_THRESHOLD = 0.65;
const FORGE_THRESHOLD = 0.75;

function selectMixedNodeKind(rng: RngFn): NodeKind {
  const roll = rng();
  if (roll < BATTLE_THRESHOLD) return "battle";
  if (roll < REST_THRESHOLD) return "rest";
  if (roll < FORGE_THRESHOLD) return "forge";
  return "shop";
}

/**
 * 第1フロアのマップを生成する
 * - 段数：ボス段含めて 6 段
 * - ボス前段（段4）：唯一の休憩ノード → 全経路が必ず通る
 * - 通常段（段0〜1）：戦闘ノード2つ
 * - 混合段（段2〜3）：1〜2ノード（戦闘 or 休憩）
 *
 * DOM / Renderer に一切依存しない純粋関数
 */
export function generateFloorMap(rng: RngFn): FloorMap {
  const nodes: MapNode[] = [];
  // 各段のノード id を記録（接続のため）
  const tiers: string[][] = [];

  let nodeCounter = 0;
  function nextNodeId(kind: NodeKind): string {
    nodeCounter += 1;
    return `node-${kind}-${nodeCounter}`;
  }

  // 段ごとにノードを生成（nextNodeIds は後から埋める）
  for (const tier of FLOOR_LAYOUT) {
    const tierNodeIds: string[] = [];

    if (tier === "boss") {
      // ボス段: 固定1ノード
      const id = nextNodeId("boss");
      tierNodeIds.push(id);
      nodes.push({ id, kind: "boss", nextNodeIds: [] });
    } else if (tier === "rest") {
      // 休憩固定段: 1ノード（ボス前必須休憩）
      const id = nextNodeId("rest");
      tierNodeIds.push(id);
      nodes.push({ id, kind: "rest", nextNodeIds: [] });
    } else if (tier === "battle") {
      // 戦闘固定段: BATTLE_TIER_NODE_COUNT ノード
      for (let i = 0; i < BATTLE_TIER_NODE_COUNT; i++) {
        const id = nextNodeId("battle");
        tierNodeIds.push(id);
        nodes.push({ id, kind: "battle", nextNodeIds: [] });
      }
    } else {
      // mixed 段: 1〜2ノード（戦闘 or 休憩）
      const count =
        MIXED_TIER_NODE_COUNTS[
          Math.floor(rng() * MIXED_TIER_NODE_COUNTS.length)
        ] ?? 1;
      for (let i = 0; i < count; i++) {
        const kind = selectMixedNodeKind(rng);
        const id = nextNodeId(kind);
        tierNodeIds.push(id);
        nodes.push({ id, kind, nextNodeIds: [] });
      }
    }

    tiers.push(tierNodeIds);
  }

  // 接続情報を埋める
  // 各段のノードは次段の全ノードに接続する（単純な全結合）
  for (let tierIndex = 0; tierIndex < tiers.length - 1; tierIndex++) {
    const currentTier = tiers[tierIndex];
    const nextTier = tiers[tierIndex + 1];
    if (currentTier === undefined || nextTier === undefined) continue;

    for (const nodeId of currentTier) {
      const nodeIndex = nodes.findIndex((n) => n.id === nodeId);
      if (nodeIndex === -1) continue;
      const node = nodes[nodeIndex];
      if (node === undefined) continue;
      nodes[nodeIndex] = { ...node, nextNodeIds: [...nextTier] };
    }
  }

  // startNodeIds = 段0のノード、bossNodeId = 最終段の唯一ノード
  const startTier = tiers[0] ?? [];
  const bossTier = tiers[tiers.length - 1] ?? [];
  const bossNodeId = bossTier[0] ?? "";

  return {
    nodes: nodes,
    startNodeIds: startTier,
    bossNodeId,
  };
}

/**
 * マップからノードを id で検索する
 * 存在しない場合は undefined を返す
 */
export function findNode(map: FloorMap, nodeId: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === nodeId);
}

/**
 * 指定ノードの親ノード id を返す
 * - スタートノードの場合は "" を返す（初期選択状態に戻る）
 * - 同一段のノードは次段全体に接続されているため、どの親を返しても選択画面は同一になる
 */
export function findParentNodeId(map: FloorMap, nodeId: string): string {
  if (map.startNodeIds.includes(nodeId)) return "";
  const parent = map.nodes.find((n) => n.nextNodeIds.includes(nodeId));
  return parent?.id ?? "";
}

/**
 * 現在選択可能なノード id の配列を返す
 * - currentNodeId が "" の場合（ランを始めたばかり）は startNodeIds を返す
 * - それ以外は currentNodeId の nextNodeIds を返す
 */
export function getSelectableNodeIds(
  map: FloorMap,
  currentNodeId: string,
): readonly string[] {
  if (currentNodeId === "") {
    return map.startNodeIds;
  }
  const currentNode = findNode(map, currentNodeId);
  return currentNode?.nextNodeIds ?? [];
}
