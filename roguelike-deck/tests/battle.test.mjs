import assert from "node:assert/strict";
import { before, test } from "node:test";
import { runnerImport } from "vite";

let battle;
let enemies;
let relics;

const rng = () => 0.5;

before(async () => {
  const [loadedBattle, loadedEnemies, loadedRelics] = await Promise.all([
    runnerImport("./src/core/battle.ts"),
    runnerImport("./src/core/data/enemies.ts"),
    runnerImport("./src/core/data/relics.ts"),
  ]);
  battle = loadedBattle.module;
  enemies = loadedEnemies.module;
  relics = loadedRelics.module;
});

function createBattleState() {
  const state = battle.startBattle(rng);
  return { ...state, relics: [] };
}

function withCardInHand(state, card) {
  return {
    ...state,
    player: {
      ...state.player,
      hand: [card],
      deck: [],
      discard: [],
      exhaust: [],
    },
  };
}

test("run starts with 100 gold", () => {
  const state = battle.startBattle(rng);

  assert.equal(state.run.gold, 100);
});

test("player attack applies strength, weak, and target vulnerable modifiers", () => {
  const attackCard = {
    id: "status-attack",
    name: "Status Attack",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 8 }],
    rarity: "common",
    description: "",
  };
  const state = withCardInHand(createBattleState(), attackCard);
  const prepared = {
    ...state,
    player: {
      ...state.player,
      statuses: new Map([
        ["strength", 2],
        ["weak", 1],
      ]),
    },
    enemies: [
      {
        ...state.enemies[0],
        currentHp: 50,
        maxHp: 50,
        block: 0,
        statuses: new Map([["vulnerable", 1]]),
      },
    ],
  };

  const next = battle.playCard(prepared, attackCard.id, rng);

  assert.equal(next.enemies[0].currentHp, 39);
});

test("enemy attack applies strength, weak, and player vulnerable modifiers", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      currentHp: 50,
      maxHp: 50,
      block: 0,
      hand: [],
      deck: [],
      statuses: new Map([["vulnerable", 1]]),
    },
    enemies: [
      {
        ...state.enemies[0],
        statuses: new Map([
          ["strength", 2],
          ["weak", 1],
        ]),
        nextAction: { kind: "attack", amount: 8 },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.player.currentHp, 39);
});

test("damage modifiers round down and modified damage is absorbed by block", () => {
  const attackCard = {
    id: "weak-attack",
    name: "Weak Attack",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 1 }],
    rarity: "common",
    description: "",
  };
  const state = withCardInHand(createBattleState(), attackCard);
  const prepared = {
    ...state,
    player: {
      ...state.player,
      statuses: new Map([["weak", 1]]),
    },
    enemies: [
      {
        ...state.enemies[0],
        currentHp: 50,
        maxHp: 50,
        block: 3,
        statuses: new Map(),
      },
    ],
  };

  const next = battle.playCard(prepared, attackCard.id, rng);

  assert.equal(next.enemies[0].currentHp, 50);
  assert.equal(next.enemies[0].block, 3);
});

test("enemy applyStatus targeting player writes statuses and poison ticks", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      currentHp: 50,
      maxHp: 50,
      block: 0,
      hand: [],
      deck: [],
    },
    enemies: [
      {
        ...state.enemies[0],
        nextAction: {
          kind: "applyStatus",
          target: "player",
          status: { kind: "poison" },
          stacks: 2,
        },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.player.currentHp, 48);
  assert.equal(next.player.statuses.get("poison"), 1);
});

test("weak and vulnerable decay by one before the next player turn", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      hand: [],
      deck: [],
      statuses: new Map([
        ["weak", 1],
        ["vulnerable", 2],
      ]),
    },
    enemies: [
      {
        ...state.enemies[0],
        statuses: new Map([
          ["weak", 2],
          ["vulnerable", 1],
        ]),
        nextAction: { kind: "idle" },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.player.statuses.get("weak"), 0);
  assert.equal(next.player.statuses.get("vulnerable"), 1);
  assert.equal(next.enemies[0].statuses.get("weak"), 1);
  assert.equal(next.enemies[0].statuses.get("vulnerable"), 0);
  assert.equal(prepared.player.statuses.get("weak"), 1);
  assert.equal(prepared.enemies[0].statuses.get("vulnerable"), 1);
});

