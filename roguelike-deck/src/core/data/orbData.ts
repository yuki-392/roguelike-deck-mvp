// エネミーオーブデータ定義
import type { EnemyOrb } from "../types/enemy";

export const SLIME_ORB: EnemyOrb = {
  id: "slime-orb",
  name: "スライムオーブ",
  sourceEnemyId: "slime",
  effect: { kind: "blockOnOriginalCardPlay", amount: 3 },
};

export const ALL_ORBS: readonly EnemyOrb[] = [SLIME_ORB];

export interface EnemyCodexSpec {
  readonly enemyId: string;
  readonly displayName: string;
  readonly orbId: string | null;
}

export const ALL_CODEX_ENEMIES: readonly EnemyCodexSpec[] = [
  { enemyId: "slime", displayName: "スライム", orbId: "slime-orb" },
  { enemyId: "bat", displayName: "コウモリ", orbId: null },
  { enemyId: "rusty-rat", displayName: "錆びネズミ", orbId: null },
  { enemyId: "beetle", displayName: "甲殻虫", orbId: null },
  { enemyId: "armor-knight", displayName: "甲殻騎士", orbId: null },
  { enemyId: "twin-blade-hunter", displayName: "双刃の狩人", orbId: null },
  { enemyId: "poison-swamp-frog", displayName: "毒沼の大蛙", orbId: null },
  {
    enemyId: "crest-colossus-boss",
    displayName: "紋章の巨像",
    orbId: null,
  },
];

// enemyId → 表示名（DOM依存なし）
export const ENEMY_DISPLAY_NAMES: Record<string, string> = {
  ...Object.fromEntries(
    ALL_CODEX_ENEMIES.map((enemy) => [enemy.enemyId, enemy.displayName]),
  ),
};

export function getOrbById(id: string): EnemyOrb | undefined {
  return ALL_ORBS.find((orb) => orb.id === id);
}
