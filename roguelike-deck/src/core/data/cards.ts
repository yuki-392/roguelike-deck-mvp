// カードデータ定義
import type { Card, EvolveCard } from "../types";
import type { OriginalCard } from "../types/originalCard";

// ---- 拡張カードプール（攻撃系） ----

const PUNCH_CARD_BASE: Omit<Card, "id"> = {
  name: "パンチ",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "attack", amount: 8 }],
  rarity: "common",
  affinityTags: ["attack"],
  description: "8ダメージを与える。",
};

const KOGEKI_CARD_BASE: Omit<Card, "id"> = {
  name: "攻撃",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "attack", amount: 6 }],
  rarity: "common",
  affinityTags: ["attack"],
  description: "6ダメージを与える。",
};

const KYODA_CARD_BASE: Omit<Card, "id"> = {
  name: "強打",
  cost: { kind: "fixed", energy: 2 },
  effects: [{ kind: "attack", amount: 14 }],
  rarity: "common",
  affinityTags: ["attack"],
  description: "14ダメージを与える。",
};

const NIREN_CARD_BASE: Omit<Card, "id"> = {
  name: "二連攻撃",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "multiAttack", amount: 3, times: 2 }],
  rarity: "common",
  affinityTags: ["attack", "combo"],
  description: "3ダメージを2回与える。",
};

const YOROIKUDAKI_CARD_BASE: Omit<Card, "id"> = {
  name: "鎧砕き",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "attack", amount: 5 },
    { kind: "applyStatus", status: { kind: "laceration" }, stacks: 2 },
  ],
  rarity: "common",
  affinityTags: ["attack", "laceration"],
  description: "5ダメージ。敵に裂傷2を付与する。",
};

const DOKUHARI_CARD_BASE: Omit<Card, "id"> = {
  name: "毒針",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "attack", amount: 3 },
    { kind: "applyStatus", status: { kind: "poison" }, stacks: 2 },
  ],
  rarity: "common",
  affinityTags: ["attack", "poison"],
  description: "3ダメージ。敵に毒2を付与する。",
};

const SUTEMI_CARD_BASE: Omit<Card, "id"> = {
  name: "捨て身",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "attack", amount: 10 },
    { kind: "selfDamage", amount: 3 },
  ],
  rarity: "common",
  affinityTags: ["attack"],
  description: "10ダメージ。自分に3ダメージ。",
};

const TSUIGEKI_CARD_BASE: Omit<Card, "id"> = {
  name: "追撃",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    {
      kind: "conditionalAttack",
      baseAmount: 4,
      bonusAmount: 4,
      condition: "attackedThisTurn",
    },
  ],
  rarity: "common",
  affinityTags: ["attack", "combo"],
  description:
    "4ダメージ。このターンすでに攻撃カードを使っていれば追加4ダメージ。",
};

// ---- 拡張カードプール（防御系） ----

const BOGYO_CARD_BASE: Omit<Card, "id"> = {
  name: "防御",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "block", amount: 5 }],
  rarity: "common",
  affinityTags: ["defense"],
  description: "5ブロックを得る。",
};

const DAIBOGYO_CARD_BASE: Omit<Card, "id"> = {
  name: "大防御",
  cost: { kind: "fixed", energy: 2 },
  effects: [{ kind: "block", amount: 12 }],
  rarity: "common",
  affinityTags: ["defense"],
  description: "12ブロックを得る。",
};

const TATEUCHI_CARD_BASE: Omit<Card, "id"> = {
  name: "盾打ち",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "block", amount: 5 },
    { kind: "attack", amount: 3 },
  ],
  rarity: "common",
  affinityTags: ["attack", "defense"],
  description: "5ブロックを得る。3ダメージを与える。",
};

const MIKAWASHI_CARD_BASE: Omit<Card, "id"> = {
  name: "身かわし",
  cost: { kind: "zero" },
  effects: [
    { kind: "block", amount: 3 },
    { kind: "discard", count: 1 },
  ],
  rarity: "common",
  affinityTags: ["defense", "combo"],
  description: "3ブロックを得る。手札を1枚捨てる。",
};

