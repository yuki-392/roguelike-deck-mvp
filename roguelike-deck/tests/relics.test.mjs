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

test("relic master list contains only the four starter deck relics", () => {
  assert.deepEqual(
    relics.ALL_RELICS.map((relic) => ({
      id: relic.id,
      name: relic.name,
      deckType: relic.deckType,
      rarity: relic.rarity,
      description: relic.description,
      isStarter: relic.isStarter,
      effect: relic.effect,
    })),
    [
      {
        id: "ancient-emblem",
        name: "古びた紋章",
        deckType: "balanced",
        rarity: "uncommon",
        description: "各戦闘の1ターン目、最初に使う攻撃カードの攻撃力+2。",
        isStarter: true,
        effect: { kind: "firstTurnFirstAttackBonus", amount: 2 },
      },
      {
        id: "small-gear",
        name: "小さな歯車",
        deckType: "combo",
        rarity: "uncommon",
        description:
          "各戦闘の1ターン目、1度に2回以上攻撃する場合2回目以降の攻撃力+1。",
        isStarter: true,
        effect: { kind: "firstTurnMultiAttackFollowUpBonus", amount: 1 },
      },
      {
        id: "cracked-shield",
        name: "ひび割れた盾",
        deckType: "guardian",
        rarity: "uncommon",
        description: "ターン開始時、ブロックが0なら2ブロック。",
        isStarter: true,
        effect: { kind: "blockOnTurnStartIfEmpty", amount: 2 },
      },
      {
        id: "black-vial",
        name: "黒い小瓶",
        deckType: "erosion",
        rarity: "uncommon",
        description: "戦闘開始時、敵全体に毒2。",
        isStarter: true,
        effect: { kind: "poisonAllEnemiesOnBattleStart", stacks: 2 },
      },
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
