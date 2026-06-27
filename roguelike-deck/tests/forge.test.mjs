import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let cards;
let forge;
let relics;
let workshop;

const rng = () => 0;

const TEST_NORMAL_RELIC = {
  id: "test-normal-relic",
  name: "テスト通常遺物",
  deckType: "balanced",
  effect: { kind: "firstTurnFirstAttackBonus", amount: 1 },
  description: "",
  rarity: "normal",
  isStarter: false,
};

const TEST_UNCOMMON_RELIC = {
  id: "test-uncommon-relic",
  name: "テストアンコモン遺物",
  deckType: "combo",
  effect: { kind: "firstTurnMultiAttackFollowUpBonus", amount: 1 },
  description: "",
  rarity: "uncommon",
  isStarter: false,
};

before(async () => {
  const [loadedBattle, loadedCards, loadedForge, loadedRelics, loadedWorkshop] =
    await Promise.all([
      runnerImport("./src/core/battle.ts"),
      runnerImport("./src/core/data/cards.ts"),
      runnerImport("./src/core/forge.ts"),
      runnerImport("./src/core/data/relics.ts"),
      runnerImport("./src/core/workshop.ts"),
    ]);
  battle = loadedBattle.module;
  cards = loadedCards.module;
  forge = loadedForge.module;
  relics = loadedRelics.module;
  workshop = loadedWorkshop.module;
});

function createForgeState() {
  return { ...battle.startBattle(rng), phase: "forge" };
}

test("getForgeableCards returns only non-original cards with empty slots", () => {
  const [emptySlotCard, secondEmptySlotCard] = cards
    .createRewardPool()
    .filter((card) => card.cardSlot?.kind === "empty");
  assert.ok(emptySlotCard);
  assert.ok(secondEmptySlotCard);

  const filledSlotCard = {
    ...secondEmptySlotCard,
    id: "filled-slot",
    cardSlot: { kind: "filled", effect: { kind: "retain" } },
  };
  const noSlotCard = cards.createStarterDeck()[0];
  const originalCard = {
    ...workshop.computeOriginalCard(
      cards.KOGEKI_MATERIAL,
      cards.BOGYO_MATERIAL,
      "forge-original",
    ),
    cardSlot: { kind: "empty" },
  };
  const state = createForgeState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      deck: [emptySlotCard, filledSlotCard, noSlotCard, originalCard],
    },
  };

  assert.deepEqual(
    forge.getForgeableCards(prepared).map((card) => card.id),
    [emptySlotCard.id],
  );
});

test("getForgeEffectCandidates returns three unique effects suited to card effects", () => {
  const slottedCards = cards
    .createRewardPool()
    .filter((card) => card.cardSlot?.kind === "empty");
  const attackCard = slottedCards.find((card) =>
    card.effects.some((effect) => effect.kind === "attack"),
  );
  const blockCard = slottedCards.find((card) =>
    card.effects.some((effect) => effect.kind === "block"),
  );
  const utilityCard = slottedCards.find((card) =>
    card.effects.every(
      (effect) => effect.kind !== "attack" && effect.kind !== "block",
    ),
  );
  assert.ok(attackCard);
  assert.ok(blockCard);
  assert.ok(utilityCard);

  const attackEffects = forge.getForgeEffectCandidates(attackCard, rng);
  const blockEffects = forge.getForgeEffectCandidates(blockCard, rng);
  const utilityEffects = forge.getForgeEffectCandidates(utilityCard, rng);

  for (const effects of [attackEffects, blockEffects, utilityEffects]) {
    assert.equal(effects.length, 3);
    assert.equal(new Set(effects.map((effect) => effect.kind)).size, 3);
  }
  assert.ok(attackEffects.some((effect) => effect.kind === "poisonOnAttack"));
  assert.ok(blockEffects.some((effect) => effect.kind === "reflectOnBlock"));
  assert.ok(utilityEffects.some((effect) => effect.kind === "retain"));
});

test("applyForge fills exactly one matching card slot without mutating input", () => {
  const target = cards
    .createRewardPool()
    .find((card) => card.cardSlot?.kind === "empty");
  assert.ok(target);
  const duplicate = { ...target };
  const state = createForgeState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      deck: [target, duplicate],
    },
  };
  const effect = { kind: "healOnUse", amount: 2 };

  const next = forge.applyForge(prepared, target.id, effect);

  assert.deepEqual(next.player.deck[0].cardSlot, {
    kind: "filled",
    effect,
  });
  assert.deepEqual(next.player.deck[1].cardSlot, { kind: "empty" });
  assert.deepEqual(prepared.player.deck[0].cardSlot, { kind: "empty" });
  assert.equal(next.phase, "map");
});

