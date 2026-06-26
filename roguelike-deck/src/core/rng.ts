// 乱数生成ユーティリティ
// Math.random はこのファイルのみに封じ込め、他のコアモジュールは RngFn を引数として受け取る

export type RngFn = () => number;

// デフォルトの乱数関数（Math.random を使用）
export const defaultRng: RngFn = () => Math.random();

/**
 * Fisher-Yates シャッフル（イミュータブル）
 * 元の配列を変更せず、シャッフルされた新しい配列を返す
 */
export function shuffleArray<T>(arr: readonly T[], rng: RngFn): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    // 一時変数を使って swap（型安全に）
    const temp = result[i];
    const swapTarget = result[j];
    if (temp !== undefined && swapTarget !== undefined) {
      result[i] = swapTarget;
      result[j] = temp;
    }
  }
  return result;
}
