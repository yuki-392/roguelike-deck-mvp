import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let potions;

const rng = () => 0.5;

before(async () => {
  const [loadedBattle, loadedPotions] = await Promise.all([
    runnerImport("./src/core/battle.ts"),
    runnerImport("./src/core/data/potions.ts"),
  ]);
  battle = loadedBattle.module;
  potions = loadedPotions.module;
});

function createBattleState() {
  const state = battle.startBattle(rng);
  return { ...state, relics: [] };
}

function withPotion(state, potion) {
  return {
    ...state,
    run: { ...state.run, potions: [potion] },
  };
}

function withPotions(state, potionList) {
  return {
    ...state,
    run: { ...state.run, potions: potionList },
  };
}

// 攻撃カード（テスト用）
const attackCard = {
  id: "test-attack",
  name: "テスト攻撃",
  cost: { kind: "zero" },
  effects: [{ kind: "attack", amount: 5 }],
  rarity: "common",
  description: "",
};

// #1: 小回復ポーション使用でHP+12（最大HP上限あり）
test("小回復ポーション使用でHPが12回復する", () => {
  const potion = potions.POTION_HEAL_SMALL;
  const base = createBattleState();
  const state = withPotion(
    { ...base, player: { ...base.player, currentHp: 80 } },
    potion,
  );
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.player.currentHp, 92);
  assert.equal(result.run.potions.length, 0);
});

// #1b: 最大HPを超えない
test("小回復ポーション使用でHPが最大HPを超えない", () => {
  const potion = potions.POTION_HEAL_SMALL;
  const base = createBattleState();
  const state = withPotion(
    { ...base, player: { ...base.player, currentHp: 95 } },
    potion,
  );
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.player.currentHp, base.player.maxHp);
});

// #2: 攻撃ポーション使用でattackBonusThisTurnが2になる
test("攻撃ポーション使用でattackBonusThisTurnが2になる", () => {
  const potion = potions.POTION_ATTACK;
  const base = createBattleState();
  const state = withPotion(base, potion);
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.attackBonusThisTurn, 2);
  assert.equal(result.run.potions.length, 0);
});

// #3: endTurn後にattackBonusThisTurnが0にリセットされる
test("endTurn後にattackBonusThisTurnが0にリセットされる", () => {
  const base = createBattleState();
  const stateWithBonus = { ...base, attackBonusThisTurn: 2 };
  const result = battle.endPlayerTurn(stateWithBonus, rng);
  assert.equal(result.attackBonusThisTurn, 0);
});

// #4: 攻撃ポーション使用後、攻撃カードのダメージがボーナス2分増加する
test("攻撃ポーション使用後、攻撃カードのダメージがボーナス2分増加する", () => {
  const potion = potions.POTION_ATTACK;
  const base = createBattleState();
  const state = withPotion(
    {
      ...base,
      player: {
        ...base.player,
        hand: [attackCard],
        deck: [],
        discard: [],
        exhaust: [],
      },
      enemy: { ...base.enemy, currentHp: 100, block: 0 },
    },
    potion,
  );

  // ポーション使用（+2ボーナス）
  const afterPotion = battle.usePotion(state, 0, rng);
  assert.equal(afterPotion.attackBonusThisTurn, 2);

  // 攻撃カードプレイ（5 + 2 = 7ダメージ）
  const afterCard = battle.playCard(afterPotion, "test-attack", rng);
  assert.equal(afterCard.enemy.currentHp, 93); // 100 - 7 = 93
});

// #5: 防御ポーション使用でblock+12
test("防御ポーション使用でblock+12になる", () => {
  const potion = potions.POTION_DEFENSE;
  const base = createBattleState();
  // 初期遺物によるブロックをリセットしてから検証
  const state = withPotion(
    { ...base, player: { ...base.player, block: 0 } },
    potion,
  );
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.player.block, 12);
  assert.equal(result.run.potions.length, 0);
});

// #6: 毒瓶使用で敵にpoison 6
test("毒瓶使用で敵にpoison 6が付与される", () => {
  const potion = potions.POTION_POISON;
  const base = createBattleState();
  const state = withPotion(base, potion);
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.enemy.statuses.get("poison"), 6);
  assert.equal(result.run.potions.length, 0);
});

// #7: 火炎ポーション使用で敵に8ダメージ
test("火炎ポーション使用で敵に8ダメージ", () => {
  const potion = potions.POTION_FIRE;
  const base = createBattleState();
  const state = withPotion(
    { ...base, enemy: { ...base.enemy, currentHp: 50, block: 0 } },
    potion,
  );
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.enemy.currentHp, 42);
  assert.equal(result.run.potions.length, 0);
});

// #8: 所持上限2でbuyShopPotionしても変化しない
test("ポーション所持上限2でbuyShopPotionが無効", () => {
  const base = createBattleState();
  const shopPotion = { potion: potions.POTION_HEAL_SMALL, price: 50 };
  const state = {
    ...base,
    phase: "shop",
    run: {
      ...base.run,
      gold: 500,
      potions: [potions.POTION_ATTACK, potions.POTION_DEFENSE],
    },
    shopItems: { ...base.shopItems, potions: [shopPotion] },
  };
  const result = battle.buyShopPotion(state, 0);
  assert.equal(result.run.potions.length, 2);
  assert.equal(result.run.gold, 500);
});

// #9: 所持上限2でclaimRewardPotionしても変化しない
test("ポーション所持上限2でclaimRewardPotionが無効", () => {
  const base = createBattleState();
  const state = {
    ...base,
    phase: "reward",
    rewardPotion: potions.POTION_FIRE,
    run: {
      ...base.run,
      potions: [potions.POTION_ATTACK, potions.POTION_DEFENSE],
    },
  };
  const result = battle.claimRewardPotion(state);
  assert.equal(result.run.potions.length, 2);
  assert.notEqual(result.rewardPotion, null);
});

// #10: battleOnly=trueのポーションをmap phaseで使っても無効
test("battleOnly=trueのポーションをbattle以外で使っても無効", () => {
  const potion = potions.POTION_ATTACK;
  assert.equal(potion.battleOnly, true);
  const base = createBattleState();
  const state = withPotion({ ...base, phase: "map" }, potion);
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.run.potions.length, 1);
  assert.equal(result.attackBonusThisTurn, 0);
});

// #11: buyShopPotionでゴールド減少・ポーション追加
test("buyShopPotionでゴールドが減り、ポーションが追加される", () => {
  const base = createBattleState();
  const shopPotion = { potion: potions.POTION_HEAL_SMALL, price: 50 };
  const state = {
    ...base,
    phase: "shop",
    run: { ...base.run, gold: 200, potions: [] },
    shopItems: { ...base.shopItems, potions: [shopPotion] },
  };
  const result = battle.buyShopPotion(state, 0);
  assert.equal(result.run.gold, 150);
  assert.equal(result.run.potions.length, 1);
  assert.equal(result.run.potions[0].id, "potion_heal_small");
});

// #12: usePotionでポーションがrun.potionsから削除される
test("usePotion後にrun.potionsからポーションが削除される", () => {
  const base = createBattleState();
  const state = withPotions(base, [
    potions.POTION_HEAL_SMALL,
    potions.POTION_ATTACK,
  ]);
  const result = battle.usePotion(state, 0, rng);
  assert.equal(result.run.potions.length, 1);
  assert.equal(result.run.potions[0].id, "potion_attack");
});