test("weak and vulnerable decay never creates negative stacks", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      hand: [],
      deck: [],
      statuses: new Map([
        ["weak", 0],
        ["vulnerable", 0],
      ]),
    },
    enemies: [
      {
        ...state.enemies[0],
        statuses: new Map([
          ["weak", 0],
          ["vulnerable", 0],
        ]),
        nextAction: { kind: "idle" },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.player.statuses.get("weak"), 0);
  assert.equal(next.player.statuses.get("vulnerable"), 0);
  assert.equal(next.enemies[0].statuses.get("weak"), 0);
  assert.equal(next.enemies[0].statuses.get("vulnerable"), 0);
});

test("enemy applyStatus targeting self writes enemy statuses", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      hand: [],
      deck: [],
    },
    enemies: [
      {
        ...state.enemies[0],
        nextAction: {
          kind: "applyStatus",
          target: "self",
          status: { kind: "strength" },
          stacks: 2,
        },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.enemies[0].statuses.get("strength"), 2);
  assert.equal(
    next.log.some((entry) => entry.includes("[Skip]")),
    false,
  );
});

test("enemy buff adds the declared status to itself", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      hand: [],
      deck: [],
    },
    enemies: [
      {
        ...state.enemies[0],
        statuses: new Map([["strength", 1]]),
        nextAction: {
          kind: "buff",
          status: { kind: "strength" },
          stacks: 2,
          description: "攻撃力上昇",
        },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.enemies[0].statuses.get("strength"), 3);
  assert.equal(
    next.log.some((entry) => entry.includes("[Skip]")),
    false,
  );
});

test("bat has attack action", () => {
  const enemy = enemies.createBat();

  assert.equal(enemy.id, "bat");
  assert.equal(enemy.nextAction.kind, "multiAttack");
});

test("enemy attack blocking stats use modified damage", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      currentHp: 50,
      maxHp: 50,
      block: 20,
      hand: [],
      deck: [],
      statuses: new Map([["vulnerable", 1]]),
    },
    enemies: [
      {
        ...state.enemies[0],
        statuses: new Map([["strength", 2]]),
        nextAction: { kind: "attack", amount: 8 },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.player.currentHp, 50);
  assert.equal(next.run.stats.totalDamageBlocked, 15);
});

test("crest colossus advances through omen, attack, and block-and-attack actions", () => {
  const initialState = createBattleState();
  let state = {
    ...initialState,
    player: {
      ...initialState.player,
      currentHp: 300,
      maxHp: 300,
      hand: [],
      deck: [],
      discard: [],
    },
    enemies: [enemies.createBossEnemy()],
  };
  const actions = [];

  for (let turn = 0; turn < 5; turn++) {
    actions.push(state.enemies[0].nextAction);
    state = battle.endPlayerTurn(state, rng);
  }

  assert.deepEqual(actions, [
    { kind: "omen", description: "次のターン、大攻撃が来る！" },
    { kind: "attack", amount: 50 },
    { kind: "blockAndAttack", blockAmount: 20, attackAmount: 8 },
    { kind: "attack", amount: 50 },
    { kind: "blockAndAttack", blockAmount: 20, attackAmount: 8 },
  ]);
  assert.equal(state.enemies[0].battleTurn, 5);
});

test("blockAndAttack keeps newly gained enemy block for the next player turn", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      currentHp: 100,
      maxHp: 100,
      block: 0,
      hand: [],
      deck: [],
    },
    enemies: [
      {
        ...enemies.createBossEnemy(),
        block: 7,
        battleTurn: 1,
        nextAction: {
          kind: "blockAndAttack",
          blockAmount: 20,
          attackAmount: 8,
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.enemies[0].block, 20);
  assert.equal(next.player.currentHp, 92);
});

test("player block absorbs the enemy attack before resetting for the next turn", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    player: {
      ...state.player,
      currentHp: 100,
      maxHp: 100,
      block: 20,
      hand: [],
      deck: [],
    },
    enemies: [
      {
        ...state.enemies[0],
        nextAction: { kind: "attack", amount: 50 },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.player.currentHp, 70);
  assert.equal(next.player.block, 0);
  assert.equal(
    next.run.stats.totalDamageBlocked,
    prepared.run.stats.totalDamageBlocked + 20,
  );
});