const KOKA_CARD_BASE: Omit<Card, "id"> = {
  name: "硬化",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "block", amount: 8 },
    { kind: "discard", count: 1 },
  ],
  rarity: "common",
  affinityTags: ["defense"],
  description: "8ブロックを得る。手札を1枚捨てる。",
};

// ---- 拡張カードプール（スキル系） ----

const KANSATSU_CARD_BASE: Omit<Card, "id"> = {
  name: "観察",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "draw", count: 1 },
    { kind: "block", amount: 3 },
  ],
  rarity: "common",
  affinityTags: ["defense", "draw"],
  description: "カードを1枚引く。3ブロックを得る。",
};

const SENJUTSUSEIRI_CARD_BASE: Omit<Card, "id"> = {
  name: "戦術整理",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "draw", count: 2 },
    { kind: "discard", count: 1 },
  ],
  rarity: "common",
  affinityTags: ["combo", "draw"],
  description: "カードを2枚引き、1枚捨てる。",
};

const FUKOKYU_CARD_BASE: Omit<Card, "id"> = {
  name: "深呼吸",
  cost: { kind: "zero" },
  effects: [{ kind: "draw", count: 1 }],
  exhaust: true,
  rarity: "common",
  affinityTags: ["combo", "draw"],
  description: "カードを1枚引く。使用後廃棄。",
};

const SHUCHU_CARD_BASE: Omit<Card, "id"> = {
  name: "集中",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "costReductionNextCard", amount: 2 }],
  rarity: "common",
  affinityTags: ["combo"],
  description: "このターン、次に使うカードのコストが2減少する。",
};

const BOGYO_SHIJI_CARD_BASE: Omit<Card, "id"> = {
  name: "防御指示",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "block", amount: 6 },
    { kind: "buffNextDefense", amount: 3 },
  ],
  rarity: "common",
  affinityTags: ["defense"],
  description: "6ブロックを得る。次に使う防御カードに+3ブロック。",
};

const SHINSHOKU_CARD_BASE: Omit<Card, "id"> = {
  name: "侵蝕促進",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "amplifyEnemyStatus", amount: 2 }],
  rarity: "uncommon",
  affinityTags: ["poison", "laceration"],
  description: "敵の毒と裂傷をそれぞれ2増幅する。",
};

// ---- 特殊効果スロット付きカード ----

const RUNEBLADE_CARD_BASE: Omit<Card, "id"> = {
  name: "ルーンブレード",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "attack", amount: 7 }],
  rarity: "uncommon",
  affinityTags: ["attack", "forge"],
  cardSlot: { kind: "empty" },
  description: "7ダメージを与える。",
};

const RUNESHIELD_CARD_BASE: Omit<Card, "id"> = {
  name: "ルーンシールド",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "block", amount: 7 }],
  rarity: "uncommon",
  affinityTags: ["defense", "forge"],
  cardSlot: { kind: "empty" },
  description: "7ブロックを得る。",
};

const RUNESCRIPT_CARD_BASE: Omit<Card, "id"> = {
  name: "ルーン写本",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "draw", count: 2 }],
  rarity: "rare",
  affinityTags: ["draw", "forge"],
  cardSlot: { kind: "empty" },
  description: "カードを2枚ドローする。",
};

// ---- 進化カード ----

const EVOLVED_ASSAULT_ID = "evolved-assault";
const EVOLVED_VENOM_ID = "evolved-venom";

const GROWING_ASSAULT_CARD_BASE: Omit<EvolveCard, "id"> = {
  name: "成長する一撃",
  cost: { kind: "fixed", energy: 1 },
  effects: [{ kind: "attack", amount: 5 }],
  rarity: "uncommon",
  affinityTags: ["attack", "evolve"],
  description: "5ダメージを与える。3回使用すると進化する。",
  isEvolvable: true,
  evolveCondition: { kind: "useCount", threshold: 3 },
  evolvedCardId: EVOLVED_ASSAULT_ID,
};

