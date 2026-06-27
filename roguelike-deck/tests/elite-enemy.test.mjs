import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let enemies;

before(async () => {
  const loadedEnemies = await runnerImport("./src/core/data/enemies.ts");
  enemies = loadedEnemies.module;
});

test("elite enemy factories create elite-tier enemies", () => {
  const armorKnight = enemies.createArmorKnight();
  const twinBladeHunter = enemies.createTwinBladeHunter();
  const poisonSwampFrog = enemies.createPoisonSwampFrog();

  assert.equal(armorKnight.id, "armor-knight");
  assert.equal(armorKnight.tier, "elite");
  assert.equal(armorKnight.maxHp, 105);
  assert.equal(twinBladeHunter.id, "twin-blade-hunter");
  assert.equal(twinBladeHunter.tier, "elite");
  assert.equal(twinBladeHunter.maxHp, 90);
  assert.equal(poisonSwampFrog.id, "poison-swamp-frog");
  assert.equal(poisonSwampFrog.tier, "elite");
  assert.equal(poisonSwampFrog.maxHp, 115);
});

test("armor knight action rotation punishes low burst damage", () => {
  const enemy = enemies.createArmorKnight();

  assert.deepEqual(enemy.behavior.selectAction({ turn: 0, enemyHp: 105, playerHp: 100 }), {
    kind: "block",
    amount: 12,
  });
  assert.deepEqual(enemy.behavior.selectAction({ turn: 1, enemyHp: 105, playerHp: 100 }), {
    kind: "attack",
    amount: 18,
  });
  assert.deepEqual(enemy.behavior.selectAction({ turn: 2, enemyHp: 105, playerHp: 100 }), {
    kind: "attack",
    amount: 30,
  });
});

test("twin blade hunter action rotation uses multi attacks and weak", () => {
  const enemy = enemies.createTwinBladeHunter();

  assert.deepEqual(enemy.behavior.selectAction({ turn: 0, enemyHp: 90, playerHp: 100 }), {
    kind: "multiAttack",
    amount: 6,
    times: 3,
  });
  assert.deepEqual(enemy.behavior.selectAction({ turn: 1, enemyHp: 90, playerHp: 100 }), {
    kind: "applyStatus",
    target: "player",
    status: { kind: "weak" },
    stacks: 1,
  });
  assert.deepEqual(enemy.behavior.selectAction({ turn: 2, enemyHp: 90, playerHp: 100 }), {
    kind: "multiAttack",
    amount: 8,
    times: 2,
  });
});

test("poison swamp frog action rotation pressures long fights", () => {
  const enemy = enemies.createPoisonSwampFrog();

  assert.deepEqual(enemy.behavior.selectAction({ turn: 0, enemyHp: 115, playerHp: 100 }), {
    kind: "applyStatus",
    target: "player",
    status: { kind: "poison" },
    stacks: 5,
  });
  assert.deepEqual(enemy.behavior.selectAction({ turn: 1, enemyHp: 115, playerHp: 100 }), {
    kind: "attack",
    amount: 10,
  });
  assert.deepEqual(enemy.behavior.selectAction({ turn: 2, enemyHp: 115, playerHp: 100 }), {
    kind: "applyStatus",
    target: "player",
    status: { kind: "poison" },
    stacks: 5,
  });
});

test("createEliteEnemyGroup always returns one elite enemy", () => {
  const group = enemies.createEliteEnemyGroup(() => 0.99);

  assert.equal(group.length, 1);
  assert.equal(group[0].tier, "elite");
});
