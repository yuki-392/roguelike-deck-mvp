import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { runnerImport } from "vite";

let orbData;
let battle;

const rng = () => 0.5;

// ---- FakeElement（shop-screen.test.mjs と同パターン） ----

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.id = "";
    this.className = "";
    this.textContent = "";
    this.type = "";
    this.disabled = false;
    this.style = {
      cssText: "",
      display: "",
      color: "",
      fontWeight: "",
      margin: "",
      marginTop: "",
    };
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
    this.parent.children = this.parent.children.filter((c) => c !== this);
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

// 全テキストを再帰的に収集する
function collectText(el) {
  let text = el.textContent ?? "";
  for (const child of el.children ?? []) {
    text += collectText(child);
  }
  return text;
}

// タグ名で最初の子孫を検索する
function findByTag(root, tag) {
  if (root.tagName === tag) return root;
  for (const child of root.children ?? []) {
    const found = findByTag(child, tag);
    if (found !== null) return found;
  }
  return null;
}

before(async () => {
  [orbData, battle] = await Promise.all([
    runnerImport("./src/core/data/orbData.ts").then((m) => m.module),
    runnerImport("./src/core/battle.ts").then((m) => m.module),
  ]);
});

beforeEach(() => {
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
});

// ---- T1: ENEMY_DISPLAY_NAMES ----

test("ENEMY_DISPLAY_NAMES has slime entry", () => {
  assert.equal(orbData.ENEMY_DISPLAY_NAMES["slime"], "スライム");
});

// ---- T2: renderCodexOverlay（FakeDOM テスト）----

test("renderCodexOverlay shows codex points for slime", async () => {
  const { renderCodexOverlay } = await runnerImport(
    "./src/screens/codex.ts",
  ).then((m) => m.module);

  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
    { codexPoints: { slime: 20 }, acquiredOrbIds: [] },
  );

  const container = new FakeElement("div");
  let closed = false;
  const cleanup = renderCodexOverlay(container, state.run, () => {
    closed = true;
  });

  const overlay = findById(container, "codex-overlay");
  assert.ok(overlay !== null, "オーバーレイが存在する");

  const text = collectText(overlay);
  assert.ok(text.includes("スライム"), "敵名が表示される");
  assert.ok(text.includes("20"), "ポイントが表示される");
  assert.ok(text.includes("100"), "最大ポイントが表示される");

  // 「閉じる」ボタンで onClose が呼ばれる
  const closeBtn = findByTag(overlay, "button");
  assert.ok(closeBtn !== null, "閉じるボタンが存在する");
  closeBtn.click();
  assert.ok(closed, "onClose が呼ばれる");

  cleanup();
  assert.equal(
    findById(container, "codex-overlay"),
    null,
    "cleanup後にオーバーレイが消える",
  );
});

test("renderCodexOverlay falls back to 0pt when codexState has no entry", async () => {
  const { renderCodexOverlay } = await runnerImport(
    "./src/screens/codex.ts",
  ).then((m) => m.module);

  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
    { codexPoints: {}, acquiredOrbIds: [] },
  );

  const container = new FakeElement("div");
  const cleanup = renderCodexOverlay(container, state.run, () => {});

  const overlay = findById(container, "codex-overlay");
  assert.ok(overlay !== null);
  const text = collectText(overlay);
  assert.ok(text.includes("0"), "0ptが表示される");

  cleanup();
});

test("renderCodexOverlay shows acquired orb as unlocked", async () => {
  const { renderCodexOverlay } = await runnerImport(
    "./src/screens/codex.ts",
  ).then((m) => m.module);

  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
    { codexPoints: { slime: 100 }, acquiredOrbIds: ["slime-orb"] },
  );

  const container = new FakeElement("div");
  const cleanup = renderCodexOverlay(container, state.run, () => {});

  const overlay = findById(container, "codex-overlay");
  const text = collectText(overlay ?? container);
  assert.ok(text.includes("入手済み"), "入手済みと表示される");

  cleanup();
});

test("renderCodexOverlay shows discovered card names", async () => {
  const { renderCodexOverlay } = await runnerImport(
    "./src/screens/codex.ts",
  ).then((m) => m.module);

  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
  );
  const data = {
    ...state.run,
    discoveredCardNames: new Set(["攻撃", "防御"]),
  };

  const container = new FakeElement("div");
  const cleanup = renderCodexOverlay(container, data, () => {});

  const overlay = findById(container, "codex-overlay");
  const text = collectText(overlay ?? container);
  assert.ok(text.includes("カード図鑑"), "カード図鑑見出しが表示される");
  assert.ok(text.includes("攻撃"), "登録済みカード名が表示される");
  assert.ok(text.includes("防御"), "登録済みカード名が表示される");

  cleanup();
});

