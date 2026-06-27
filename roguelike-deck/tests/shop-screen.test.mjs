import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let cards;
let screenModule;

const TEST_SHOP_RELIC = {
  id: "test-shop-relic",
  name: "テストショップ遺物",
  deckType: "balanced",
  effect: { kind: "firstTurnFirstAttackBonus", amount: 1 },
  description: "",
  rarity: "normal",
  isStarter: false,
};

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.id = "";
    this.className = "";
    this.textContent = "";
    this.type = "";
    this.disabled = false;
    this.style = { display: "" };
    this.dataset = {};
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
  }

  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, handler) {
    this.listeners.set(type, handler);
  }

  removeEventListener(type, handler) {
    if (this.listeners.get(type) === handler) this.listeners.delete(type);
  }

  remove() {
    if (this.parent === null) return;
    this.parent.children = this.parent.children.filter(
      (child) => child !== this,
    );
    this.parent = null;
  }

  click() {
    if (!this.disabled) this.listeners.get("click")?.();
  }
}

function findById(root, id) {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findById(child, id);
    if (found !== null) return found;
  }
  return null;
}

before(async () => {
  const [loadedBattle, loadedCards, loadedScreen] =
    await Promise.all([
      runnerImport("./src/core/battle.ts"),
      runnerImport("./src/core/data/cards.ts"),
      runnerImport("./src/screens/shop.ts"),
    ]);
  battle = loadedBattle.module;
  cards = loadedCards.module;
  screenModule = loadedScreen.module;
});

beforeEach(() => {
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
});

test("shop screen disables unaffordable goods and invokes each shop callback", () => {
  const card = cards.createRewardPool()[0];
  const removable = cards.createStarterDeck()[0];
  const state = {
    ...battle.startBattle(() => 0),
    phase: "shop",
    run: { ...battle.startBattle(() => 0).run, gold: 50 },
    player: {
      ...battle.startBattle(() => 0).player,
      deck: [removable],
    },
    shopItems: {
      cards: [{ card, price: 40 }],
      relics: [{ relic: TEST_SHOP_RELIC, price: 90 }],
      potions: [
        {
          potion: { id: "potion_heal_small", name: "小回復ポーション" },
          price: 50,
        },
      ],
      cardRemovalPrice: 50,
    },
  };
  const calls = [];
  const container = new FakeElement("div");

  screenModule.renderShopScreen(
    container,
    {
      onBuyShopCard: (id) => calls.push(["card", id]),
      onBuyShopRelic: (id) => calls.push(["relic", id]),
      onBuyShopPotion: (i) => calls.push(["potion", i]),
      onRemoveShopCard: (id) => calls.push(["remove", id]),
      onLeaveShop: () => calls.push(["leave"]),
    },
    state,
  );

  const cardButton = findById(container, `shop-card-${card.id}`);
  const relicButton = findById(container, `shop-relic-${TEST_SHOP_RELIC.id}`);
  const removeButton = findById(container, `shop-remove-${removable.id}`);
  assert.equal(cardButton.disabled, false);
  assert.equal(relicButton.disabled, true);
  assert.equal(removeButton.disabled, false);

  cardButton.click();
  relicButton.click();
  removeButton.click();

  assert.deepEqual(calls, [
    ["card", card.id],
    ["remove", removable.id],
  ]);
  assert.equal(findById(container, "shop-leave-btn"), null);
});

test("shop screen leaves automatically when nothing is affordable", () => {
  const card = cards.createRewardPool()[0];
  const removable = cards.createStarterDeck()[0];
  const state = {
    ...battle.startBattle(() => 0),
    phase: "shop",
    run: { ...battle.startBattle(() => 0).run, gold: 0 },
    player: {
      ...battle.startBattle(() => 0).player,
      deck: [removable],
    },
    shopItems: {
      cards: [{ card, price: 40 }],
      relics: [{ relic: TEST_SHOP_RELIC, price: 90 }],
      potions: [],
      cardRemovalPrice: 50,
    },
  };
  const calls = [];
  const container = new FakeElement("div");

  screenModule.renderShopScreen(
    container,
    {
      onBuyShopCard: () => {},
      onBuyShopRelic: () => {},
      onBuyShopPotion: () => {},
      onRemoveShopCard: () => {},
      onLeaveShop: () => calls.push("leave"),
    },
    state,
  );

  assert.deepEqual(calls, ["leave"]);
  assert.equal(findById(container, "shop-leave-btn"), null);
});
