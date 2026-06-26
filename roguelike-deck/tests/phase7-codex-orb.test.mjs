import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let codex;
let battle;
let orbData;
let saveData;

const rng = () => 0.5;

before(async () => {
  const [loadedCodex, loadedBattle, loadedOrbData, loadedSaveData] =
    await Promise.all([
      runnerImport("./src/core/codex.ts"),
      runnerImport("./src/core/battle.ts"),
      runnerImport("./src/core/data/orbData.ts"),
      runnerImport("./src/save/saveData.ts"),
    ]);
  codex = loadedCodex.module;
  battle = loadedBattle.module;
  orbData = loadedOrbData.module;
  saveData = loadedSaveData.module;
});

// ---- テスト用ヘルパー ----

function startBattle() {
  return battle.startBattle(rng);
}

/** スライムと戦えるシンプルな GameState を返す */
function battleState() {
  const state = startBattle();
  // codexState にスライムエントリを追加
  const codexState = codex.buildCodexState({}, []);
  return {
    ...state,
    run: {
      ...state.run,
      codexState,
      acquiredOrbIds: [],
      encounteredEnemyIds: new Set(),
      lastBattleDamageReceived: 0,
    },
    log: [],
  };
}

function allPlayerCards(state) {
  return [
    ...state.player.deck,
    ...state.player.hand,
    ...state.player.discard,
    ...state.player.exhaust,
  ];
}

// ---- T1-T3: 型・データのスモークテスト ----

test("SLIME_ORB has the expected shape", () => {
  const orb = orbData.SLIME_ORB;
  assert.equal(orb.id, "slime-orb");
  assert.equal(orb.sourceEnemyId, "slime");
  assert.equal(orb.effect.kind, "blockOnOriginalCardPlay");
  assert.equal(orb.effect.amount, 3);
});

test("getOrbById returns SLIME_ORB for 'slime-orb'", () => {
  assert.ok(orbData.getOrbById("slime-orb") !== undefined);
  assert.equal(orbData.getOrbById("slime-orb").id, "slime-orb");
});

test("getOrbById returns undefined for unknown id", () => {
  assert.equal(orbData.getOrbById("unknown"), undefined);
});

// ---- T5: codex.ts コアロジック ----

test("buildCodexState creates entries for all orbs", () => {
  const state = codex.buildCodexState({}, []);
  assert.ok(state.get("slime") !== undefined);
  assert.equal(state.get("slime").points, 0);
  assert.equal(state.get("slime").isUnlocked, false);
});

test("buildCodexState restores points from codexPoints", () => {
  const state = codex.buildCodexState({ slime: 50 }, []);
  assert.equal(state.get("slime").points, 50);
});

test("buildCodexState marks isUnlocked when orbId is in acquiredOrbIds", () => {
  const state = codex.buildCodexState({ slime: 100 }, ["slime-orb"]);
  assert.equal(state.get("slime").isUnlocked, true);
});

test("addCodexPoints clamps at 100", () => {
  const state = battleState();
  const after = codex.addCodexPoints(state, "slime", 200);
  assert.equal(after.run.codexState.get("slime").points, 100);
});

test("addCodexPoints adds 5 points correctly", () => {
  const state = battleState();
  const after = codex.addCodexPoints(state, "slime", 5);
  assert.equal(after.run.codexState.get("slime").points, 5);
});

test("addCodexPoints is a no-op for unknown enemyId", () => {
  const state = battleState();
  const after = codex.addCodexPoints(state, "unknown-enemy", 10);
  assert.equal(after, state);
});

test("unlockOrb adds orbId to acquiredOrbIds at 100 points", () => {
  let state = battleState();
  state = codex.addCodexPoints(state, "slime", 100);
  state = codex.unlockOrb(state, "slime");
  assert.ok(state.run.acquiredOrbIds.includes("slime-orb"));
  assert.equal(state.run.codexState.get("slime").isUnlocked, true);
  assert.ok(state.log.some((l) => l.includes("slime-orb")));
});

test("unlockOrb is a no-op when points < 100", () => {
  let state = battleState();
  state = codex.addCodexPoints(state, "slime", 99);
  const before = state.run.acquiredOrbIds.length;
  state = codex.unlockOrb(state, "slime");
  assert.equal(state.run.acquiredOrbIds.length, before);
});

