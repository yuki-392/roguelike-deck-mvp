import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let relics;
let reward;

before(async () => {
  const [loadedRelics, loadedReward] = await Promise.all([
    runnerImport("./src/core/data/relics.ts"),
    runnerImport("./src/core/reward.ts"),
  ]);
  relics = loadedRelics.module;
  reward = loadedReward.module;
});

test("pickRelicReward returns only non-starter common or uncommon relics", () => {
  for (let i = 0; i < 20; i++) {
    const picked = reward.pickRelicReward(() => i / 20, new Set());

    assert.notEqual(picked, null);
    assert.equal(picked.isStarter, false);
    assert.ok(["normal", "uncommon"].includes(picked.rarity));
  }
});

test("pickRelicReward excludes already owned relics", () => {
  const ownedRelicIds = new Set(
    relics.ALL_RELICS.filter(
      (relic) =>
        !relic.isStarter &&
        ["normal", "uncommon"].includes(relic.rarity) &&
        relic.id !== "rusty-gear",
    ).map((relic) => relic.id),
  );

  const picked = reward.pickRelicReward(() => 0, ownedRelicIds);

  assert.equal(picked.id, "rusty-gear");
});

test("pickRelicReward returns null when the eligible pool is empty", () => {
  const ownedRelicIds = new Set(relics.ALL_RELICS.map((relic) => relic.id));

  assert.equal(reward.pickRelicReward(() => 0, ownedRelicIds), null);
});