test("applyForge is a no-op outside forge phase or for invalid targets", () => {
  const target = cards
    .createRewardPool()
    .find((card) => card.cardSlot?.kind === "empty");
  assert.ok(target);
  const state = createForgeState();
  const prepared = {
    ...state,
    player: { ...state.player, deck: [target] },
  };

  assert.equal(
    forge.applyForge({ ...prepared, phase: "map" }, target.id, {
      kind: "retain",
    }).player.deck[0].cardSlot.kind,
    "empty",
  );
  assert.equal(
    forge.applyForge(prepared, "missing", { kind: "retain" }),
    prepared,
  );
});

test("getConvertibleRelics excludes starter relics", () => {
  const state = createForgeState();
  const prepared = {
    ...state,
    relics: [
      relics.ANCIENT_EMBLEM,
      relics.SMALL_GEAR,
      TEST_NORMAL_RELIC,
      TEST_UNCOMMON_RELIC,
    ],
  };

  assert.deepEqual(
    forge.getConvertibleRelics(prepared).map((relic) => relic.id),
    [TEST_NORMAL_RELIC.id, TEST_UNCOMMON_RELIC.id],
  );
});

test("relic conversion result returns a non-starter relic from ALL_RELICS", () => {
  const normalA = { ...TEST_NORMAL_RELIC, id: "normal-a" };
  const normalB = { ...TEST_NORMAL_RELIC, id: "normal-b" };

  // normal + normal → uncommon。ALL_RELICS にアンコモン非スターターが存在するため成功する
  const result = forge.getRelicConversionResult(normalA, normalB, rng);
  assert.equal(result.isStarter, false);
  assert.equal(result.rarity, "uncommon");
});

test("applyRelicConversion consumes two relics and adds the converted relic", () => {
  const normalA = { ...TEST_NORMAL_RELIC, id: "normal-a" };
  const normalB = { ...TEST_NORMAL_RELIC, id: "normal-b" };
  const state = createForgeState();
  const prepared = {
    ...state,
    relics: [relics.ANCIENT_EMBLEM, normalA, normalB],
  };

  const next = forge.applyRelicConversion(
    prepared,
    normalA.id,
    normalB.id,
    rng,
  );

  // 2枚消費して1枚追加 → 合計2枚（古びた紋章 + 変換結果）
  assert.equal(next.relics.length, 2);
  assert.ok(next.relics.some((r) => r.id === relics.ANCIENT_EMBLEM.id));
  assert.ok(next.relics.every((r) => r.id !== normalA.id));
  assert.ok(next.relics.every((r) => r.id !== normalB.id));
});

test("only starter relics leave relic conversion unavailable", () => {
  const state = createForgeState();
  const starterRelicsOnly = relics.ALL_RELICS.filter((r) => r.isStarter);
  const prepared = {
    ...state,
    relics: starterRelicsOnly,
  };

  assert.deepEqual(forge.getConvertibleRelics(prepared), []);
});

test("applyRelicConversion rejects starter, duplicate, and missing materials", () => {
  const state = createForgeState();
  const prepared = {
    ...state,
    relics: [relics.ANCIENT_EMBLEM, TEST_NORMAL_RELIC, TEST_UNCOMMON_RELIC],
  };

  assert.equal(
    forge.applyRelicConversion(
      prepared,
      relics.ANCIENT_EMBLEM.id,
      TEST_NORMAL_RELIC.id,
      rng,
    ),
    prepared,
  );
  assert.equal(
    forge.applyRelicConversion(
      prepared,
      TEST_NORMAL_RELIC.id,
      TEST_NORMAL_RELIC.id,
      rng,
    ),
    prepared,
  );
  assert.equal(
    forge.applyRelicConversion(prepared, TEST_NORMAL_RELIC.id, "missing", rng),
    prepared,
  );
});

test("selectNode enters forge phase and preserves the run deck", () => {
  const state = battle.startBattle(rng);
  const forgeNode = {
    id: "forge-node",
    floor: 1,
    x: 0,
    kind: "forge",
    nextNodeIds: [],
  };
  const prepared = {
    ...state,
    phase: "map",
    run: {
      ...state.run,
      map: {
        nodes: [forgeNode],
        startNodeIds: [forgeNode.id],
        bossNodeId: "",
      },
    },
  };

  const next = battle.selectNode(prepared, forgeNode.id, rng);

  assert.equal(next.phase, "forge");
  assert.equal(next.run.currentNodeId, forgeNode.id);
  assert.equal(next.run.visitedNodeIds.has(forgeNode.id), true);
  assert.deepEqual(next.player, prepared.player);
});