const GROWING_VENOM_CARD_BASE: Omit<EvolveCard, "id"> = {
  name: "育つ毒牙",
  cost: { kind: "fixed", energy: 1 },
  effects: [
    { kind: "attack", amount: 3 },
    { kind: "applyStatus", status: { kind: "poison" }, stacks: 2 },
  ],
  rarity: "uncommon",
  affinityTags: ["attack", "poison", "evolve"],
  description: "3ダメージ。敵に毒2を付与する。毒を6付与すると進化する。",
  isEvolvable: true,
  evolveCondition: {
    kind: "statusApplied",
    status: "poison",
    threshold: 6,
  },
  evolvedCardId: EVOLVED_VENOM_ID,
};

const EVOLVED_CARD_BASES: Readonly<Record<string, Omit<Card, "id">>> = {
  [EVOLVED_ASSAULT_ID]: {
    name: "完成された一撃",
    cost: { kind: "fixed", energy: 1 },
    effects: [{ kind: "attack", amount: 11 }],
    rarity: "rare",
    affinityTags: ["attack"],
    description: "11ダメージを与える。",
  },
  [EVOLVED_VENOM_ID]: {
    name: "猛毒牙",
    cost: { kind: "fixed", energy: 1 },
    effects: [
      { kind: "attack", amount: 5 },
      { kind: "applyStatus", status: { kind: "poison" }, stacks: 5 },
    ],
    rarity: "rare",
    affinityTags: ["attack", "poison"],
    description: "5ダメージ。敵に毒5を付与する。",
  },
};

/**
 * 進化先の定義から、元カードと同じインスタンスIDを持つカードを生成する。
 * 同じIDを維持することでデッキ枚数を変えずに置換できる。
 */
export function createEvolvedCard(
  evolvedCardId: string,
  instanceId: string,
): Card | undefined {
  const cardBase = EVOLVED_CARD_BASES[evolvedCardId];
  return cardBase === undefined ? undefined : { ...cardBase, id: instanceId };
}

// ---- 素材化可能カード用 固定IDシングルトン ----
// getMaterializableCards() が直接参照する。
// デッキ生成で使う動的IDとは独立しているので ID 衝突なし。
// ゲームで実際に使われているカードと一致させる。

export const KOGEKI_MATERIAL: Card = {
  ...KOGEKI_CARD_BASE,
  id: "kogeki-material",
};
export const BOGYO_MATERIAL: Card = {
  ...BOGYO_CARD_BASE,
  id: "bogyo-material",
};
export const NIREN_MATERIAL: Card = {
  ...NIREN_CARD_BASE,
  id: "niren-material",
};
export const YOROIKUDAKI_MATERIAL: Card = {
  ...YOROIKUDAKI_CARD_BASE,
  id: "yoroikudaki-material",
};
export const DOKUHARI_MATERIAL: Card = {
  ...DOKUHARI_CARD_BASE,
  id: "dokuhari-material",
};
export const TATEUCHI_MATERIAL: Card = {
  ...TATEUCHI_CARD_BASE,
  id: "tateuchi-material",
};
export const SHUCHU_MATERIAL: Card = {
  ...SHUCHU_CARD_BASE,
  id: "shuchu-material",
};
export const KYODA_MATERIAL: Card = {
  ...KYODA_CARD_BASE,
  id: "kyoda-material",
};
export const DAIBOGYO_MATERIAL: Card = {
  ...DAIBOGYO_CARD_BASE,
  id: "daibogyo-material",
};

/**
 * 素材化可能なカードのIDセット
 * workshop.ts が型安全にフィルタリングする際に参照する
 */
export const MATERIAL_CARD_IDS: ReadonlySet<string> = new Set([
  "kogeki-material",
  "bogyo-material",
  "niren-material",
  "yoroikudaki-material",
  "dokuhari-material",
  "tateuchi-material",
  "shuchu-material",
  "kyoda-material",
  "daibogyo-material",
]);

// ユニーク ID 生成（デッキ内で同名カードを複数枚区別するために連番を付与）
let cardIdCounter = 0;
function nextCardId(name: string): string {
  cardIdCounter += 1;
  return `${name.toLowerCase()}-${cardIdCounter}`;
}

