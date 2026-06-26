import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let workshop;

before(async () => {
  const loadedWorkshop = await runnerImport("./src/core/workshop.ts");
  workshop = loadedWorkshop.module;
});

test("getUnlockedMaterializableCards returns empty when no card names are discovered", () => {
  const unlocked = workshop.getUnlockedMaterializableCards(new Set());

  assert.deepEqual(unlocked, []);
});

test("getUnlockedMaterializableCards returns only cards matching discovered names", () => {
  const unlocked = workshop.getUnlockedMaterializableCards(
    new Set(["攻撃", "防御"]),
  );

  assert.deepEqual(
    unlocked.map((card) => card.name),
    ["攻撃", "防御"],
  );
});

test("getUnlockedMaterializableCards returns all material cards when all names are discovered", () => {
  const allMaterialCards = workshop.getMaterializableCards();
  const unlocked = workshop.getUnlockedMaterializableCards(
    new Set(allMaterialCards.map((card) => card.name)),
  );

  assert.deepEqual(
    unlocked.map((card) => card.id),
    allMaterialCards.map((card) => card.id),
  );
});

test("getUnlockedMaterializableCards does not unlock by material card id", () => {
  const unlocked = workshop.getUnlockedMaterializableCards(
    new Set(["kogeki-material"]),
  );

  assert.deepEqual(unlocked, []);
});
