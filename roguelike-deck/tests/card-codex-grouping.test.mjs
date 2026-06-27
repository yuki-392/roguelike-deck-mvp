import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { runnerImport } from "vite";

let cardCodex;
let cards;
let codexScreen;

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.id = "";
    this.textContent = "";
    this.type = "";
    this.style = {};
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
}

function collectText(element) {
  return [element.textContent ?? "", ...element.children.map(collectText)].join(
    "\n",
  );
}

before(async () => {
  [cardCodex, cards, codexScreen] = await Promise.all([
    runnerImport("./src/core/card-codex.ts").then((result) => result.module),
    runnerImport("./src/core/data/cards.ts").then((result) => result.module),
    runnerImport("./src/screens/codex.ts").then((result) => result.module),
  ]);
});

beforeEach(() => {
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
});

test("all generated cards have catalog metadata and are registered", () => {
  const generatedCards = [
    ...cards.createStarterDeck(),
    ...cards.createComboDeck(),
    ...cards.createRewardPool(),
  ];

  for (const card of generatedCards) {
    const catalogEntry = cards.CARD_MASTER_CATALOG.get(card.name);
    assert.ok(catalogEntry, `${card.name} is registered in the catalog`);
    assert.equal(card.no, catalogEntry.no);
    assert.equal(card.category, catalogEntry.category);
  }
});

test("catalog numbers follow the assignment table", () => {
  assert.deepEqual(cards.CARD_MASTER_CATALOG.get("攻撃"), {
    no: "attack-010",
    category: "attack",
  });
  assert.deepEqual(cards.CARD_MASTER_CATALOG.get("ルーンシールド"), {
    no: "defense-060",
    category: "defense",
  });
  assert.deepEqual(cards.CARD_MASTER_CATALOG.get("ルーン写本"), {
    no: "skill-070",
    category: "skill",
  });
  assert.deepEqual(cards.CARD_MASTER_CATALOG.get("猛毒牙"), {
    no: "evolve-040",
    category: "evolve",
  });
  assert.equal(cards.CARD_MASTER_CATALOG.size, 26);
});

test("groupDiscoveredCards returns no groups for an empty set", () => {
  assert.deepEqual(
    cardCodex.groupDiscoveredCards(new Set(), cards.CARD_MASTER_CATALOG),
    [],
  );
});

test("groupDiscoveredCards uses fixed category order and catalog number order", () => {
  const discovered = new Set([
    "猛毒牙",
    "ルーン写本",
    "防御",
    "強打",
    "攻撃",
    "未登録カード",
  ]);

  const groups = cardCodex.groupDiscoveredCards(
    discovered,
    cards.CARD_MASTER_CATALOG,
  );

  assert.deepEqual(
    groups.map((group) => group.category),
    ["attack", "defense", "skill", "evolve", "unknown"],
  );
  assert.deepEqual(groups[0].entries, [
    { no: "attack-010", name: "攻撃" },
    { no: "attack-030", name: "強打" },
  ]);
  assert.deepEqual(groups.at(-1), {
    category: "unknown",
    label: "未分類",
    entries: [{ no: "catalog-missing", name: "未登録カード" }],
  });
});

test("computeOriginalCard supplies original-only catalog metadata", async () => {
  const workshop = await runnerImport("./src/core/workshop.ts").then(
    (result) => result.module,
  );
  const [left, right] = cards.createStarterDeck();
  const original = workshop.computeOriginalCard(left, right, "original-test");

  assert.equal(original.no, "original-000");
  assert.equal(original.category, "original");
});

test("groupDiscoveredCards maps original category to unknown group", () => {
  const fakeOriginalCatalog = new Map([
    ["疑似オリジナル", { no: "original-000", category: "original" }],
    ["攻撃", { no: "attack-010", category: "attack" }],
  ]);

  const groups = cardCodex.groupDiscoveredCards(
    new Set(["疑似オリジナル", "攻撃"]),
    fakeOriginalCatalog,
  );

  const categories = groups.map((g) => g.category);
  assert.ok(categories.includes("attack"), "attack グループが存在する");
  assert.ok(!categories.includes("original"), "original グループは存在しない");

  const unknownGroup = groups.find((g) => g.category === "unknown");
  assert.ok(unknownGroup, "unknown グループが存在する");
  assert.deepEqual(unknownGroup.entries, [
    { no: "catalog-missing", name: "疑似オリジナル" },
  ]);
});

test("codex screen renders category headers and numbered entries", () => {
  const container = new FakeElement("div");
  const cleanup = codexScreen.renderCodexOverlay(
    container,
    {
      codexState: new Map(),
      acquiredOrbIds: [],
      discoveredCardNames: new Set(["防御", "攻撃", "未登録カード"]),
    },
    () => {},
  );

  const text = collectText(container);
  assert.match(text, /「攻撃」[\s\S]*attack-010: 攻撃/);
  assert.match(text, /「防御」[\s\S]*defense-010: 防御/);
  assert.match(text, /「未分類」[\s\S]*catalog-missing: 未登録カード/);
  assert.ok(text.indexOf("「防御」") < text.indexOf("「未分類」"));

  cleanup();
});
