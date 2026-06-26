// オリジナルカード工房ロジック（純粋関数のみ）
// DOM・renderer・window を一切 import しない
import type { Card, CardCost, CardEffect } from "./types/card";
import type { OriginalCard, Compensation } from "./types/originalCard";
import {
  KOGEKI_MATERIAL,
  BOGYO_MATERIAL,
  NIREN_MATERIAL,
  YOROIKUDAKI_MATERIAL,
  DOKUHARI_MATERIAL,
  TATEUCHI_MATERIAL,
  SHUCHU_MATERIAL,
  KYODA_MATERIAL,
  DAIBOGYO_MATERIAL,
} from "./data/cards";

/**
 * 素材化可能なカード一覧を返す
 * 固定IDシングルトンを直接返すことでカード名変更時のコンパイルエラー検出を保証する
 * 強打(2) + 大防御(2) = 合計コスト4 → コスト3圧縮 + 代償(exhaust) が実現可能
 */
export function getMaterializableCards(): readonly Card[] {
  return [
    KOGEKI_MATERIAL,
    BOGYO_MATERIAL,
    NIREN_MATERIAL,
    YOROIKUDAKI_MATERIAL,
    DOKUHARI_MATERIAL,
    TATEUCHI_MATERIAL,
    SHUCHU_MATERIAL,
    KYODA_MATERIAL,
    DAIBOGYO_MATERIAL,
  ];
}

/**
 * カードコストのエネルギー消費量を数値で返す
 */
function getEnergyCostValue(cost: CardCost): number {
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
 * カード効果を人間可読なテキストに変換する
 */
function describeEffect(effect: CardEffect): string {
  switch (effect.kind) {
    case "attack":
      return `${effect.amount}ダメージを与える`;
    case "block":
      return `${effect.amount}ブロックを得る`;
    case "draw":
      return `カードを${effect.count}枚ドローする`;
    case "gainEnergy":
      return `エネルギーを${effect.amount}得る`;
    case "applyStatus":
      return `${effect.status.kind}を${effect.stacks}スタック付与する`;
    case "multiAttack":
      return `${effect.amount}ダメージを${effect.times}回与える`;
    case "selfDamage":
      return `自分に${effect.amount}ダメージ`;
    case "discard":
      return `手札を${effect.count}枚捨てる`;
    case "conditionalAttack":
      return `${effect.baseAmount}ダメージ（攻撃済みなら+${effect.bonusAmount}）`;
    case "costReductionNextCard":
      return `次のカードのコストを${effect.amount}減らす`;
    case "buffNextDefense":
      return `次の防御カードに+${effect.amount}ブロック`;
    case "amplifyEnemyStatus":
      return `敵の毒と裂傷を${effect.amount}増幅する`;
    default: {
      const _never: never = effect;
      return _never;
    }
  }
}

/**
 * 代償のテキストを返す
 */
function describeCompensation(comp: Compensation): string {
  switch (comp.kind) {
    case "exhaust":
      return "【代償】使用後このカードを除外する";
    case "hpCost":
      return `【代償】使用時HP${comp.amount}を消費する`;
    case "discardCard":
      return "【代償】使用時カードを1枚捨てる";
    case "weakNextTurn":
      return "【代償】次のターン、攻撃力が低下する";
    case "polluteDiscard":
      return "【代償】捨て札に呪いカードを加える";
    case "buffEnemy":
      return "【代償】敵の攻撃力が上昇する";
    case "randomTarget":
      return "【代償】攻撃対象がランダムになる";
    case "playCondition":
      return `【代償】${comp.description}`;
    default: {
      const _never: never = comp;
      return _never;
    }
  }
}

/**
 * 2枚のカードを合成してオリジナルカードを生成する
 * - effectsは両カードのeffectsを結合
 * - コスト計算: コスト合計 ≤ 3 → cost=合計, compensation=null
 *              コスト合計 ≥ 4 → cost=3に圧縮, compensation={ kind: "exhaust" }
 */
export function computeOriginalCard(
  materialA: Card,
  materialB: Card,
  id: string,
): OriginalCard {
  // 両カードのエフェクトを結合
  const combinedEffects: readonly CardEffect[] = [
    ...materialA.effects,
    ...materialB.effects,
  ];

  // コスト計算
  const costA = getEnergyCostValue(materialA.cost);
  const costB = getEnergyCostValue(materialB.cost);
  const totalCost = costA + costB;

  let finalCost: CardCost;
  let compensation: Compensation | null;

  if (totalCost <= 3) {
    finalCost =
      totalCost === 0 ? { kind: "zero" } : { kind: "fixed", energy: totalCost };
    compensation = null;
  } else {
    // コスト4以上は3に圧縮し、代償を付与
    finalCost = { kind: "fixed", energy: 3 };
    compensation = { kind: "exhaust" };
  }

  // カード名
  const name = `${materialA.name}×${materialB.name}`;

  // 説明文: 各効果を「。」でつなぎ、代償があれば末尾に追加
  const effectDescriptions = combinedEffects.map(describeEffect).join("。");
  const compensationText =
    compensation !== null ? `\n${describeCompensation(compensation)}` : "";
  const description = `${effectDescriptions}。${compensationText}`;

  return {
    id,
    name,
    cost: finalCost,
    effects: combinedEffects,
    rarity: "rare", // オリジナルカードは希少度 rare として扱う
    description,
    isOriginal: true,
    materials: {
      cardAId: materialA.id,
      cardBId: materialB.id,
    },
    enemySlot: { kind: "empty" }, // Phase 3 では常に空き
    compensation,
  };
}

/**
 * 禁止組み合わせをチェックする
 * MVP: 同じ名前のカードを2枚使う場合のみ禁止
 */
export function checkForbiddenCombination(
  materialA: Card,
  materialB: Card,
): { ok: true } | { ok: false; reason: string } {
  if (materialA.name === materialB.name) {
    return { ok: false, reason: "同じカードは2枚合成できません" };
  }
  return { ok: true };
}

/**
 * カードが OriginalCard かどうかを判定する型ガード
 */
export function isOriginalCard(card: Card): card is OriginalCard {
  return "isOriginal" in card && (card as OriginalCard).isOriginal === true;
}

// オリジナルカード名の最大文字数
const MAX_ORIGINAL_CARD_NAME_LENGTH = 20;

/**
 * オリジナルカード名を正規化する
 * - 前後の空白をtrimする
 * - 最大20文字に切り詰める
 * - 空文字の場合はfallbackを返す
 */
export function normalizeOriginalCardName(
  input: string,
  fallback: string,
): string {
  const trimmed = input.trim().slice(0, MAX_ORIGINAL_CARD_NAME_LENGTH);
  return trimmed.length === 0
    ? fallback.slice(0, MAX_ORIGINAL_CARD_NAME_LENGTH)
    : trimmed;
}

/**
 * オリジナルカード名の重複チェック
 * - existingCards: 保存済みカード一覧
 * - excludeId: リネーム時に自分自身を除外するID（新規保存時は undefined）
 */
export function checkDuplicateName(
  name: string,
  existingCards: readonly OriginalCard[],
  excludeId?: string,
): { ok: true } | { ok: false; reason: string } {
  const isDuplicate = existingCards.some(
    (card) => card.name === name && card.id !== excludeId,
  );
  if (isDuplicate) {
    return {
      ok: false,
      reason: `「${name}」という名前のカードは既に保存されています`,
    };
  }
  return { ok: true };
}
