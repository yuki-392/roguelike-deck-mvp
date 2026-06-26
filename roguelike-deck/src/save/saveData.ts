// セーブデータ管理（localStorage）
// ラン間で永続するデータ（オリジナルカード保存枠）を管理する
import type { OriginalCard } from "../core/types/originalCard";
import type { AchievementId } from "../core/types/achievement";
import { attachOrb, detachOrb } from "../core/codex";

// localStorage のキー
const STORAGE_KEY = "roguelike-persistent-data";

// 最大保存枚数
export const MAX_SAVED_ORIGINAL_CARDS = 5;

// ラン間で永続するデータ
export interface PersistentData {
  readonly savedOriginalCards: readonly OriginalCard[];
  readonly acquiredOrbIds: readonly string[]; // 解放済みエネミーオーブID
  readonly codexPoints: Record<string, number>; // enemyId → 図鑑ポイント（Map は JSON 化できないため Record）
  readonly discoveredCardNames: readonly string[]; // 使用済みカード名（Map/Set は JSON 化できないため配列）
  readonly unlockedAchievementIds: readonly AchievementId[]; // 解放済み実績ID
  readonly unlockedCardIds: readonly string[]; // 解放済みカードID
  readonly unlockedRelicIds: readonly string[]; // 解放済み遺物ID
  readonly maxUnlockedTrialLevel: 0 | 1; // 達成済み最大試練レベル
}

// デフォルト値
const DEFAULT_PERSISTENT_DATA: PersistentData = {
  savedOriginalCards: [],
  acquiredOrbIds: [],
  codexPoints: {},
  discoveredCardNames: [],
  unlockedAchievementIds: [],
  unlockedCardIds: [],
  unlockedRelicIds: [],
  maxUnlockedTrialLevel: 0,
};

/**
 * オリジナルカードの一意なIDを生成する
 * cards.ts の連番ID（attack-1 など）と衝突しない形式
 */
export function generateOriginalCardId(): string {
  return `original-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 保存データが PersistentData として有効かチェックする
 * 不正なデータはデフォルト値として扱う
 */
function isValidPersistentData(data: unknown): data is PersistentData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj["savedOriginalCards"])) return false;
  // 各カードが OriginalCard の最低限のプロパティを持つか確認
  const cards = obj["savedOriginalCards"];
  for (const card of cards) {
    if (typeof card !== "object" || card === null) return false;
    const c = card as Record<string, unknown>;
    if (typeof c["id"] !== "string") return false;
    if (typeof c["name"] !== "string") return false;
    if (c["isOriginal"] !== true) return false;
  }
  // acquiredOrbIds（省略可：旧セーブデータ互換）
  if (
    obj["acquiredOrbIds"] !== undefined &&
    !Array.isArray(obj["acquiredOrbIds"])
  ) {
    return false;
  }
  // codexPoints（省略可：旧セーブデータ互換）
  if (
    obj["codexPoints"] !== undefined &&
    (typeof obj["codexPoints"] !== "object" ||
      obj["codexPoints"] === null ||
      Array.isArray(obj["codexPoints"]))
  ) {
    return false;
  }
  // discoveredCardNames（省略可：旧セーブデータ互換）
  if (
    obj["discoveredCardNames"] !== undefined &&
    (!Array.isArray(obj["discoveredCardNames"]) ||
      !obj["discoveredCardNames"].every((name) => typeof name === "string"))
  ) {
    return false;
  }
  // 新フィールド群（省略可：旧セーブデータ互換）
  if (
    obj["unlockedAchievementIds"] !== undefined &&
    !Array.isArray(obj["unlockedAchievementIds"])
  ) {
    return false;
  }
  if (
    obj["unlockedCardIds"] !== undefined &&
    !Array.isArray(obj["unlockedCardIds"])
  ) {
    return false;
  }
  if (
    obj["unlockedRelicIds"] !== undefined &&
    !Array.isArray(obj["unlockedRelicIds"])
  ) {
    return false;
  }
  if (
    obj["maxUnlockedTrialLevel"] !== undefined &&
    obj["maxUnlockedTrialLevel"] !== 0 &&
    obj["maxUnlockedTrialLevel"] !== 1
  ) {
    return false;
  }
  return true;
}

/**
 * 実績を解放し、アンロックされたカード・遺物IDを付与した PersistentData を返す
 * すでに解放済みの実績はスキップする
 */
export function unlockAchievement(
  data: PersistentData,
  achievementId: AchievementId,
  newCardIds: readonly string[],
  newRelicIds: readonly string[],
): PersistentData {
  if (data.unlockedAchievementIds.includes(achievementId)) return data;
  return {
    ...data,
    unlockedAchievementIds: [...data.unlockedAchievementIds, achievementId],
    unlockedCardIds: [...new Set([...data.unlockedCardIds, ...newCardIds])],
    unlockedRelicIds: [...new Set([...data.unlockedRelicIds, ...newRelicIds])],
  };
}

/**
 * localStorage から永続データを読み込む
 * 読み込み失敗・バリデーション失敗時はデフォルト値を返す
 */
export function loadPersistentData(): PersistentData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PERSISTENT_DATA;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidPersistentData(parsed)) return DEFAULT_PERSISTENT_DATA;

    // 旧セーブデータに新フィールドがない場合はデフォルト値で補完
    return {
      ...DEFAULT_PERSISTENT_DATA,
      ...parsed,
    };
  } catch {
    return DEFAULT_PERSISTENT_DATA;
  }
}

/**
 * 保存済みオリジナルカードの名前を変更する
 * イミュータブルにスプレッド構文で更新する
 * localStorage への永続化は呼び出し側で savePersistentData を呼ぶこと
 */
export function renameOriginalCard(
  data: PersistentData,
  id: string,
  newName: string,
): PersistentData {
  return {
    ...data,
    savedOriginalCards: data.savedOriginalCards.map((card) =>
      card.id === id ? { ...card, name: newName } : card,
    ),
  };
}

/**
 * 保存済みオリジナルカードにエネミーオーブを装着する
 * acquiredOrbIds の検証は呼び出し側（main.ts）の責務
 */
export function attachOrbToSavedCard(
  data: PersistentData,
  cardId: string,
  orbId: string,
): PersistentData {
  return {
    ...data,
    savedOriginalCards: data.savedOriginalCards.map((card) =>
      card.id === cardId ? attachOrb(card, orbId) : card,
    ),
  };
}

/**
 * 保存済みオリジナルカードからエネミーオーブを取り外す
 */
export function detachOrbFromSavedCard(
  data: PersistentData,
  cardId: string,
): PersistentData {
  return {
    ...data,
    savedOriginalCards: data.savedOriginalCards.map((card) =>
      card.id === cardId ? detachOrb(card) : card,
    ),
  };
}

/**
 * 永続データを localStorage に書き込む
 */
export function savePersistentData(data: PersistentData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage が使えない環境（プライベートモードなど）では無視
  }
}
