// 実績一覧画面 UI 制御
import type { Achievement, AchievementId } from "../core/types/achievement";

/**
 * 実績一覧画面を container に構築する
 *
 * @param achievements 全実績リスト
 * @param unlockedIds 解放済み実績IDリスト
 * @param onClose 閉じるボタン押下時のコールバック
 * @returns クリーンアップ関数
 */
export function renderAchievementScreen(
  container: HTMLElement,
  achievements: readonly Achievement[],
  unlockedIds: readonly AchievementId[],
  onClose: () => void,
): () => void {
  const screen = document.createElement("div");
  screen.id = "achievement-screen";

  const heading = document.createElement("h1");
  heading.textContent = "実績一覧";
  screen.appendChild(heading);

  const list = document.createElement("ul");
  list.id = "achievement-list";

  for (const achievement of achievements) {
    const isUnlocked = unlockedIds.includes(achievement.id);
    const li = document.createElement("li");
    li.className = isUnlocked ? "achievement-unlocked" : "achievement-locked";

    const nameEl = document.createElement("strong");
    nameEl.textContent = isUnlocked ? `【${achievement.name}】` : "【???】";
    li.appendChild(nameEl);

    const descEl = document.createElement("span");
    descEl.textContent = isUnlocked
      ? ` ${achievement.description}`
      : " （未解放）";
    li.appendChild(descEl);

    list.appendChild(li);
  }

  screen.appendChild(list);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.id = "achievement-close-btn";
  closeBtn.textContent = "タイトルへ戻る";
  closeBtn.addEventListener("click", onClose);
  screen.appendChild(closeBtn);

  container.appendChild(screen);

  return () => {
    closeBtn.removeEventListener("click", onClose);
    screen.remove();
  };
}