test("renderCodexOverlay shows empty card codex message", async () => {
  const { renderCodexOverlay } = await runnerImport(
    "./src/screens/codex.ts",
  ).then((m) => m.module);

  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
  );
  const container = new FakeElement("div");
  const cleanup = renderCodexOverlay(container, state.run, () => {});

  const overlay = findById(container, "codex-overlay");
  const text = collectText(overlay ?? container);
  assert.ok(text.includes("カード図鑑"), "カード図鑑見出しが表示される");
  assert.ok(
    text.includes("まだ登録されたカードがありません。"),
    "空状態メッセージが表示される",
  );

  cleanup();
});

// ---- T3: map-codex-btn の存在確認 ----

test("map screen has codex button", async () => {
  const { renderMapScreen } = await runnerImport("./src/screens/map.ts").then(
    (m) => m.module,
  );

  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
  );
  const mapState = { ...state, phase: "map" };

  const container = new FakeElement("div");
  const noop = () => {};
  const callbacks = {
    onSelectNode: noop,
    onSaveOriginalCard: noop,
    onDeleteOriginalCard: noop,
    onRenameOriginalCard: noop,
    onAttachOrb: noop,
    onDetachOrb: noop,
    onProceedToRunSetup: noop,
    onConfirmRunSetup: noop,
    onPlayCard: noop,
    onEndTurn: noop,
    onSelectRewardCard: noop,
    onSkipReward: noop,
    onUsePotion: noop,
    onClaimRewardPotion: noop,
    onSelectRest: noop,
    onSelectUpgradeCard: noop,
    onForgeCard: noop,
    onConvertRelics: () => null,
    onCompleteForge: noop,
    onBuyShopCard: noop,
    onBuyShopRelic: noop,
    onBuyShopPotion: noop,
    onRemoveShopCard: noop,
    onLeaveShop: noop,
    onSelectDiscardCard: noop,
    onReturnToWorkshop: noop,
  };

  const cleanup = renderMapScreen(container, callbacks, mapState);
  const btn = findById(container, "map-codex-btn");
  assert.ok(btn !== null, "図鑑を見るボタンが存在する");
  cleanup();
});

test("map codex button opens the combined codex including cards", async () => {
  const { renderMapScreen } = await runnerImport("./src/screens/map.ts").then(
    (m) => m.module,
  );

  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
  );
  const mapState = {
    ...state,
    phase: "map",
    run: {
      ...state.run,
      discoveredCardNames: new Set(["図鑑攻撃"]),
    },
  };

  const container = new FakeElement("div");
  const noop = () => {};
  const callbacks = {
    onSelectNode: noop,
    onSaveOriginalCard: noop,
    onDeleteOriginalCard: noop,
    onRenameOriginalCard: noop,
    onAttachOrb: noop,
    onDetachOrb: noop,
    onProceedToRunSetup: noop,
    onConfirmRunSetup: noop,
    onPlayCard: noop,
    onEndTurn: noop,
    onSelectRewardCard: noop,
    onSkipReward: noop,
    onUsePotion: noop,
    onClaimRewardPotion: noop,
    onSelectRest: noop,
    onSelectUpgradeCard: noop,
    onForgeCard: noop,
    onConvertRelics: () => null,
    onCompleteForge: noop,
    onBuyShopCard: noop,
    onBuyShopRelic: noop,
    onBuyShopPotion: noop,
    onRemoveShopCard: noop,
    onLeaveShop: noop,
    onSelectDiscardCard: noop,
    onReturnToWorkshop: noop,
  };

  const cleanup = renderMapScreen(container, callbacks, mapState);
  const btn = findById(container, "map-codex-btn");
  assert.ok(btn !== null, "図鑑を見るボタンが存在する");
  btn.click();

  const overlay = findById(container, "codex-overlay");
  const text = collectText(overlay ?? container);
  assert.ok(text.includes("カード図鑑"), "カード図鑑が表示される");
  assert.ok(text.includes("図鑑攻撃"), "登録済みカード名が表示される");

  cleanup();
});
