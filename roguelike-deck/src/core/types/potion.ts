// ポーション効果の種類（Discriminated Union）
export type PotionEffect =
  | { kind: "heal"; amount: number }
  | { kind: "attackBonusThisTurn"; amount: number }
  | { kind: "block"; amount: number }
  | { kind: "applyPoison"; stacks: number }
  | { kind: "damageAllEnemies"; amount: number }; // 複数敵実装時に要修正

// ポーション（消耗品アイテム）
export interface Potion {
  readonly id: string;
  readonly name: string;
  readonly effect: PotionEffect;
  readonly description: string;
  readonly price: number;
  readonly battleOnly: boolean; // true = 戦闘中のみ使用可能
}
