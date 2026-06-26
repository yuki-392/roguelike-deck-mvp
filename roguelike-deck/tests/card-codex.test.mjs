import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let cardCodex;

const rng = () => 0.5;

before(async () => {
  const [loadedBattle, loadedCardCodex] = await Promise.all([
    runnerImport("./src/core/battle.ts"),
    runnerImport("./src/core/card-codex.ts"),
  ]);
  battle = loadedBattle.module;
  cardCodex = loadedCardCodex.module;
});

function withCardInHand(state, card) {
  return {
    ...state,
    player: {
      ...state.player,
      hand: [card],
      deck: [],
      discard: [],
      exhaust: [],
    },
  };
}

test("buildDiscoveredCardNames restores a ReadonlySet from persisted names", () => {
  const discovered = cardCodex.buildDiscoveredCardNames(["攻撃", "防御", "攻撃"]);

  assert.equal(discovered.has("攻撃"), true);
  assert.equal(discovered.has("防御"), true);
  assert.equal(discovered.size, 2);
});

test("registerCardUsage adds a card name and is idempotent", () => {
  const state = battle.startBattle(rng);

  const afterFirst = cardCodex.registerCardUsage(state, "攻撃");
  const afterSecond = cardCodex.registerCardUsage(afterFirst, "攻撃");

  assert.equal(afterFirst.run.discoveredCardNames.has("攻撃"), true);
  assert.equal(afterSecond, afterFirst);
});

test("startRun restores discovered card names from persistentData", () => {
  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null, trialLevel: 0 },
    null,
    rng,
    { codexPoints: {}, acquiredOrbIds: [], discoveredCardNames: ["攻撃"] },
  );

  assert.equal(state.run.discoveredCardNames.has("攻撃"), true);
});

test("playCard registers non-original cards by card name", () => {
  const card = {
    id: "codex-attack",
    name: "図鑑攻撃",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 1 }],
    rarity: "common",
    description: "",
  };
  const state = withCardInHand(battle.startBattle(rng), card);

  const next = battle.playCard(state, card.id, rng);

  assert.equal(next.run.discoveredCardNames.has("図鑑攻撃"), true);
});

test("playCard does not register original cards", () => {
  const originalCard = {
    id: "original-codex",
    name: "自作切り札",
    cost: { kind: "zero" },
    effects: [{ kind: "block", amount: 1 }],
    rarity: "rare",
    description: "",
    isOriginal: true,
    baseCardIds: ["a", "b"],
    materials: {
      leftCard: {
        id: "a",
        name: "A",
        cost: { kind: "zero" },
        effects: [],
        rarity: "common",
        description: "",
      },
      rightCard: {
        id: "b",
        name: "B",
        cost: { kind: "zero" },
        effects: [],
        rarity: "common",
        description: "",
      },
    },
    compensation: null,
    cardSlot: { kind: "empty" },
    enemySlot: { kind: "locked" },
  };
  const state = withCardInHand(battle.startBattle(rng), originalCard);

  const next = battle.playCard(state, originalCard.id, rng);

  assert.equal(next.run.discoveredCardNames.has("自作切り札"), false);
});
