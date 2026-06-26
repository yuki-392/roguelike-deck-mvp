export type AchievementId = "beginner" | "beginner-graduate";

export interface Achievement {
  readonly id: AchievementId;
  readonly name: string;
  readonly description: string;
}
