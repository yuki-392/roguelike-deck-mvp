// フロアマップ生成ロジック
// DOM 依存ゼロの純粋関数。Renderer・screens を一切インポートしない
import type { FloorMap, MapNode, NodeKind } from "./types/map";
import type { RngFn } from "./rng";

// マップ構成定数
const FLOOR_COUNT = 15;
const MAP_WIDTH = 7;
const ROUTE_COUNT_MIN = 5;
const ROUTE_COUNT_MAX = 7;
const MAX_GENERATE_ATTEMPTS = 50;

// 階層ごとに出現可能なノード種別（エクスポートして外部から参照可能にする）
export const FLOOR_RULES: Readonly<Record<number, readonly NodeKind[]>> = {
  1: ["battle"],
  2: ["battle"],
  3: ["battle", "event"],
  4: ["battle", "event", "shop"],
  5: ["battle", "event", "elite", "shop"],
  6: ["battle", "event", "elite", "shop"],
  7: ["rest", "event", "shop"],
  8: ["battle", "event", "elite", "shop", "forge"],
  9: ["battle", "event", "elite", "shop", "forge"],
  10: ["battle", "event", "elite", "shop", "forge"],
  11: ["rest", "event", "shop", "forge"],
  12: ["battle", "event", "elite", "forge"],
  13: ["battle", "event", "elite", "forge"],
  14: ["rest"],
  15: ["boss"],
};

// 階層ごとのノード種別出現重み（エクスポートして調整可能にする）
export const FLOOR_WEIGHTS: Readonly<
  Record<number, Partial<Record<NodeKind, number>>>
> = {
  1: { battle: 100 },
  2: { battle: 100 },
  3: { battle: 75, event: 25 },
  4: { battle: 60, event: 25, shop: 15 },
  5: { battle: 50, event: 25, elite: 20, shop: 5 },
  6: { battle: 45, event: 25, elite: 20, shop: 10 },
  7: { rest: 45, event: 35, shop: 20 },
  8: { battle: 40, event: 25, elite: 15, shop: 10, forge: 10 },
  9: { battle: 35, event: 25, elite: 20, shop: 10, forge: 10 },
  10: { battle: 35, event: 20, elite: 20, shop: 10, forge: 15 },
  11: { rest: 40, event: 25, shop: 15, forge: 20 },
  12: { battle: 40, event: 20, elite: 25, forge: 15 },
  13: { battle: 35, event: 15, elite: 30, forge: 20 },
  14: { rest: 100 },
  15: { boss: 100 },
};

// 重み付きランダム選択
function weightedRandom(
  weights: Partial<Record<NodeKind, number>>,
  rng: RngFn,
): NodeKind {
  const entries = Object.entries(weights) as Array<
    [NodeKind, number | undefined]
  >;
  const total = entries.reduce((sum, [, w]) => sum + (w ?? 0), 0);
  let roll = rng() * total;
  for (const [kind, weight] of entries) {
    roll -= weight ?? 0;
    if (roll <= 0) return kind;
  }
  return entries[0]?.[0] ?? "battle";
}

// 2本のエッジが交差するか判定する（フロアを跨ぐ辺同士）
// (fromX → toX) と既存の (e.fromX → e.toX) が交差 ↔ fromX と e.fromX の大小関係が toX と e.toX で逆転
function wouldCross(
  edgesAtFloor: ReadonlyArray<{ fromX: number; toX: number }>,
  newFromX: number,
  newToX: number,
): boolean {
  return edgesAtFloor.some((e) => {
    const d1 = newFromX - e.fromX;
    const d2 = newToX - e.toX;
    return (d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0);
  });
}

// 生成中のノード（kind は後から割り当てるため mutable）
interface NodeDraft {
  id: string;
  floor: number;
  x: number;
  kind: NodeKind;
  nextIds: string[];
}

