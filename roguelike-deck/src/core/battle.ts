// バトルロジック（カードプレイ・敵ターン・勝敗判定）
// DOM に一切依存しない純粋関数群
import type {
  Enemy,
  GameState,
  Player,
  RunState,
  RunStats,
  ShopItems,
} from "./types";
import type { AttackTarget, CardCost, CardEffect, StatusEffect } from "./types";
import type { Relic, RelicEffect } from "./types";
import type { RunConfig } from "./types";
import type { Card } from "./types";
import type { EvolveCard } from "./types";
import type { Potion } from "./types";
import type { OriginalCard } from "./types/originalCard";
import { ALL_POTIONS } from "./data/potions";
import {
  addCodexPoints,
  buildCodexState,
  lockEnemySlot,
  unlockOrb,
} from "./codex";
import { buildDiscoveredCardNames, registerCardUsage } from "./card-codex";
import { getOrbById } from "./data/orbData";
import { shuffleArray, type RngFn } from "./rng";
import {
  createStarterDeck,
  createComboDeck,
  createFallbackAttackCard,
  createRewardPool,
  createEvolvedCard,
  upgradeCard,
} from "./data/cards";
import {
  ANCIENT_EMBLEM,
  BLACK_VIAL,
  CRACKED_SHIELD,
  SMALL_GEAR,
  ALL_RELICS,
} from "./data/relics";
import {
  createSlime,
  createNormalEnemyGroup,
  createBossEnemy,
  createEliteEnemyGroup,
} from "./data/enemies";
import { drawCards, discardCard, discardHand } from "./deck";
import { generateFloorMap, findNode } from "./map";
import { createWeightedRewardPool, pickRelicReward } from "./reward";
import {
  applyChainFlagUpdate,
  applyEventEffects,
  selectEventDefinition,
} from "./event";
import { MAX_LOG_ENTRIES, MAX_POTION_SLOTS } from "./constants";

// 報酬候補として選ぶカード枚数
const REWARD_CARD_COUNT = 3;

// ゲームバランス定数
const INITIAL_PLAYER_HP = 100;
const INITIAL_MAX_ENERGY = 3;
const INITIAL_DRAW_COUNT = 5;
const TURN_DRAW_COUNT = 5;

// 報酬ゴールドの範囲（named constant）
const REWARD_GOLD_MIN = 10;
const REWARD_GOLD_MAX = 20;
const ELITE_REWARD_GOLD_MIN = 25;
const ELITE_REWARD_GOLD_MAX = 40;

// 休憩所での HP 回復割合（最大HPの20%）
const REST_HEAL_RATIO = 0.2;
const SHOP_CARD_COUNT = 3;
const SHOP_RELIC_COUNT = 2;
const SHOP_CARD_REMOVAL_PRICE = 75;
const POTION_REWARD_CHANCE = 0.25; // 報酬フェーズでポーションが出る確率（デバッグ用: 本来は 0.25）

const EMPTY_SHOP_ITEMS: ShopItems = {
  cards: [],
  relics: [],
  potions: [],
  cardRemovalPrice: 0,
};

// ---- 内部ヘルパー ----

/**
 * OriginalCard かどうかを判定する型ガード
 * isOriginal フラグで識別する（any 不使用）
 */
function isOriginalCard(card: Card): card is OriginalCard {
  return "isOriginal" in card && (card as OriginalCard).isOriginal === true;
}

function isEvolveCard(card: Card): card is EvolveCard {
  return "isEvolvable" in card && card.isEvolvable === true;
}

function getEvolveProgressIncrement(card: EvolveCard): number {
  switch (card.evolveCondition.kind) {
    case "useCount":
      return 1;
    case "statusApplied": {
      const targetStatus = card.evolveCondition.status;
      return card.effects.reduce((total, effect) => {
        if (
          effect.kind === "applyStatus" &&
          effect.status.kind === targetStatus
        ) {
          return total + effect.stacks;
        }
        return total;
      }, 0);
    }
    case "blockTotal":
      return card.effects.reduce(
        (total, effect) =>
          effect.kind === "block" ? total + effect.amount : total,
        0,
      );
    default: {
      const _exhaustive: never = card.evolveCondition;
      return _exhaustive;
    }
  }
}

function updateEvolveProgress(state: GameState, card: EvolveCard): GameState {
  const increment = getEvolveProgressIncrement(card);
  if (increment <= 0) return state;

  const currentProgress = state.run.evolveProgress.get(card.id) ?? 0;
  const nextProgress = currentProgress + increment;
  const threshold = card.evolveCondition.threshold;
  const nextEvolveProgress = new Map(state.run.evolveProgress);

  if (nextProgress < threshold) {
    nextEvolveProgress.set(card.id, nextProgress);
    return {
      ...state,
      run: { ...state.run, evolveProgress: nextEvolveProgress },
    };
  }

  const evolvedCard = createEvolvedCard(card.evolvedCardId, card.id);
  if (evolvedCard === undefined) {
    nextEvolveProgress.set(card.id, nextProgress);
    return {
      ...state,
      run: { ...state.run, evolveProgress: nextEvolveProgress },
    };
  }

  const replaceCard = (candidate: Card): Card =>
    candidate.id === card.id ? evolvedCard : candidate;
  nextEvolveProgress.delete(card.id);

  return {
    ...state,
    player: {
      ...state.player,
      hand: state.player.hand.map(replaceCard),
      deck: state.player.deck.map(replaceCard),
      discard: state.player.discard.map(replaceCard),
      exhaust: state.player.exhaust.map(replaceCard),
    },
    run: { ...state.run, evolveProgress: nextEvolveProgress },
    log: addLog(state.log, `${card.name}が${evolvedCard.name}に進化した！`),
  };
}

/**
 * ダメージを適用する（ブロックを先に消費）
 * ブロックを超えた分だけ HP を減らす
 */
function applyDamage(
  currentHp: number,
  block: number,
  damage: number,
  attackerStatuses?: ReadonlyMap<StatusEffect["kind"], number>,
  defenderStatuses?: ReadonlyMap<StatusEffect["kind"], number>,
): { newHp: number; newBlock: number; blockedAmount: number } {
  const strength = attackerStatuses?.get("strength") ?? 0;
  const weakMultiplier = (attackerStatuses?.get("weak") ?? 0) > 0 ? 0.75 : 1;
  const vulnerableMultiplier =
    (defenderStatuses?.get("vulnerable") ?? 0) > 0 ? 1.5 : 1;
  const modifiedDamage = Math.floor(
    Math.max(0, damage + strength) * weakMultiplier * vulnerableMultiplier,
  );
  const remainingDamage = Math.max(0, modifiedDamage - block);
  const newBlock = Math.max(0, block - modifiedDamage);
  const newHp = Math.max(0, currentHp - remainingDamage);
  const blockedAmount = modifiedDamage - remainingDamage;
  return { newHp, newBlock, blockedAmount };
}

function getLivingEnemies(state: GameState): readonly Enemy[] {
  return state.enemies.filter((enemy) => enemy.currentHp > 0);
}

function updateEnemy(
  state: GameState,
  instanceId: string,
  update: (enemy: Enemy) => Enemy,
): GameState {
  return {
    ...state,
    enemies: state.enemies.map((enemy) =>
      enemy.instanceId === instanceId ? update(enemy) : enemy,
    ),
  };
}

function getDefaultAttackTarget(state: GameState): AttackTarget | null {
  const livingEnemies = getLivingEnemies(state);
  if (livingEnemies.length === 0) return null;
  // selectedEnemyInstanceId が生存敵を指している場合はそれを使う
  if (state.selectedEnemyInstanceId !== null) {
    const selected = livingEnemies.find(
      (e) => e.instanceId === state.selectedEnemyInstanceId,
    );
    if (selected !== undefined) {
      return { kind: "single", instanceId: selected.instanceId };
    }
  }
  // フォールバック: 先頭の生存敵
  const [first] = livingEnemies;
  return { kind: "single", instanceId: first.instanceId };
}

/**
 * selectedEnemyInstanceId を生存敵に合わせて更新する
 * 現在のターゲットが死亡していた場合、先頭の生存敵に移す
 */
function reconcileSelectedTarget(state: GameState): GameState {
  const livingEnemies = getLivingEnemies(state);
  if (livingEnemies.length === 0) {
    return { ...state, selectedEnemyInstanceId: null };
  }
  // 現在のターゲットが生存しているならそのまま
  if (
    state.selectedEnemyInstanceId !== null &&
    livingEnemies.some((e) => e.instanceId === state.selectedEnemyInstanceId)
  ) {
    return state;
  }
  // 生存敵の先頭に移す
  return { ...state, selectedEnemyInstanceId: livingEnemies[0].instanceId };
}

function getCardAttackTarget(card: Card): AttackTarget | undefined {
  for (const effect of card.effects) {
    if (
      effect.kind === "attack" ||
      effect.kind === "multiAttack" ||
      effect.kind === "conditionalAttack"
    ) {
      return effect.target;
    }
  }
  return undefined;
}

function resolveAttackTarget(
  state: GameState,
  effectTarget: AttackTarget | undefined,
): AttackTarget | null {
  if (effectTarget !== undefined) return effectTarget;
  return getDefaultAttackTarget(state);
}

function applyDamageToEnemy(
  state: GameState,
  enemy: Enemy,
  damage: number,
  logMessage: (newHp: number) => string,
): GameState {
  const oldHp = enemy.currentHp;
  const { newHp, newBlock } = applyDamage(
    enemy.currentHp,
    enemy.block,
    damage,
    state.player.statuses,
    enemy.statuses,
  );
  const damageDealt = oldHp - newHp;
  return {
    ...updateEnemy(state, enemy.instanceId, (targetEnemy) => ({
      ...targetEnemy,
      currentHp: newHp,
      block: newBlock,
    })),
    log: addLog(state.log, logMessage(newHp)),
    run: addStats(state.run, { totalDamageDealt: damageDealt }),
  };
}

function getTargetEnemies(
  state: GameState,
  target: AttackTarget,
): readonly Enemy[] {
  if (target.kind === "allEnemies") return getLivingEnemies(state);
  const enemy = state.enemies.find(
    (candidate) =>
      candidate.instanceId === target.instanceId && candidate.currentHp > 0,
  );
  return enemy === undefined ? [] : [enemy];
}

/**
 * RunStats を更新するヘルパー（イミュータブル）
 */
function addStats(run: RunState, partial: Partial<RunStats>): RunState {
  return {
    ...run,
    stats: {
      totalDamageDealt:
        partial.totalDamageDealt !== undefined
          ? run.stats.totalDamageDealt + partial.totalDamageDealt
          : run.stats.totalDamageDealt,
      totalDamageBlocked:
        partial.totalDamageBlocked !== undefined
          ? run.stats.totalDamageBlocked + partial.totalDamageBlocked
          : run.stats.totalDamageBlocked,
      originalCardUsedCount:
        partial.originalCardUsedCount !== undefined
          ? run.stats.originalCardUsedCount + partial.originalCardUsedCount
          : run.stats.originalCardUsedCount,
      relicEffectCount:
        partial.relicEffectCount !== undefined
          ? run.stats.relicEffectCount + partial.relicEffectCount
          : run.stats.relicEffectCount,
    },
  };
}

