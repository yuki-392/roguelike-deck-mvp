import type { Potion } from "../types/potion";

export const POTION_HEAL_SMALL: Potion = {
  id: "potion_heal_small",
  name: "小回復ポーション",
  effect: { kind: "heal", amount: 12 },
  description: "HPを12回復する。",
  price: 50,
  battleOnly: false,
};

export const POTION_ATTACK: Potion = {
  id: "potion_attack",
  name: "攻撃ポーション",
  effect: { kind: "attackBonusThisTurn", amount: 2 },
  description: "このターン中、攻撃カードのダメージ+2。",
  price: 75,
  battleOnly: true,
};

export const POTION_DEFENSE: Potion = {
  id: "potion_defense",
  name: "防御ポーション",
  effect: { kind: "block", amount: 12 },
  description: "12ブロックを得る。",
  price: 50,
  battleOnly: true,
};

export const POTION_POISON: Potion = {
  id: "potion_poison",
  name: "毒瓶",
  effect: { kind: "applyPoison", stacks: 6 },
  description: "敵1体に毒6を付与する。",
  price: 75,
  battleOnly: true,
};

export const POTION_FIRE: Potion = {
  id: "potion_fire",
  name: "火炎ポーション",
  effect: { kind: "damageAllEnemies", amount: 8 },
  description: "敵全体に8ダメージを与える。",
  price: 100,
  battleOnly: true,
};

export const ALL_POTIONS: readonly Potion[] = [
  POTION_HEAL_SMALL,
  POTION_ATTACK,
  POTION_DEFENSE,
  POTION_POISON,
  POTION_FIRE,
];
