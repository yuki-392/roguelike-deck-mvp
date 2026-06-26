import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let cards;
let relics;
let screenModule;

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
    this.parent.children = this.parent.children.filter((child) => child !== this);
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

function createForgeState() {
  return { ...battle.startBattle(() => 0), phase: "forge" };
}

before(async () => {
  const [loadedBattle, loadedCards, loadedRelics, loadedScreen] =
    await Promise.all([
      runnerImport("./src/core/battle.ts"),
      runnerImport("./src/core/data/cards.ts"),
      runnerImport("./src/core/data/relics.ts"),
      runnerImport("./src/screens/forge.ts"),
    ]);
  battle = loadedBattle.module;
  cards = loadedCards.module;
  relics = loadedRelics.module;
  screenModule = loadedScreen.module;
});

beforeEach(() => {
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
});

test("card forge flow selects a card, shows three effects, and confirms once", () => {
  const forgeableCard = cards
    .createRewardPool()
    .find((card) => card.cardSlot?.kind === "empty");
  assert.ok(forgeableCard);
  const state = {
    ...createForgeState(),
    player: {
      ...createForgeState().player,
      deck: [forgeableCard],
    },
  };
  const calls = [];
  const container = new FakeElement("div");

  screenModule.renderForgeScreen(
    container,
    {
      onForgeCard: (cardId, effect) => calls.push({ cardId, effect }),
      onConvertRelics: () => null,
      onCompleteForge: () => {},
    },
    state,
    () => 0,
  );

  findById(container, "forge-card-mode-btn").click();
  findById(container, `forge-card-${forgeableCard.id}`).click();

  const effectArea = findById(container, "forge-effect-list");
  assert.equal(effectArea.children.length, 3);
  effectArea.children[0].click();
  findById(container, "forge-confirm-card-btn").click();
  findById(container, "forge-confirm-card-btn").click();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].cardId, forgeableCard.id);
  assert.ok(calls[0].effect.kind);
  assert.equal(findById(container, "forge-result").style.display, "");
});

test("card forge mode reports when no empty card slots exist", () => {
  const state = {
    ...createForgeState(),
    player: { ...createForgeState().player, deck: cards.createStarterDeck() },
  };
  const container = new FakeElement("div");

  screenModule.renderForgeScreen(
    container,
    {
      onForgeCard: () => {},
      onConvertRelics: () => null,
      onCompleteForge: () => {},
    },
    state,
    () => 0,
  );
  findById(container, "forge-card-mode-btn").click();

  assert.match(
    findById(container, "forge-card-list").textContent,
    /鍛冶できるカードがありません/,
  );
});

test("relic conversion requires two materials and displays the converted relic", () => {
  const state = {
    ...createForgeState(),
    relics: [
      relics.ANCIENT_EMBLEM,
      relics.RENEWAL_CHARM,
      relics.WAR_HORN,
    ],
  };
  const container = new FakeElement("div");
  const calls = [];

  screenModule.renderForgeScreen(
    container,
    {
      onForgeCard: () => {},
      onConvertRelics: (relicIdA, relicIdB) => {
        calls.push([relicIdA, relicIdB]);
        return relics.WAR_HORN;
      },
      onCompleteForge: () => {},
    },
    state,
    () => 0,
  );

  findById(container, "forge-relic-mode-btn").click();
  const confirm = findById(container, "forge-confirm-relic-btn");
  assert.equal(confirm.disabled, true);
  assert.equal(findById(container, `forge-relic-${relics.ANCIENT_EMBLEM.id}`), null);

  findById(container, `forge-relic-${relics.RENEWAL_CHARM.id}`).click();
  assert.equal(confirm.disabled, true);
  findById(container, `forge-relic-${relics.WAR_HORN.id}`).click();
  assert.equal(confirm.disabled, false);
  confirm.click();

  assert.deepEqual(calls, [
    [relics.RENEWAL_CHARM.id, relics.WAR_HORN.id],
  ]);
  assert.match(
    findById(container, "forge-result").textContent,
    new RegExp(relics.WAR_HORN.name),
  );
});
