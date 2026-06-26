// バトルロジック（カードプレイ・敵ターン・勝敗判定）
// DOM に一切依存しない純粋関数群
import type { GameState, Player, RunState, RunStats, ShopItems } from "./types";
import type { CardCost, CardEffect, StatusEffect } from "./types";
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
import { getOrbById } from "./data/orbData";
import { shuffleArray, type RngFn } from "./rng";
import {
  createStarterDeck,
  createComboDeck,
  createRewardPool,
  createEvolvedCard,
  upgradeCard,
} from "./data/cards";
import {
  ANCIENT_EMBLEM,
  SMALL_GEAR,
  ANCIENT_EMBLEM_BLOCK,
  SMALL_GEAR_DAMAGE,
  ALL_RELICS,
} from "./data/relics";
import {
  createSlime,
  createRandomNormalEnemy,
  createBossEnemy,
} from "./data/enemies";
import { drawCards, discardCard, discardHand } from "./deck";
import { generateFloorMap, findNode, findParentNodeId } from "./map";
import { createWeightedRewardPool } from "./reward";

// 報酬候補として選ぶカード枚数
const REWARD_CARD_COUNT = 3;

// ゲームバランス定数
const INITIAL_PLAYER_HP = 100;
const INITIAL_MAX_ENERGY = 3;
const INITIAL_DRAW_COUNT = 5;
const TURN_DRAW_COUNT = 5;
const MAX_LOG_ENTRIES = 20;

// 報酬ゴールドの範囲（named constant）
const REWARD_GOLD_MIN = 10;
const REWARD_GOLD_MAX = 20;

// 休憩所での HP 回復量（named constant）
const REST_HEAL_AMOUNT = 20;
const SHOP_CARD_COUNT = 3;
const SHOP_RELIC_COUNT = 2;
const SHOP_CARD_REMOVAL_PRICE = 75;
const MAX_POTION_SLOTS = 2; // ポーション所持上限
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

/**
 * 勝敗判定を行い、GamePhase を更新した GameState を返す
 * - ボス（tier === "boss"）撃破 → "result" フェーズ（リザルト表示）
 * - 通常敵撃破 → "reward" フェーズ（報酬候補カードを生成）
 * - プレイヤー HP ≤ 0 → "result" フェーズ（敗北表示）
 */