// 生成を1回試みる。バランス制約違反があれば null を返す
function tryGenerate(rng: RngFn): FloorMap | null {
  const drafts = new Map<string, NodeDraft>();
  const draftByFloorX = new Map<string, string>(); // `${floor}-${x}` → id
  // フロア N → (N+1) 間のエッジ一覧（交差判定用）
  const edgesPerFloor = new Map<
    number,
    Array<{ fromX: number; toX: number }>
  >();

  // ボスノード（固定）
  const bossMidX = Math.floor(MAP_WIDTH / 2);
  const bossId = `${FLOOR_COUNT}-${bossMidX}`;
  const bossDraft: NodeDraft = {
    id: bossId,
    floor: FLOOR_COUNT,
    x: bossMidX,
    kind: "boss",
    nextIds: [],
  };
  drafts.set(bossId, bossDraft);
  draftByFloorX.set(`${FLOOR_COUNT}-${bossMidX}`, bossId);

  function getOrCreate(floor: number, x: number): NodeDraft {
    const key = `${floor}-${x}`;
    const existingId = draftByFloorX.get(key);
    if (existingId !== undefined) return drafts.get(existingId)!;
    const id = key;
    const draft: NodeDraft = { id, floor, x, kind: "battle", nextIds: [] };
    drafts.set(id, draft);
    draftByFloorX.set(key, id);
    return draft;
  }

  function addEdge(fromFloor: number, from: NodeDraft, to: NodeDraft): void {
    if (!from.nextIds.includes(to.id)) {
      from.nextIds.push(to.id);
    }
    const edges = edgesPerFloor.get(fromFloor) ?? [];
    if (!edges.some((e) => e.fromX === from.x && e.toX === to.x)) {
      edges.push({ fromX: from.x, toX: to.x });
      edgesPerFloor.set(fromFloor, edges);
    }
  }

  // ルート数をランダムに決定
  const routeCount =
    ROUTE_COUNT_MIN +
    Math.floor(rng() * (ROUTE_COUNT_MAX - ROUTE_COUNT_MIN + 1));
  const startNodeIds: string[] = [];

  // 各ルートをランダムウォークで生成
  for (let r = 0; r < routeCount; r++) {
    const startX = Math.floor(rng() * MAP_WIDTH);
    const floor1Draft = getOrCreate(1, startX);
    if (!startNodeIds.includes(floor1Draft.id)) {
      startNodeIds.push(floor1Draft.id);
    }

    let current = floor1Draft;
    let currentX = startX;

    for (let floor = 1; floor < FLOOR_COUNT; floor++) {
      const nextFloor = floor + 1;

      let nextDraft: NodeDraft;

      if (nextFloor === FLOOR_COUNT) {
        // 最終ステップはボスへ接続
        nextDraft = bossDraft;
      } else {
        // 交差を避けながら次の x を決定
        const step = Math.floor(rng() * 3) - 1; // -1, 0, +1
        const preferredX = Math.max(
          0,
          Math.min(MAP_WIDTH - 1, currentX + step),
        );
        const existing = edgesPerFloor.get(floor) ?? [];

        let nextX = preferredX;
        if (wouldCross(existing, currentX, preferredX)) {
          // 代替候補を試す（全位置を順番に試して最初の非交差を採用）
          let found = false;
          for (let cx = 0; cx < MAP_WIDTH; cx++) {
            if (!wouldCross(existing, currentX, cx)) {
              nextX = cx;
              found = true;
              break;
            }
          }
          if (!found) {
            // 全位置が交差する（極めて稀）→ 優先候補をそのまま使用
            nextX = preferredX;
          }
        }

        nextDraft = getOrCreate(nextFloor, nextX);
        currentX = nextX;
      }

      addEdge(floor, current, nextDraft);
      current = nextDraft;
    }
  }

  // ── 種別割り当て（構造確定後に行う）──
  for (const draft of drafts.values()) {
    if (draft.kind === "boss") continue;
    const weights = FLOOR_WEIGHTS[draft.floor] ?? { battle: 100 };
    draft.kind = weightedRandom(weights, rng);
  }

  // ── バランス制約チェック ──
  for (const draft of drafts.values()) {
    for (const nextId of draft.nextIds) {
      const next = drafts.get(nextId);
      if (next === undefined) continue;

      // ショップ連続禁止
      if (draft.kind === "shop" && next.kind === "shop") return null;

      // イベント3連続禁止
      if (draft.kind === "event" && next.kind === "event") {
        for (const thirdId of next.nextIds) {
          const third = drafts.get(thirdId);
          if (third?.kind === "event") return null;
        }
      }
    }
  }

  // ── FloorMap に変換して返す ──
  const nodes: MapNode[] = Array.from(drafts.values()).map((d) => ({
    id: d.id,
    floor: d.floor,
    x: d.x,
    kind: d.kind,
    nextNodeIds: d.nextIds,
  }));

  return { nodes, startNodeIds, bossNodeId: bossId };
}

// バランス制約をすべてパスすることが保証されたフォールバックマップを生成する
// tryGenerate が MAX_GENERATE_ATTEMPTS 回失敗したときにのみ使用する
function generateFallbackMap(): FloorMap {
  const fallbackKinds: Record<number, NodeKind> = {
    1: "battle",
    2: "battle",
    3: "battle",
    4: "battle",
    5: "battle",
    6: "battle",
    7: "rest",
    8: "battle",
    9: "battle",
    10: "battle",
    11: "rest",
    12: "battle",
    13: "battle",
    14: "rest",
    15: "boss",
  };

  const midX = Math.floor(MAP_WIDTH / 2);
  const nodes: MapNode[] = [];

  for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
    const nextFloor = floor + 1;
    const nextId = nextFloor <= FLOOR_COUNT ? `${nextFloor}-${midX}` : "";
    nodes.push({
      id: `${floor}-${midX}`,
      floor,
      x: midX,
      kind: fallbackKinds[floor] ?? "battle",
      nextNodeIds: nextId !== "" ? [nextId] : [],
    });
  }

  return {
    nodes,
    startNodeIds: [`1-${midX}`],
    bossNodeId: `${FLOOR_COUNT}-${midX}`,
  };
}

/**
 * 15 階層のランダムマップを生成する
 *
 * - 複数ルートのランダムウォークで分岐・合流を作る
 * - 階層ごとの出現ルール・重みでノード種別を決定する
 * - バランス制約違反があれば再生成（最大 MAX_GENERATE_ATTEMPTS 回）
 * - DOM / Renderer に一切依存しない純粋関数
 */
export function generateFloorMap(rng: RngFn): FloorMap {
  for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt++) {
    const result = tryGenerate(rng);
    if (result !== null) return result;
  }
  return generateFallbackMap();
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
 * - スタートノードの場合は "" を返す
 */
export function findParentNodeId(map: FloorMap, nodeId: string): string {
  if (map.startNodeIds.includes(nodeId)) return "";
  const parent = map.nodes.find((n) => n.nextNodeIds.includes(nodeId));
  return parent?.id ?? "";
}

/**
 * 現在選択可能なノード id の配列を返す
 * - currentNodeId が "" の場合（ラン開始直後）は startNodeIds を返す
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
