import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let cards;

const rng = () => 0.5;

before(async () => {
  const [loadedBattle, loadedCards] = await Promise.all([
    runnerImport("./src/core/battle.ts"),
    runnerImport("./src/core/data/cards.ts"),
  ]);
  battle = loadedBattle.module;
  cards = loadedCards.module;
});

function createBattleStateWithCard(card) {
  const state = battle.startBattle(rng);
  return {
    ...state,
    player: {
      ...state.player,
      energy: 99,
      hand: [card],
      deck: [],
      discard: [],
      exhaust: [],
    },
    enemies: [
      {
        ...state.enemies[0],
        currentHp: 999,
        maxHp: 999,
      },
    ],
  };
}

function replayDiscardedCard(state, cardId) {
  const card = state.player.discard.find(
    (candidate) => candidate.id === cardId,
  );
  assert.ok(card);
  return {
    ...state,
    phase: "battle",
    player: {
      ...state.player,
      energy: 99,
      hand: [card],
      discard: state.player.discard.filter(
        (candidate) => candidate.id !== cardId,
      ),
    },
  };
}

test("reward pool contains use-count and status-applied evolve cards", () => {
  const evolveCards = cards
    .createRewardPool()
    .filter((card) => card.isEvolvable === true);

  assert.ok(evolveCards.length >= 2);
  assert.ok(
    evolveCards.some(
      (card) =>
        card.evolveCondition.kind === "useCount" &&
        card.evolveCondition.threshold > 0,
    ),
  );
  assert.ok(
    evolveCards.some(
      (card) =>
        card.evolveCondition.kind === "statusApplied" &&
        card.evolveCondition.threshold > 0,
    ),
  );
  for (const card of evolveCards) {
    assert.ok(card.affinityTags.includes("evolve"));
    assert.equal(typeof card.evolvedCardId, "string");
  }
});

test("startRun resets evolve progress to an empty ReadonlyMap", () => {
  const first = battle.startBattle(rng);
  assert.equal(first.run.evolveProgress.size, 0);

  const changed = {
    ...first,
    run: {
      ...first.run,
      evolveProgress: new Map([["stale-card", 99]]),
    },
  };
  assert.equal(changed.run.evolveProgress.size, 1);

  const restarted = battle.startBattle(rng);
  assert.equal(restarted.run.evolveProgress.size, 0);
});

test("use-count evolve card replaces the same card exactly at threshold", () => {
  const evolveCard = cards
    .createRewardPool()
    .find(
      (card) =>
        card.isEvolvable === true && card.evolveCondition.kind === "useCount",
    );
  assert.ok(evolveCard);

  let state = createBattleStateWithCard(evolveCard);
  const threshold = evolveCard.evolveCondition.threshold;

  for (let useCount = 1; useCount < threshold; useCount += 1) {
    state = battle.playCard(state, evolveCard.id, rng);
    assert.equal(state.run.evolveProgress.get(evolveCard.id), useCount);
    const unchanged = state.player.discard.find(
      (card) => card.id === evolveCard.id,
    );
    assert.equal(unchanged?.name, evolveCard.name);
    state = replayDiscardedCard(state, evolveCard.id);
  }

  const evolved = battle.playCard(state, evolveCard.id, rng);
  const matchingCards = [
    ...evolved.player.hand,
    ...evolved.player.deck,
    ...evolved.player.discard,
    ...evolved.player.exhaust,
  ].filter((card) => card.id === evolveCard.id);

  assert.equal(matchingCards.length, 1);
  assert.equal(matchingCards[0].isEvolvable, undefined);
  assert.notEqual(matchingCards[0].name, evolveCard.name);
  assert.equal(evolved.run.evolveProgress.has(evolveCard.id), false);
});

test("status-applied evolve progress increases by matching status stacks only", () => {
  const evolveCard = cards
    .createRewardPool()
    .find(
      (card) =>
        card.isEvolvable === true &&
        card.evolveCondition.kind === "statusApplied",
    );
  assert.ok(evolveCard);

  const matchingStacks = evolveCard.effects
    .filter(
      (effect) =>
        effect.kind === "applyStatus" &&
        effect.status.kind === evolveCard.evolveCondition.status,
    )
    .reduce((total, effect) => total + effect.stacks, 0);
  assert.ok(matchingStacks > 0);

  const state = createBattleStateWithCard(evolveCard);
  const next = battle.playCard(state, evolveCard.id, rng);
  const expectedProgress =
    matchingStacks >= evolveCard.evolveCondition.threshold
      ? undefined
      : matchingStacks;

  assert.equal(next.run.evolveProgress.get(evolveCard.id), expectedProgress);
});

test("evolve progress survives entering the next battle", () => {
  const state = battle.startBattle(rng);
  const battleNode = {
    id: "evolve-progress-battle",
    floor: 1,
    x: 0,
    kind: "battle",
    nextNodeIds: [],
  };
  const prepared = {
    ...state,
    phase: "map",
    run: {
      ...state.run,
      evolveProgress: new Map([["evolve-instance", 3]]),
      map: {
        nodes: [battleNode],
        startNodeIds: [battleNode.id],
        bossNodeId: "",
      },
    },
  };

  const next = battle.selectNode(prepared, battleNode.id, rng);

  assert.equal(next.run.evolveProgress.get("evolve-instance"), 3);
  assert.equal(prepared.run.evolveProgress.get("evolve-instance"), 3);
});
