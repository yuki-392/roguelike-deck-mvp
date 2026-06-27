import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let events;
let eventLogic;
let reward;

before(async () => {
  const [loadedBattle, loadedEvents, loadedEventLogic, loadedReward] =
    await Promise.all([
      runnerImport("./src/core/battle.ts"),
      runnerImport("./src/core/data/events.ts"),
      runnerImport("./src/core/event.ts"),
      runnerImport("./src/core/reward.ts"),
    ]);
  battle = loadedBattle.module;
  events = loadedEvents.module;
  eventLogic = loadedEventLogic.module;
  reward = loadedReward.module;
});

function createBaseState() {
  return battle.startBattle(() => 0.5);
}

function stateOnEventMap() {
  const state = createBaseState();
  return {
    ...state,
    phase: "map",
    activeEvent: null,
    run: {
      ...state.run,
      map: {
        nodes: [
          { id: "node-event", floor: 1, x: 0, kind: "event", nextNodeIds: [] },
        ],
        startNodeIds: ["node-event"],
        bossNodeId: "",
      },
      currentNodeId: "",
      visitedNodeIds: new Set(),
    },
  };
}

function stateWithRelics(relics) {
  return {
    ...createBaseState(),
    relics,
  };
}

test("selectEventDefinition selects a normal event when no chain flag is active", () => {
  const selected = eventLogic.selectEventDefinition(new Map(), () => 0);

  assert.notEqual(selected, null);
  assert.equal(
    events.ALL_NORMAL_EVENTS.some((event) => event.id === selected.id),
    true,
  );
});

test("selectEventDefinition prioritizes chain flag 2", () => {
  const selected = eventLogic.selectEventDefinition(
    new Map([["mysterious-shadow", 2]]),
    () => 0,
  );

  assert.equal(selected?.id, "mysterious-shadow-2");
});

test("selectEventDefinition prioritizes chain flag 3", () => {
  const selected = eventLogic.selectEventDefinition(
    new Map([["mysterious-shadow", 3]]),
    () => 0,
  );

  assert.equal(selected?.id, "mysterious-shadow-3");
});

test("applyEventEffects can gain and clamp gold", () => {
  const state = createBaseState();

  const gained = eventLogic.applyEventEffects(
    state,
    [{ kind: "gainGold", amount: 25 }],
    () => 0,
  );
  const lost = eventLogic.applyEventEffects(
    gained,
    [{ kind: "loseGold", amount: 999 }],
    () => 0,
  );

  assert.equal(gained.run.gold, state.run.gold + 25);
  assert.equal(lost.run.gold, 0);
});

test("applyEventEffects removes only non-starter relics", () => {
  const starter = {
    id: "starter",
    name: "Starter",
    description: "",
    isStarter: true,
    rarity: "starter",
  };
  const normal = {
    id: "normal",
    name: "Normal",
    description: "",
    isStarter: false,
    rarity: "normal",
  };
  const state = stateWithRelics([starter, normal]);

  const next = eventLogic.applyEventEffects(
    state,
    [{ kind: "loseRelic" }],
    () => 0,
  );

  assert.deepEqual(
    next.relics.map((relic) => relic.id),
    ["starter"],
  );
});

test("applyEventEffects keeps starter-only relics", () => {
  const starter = {
    id: "starter",
    name: "Starter",
    description: "",
    isStarter: true,
    rarity: "starter",
  };
  const state = stateWithRelics([starter]);

  const next = eventLogic.applyEventEffects(
    state,
    [{ kind: "loseRelic" }],
    () => 0,
  );

  assert.deepEqual(
    next.relics.map((relic) => relic.id),
    ["starter"],
  );
});

test("applyEventEffects percent damage ignores block", () => {
  const state = {
    ...createBaseState(),
    player: {
      ...createBaseState().player,
      currentHp: 100,
      maxHp: 100,
      block: 12,
    },
  };

  const next = eventLogic.applyEventEffects(
    state,
    [{ kind: "takeDamage", amount: 20, isPercent: true }],
    () => 0,
  );

  assert.equal(next.player.currentHp, 80);
  assert.equal(next.player.block, 12);
});