test("playing an original card with hpCost compensation reduces player HP", () => {
  const originalCard = {
    id: "hp-cost-card",
    name: "HP Cost Card",
    cost: { kind: "zero" },
    effects: [],
    rarity: "rare",
    description: "",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "empty" },
    compensation: { kind: "hpCost", amount: 7 },
  };
  const state = withCardInHand(createBattleState(), originalCard);
  const prepared = {
    ...state,
    player: {
      ...state.player,
      currentHp: 50,
      maxHp: 50,
    },
  };

  const next = battle.playCard(prepared, originalCard.id, rng);

  assert.equal(next.player.currentHp, 43);
});

test("poisonOnAttack adds poison after an attack card is played", () => {
  const card = {
    id: "forge-poison-attack",
    name: "Forge Poison Attack",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 3 }],
    rarity: "common",
    description: "",
    cardSlot: {
      kind: "filled",
      effect: { kind: "poisonOnAttack", stacks: 2 },
    },
  };
  const state = withCardInHand(createBattleState(), card);
  const prepared = {
    ...state,
    enemies: [
      {
        ...state.enemies[0],
        currentHp: 50,
        maxHp: 50,
        statuses: new Map([["poison", 1]]),
      },
    ],
  };

  const next = battle.playCard(prepared, card.id, rng);

  assert.equal(next.enemies[0].statuses.get("poison"), 3);
  assert.equal(prepared.enemies[0].statuses.get("poison"), 1);
});

test("poisonOnAttack does not trigger for a non-attack card", () => {
  const card = {
    id: "forge-poison-skill",
    name: "Forge Poison Skill",
    cost: { kind: "zero" },
    effects: [{ kind: "draw", count: 0 }],
    rarity: "common",
    description: "",
    cardSlot: {
      kind: "filled",
      effect: { kind: "poisonOnAttack", stacks: 2 },
    },
  };
  const state = withCardInHand(createBattleState(), card);

  const next = battle.playCard(state, card.id, rng);

  assert.equal(next.enemies[0].statuses.get("poison"), undefined);
});

test("healOnUse heals the player without exceeding max HP", () => {
  const card = {
    id: "forge-heal",
    name: "Forge Heal",
    cost: { kind: "zero" },
    effects: [],
    rarity: "common",
    description: "",
    cardSlot: {
      kind: "filled",
      effect: { kind: "healOnUse", amount: 5 },
    },
  };
  const state = withCardInHand(createBattleState(), card);
  const prepared = {
    ...state,
    player: {
      ...state.player,
      currentHp: state.player.maxHp - 2,
    },
  };

  const next = battle.playCard(prepared, card.id, rng);

  assert.equal(next.player.currentHp, next.player.maxHp);
  assert.equal(prepared.player.currentHp, prepared.player.maxHp - 2);
});

test("reflectOnBlock damages the enemy after a block card is played", () => {
  const card = {
    id: "forge-reflect-block",
    name: "Forge Reflect Block",
    cost: { kind: "zero" },
    effects: [{ kind: "block", amount: 4 }],
    rarity: "common",
    description: "",
    cardSlot: {
      kind: "filled",
      effect: { kind: "reflectOnBlock", amount: 3 },
    },
  };
  const state = withCardInHand(createBattleState(), card);
  const prepared = {
    ...state,
    enemies: [
      {
        ...state.enemies[0],
        currentHp: 50,
        maxHp: 50,
        block: 1,
      },
    ],
  };

  const next = battle.playCard(prepared, card.id, rng);

  assert.equal(next.enemies[0].currentHp, 48);
  assert.equal(next.enemies[0].block, 0);
  assert.equal(
    next.run.stats.totalDamageDealt,
    prepared.run.stats.totalDamageDealt + 2,
  );
});

test("reflectOnBlock does not trigger for a card without a block effect", () => {
  const card = {
    id: "forge-reflect-skill",
    name: "Forge Reflect Skill",
    cost: { kind: "zero" },
    effects: [{ kind: "draw", count: 0 }],
    rarity: "common",
    description: "",
    cardSlot: {
      kind: "filled",
      effect: { kind: "reflectOnBlock", amount: 3 },
    },
  };
  const state = withCardInHand(createBattleState(), card);
  const prepared = {
    ...state,
    enemies: [
      {
        ...state.enemies[0],
        currentHp: 50,
        maxHp: 50,
      },
    ],
  };

  const next = battle.playCard(prepared, card.id, rng);

  assert.equal(next.enemies[0].currentHp, 50);
});

