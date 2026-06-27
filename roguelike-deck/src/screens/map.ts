// マップ画面 UI 制御
// ノード選択ボタンを表示し、選択を callbacks に委譲する
// ゲームロジックはここでは行わない
import type { GameState } from "../core/types";
import type { RendererCallbacks } from "../renderer/types/renderer";
import { getSelectableNodeIds, findNode } from "../core/map";
import { renderFloorMapSvg } from "../renderer/mapView";
import { renderCodexOverlay } from "./codex";

// ノード種別の日本語ラベル
const NODE_KIND_LABELS: Record<string, string> = {
  battle: "戦闘",
  rest: "休憩所",
  forge: "鍛冶所",
  shop: "ショップ",
  boss: "ボス",
  treasure: "宝箱",
  elite: "エリート",
  event: "イベント",
};

/**
 * マップ画面を container に構築する
 * - 現在選択可能なノードをボタンで表示
 * - 訪問済みノードは非活性で表示
 * - ノード選択で callbacks.onSelectNode(nodeId) を呼び出す
 *
 * @param container 画面を挿入する DOM 要素
 * @param callbacks Renderer コールバック群
 * @param state 現在の GameState
 * @returns クリーンアップ関数（イベントリスナーを解除して DOM から削除する）
 */
export function renderMapScreen(
  container: HTMLElement,
  callbacks: RendererCallbacks,
  state: GameState,
): () => void {
  const screen = document.createElement("div");
  screen.id = "map-screen-dynamic";

  const heading = document.createElement("h1");
  heading.textContent = "マップ";
  screen.appendChild(heading);

  // ゴールド表示
  const goldEl = document.createElement("p");
  goldEl.textContent = `ゴールド: ${state.run.gold}`;
  screen.appendChild(goldEl);

  // 現在の部屋情報
  const roomInfo = document.createElement("p");
  roomInfo.textContent = `現在：部屋 ${state.roomNumber} クリア済み`;
  screen.appendChild(roomInfo);

  // 選択可能なノード id を取得
  const selectableNodeIds = getSelectableNodeIds(
    state.run.map,
    state.run.currentNodeId,
  );

  // マップ全体図（SVG）
  const mapViewWrapper = document.createElement("div");
  mapViewWrapper.id = "map-view-wrapper";
  screen.appendChild(mapViewWrapper);

  const mapViewCleanup = renderFloorMapSvg(
    mapViewWrapper,
    state.run.map,
    state.run.currentNodeId,
    state.run.visitedNodeIds,
    selectableNodeIds,
    (nodeId) => {
      callbacks.onSelectNode(nodeId);
    },
  );

  const nodeArea = document.createElement("section");
  nodeArea.id = "map-node-area";

  const nodeHeading = document.createElement("h2");
  nodeHeading.textContent = "次に進む場所を選んでください";
  nodeArea.appendChild(nodeHeading);

  // クリーンアップ用にハンドラーを記録
  const handlers: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];

  if (selectableNodeIds.length === 0) {
    const noNodes = document.createElement("p");
    noNodes.textContent = "これ以上進める場所がありません。";
    nodeArea.appendChild(noNodes);
  } else {
    for (const nodeId of selectableNodeIds) {
      const node = findNode(state.run.map, nodeId);
      if (node === undefined) continue;

      const isVisited = state.run.visitedNodeIds.has(nodeId);
      const kindLabel = NODE_KIND_LABELS[node.kind] ?? node.kind;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-node-btn";
      btn.dataset["nodeId"] = nodeId;
      btn.textContent = kindLabel;
      btn.disabled = isVisited;

      if (isVisited) {
        btn.classList.add("map-node-btn--visited");
      }

      if (node.kind === "boss") {
        btn.classList.add("map-node-btn--boss");
      } else if (node.kind === "elite") {
        btn.classList.add("map-node-btn--elite");
      } else if (node.kind === "treasure") {
        btn.classList.add("map-node-btn--treasure");
      } else if (node.kind === "rest") {
        btn.classList.add("map-node-btn--rest");
      } else if (node.kind === "shop") {
        btn.classList.add("map-node-btn--shop");
      } else if (node.kind === "event") {
        btn.classList.add("map-node-btn--event");
      }

      const handler = () => {
        callbacks.onSelectNode(nodeId);
      };
      btn.addEventListener("click", handler);
      handlers.push({ btn, handler });

      nodeArea.appendChild(btn);
    }
  }

  screen.appendChild(nodeArea);

  // 図鑑ボタン
  let codexCleanup: (() => void) | null = null;
  const codexBtn = document.createElement("button");
  codexBtn.type = "button";
  codexBtn.id = "map-codex-btn";
  codexBtn.textContent = "図鑑を見る";
  const codexBtnHandler = () => {
    // 連打防止: 既存オーバーレイをクリーンアップしてから開く
    if (codexCleanup !== null) {
      codexCleanup();
      codexCleanup = null;
    }
    codexCleanup = renderCodexOverlay(container, state.run, () => {
      if (codexCleanup !== null) {
        codexCleanup();
        codexCleanup = null;
      }
    });
  };
  codexBtn.addEventListener("click", codexBtnHandler);
  screen.appendChild(codexBtn);

  container.appendChild(screen);

  // クリーンアップ関数
  return () => {
    mapViewCleanup();
    for (const { btn, handler } of handlers) {
      btn.removeEventListener("click", handler);
    }
    codexBtn.removeEventListener("click", codexBtnHandler);
    if (codexCleanup !== null) {
      codexCleanup();
      codexCleanup = null;
    }
    screen.remove();
  };
}
