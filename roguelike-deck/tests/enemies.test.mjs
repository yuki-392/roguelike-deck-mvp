import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let enemies;

before(async () => {
  const loadedEnemies = await runnerImport("./src/core/data/enemies.ts");
  enemies = loadedEnemies.module;
});

test("crest colossus starts with 280 HP and an omen", () => {
  const boss = enemies.createBossEnemy();

  assert.equal(boss.id, "crest-colossus-boss");
  assert.equal(boss.name, "紋章の巨像");
  assert.equal(boss.maxHp, 280);
  assert.equal(boss.currentHp, 280);
  assert.equal(boss.battleTurn, 0);
  assert.deepEqual(boss.nextAction, {
    kind: "omen",
    description: "次のターン、大攻撃が来る！",
  });
});

test("crest colossus follows its turn 0 through 4 action pattern", () => {
  const boss = enemies.createBossEnemy();
  const selectAction = (turn) =>
    boss.behavior.selectAction({
      turn,
      enemyHp: boss.currentHp,
      playerHp: 100,
    });

  assert.deepEqual(selectAction(0), {
    kind: "omen",
    description: "次のターン、大攻撃が来る！",
  });
  assert.deepEqual(selectAction(1), { kind: "attack", amount: 50 });
  assert.deepEqual(selectAction(2), {
    kind: "blockAndAttack",
    blockAmount: 20,
    attackAmount: 8,
  });
  assert.deepEqual(selectAction(3), { kind: "attack", amount: 50 });
  assert.deepEqual(selectAction(4), {
    kind: "blockAndAttack",
    blockAmount: 20,
    attackAmount: 8,
  });
});

test("normal enemy factories initialize battleTurn to zero", () => {
  const factories = [
    enemies.createSlime,
    enemies.createBat,
    enemies.createRustyRat,
    enemies.createBeetle,
  ];

  for (const createEnemy of factories) {
    assert.equal(createEnemy().battleTurn, 0);
  }
});