test("retain keeps the played card in hand instead of discarding it", () => {
  const card = {
    id: "forge-retain",
    name: "Forge Retain",
    cost: { kind: "zero" },
    effects: [],
    rarity: "common",
    description: "",
    cardSlot: {
      kind: "filled",
      effect: { kind: "retain" },
    },
  };
  const state = withCardInHand(createBattleState(), card);

  const next = battle.playCard(state, card.id, rng);

  assert.deepEqual(
    next.player.hand.map(({ id }) => id),
    [card.id],
  );
  assert.equal(
    next.player.discard.some(({ id }) => id === card.id),
    false,
  );
});

test("lightweight requires no battle effect and discards normally", () => {
  const card = {
    id: "forge-lightweight",
    name: "Forge Lightweight",
    cost: { kind: "zero" },
    effects: [],
    rarity: "common",
    description: "",
    cardSlot: {
      kind: "filled",
      effect: { kind: "lightweight" },
    },
  };
  const state = withCardInHand(createBattleState(), card);

  const next = battle.playCard(state, card.id, rng);

  assert.equal(
    next.player.hand.some(({ id }) => id === card.id),
    false,
  );
  assert.equal(
    next.player.discard.some(({ id }) => id === card.id),
    true,
  );
});

test("all relics define rarity and starter conversion metadata", () => {
  const validRarities = new Set(["normal", "uncommon", "rare", "legendary"]);

  assert.equal(relics.ANCIENT_EMBLEM.rarity, "uncommon");
  assert.equal(relics.ANCIENT_EMBLEM.isStarter, true);
  assert.equal(relics.SMALL_GEAR.rarity, "uncommon");
  assert.equal(relics.SMALL_GEAR.isStarter, true);
  assert.equal(relics.ALL_RELICS.length, 16);

  for (const relic of relics.ALL_RELICS) {
    assert.equal(validRarities.has(relic.rarity), true);
    assert.equal(typeof relic.isStarter, "boolean");
  }
});

test("black vial adds poison when entering battle", () => {
  const state = createBattleState();
  const battleNode = {
    id: "relic-test-battle",
    floor: 1,
    x: 0,
    kind: "battle",
    nextNodeIds: [],
  };
  const prepared = {
    ...state,
    phase: "map",
    relics: [relics.BLACK_VIAL],
    run: {
      ...state.run,
      map: {
        nodes: [battleNode],
        startNodeIds: [battleNode.id],
        bossNodeId: "",
      },
    },
  };

  const next = battle.selectNode(prepared, battleNode.id, rng);

  assert.equal(
    next.enemies[0].statuses.get("poison"),
    relics.BLACK_VIAL_POISON,
  );
  assert.equal(prepared.enemies[0]?.statuses.get("poison"), undefined);
  assert.ok(next.log.some((entry) => entry.includes("【黒い小瓶】")));
});

test("ancient emblem boosts only the first attack card on the first turn", () => {
  const attackCard = {
    id: "first-attack",
    name: "First Attack",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 5 }],
    rarity: "common",
    description: "",
  };
  const state = withCardInHand(createBattleState(), attackCard);
  const prepared = {
    ...state,
    relics: [relics.ANCIENT_EMBLEM],
    enemies: [{ ...state.enemies[0], currentHp: 50, maxHp: 50, block: 0 }],
  };

  const next = battle.playCard(prepared, attackCard.id, rng);

  assert.equal(next.enemies[0].currentHp, 43);
  assert.ok(next.log.some((entry) => entry.includes("【古びた紋章】")));
});

