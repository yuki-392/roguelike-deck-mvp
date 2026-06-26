// 敵図鑑確認オーバーレイ UI
// マップ画面・工房画面どちらからでも開ける汎用オーバーレイ
import type { CodexState } from "../core/types/enemy";
import {
  ALL_ORBS,
  ENEMY_DISPLAY_NAMES,
  getOrbById,
} from "../core/data/orbData";

export interface CodexViewData {
  readonly codexState: CodexState;
  readonly acquiredOrbIds: readonly string[];
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
    "background:#1a1a2e;border:1px solid #444;padding:24px;min-width:320px;max-width:480px;border-radius:4px;";

  const title = document.createElement("h2");
  title.textContent = "敵図鑑";
  title.style.margin = "0 0 16px";
  panel.appendChild(title);

  if (ALL_ORBS.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "図鑑データがありません。";
    panel.appendChild(empty);
  } else {
    for (const orb of ALL_ORBS) {
      const entry = data.codexState.get(orb.sourceEnemyId);
      const points = entry?.points ?? 0;
      const isUnlocked = data.acquiredOrbIds.includes(orb.id);
      const enemyName =
        ENEMY_DISPLAY_NAMES[orb.sourceEnemyId] ?? orb.sourceEnemyId;
      const orbName = getOrbById(orb.id)?.name ?? orb.id;

      const entryEl = document.createElement("div");
      entryEl.style.cssText =
        "margin-bottom:16px;border-bottom:1px solid #333;padding-bottom:12px;";

      const nameEl = document.createElement("div");
      nameEl.style.fontWeight = "bold";
      nameEl.textContent = enemyName;
      entryEl.appendChild(nameEl);

      const pointsEl = document.createElement("div");
      pointsEl.style.cssText = "font-family:monospace;margin:4px 0;";
      const pct = Math.floor((points / 100) * 100);
      pointsEl.textContent = `${buildGauge(points, 100)} ${points} / 100pt (${pct}%)`;
      entryEl.appendChild(pointsEl);

      const orbEl = document.createElement("div");
      orbEl.style.color = isUnlocked ? "#f0c040" : "#888";
      orbEl.textContent = isUnlocked
        ? `${orbName}　✓ 入手済み`
        : `${orbName}　未入手`;
      entryEl.appendChild(orbEl);

      panel.appendChild(entryEl);
    }
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "閉じる";
  closeBtn.style.marginTop = "8px";
  closeBtn.addEventListener("click", onClose);
  panel.appendChild(closeBtn);

  overlay.appendChild(panel);
  container.appendChild(overlay);

  return () => {
    closeBtn.removeEventListener("click", onClose);
    overlay.remove();
  };
}
