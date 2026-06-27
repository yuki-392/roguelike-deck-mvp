import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;

const rng = () => 0.5;

before(async () => {
  const loadedBattle = await runnerImport("./src/core/battle.ts");
  battle = loadedBattle.module;
});

function createBattleState() {
  const state = battle.startBattle(rng);
  return { ...state, relics: [] };
}

function withCardInHand(state, card) {
  return {
    ...state,
    player: {
      ...state.player,
      hand: [card],
      deck: [],
      discard: [],
      exhaust: [],
      energy: 3,
    },
  };
}

test("複数敵への単体攻撃カードは selectedEnemyInstanceId の敵を即時攻撃する", () => {
  const attackCard = {
    id: "targeted-attack",
    name: "対象攻撃",
    cost: { kind: "fixed", energy: 1 },
    effects: [{ kind: "attack", amount: 7 }],
    rarity: "common",
    description: "",
  };
  const base = createBattleState();
  const enemyA = {
    ...base.enemies[0],
    instanceId: "enemy-a",
    currentHp: 30,
    maxHp: 30,
  };
  const enemyB = { ...enemyA, instanceId: "enemy-b" };
  const state = withCardInHand(
    { ...base, enemies: [enemyA, enemyB], selectedEnemyInstanceId: "enemy-a" },
    attackCard,
  );

  const next = battle.playCard(state, attackCard.id, rng);

  // 対象選択ダイアログは出ずに即時攻撃（pendingTargetCardId は null のまま）
  assert.equal(next.pendingTargetCardId, null);
  // エネルギーは消費される
  assert.equal(next.player.energy, 2);
  // enemy-a（selectedEnemyInstanceId）が攻撃される
  assert.equal(next.enemies[0].currentHp, 23);
  assert.equal(next.enemies[1].currentHp, 30);
});

test("selectTarget は攻撃せず selectedEnemyInstanceId を変更するだけ", () => {
  const base = createBattleState();
  const enemyA = {
    ...base.enemies[0],
    instanceId: "enemy-a",
    currentHp: 30,
    maxHp: 30,
  };
  const enemyB = { ...enemyA, instanceId: "enemy-b" };
  const state = {
    ...base,
    enemies: [enemyA, enemyB],
    selectedEnemyInstanceId: "enemy-a",
  };

  const next = battle.selectTarget(state, "enemy-b", rng);

  assert.equal(next.selectedEnemyInstanceId, "enemy-b");
  assert.equal(next.pendingTargetCardId, null);
  // HP は変化しない
  assert.equal(next.enemies[0].currentHp, 30);
  assert.equal(next.enemies[1].currentHp, 30);
});

test("全体ダメージポーションは全ての敵にダメージを与える", async () => {
  const { module: potions } = await runnerImport("./src/core/data/potions.ts");
  const base = createBattleState();
  const enemyA = {
    ...base.enemies[0],
    instanceId: "enemy-a",
    currentHp: 30,
    maxHp: 30,
    block: 0,
  };
  const enemyB = { ...enemyA, instanceId: "enemy-b" };
  const state = {
    ...base,
    enemies: [enemyA, enemyB],
    run: { ...base.run, potions: [potions.POTION_FIRE] },
  };

  const next = battle.usePotion(state, 0, rng);

  assert.equal(next.enemies[0].currentHp, 22);
  assert.equal(next.enemies[1].currentHp, 22);
});
