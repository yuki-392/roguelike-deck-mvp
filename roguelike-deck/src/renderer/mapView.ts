// マップ全体図 SVG レンダラー
// FloorMap を受け取り、15 フロアの DAG を SVG で描画する
// DOM 操作のみ行い、ゲームロジックには依存しない
import type { FloorMap } from "../core/types/map";

const SVG_NS = "http://www.w3.org/2000/svg";

// レイアウト定数
const COL_STEP = 52; // 列間ピクセル
const ROW_STEP = 50; // 行間ピクセル
const NODE_R = 19; // ノード円の半径
const MARGIN_LEFT = 44; // フロアラベル用左マージン
const MARGIN_RIGHT = 20;
const MARGIN_TOP = 24;
const MARGIN_BOTTOM = 24;
const FLOOR_COUNT = 15;
const MAP_WIDTH = 7;

const SVG_W = MARGIN_LEFT + (MAP_WIDTH - 1) * COL_STEP + MARGIN_RIGHT; // 376
const SVG_H = MARGIN_TOP + (FLOOR_COUNT - 1) * ROW_STEP + MARGIN_BOTTOM; // 748

function nodePos(floor: number, x: number): { cx: number; cy: number } {
  return {
    cx: MARGIN_LEFT + x * COL_STEP,
    cy: MARGIN_TOP + (FLOOR_COUNT - floor) * ROW_STEP,
  };
}

const NODE_ICONS: Record<string, string> = {
  battle: "⚔",
  rest: "♥",
  forge: "⚙",
  shop: "¥",
  boss: "★",
  treasure: "◆",
  elite: "⚡",
  event: "？",
};

const NODE_BASE_FILL: Record<string, string> = {
  battle: "#b03030",
  rest: "#287a55",
  forge: "#b05a20",
  shop: "#a07800",
  boss: "#7a2090",
  treasure: "#c49a00",
  elite: "#6a3080",
  event: "#1f6b9f",
};

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

/**
 * FloorMap の全体図を SVG として container に追加する
 *
 * @param container SVG を追加する DOM 要素
 * @param map 描画するマップ
 * @param currentNodeId 現在地のノード id（未選択時は ""）
 * @param visitedNodeIds 訪問済みノードの id セット
 * @param selectableNodeIds 現在選択可能なノードの id 配列
 * @param onSelectNode ノードをクリックしたときのコールバック（選択可能ノードのみ有効）
 * @returns クリーンアップ関数
 */
export function renderFloorMapSvg(
  container: HTMLElement,
  map: FloorMap,
  currentNodeId: string,
  visitedNodeIds: ReadonlySet<string>,
  selectableNodeIds: readonly string[],
  onSelectNode?: (nodeId: string) => void,
): () => void {
  // SVG が使えない環境（テスト用 FakeElement など）ではスキップ
  if (typeof document.createElementNS !== "function") {
    return () => {};
  }

  const selectableSet = new Set(selectableNodeIds);
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));

  // SVG ルート
  const svg = svgEl("svg");
  svg.setAttribute("viewBox", `0 0 ${SVG_W} ${SVG_H}`);
  svg.setAttribute("width", String(SVG_W));
  svg.setAttribute("height", String(SVG_H));
  svg.setAttribute("class", "map-svg");
  svg.setAttribute("aria-label", "マップ全体図");

  // ---- フロアラベル（左端） ----
  const labelGroup = svgEl("g");
  labelGroup.setAttribute("class", "map-floor-labels");
  for (let floor = 1; floor <= FLOOR_COUNT; floor++) {
    const { cy } = nodePos(floor, 0);
    const text = svgEl("text");
    text.setAttribute("x", "6");
    text.setAttribute("y", String(cy));
    text.setAttribute("class", "map-floor-label");
    text.textContent = `F${floor}`;
    labelGroup.appendChild(text);
  }
  svg.appendChild(labelGroup);

  // ---- エッジ（ノードより下のレイヤー） ----
  const edgeGroup = svgEl("g");
  edgeGroup.setAttribute("class", "map-edges");

  for (const node of map.nodes) {
    const { cx: x1, cy: y1 } = nodePos(node.floor, node.x);
    const isFromActive =
      visitedNodeIds.has(node.id) || node.id === currentNodeId;

    for (const nextId of node.nextNodeIds) {
      const next = nodeById.get(nextId);
      if (next === undefined) continue;
      const { cx: x2, cy: y2 } = nodePos(next.floor, next.x);

      const line = svgEl("line");
      line.setAttribute("x1", String(x1));
      line.setAttribute("y1", String(y1));
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));

      if (isFromActive && selectableSet.has(nextId)) {
        line.setAttribute("class", "map-edge map-edge--active");
      } else if (isFromActive) {
        line.setAttribute("class", "map-edge map-edge--used");
      } else {
        line.setAttribute("class", "map-edge");
      }

      edgeGroup.appendChild(line);
    }
  }

  svg.appendChild(edgeGroup);

  // ---- ノード ----
  const nodeGroup = svgEl("g");
  nodeGroup.setAttribute("class", "map-nodes");

  const clickHandlers: Array<{ el: Element; handler: () => void }> = [];

  for (const node of map.nodes) {
    const { cx, cy } = nodePos(node.floor, node.x);
    const isSelectable = selectableSet.has(node.id);
    const isCurrent = node.id === currentNodeId;
    const isVisited = visitedNodeIds.has(node.id);

    const classes = [
      "map-node",
      isSelectable ? "map-node--selectable" : "",
      isCurrent ? "map-node--current" : "",
      isVisited && !isCurrent ? "map-node--visited" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const g = svgEl("g");
    g.setAttribute("class", classes);
    g.setAttribute("data-node-id", node.id);

    const circle = svgEl("circle");
    circle.setAttribute("cx", String(cx));
    circle.setAttribute("cy", String(cy));
    circle.setAttribute("r", String(NODE_R));
    circle.setAttribute("class", "map-node-circle");
    circle.setAttribute("fill", NODE_BASE_FILL[node.kind] ?? "#555");
    g.appendChild(circle);

    const icon = svgEl("text");
    icon.setAttribute("x", String(cx));
    icon.setAttribute("y", String(cy));
    icon.setAttribute("class", "map-node-icon");
    icon.textContent =
      NODE_ICONS[node.kind] ?? node.kind.charAt(0).toUpperCase();
    g.appendChild(icon);

    if (isSelectable && onSelectNode !== undefined) {
      const nodeId = node.id;
      const handler = () => {
        onSelectNode(nodeId);
      };
      g.addEventListener("click", handler);
      clickHandlers.push({ el: g, handler });
    }

    nodeGroup.appendChild(g);
  }

  svg.appendChild(nodeGroup);
  container.appendChild(svg);

  return () => {
    for (const { el, handler } of clickHandlers) {
      el.removeEventListener("click", handler);
    }
    svg.remove();
  };
}
