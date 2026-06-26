// カード図鑑ロジック（DOM依存ゼロ）
import type { GameState } from "./types/gameState";

/**
 * PersistentData のカード名配列からラン中に扱う Set を構築する。
 */
export function buildDiscoveredCardNames(
  discoveredCardNames: readonly string[],
): ReadonlySet<string> {
  return new Set(discoveredCardNames);
}

/**
 * カード使用時にカード名を図鑑へ登録する。
 * 既に登録済みなら参照を変えずにそのまま返す。
 */
export function registerCardUsage(
  state: GameState,
  cardName: string,
): GameState {
  if (state.run.discoveredCardNames.has(cardName)) return state;

  const discoveredCardNames = new Set(state.run.discoveredCardNames);
  discoveredCardNames.add(cardName);

  return {
    ...state,
    run: { ...state.run, discoveredCardNames },
  };
}