function processSingleEnemyDefeat(
  state: GameState,
  defeatedEnemy: Enemy,
): GameState {
  const defeatedEnemyId = defeatedEnemy.id;
  const isFirstEncounter = !state.run.encounteredEnemyIds.has(defeatedEnemyId);
  let nextState = addCodexPoints(state, defeatedEnemyId, 10);
  if (isFirstEncounter) {
    nextState = addCodexPoints(nextState, defeatedEnemyId, 10);
  }

  const orbIdsBefore = nextState.run.acquiredOrbIds;
  nextState = unlockOrb(nextState, defeatedEnemyId);
  const newlyUnlockedOrbs = nextState.run.acquiredOrbIds
    .filter((id) => !orbIdsBefore.includes(id))
    .map((id) => getOrbById(id))
    .filter((orb): orb is NonNullable<typeof orb> => orb !== undefined);

  const newEncounteredIds = new Set(nextState.run.encounteredEnemyIds);
  newEncounteredIds.add(defeatedEnemyId);

  return {
    ...nextState,
    enemies: nextState.enemies.filter(
      (enemy) => enemy.instanceId !== defeatedEnemy.instanceId,
    ),
    run: { ...nextState.run, encounteredEnemyIds: newEncounteredIds },
    lastDefeatedEnemyNames: [
      ...nextState.lastDefeatedEnemyNames,
      defeatedEnemy.name,
    ],
    rewardUnlockedOrbs: [...nextState.rewardUnlockedOrbs, ...newlyUnlockedOrbs],
  };
}

function processDefeatedEnemies(state: GameState): GameState {
  let nextState = state;
  for (const enemy of state.enemies) {
    if (enemy.currentHp <= 0) {
      nextState = processSingleEnemyDefeat(nextState, enemy);
    }
  }
  return nextState;
}

/**
 * 勝敗判定を行い、GamePhase を更新した GameState を返す
 * - ボス全滅 → "result" フェーズ（リザルト表示）
 * - 通常敵全滅 → "reward" フェーズ（報酬候補カードを生成）
 * - プレイヤー HP ≤ 0 → "result" フェーズ（敗北表示）
 */
function checkBattleEnd(state: GameState, rng: RngFn): GameState {
  const stateAfterDefeats = processDefeatedEnemies(state);
  if (stateAfterDefeats.enemies.length > 0) {
    if (stateAfterDefeats.player.currentHp <= 0) {
      return { ...stateAfterDefeats, phase: "result", outcome: "defeat" };
    }
    // 倒した敵がターゲットだった場合、生存敵に移す
    return reconcileSelectedTarget(stateAfterDefeats);
  }

  const defeatedBoss =
    state.enemies.length > 0 &&
    state.enemies.every((enemy) => enemy.tier === "boss");
  if (defeatedBoss) {
    let bossVictoryState: GameState = {
      ...stateAfterDefeats,
      phase: "result",
      outcome: "victory",
      pendingTargetCardId: null,
      log: addLog(stateAfterDefeats.log, "ボスを撃破した！ゲームクリア！"),
    };
    for (const relic of bossVictoryState.relics) {
      if (relic.effect.kind === "healOnBattleWin") {
        bossVictoryState = applyRelicEffect(
          bossVictoryState,
          relic.effect,
          relic.name,
        );
      }
    }
    return bossVictoryState;
  }

  if (stateAfterDefeats.player.currentHp <= 0) {
    return { ...stateAfterDefeats, phase: "result", outcome: "defeat" };
  }

  const isEliteBattle =
    state.enemies.length > 0 && state.enemies.every((e) => e.tier === "elite");
  const rewardGoldMin = isEliteBattle ? ELITE_REWARD_GOLD_MIN : REWARD_GOLD_MIN;
  const rewardGoldMax = isEliteBattle ? ELITE_REWARD_GOLD_MAX : REWARD_GOLD_MAX;
  const baseRewardGold =
    rewardGoldMin + Math.floor(rng() * (rewardGoldMax - rewardGoldMin + 1));
  const goldBonusPercent = stateAfterDefeats.relics.reduce(
    (sum, relic) =>
      relic.effect.kind === "goldGainBonus"
        ? sum + relic.effect.percentBonus
        : sum,
    0,
  );
  const rewardGold = Math.floor(baseRewardGold * (1 + goldBonusPercent / 100));
  const newRun = addStats(
    { ...stateAfterDefeats.run, gold: stateAfterDefeats.run.gold + rewardGold },
    {},
  );

  const mergedDeck = [
    ...stateAfterDefeats.player.deck,
    ...stateAfterDefeats.player.hand,
    ...stateAfterDefeats.player.discard,
  ];
  const newPlayer = {
    ...stateAfterDefeats.player,
    deck: mergedDeck,
    hand: [],
    discard: [],
  };

  const pool = createRewardPool();
  const weightedPool = createWeightedRewardPool(
    pool,
    stateAfterDefeats.run.startingDeckType,
  );
  const rewardCandidates = takeUniqueCards(
    shuffleArray(weightedPool, rng),
    REWARD_CARD_COUNT,
  );

  const potionRoll = rng();
  const potionSelectRoll = rng();
  const canReceivePotion =
    stateAfterDefeats.run.potions.length < MAX_POTION_SLOTS &&
    potionRoll < POTION_REWARD_CHANCE;
  const rewardPotion: Potion | null = canReceivePotion
    ? (ALL_POTIONS[Math.floor(potionSelectRoll * ALL_POTIONS.length)] ?? null)
    : null;
  const rewardRelic = isEliteBattle
    ? pickRelicReward(
        rng,
        new Set(stateAfterDefeats.relics.map((relic) => relic.id)),
      )
    : null;

  const defeatedNames = stateAfterDefeats.lastDefeatedEnemyNames.join("、");
  const potionLog =
    rewardPotion !== null
      ? `【ポーション報酬】${rewardPotion.name}が出現した。`
      : "";
  const relicLog =
    rewardRelic !== null ? `【遺物報酬】${rewardRelic.name}が出現した。` : "";

  let rewardState: GameState = {
    ...stateAfterDefeats,
    player: newPlayer,
    run: newRun,
    phase: "reward",
    rewardCandidates,
    rewardGold,
    rewardPotion,
    rewardRelic,
    pendingTargetCardId: null,
    log: addLog(
      stateAfterDefeats.log,
      `${defeatedNames}を倒した！${rewardGold}ゴールドを得た。報酬カードを1枚選んでください。${potionLog}${relicLog}`,
    ),
  };

  for (const relic of rewardState.relics) {
    if (relic.effect.kind === "healOnBattleWin") {
      rewardState = applyRelicEffect(rewardState, relic.effect, relic.name);
    }
  }

  return rewardState;
}

/**
 * ログに1行追加し、MAX_LOG_ENTRIES 件を超えたら古いエントリを削除する
 */
function addLog(log: readonly string[], message: string): readonly string[] {
  return [...log, message].slice(-MAX_LOG_ENTRIES);
}

function takeUniqueCards(
  cards: readonly Card[],
  count: number,
): readonly Card[] {
  const selected: Card[] = [];
  const selectedIds = new Set<string>();

  for (const card of cards) {
    if (selectedIds.has(card.id)) continue;
    selected.push(card);
    selectedIds.add(card.id);
    if (selected.length >= count) break;
  }

  return selected;
}

function getCardShopPrice(card: Card): number {
  switch (card.rarity) {
    case "common":
      return 40;
    case "uncommon":
      return 65;
    case "rare":
      return 100;
    default: {
      const _exhaustive: never = card.rarity;
      return _exhaustive;
    }
  }
}

function getRelicShopPrice(relic: Relic): number {
  switch (relic.rarity) {
    case "normal":
      return 90;
    case "uncommon":
      return 115;
    case "rare":
      return 140;
    case "legendary":
      return 220;
    default: {
      const _exhaustive: never = relic.rarity;
      return _exhaustive;
    }
  }
}

function createShopItems(state: GameState, rng: RngFn): ShopItems {
  const discountPercent = state.relics.reduce(
    (sum, relic) =>
      relic.effect.kind === "shopPriceDiscount"
        ? sum + relic.effect.percent
        : sum,
    0,
  );
  const applyDiscount = (price: number): number =>
    discountPercent > 0
      ? Math.max(1, Math.floor(price * (1 - discountPercent / 100)))
      : price;

  const weightedCards = createWeightedRewardPool(
    createRewardPool().filter((card) => !isOriginalCard(card)),
    state.run.startingDeckType,
  );
  const cards = takeUniqueCards(
    shuffleArray(weightedCards, rng),
    SHOP_CARD_COUNT,
  ).map((card) => ({ card, price: applyDiscount(getCardShopPrice(card)) }));
  const relics = shuffleArray(
    ALL_RELICS.filter(
      (relic) =>
        !relic.isStarter &&
        !state.relics.some((owned) => owned.id === relic.id),
    ),
    rng,
  )
    .slice(0, SHOP_RELIC_COUNT)
    .map((relic) => ({
      relic,
      price: applyDiscount(getRelicShopPrice(relic)),
    }));

  // ショップに1種類のポーションを陳列（所持していないものからランダム）
  const availablePotions = shuffleArray([...ALL_POTIONS], rng);
  const potions = availablePotions
    .slice(0, 1)
    .map((potion) => ({ potion, price: applyDiscount(potion.price) }));

  return {
    cards,
    relics,
    potions,
    cardRemovalPrice: SHOP_CARD_REMOVAL_PRICE,
  };
}

function addStatusStacks(
  statuses: ReadonlyMap<StatusEffect["kind"], number>,
  status: StatusEffect,
  stacks: number,
): {
  statuses: ReadonlyMap<StatusEffect["kind"], number>;
  totalStacks: number;
} {
  const totalStacks = (statuses.get(status.kind) ?? 0) + stacks;
  const updatedStatuses = new Map(statuses);
  updatedStatuses.set(status.kind, totalStacks);
  return { statuses: updatedStatuses, totalStacks };
}

function decayStatuses(
  statuses: ReadonlyMap<StatusEffect["kind"], number>,
  kinds: readonly StatusEffect["kind"][],
): ReadonlyMap<StatusEffect["kind"], number> {
  const decayedStatuses = new Map(statuses);
  for (const kind of kinds) {
    const stacks = statuses.get(kind);
    if (stacks !== undefined) {
      decayedStatuses.set(kind, Math.max(0, stacks - 1));
    }
  }
  return decayedStatuses;
}

/**
 * コストのエネルギー消費量を返す（exhaustive check）
 */
function getEnergyCost(cost: CardCost): number {
  switch (cost.kind) {
    case "fixed":
      return cost.energy;
    case "zero":
      return 0;
    case "variable":
      return 0;
    default: {
      const _never: never = cost;
      return _never;
    }
  }
}

function isFirstBattleTurn(state: GameState): boolean {
  return state.enemies.every((enemy) => enemy.battleTurn === 0);
}

function getFirstAttackRelics(state: GameState): readonly Relic[] {
  if (!isFirstBattleTurn(state) || state.attackCardsPlayedThisTurn > 0) {
    return [];
  }

  return state.relics.filter(
    (relic) => relic.effect.kind === "firstTurnFirstAttackBonus",
  );
}

