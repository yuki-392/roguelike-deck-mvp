import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { runnerImport } from "vite";

let battle;
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
  const [loadedBattle, loadedScreen] = await Promise.all([
    runnerImport("./src/core/battle.ts"),
    runnerImport("./src/screens/rest.ts"),
  ]);
  battle = loadedBattle.module;
  screenModule = loadedScreen.module;
});

beforeEach(() => {
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
});

test("rest screen does not render a do-nothing leave button", () => {
  const state = { ...battle.startBattle(() => 0), phase: "rest" };
  const container = new FakeElement("div");

  screenModule.renderRestScreen(
    container,
    {
      onSelectRest: () => {},
      onSelectUpgradeCard: () => {},
      onLeaveRest: () => {},
    },
    state,
  );

  assert.equal(findById(container, "rest-leave-btn"), null);
});

test("rest screen hides upgrade button when every card is already upgraded", () => {
  const base = battle.startBattle(() => 0);
  const state = {
    ...base,
    phase: "rest",
    player: {
      ...base.player,
      deck: base.player.deck.map((card) => ({ ...card, upgraded: true })),
    },
  };
  const container = new FakeElement("div");

  screenModule.renderRestScreen(
    container,
    {
      onSelectRest: () => {},
      onSelectUpgradeCard: () => {},
      onLeaveRest: () => {},
    },
    state,
  );

  assert.equal(findById(container, "rest-upgrade-btn"), null);
  assert.equal(findById(container, "rest-card-choice-area"), null);
});
