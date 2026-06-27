import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let relics;
let startingDecks;

const rng = () => 0.5;

before(async () => {
  const [loadedBattle, loadedRelics, loadedStartingDecks] = await Promise.all([
    runnerImport("./src/core/battle.ts"),
    runnerImport("./src/core/data/relics.ts"),
    runnerImport("./src/core/data/startingDecks.ts"),
  ]);
  battle = loadedBattle.module;
  relics = loadedRelics.module;
  startingDecks = loadedStartingDecks.module;
});

test("relic master list contains four starter relics and twelve non-starter relics", () => {
  const starterRelics = relics.ALL_RELICS.filter((r) => r.isStarter);
  const nonStarterRelics = relics.ALL_RELICS.filter((r) => !r.isStarter);
  assert.equal(starterRelics.length, 4);
  assert.equal(nonStarterRelics.length, 12);
  assert.deepEqual(
    starterRelics.map((r) => r.id),
    ["ancient-emblem", "small-gear", "cracked-shield", "black-vial"],
  );
  assert.deepEqual(
    nonStarterRelics.map((r) => r.id),
    [
      "sharp-needle",
      "thick-coat",
      "spare-battery",
      "bent-sword",
      "dry-bandage",
      "old-wallet",
      "iron-talisman",
      "merchant-bell",
      "viper-fang",
      "torn-claw",
      "rusty-gear",
      "void-shard",
    ],
  );
});

test("all starting decks point to their matching relic", () => {
  assert.deepEqual(
    startingDecks.ALL_STARTING_DECKS.map((deck) => [
      deck.type,
      deck.starterRelicId,
    ]),
    [
      ["balanced", relics.ANCIENT_EMBLEM.id],
      ["combo", relics.SMALL_GEAR.id],
      ["guardian", relics.CRACKED_SHIELD.id],
      ["erosion", relics.BLACK_VIAL.id],
    ],
  );
});

test("new starter relics are selected by their corresponding deck type", () => {
  assert.equal(
    battle.startRun(
      { startingDeckType: "guardian", originalCardId: null, trialLevel: 0 },
      null,
      rng,
    ).relics[0].id,
    relics.CRACKED_SHIELD.id,
  );
  assert.equal(
    battle.startRun(
      { startingDeckType: "erosion", originalCardId: null, trialLevel: 0 },
      null,
      rng,
    ).relics[0].id,
    relics.BLACK_VIAL.id,
  );
});
