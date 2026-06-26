// エネミーオーブデータ定義
import type { EnemyOrb } from "../types/enemy";

export const SLIME_ORB: EnemyOrb = {
  id: "slime-orb",
  name: "スライムオーブ",
  sourceEnemyId: "slime",
  effect: { kind: "blockOnOriginalCardPlay", amount: 3 },
};

export const ALL_ORBS: readonly EnemyOrb[] = [SLIME_ORB];

// enemyId → 表示名（DOM依存なし）
export const ENEMY_DISPLAY_NAMES: Record<string, string> = {
  slime: "スライム",
};

export function getOrbById(id: string): EnemyOrb | undefined {
  return ALL_ORBS.find((orb) => orb.id === id);
}