function getMultiAttackFollowUpRelics(state: GameState): readonly Relic[] {
  if (!isFirstBattleTurn(state)) return [];

  return state.relics.filter(
    (relic) => relic.effect.kind === "firstTurnMultiAttackFollowUpBonus",
  );
}

function sumRelicEffectAmounts(
  relics: readonly Relic[],
  kind: "firstTurnFirstAttackBonus" | "firstTurnMultiAttackFollowUpBonus",
): number {
  return relics.reduce(
    (sum, relic) =>
      relic.effect.kind === kind ? sum + relic.effect.amount : sum,
    0,
  );
}

function addRelicActivationLog(
  state: GameState,
  relics: readonly Relic[],
  message: (relic: Relic) => string,
): GameState {
  if (relics.length === 0) return state;

  return {
    ...state,
    log: relics.reduce(
      (log, relic) => addLog(log, `【${relic.name}】${message(relic)}`),
      state.log,
    ),
    run: addStats(state.run, { relicEffectCount: relics.length }),
  };
}

/**
 * 遺物による攻撃ダメージのパッシブボーナスを合計する
 * - 鋭い針: 全攻撃カード+amount
 * - 曲がった剣: baseCost >= minCost の攻撃カード+amount
 */
function sumRelicPassiveAttackBonus(
  state: GameState,
  playedCard: Card | undefined,
): number {
  let bonus = 0;
  for (const relic of state.relics) {
    if (relic.effect.kind === "attackDamageBonus") {
      bonus += relic.effect.amount;
    } else if (relic.effect.kind === "highCostAttackDamageBonus") {
      const baseCost =
        playedCard !== undefined ? getEnergyCost(playedCard.cost) : 0;
      if (baseCost >= relic.effect.minCost) {
        bonus += relic.effect.amount;
      }
    }
  }
  return bonus;
}

/**
 * プレイヤーが敵へ毒を付与するときのボーナス（毒蛇の牙）
 */
function getPoisonApplyBonus(state: GameState): number {
  return state.relics.reduce(
    (sum, relic) =>
      relic.effect.kind === "bonusPoisonOnApply"
        ? sum + relic.effect.bonus
        : sum,
    0,
  );
}

/**
 * プレイヤーが敵へ裂傷を付与するときのボーナス（裂けた爪）
 */
function getLacerationApplyBonus(state: GameState): number {
  return state.relics.reduce(
    (sum, relic) =>
      relic.effect.kind === "bonusLacerationOnApply"
        ? sum + relic.effect.bonus
        : sum,
    0,
  );
}

/**
 * CardEffect を適用して state を更新する
 * playedCard: このエフェクトを持つカード（遺物のコスト判定に使用）
 */
function applyEffect(
  state: GameState,
  effect: CardEffect,
  rng: RngFn,
  playedCard?: Card,
): GameState {
  const firstAttackRelics = getFirstAttackRelics(state);
  const firstAttackRelicBonus = sumRelicEffectAmounts(
    firstAttackRelics,
    "firstTurnFirstAttackBonus",
  );
  const passiveRelicBonus = sumRelicPassiveAttackBonus(state, playedCard);

  switch (effect.kind) {
    case "attack": {
      const attackTotal =
        effect.amount +
        state.attackBonusThisTurn +
        firstAttackRelicBonus +
        passiveRelicBonus;
      const target = resolveAttackTarget(state, effect.target);
      if (target === null) return state;
      const bonusNote =
        state.attackBonusThisTurn > 0
          ? `（攻撃ポーション+${state.attackBonusThisTurn}）`
          : "";
      let nextState = state;
      for (const enemy of getTargetEnemies(nextState, target)) {
        nextState = applyDamageToEnemy(
          nextState,
          enemy,
          attackTotal,
          (newHp) =>
            `プレイヤーが${attackTotal}ダメージを与えた${bonusNote}。${enemy.name}HP: ${newHp}`,
        );
      }
      return addRelicActivationLog(nextState, firstAttackRelics, (relic) =>
        relic.effect.kind === "firstTurnFirstAttackBonus"
          ? `1ターン目の最初の攻撃カードを+${relic.effect.amount}した。`
          : "",
      );
    }

    case "block": {
      // 防御指示のボーナスを適用してからリセット
      const bonus = state.nextDefenseCardBonus;
      const total = effect.amount + bonus;
      const newBlock = state.player.block + total;
      const newPlayer = { ...state.player, block: newBlock };
      const bonusNote = bonus > 0 ? `（+${bonus}ボーナス）` : "";
      const newLog = addLog(
        state.log,
        `プレイヤーが${total}ブロックを得た${bonusNote}。ブロック: ${newBlock}`,
      );
      return {
        ...state,
        player: newPlayer,
        log: newLog,
        nextDefenseCardBonus: 0,
      };
    }

    case "draw": {
      const playerAfterDraw = drawCards(state.player, effect.count, rng);
      const newLog = addLog(state.log, `カードを${effect.count}枚ドローした。`);
      return { ...state, player: playerAfterDraw, log: newLog };
    }

    case "gainEnergy": {
      const newEnergy = state.player.energy + effect.amount;
      const newPlayer = { ...state.player, energy: newEnergy };
      const newLog = addLog(
        state.log,
        `エナジーを${effect.amount}得た。エナジー: ${newEnergy}`,
      );
      return { ...state, player: newPlayer, log: newLog };
    }

    case "applyStatus": {
      const target = getDefaultAttackTarget(state);
      if (target === null || target.kind !== "single") return state;
      const enemy = state.enemies.find(
        (candidate) => candidate.instanceId === target.instanceId,
      );
      if (enemy === undefined) return state;
      const poisonBonus =
        effect.status.kind === "poison" ? getPoisonApplyBonus(state) : 0;
      const lacerationBonus =
        effect.status.kind === "laceration"
          ? getLacerationApplyBonus(state)
          : 0;
      const totalStacks = effect.stacks + poisonBonus + lacerationBonus;
      const result = addStatusStacks(
        enemy.statuses,
        effect.status,
        totalStacks,
      );
      const newLog = addLog(
        state.log,
        `${enemy.name}に${effect.status.kind}を${totalStacks}付与した。（合計: ${result.totalStacks}）`,
      );
      return {
        ...updateEnemy(state, enemy.instanceId, (targetEnemy) => ({
          ...targetEnemy,
          statuses: result.statuses,
        })),
        log: newLog,
      };
    }

    case "multiAttack": {
      const target = resolveAttackTarget(state, effect.target);
      if (target === null) return state;
      const targets = getTargetEnemies(state, target);
      if (targets.length === 0) return state;
      const followUpRelics = getMultiAttackFollowUpRelics(state);
      const followUpRelicBonus = sumRelicEffectAmounts(
        followUpRelics,
        "firstTurnMultiAttackFollowUpBonus",
      );
      let didLogFirstAttackRelics = false;
      let didLogFollowUpRelics = false;
      let newState = state;
      for (let i = 0; i < effect.times; i++) {
        const currentTarget = getTargetEnemies(newState, target)[0];
        if (currentTarget === undefined) break;
        const hitDamage =
          effect.amount +
          state.attackBonusThisTurn +
          firstAttackRelicBonus +
          passiveRelicBonus +
          (i > 0 ? followUpRelicBonus : 0);
        newState = applyDamageToEnemy(
          newState,
          currentTarget,
          hitDamage,
          (newHp) =>
            `プレイヤーが${hitDamage}ダメージを与えた。${currentTarget.name}HP: ${newHp}`,
        );
        if (!didLogFirstAttackRelics) {
          newState = addRelicActivationLog(
            newState,
            firstAttackRelics,
            (relic) =>
              relic.effect.kind === "firstTurnFirstAttackBonus"
                ? `1ターン目の最初の攻撃カードを+${relic.effect.amount}した。`
                : "",
          );
          didLogFirstAttackRelics = true;
        }
        if (i > 0 && !didLogFollowUpRelics) {
          newState = addRelicActivationLog(newState, followUpRelics, (relic) =>
            relic.effect.kind === "firstTurnMultiAttackFollowUpBonus"
              ? `1ターン目の複数回攻撃の2回目以降を+${relic.effect.amount}した。`
              : "",
          );
          didLogFollowUpRelics = true;
        }
      }
      return newState;
    }

    case "selfDamage": {
      // ブロックを無視してプレイヤーに直接ダメージ
      const newHp = Math.max(0, state.player.currentHp - effect.amount);
      const newPlayer = { ...state.player, currentHp: newHp };
      const newLog = addLog(
        state.log,
        `捨て身の代償として自分に${effect.amount}ダメージ。HP: ${newHp}`,
      );
      return { ...state, player: newPlayer, log: newLog };
    }

    case "discard": {
      // カウンタの累積は playCard 側で行うため、ここでは何もしない
      // （即時ランダム除去から選択式捨てへ変更）
      return state;
    }

    case "conditionalAttack": {
      const conditionalBonus =
        state.attackCardsPlayedThisTurn > 0 ? effect.bonusAmount : 0;
      const total =
        effect.baseAmount +
        conditionalBonus +
        state.attackBonusThisTurn +
        firstAttackRelicBonus +
        passiveRelicBonus;
      const target = resolveAttackTarget(state, effect.target);
      if (target === null) return state;
      const bonusNote =
        conditionalBonus > 0 ? `（追撃+${conditionalBonus}）` : "";
      let nextState = state;
      for (const enemy of getTargetEnemies(nextState, target)) {
        nextState = applyDamageToEnemy(
          nextState,
          enemy,
          total,
          (newHp) =>
            `プレイヤーが${total}ダメージを与えた${bonusNote}。${enemy.name}HP: ${newHp}`,
        );
      }
      return addRelicActivationLog(nextState, firstAttackRelics, (relic) =>
        relic.effect.kind === "firstTurnFirstAttackBonus"
          ? `1ターン目の最初の攻撃カードを+${relic.effect.amount}した。`
          : "",
      );
    }

    case "costReductionNextCard": {
      const newLog = addLog(
        state.log,
        `次に使うカードのコストが${effect.amount}減少する。`,
      );
      return {
        ...state,
        nextCardCostReduction: state.nextCardCostReduction + effect.amount,
        log: newLog,
      };
    }

    case "buffNextDefense": {
      const newLog = addLog(
        state.log,
        `次に使う防御カードに${effect.amount}ブロックのボーナスが付く。`,
      );
      return {
        ...state,
        nextDefenseCardBonus: state.nextDefenseCardBonus + effect.amount,
        log: newLog,
      };
    }

    case "amplifyEnemyStatus": {
      const target = getDefaultAttackTarget(state);
      if (target === null || target.kind !== "single") return state;
      const enemy = state.enemies.find(
        (candidate) => candidate.instanceId === target.instanceId,
      );
      if (enemy === undefined) return state;
      const newStatuses = new Map(enemy.statuses);
      const poisonStacks = newStatuses.get("poison") ?? 0;
      const lacerationStacks = newStatuses.get("laceration") ?? 0;
      if (poisonStacks > 0)
        newStatuses.set("poison", poisonStacks + effect.amount);
      if (lacerationStacks > 0)
        newStatuses.set("laceration", lacerationStacks + effect.amount);
      const newLog = addLog(
        state.log,
        `${enemy.name}の毒と裂傷を${effect.amount}増幅した。`,
      );
      return {
        ...updateEnemy(state, enemy.instanceId, (targetEnemy) => ({
          ...targetEnemy,
          statuses: newStatuses,
        })),
        log: newLog,
      };
    }

    default: {
      // exhaustive check
      const _never: never = effect;
      return _never;
    }
  }
}