/**
 * 均衡型スターターデッキを生成して返す
 * 攻撃 x4、防御 x4、戦術整理 x1 の計9枚
 */
export function createStarterDeck(): readonly Card[] {
  // カウンターをリセット（テスト・リスタート時の再現性のため）
  cardIdCounter = 0;
  return [
    { ...KOGEKI_CARD_BASE, id: nextCardId("kogeki") },
    { ...KOGEKI_CARD_BASE, id: nextCardId("kogeki") },
    { ...KOGEKI_CARD_BASE, id: nextCardId("kogeki") },
    { ...KOGEKI_CARD_BASE, id: nextCardId("kogeki") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...SENJUTSUSEIRI_CARD_BASE, id: nextCardId("senjutsuseiri") },
  ];
}

/**
 * 連撃型スターターデッキを生成して返す
 * 二連攻撃 x4、防御 x4、観察 x1 の計9枚
 * コスト1の連打カードで小さな歯車を起動しつつ防御も確保する戦術
 */
export function createComboDeck(): readonly Card[] {
  // カウンターをリセット（テスト・リスタート時の再現性のため）
  cardIdCounter = 0;
  return [
    { ...NIREN_CARD_BASE, id: nextCardId("niren") },
    { ...NIREN_CARD_BASE, id: nextCardId("niren") },
    { ...NIREN_CARD_BASE, id: nextCardId("niren") },
    { ...NIREN_CARD_BASE, id: nextCardId("niren") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...KANSATSU_CARD_BASE, id: nextCardId("kansatsu") },
  ];
}

/**
 * オリジナルカードを持ち込まないランで補充する基本攻撃カードを生成する。
 */
export function createFallbackAttackCard(): Card {
  return { ...KOGEKI_CARD_BASE, id: nextCardId("kogeki") };
}

// upgradeCard での強化量（named constant）
const UPGRADE_ATTACK_BONUS = 3; // 攻撃系カードの強化ダメージ増加量
const UPGRADE_BLOCK_BONUS = 3; // 防御系カードの強化ブロック増加量

/**
 * カードを強化して返す
 * - 攻撃効果のダメージ増加・ブロック効果のブロック増加
 * - upgraded: true をセット（強化済みフラグ）
 * - OriginalCard を渡した場合、isOriginal・materials・enemySlot・compensation が保持される
 *   （Card の spread のあとに OriginalCard 固有フィールドを spread することで実現）
 *
 * @param card 強化対象のカード（OriginalCard を渡してもよい）
 * @returns 強化後のカード（OriginalCard を渡した場合は OriginalCard として返す）
 */
