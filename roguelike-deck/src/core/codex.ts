// 敵図鑑・エネミーオーブロジック（DOM依存ゼロ）
import type { GameState } from "./types/gameState";
import type { EnemyCodexEntry, CodexState } from "./types/enemy";
import type { OriginalCard } from "./types/originalCard";
import { ALL_CODEX_ENEMIES } from "./data/orbData";

const CODEX_MAX_POINTS = 100;

// ---- 図鑑初期化ヘルパー ----

/**
 * codexPoints（Record）と acquiredOrbIds から CodexState（ReadonlyMap）を構築する
 * ラン開始時に PersistentData から復元するために使う
 */
export function buildCodexState(
  codexPoints: Record<string, number>,
  acquiredOrbIds: readonly string[],
): CodexState {
  const map = new Map<string, EnemyCodexEntry>();

  for (const spec of ALL_CODEX_ENEMIES) {
    const points = codexPoints[spec.enemyId] ?? 0;
    const isUnlocked =
      spec.orbId !== null && acquiredOrbIds.includes(spec.orbId);
    map.set(spec.enemyId, {
      enemyId: spec.enemyId,
      points,
      isUnlocked,
      orbId: spec.orbId,
    });
  }

  return map;
}

// ---- コアロジック ----

/**
 * 図鑑ポイントを加算する（上限 CODEX_MAX_POINTS）
 * 対象敵の CodexState エントリがなければ何もしない
 */
export function addCodexPoints(
  state: GameState,
  enemyId: string,
  points: number,
): GameState {
  const entry = state.run.codexState.get(enemyId);
  if (entry === undefined) return state;

  const newPoints = Math.min(entry.points + points, CODEX_MAX_POINTS);
  if (newPoints === entry.points) return state;

  const newEntry: EnemyCodexEntry = { ...entry, points: newPoints };
  const newCodexState = new Map(state.run.codexState);
  newCodexState.set(enemyId, newEntry);

  return {
    ...state,
    run: { ...state.run, codexState: newCodexState },
  };
}

/**
 * ポイントが満タンかつ未解放のとき、acquiredOrbIds にオーブIDを追加してログを記録する
 * addCodexPoints の後に呼ぶことで自動解放を実現する
 */
export function unlockOrb(state: GameState, enemyId: string): GameState {
  const entry = state.run.codexState.get(enemyId);
  if (entry === undefined) return state;
  if (entry.orbId === null) return state;
  if (entry.points < CODEX_MAX_POINTS) return state;
  if (entry.isUnlocked) return state;

  const newEntry: EnemyCodexEntry = { ...entry, isUnlocked: true };
  const newCodexState = new Map(state.run.codexState);
  newCodexState.set(enemyId, newEntry);

  const newAcquiredOrbIds = [...state.run.acquiredOrbIds, entry.orbId];

  return {
    ...state,
    run: {
      ...state.run,
      codexState: newCodexState,
      acquiredOrbIds: newAcquiredOrbIds,
    },
    log: [
      ...state.log,
      `【図鑑】${enemyId}の図鑑が満タンになった！${entry.orbId}を入手した。`,
    ],
  };
}

/**
 * オリジナルカードにエネミーオーブを装着する
 * enemySlot が "locked" の場合は変化なし
 */
export function attachOrb(card: OriginalCard, orbId: string): OriginalCard {
  if (card.enemySlot.kind === "locked") return card;
  return { ...card, enemySlot: { kind: "filled", orbId } };
}

/**
 * オリジナルカードからエネミーオーブを取り外す（ラン開始前のみ有効）
 * enemySlot が "locked" の場合は変化なし
 */
export function detachOrb(card: OriginalCard): OriginalCard {
  if (card.enemySlot.kind === "locked") return card;
  return { ...card, enemySlot: { kind: "empty" } };
}

/**
 * ラン開始時にエネミースロットを "locked" に変換する
 */
export function lockEnemySlot(card: OriginalCard): OriginalCard {
  return { ...card, enemySlot: { kind: "locked" } };
}
