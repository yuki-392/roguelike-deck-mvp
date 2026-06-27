import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let codex;
let enemies;
let orbData;
let renderCodexOverlay;

const rng = () => 0.5;

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.id = "";
    this.textContent = "";
    this.type = "";
    this.style = {
      cssText: "",
      color: "",
      fontWeight: "",
      margin: "",
      marginTop: "",
    };
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
  return (
    (element.textContent ?? "") +
    element.children.map((child) => collectText(child)).join("")
  );
}

function createKillCard() {
  return {
    id: "codex-kill",
    name: "図鑑テスト攻撃",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 9999 }],
    rarity: "common",
    description: "",
  };
}

function stateWithEnemy(enemy) {
  const state = battle.startBattle(rng);
  const killCard = createKillCard();
  return {
    ...state,
    enemies: [enemy],
    selectedEnemyInstanceId: enemy.instanceId,
    player: {
      ...state.player,
      hand: [killCard],
      deck: [],
      discard: [],
      exhaust: [],
    },
  };
}

before(async () => {
  [battle, codex, enemies, orbData, { renderCodexOverlay }] = await Promise.all(
    [
      runnerImport("./src/core/battle.ts").then((result) => result.module),
      runnerImport("./src/core/codex.ts").then((result) => result.module),
      runnerImport("./src/core/data/enemies.ts").then(
        (result) => result.module,
      ),
      runnerImport("./src/core/data/orbData.ts").then(
        (result) => result.module,
      ),
      runnerImport("./src/screens/codex.ts").then((result) => result.module),
    ],
  );
});

beforeEach(() => {
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };
});

test("全8種の敵が図鑑マスターに登録される", () => {
  assert.deepEqual(
    orbData.ALL_CODEX_ENEMIES.map((enemy) => enemy.enemyId),
    [
      "slime",
      "bat",
      "rusty-rat",
      "beetle",
      "armor-knight",
      "twin-blade-hunter",
      "poison-swamp-frog",
      "crest-colossus-boss",
    ],
  );
});

test("オーブなし敵の図鑑エントリは orbId が null になる", () => {
  const state = codex.buildCodexState({}, []);
  assert.equal(state.get("bat").orbId, null);
  assert.equal(state.get("armor-knight").orbId, null);
  assert.equal(state.get("crest-colossus-boss").orbId, null);
});

test("コウモリを初めて倒すと図鑑ポイントが加算される", () => {
  const state = stateWithEnemy(enemies.createBat());
  const next = battle.playCard(state, "codex-kill", rng);
  assert.equal(next.run.codexState.get("bat").points, 20);
});

test("ボスを倒すと撃破+初遭遇ボーナスで20pt加算される", () => {
  const state = stateWithEnemy(enemies.createBossEnemy());
  const next = battle.playCard(state, "codex-kill", rng);
  assert.equal(next.run.codexState.get("crest-colossus-boss").points, 20);
});

test("オーブなし敵は100ptでも unlockOrb が状態を変更しない", () => {
  const base = battle.startBattle(rng);
  const full = codex.addCodexPoints(base, "bat", 100);
  const next = codex.unlockOrb(full, "bat");
  assert.strictEqual(next, full);
  assert.deepEqual(next.run.acquiredOrbIds, []);
  assert.equal(next.run.codexState.get("bat").isUnlocked, false);
});

test("0ptの未発見敵は図鑑画面に表示されない", () => {
  const state = battle.startBattle(rng);
  const container = new FakeElement("div");
  renderCodexOverlay(container, state.run, () => {});
  const text = collectText(container);
  assert.ok(text.includes("まだ倒した敵はいません。"));
  assert.ok(!text.includes("スライム"));
  assert.ok(!text.includes("コウモリ"));
});

test("オーブなし敵の図鑑表示にはオーブ欄がない", () => {
  const state = battle.startBattle(rng);
  const data = {
    ...state.run,
    codexState: codex.buildCodexState({ bat: 20 }, []),
  };
  const container = new FakeElement("div");
  renderCodexOverlay(container, data, () => {});
  const text = collectText(container);
  assert.ok(text.includes("コウモリ"));
  assert.ok(text.includes("20 / 100pt"));
  assert.ok(!text.includes("オーブ"));
  assert.ok(!text.includes("未入手"));
});
