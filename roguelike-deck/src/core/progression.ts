// 実績開放・進行度アンロックロジック
// DOM に一切依存しない純粋関数群
import type { Achievement, AchievementId } from "./types/achievement";

export const ALL_ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "beginner",
    name: "初心者",
    description: "ゲームを始めた。",
  },
  {
    id: "beginner-graduate",
    name: "初心者卒業",
    description: "試練レベル1をクリアした。",
  },
];

// 実績解放時にアンロックされるカードID
const ACHIEVEMENT_CARD_UNLOCKS: Readonly<
  Partial<Record<AchievementId, readonly string[]>>
> = {
  beginner: ["punch"],
};

// 実績解放時にアンロックされる遺物ID
const ACHIEVEMENT_RELIC_UNLOCKS: Readonly<
  Partial<Record<AchievementId, readonly string[]>>
> = {
  beginner: ["stone"],
};

/**
 * 指定した実績を解放したとき、新しく付与されるアンロック内容を返す。
 * すでに解放済みの場合はすべて空配列を返す。
 */
export function getAchievementUnlocks(
  unlockedAchievementIds: readonly AchievementId[],
  achievementId: AchievementId,
): {
  readonly newAchievementIds: readonly AchievementId[];
  readonly newCardIds: readonly string[];
  readonly newRelicIds: readonly string[];
} {
  if (unlockedAchievementIds.includes(achievementId)) {
    return { newAchievementIds: [], newCardIds: [], newRelicIds: [] };
  }
  return {
    newAchievementIds: [achievementId],
    newCardIds: ACHIEVEMENT_CARD_UNLOCKS[achievementId] ?? [],
    newRelicIds: ACHIEVEMENT_RELIC_UNLOCKS[achievementId] ?? [],
  };
}
