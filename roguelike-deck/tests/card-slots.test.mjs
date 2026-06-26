import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let cards;
let workshop;

before(async () => {
  const [loadedCards, loadedWorkshop] = await Promise.all([
    runnerImport("./src/core/data/cards.ts"),
    runnerImport("./src/core/workshop.ts"),
  ]);
  cards = loadedCards.module;
  workshop = loadedWorkshop.module;
});

test("reward pool contains multiple cards with empty forge slots", () => {
  const slottedCards = cards
    .createRewardPool()
    .filter((card) => card.cardSlot !== undefined);

  assert.ok(slottedCards.length >= 3);
  for (const card of slottedCards) {
    assert.deepEqual(card.cardSlot, { kind: "empty" });
    assert.ok(card.affinityTags.includes("forge"));
    assert.equal(card.description.includes("forge"), false);
  }
});

test("forge slots are absent from starter decks", () => {
  const starterCards = [
    ...cards.createStarterDeck(),
    ...cards.createComboDeck(),
  ];

  assert.equal(
    starterCards.some((card) => card.cardSlot !== undefined),
    false,
  );
});

test("original card enemy slots remain distinct from forge card slots", () => {
  const originalCard = workshop.computeOriginalCard(
    cards.KOGEKI_MATERIAL,
    cards.BOGYO_MATERIAL,
    "original-slot-test",
  );

  assert.deepEqual(originalCard.enemySlot, { kind: "empty" });
  assert.equal(originalCard.cardSlot, undefined);
});
