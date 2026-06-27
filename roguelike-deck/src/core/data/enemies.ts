// 通常敵・ボス敵のデータ定義
import type { Enemy, EnemyBehavior, EnemyInstanceId } from "../types";

// モジュールレベルのカウンタ（衝突ゼロの連番 ID 生成用）
let instanceCounter = 0;

function createEnemyInstanceId(enemyId: string): EnemyInstanceId {
  return `${enemyId}-${instanceCounter++}`;
}

// ---- スライム（基準敵） ----
// 6攻撃 → 5ブロック → 8攻撃 の3ターンサイクル

const slimeBehavior: EnemyBehavior = {
  selectAction: (context) => {
    const phase = context.turn % 3;
    if (phase === 0) return { kind: "attack", amount: 6 };
    if (phase === 1) return { kind: "block", amount: 5 };
    return { kind: "attack", amount: 8 };
  },
};

const SLIME_BASE_HP = 42;

export function createSlime(
  trialLevel: 0 | 1 = 0,
  instanceId: EnemyInstanceId = "slime-0",
): Enemy {
  const maxHp = trialLevel === 1 ? SLIME_BASE_HP + 10 : SLIME_BASE_HP;
  return {
    instanceId,
    id: "slime",
    name: "スライム",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "normal",
    statuses: new Map(),
    nextAction: slimeBehavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior: slimeBehavior,
  };
}

// ---- コウモリ（連撃・弱体の確認） ----
// 3×2攻撃 → 弱体付与 → 3×2攻撃 の3ターンサイクル

const batBehavior: EnemyBehavior = {
  selectAction: (context) => {
    const phase = context.turn % 3;
    if (phase === 0 || phase === 2)
      return { kind: "multiAttack", amount: 3, times: 2 };
    return {
      kind: "applyStatus",
      target: "player",
      status: { kind: "weak" },
      stacks: 1,
    };
  },
};

const BAT_BASE_HP = 34;

export function createBat(
  trialLevel: 0 | 1 = 0,
  instanceId: EnemyInstanceId = "bat-0",
): Enemy {
  const maxHp = trialLevel === 1 ? BAT_BASE_HP + 10 : BAT_BASE_HP;
  return {
    instanceId,
    id: "bat",
    name: "コウモリ",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "normal",
    statuses: new Map(),
    nextAction: batBehavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior: batBehavior,
  };
}

// ---- 錆びネズミ（裂傷の怖さ確認） ----
// 5攻撃+裂傷1 → 7攻撃 の2ターンサイクル

const rustyRatBehavior: EnemyBehavior = {
  selectAction: (context) => {
    if (context.turn % 2 === 0) {
      return {
        kind: "attackAndApplyStatus",
        amount: 5,
        status: { kind: "laceration" },
        stacks: 1,
      };
    }
    return { kind: "attack", amount: 7 };
  },
};

const RUSTY_RAT_BASE_HP = 38;

export function createRustyRat(
  trialLevel: 0 | 1 = 0,
  instanceId: EnemyInstanceId = "rusty-rat-0",
): Enemy {
  const maxHp = trialLevel === 1 ? RUSTY_RAT_BASE_HP + 10 : RUSTY_RAT_BASE_HP;
  return {
    instanceId,
    id: "rusty-rat",
    name: "錆びネズミ",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "normal",
    statuses: new Map(),
    nextAction: rustyRatBehavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior: rustyRatBehavior,
  };
}

// ---- 甲殻虫（防御敵） ----
// 10ブロック → 10攻撃 → 10ブロック の3ターンサイクル

const beetleBehavior: EnemyBehavior = {
  selectAction: (context) => {
    if (context.turn % 3 === 1) return { kind: "attack", amount: 10 };
    return { kind: "block", amount: 10 };
  },
};

const BEETLE_BASE_HP = 55;

export function createBeetle(
  trialLevel: 0 | 1 = 0,
  instanceId: EnemyInstanceId = "beetle-0",
): Enemy {
  const maxHp = trialLevel === 1 ? BEETLE_BASE_HP + 10 : BEETLE_BASE_HP;
  return {
    instanceId,
    id: "beetle",
    name: "甲殻虫",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "normal",
    statuses: new Map(),
    nextAction: beetleBehavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior: beetleBehavior,
  };
}

/** ランダムに通常敵を1体生成する */
export function createRandomNormalEnemy(
  rng: () => number,
  trialLevel: 0 | 1 = 0,
): Enemy {
  const index = Math.floor(rng() * 4);
  if (index === 0)
    return createSlime(trialLevel, createEnemyInstanceId("slime"));
  if (index === 1) return createBat(trialLevel, createEnemyInstanceId("bat"));
  if (index === 2)
    return createRustyRat(trialLevel, createEnemyInstanceId("rusty-rat"));
  return createBeetle(trialLevel, createEnemyInstanceId("beetle"));
}

