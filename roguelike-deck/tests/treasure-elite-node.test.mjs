import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;

before(async () => {
  const loadedBattle = await runnerImport("./src/core/battle.ts");
  battle = loadedBattle.module;
});

function stateOnMapWithNode(kind) {
  const state = battle.startBattle(() => 0.5);
  return {
    ...state,
    phase: "map",
    run: {
      ...state.run,
      map: {
        nodes: [{ id: `node-${kind}`, floor: 1, x: 0, kind, nextNodeIds: [] }],
        startNodeIds: [`node-${kind}`],
        bossNodeId: "",
      },
      currentNodeId: "",
      visitedNodeIds: new Set(),
    },
  };
}

test("selectNode enters treasure phase with a relic reward", () => {
  const state = stateOnMapWithNode("treasure");

  const next = battle.selectNode(state, "node-treasure", () => 0);

  assert.equal(next.phase, "treasure");
  assert.notEqual(next.rewardRelic, null);
  assert.equal(next.run.currentNodeId, "node-treasure");
  assert.equal(next.run.visitedNodeIds.has("node-treasure"), true);
});

test("selectNode starts an elite battle with elite enemies", () => {
  const state = stateOnMapWithNode("elite");

  const next = battle.selectNode(state, "node-elite", () => 0.5);

  assert.equal(next.phase, "battle");
  assert.equal(next.enemies.length, 1);
  assert.equal(next.enemies[0].tier, "elite");
});

test("claimRewardRelic adds reward relic and clears the reward", () => {
  const treasureState = battle.selectNode(
    stateOnMapWithNode("treasure"),
    "node-treasure",
    () => 0,
  );
  const rewardRelic = treasureState.rewardRelic;

  const next = battle.claimRewardRelic(treasureState);

  assert.equal(next.phase, "map");
  assert.equal(next.rewardRelic, null);
  assert.equal(
    next.relics.some((relic) => relic.id === rewardRelic.id),
    true,
  );
});

test("card reward selection keeps the reward screen open until relic is claimed", () => {
  const treasureState = battle.selectNode(
    stateOnMapWithNode("treasure"),
    "node-treasure",
    () => 0,
  );
  const rewardCard = {
    id: "reward-card",
    name: "Reward Card",
    cost: { kind: "zero" },
    effects: [],
    rarity: "common",
    description: "",
  };
  const rewardState = {
    ...treasureState,
    phase: "reward",
    rewardCandidates: [rewardCard],
  };

  const afterCard = battle.selectRewardCard(rewardState, rewardCard.id);
  const afterRelic = battle.claimRewardRelic(afterCard);

  assert.equal(afterCard.phase, "reward");
  assert.notEqual(afterCard.rewardRelic, null);
  assert.equal(afterRelic.phase, "map");
  assert.equal(afterRelic.rewardRelic, null);
});
