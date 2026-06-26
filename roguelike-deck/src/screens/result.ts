// リザルト画面 UI 制御
// 勝利/敗北の表示と統計情報を表示し、工房への戻るボタンを提供する
// ゲームロジックはここでは行わない
import type { GameState } from "../core/types";
import type { AchievementId } from "../core/types";
import type { RendererCallbacks } from "../renderer/types/renderer";
import { ALL_ACHIEVEMENTS } from "../core/progression";

// 開始デッキタイプの日本語ラベル
const STARTING_DECK_LABELS: Record<string, string> = {
  balanced: "均衡型",
  combo: "連撃型",
  guardian: "守護型",
  erosion: "侵蝕型",
};

/**
 * リザルト画面を container に構築する
 * - 勝利 / 敗北の表示（state.outcome === "victory" で勝利）
 * - run.stats の各値を表示
 * - 選択した開始デッキ名（run.startingDeckType を利用）
 * - 「工房へ戻る」ボタン → callbacks.onReturnToWorkshop()
 *
 * 文字列生成はこの screens/ が担当し、core/ は数値のみ保持する
 *
 * @param container 画面を挿入する DOM 要素
 * @param callbacks Renderer コールバック群
 * @param state 現在の GameState
 * @returns クリーンアップ関数（イベントリスナーを解除して DOM から削除する）
 */
export function renderResultScreen(
  container: HTMLElement,
  callbacks: RendererCallbacks,
  state: GameState,
  newAchievementIds: readonly AchievementId[] = [],
): () => void {
  const screen = document.createElement("div");
  screen.id = "result-screen-dynamic";

  // 勝利/敗北の判定（outcome フィールドで判定。HP は参照しない）
  const isVictory = state.outcome === "victory";

  // タイトル表示
  const heading = document.createElement("h1");
  heading.textContent = isVictory ? "GAME CLEAR！" : "GAME OVER";
  heading.style.color = isVictory ? "#f0c040" : "#e04040";
  heading.style.fontWeight = "bold";
  heading.style.fontSize = "2rem";
  screen.appendChild(heading);

  // サブタイトル
  const subTitle = document.createElement("p");
  subTitle.textContent = isVictory
    ? "ボスを打ち倒した！おめでとう！"
    : "力尽きてしまった...";
  screen.appendChild(subTitle);

  // 統計情報エリア
  const statsArea = document.createElement("section");
  statsArea.id = "result-stats-area";

  const statsHeading = document.createElement("h2");
  statsHeading.textContent = "ラン統計";
  statsArea.appendChild(statsHeading);

  const { stats } = state.run;
  const deckLabel =
    STARTING_DECK_LABELS[state.run.startingDeckType] ??
    state.run.startingDeckType;

  const statItems: Array<{ label: string; value: string | number }> = [
    { label: "選択デッキ", value: deckLabel },
    { label: "総与ダメージ", value: stats.totalDamageDealt },
    { label: "防いだダメージ", value: stats.totalDamageBlocked },
    { label: "オリジナルカード使用回数", value: stats.originalCardUsedCount },
    { label: "遺物発動回数", value: stats.relicEffectCount },
    { label: "獲得ゴールド", value: state.run.gold },
    { label: "到達部屋数", value: state.roomNumber },
  ];

  const statList = document.createElement("ul");
  for (const item of statItems) {
    const li = document.createElement("li");
    li.textContent = `${item.label}: ${item.value}`;
    statList.appendChild(li);
  }
  statsArea.appendChild(statList);
  screen.appendChild(statsArea);

  // 新規取得実績エリア（取得した実績がある場合のみ表示）
  if (newAchievementIds.length > 0) {
    const achievementArea = document.createElement("section");
    achievementArea.id = "result-achievement-area";

    const achievementHeading = document.createElement("h2");
    achievementHeading.textContent = "実績解放！";
    achievementArea.appendChild(achievementHeading);

    const achievementList = document.createElement("ul");
    for (const id of newAchievementIds) {
      const achievement = ALL_ACHIEVEMENTS.find((a) => a.id === id);
      if (achievement === undefined) continue;
      const li = document.createElement("li");
      li.textContent = `【${achievement.name}】${achievement.description}`;
      achievementList.appendChild(li);
    }
    achievementArea.appendChild(achievementList);
    screen.appendChild(achievementArea);
  }

  // 「工房へ戻る」ボタン
  const returnBtn = document.createElement("button");
  returnBtn.type = "button";
  returnBtn.id = "result-return-btn";
  returnBtn.textContent = "タイトルへ戻る";

  const returnHandler = () => {
    callbacks.onReturnToTitle();
  };
  returnBtn.addEventListener("click", returnHandler);

  screen.appendChild(returnBtn);
  container.appendChild(screen);

  // クリーンアップ関数
  return () => {
    returnBtn.removeEventListener("click", returnHandler);
    screen.remove();
  };
}