test("small gear boosts follow-up hits of first-turn multi attacks", () => {
  const multiAttackCard = {
    id: "gear-multi-attack",
    name: "Gear Multi Attack",
    cost: { kind: "zero" },
    effects: [{ kind: "multiAttack", amount: 3, times: 2 }],
    rarity: "common",
    description: "",
  };
  const state = withCardInHand(createBattleState(), multiAttackCard);
  const prepared = {
    ...state,
    relics: [relics.SMALL_GEAR],
    enemies: [{ ...state.enemies[0], currentHp: 50, maxHp: 50, block: 0 }],
  };

  const next = battle.playCard(prepared, multiAttackCard.id, rng);

  assert.equal(next.enemies[0].currentHp, 43);
  assert.ok(next.log.some((entry) => entry.includes("【小さな歯車】")));
});

test("floor three and later battle nodes spawn a random normal enemy", () => {
  const state = createBattleState();
  const battleNode = {
    id: "random-enemy-battle",
    floor: 1,
    x: 0,
    kind: "battle",
    nextNodeIds: [],
  };
  const prepared = {
    ...state,
    phase: "map",
    roomNumber: 2,
    run: {
      ...state.run,
      map: {
        nodes: [battleNode],
        startNodeIds: [battleNode.id],
        bossNodeId: "",
      },
    },
  };

  // rng=0 → index=0 → slime
  const next = battle.selectNode(prepared, battleNode.id, () => 0);

  assert.equal(next.enemies[0].id, "slime");
});

test("battle nodes before floor three keep using the starter enemy", () => {
  const state = createBattleState();
  const battleNode = {
    id: "early-battle",
    floor: 1,
    x: 0,
    kind: "battle",
    nextNodeIds: [],
  };
  const prepared = {
    ...state,
    phase: "map",
    roomNumber: 1,
    run: {
      ...state.run,
      map: {
        nodes: [battleNode],
        startNodeIds: [battleNode.id],
        bossNodeId: "",
      },
    },
  };

  const next = battle.selectNode(prepared, battleNode.id, () => 0.1);

  assert.notEqual(next.enemies[0].id, "armored-cultist");
});

test("cracked shield grants block on turn start only when block is empty", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    relics: [relics.CRACKED_SHIELD],
    player: {
      ...state.player,
      block: 0,
      hand: [],
      deck: [],
    },
    enemies: [
      {
        ...state.enemies[0],
        nextAction: { kind: "idle" },
        behavior: {
          selectAction: () => ({ kind: "idle" }),
        },
      },
    ],
  };

  const next = battle.endPlayerTurn(prepared, rng);

  assert.equal(next.player.block, relics.CRACKED_SHIELD_BLOCK);
  assert.ok(next.log.some((entry) => entry.includes("【ひび割れた盾】")));
  assert.equal(
    next.run.stats.relicEffectCount,
    prepared.run.stats.relicEffectCount + 1,
  );
});

test("upgradeCardInDeck upgrades one card once and adds a display suffix", () => {
  const state = createBattleState();
  const targetCard = state.player.deck[0] ?? state.player.hand[0];
  assert.ok(targetCard);
  const prepared = {
    ...state,
    phase: "rest",
    player: {
      ...state.player,
      deck: [targetCard],
      hand: [],
      discard: [],
    },
  };

  const upgraded = battle.upgradeCardInDeck(prepared, targetCard.id);
  const upgradedCard = upgraded.player.deck[0];

  assert.equal(upgraded.phase, "map");
  assert.equal(upgraded.player.deck.length, 1);
  assert.equal(upgradedCard.id, targetCard.id);
  assert.equal(upgradedCard.upgraded, true);
  assert.equal(upgradedCard.name, `${targetCard.name}+`);
  assert.equal(targetCard.upgraded, undefined);
  assert.equal(targetCard.name.endsWith("+"), false);

  const restAgain = { ...upgraded, phase: "rest" };
  const secondAttempt = battle.upgradeCardInDeck(restAgain, targetCard.id);

  assert.equal(secondAttempt, restAgain);
  assert.equal(secondAttempt.player.deck.length, 1);
  assert.equal(secondAttempt.player.deck[0].name, `${targetCard.name}+`);
});

test("upgradeCardInDeck updates the card description to match upgraded effects", () => {
  const state = createBattleState();
  const targetCard = {
    id: "description-upgrade-target",
    name: "盾打ち",
    cost: { kind: "fixed", energy: 1 },
    effects: [
      { kind: "block", amount: 5 },
      { kind: "attack", amount: 3 },
    ],
    rarity: "common",
    description: "5ブロックを得る。3ダメージを与える。",
  };
  const prepared = {
    ...state,
    phase: "rest",
    player: {
      ...state.player,
      deck: [targetCard],
      hand: [],
      discard: [],
    },
  };

  const next = battle.upgradeCardInDeck(prepared, targetCard.id);

  assert.equal(
    next.player.deck[0].description,
    "8ブロックを得る。6ダメージを与える。",
  );
});