test("unlockOrb is a no-op when already unlocked", () => {
  let state = battleState();
  state = codex.addCodexPoints(state, "slime", 100);
  state = codex.unlockOrb(state, "slime");
  const lenAfterFirst = state.run.acquiredOrbIds.length;
  state = codex.unlockOrb(state, "slime");
  assert.equal(state.run.acquiredOrbIds.length, lenAfterFirst);
});

test("attachOrb fills the enemy slot", () => {
  const card = {
    id: "orig-1",
    name: "Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "empty" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const result = codex.attachOrb(card, "slime-orb");
  assert.equal(result.enemySlot.kind, "filled");
  assert.equal(result.enemySlot.orbId, "slime-orb");
});

test("attachOrb is a no-op when slot is locked", () => {
  const card = {
    id: "orig-1",
    name: "Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "locked" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const result = codex.attachOrb(card, "slime-orb");
  assert.equal(result.enemySlot.kind, "locked");
});

test("detachOrb empties the enemy slot", () => {
  const card = {
    id: "orig-1",
    name: "Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "filled", orbId: "slime-orb" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const result = codex.detachOrb(card);
  assert.equal(result.enemySlot.kind, "empty");
});

test("detachOrb is a no-op when slot is locked", () => {
  const card = {
    id: "orig-1",
    name: "Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "locked" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const result = codex.detachOrb(card);
  assert.equal(result.enemySlot.kind, "locked");
});

test("lockEnemySlot locks the enemy slot", () => {
  const card = {
    id: "orig-1",
    name: "Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "filled", orbId: "slime-orb" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const result = codex.lockEnemySlot(card);
  assert.equal(result.enemySlot.kind, "locked");
});

// ---- T6: battle.ts オーブ効果・図鑑ポイント ----

test("playing an original card with slime orb grants 3 block", () => {
  const orbCard = {
    id: "orig-orb",
    name: "Orb Card",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "filled", orbId: "slime-orb" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [{ kind: "block", amount: 5 }],
    rarity: "common",
    description: "",
  };
  let state = battleState();
  state = {
    ...state,
    player: {
      ...state.player,
      hand: [orbCard],
      deck: [],
      discard: [],
    },
  };
  const before = state.player.block;
  const after = battle.playCard(state, "orig-orb", rng);
  // 5 ブロック（カード効果）+ 3 ブロック（オーブ効果）= 8
  assert.equal(after.player.block, before + 5 + 3);
  assert.ok(after.log.some((l) => l.includes("スライムオーブ")));
});

test("playing an original card without orb does not grant extra block", () => {
  const noOrbCard = {
    id: "orig-no-orb",
    name: "No Orb Card",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "locked" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [{ kind: "block", amount: 5 }],
    rarity: "common",
    description: "",
  };
  let state = battleState();
  state = {
    ...state,
    player: {
      ...state.player,
      hand: [noOrbCard],
      deck: [],
      discard: [],
    },
  };
  const before = state.player.block;
  const after = battle.playCard(state, "orig-no-orb", rng);
  assert.equal(after.player.block, before + 5);
});

test("startRun locks the original card enemy slot", () => {
  const originalCard = {
    id: "orig-lock",
    name: "Lock Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "filled", orbId: "slime-orb" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
    upgraded: false,
    exhaust: false,
  };
  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: "orig-lock" },
    originalCard,
    rng,
  );
  const allCards = allPlayerCards(state);
  const inDeck = allCards.find((c) => c.id === "orig-lock");
  const attackCards = allCards.filter((card) => card.name === "攻撃");

  assert.equal(allCards.length, 10);
  assert.equal(attackCards.length, 4);
  assert.ok(inDeck !== undefined, "original card should be in deck");
  assert.equal(inDeck.enemySlot.kind, "locked");
});

test("startRun adds an extra Attack card when no original card is brought", () => {
  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null, trialLevel: 0 },
    null,
    rng,
  );
  const allCards = allPlayerCards(state);
  const attackCards = allCards.filter((card) => card.name === "攻撃");

  assert.equal(allCards.length, 10);
  assert.equal(attackCards.length, 5);
});

test("startRun adds Attack as fallback for combo deck too", () => {
  const state = battle.startRun(
    { startingDeckType: "combo", originalCardId: null, trialLevel: 0 },
    null,
    rng,
  );
  const allCards = allPlayerCards(state);
  const attackCards = allCards.filter((card) => card.name === "攻撃");

  assert.equal(allCards.length, 10);
  assert.equal(attackCards.length, 1);
});

test("startRun initializes codexState with slime entry", () => {
  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
  );
  assert.ok(state.run.codexState.get("slime") !== undefined);
});

