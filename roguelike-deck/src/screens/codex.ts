// 敵図鑑確認オーバーレイ UI
// マップ画面・工房画面どちらからでも開ける汎用オーバーレイ
import type { CodexState } from "../core/types/enemy";
import {
  ALL_CODEX_ENEMIES,
  getOrbById,
} from "../core/data/orbData";
import { CARD_MASTER_CATALOG } from "../core/data/cards";
import { groupDiscoveredCards } from "../core/card-codex";

export interface CodexViewData {
  readonly codexState: CodexState;
  readonly acquiredOrbIds: readonly string[];
  readonly discoveredCardNames: ReadonlySet<string>;
}

const GAUGE_WIDTH = 10;

function buildGauge(points: number, max: number): string {
  const filled = Math.round((points / max) * GAUGE_WIDTH);
  return "[" + "█".repeat(filled) + "░".repeat(GAUGE_WIDTH - filled) + "]";
}

/**
 * 図鑑オーバーレイを container に構築し、クリーンアップ関数を返す
 * onClose: 「閉じる」ボタンが押されたときのコールバック
 */
export function renderCodexOverlay(
  container: HTMLElement,
  data: CodexViewData,
  onClose: () => void,
): () => void {
  const overlay = document.createElement("div");
  overlay.id = "codex-overlay";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:1000;";

  const panel = document.createElement("div");
  panel.style.cssText =
    "background:#1a1a2e;border:1px solid #444;padding:24px;min-width:320px;max-width:560px;max-height:80vh;overflow:auto;border-radius:4px;";

  const title = document.createElement("h2");
  title.textContent = "図鑑";
  title.style.margin = "0 0 16px";
  panel.appendChild(title);

  const enemyTitle = document.createElement("h3");
  enemyTitle.textContent = "敵図鑑";
  enemyTitle.style.margin = "0 0 12px";
  panel.appendChild(enemyTitle);

  const discoveredEnemies = ALL_CODEX_ENEMIES.filter(
    (spec) => (data.codexState.get(spec.enemyId)?.points ?? 0) > 0,
  );

  if (discoveredEnemies.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "まだ倒した敵はいません。";
    empty.style.color = "#888";
    panel.appendChild(empty);
  } else {
    for (const spec of discoveredEnemies) {
      const entry = data.codexState.get(spec.enemyId);
      const points = entry?.points ?? 0;

      const entryEl = document.createElement("div");
      entryEl.style.cssText =
        "margin-bottom:16px;border-bottom:1px solid #333;padding-bottom:12px;";

      const nameEl = document.createElement("div");
      nameEl.style.fontWeight = "bold";
      nameEl.textContent = spec.displayName;
      entryEl.appendChild(nameEl);

      const pointsEl = document.createElement("div");
      pointsEl.style.cssText = "font-family:monospace;margin:4px 0;";
      const pct = Math.floor((points / 100) * 100);
      pointsEl.textContent = `${buildGauge(points, 100)} ${points} / 100pt (${pct}%)`;
      entryEl.appendChild(pointsEl);

      if (spec.orbId !== null) {
        const isUnlocked = data.acquiredOrbIds.includes(spec.orbId);
        const orbName = getOrbById(spec.orbId)?.name ?? spec.orbId;
        const orbEl = document.createElement("div");
        orbEl.style.color = isUnlocked ? "#f0c040" : "#888";
        orbEl.textContent = isUnlocked
          ? `${orbName}　✓ 入手済み`
          : `${orbName}　未入手`;
        entryEl.appendChild(orbEl);
      }

      panel.appendChild(entryEl);
    }
  }

  const cardTitle = document.createElement("h3");
  cardTitle.textContent = "カード図鑑";
  cardTitle.style.margin = "20px 0 12px";
  panel.appendChild(cardTitle);

  const cardGroups = groupDiscoveredCards(
    data.discoveredCardNames,
    CARD_MASTER_CATALOG,
  );

  if (cardGroups.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "まだ登録されたカードがありません。";
    empty.style.color = "#888";
    panel.appendChild(empty);
  } else {
    for (const group of cardGroups) {
      const groupTitle = document.createElement("h4");
      groupTitle.textContent = `「${group.label}」`;
      groupTitle.style.cssText = "margin:12px 0 8px;color:#f0c040;";
      panel.appendChild(groupTitle);

      const cardList = document.createElement("div");
      cardList.style.cssText =
        "display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;";

      for (const entry of group.entries) {
        const cardEl = document.createElement("div");
        cardEl.style.cssText =
          "border:1px solid #333;padding:8px;background:#111827;border-radius:4px;";
        cardEl.textContent = `${entry.no}: ${entry.name}`;
        cardList.appendChild(cardEl);
      }

      panel.appendChild(cardList);
    }
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "閉じる";
  closeBtn.style.marginTop = "8px";

  const handleClose = () => {
    overlay.remove();
    onClose();
  };

  closeBtn.addEventListener("click", handleClose);
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  container.appendChild(overlay);

  return () => {
    closeBtn.removeEventListener("click", handleClose);
    overlay.remove();
  };
}