test("upgradeCardInDeck replaces an OriginalCard without duplicating it", () => {
  const state = createBattleState();
  const originalCard = {
    id: "original-upgrade-target",
    name: "Original",
    cost: { kind: "fixed", energy: 1 },
    effects: [{ kind: "attack", amount: 5 }],
    rarity: "rare",
    description: "",
    isOriginal: true,
    materials: { cardAId: "a", cardBId: "b" },
    enemySlot: { kind: "empty" },
    compensation: { kind: "hpCost", amount: 2 },
  };
  const prepared = {
    ...state,
    phase: "rest",
    player: {
      ...state.player,
      deck: [originalCard],
      hand: [],
      discard: [],
    },
  };

  const next = battle.upgradeCardInDeck(prepared, originalCard.id);
  const upgradedOriginal = next.player.deck[0];

  assert.equal(next.player.deck.length, 1);
  assert.equal(upgradedOriginal.id, originalCard.id);
  assert.equal(upgradedOriginal.name, "Original+");
  assert.equal(upgradedOriginal.upgraded, true);
  assert.equal(upgradedOriginal.isOriginal, true);
  assert.deepEqual(upgradedOriginal.materials, originalCard.materials);
  assert.deepEqual(upgradedOriginal.enemySlot, originalCard.enemySlot);
  assert.deepEqual(upgradedOriginal.compensation, originalCard.compensation);
});

test("upgradeCardInDeck does not duplicate an existing display suffix", () => {
  const state = createBattleState();
  const targetCard = {
    id: "already-suffixed",
    name: "攻撃+",
    cost: { kind: "fixed", energy: 1 },
    effects: [{ kind: "attack", amount: 6 }],
    rarity: "common",
    description: "",
  };
  const prepared = {
    ...state,
    phase: "rest",
    player: {
      ...state.player,
      deck: [targetCard],
      hand: [],
      discard: [],
    },
  };

  const next = battle.upgradeCardInDeck(prepared, targetCard.id);

  assert.equal(next.player.deck[0].name, "攻撃+");
  assert.equal(next.player.deck[0].upgraded, true);
});

test("healAtRest heals 20 percent of max HP rounded up", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    phase: "rest",
    player: {
      ...state.player,
      currentHp: 40,
      maxHp: 95,
    },
  };

  const next = battle.healAtRest(prepared);

  assert.equal(next.phase, "map");
  assert.equal(next.player.currentHp, 59);
  assert.ok(next.log.some((entry) => entry.includes("HPを19回復")));
});

test("healAtRest does not exceed max HP", () => {
  const state = createBattleState();
  const prepared = {
    ...state,
    phase: "rest",
    player: {
      ...state.player,
      currentHp: 92,
      maxHp: 95,
    },
  };

  const next = battle.healAtRest(prepared);

  assert.equal(next.player.currentHp, 95);
  assert.ok(next.log.some((entry) => entry.includes("HPを3回復")));
});

// ---- T3: pendingDiscard テスト ----

// テスト用カード定義
const MIKAWASHI_CARD = {
  id: "mikawashi-t3",
  name: "身かわし",
  cost: { kind: "zero" },
  effects: [
    { kind: "block", amount: 3 },
    { kind: "discard", count: 1 },
  ],
  rarity: "common",
  description: "3ブロックを得る。手札を1枚捨てる。",
};

const DUMMY_CARD_A = {
  id: "dummy-a",
  name: "ダミーA",
  cost: { kind: "zero" },
  effects: [{ kind: "block", amount: 1 }],
  rarity: "common",
  description: "",
};

const DUMMY_CARD_B = {
  id: "dummy-b",
  name: "ダミーB",
  cost: { kind: "zero" },
  effects: [{ kind: "block", amount: 1 }],
  rarity: "common",
  description: "",
};