test("startRun restores codexPoints from persistentData", () => {
  const state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
    { codexPoints: { slime: 75 }, acquiredOrbIds: [] },
  );
  assert.equal(state.run.codexState.get("slime").points, 75);
});

// ---- 初遭遇ボーナス E2E テスト ----

test("first encounter gives +10 bonus, second encounter does not", () => {
  // ラン開始（スライムとの初バトル）
  let state = battle.startRun(
    { startingDeckType: "balanced", originalCardId: null },
    null,
    rng,
  );
  // encounteredEnemyIds は空（まだ撃破していない）
  assert.equal(state.run.encounteredEnemyIds.size, 0);

  // スライムを1撃で倒す攻撃カードを手札に
  const killCard = {
    id: "kill",
    name: "Kill",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 9999 }],
    rarity: "common",
    description: "",
  };
  state = {
    ...state,
    player: { ...state.player, hand: [killCard], deck: [], discard: [] },
  };

  // 初遭遇でスライムを撃破
  const afterFirst = battle.playCard(state, "kill", rng);
  // 撃破ポイント(+10) + 初遭遇ボーナス(+10) = 20
  assert.equal(afterFirst.run.codexState.get("slime").points, 20);
  // encounteredEnemyIds に slime が追加されているはず
  assert.ok(afterFirst.run.encounteredEnemyIds.has("slime"));

  // 2戦目：encounteredEnemyIds に既に slime がいる状態でリセット
  const state2 = {
    ...state,
    run: {
      ...state.run,
      codexState: afterFirst.run.codexState,
      encounteredEnemyIds: afterFirst.run.encounteredEnemyIds,
    },
    player: { ...state.player, hand: [killCard], deck: [], discard: [] },
  };
  const afterSecond = battle.playCard(state2, "kill", rng);
  // 撃破ポイント(+10) のみ = 20+10 = 30（初遭遇+10 なし）
  assert.equal(afterSecond.run.codexState.get("slime").points, 30);
});

// ---- T3: saveData.ts オーブ装着ヘルパー ----

test("attachOrbToSavedCard fills the enemySlot of the target card", () => {
  const card = {
    id: "orig-1",
    name: "Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "empty" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const data = {
    savedOriginalCards: [card],
    acquiredOrbIds: ["slime-orb"],
    codexPoints: {},
  };
  const result = saveData.attachOrbToSavedCard(data, "orig-1", "slime-orb");
  assert.equal(result.savedOriginalCards[0].enemySlot.kind, "filled");
  assert.equal(result.savedOriginalCards[0].enemySlot.orbId, "slime-orb");
});

test("attachOrbToSavedCard does not mutate other cards", () => {
  const cardA = {
    id: "orig-1",
    name: "A",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "empty" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const cardB = { ...cardA, id: "orig-2", name: "B" };
  const data = {
    savedOriginalCards: [cardA, cardB],
    acquiredOrbIds: ["slime-orb"],
    codexPoints: {},
  };
  const result = saveData.attachOrbToSavedCard(data, "orig-1", "slime-orb");
  assert.equal(result.savedOriginalCards[1].enemySlot.kind, "empty");
});

test("detachOrbFromSavedCard empties the enemySlot of the target card", () => {
  const card = {
    id: "orig-1",
    name: "Test",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "filled", orbId: "slime-orb" },
    compensation: null,
    cost: { kind: "fixed", energy: 1 },
    effects: [],
    rarity: "common",
    description: "",
  };
  const data = {
    savedOriginalCards: [card],
    acquiredOrbIds: ["slime-orb"],
    codexPoints: {},
  };
  const result = saveData.detachOrbFromSavedCard(data, "orig-1");
  assert.equal(result.savedOriginalCards[0].enemySlot.kind, "empty");
});