test("applyEventEffects applies first random outcome when rng is 0", () => {
  const state = createBaseState();

  const next = eventLogic.applyEventEffects(
    state,
    [
      {
        kind: "randomOutcome",
        outcomes: [
          { weight: 1, effects: [{ kind: "gainGold", amount: 10 }] },
          { weight: 1, effects: [{ kind: "gainGold", amount: 20 }] },
        ],
      },
    ],
    () => 0,
  );

  assert.equal(next.run.gold, state.run.gold + 10);
});

test("applyChainFlagUpdate sets and clears flags", () => {
  const base = createBaseState();
  const chainEvent = {
    id: "mysterious-shadow-1",
    title: "",
    description: "",
    choices: [],
    chainId: "mysterious-shadow",
  };
  // activeEvent に chainId を持たせてフラグをセット
  const stateWithEvent = { ...base, activeEvent: chainEvent };
  const set = eventLogic.applyChainFlagUpdate(stateWithEvent, {
    chainId: "mysterious-shadow",
    value: 2,
  });
  // クリア時も activeEvent の chainId を参照するため同じ chainEvent を維持
  const cleared = eventLogic.applyChainFlagUpdate({
    ...set,
    activeEvent: chainEvent,
  });

  assert.equal(set.run.chainEventFlags.get("mysterious-shadow"), 2);
  assert.equal(cleared.run.chainEventFlags.get("mysterious-shadow"), 0);
});

test("pickRelicReward can be restricted to rare relics", () => {
  const picked = reward.pickRelicReward(() => 0, new Set(), ["rare"]);

  assert.notEqual(picked, null);
  assert.equal(picked.rarity, "rare");
});

test("resolveEventChoice applies effects and leaveEvent returns to map", () => {
  const eventState = {
    ...stateOnEventMap(),
    phase: "event",
    activeEvent: {
      id: "test-event",
      title: "Test",
      description: "Test",
      choices: [
        {
          label: "Gold",
          effects: [{ kind: "gainGold", amount: 40 }],
          nextChainFlag: { chainId: "mysterious-shadow", value: 2 },
        },
      ],
      chainId: "mysterious-shadow",
    },
  };

  const resolved = battle.resolveEventChoice(eventState, 0, () => 0);
  const left = battle.leaveEvent(resolved);

  assert.equal(resolved.run.gold, eventState.run.gold + 40);
  assert.equal(resolved.run.chainEventFlags.get("mysterious-shadow"), 2);
  assert.equal(resolved.phase, "event");
  assert.equal(left.phase, "map");
  assert.equal(left.activeEvent, null);
});

test("selectNode enters event phase with an active event", () => {
  const state = stateOnEventMap();

  const next = battle.selectNode(state, "node-event", () => 0);

  assert.equal(next.phase, "event");
  assert.notEqual(next.activeEvent, null);
  assert.equal(next.run.currentNodeId, "node-event");
  assert.equal(next.run.visitedNodeIds.has("node-event"), true);
});

test("resolveEventForced applies forced effects and returns to map", () => {
  const eventState = {
    ...stateOnEventMap(),
    phase: "event",
    activeEvent: events.PITFALL,
  };

  const next = battle.resolveEventForced(eventState, () => 0);

  assert.equal(next.phase, "map");
  assert.equal(next.activeEvent, null);
  assert.equal(next.run.gold, eventState.run.gold + 120);
});

// HIGH: takeDamage で HP が 0 以下になったら敗北遷移する
test("resolveEventChoice transitions to defeat when takeDamage reduces HP to 0", () => {
  const base = createBaseState();
  const eventState = {
    ...base,
    phase: "event",
    activeEvent: {
      id: "lethal-event",
      title: "Lethal",
      description: "",
      choices: [
        {
          label: "受ける",
          effects: [{ kind: "takeDamage", amount: 9999, isPercent: false }],
        },
      ],
    },
    player: { ...base.player, currentHp: 1, block: 0 },
  };

  const next = battle.resolveEventChoice(eventState, 0, () => 0);

  assert.equal(next.phase, "result");
  assert.equal(next.outcome, "defeat");
});

