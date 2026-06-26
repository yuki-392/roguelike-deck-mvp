import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let cards;
let reward;

before(async () => {
  const [loadedCards, loadedReward] = await Promise.all([
    runnerImport("./src/core/data/cards.ts"),
    runnerImport("./src/core/reward.ts"),
  ]);
  cards = loadedCards.module;
  reward = loadedReward.module;
});

function createCard(id, affinityTags) {
  return {
    id,
    name: id,
    cost: { kind: "zero" },
    effects: [],
    rarity: "common",
    description: "表示用説明",
    affinityTags,
  };
}

test("balanced rewards prefer attack and defense affinities", () => {
  assert.equal(reward.getRewardWeight(createCard("attack", ["attack"]), "balanced"), 2);
  assert.equal(
    reward.getRewardWeight(createCard("defense", ["defense"]), "balanced"),
    2,
  );
  assert.equal(reward.getRewardWeight(createCard("combo", ["combo"]), "balanced"), 1);
});

test("combo rewards prefer combo and draw affinities", () => {
  assert.equal(reward.getRewardWeight(createCard("combo", ["combo"]), "combo"), 3);
  assert.equal(reward.getRewardWeight(createCard("draw", ["draw"]), "combo"), 2);
  assert.equal(reward.getRewardWeight(createCard("defense", ["defense"]), "combo"), 1);
});

test("multiple preferred tags use the strongest weight instead of multiplying", () => {
  const hybrid = createCard("hybrid", ["combo", "draw"]);

  assert.equal(reward.getRewardWeight(hybrid, "combo"), 3);
});

test("cards without affinity metadata keep the neutral weight", () => {
  assert.equal(reward.getRewardWeight(createCard("neutral", undefined), "balanced"), 1);
});

test("weighted reward pool is immutable and represents higher weights as extra entries", () => {
  const attack = createCard("attack", ["attack"]);
  const neutral = createCard("neutral", undefined);
  const pool = Object.freeze([attack, neutral]);

  const weighted = reward.createWeightedRewardPool(pool, "balanced");

  assert.deepEqual(
    weighted.map((card) => card.id),
    ["attack", "attack", "neutral"],
  );
  assert.deepEqual(pool, [attack, neutral]);
});

test("starter decks and reward cards have internal affinity tags without changing descriptions", () => {
  const allCards = [
    ...cards.createStarterDeck(),
    ...cards.createComboDeck(),
    ...cards.createRewardPool(),
  ];

  assert.ok(allCards.length > 0);
  for (const card of allCards) {
    assert.ok(Array.isArray(card.affinityTags));
    assert.ok(card.affinityTags.length > 0);
    for (const tag of card.affinityTags) {
      assert.equal(card.description.includes(tag), false);
    }
  }

  const poisonCard = allCards.find((card) => card.name === "毒針");
  const lacerationCard = allCards.find((card) => card.name === "鎧砕き");
  const comboCard = allCards.find((card) => card.name === "二連攻撃");

  assert.ok(poisonCard.affinityTags.includes("poison"));
  assert.ok(lacerationCard.affinityTags.includes("laceration"));
  assert.ok(comboCard.affinityTags.includes("combo"));
});
