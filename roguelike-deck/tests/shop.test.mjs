import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let cards;
let relics;
let workshop;
let map;

const rng = () => 0;
const TEST_SHOP_RELIC = {
  id: "test-shop-relic",
  name: "テストショップ遺物",
  deckType: "balanced",
  effect: { kind: "firstTurnFirstAttackBonus", amount: 1 },
  description: "",
  rarity: "normal",
  isStarter: false,
};

before(async () => {
  const [loadedBattle, loadedCards, loadedRelics, loadedWorkshop, loadedMap] =
    await Promise.all([
      runnerImport("./src/core/battle.ts"),
      runnerImport("./src/core/data/cards.ts"),
      runnerImport("./src/core/data/relics.ts"),
      runnerImport("./src/core/workshop.ts"),
      runnerImport("./src/core/map.ts"),
    ]);
  battle = loadedBattle.module;
  cards = loadedCards.module;
  relics = loadedRelics.module;
  workshop = loadedWorkshop.module;
  map = loadedMap.module;
});

function createShopState(gold = 500) {
  const state = battle.startBattle(rng);
  return {
    ...state,
    phase: "shop",
    run: { ...state.run, gold },
  };
}

test("selectNode enters shop phase and creates affinity-weighted non-original stock", () => {
  const state = battle.startBattle(rng);
  const shopNode = { id: "shop-node", kind: "shop", nextNodeIds: [] };
  const prepared = {
    ...state,
    phase: "map",
    run: {
      ...state.run,
      map: {
        nodes: [shopNode],
        startNodeIds: [shopNode.id],
        bossNodeId: "",
      },
    },
  };

  const next = battle.selectNode(prepared, shopNode.id, rng);

  assert.equal(next.phase, "shop");
  assert.equal(next.shopItems.cards.length, 3);
  assert.equal(next.shopItems.relics.length, 0);
  assert.ok(next.shopItems.cards.every(({ card }) => card.isOriginal !== true));
});

test("buyShopCard spends gold, adds the card, removes stock, and is immutable", () => {
  const stockCard = cards.createRewardPool()[0];
  const state = createShopState();
  const prepared = {
    ...state,
    shopItems: {
      cards: [{ card: stockCard, price: 40 }],
      relics: [],
      cardRemovalPrice: 75,
    },
  };

  const next = battle.buyShopCard(prepared, stockCard.id);

  assert.equal(next.run.gold, prepared.run.gold - 40);
  assert.equal(next.player.deck.at(-1), stockCard);
  assert.equal(next.shopItems.cards.length, 0);
  assert.equal(prepared.shopItems.cards.length, 1);
});

test("buyShopRelic spends gold, adds the relic, and rejects unaffordable purchases", () => {
  const state = createShopState(100);
  const prepared = {
    ...state,
    shopItems: {
      cards: [],
      relics: [{ relic: TEST_SHOP_RELIC, price: 90 }],
      cardRemovalPrice: 75,
    },
  };

  const bought = battle.buyShopRelic(prepared, TEST_SHOP_RELIC.id);
  assert.equal(bought.run.gold, 10);
  assert.equal(bought.relics.at(-1).id, TEST_SHOP_RELIC.id);
  assert.equal(bought.shopItems.relics.length, 0);

  const poor = { ...prepared, run: { ...prepared.run, gold: 89 } };
  assert.equal(battle.buyShopRelic(poor, TEST_SHOP_RELIC.id), poor);
});

test("removeShopCard removes one non-original card permanently and charges once", () => {
  const removable = cards.createStarterDeck()[0];
  const original = workshop.computeOriginalCard(
    cards.KOGEKI_MATERIAL,
    cards.BOGYO_MATERIAL,
    "shop-original",
  );
  const state = createShopState(100);
  const prepared = {
    ...state,
    player: {
      ...state.player,
      deck: [removable, removable, original],
    },
    shopItems: {
      cards: [],
      relics: [],
      cardRemovalPrice: 75,
    },
  };

  const next = battle.removeShopCard(prepared, removable.id);
  assert.equal(next.run.gold, 25);
  assert.equal(
    next.player.deck.filter((card) => card.id === removable.id).length,
    1,
  );
  assert.equal(battle.removeShopCard(prepared, original.id), prepared);
  assert.equal(
    battle.removeShopCard(
      { ...prepared, run: { ...prepared.run, gold: 74 } },
      removable.id,
    ).player.deck.length,
    prepared.player.deck.length,
  );
});

test("shop actions are no-ops outside shop phase and leaveShop returns to map", () => {
  const state = createShopState();
  const stockCard = cards.createRewardPool()[0];
  const prepared = {
    ...state,
    shopItems: {
      cards: [{ card: stockCard, price: 1 }],
      relics: [],
      cardRemovalPrice: 1,
    },
  };

  assert.equal(
    battle.buyShopCard({ ...prepared, phase: "map" }, stockCard.id).player.deck
      .length,
    prepared.player.deck.length,
  );
  const left = battle.leaveShop(prepared);
  assert.equal(left.phase, "map");
  assert.deepEqual(left.shopItems, {
    cards: [],
    relics: [],
    potions: [],
    cardRemovalPrice: 0,
  });
});

test("generated maps can contain shop nodes while preserving the fixed boss path", () => {
  const generated = map.generateFloorMap(() => 0.9);

  assert.ok(generated.nodes.some((node) => node.kind === "shop"));
  assert.equal(
    generated.nodes.find((node) => node.id === generated.bossNodeId)?.kind,
    "boss",
  );
});