/**
 * 遺物効果を適用して GameState を更新する（exhaustive check）
 * - relicEffectCount を RunStats にインクリメントする
 *
 * @param state 現在の GameState
 * @param effect 適用する RelicEffect
 * @param relicName ログ用の遺物名
 */
function applyRelicEffect(
  state: GameState,
  effect: RelicEffect,
  relicName: string,
): GameState {
  switch (effect.kind) {
    case "blockOnTurnStartIfEmpty": {
      if (state.player.block !== 0) return state;

      const newBlock = state.player.block + effect.amount;
      const newPlayer = { ...state.player, block: newBlock };
      const newLog = addLog(
        state.log,
        `【${relicName}】ターン開始時に${effect.amount}ブロックを得た。ブロック: ${newBlock}`,
      );
      return {
        ...state,
        player: newPlayer,
        log: newLog,
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "poisonAllEnemiesOnBattleStart": {
      const enemies = state.enemies.map((enemy) => {
        const result = addStatusStacks(
          enemy.statuses,
          { kind: "poison" },
          effect.stacks,
        );
        return { ...enemy, statuses: result.statuses };
      });
      return {
        ...state,
        enemies,
        log: addLog(
          state.log,
          `【${relicName}】戦闘開始時に全ての敵へpoisonを${effect.stacks}付与した。`,
        ),
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "blockOnBattleStart": {
      const newBlock = state.player.block + effect.amount;
      return {
        ...state,
        player: { ...state.player, block: newBlock },
        log: addLog(
          state.log,
          `【${relicName}】戦闘開始時に${effect.amount}ブロックを得た。ブロック: ${newBlock}`,
        ),
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "extraEnergyOnFirstTurn": {
      const newEnergy = state.player.energy + effect.amount;
      return {
        ...state,
        player: { ...state.player, energy: newEnergy },
        log: addLog(
          state.log,
          `【${relicName}】1ターン目のエナジーを+${effect.amount}した。エナジー: ${newEnergy}`,
        ),
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "blockOnEliteBattleStart": {
      const isEliteBattle = state.enemies.some((e) => e.tier === "elite");
      if (!isEliteBattle) return state;
      const newBlock = state.player.block + effect.amount;
      return {
        ...state,
        player: { ...state.player, block: newBlock },
        log: addLog(
          state.log,
          `【${relicName}】エリート戦開始時に${effect.amount}ブロックを得た。ブロック: ${newBlock}`,
        ),
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "healOnBattleWin": {
      const newHp = Math.min(
        state.player.maxHp,
        state.player.currentHp + effect.amount,
      );
      const healed = newHp - state.player.currentHp;
      if (healed <= 0) return state;
      return {
        ...state,
        player: { ...state.player, currentHp: newHp },
        log: addLog(
          state.log,
          `【${relicName}】戦闘終了時にHPを${healed}回復した。HP: ${newHp}`,
        ),
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    // パッシブ効果（発火タイミングは呼び出し側で制御）
    case "firstTurnFirstAttackBonus":
    case "firstTurnMultiAttackFollowUpBonus":
    case "attackDamageBonus":
    case "highCostAttackDamageBonus":
    case "goldGainBonus":
    case "shopPriceDiscount":
    case "bonusPoisonOnApply":
    case "bonusLacerationOnApply":
    case "damageAllOnZeroCostCount":
    case "drawOnOriginalCardFirstUse":
      return state;

    default: {
      // exhaustive check
      const _never: never = effect;
      return _never;
    }
  }
}

/**
 * バトル開始時の共通初期化ヘルパー
 * - 遺物のバトル開始効果を全遺物に対して適用する
 * - startRun と proceedToNextRoom の両方から呼ぶことで、毎バトル確実に発火させる
 *
 * @param state 初期手札ドロー前の GameState（phase: "battle"）
 */
function initBattleState(state: GameState): GameState {
  let newState = state;

  // バトル開始時に先頭の生存敵をデフォルトターゲットとして設定
  const firstEnemy = newState.enemies[0];
  newState = {
    ...newState,
    selectedEnemyInstanceId: firstEnemy?.instanceId ?? null,
  };

  for (const relic of newState.relics) {
    if (
      relic.effect.kind === "poisonAllEnemiesOnBattleStart" ||
      relic.effect.kind === "blockOnBattleStart" ||
      relic.effect.kind === "extraEnergyOnFirstTurn" ||
      relic.effect.kind === "blockOnEliteBattleStart"
    ) {
      newState = applyRelicEffect(newState, relic.effect, relic.name);
    }
  }

  return newState;
}

/**
 * プレイヤーターン開始時の遺物効果を適用する。
 */
function applyTurnStartRelicEffects(state: GameState): GameState {
  let newState = state;

  for (const relic of newState.relics) {
    if (relic.effect.kind === "blockOnTurnStartIfEmpty") {
      newState = applyRelicEffect(newState, relic.effect, relic.name);
    }
  }

  return newState;
}

// ---- 公開関数 ----

/**
 * ラン開始時の初期 GameState を生成する
 * - RunConfig に基づいてデッキと初期遺物を選択する
 * - originalCard が非null なら9枚デッキの末尾に追加してから10枚でシャッフル
 * - originalCard が null なら「攻撃」を1枚追加して10枚でシャッフル
 * - 敵の初期状態をセット
 * - 遺物の戦闘開始効果を適用
 * - 最初に INITIAL_DRAW_COUNT 枚ドロー
 * - generateFloorMap(rng) でフロアマップを生成し RunState を初期化する
 */
export function startRun(
  config: RunConfig,
  originalCard: OriginalCard | null,
  rng: RngFn,
  persistentData?: {
    codexPoints: Record<string, number>;
    acquiredOrbIds: readonly string[];
    discoveredCardNames: readonly string[];
  },
): GameState {
  // 開始デッキタイプに応じてデッキと初期遺物を選択
  const starterDeck =
    config.startingDeckType === "combo"
      ? createComboDeck()
      : createStarterDeck();

  const starterRelic: Relic = (() => {
    switch (config.startingDeckType) {
      case "balanced":
        return ANCIENT_EMBLEM;
      case "combo":
        return SMALL_GEAR;
      case "guardian":
        return CRACKED_SHIELD;
      case "erosion":
        return BLACK_VIAL;
      default: {
        const _exhaustive: never = config.startingDeckType;
        return _exhaustive;
      }
    }
  })();

  // ラン開始時にオリジナルカードのエネミースロットを locked に変換
  const lockedOriginalCard =
    originalCard !== null ? lockEnemySlot(originalCard) : null;

  // オリジナルカードが指定されていればデッキ末尾に追加してからシャッフル
  const deckBeforeShuffle =
    lockedOriginalCard !== null
      ? [...starterDeck, lockedOriginalCard]
      : [...starterDeck, createFallbackAttackCard()];

  const shuffledDeck = shuffleArray(deckBeforeShuffle, rng);

  const initialPlayer: Player = {
    maxHp: INITIAL_PLAYER_HP,
    currentHp: INITIAL_PLAYER_HP,
    block: 0,
    energy: INITIAL_MAX_ENERGY,
    maxEnergy: INITIAL_MAX_ENERGY,
    hand: [],
    deck: shuffledDeck,
    discard: [],
    exhaust: [],
    statuses: new Map(),
  };

  const initialEnemy = createSlime(config.trialLevel, "slime-start");

  // PersistentData から図鑑状態を復元
  const codexPoints = persistentData?.codexPoints ?? {};
  const acquiredOrbIds = persistentData?.acquiredOrbIds ?? [];
  const initialCodexState = buildCodexState(codexPoints, acquiredOrbIds);
  const discoveredCardNames = buildDiscoveredCardNames(
    persistentData === undefined ||
      persistentData.discoveredCardNames === undefined
      ? []
      : persistentData.discoveredCardNames,
  );

  // フロアマップを生成し RunState を初期化する
  const floorMap = generateFloorMap(rng);
  const initialRunState: RunState = {
    map: floorMap,
    currentNodeId: "", // ラン開始時は未選択
    visitedNodeIds: new Set<string>(),
    gold: 100,
    stats: {
      totalDamageDealt: 0,
      totalDamageBlocked: 0,
      originalCardUsedCount: 0,
      relicEffectCount: 0,
    },
    startingDeckType: config.startingDeckType,
    evolveProgress: new Map<string, number>(),
    potions: [],
    codexState: initialCodexState,
    acquiredOrbIds,
    discoveredCardNames,
    encounteredEnemyIds: new Set<string>(),
    lastBattleDamageReceived: 0,
    trialLevel: config.trialLevel,
    chainEventFlags: new Map<string, number>(),
  };

  const initialState: GameState = {
    player: initialPlayer,
    enemies: [initialEnemy],
    turn: "player",
    phase: "battle",
    outcome: null,
    log: ["ラン開始！バトル開始！"],
    rewardCandidates: [],
    rewardGold: 0,
    lastDefeatedEnemyNames: [],
    roomNumber: 1,
    relics: [starterRelic],
    cardsPlayedThisTurn: 0,
    attackCardsPlayedThisTurn: 0,
    nextCardCostReduction: 0,
    nextDefenseCardBonus: 0,
    shopItems: EMPTY_SHOP_ITEMS,
    run: initialRunState,
    pendingDiscard: null,
    pendingTargetCardId: null,
    selectedEnemyInstanceId: null, // initBattleState で設定される
    attackBonusThisTurn: 0,
    rewardPotion: null,
    rewardRelic: null,
    rewardUnlockedOrbs: [],
    zeroCostCardsPlayedThisBattle: 0,
    originalCardUsedThisBattle: false,
    activeEvent: null,
  };

  // バトル開始時の遺物効果を適用（古びた紋章など）
  const stateAfterRelics = initBattleState(initialState);

  // 最初のプレイヤーターン開始時の遺物効果を適用
  const stateAfterTurnStartRelics =
    applyTurnStartRelicEffects(stateAfterRelics);

  // 最初の手札をドロー
  const playerAfterDraw = drawCards(
    stateAfterTurnStartRelics.player,
    INITIAL_DRAW_COUNT,
    rng,
  );
  return {
    ...stateAfterTurnStartRelics,
    player: playerAfterDraw,
  };
}

/**
 * @deprecated startRun を使用してください。後方互換のため残す。
 * バトル開始時の初期 GameState を生成する（均衡型デッキで開始）
 */
export function startBattle(rng: RngFn): GameState {
  return startRun(
    { startingDeckType: "balanced", originalCardId: null, trialLevel: 0 },
    null,
    rng,
  );
}

/** カードが攻撃系かどうか判定する（追撃カウンタのインクリメント条件） */
function isAttackCard(card: Card): boolean {
  return card.effects.some(
    (e) =>
      e.kind === "attack" ||
      e.kind === "multiAttack" ||
      e.kind === "conditionalAttack",
  );
}

/**
 * カードをプレイして GameState を更新する
 * - コスト削減（集中の効果）を考慮してエネルギーチェック・消費
 * - 廃棄フラグ付きカードは捨て札でなく廃棄置き場へ
 * - attackCardsPlayedThisTurn で攻撃カードのプレイ回数を追跡
 * - オリジナルカードのプレイを検出し originalCardUsedCount をインクリメント
 */
export function playCard(
  state: GameState,
  cardId: string,
  rng: RngFn,
): GameState {
  // バトル中以外はカードをプレイできない
  if (state.phase !== "battle") return state;
  // 敵のターン中はカードをプレイできない
  if (state.turn !== "player") return state;

  // 手札から対象カードを探す
  const card = state.player.hand.find((c) => c.id === cardId);
  if (card === undefined) return state;

  // コスト削減を適用した実効コストを計算
  const hasLightweight =
    card.cardSlot?.kind === "filled" &&
    card.cardSlot.effect.kind === "lightweight";
  const baseCost = getEnergyCost(card.cost);
  const effectiveCost = hasLightweight
    ? 0
    : Math.max(0, baseCost - state.nextCardCostReduction);
  const canPlay =
    card.cost.kind === "zero" ||
    hasLightweight ||
    state.player.energy >= effectiveCost;

  if (!canPlay) {
    const newLog = addLog(state.log, `エナジーが足りません（${card.name}）。`);
    return { ...state, log: newLog };
  }

  // エネルギーを消費し、コスト削減をリセット
  const newPlayer = {
    ...state.player,
    energy: state.player.energy - effectiveCost,
  };
  let newState: GameState = {
    ...state,
    player: newPlayer,
    nextCardCostReduction: 0,
  };

  // ログにカードプレイを記録
  newState = {
    ...newState,
    log: addLog(newState.log, `プレイヤーが${card.name}をプレイした。`),
  };

  // オリジナルカード以外は、使用時にカード図鑑へ登録する
  if (!isOriginalCard(card)) {
    newState = registerCardUsage(newState, card.name);
  }

  // オリジナルカードのプレイを検出し originalCardUsedCount をインクリメント
  if (isOriginalCard(card)) {
    newState = {
      ...newState,
      run: addStats(newState.run, { originalCardUsedCount: 1 }),
    };
    // 空紋の欠片: このバトルで初めてオリジナルカードを使ったとき2ドロー
    if (!newState.originalCardUsedThisBattle) {
      newState = { ...newState, originalCardUsedThisBattle: true };
      for (const relic of newState.relics) {
        if (relic.effect.kind === "drawOnOriginalCardFirstUse") {
          const playerAfterDraw = drawCards(
            newState.player,
            relic.effect.count,
            rng,
          );
          newState = {
            ...newState,
            player: playerAfterDraw,
            log: addLog(
              newState.log,
              `【${relic.name}】オリジナルカード初使用で${relic.effect.count}枚ドローした。`,
            ),
            run: addStats(newState.run, { relicEffectCount: 1 }),
          };
        }
      }
    }
    // エネミーオーブ効果を適用（装着済みかつラン中）
    const originalCard = card;
    if (originalCard.enemySlot.kind === "filled") {
      const orb = getOrbById(originalCard.enemySlot.orbId);
      if (orb !== undefined) {
        const orbEffect = orb.effect;
        switch (orbEffect.kind) {
          case "blockOnOriginalCardPlay": {
            const newBlock = newState.player.block + orbEffect.amount;
            newState = {
              ...newState,
              player: { ...newState.player, block: newBlock },
              log: addLog(
                newState.log,
                `【${orb.name}】オリジナルカード使用で${orbEffect.amount}ブロックを得た。ブロック: ${newBlock}`,
              ),
            };
            break;
          }
          default: {
            // 将来の種別追加を型で検出するための exhaustive check
            const _exhaustive: never = orbEffect.kind;
            throw new Error(`未処理のオーブ効果: ${_exhaustive}`);
          }
        }
      }
    }
  }

  // discard エフェクトの合計を事前に集計する（playCard 末尾で解決）
  const pendingDiscardCount = card.effects.reduce(
    (total, effect) =>
      effect.kind === "discard" ? total + effect.count : total,
    0,
  );

  // 全エフェクトを順に適用
  for (const effect of card.effects) {
    newState = applyEffect(newState, effect, rng, card);
  }

  if (isOriginalCard(card) && card.compensation?.kind === "hpCost") {
    const hpCost = card.compensation.amount;
    const newHp = Math.max(0, newState.player.currentHp - hpCost);
    newState = {
      ...newState,
      player: { ...newState.player, currentHp: newHp },
      log: addLog(
        newState.log,
        `代償としてHPを${hpCost}消費した。プレイヤーHP: ${newHp}`,
      ),
    };
  }

  let shouldRetain = false;
  if (card.cardSlot?.kind === "filled") {
    const forgeEffect = card.cardSlot.effect;
    switch (forgeEffect.kind) {
      case "poisonOnAttack": {
        if (isAttackCard(card)) {
          const target = resolveAttackTarget(
            newState,
            getCardAttackTarget(card),
          );
          if (target === null) break;
          const enemy = getTargetEnemies(newState, target)[0];
          if (enemy === undefined) break;
          const forgePoison =
            forgeEffect.stacks + getPoisonApplyBonus(newState);
          const result = addStatusStacks(
            enemy.statuses,
            { kind: "poison" },
            forgePoison,
          );
          newState = {
            ...updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
              ...targetEnemy,
              statuses: result.statuses,
            })),
            log: addLog(
              newState.log,
              `鍛冶効果で${enemy.name}にpoisonを${forgePoison}付与した。（合計: ${result.totalStacks}）`,
            ),
          };
        }
        break;
      }

      case "healOnUse": {
        const newHp = Math.min(
          newState.player.maxHp,
          newState.player.currentHp + forgeEffect.amount,
        );
        const healedAmount = newHp - newState.player.currentHp;
        newState = {
          ...newState,
          player: { ...newState.player, currentHp: newHp },
          log: addLog(
            newState.log,
            `鍛冶効果でHPを${healedAmount}回復した。プレイヤーHP: ${newHp}`,
          ),
        };
        break;
      }

      case "reflectOnBlock": {
        if (card.effects.some((effect) => effect.kind === "block")) {
          const target = getDefaultAttackTarget(newState);
          if (target === null) break;
          const enemy = getTargetEnemies(newState, target)[0];
          if (enemy === undefined) break;
          newState = applyDamageToEnemy(
            newState,
            enemy,
            forgeEffect.amount,
            (newHp) =>
              `鍛冶効果で${enemy.name}に${forgeEffect.amount}ダメージを与えた。${enemy.name}HP: ${newHp}`,
          );
        }
        break;
      }

      case "retain":
        shouldRetain = true;
        break;

      case "lightweight":
        break;

      default: {
        const _exhaustive: never = forgeEffect;
        return _exhaustive;
      }
    }
  }

  // retain は使用カードを手札に残す。廃棄カードよりも優先する。
  if (shouldRetain) {
    const handContainsCard = newState.player.hand.includes(card);
    newState = {
      ...newState,
      player: {
        ...newState.player,
        hand: handContainsCard
          ? newState.player.hand
          : [...newState.player.hand, card],
        discard: newState.player.discard.filter(
          (discardedCard) => discardedCard !== card,
        ),
      },
    };
  } else if (card.exhaust === true) {
    // 廃棄カードは exhaust 置き場へ、それ以外は捨て札へ
    const handWithout = newState.player.hand.filter((c) => c.id !== cardId);
    const newExhaust = [...newState.player.exhaust, card];
    newState = {
      ...newState,
      player: { ...newState.player, hand: handWithout, exhaust: newExhaust },
      log: addLog(newState.log, `${card.name}を廃棄した。`),
    };
  } else {
    const playerAfterDiscard = discardCard(newState.player, cardId);
    newState = { ...newState, player: playerAfterDiscard };
  }

  // cardsPlayedThisTurn と attackCardsPlayedThisTurn をインクリメント
  const newCardsPlayedThisTurn = newState.cardsPlayedThisTurn + 1;
  const newAttackCardsPlayedThisTurn = isAttackCard(card)
    ? newState.attackCardsPlayedThisTurn + 1
    : newState.attackCardsPlayedThisTurn;

  // 錆びた歯車: 0コストカード累計カウンタを更新し、閾値に達したら敵全体にダメージ
  const isZeroCost = getEnergyCost(card.cost) === 0;
  const newZeroCostCount = isZeroCost
    ? newState.zeroCostCardsPlayedThisBattle + 1
    : newState.zeroCostCardsPlayedThisBattle;
  newState = {
    ...newState,
    cardsPlayedThisTurn: newCardsPlayedThisTurn,
    attackCardsPlayedThisTurn: newAttackCardsPlayedThisTurn,
    zeroCostCardsPlayedThisBattle: newZeroCostCount,
  };

  if (isZeroCost && newZeroCostCount % 3 === 0) {
    for (const relic of newState.relics) {
      if (relic.effect.kind === "damageAllOnZeroCostCount") {
        const { damage } = relic.effect;
        for (const enemy of getLivingEnemies(newState)) {
          newState = applyDamageToEnemy(
            newState,
            enemy,
            damage,
            (newHp) =>
              `【${relic.name}】0コスト3枚で${enemy.name}に${damage}ダメージ。${enemy.name}HP: ${newHp}`,
          );
        }
        newState = {
          ...newState,
          run: addStats(newState.run, { relicEffectCount: 1 }),
        };
      }
    }
  }

  if (isEvolveCard(card)) {
    newState = updateEvolveProgress(newState, card);
  }

  // 勝敗判定
  newState = checkBattleEnd(newState, rng);

  // pendingDiscard の解決
  if (pendingDiscardCount > 0) {
    // 敵撃破等でバトルフェーズ外に遷移した場合はそのまま返す
    if (newState.phase !== "battle") {
      newState = { ...newState, pendingDiscard: null };
    } else if (newState.player.hand.length === 0) {
      // 手札が空なら自動全廃棄（すでに空なので何もしない）
      newState = { ...newState, pendingDiscard: null };
    } else if (pendingDiscardCount >= newState.player.hand.length) {
      // pendingCount が手札枚数以上なら全て自動廃棄
      const autoDiscarded = newState.player.hand;
      const newDiscard = [...newState.player.discard, ...autoDiscarded];
      newState = {
        ...newState,
        player: { ...newState.player, hand: [], discard: newDiscard },
        pendingDiscard: null,
      };
    } else {
      // プレイヤーに選択を委ねる
      newState = {
        ...newState,
        pendingDiscard: { count: pendingDiscardCount },
      };
    }
  }

  return newState;
}

/**
 * デフォルトターゲットを変更する（攻撃は行わない）
 * タスク4: 毎回ターゲット選択UIを出す旧フローを廃止し、「ターゲット変更」専用の関数とした。
 * main.ts の onSelectTarget コールバックから呼ばれる。
 */
export function selectTarget(
  state: GameState,
  instanceId: string,
  _rng: RngFn,
): GameState {
  if (state.phase !== "battle") return state;
  const targetEnemy = state.enemies.find(
    (enemy) => enemy.instanceId === instanceId && enemy.currentHp > 0,
  );
  if (targetEnemy === undefined) return state;

  return {
    ...state,
    selectedEnemyInstanceId: targetEnemy.instanceId,
  };
}

function executeEnemyAction(state: GameState, enemy: Enemy): GameState {
  const action = enemy.nextAction;
  let newState = state;

  switch (action.kind) {
    case "attack": {
      const { newHp, newBlock, blockedAmount } = applyDamage(
        newState.player.currentHp,
        newState.player.block,
        action.amount,
        enemy.statuses,
        newState.player.statuses,
      );
      const actualDamage = newState.player.currentHp - newHp;
      return {
        ...newState,
        player: { ...newState.player, currentHp: newHp, block: newBlock },
        log: addLog(
          newState.log,
          `${enemy.name}が${action.amount}ダメージを与えた。プレイヤーHP: ${newHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: blockedAmount }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + actualDamage,
        },
      };
    }
    case "block": {
      return {
        ...updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
          ...targetEnemy,
          block: targetEnemy.block + action.amount,
        })),
        log: addLog(
          newState.log,
          `${enemy.name}が${action.amount}ブロックを得た。`,
        ),
      };
    }
    case "multiAttack": {
      let totalBlocked = 0;
      let totalHpLost = 0;
      for (let i = 0; i < action.times; i++) {
        const prevHp = newState.player.currentHp;
        const hit = applyDamage(
          newState.player.currentHp,
          newState.player.block,
          action.amount,
          enemy.statuses,
          newState.player.statuses,
        );
        totalBlocked += hit.blockedAmount;
        totalHpLost += prevHp - hit.newHp;
        newState = {
          ...newState,
          player: {
            ...newState.player,
            currentHp: hit.newHp,
            block: hit.newBlock,
          },
        };
        if (hit.newHp <= 0) break;
      }
      return {
        ...newState,
        log: addLog(
          newState.log,
          `${enemy.name}が${action.amount}×${action.times}の連撃を与えた。プレイヤーHP: ${newState.player.currentHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: totalBlocked }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + totalHpLost,
        },
      };
    }
    case "attackAndApplyStatus": {
      const { newHp, newBlock, blockedAmount } = applyDamage(
        newState.player.currentHp,
        newState.player.block,
        action.amount,
        enemy.statuses,
        newState.player.statuses,
      );
      const actualDamage = newState.player.currentHp - newHp;
      const statusResult = addStatusStacks(
        newState.player.statuses,
        action.status,
        action.stacks,
      );
      return {
        ...newState,
        player: {
          ...newState.player,
          currentHp: newHp,
          block: newBlock,
          statuses: statusResult.statuses,
        },
        log: addLog(
          newState.log,
          `${enemy.name}が${action.amount}ダメージ＋${action.status.kind}${action.stacks}を与えた。プレイヤーHP: ${newHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: blockedAmount }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + actualDamage,
        },
      };
    }
    case "applyStatus": {
      if (action.target === "player") {
        const result = addStatusStacks(
          newState.player.statuses,
          action.status,
          action.stacks,
        );
        return {
          ...newState,
          player: { ...newState.player, statuses: result.statuses },
          log: addLog(
            newState.log,
            `${enemy.name}がプレイヤーに${action.status.kind}を${action.stacks}付与した。（合計: ${result.totalStacks}）`,
          ),
        };
      }
      const result = addStatusStacks(
        enemy.statuses,
        action.status,
        action.stacks,
      );
      return {
        ...updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
          ...targetEnemy,
          statuses: result.statuses,
        })),
        log: addLog(
          newState.log,
          `${enemy.name}が自身に${action.status.kind}を${action.stacks}付与した。（合計: ${result.totalStacks}）`,
        ),
      };
    }
    case "buff": {
      const result = addStatusStacks(
        enemy.statuses,
        action.status,
        action.stacks,
      );
      return {
        ...updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
          ...targetEnemy,
          statuses: result.statuses,
        })),
        log: addLog(
          newState.log,
          `${enemy.name}が${action.description}を行い、${action.status.kind}を${action.stacks}得た。（合計: ${result.totalStacks}）`,
        ),
      };
    }
    case "omen":
      return {
        ...newState,
        log: addLog(newState.log, `${enemy.name}の予兆: ${action.description}`),
      };
    case "blockAndAttack": {
      newState = updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
        ...targetEnemy,
        block: targetEnemy.block + action.blockAmount,
      }));
      const { newHp, newBlock, blockedAmount } = applyDamage(
        newState.player.currentHp,
        newState.player.block,
        action.attackAmount,
        enemy.statuses,
        newState.player.statuses,
      );
      const actualDamage = newState.player.currentHp - newHp;
      return {
        ...newState,
        player: { ...newState.player, currentHp: newHp, block: newBlock },
        log: addLog(
          newState.log,
          `${enemy.name}が${action.blockAmount}ブロックを得て、${action.attackAmount}ダメージを与えた。プレイヤーHP: ${newHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: blockedAmount }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + actualDamage,
        },
      };
    }
    case "idle":
      return {
        ...newState,
        log: addLog(newState.log, `${enemy.name}は何もしなかった。`),
      };
    default: {
      const _never: never = action;
      return _never;
    }
  }
}

/**
 * プレイヤーターンを終了し、敵のターンを処理する
 * 1. 手札を全て捨て札に移動
 * 2. cardsPlayedThisTurn を 0 にリセット
 * 3. 敵のブロックをリセットして nextAction を実行
 * 4. 勝敗判定
 * 5. 次ターンの準備（ドロー・エネルギーリセット・敵 nextAction 更新）
 */
export function endPlayerTurn(state: GameState, rng: RngFn): GameState {
  if (state.phase !== "battle") return state;

  const playerAfterDiscard = discardHand(state.player);
  let newState: GameState = {
    ...state,
    player: playerAfterDiscard,
    turn: "enemy",
    pendingDiscard: null,
    pendingTargetCardId: null,
    cardsPlayedThisTurn: 0,
    attackCardsPlayedThisTurn: 0,
    nextCardCostReduction: 0,
    nextDefenseCardBonus: 0,
    attackBonusThisTurn: 0,
    log: addLog(state.log, "プレイヤーがターンを終了した。"),
  };

  const livingEnemies = getLivingEnemies(newState);
  for (const enemy of livingEnemies) {
    newState = updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
      ...targetEnemy,
      block: 0,
    }));
    const currentEnemy = newState.enemies.find(
      (candidate) => candidate.instanceId === enemy.instanceId,
    );
    if (currentEnemy === undefined) continue;
    newState = executeEnemyAction(newState, currentEnemy);
    if (newState.player.currentHp <= 0) break;
  }

  const playerPoisonStacks = newState.player.statuses.get("poison") ?? 0;
  if (playerPoisonStacks > 0) {
    const { newHp, newBlock } = applyDamage(
      newState.player.currentHp,
      newState.player.block,
      playerPoisonStacks,
    );
    const tickedStatuses = new Map(newState.player.statuses);
    tickedStatuses.set("poison", playerPoisonStacks - 1);
    newState = {
      ...newState,
      player: {
        ...newState.player,
        currentHp: newHp,
        block: newBlock,
        statuses: tickedStatuses,
      },
      log: addLog(
        newState.log,
        `毒でプレイヤーに${playerPoisonStacks}ダメージ。プレイヤーHP: ${newHp}`,
      ),
    };
  }

  for (const enemy of newState.enemies) {
    const poisonStacks = enemy.statuses.get("poison") ?? 0;
    const lacerationStacks = enemy.statuses.get("laceration") ?? 0;
    const statusDamage = poisonStacks + lacerationStacks;
    if (statusDamage <= 0) continue;

    const { newHp, newBlock } = applyDamage(
      enemy.currentHp,
      enemy.block,
      statusDamage,
    );
    const tickedStatuses = new Map(enemy.statuses);
    // 毒は1ずつ減少、裂傷は減少しない
    if (poisonStacks > 0) tickedStatuses.set("poison", poisonStacks - 1);
    newState = {
      ...updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
        ...targetEnemy,
        currentHp: newHp,
        block: newBlock,
        statuses: tickedStatuses,
      })),
      log: addLog(
        newState.log,
        `ステータス効果で${enemy.name}に${statusDamage}ダメージ。${enemy.name}HP: ${newHp}`,
      ),
    };
  }

  const playerStatusesAfterDecay = decayStatuses(newState.player.statuses, [
    "weak",
    "vulnerable",
  ]);
  const enemiesAfterDecay = newState.enemies.map((enemy) => ({
    ...enemy,
    statuses: decayStatuses(enemy.statuses, ["weak", "vulnerable"]),
  }));
  newState = {
    ...newState,
    player: { ...newState.player, statuses: playerStatusesAfterDecay },
    enemies: enemiesAfterDecay,
  };

  newState = checkBattleEnd(newState, rng);
  if (newState.phase !== "battle") return newState;

  const enemiesForNextTurn = newState.enemies.map((enemy) => {
    const nextBattleTurn = enemy.battleTurn + 1;
    return {
      ...enemy,
      battleTurn: nextBattleTurn,
      nextAction: enemy.behavior.selectAction({
        turn: nextBattleTurn,
        enemyHp: enemy.currentHp,
        playerHp: newState.player.currentHp,
      }),
    };
  });

  newState = {
    ...newState,
    enemies: enemiesForNextTurn,
    player: {
      ...newState.player,
      energy: newState.player.maxEnergy,
      block: 0,
    },
    turn: "player",
  };

  newState = applyTurnStartRelicEffects(newState);
  const playerAfterDraw = drawCards(newState.player, TURN_DRAW_COUNT, rng);
  return { ...newState, player: playerAfterDraw };
}

/**
 * プレイヤーが手動で捨てるカードを選択する
 * - pendingDiscard が非null かつ バトルフェーズのときのみ有効
 * - 指定カードを手札から捨て札に移し、count を1減らす
 * - count が 0 になると pendingDiscard を null にする
 */
export function selectDiscardCard(state: GameState, cardId: string): GameState {
  // バトル中かつ捨て選択待ち状態のみ有効
  if (state.phase !== "battle") return state;
  if (state.pendingDiscard === null) return state;

  // 手札に対象カードが存在するか確認
  const cardExists = state.player.hand.some((c) => c.id === cardId);
  if (!cardExists) return state;

  // 手札から対象カードを捨て札に移す
  const playerAfterDiscard = discardCard(state.player, cardId);

  // count を1減らす
  const newCount = state.pendingDiscard.count - 1;
  const newPendingDiscard = newCount <= 0 ? null : { count: newCount };

  return {
    ...state,
    player: playerAfterDiscard,
    pendingDiscard: newPendingDiscard,
  };
}

/**
 * 報酬フェーズでカードを1枚選択してデッキに追加し、"map" フェーズへ遷移する
 * 追加したカードは proceedToNextRoom() でデッキ統合時に次バトルへ引き継がれる
 */
export function selectRewardCard(state: GameState, cardId: string): GameState {
  // 報酬フェーズ以外は何もしない
  if (state.phase !== "reward") return state;

  // 候補リストに存在するカードかチェック
  const selectedCard = state.rewardCandidates.find((c) => c.id === cardId);
  if (selectedCard === undefined) return state;

  // 選択したカードをデッキに追加
  const newDeck = [...state.player.deck, selectedCard];
  const newPlayer = { ...state.player, deck: newDeck };
  const newLog = addLog(state.log, `${selectedCard.name} をデッキに追加した。`);

  return {
    ...state,
    player: newPlayer,
    phase: state.rewardRelic === null ? "map" : "reward",
    rewardCandidates: [],
    rewardGold: 0,
    rewardPotion: null,
    rewardUnlockedOrbs: [],
    lastDefeatedEnemyNames: [],
    log: newLog,
  };
}

/**
 * 報酬フェーズをスキップして "map" フェーズへ遷移する
 */
export function skipReward(state: GameState): GameState {
  // 報酬フェーズ以外は何もしない
  if (state.phase !== "reward") return state;

  const newLog = addLog(state.log, "報酬をスキップした。");

  return {
    ...state,
    phase: state.rewardRelic === null ? "map" : "reward",
    rewardCandidates: [],
    rewardGold: 0,
    rewardPotion: null,
    rewardUnlockedOrbs: [],
    lastDefeatedEnemyNames: [],
    log: newLog,
  };
}

/**
 * マップフェーズでノードを選択し、種別に応じて次のフェーズへ遷移する
 * - battle/boss: 選択したノードに対応する敵を生成してバトル開始
 * - rest: 休憩所フェーズへ遷移
 * - forge: 鍛冶所フェーズへ遷移
 * - shop: 商品を生成してショップフェーズへ遷移
 * currentNodeId と visitedNodeIds を更新する
 */
export function selectNode(
  state: GameState,
  nodeId: string,
  rng: RngFn,
): GameState {
  // マップフェーズ以外は何もしない
  if (state.phase !== "map") return state;

  const node = findNode(state.run.map, nodeId);
  if (node === undefined) return state;

  // 訪問済み更新
  const newVisitedNodeIds = new Set(state.run.visitedNodeIds);
  newVisitedNodeIds.add(nodeId);
  const newRun: RunState = {
    ...state.run,
    currentNodeId: nodeId,
    visitedNodeIds: newVisitedNodeIds,
  };

  switch (node.kind) {
    case "rest":
      // 休憩所へ遷移
      return {
        ...state,
        run: newRun,
        phase: "rest",
        log: addLog(state.log, "休憩所に到着した。"),
      };

    case "forge":
      return {
        ...state,
        run: newRun,
        phase: "forge",
        log: addLog(state.log, "鍛冶所に到着した。"),
      };

    case "shop":
      return {
        ...state,
        run: newRun,
        phase: "shop",
        shopItems: createShopItems(state, rng),
        log: addLog(state.log, "ショップに到着した。"),
      };

    case "treasure": {
      const rewardRelic = pickRelicReward(
        rng,
        new Set(state.relics.map((relic) => relic.id)),
      );
      return {
        ...state,
        run: newRun,
        phase: "treasure",
        rewardRelic,
        log: addLog(
          state.log,
          rewardRelic !== null
            ? `宝箱を開けた。${rewardRelic.name}を見つけた！`
            : "宝箱を開けたが、入手できる遺物はなかった。",
        ),
      };
    }

    case "event": {
      const eventDef = selectEventDefinition(state.run.chainEventFlags, rng);
      if (eventDef === null) {
        return {
          ...state,
          run: newRun,
          phase: "map",
          activeEvent: null,
          log: addLog(state.log, "イベントは起きなかった。"),
        };
      }
      return {
        ...state,
        run: newRun,
        phase: "event",
        activeEvent: eventDef,
        log: addLog(state.log, `${eventDef.title}`),
      };
    }

    case "battle":
    case "elite":
    case "boss": {
      // バトル開始
      // 1. デッキ（手札+捨て札+山札を統合）をシャッフル
      const mergedDeck = [
        ...state.player.deck,
        ...state.player.hand,
        ...state.player.discard,
      ];
      const shuffledDeck = shuffleArray(mergedDeck, rng);

      // 2. プレイヤーをリセット（HP と exhaust のみ引き継ぐ）
      const resetPlayer: Player = {
        maxHp: state.player.maxHp,
        currentHp: state.player.currentHp,
        block: 0,
        energy: state.player.maxEnergy,
        maxEnergy: state.player.maxEnergy,
        hand: [],
        deck: shuffledDeck,
        discard: [],
        exhaust: state.player.exhaust,
        statuses: new Map(),
      };

      // 3. ノード種別に応じて敵を選択
      const nextRoomNumber = state.roomNumber + 1;
      const trialLevel = state.run.trialLevel;
      const nextEnemies =
        node.kind === "boss"
          ? [createBossEnemy(trialLevel)]
          : node.kind === "elite"
            ? createEliteEnemyGroup(rng)
            : createNormalEnemyGroup(rng, trialLevel);

      // 4. 新しい GameState を生成
      // 初遭遇判定のため encounteredEnemyIds に次の敵IDを追加する
      // encounteredEnemyIds への追加は checkPhase の撃破後に行う（初遭遇判定のため）
      const runWithEncountered: typeof newRun = {
        ...newRun,
        lastBattleDamageReceived: 0,
      };
      const newState: GameState = {
        player: resetPlayer,
        enemies: nextEnemies,
        turn: "player",
        phase: "battle",
        outcome: null,
        log: [`部屋 ${nextRoomNumber} に進んだ。バトル開始！`],
        rewardCandidates: [],
        rewardGold: 0,
        rewardPotion: null,
        rewardRelic: null,
        rewardUnlockedOrbs: [],
        lastDefeatedEnemyNames: [],
        roomNumber: nextRoomNumber,
        relics: state.relics,
        cardsPlayedThisTurn: 0,
        attackCardsPlayedThisTurn: 0,
        nextCardCostReduction: 0,
        nextDefenseCardBonus: 0,
        attackBonusThisTurn: 0,
        shopItems: EMPTY_SHOP_ITEMS,
        run: runWithEncountered,
        pendingDiscard: null,
        pendingTargetCardId: null,
        selectedEnemyInstanceId: null, // initBattleState で設定される
        zeroCostCardsPlayedThisBattle: 0,
        originalCardUsedThisBattle: false,
        activeEvent: null,
      };

      // 5. バトル開始時の遺物効果を適用
      const stateAfterRelics = initBattleState(newState);

      // 6. 最初のプレイヤーターン開始時の遺物効果を適用
      const stateAfterTurnStartRelics =
        applyTurnStartRelicEffects(stateAfterRelics);

      // 7. 初期手札をドロー
      const playerAfterDraw = drawCards(
        stateAfterTurnStartRelics.player,
        INITIAL_DRAW_COUNT,
        rng,
      );
      return {
        ...stateAfterTurnStartRelics,
        player: playerAfterDraw,
      };
    }

    default: {
      // 将来 NodeKind に種別が追加された場合にコンパイルエラーを発生させる exhaustive check
      const _exhaustive: never = node.kind;
      return _exhaustive;
    }
  }
}

/**
 * マップフェーズから次の部屋へ進み、新しいバトルの GameState を生成する
 * @deprecated selectNode を使用してください。後方互換のため残す。
 */
export function proceedToNextRoom(state: GameState, rng: RngFn): GameState {
  // マップフェーズ以外は何もしない
  if (state.phase !== "map") return state;

  // マップの最初のノードを選択（後方互換）
  const startNodeId = state.run.map.startNodeIds[0];
  if (startNodeId !== undefined) {
    return selectNode(state, startNodeId, rng);
  }

  // フォールバック: 旧ロジック
  const mergedDeck = [
    ...state.player.deck,
    ...state.player.hand,
    ...state.player.discard,
  ];
  const shuffledDeck = shuffleArray(mergedDeck, rng);
  const resetPlayer: Player = {
    maxHp: state.player.maxHp,
    currentHp: state.player.currentHp,
    block: 0,
    energy: state.player.maxEnergy,
    maxEnergy: state.player.maxEnergy,
    hand: [],
    deck: shuffledDeck,
    discard: [],
    exhaust: state.player.exhaust,
    statuses: new Map(),
  };
  const nextRoomNumber = state.roomNumber + 1;
  const nextEnemies =
    nextRoomNumber === 10
      ? [createBossEnemy(state.run.trialLevel)]
      : createNormalEnemyGroup(rng, state.run.trialLevel);
  const newState: GameState = {
    player: resetPlayer,
    enemies: nextEnemies,
    turn: "player",
    phase: "battle",
    outcome: null,
    log: [],
    rewardCandidates: [],
    rewardGold: 0,
    rewardPotion: null,
    rewardRelic: null,
    rewardUnlockedOrbs: [],
    lastDefeatedEnemyNames: [],
    roomNumber: nextRoomNumber,
    relics: state.relics,
    cardsPlayedThisTurn: 0,
    attackCardsPlayedThisTurn: 0,
    nextCardCostReduction: 0,
    nextDefenseCardBonus: 0,
    attackBonusThisTurn: 0,
    shopItems: EMPTY_SHOP_ITEMS,
    run: state.run,
    pendingDiscard: null,
    pendingTargetCardId: null,
    selectedEnemyInstanceId: null, // initBattleState で設定される
    zeroCostCardsPlayedThisBattle: 0,
    originalCardUsedThisBattle: false,
    activeEvent: null,
  };
  const stateAfterRelics = initBattleState(newState);
  const stateAfterTurnStartRelics =
    applyTurnStartRelicEffects(stateAfterRelics);
  const playerAfterDraw = drawCards(
    stateAfterTurnStartRelics.player,
    INITIAL_DRAW_COUNT,
    rng,
  );
  return {
    ...stateAfterTurnStartRelics,
    player: playerAfterDraw,
  };
}

export function resolveEventChoice(
  state: GameState,
  choiceIndex: number,
  rng: RngFn,
): GameState {
  if (state.phase !== "event" || state.activeEvent === null) return state;
  const choice = state.activeEvent.choices[choiceIndex];
  if (choice === undefined) return state;

  const afterEffects = applyEventEffects(state, choice.effects, rng);
  const afterFlag = applyChainFlagUpdate(afterEffects, choice.nextChainFlag);
  if (afterFlag.player.currentHp <= 0) {
    return {
      ...afterFlag,
      phase: "result",
      outcome: "defeat",
      activeEvent: null,
    };
  }
  return {
    ...afterFlag,
    activeEvent: null,
  };
}

export function resolveEventForced(state: GameState, rng: RngFn): GameState {
  if (state.phase !== "event" || state.activeEvent === null) return state;
  const afterEffects = applyEventEffects(
    state,
    state.activeEvent.forcedEffects ?? [],
    rng,
  );
  const afterFlag = applyChainFlagUpdate(afterEffects);
  if (afterFlag.player.currentHp <= 0) {
    return {
      ...afterFlag,
      phase: "result",
      outcome: "defeat",
      activeEvent: null,
    };
  }
  return {
    ...afterFlag,
    phase: "map",
    activeEvent: null,
  };
}

export function leaveEvent(state: GameState): GameState {
  if (state.phase !== "event") return state;
  return {
    ...state,
    phase: "map",
    activeEvent: null,
  };
}

export function buyShopCard(state: GameState, cardId: string): GameState {
  if (state.phase !== "shop") return state;
  const item = state.shopItems.cards.find(({ card }) => card.id === cardId);
  if (item === undefined || state.run.gold < item.price) return state;
  if (isOriginalCard(item.card)) return state;

  return {
    ...state,
    player: {
      ...state.player,
      deck: [...state.player.deck, item.card],
    },
    run: { ...state.run, gold: state.run.gold - item.price },
    shopItems: {
      ...state.shopItems,
      cards: state.shopItems.cards.filter(
        ({ card }) => card.id !== item.card.id,
      ),
    },
    log: addLog(
      state.log,
      `${item.card.name}を${item.price}ゴールドで購入した。`,
    ),
  };
}

export function buyShopRelic(state: GameState, relicId: string): GameState {
  if (state.phase !== "shop") return state;
  const item = state.shopItems.relics.find(({ relic }) => relic.id === relicId);
  if (
    item === undefined ||
    item.relic.isStarter ||
    state.run.gold < item.price ||
    state.relics.some((relic) => relic.id === relicId)
  ) {
    return state;
  }

  return {
    ...state,
    relics: [...state.relics, item.relic],
    run: { ...state.run, gold: state.run.gold - item.price },
    shopItems: {
      ...state.shopItems,
      relics: state.shopItems.relics.filter(
        ({ relic }) => relic.id !== item.relic.id,
      ),
    },
    log: addLog(
      state.log,
      `${item.relic.name}を${item.price}ゴールドで購入した。`,
    ),
  };
}

export function removeShopCard(state: GameState, cardId: string): GameState {
  if (
    state.phase !== "shop" ||
    state.run.gold < state.shopItems.cardRemovalPrice
  ) {
    return state;
  }
  const cardIndex = state.player.deck.findIndex(
    (card) => card.id === cardId && !isOriginalCard(card),
  );
  if (cardIndex < 0) return state;
  const removedCard = state.player.deck[cardIndex];
  if (removedCard === undefined) return state;

  return {
    ...state,
    player: {
      ...state.player,
      deck: state.player.deck.filter((_, index) => index !== cardIndex),
    },
    run: {
      ...state.run,
      gold: state.run.gold - state.shopItems.cardRemovalPrice,
    },
    log: addLog(
      state.log,
      `${removedCard.name}を${state.shopItems.cardRemovalPrice}ゴールドで削除した。`,
    ),
  };
}

export function leaveShop(state: GameState): GameState {
  if (state.phase !== "shop") return state;
  return {
    ...state,
    phase: "map",
    shopItems: EMPTY_SHOP_ITEMS,
    log: addLog(
      state.log,
      "購入できるものがなかったため、ショップを通過した。",
    ),
  };
}

export function leaveForge(state: GameState): GameState {
  if (state.phase !== "forge") return state;
  return {
    ...state,
    phase: "map",
    log: addLog(state.log, "鍛冶できる対象がなかったため、鍛冶所を通過した。"),
  };
}

export function leaveRest(state: GameState): GameState {
  if (state.phase !== "rest") return state;
  return {
    ...state,
    phase: "map",
    log: addLog(state.log, "休憩所を出た。"),
  };
}

/**
 * 休憩所での HP 回復処理
 * player.currentHp を最大HPの一定割合だけ回復してマップフェーズへ遷移する
 */
export function healAtRest(state: GameState): GameState {
  // 休憩所フェーズ以外は何もしない
  if (state.phase !== "rest") return state;

  const healAmount = Math.ceil(state.player.maxHp * REST_HEAL_RATIO);
  const newHp = Math.min(
    state.player.maxHp,
    state.player.currentHp + healAmount,
  );
  const healedAmount = newHp - state.player.currentHp;
  const newPlayer = { ...state.player, currentHp: newHp };

  return {
    ...state,
    player: newPlayer,
    phase: "map",
    log: addLog(state.log, `休憩してHPを${healedAmount}回復した。HP: ${newHp}`),
  };
}

/**
 * デッキ内の対象カードを強化して置き換える（複製しない）
 * - hand + discard は checkPhase で deck に統合済みなので、deck のみ走査する
 * - upgraded === true のカードは対象から除外する（カード選択 UI で除外済みだが念のため）
 * - OriginalCard も同一 id で置換されるため複製は発生しない
 *
 * @param state 現在の GameState（phase: "rest"）
 * @param cardId 強化対象のカード id
 * @returns 強化後の GameState（phase: "map"）
 */
export function upgradeCardInDeck(state: GameState, cardId: string): GameState {
  // 休憩所フェーズ以外は何もしない
  if (state.phase !== "rest") return state;

  let upgraded = false;
  const newDeck = state.player.deck.map((card) => {
    // 対象 id のカードのみ置換（追加しない）
    if (card.id === cardId && !upgraded && card.upgraded !== true) {
      upgraded = true;
      const upgradedCard = upgradeCard(card);
      const name = upgradedCard.name.endsWith("+")
        ? upgradedCard.name
        : `${upgradedCard.name}+`;
      return { ...upgradedCard, name };
    }
    return card;
  });

  if (!upgraded) return state;

  const upgradedCard = newDeck.find((c) => c.id === cardId);
  const cardName = upgradedCard?.name ?? cardId;

  const newPlayer = { ...state.player, deck: newDeck };

  return {
    ...state,
    player: newPlayer,
    phase: "map",
    log: addLog(state.log, `${cardName}を強化した。`),
  };
}

/**
 * 戦闘中にポーションを使用する
 * - battleOnly: true のポーションは battle フェーズ以外では使えない
 * - 使用後は run.potions からそのポーションを除去する
 */
export function usePotion(
  state: GameState,
  potionIndex: number,
  rng: RngFn,
): GameState {
  const potion = state.run.potions[potionIndex];
  if (potion === undefined) return state;

  if (potion.battleOnly && state.phase !== "battle") return state;

  const newPotions = state.run.potions.filter((_, i) => i !== potionIndex);
  let newState: GameState = {
    ...state,
    run: { ...state.run, potions: newPotions },
  };

  const effect = potion.effect;
  switch (effect.kind) {
    case "heal": {
      const newHp = Math.min(
        newState.player.maxHp,
        newState.player.currentHp + effect.amount,
      );
      newState = {
        ...newState,
        player: { ...newState.player, currentHp: newHp },
        log: addLog(
          newState.log,
          `${potion.name}を使った。HPを${effect.amount}回復した。HP: ${newHp}`,
        ),
      };
      break;
    }
    case "attackBonusThisTurn": {
      newState = {
        ...newState,
        attackBonusThisTurn: newState.attackBonusThisTurn + effect.amount,
        log: addLog(
          newState.log,
          `${potion.name}を使った。このターン攻撃カードのダメージ+${effect.amount}。`,
        ),
      };
      break;
    }
    case "block": {
      const newBlock = newState.player.block + effect.amount;
      newState = {
        ...newState,
        player: { ...newState.player, block: newBlock },
        log: addLog(
          newState.log,
          `${potion.name}を使った。${effect.amount}ブロックを得た。ブロック: ${newBlock}`,
        ),
      };
      break;
    }
    case "applyPoison": {
      const target = getDefaultAttackTarget(newState);
      if (target === null || target.kind !== "single") break;
      const enemy = getTargetEnemies(newState, target)[0];
      if (enemy === undefined) break;
      const potionPoison = effect.stacks + getPoisonApplyBonus(newState);
      const result = addStatusStacks(
        enemy.statuses,
        { kind: "poison" },
        potionPoison,
      );
      newState = {
        ...updateEnemy(newState, enemy.instanceId, (targetEnemy) => ({
          ...targetEnemy,
          statuses: result.statuses,
        })),
        log: addLog(
          newState.log,
          `${potion.name}を使った。${enemy.name}にpoison ${potionPoison}を付与した。（合計: ${result.totalStacks}）`,
        ),
      };
      break;
    }
    case "damageAllEnemies": {
      for (const enemy of getLivingEnemies(newState)) {
        newState = applyDamageToEnemy(
          newState,
          enemy,
          effect.amount,
          (newHp) =>
            `${potion.name}を使った。${enemy.name}に${effect.amount}ダメージ。${enemy.name}HP: ${newHp}`,
        );
      }
      break;
    }
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }

  return checkBattleEnd(newState, rng);
}

/**
 * ショップでポーションを購入する
 * - ゴールドが不足している場合は何もしない
 * - ポーション所持上限（MAX_POTION_SLOTS）に達している場合は何もしない
 */
export function buyShopPotion(state: GameState, itemIndex: number): GameState {
  if (state.phase !== "shop") return state;

  const item = state.shopItems.potions[itemIndex];
  if (item === undefined) return state;

  if (state.run.gold < item.price) {
    return {
      ...state,
      log: addLog(state.log, `ゴールドが足りません（${item.potion.name}）。`),
    };
  }

  if (state.run.potions.length >= MAX_POTION_SLOTS) {
    return {
      ...state,
      log: addLog(state.log, "ポーション所持上限に達しています。"),
    };
  }

  const newPotions = [...state.run.potions, item.potion];
  const newShopPotions = state.shopItems.potions.filter(
    (_, i) => i !== itemIndex,
  );

  return {
    ...state,
    run: {
      ...state.run,
      gold: state.run.gold - item.price,
      potions: newPotions,
    },
    shopItems: { ...state.shopItems, potions: newShopPotions },
    log: addLog(state.log, `${item.potion.name}を${item.price}Gで購入した。`),
  };
}

/**
 * 報酬フェーズでポーションを受け取る
 * - rewardPotion が null の場合は何もしない
 * - ポーション所持上限に達している場合は何もしない
 */
export function claimRewardPotion(state: GameState): GameState {
  if (state.phase !== "reward") return state;
  if (state.rewardPotion === null) return state;

  if (state.run.potions.length >= MAX_POTION_SLOTS) {
    return {
      ...state,
      log: addLog(state.log, "ポーション所持上限に達しています。"),
    };
  }

  const newPotions = [...state.run.potions, state.rewardPotion];
  const potionName = state.rewardPotion.name;

  return {
    ...state,
    run: { ...state.run, potions: newPotions },
    rewardPotion: null,
    log: addLog(state.log, `${potionName}を受け取った。`),
  };
}

export function claimRewardRelic(state: GameState): GameState {
  if (state.phase !== "reward" && state.phase !== "treasure") return state;
  if (state.rewardRelic === null) {
    return state.phase === "treasure" ? { ...state, phase: "map" } : state;
  }

  const relicName = state.rewardRelic.name;
  return {
    ...state,
    phase:
      state.phase === "treasure" || state.rewardCandidates.length === 0
        ? "map"
        : state.phase,
    relics: [...state.relics, state.rewardRelic],
    rewardRelic: null,
    log: addLog(state.log, `${relicName}を受け取った。`),
  };
}