function checkPhase(state: GameState, rng: RngFn): GameState {
  if (state.enemy.currentHp <= 0) {
    if (state.enemy.tier === "boss") {
      // ボス撃破 → 勝利リザルト表示（自傷でHP0でも勝利を優先）
      return {
        ...state,
        phase: "result",
        outcome: "victory",
        log: addLog(state.log, "ボスを撃破した！ゲームクリア！"),
      };
    }
    // 通常敵撃破 → 図鑑ポイント加算
    const defeatedEnemyId = state.enemy.id;
    const isFirstEncounter =
      !state.run.encounteredEnemyIds.has(defeatedEnemyId);
    let stateAfterCodex = state;
    // 撃破ポイント
    stateAfterCodex = addCodexPoints(stateAfterCodex, defeatedEnemyId, 10);
    // 初遭遇ボーナス
    if (isFirstEncounter) {
      stateAfterCodex = addCodexPoints(stateAfterCodex, defeatedEnemyId, 10);
    }
    // オーブ解放チェック（解放前後の acquiredOrbIds を比較して新規解放オーブを検出）
    const orbIdsBefore = stateAfterCodex.run.acquiredOrbIds;
    stateAfterCodex = unlockOrb(stateAfterCodex, defeatedEnemyId);
    const newlyUnlockedOrbId =
      stateAfterCodex.run.acquiredOrbIds.find(
        (id) => !orbIdsBefore.includes(id),
      ) ?? null;
    const rewardUnlockedOrb =
      newlyUnlockedOrbId !== null
        ? (getOrbById(newlyUnlockedOrbId) ?? null)
        : null;
    // 撃破後に encounteredEnemyIds へ追加（初遭遇判定は追加前に済ませる）
    const newEncounteredIds = new Set(stateAfterCodex.run.encounteredEnemyIds);
    newEncounteredIds.add(defeatedEnemyId);
    stateAfterCodex = {
      ...stateAfterCodex,
      run: { ...stateAfterCodex.run, encounteredEnemyIds: newEncounteredIds },
    };

    // 通常敵撃破 → 報酬ゴールド加算 + 報酬選択へ
    const rewardGold =
      REWARD_GOLD_MIN +
      Math.floor(rng() * (REWARD_GOLD_MAX - REWARD_GOLD_MIN + 1));
    const newRun = addStats(
      { ...stateAfterCodex.run, gold: stateAfterCodex.run.gold + rewardGold },
      {},
    );

    // 報酬フェーズ移行前に hand + discard をすべて deck に統合する
    // （これにより reward/map/rest フェーズ中は player.deck が全カードを保持）
    const mergedDeck = [
      ...stateAfterCodex.player.deck,
      ...stateAfterCodex.player.hand,
      ...stateAfterCodex.player.discard,
    ];
    const newPlayer = {
      ...stateAfterCodex.player,
      deck: mergedDeck,
      hand: [],
      discard: [],
    };

    const pool = createRewardPool();
    const weightedPool = createWeightedRewardPool(
      pool,
      stateAfterCodex.run.startingDeckType,
    );
    const rewardCandidates = takeUniqueCards(
      shuffleArray(weightedPool, rng),
      REWARD_CARD_COUNT,
    );

    // 25%の確率でポーションを報酬として提示（所持枠に空きがある場合のみ）
    // rng を常に2回引いてから条件判定することでシード再現性を保つ
    const potionRoll = rng();
    const potionSelectRoll = rng();
    const canReceivePotion =
      stateAfterCodex.run.potions.length < MAX_POTION_SLOTS &&
      potionRoll < POTION_REWARD_CHANCE;
    const rewardPotion: Potion | null = canReceivePotion
      ? (ALL_POTIONS[Math.floor(potionSelectRoll * ALL_POTIONS.length)] ?? null)
      : null;

    const potionLog =
      rewardPotion !== null
        ? `【ポーション報酬】${rewardPotion.name}が出現した。`
        : "";

    return {
      ...stateAfterCodex,
      player: newPlayer,
      run: newRun,
      phase: "reward",
      rewardCandidates,
      rewardGold,
      rewardPotion,
      rewardUnlockedOrb,
      lastDefeatedEnemyName: stateAfterCodex.enemy.name,
      log: addLog(
        stateAfterCodex.log,
        `${stateAfterCodex.enemy.name}を倒した！${rewardGold}ゴールドを得た。報酬カードを1枚選んでください。${potionLog}`,
      ),
    };
  }
  if (state.player.currentHp <= 0) {
    // 敗北 → 敗北リザルト表示
    return { ...state, phase: "result", outcome: "defeat" };
  }
  return state;
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
  const weightedCards = createWeightedRewardPool(
    createRewardPool().filter((card) => !isOriginalCard(card)),
    state.run.startingDeckType,
  );
  const cards = takeUniqueCards(
    shuffleArray(weightedCards, rng),
    SHOP_CARD_COUNT,
  ).map((card) => ({ card, price: getCardShopPrice(card) }));
  const relics = shuffleArray(
    ALL_RELICS.filter(
      (relic) =>
        !relic.isStarter &&
        !state.relics.some((owned) => owned.id === relic.id),
    ),
    rng,
  )
    .slice(0, SHOP_RELIC_COUNT)
    .map((relic) => ({ relic, price: getRelicShopPrice(relic) }));

  // ショップに1種類のポーションを陳列（所持していないものからランダム）
  const availablePotions = shuffleArray([...ALL_POTIONS], rng);
  const potions = availablePotions
    .slice(0, 1)
    .map((potion) => ({ potion, price: potion.price }));

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

/**
 * CardEffect を適用して state を更新する
 */
function applyEffect(
  state: GameState,
  effect: CardEffect,
  rng: RngFn,
): GameState {
  // 遺物による攻撃ダメージボーナス（石など）を合算する
  const relicAttackBonus = state.relics.reduce(
    (sum, relic) =>
      relic.effect.kind === "attackCardDamageBonus"
        ? sum + relic.effect.amount
        : sum,
    0,
  );

  switch (effect.kind) {
    case "attack": {
      const attackTotal =
        effect.amount + state.attackBonusThisTurn + relicAttackBonus;
      const oldEnemyHp = state.enemy.currentHp;
      const { newHp, newBlock } = applyDamage(
        state.enemy.currentHp,
        state.enemy.block,
        attackTotal,
        state.player.statuses,
        state.enemy.statuses,
      );
      const damageDealt = oldEnemyHp - newHp;
      const newEnemy = { ...state.enemy, currentHp: newHp, block: newBlock };
      const bonusNote =
        state.attackBonusThisTurn > 0
          ? `（攻撃ポーション+${state.attackBonusThisTurn}）`
          : "";
      const newLog = addLog(
        state.log,
        `プレイヤーが${attackTotal}ダメージを与えた${bonusNote}。敵HP: ${newHp}`,
      );
      return {
        ...state,
        enemy: newEnemy,
        log: newLog,
        run: addStats(state.run, { totalDamageDealt: damageDealt }),
      };
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
      // 敵にステータスを付与する
      const currentStacks = state.enemy.statuses.get(effect.status.kind) ?? 0;
      const newStacks = currentStacks + effect.stacks;
      const newStatuses = new Map(state.enemy.statuses);
      newStatuses.set(effect.status.kind, newStacks);
      const newEnemy = { ...state.enemy, statuses: newStatuses };
      const newLog = addLog(
        state.log,
        `敵に${effect.status.kind}を${effect.stacks}付与した。（合計: ${newStacks}）`,
      );
      return { ...state, enemy: newEnemy, log: newLog };
    }

    case "multiAttack": {
      // attackBonusThisTurn・遺物ボーナスは各ヒットのベースに加算（ヒット数倍にはならない）
      const hitDamage =
        effect.amount + state.attackBonusThisTurn + relicAttackBonus;
      let newState = state;
      for (let i = 0; i < effect.times; i++) {
        const oldHp = newState.enemy.currentHp;
        const { newHp, newBlock } = applyDamage(
          newState.enemy.currentHp,
          newState.enemy.block,
          hitDamage,
          newState.player.statuses,
          newState.enemy.statuses,
        );
        const damageDealt = oldHp - newHp;
        const newEnemy = {
          ...newState.enemy,
          currentHp: newHp,
          block: newBlock,
        };
        newState = {
          ...newState,
          enemy: newEnemy,
          log: addLog(
            newState.log,
            `プレイヤーが${hitDamage}ダメージを与えた。敵HP: ${newHp}`,
          ),
          run: addStats(newState.run, { totalDamageDealt: damageDealt }),
        };
        if (newHp <= 0) break;
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
        relicAttackBonus;
      const oldEnemyHp = state.enemy.currentHp;
      const { newHp, newBlock } = applyDamage(
        state.enemy.currentHp,
        state.enemy.block,
        total,
        state.player.statuses,
        state.enemy.statuses,
      );
      const damageDealt = oldEnemyHp - newHp;
      const newEnemy = { ...state.enemy, currentHp: newHp, block: newBlock };
      const bonusNote =
        conditionalBonus > 0 ? `（追撃+${conditionalBonus}）` : "";
      const newLog = addLog(
        state.log,
        `プレイヤーが${total}ダメージを与えた${bonusNote}。敵HP: ${newHp}`,
      );
      return {
        ...state,
        enemy: newEnemy,
        log: newLog,
        run: addStats(state.run, { totalDamageDealt: damageDealt }),
      };
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
      const newStatuses = new Map(state.enemy.statuses);
      const poisonStacks = newStatuses.get("poison") ?? 0;
      const lacerationStacks = newStatuses.get("laceration") ?? 0;
      if (poisonStacks > 0)
        newStatuses.set("poison", poisonStacks + effect.amount);
      if (lacerationStacks > 0)
        newStatuses.set("laceration", lacerationStacks + effect.amount);
      const newEnemy = { ...state.enemy, statuses: newStatuses };
      const newLog = addLog(
        state.log,
        `敵の毒と裂傷を${effect.amount}増幅した。`,
      );
      return { ...state, enemy: newEnemy, log: newLog };
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
 * - blockOnBattleStart: プレイヤーにブロックを付与する
 * - damageOnThirdCardPlayed: 敵にダメージを与える
 * - healOnTurnStart: プレイヤーの HP を最大 HP まで回復する
 * - strengthOnBattleStart: プレイヤーに strength を付与する
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
    case "blockOnBattleStart": {
      // バトル開始時にブロックを付与する
      const newBlock = state.player.block + ANCIENT_EMBLEM_BLOCK;
      const newPlayer = { ...state.player, block: newBlock };
      const newLog = addLog(
        state.log,
        `【${relicName}】バトル開始時に${ANCIENT_EMBLEM_BLOCK}ブロックを得た。ブロック: ${newBlock}`,
      );
      return {
        ...state,
        player: newPlayer,
        log: newLog,
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "damageOnThirdCardPlayed": {
      // 3枚目のカードプレイ時に敵にダメージを与える
      const oldEnemyHp = state.enemy.currentHp;
      const { newHp, newBlock } = applyDamage(
        state.enemy.currentHp,
        state.enemy.block,
        SMALL_GEAR_DAMAGE,
      );
      const damageDealt = oldEnemyHp - newHp;
      const newEnemy = { ...state.enemy, currentHp: newHp, block: newBlock };
      const newLog = addLog(
        state.log,
        `【${relicName}】3枚目のカードプレイで敵に${SMALL_GEAR_DAMAGE}ダメージ！敵HP: ${newHp}`,
      );
      return {
        ...state,
        enemy: newEnemy,
        log: newLog,
        run: addStats(state.run, {
          relicEffectCount: 1,
          totalDamageDealt: damageDealt,
        }),
      };
    }

    case "healOnTurnStart": {
      const oldHp = state.player.currentHp;
      const newHp = Math.min(
        state.player.maxHp,
        state.player.currentHp + effect.amount,
      );
      const healedAmount = newHp - oldHp;
      return {
        ...state,
        player: { ...state.player, currentHp: newHp },
        log: addLog(
          state.log,
          `【${relicName}】ターン開始時にHPを${healedAmount}回復した。プレイヤーHP: ${newHp}`,
        ),
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "strengthOnBattleStart": {
      const result = addStatusStacks(
        state.player.statuses,
        { kind: "strength" },
        effect.stacks,
      );
      return {
        ...state,
        player: { ...state.player, statuses: result.statuses },
        log: addLog(
          state.log,
          `【${relicName}】バトル開始時にstrengthを${effect.stacks}得た。（合計: ${result.totalStacks}）`,
        ),
        run: addStats(state.run, { relicEffectCount: 1 }),
      };
    }

    case "attackCardDamageBonus":
      // パッシブ効果: applyEffect 内の攻撃計算時に参照するため、ここでは何もしない
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

  for (const relic of newState.relics) {
    if (
      relic.effect.kind === "blockOnBattleStart" ||
      relic.effect.kind === "strengthOnBattleStart"
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
    if (relic.effect.kind === "healOnTurnStart") {
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
 * - originalCard が null なら9枚デッキのままシャッフル
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
  },
): GameState {
  // 開始デッキタイプに応じてデッキと初期遺物を選択
  const starterDeck =
    config.startingDeckType === "balanced"
      ? createStarterDeck()
      : createComboDeck();

  const starterRelic: Relic =
    config.startingDeckType === "balanced" ? ANCIENT_EMBLEM : SMALL_GEAR;

  // ラン開始時にオリジナルカードのエネミースロットを locked に変換
  const lockedOriginalCard =
    originalCard !== null ? lockEnemySlot(originalCard) : null;

  // オリジナルカードが指定されていればデッキ末尾に追加してからシャッフル
  const deckBeforeShuffle =
    lockedOriginalCard !== null
      ? [...starterDeck, lockedOriginalCard]
      : starterDeck;

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

  const initialEnemy = createSlime();

  // PersistentData から図鑑状態を復元
  const codexPoints = persistentData?.codexPoints ?? {};
  const acquiredOrbIds = persistentData?.acquiredOrbIds ?? [];
  const initialCodexState = buildCodexState(codexPoints, acquiredOrbIds);

  // フロアマップを生成し RunState を初期化する
  const floorMap = generateFloorMap(rng);
  const initialRunState: RunState = {
    map: floorMap,
    currentNodeId: "", // ラン開始時は未選択
    visitedNodeIds: new Set<string>(),
    gold: 0,
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
    encounteredEnemyIds: new Set<string>(),
    lastBattleDamageReceived: 0,
    trialLevel: config.trialLevel,
  };

  const initialState: GameState = {
    player: initialPlayer,
    enemy: initialEnemy,
    turn: "player",
    phase: "battle",
    outcome: null,
    log: ["ラン開始！バトル開始！"],
    rewardCandidates: [],
    rewardGold: 0,
    lastDefeatedEnemyName: "",
    roomNumber: 1,
    relics: [starterRelic],
    cardsPlayedThisTurn: 0,
    attackCardsPlayedThisTurn: 0,
    nextCardCostReduction: 0,
    nextDefenseCardBonus: 0,
    shopItems: EMPTY_SHOP_ITEMS,
    run: initialRunState,
    pendingDiscard: null,
    attackBonusThisTurn: 0,
    rewardPotion: null,
    rewardUnlockedOrb: null,
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
  return { ...stateAfterTurnStartRelics, player: playerAfterDraw };
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

  // オリジナルカードのプレイを検出し originalCardUsedCount をインクリメント
  if (isOriginalCard(card)) {
    newState = {
      ...newState,
      run: addStats(newState.run, { originalCardUsedCount: 1 }),
    };
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
    newState = applyEffect(newState, effect, rng);
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
          const result = addStatusStacks(
            newState.enemy.statuses,
            { kind: "poison" },
            forgeEffect.stacks,
          );
          newState = {
            ...newState,
            enemy: { ...newState.enemy, statuses: result.statuses },
            log: addLog(
              newState.log,
              `鍛冶効果で敵にpoisonを${forgeEffect.stacks}付与した。（合計: ${result.totalStacks}）`,
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
          const oldEnemyHp = newState.enemy.currentHp;
          const { newHp, newBlock } = applyDamage(
            newState.enemy.currentHp,
            newState.enemy.block,
            forgeEffect.amount,
          );
          const damageDealt = oldEnemyHp - newHp;
          newState = {
            ...newState,
            enemy: {
              ...newState.enemy,
              currentHp: newHp,
              block: newBlock,
            },
            log: addLog(
              newState.log,
              `鍛冶効果で敵に${forgeEffect.amount}ダメージを与えた。敵HP: ${newHp}`,
            ),
            run: addStats(newState.run, {
              totalDamageDealt: damageDealt,
            }),
          };
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
  newState = {
    ...newState,
    cardsPlayedThisTurn: newCardsPlayedThisTurn,
    attackCardsPlayedThisTurn: newAttackCardsPlayedThisTurn,
  };

  if (isEvolveCard(card)) {
    newState = updateEvolveProgress(newState, card);
  }

  // 3枚目到達時に「小さな歯車」（damageOnThirdCardPlayed）を発火
  if (newCardsPlayedThisTurn === 3) {
    for (const relic of newState.relics) {
      if (relic.effect.kind === "damageOnThirdCardPlayed") {
        newState = applyRelicEffect(newState, relic.effect, relic.name);
      }
    }
  }

  // 勝敗判定
  newState = checkPhase(newState, rng);

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
 * プレイヤーターンを終了し、敵のターンを処理する
 * 1. 手札を全て捨て札に移動
 * 2. cardsPlayedThisTurn を 0 にリセット
 * 3. 敵のブロックをリセットして nextAction を実行
 * 4. 勝敗判定
 * 5. 次ターンの準備（ドロー・エネルギーリセット・敵 nextAction 更新）
 */
export function endPlayerTurn(state: GameState, rng: RngFn): GameState {
  // バトル中以外は何もしない
  if (state.phase !== "battle") return state;

  // 1. 手札を全て捨て札に移動（ブロックはまだ残す。敵の攻撃を受けてから消える）
  const playerAfterDiscard = discardHand(state.player);
  let newState: GameState = {
    ...state,
    player: playerAfterDiscard,
    turn: "enemy",
    // pendingDiscard を強制クリア（未解決の捨て選択を破棄）
    pendingDiscard: null,
    // 2. カウンタ類をリセット
    cardsPlayedThisTurn: 0,
    attackCardsPlayedThisTurn: 0,
    nextCardCostReduction: 0,
    nextDefenseCardBonus: 0,
    attackBonusThisTurn: 0,
    log: addLog(state.log, "プレイヤーがターンを終了した。"),
  };

  // 敵の前ターンのブロックを、今回の敵行動より前にリセットする
  newState = {
    ...newState,
    enemy: {
      ...newState.enemy,
      block: 0,
    },
  };

  // 3. 敵の nextAction を実行
  const action = newState.enemy.nextAction;
  switch (action.kind) {
    case "attack": {
      const { newHp, newBlock, blockedAmount } = applyDamage(
        newState.player.currentHp,
        newState.player.block,
        action.amount,
        newState.enemy.statuses,
        newState.player.statuses,
      );
      const actualDamage = newState.player.currentHp - newHp;
      const newPlayer = {
        ...newState.player,
        currentHp: newHp,
        block: newBlock,
      };
      newState = {
        ...newState,
        player: newPlayer,
        log: addLog(
          newState.log,
          `敵が${action.amount}ダメージを与えた。プレイヤーHP: ${newHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: blockedAmount }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + actualDamage,
        },
      };
      break;
    }
    case "block": {
      const newBlock = newState.enemy.block + action.amount;
      const newEnemy = { ...newState.enemy, block: newBlock };
      newState = {
        ...newState,
        enemy: newEnemy,
        log: addLog(newState.log, `敵が${action.amount}ブロックを得た。`),
      };
      break;
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
          newState.enemy.statuses,
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
      }
      newState = {
        ...newState,
        log: addLog(
          newState.log,
          `敵が${action.amount}×${action.times}の連撃を与えた。プレイヤーHP: ${newState.player.currentHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: totalBlocked }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + totalHpLost,
        },
      };
      break;
    }
    case "attackAndApplyStatus": {
      const { newHp, newBlock, blockedAmount } = applyDamage(
        newState.player.currentHp,
        newState.player.block,
        action.amount,
        newState.enemy.statuses,
        newState.player.statuses,
      );
      const actualDamageAAS = newState.player.currentHp - newHp;
      const statusResult = addStatusStacks(
        newState.player.statuses,
        action.status,
        action.stacks,
      );
      newState = {
        ...newState,
        player: {
          ...newState.player,
          currentHp: newHp,
          block: newBlock,
          statuses: statusResult.statuses,
        },
        log: addLog(
          newState.log,
          `敵が${action.amount}ダメージ＋${action.status.kind}${action.stacks}を与えた。プレイヤーHP: ${newHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: blockedAmount }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + actualDamageAAS,
        },
      };
      break;
    }
    case "applyStatus": {
      if (action.target === "player") {
        const result = addStatusStacks(
          newState.player.statuses,
          action.status,
          action.stacks,
        );
        newState = {
          ...newState,
          player: { ...newState.player, statuses: result.statuses },
          log: addLog(
            newState.log,
            `敵がプレイヤーに${action.status.kind}を${action.stacks}付与した。（合計: ${result.totalStacks}）`,
          ),
        };
      } else {
        const result = addStatusStacks(
          newState.enemy.statuses,
          action.status,
          action.stacks,
        );
        newState = {
          ...newState,
          enemy: { ...newState.enemy, statuses: result.statuses },
          log: addLog(
            newState.log,
            `敵が自身に${action.status.kind}を${action.stacks}付与した。（合計: ${result.totalStacks}）`,
          ),
        };
      }
      break;
    }
    case "buff": {
      const result = addStatusStacks(
        newState.enemy.statuses,
        action.status,
        action.stacks,
      );
      newState = {
        ...newState,
        enemy: { ...newState.enemy, statuses: result.statuses },
        log: addLog(
          newState.log,
          `敵が${action.description}を行い、${action.status.kind}を${action.stacks}得た。（合計: ${result.totalStacks}）`,
        ),
      };
      break;
    }
    case "omen": {
      newState = {
        ...newState,
        log: addLog(newState.log, `敵の予兆: ${action.description}`),
      };
      break;
    }
    case "blockAndAttack": {
      newState = {
        ...newState,
        enemy: {
          ...newState.enemy,
          block: newState.enemy.block + action.blockAmount,
        },
      };
      const { newHp, newBlock, blockedAmount } = applyDamage(
        newState.player.currentHp,
        newState.player.block,
        action.attackAmount,
        newState.enemy.statuses,
        newState.player.statuses,
      );
      const actualDamageBAA = newState.player.currentHp - newHp;
      newState = {
        ...newState,
        player: {
          ...newState.player,
          currentHp: newHp,
          block: newBlock,
        },
        log: addLog(
          newState.log,
          `敵が${action.blockAmount}ブロックを得て、${action.attackAmount}ダメージを与えた。プレイヤーHP: ${newHp}`,
        ),
        run: {
          ...addStats(newState.run, { totalDamageBlocked: blockedAmount }),
          lastBattleDamageReceived:
            newState.run.lastBattleDamageReceived + actualDamageBAA,
        },
      };
      break;
    }
    case "idle": {
      newState = {
        ...newState,
        log: addLog(newState.log, "敵は何もしなかった。"),
      };
      break;
    }
    default: {
      // exhaustive check
      const _never: never = action;
      return _never;
    }
  }

  // 4. プレイヤーの毒をティック
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

  // 5. 敵のステータス効果をティック（毒・裂傷によるダメージ）
  const poisonStacks = newState.enemy.statuses.get("poison") ?? 0;
  const lacerationStacks = newState.enemy.statuses.get("laceration") ?? 0;
  const statusDamage = poisonStacks + lacerationStacks;
  if (statusDamage > 0) {
    const { newHp: hpAfterStatus, newBlock: blockAfterStatus } = applyDamage(
      newState.enemy.currentHp,
      newState.enemy.block,
      statusDamage,
    );
    const tickedStatuses = new Map(newState.enemy.statuses);
    // 毒は1ずつ減少、裂傷は減少しない
    if (poisonStacks > 0) tickedStatuses.set("poison", poisonStacks - 1);
    newState = {
      ...newState,
      enemy: {
        ...newState.enemy,
        currentHp: hpAfterStatus,
        block: blockAfterStatus,
        statuses: tickedStatuses,
      },
      log: addLog(
        newState.log,
        `ステータス効果で敵に${statusDamage}ダメージ。敵HP: ${hpAfterStatus}`,
      ),
    };
  }

  const playerStatusesAfterDecay = decayStatuses(newState.player.statuses, [
    "weak",
    "vulnerable",
  ]);
  const enemyStatusesAfterDecay = decayStatuses(newState.enemy.statuses, [
    "weak",
    "vulnerable",
  ]);
  newState = {
    ...newState,
    player: {
      ...newState.player,
      statuses: playerStatusesAfterDecay,
    },
    enemy: {
      ...newState.enemy,
      statuses: enemyStatusesAfterDecay,
    },
  };

  // 6. 勝敗判定
  newState = checkPhase(newState, rng);
  if (newState.phase !== "battle") return newState;

  // 7. 次のプレイヤーターンの準備
  const nextBattleTurn = newState.enemy.battleTurn + 1;
  const newEnemy = {
    ...newState.enemy,
    battleTurn: nextBattleTurn,
    // 敵の nextAction を次ターン用に更新
    // enemyHp: プレイヤーのカードプレイ後の敵 HP（HP しきい値による行動変化に使用）
    nextAction: newState.enemy.behavior.selectAction({
      turn: nextBattleTurn,
      enemyHp: newState.enemy.currentHp,
      playerHp: newState.player.currentHp,
    }),
  };

  // プレイヤーのエネルギーリセット＋ブロックリセット（次ターン開始時に消える）
  const playerWithEnergy = {
    ...newState.player,
    energy: newState.player.maxEnergy,
    block: 0,
  };
  newState = {
    ...newState,
    enemy: newEnemy,
    player: playerWithEnergy,
    turn: "player",
  };

  // プレイヤーターン開始時の遺物効果を適用
  newState = applyTurnStartRelicEffects(newState);

  // 次ターンの手札をドロー
  const playerAfterDraw = drawCards(newState.player, TURN_DRAW_COUNT, rng);
  newState = { ...newState, player: playerAfterDraw };

  return newState;
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
    phase: "map",
    rewardCandidates: [],
    rewardGold: 0,
    rewardPotion: null,
    rewardUnlockedOrb: null,
    lastDefeatedEnemyName: "",
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
    phase: "map",
    rewardCandidates: [],
    rewardGold: 0,
    rewardPotion: null,
    rewardUnlockedOrb: null,
    lastDefeatedEnemyName: "",
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

    case "battle":
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
      const nextEnemy =
        node.kind === "boss"
          ? createBossEnemy(trialLevel)
          : createRandomNormalEnemy(rng, trialLevel);

      // 4. 新しい GameState を生成
      // 初遭遇判定のため encounteredEnemyIds に次の敵IDを追加する
      // encounteredEnemyIds への追加は checkPhase の撃破後に行う（初遭遇判定のため）
      const runWithEncountered: typeof newRun = {
        ...newRun,
        lastBattleDamageReceived: 0,
      };
      const newState: GameState = {
        player: resetPlayer,
        enemy: nextEnemy,
        turn: "player",
        phase: "battle",
        outcome: null,
        log: [`部屋 ${nextRoomNumber} に進んだ。バトル開始！`],
        rewardCandidates: [],
        rewardGold: 0,
        rewardPotion: null,
        rewardUnlockedOrb: null,
        lastDefeatedEnemyName: "",
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
      return { ...stateAfterTurnStartRelics, player: playerAfterDraw };
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
  const nextEnemy =
    nextRoomNumber === 10
      ? createBossEnemy(state.run.trialLevel)
      : createRandomNormalEnemy(rng, state.run.trialLevel);
  const newState: GameState = {
    player: resetPlayer,
    enemy: nextEnemy,
    turn: "player",
    phase: "battle",
    outcome: null,
    log: [],
    rewardCandidates: [],
    rewardGold: 0,
    rewardPotion: null,
    rewardUnlockedOrb: null,
    lastDefeatedEnemyName: "",
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
  };
  const stateAfterRelics = initBattleState(newState);
  const stateAfterTurnStartRelics =
    applyTurnStartRelicEffects(stateAfterRelics);
  const playerAfterDraw = drawCards(
    stateAfterTurnStartRelics.player,
    INITIAL_DRAW_COUNT,
    rng,
  );
  return { ...stateAfterTurnStartRelics, player: playerAfterDraw };
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
    log: addLog(state.log, "ショップを出た。"),
  };
}

export function leaveForge(state: GameState): GameState {
  if (state.phase !== "forge") return state;
  const nodeId = state.run.currentNodeId;
  const parentNodeId = findParentNodeId(state.run.map, nodeId);
  const newVisited = new Set(state.run.visitedNodeIds);
  newVisited.delete(nodeId);
  return {
    ...state,
    run: {
      ...state.run,
      currentNodeId: parentNodeId,
      visitedNodeIds: newVisited,
    },
    phase: "map",
    log: addLog(state.log, "鍛冶所を出た。"),
  };
}

export function leaveRest(state: GameState): GameState {
  if (state.phase !== "rest") return state;
  const nodeId = state.run.currentNodeId;
  const parentNodeId = findParentNodeId(state.run.map, nodeId);
  const newVisited = new Set(state.run.visitedNodeIds);
  newVisited.delete(nodeId);
  return {
    ...state,
    run: {
      ...state.run,
      currentNodeId: parentNodeId,
      visitedNodeIds: newVisited,
    },
    phase: "map",
    log: addLog(state.log, "休憩所を出た。"),
  };
}

/**
 * 休憩所での HP 回復処理
 * player.currentHp を REST_HEAL_AMOUNT 回復してマップフェーズへ遷移する
 */
export function healAtRest(state: GameState): GameState {
  // 休憩所フェーズ以外は何もしない
  if (state.phase !== "rest") return state;

  const newHp = Math.min(
    state.player.maxHp,
    state.player.currentHp + REST_HEAL_AMOUNT,
  );
  const newPlayer = { ...state.player, currentHp: newHp };

  return {
    ...state,
    player: newPlayer,
    phase: "map",
    log: addLog(
      state.log,
      `休憩してHPを${REST_HEAL_AMOUNT}回復した。HP: ${newHp}`,
    ),
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
      const result = addStatusStacks(
        newState.enemy.statuses,
        { kind: "poison" },
        effect.stacks,
      );
      newState = {
        ...newState,
        enemy: { ...newState.enemy, statuses: result.statuses },
        log: addLog(
          newState.log,
          `${potion.name}を使った。敵にpoison ${effect.stacks}を付与した。（合計: ${result.totalStacks}）`,
        ),
      };
      break;
    }
    case "damageAllEnemies": {
      // 複数敵実装時に要修正（現在は単一 enemy に解決）
      const oldHp = newState.enemy.currentHp;
      const { newHp, newBlock } = applyDamage(
        newState.enemy.currentHp,
        newState.enemy.block,
        effect.amount,
      );
      const damageDealt = oldHp - newHp;
      newState = {
        ...newState,
        enemy: { ...newState.enemy, currentHp: newHp, block: newBlock },
        run: addStats(newState.run, { totalDamageDealt: damageDealt }),
        log: addLog(
          newState.log,
          `${potion.name}を使った。敵に${effect.amount}ダメージ。敵HP: ${newHp}`,
        ),
      };
      break;
    }
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }

  return checkPhase(newState, rng);
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