// discard エフェクトを持つ攻撃カード（敵撃破 + discard が同一プレイで起きるケース用）
const ATTACK_DISCARD_CARD = {
  id: "attack-discard-t3",
  name: "攻撃+捨て",
  cost: { kind: "zero" },
  effects: [
    { kind: "attack", amount: 999 },
    { kind: "discard", count: 1 },
  ],
  rarity: "common",
  description: "大ダメージ + 手札1枚捨てる",
};

/**
 * 手札・山札・捨て札を指定した状態でバトルを作る（rng はシード固定）
 */
function makeBattleStateWithHand(baseState, handCards) {
  return {
    ...baseState,
    player: {
      ...baseState.player,
      hand: handCards,
      deck: [],
      discard: [],
    },
  };
}

test("(a) 身かわし をプレイすると pendingDiscard が { count: 1 } になり即時捨ては起きない", () => {
  const base = createBattleState();
  // 手札: 身かわし + ダミー2枚（捨て対象が残るように）
  const state = makeBattleStateWithHand(base, [
    MIKAWASHI_CARD,
    DUMMY_CARD_A,
    DUMMY_CARD_B,
  ]);

  const next = battle.playCard(state, MIKAWASHI_CARD.id, rng);

  // pendingDiscard がセットされている
  assert.deepEqual(next.pendingDiscard, { count: 1 });
  // 手札にはダミー2枚が残ったまま（ランダム捨ては起きていない）
  assert.equal(next.player.hand.length, 2);
  assert.equal(next.player.discard.length, 1); // 身かわし自体が捨て札へ
});

test("(b) selectDiscardCard を呼ぶと指定カードが捨て札に移り pendingDiscard.count が減る", () => {
  const base = createBattleState();
  const state = makeBattleStateWithHand(base, [
    MIKAWASHI_CARD,
    DUMMY_CARD_A,
    DUMMY_CARD_B,
  ]);
  const afterPlay = battle.playCard(state, MIKAWASHI_CARD.id, rng);

  // DUMMY_CARD_A を選んで捨てる
  const afterSelect = battle.selectDiscardCard(afterPlay, DUMMY_CARD_A.id);

  assert.equal(afterSelect.player.hand.length, 1); // DUMMY_CARD_B のみ残る
  assert.ok(
    afterSelect.player.discard.some((c) => c.id === DUMMY_CARD_A.id),
    "DUMMY_CARD_A が捨て札にある",
  );
});

test("(c) selectDiscardCard で count が 0 になると pendingDiscard が null になる", () => {
  const base = createBattleState();
  const state = makeBattleStateWithHand(base, [
    MIKAWASHI_CARD,
    DUMMY_CARD_A,
    DUMMY_CARD_B,
  ]);
  const afterPlay = battle.playCard(state, MIKAWASHI_CARD.id, rng);
  assert.deepEqual(afterPlay.pendingDiscard, { count: 1 });

  const afterSelect = battle.selectDiscardCard(afterPlay, DUMMY_CARD_A.id);

  assert.equal(afterSelect.pendingDiscard, null);
});

test("(d) pendingCount >= hand.length のとき自動全廃棄され pendingDiscard が null になる", () => {
  const base = createBattleState();
  // 手札: 身かわし のみ（プレイ後手札0枚 → count=1 >= 0 で自動全廃棄）
  const state = makeBattleStateWithHand(base, [MIKAWASHI_CARD]);

  const next = battle.playCard(state, MIKAWASHI_CARD.id, rng);

  // 手札が 0 枚なので自動処理 → pendingDiscard: null
  assert.equal(next.pendingDiscard, null);
  // 手札は空
  assert.equal(next.player.hand.length, 0);
});

test("(e) 敵撃破で phase が変わった場合 pendingDiscard が null になる", () => {
  const base = createBattleState();
  // 手札: 攻撃+捨てカード + ダミー（本来なら捨て待ちになるはずの状況）
  const state = {
    ...makeBattleStateWithHand(base, [ATTACK_DISCARD_CARD, DUMMY_CARD_A]),
    enemies: [
      {
        ...base.enemies[0],
        currentHp: 1, // 1撃で倒せる HP
      },
    ],
  };

  const next = battle.playCard(state, ATTACK_DISCARD_CARD.id, rng);

  // 敵を倒したので reward フェーズへ
  assert.notEqual(next.phase, "battle");
  // pendingDiscard は null
  assert.equal(next.pendingDiscard, null);
});