/** 通常敵グループを生成する。試練レベル1では複数敵率を少し高くする。 */
export function createNormalEnemyGroup(
  rng: () => number,
  trialLevel: 0 | 1 = 0,
): readonly Enemy[] {
  const groupRoll = rng();
  const groupSize = groupRoll < (trialLevel === 1 ? 0.35 : 0.25) ? 2 : 1;
  const enemies: Enemy[] = [];

  for (let i = 0; i < groupSize; i++) {
    enemies.push(createRandomNormalEnemy(rng, trialLevel));
  }

  return enemies;
}

// ---- エリート敵 ----

const armorKnightBehavior: EnemyBehavior = {
  selectAction: (context) => {
    const phase = context.turn % 3;
    if (phase === 0) return { kind: "block", amount: 12 };
    if (phase === 1) return { kind: "attack", amount: 18 };
    return { kind: "attack", amount: 30 };
  },
};

export function createArmorKnight(
  instanceId: EnemyInstanceId = "armor-knight-0",
): Enemy {
  const maxHp = 105;
  return {
    instanceId,
    id: "armor-knight",
    name: "甲殻騎士",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "elite",
    statuses: new Map(),
    nextAction: armorKnightBehavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior: armorKnightBehavior,
  };
}

const twinBladeHunterBehavior: EnemyBehavior = {
  selectAction: (context) => {
    const phase = context.turn % 3;
    if (phase === 0) return { kind: "multiAttack", amount: 6, times: 3 };
    if (phase === 1) {
      return {
        kind: "applyStatus",
        target: "player",
        status: { kind: "weak" },
        stacks: 1,
      };
    }
    return { kind: "multiAttack", amount: 8, times: 2 };
  },
};

export function createTwinBladeHunter(
  instanceId: EnemyInstanceId = "twin-blade-hunter-0",
): Enemy {
  const maxHp = 90;
  return {
    instanceId,
    id: "twin-blade-hunter",
    name: "双刃の狩人",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "elite",
    statuses: new Map(),
    nextAction: twinBladeHunterBehavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior: twinBladeHunterBehavior,
  };
}

const poisonSwampFrogBehavior: EnemyBehavior = {
  selectAction: (context) => {
    const phase = context.turn % 3;
    if (phase === 1) return { kind: "attack", amount: 10 };
    return {
      kind: "applyStatus",
      target: "player",
      status: { kind: "poison" },
      stacks: 5,
    };
  },
};

export function createPoisonSwampFrog(
  instanceId: EnemyInstanceId = "poison-swamp-frog-0",
): Enemy {
  const maxHp = 115;
  return {
    instanceId,
    id: "poison-swamp-frog",
    name: "毒沼の大蛙",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "elite",
    statuses: new Map(),
    nextAction: poisonSwampFrogBehavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior: poisonSwampFrogBehavior,
  };
}

export function createRandomEliteEnemy(rng: () => number): Enemy {
  const index = Math.floor(rng() * 3);
  if (index === 0) return createArmorKnight(createEnemyInstanceId("armor-knight"));
  if (index === 1)
    return createTwinBladeHunter(createEnemyInstanceId("twin-blade-hunter"));
  return createPoisonSwampFrog(createEnemyInstanceId("poison-swamp-frog"));
}

export function createEliteEnemyGroup(rng: () => number): readonly Enemy[] {
  return [createRandomEliteEnemy(rng)];
}

// ---- ボス敵（紋章の巨像） ----

const BOSS_BASE_HP = 280;

// 試練レベル1: 攻撃量を1.5倍にするラッパーbehavior
function createTrialBossBehavior(base: EnemyBehavior): EnemyBehavior {
  return {
    selectAction: (context) => {
      const action = base.selectAction(context);
      if (action.kind === "attack") {
        return { ...action, amount: Math.floor(action.amount * 1.5) };
      }
      if (action.kind === "blockAndAttack") {
        return {
          ...action,
          attackAmount: Math.floor(action.attackAmount * 1.5),
        };
      }
      return action;
    },
  };
}

const bossBehavior: EnemyBehavior = {
  selectAction: (context) => {
    if (context.turn === 0) {
      return {
        kind: "omen",
        description: "次のターン、大攻撃が来る！",
      };
    }
    if (context.turn % 2 === 1) {
      return { kind: "attack", amount: 50 };
    }
    return {
      kind: "blockAndAttack",
      blockAmount: 20,
      attackAmount: 8,
    };
  },
};

export function createBossEnemy(
  trialLevel: 0 | 1 = 0,
  instanceId: EnemyInstanceId = "crest-colossus-boss-0",
): Enemy {
  const maxHp =
    trialLevel === 1 ? Math.floor((BOSS_BASE_HP + 10) * 1.5) : BOSS_BASE_HP;
  const behavior =
    trialLevel === 1 ? createTrialBossBehavior(bossBehavior) : bossBehavior;
  return {
    instanceId,
    id: "crest-colossus-boss",
    name: "紋章の巨像",
    maxHp,
    currentHp: maxHp,
    block: 0,
    battleTurn: 0,
    tier: "boss",
    statuses: new Map(),
    nextAction: behavior.selectAction({
      turn: 0,
      enemyHp: maxHp,
      playerHp: 0,
    }),
    behavior,
  };
}