test("resolveEventForced transitions to defeat when takeDamage reduces HP to 0", () => {
  const base = createBaseState();
  const eventState = {
    ...base,
    phase: "event",
    activeEvent: {
      id: "lethal-forced",
      title: "Lethal Forced",
      description: "",
      choices: [],
      forcedEffects: [{ kind: "takeDamage", amount: 9999, isPercent: false }],
    },
    player: { ...base.player, currentHp: 1, block: 0 },
  };

  const next = battle.resolveEventForced(eventState, () => 0);

  assert.equal(next.phase, "result");
  assert.equal(next.outcome, "defeat");
});

// MEDIUM: 非連鎖イベント完了時に他の連鎖フラグを消さない
test("applyChainFlagUpdate does not reset other chain flags when event has no chainId", () => {
  const base = createBaseState();
  const stateWithFlag = {
    ...base,
    run: {
      ...base.run,
      chainEventFlags: new Map([["mysterious-shadow", 2]]),
    },
    activeEvent: {
      id: "dark-trade-merchant",
      title: "闇取引",
      description: "",
      choices: [],
      // chainId なし（非連鎖イベント）
    },
  };

  // 非連鎖イベント完了（nextFlag なし）
  const after = eventLogic.applyChainFlagUpdate(stateWithFlag, undefined);

  // mysterious-shadow のフラグは維持されること
  assert.equal(after.run.chainEventFlags.get("mysterious-shadow"), 2);
});

// LOW: E2E 連鎖イベントフロー（shadow-1 → shadow-2 → shadow-3）
test("chain event flows through all three stages via resolveEventChoice", () => {
  // Stage 1: 謎の人影を見た → 後を追う（フラグ=2へ）
  const mapState = stateOnEventMap();
  const stage1State = {
    ...mapState,
    phase: "event",
    activeEvent: eventLogic.selectEventDefinition(new Map(), () => 0.3),
    // 謎の人影の shadow-1 を直接セット
  };
  // shadow-1 は requiredFlag がないため通常プール（ALL_NORMAL_EVENTS）に入っている
  const shadow1 = events.ALL_EVENTS.find((e) => e.id === "mysterious-shadow-1");
  const s1 = {
    ...mapState,
    phase: "event",
    activeEvent: shadow1,
  };
  const afterS1 = battle.resolveEventChoice(s1, 0, () => 0); // 後を追う（index 0）
  assert.equal(afterS1.run.chainEventFlags.get("mysterious-shadow"), 2);

  // Stage 2: 人影を再度見た → 左へ（フラグ=3へ）
  const shadow2 = eventLogic.selectEventDefinition(
    afterS1.run.chainEventFlags,
    () => 0,
  );
  assert.equal(shadow2?.id, "mysterious-shadow-2");
  const s2 = { ...afterS1, phase: "event", activeEvent: shadow2 };
  const afterS2 = battle.resolveEventChoice(s2, 1, () => 0); // 左へ（index 1）
  assert.equal(afterS2.run.chainEventFlags.get("mysterious-shadow"), 3);

  // Stage 3: 人影は伝説の商人だった（強制）→ レア遺物獲得・フラグリセット
  const shadow3 = eventLogic.selectEventDefinition(
    afterS2.run.chainEventFlags,
    () => 0,
  );
  assert.equal(shadow3?.id, "mysterious-shadow-3");
  const s3 = { ...afterS2, phase: "event", activeEvent: shadow3 };
  const afterS3 = battle.resolveEventForced(s3, () => 0);
  assert.equal(afterS3.phase, "map");
  assert.equal(afterS3.run.chainEventFlags.get("mysterious-shadow") ?? 0, 0);
  // レア遺物を獲得していること
  const hasRareRelic = afterS3.relics.some((r) => r.rarity === "rare");
  assert.equal(hasRareRelic, true);
});