test("(f) endPlayerTurn 後に pendingDiscard が null になる", () => {
  const base = createBattleState();
  const state = makeBattleStateWithHand(base, [
    MIKAWASHI_CARD,
    DUMMY_CARD_A,
    DUMMY_CARD_B,
  ]);
  const afterPlay = battle.playCard(state, MIKAWASHI_CARD.id, rng);
  assert.deepEqual(afterPlay.pendingDiscard, { count: 1 });

  // ターン終了（pendingDiscard は強制クリアされる）
  const afterTurn = battle.endPlayerTurn(afterPlay, rng);

  assert.equal(afterTurn.pendingDiscard, null);
});

// ---- タスク4: selectedEnemyInstanceId ----

test("バトル開始時に selectedEnemyInstanceId が先頭敵の instanceId に設定される", () => {
  const state = battle.startBattle(rng);
  assert.equal(state.selectedEnemyInstanceId, state.enemies[0].instanceId);
});

test("複数敵がいるとき攻撃カードは selectedEnemyInstanceId の敵を攻撃する（対象選択なし）", () => {
  const attackCard = {
    id: "targeted-attack-v2",
    name: "対象攻撃v2",
    cost: { kind: "fixed", energy: 1 },
    effects: [{ kind: "attack", amount: 7 }],
    rarity: "common",
    description: "",
  };
  const base = createBattleState();
  const enemyA = {
    ...base.enemies[0],
    instanceId: "enemy-a",
    currentHp: 30,
    maxHp: 30,
  };
  const enemyB = { ...enemyA, instanceId: "enemy-b", currentHp: 30, maxHp: 30 };
  const state = {
    ...base,
    enemies: [enemyA, enemyB],
    selectedEnemyInstanceId: "enemy-b",
    player: {
      ...base.player,
      hand: [attackCard],
      deck: [],
      discard: [],
      exhaust: [],
      energy: 3,
    },
  };

  // pendingTargetCardId フロー廃止後は即時攻撃される
  const next = battle.playCard(state, attackCard.id, rng);

  assert.equal(next.pendingTargetCardId, null);
  assert.equal(next.player.energy, 2);
  assert.equal(next.enemies[0].currentHp, 30); // enemy-a は無傷
  assert.equal(next.enemies[1].currentHp, 23); // enemy-b が攻撃される
});

test("selectTarget は攻撃せず selectedEnemyInstanceId だけを変更する", () => {
  const base = createBattleState();
  const enemyA = {
    ...base.enemies[0],
    instanceId: "enemy-a",
    currentHp: 30,
    maxHp: 30,
  };
  const enemyB = { ...enemyA, instanceId: "enemy-b", currentHp: 30, maxHp: 30 };
  const state = {
    ...base,
    enemies: [enemyA, enemyB],
    selectedEnemyInstanceId: "enemy-a",
  };

  const next = battle.selectTarget(state, "enemy-b", rng);

  assert.equal(next.selectedEnemyInstanceId, "enemy-b");
  assert.equal(next.enemies[0].currentHp, 30);
  assert.equal(next.enemies[1].currentHp, 30);
});

test("ターゲット中の敵が倒れると selectedEnemyInstanceId が他の生存敵に移る", () => {
  const attackCard = {
    id: "kill-shot",
    name: "即死攻撃",
    cost: { kind: "zero" },
    effects: [{ kind: "attack", amount: 9999 }],
    rarity: "common",
    description: "",
  };
  const base = createBattleState();
  const enemyA = {
    ...base.enemies[0],
    instanceId: "enemy-a",
    currentHp: 1,
    maxHp: 30,
  };
  const enemyB = { ...enemyA, instanceId: "enemy-b", currentHp: 30, maxHp: 30 };
  const state = {
    ...base,
    enemies: [enemyA, enemyB],
    selectedEnemyInstanceId: "enemy-a",
    player: {
      ...base.player,
      hand: [attackCard],
      deck: [],
      discard: [],
      exhaust: [],
    },
  };

  const next = battle.playCard(state, attackCard.id, rng);

  // enemy-a が倒れたので enemy-b に移る（または null）
  assert.notEqual(next.selectedEnemyInstanceId, "enemy-a");
});