export function upgradeCard(card: Card): Card;
export function upgradeCard(card: OriginalCard): OriginalCard;
export function upgradeCard(card: Card | OriginalCard): Card | OriginalCard {
  const hasDrawEffect = card.effects.some((e) => e.kind === "draw");
  const hasAttackOrBlockEffect = card.effects.some(
    (e) =>
      e.kind === "attack" ||
      e.kind === "block" ||
      e.kind === "multiAttack" ||
      e.kind === "conditionalAttack",
  );

  // コスト0かつドロー効果なし → 強化でドロー1を追加付与
  const addDrawEffect = card.cost.kind === "zero" && !hasDrawEffect;

  // エフェクトを強化する
  // - 攻撃系: ダメージ増加 / 防御系: ブロック増加
  // - ドロー系技能カード: ドロー枚数+1
  // - コスト0・非ドロー技能カード: ドロー1を追加
  const upgradedEffects: import("../types").CardEffect[] = [
    ...card.effects.map((effect) => {
      if (effect.kind === "attack") {
        return { ...effect, amount: effect.amount + UPGRADE_ATTACK_BONUS };
      }
      if (effect.kind === "block") {
        return { ...effect, amount: effect.amount + UPGRADE_BLOCK_BONUS };
      }
      if (effect.kind === "multiAttack") {
        return { ...effect, amount: effect.amount + UPGRADE_ATTACK_BONUS };
      }
      if (effect.kind === "conditionalAttack") {
        return {
          ...effect,
          baseAmount: effect.baseAmount + UPGRADE_ATTACK_BONUS,
        };
      }
      if (effect.kind === "draw" && hasDrawEffect) {
        return { ...effect, count: effect.count + 1 };
      }
      return effect;
    }),
    ...(addDrawEffect ? [{ kind: "draw" as const, count: 1 }] : []),
  ];

  // ドロー効果も攻撃/防御効果もない技能カードはコストを1下げる（コスト0は除く）
  const upgradedCost: import("../types").CardCost =
    !hasDrawEffect && !hasAttackOrBlockEffect && card.cost.kind === "fixed"
      ? { kind: "fixed", energy: Math.max(0, card.cost.energy - 1) }
      : card.cost;

  // 基本カードとして強化済みオブジェクトを作成
  const upgradedBase: Card = {
    ...card,
    cost: upgradedCost,
    effects: upgradedEffects,
    upgraded: true,
  };

  // OriginalCard であれば固有フィールドを保持したまま返す
  if ("isOriginal" in card && card.isOriginal === true) {
    const originalCard = card as OriginalCard;
    const result: OriginalCard = {
      ...upgradedBase,
      isOriginal: true,
      materials: originalCard.materials,
      enemySlot: originalCard.enemySlot,
      compensation: originalCard.compensation,
    };
    return result;
  }

  return upgradedBase;
}

/**
 * 報酬プール（スターター以外の全カード）を生成して返す
 * 報酬フェーズでランダム3枚を選ぶための候補リスト
 * 注意: createStarterDeck() 呼び出し後に実行することで ID 重複を防ぐ
 */
export function createRewardPool(): readonly Card[] {
  return [
    // 攻撃系
    { ...PUNCH_CARD_BASE, id: nextCardId("punch") },
    { ...KOGEKI_CARD_BASE, id: nextCardId("kogeki") },
    { ...KYODA_CARD_BASE, id: nextCardId("kyoda") },
    { ...NIREN_CARD_BASE, id: nextCardId("niren") },
    { ...YOROIKUDAKI_CARD_BASE, id: nextCardId("yoroikudaki") },
    { ...DOKUHARI_CARD_BASE, id: nextCardId("dokuhari") },
    { ...SUTEMI_CARD_BASE, id: nextCardId("sutemi") },
    { ...TSUIGEKI_CARD_BASE, id: nextCardId("tsuigeki") },
    // 防御系
    { ...BOGYO_CARD_BASE, id: nextCardId("bogyo") },
    { ...DAIBOGYO_CARD_BASE, id: nextCardId("daibogyo") },
    { ...TATEUCHI_CARD_BASE, id: nextCardId("tateuchi") },
    { ...MIKAWASHI_CARD_BASE, id: nextCardId("mikawashi") },
    { ...KOKA_CARD_BASE, id: nextCardId("koka") },
    // スキル系
    { ...KANSATSU_CARD_BASE, id: nextCardId("kansatsu") },
    { ...SENJUTSUSEIRI_CARD_BASE, id: nextCardId("senjutsuseiri") },
    { ...FUKOKYU_CARD_BASE, id: nextCardId("fukokyu") },
    { ...SHUCHU_CARD_BASE, id: nextCardId("shuchu") },
    { ...BOGYO_SHIJI_CARD_BASE, id: nextCardId("bogyoshiji") },
    { ...SHINSHOKU_CARD_BASE, id: nextCardId("shinshoku") },
    // 特殊効果スロット付き
    { ...RUNEBLADE_CARD_BASE, id: nextCardId("runeblade") },
    { ...RUNESHIELD_CARD_BASE, id: nextCardId("runeshield") },
    { ...RUNESCRIPT_CARD_BASE, id: nextCardId("runescript") },
    // 進化カード
    { ...GROWING_ASSAULT_CARD_BASE, id: nextCardId("growing-assault") },
    { ...GROWING_VENOM_CARD_BASE, id: nextCardId("growing-venom") },
  ];
}
