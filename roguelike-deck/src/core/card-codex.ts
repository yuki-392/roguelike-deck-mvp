// カード図鑑ロジック（DOM依存ゼロ）
import type { GameState } from "./types/gameState";
import type { CardCategory } from "./types/card";

export interface CardCodexGroup {
  readonly category: CardCategory | "unknown";
  readonly label: string;
  readonly entries: readonly {
    readonly no: string;
    readonly name: string;
  }[];
}

type CatalogEntry = {
  readonly no: string;
  readonly category: CardCategory;
};

const CODEX_CATEGORY_DEFINITIONS = [
  { category: "attack", label: "攻撃" },
  { category: "defense", label: "防御" },
  { category: "skill", label: "スキル" },
  { category: "evolve", label: "進化" },
] as const;

/**
 * 発見済みカードを図鑑の表示カテゴリとカタログNo順にまとめる。
 * カタログ未登録のカードは最後の「未分類」グループに退避する。
 */
export function groupDiscoveredCards(
  discoveredNames: ReadonlySet<string>,
  catalog: ReadonlyMap<string, CatalogEntry>,
): readonly CardCodexGroup[] {
  const entriesByCategory = new Map<
    CardCodexGroup["category"],
    { no: string; name: string }[]
  >();

  for (const name of discoveredNames) {
    const catalogEntry = catalog.get(name);
    const category =
      catalogEntry === undefined || catalogEntry.category === "original"
        ? "unknown"
        : catalogEntry.category;
    const no =
      catalogEntry?.category === "original" || catalogEntry === undefined
        ? "catalog-missing"
        : catalogEntry.no;
    const existing = entriesByCategory.get(category) ?? [];
    entriesByCategory.set(category, [...existing, { no, name }]);
  }

  const definitions: readonly {
    readonly category: CardCodexGroup["category"];
    readonly label: string;
  }[] = [
    ...CODEX_CATEGORY_DEFINITIONS,
    { category: "unknown", label: "未分類" },
  ];

  return definitions.flatMap(({ category, label }) => {
    const entries = entriesByCategory.get(category);
    if (entries === undefined || entries.length === 0) return [];

    return [
      {
        category,
        label,
        entries: entries.toSorted(
          (left, right) =>
            left.no.localeCompare(right.no) ||
            left.name.localeCompare(right.name, "ja"),
        ),
      },
    ];
  });
}

function normalizeCardCodexName(cardName: string): string {
  return cardName.endsWith("+") ? cardName.slice(0, -1) : cardName;
}

/**
 * PersistentData のカード名配列からラン中に扱う Set を構築する。
 */
export function buildDiscoveredCardNames(
  discoveredCardNames: readonly string[],
): ReadonlySet<string> {
  return new Set(discoveredCardNames.map(normalizeCardCodexName));
}

/**
 * カード使用時にカード名を図鑑へ登録する。
 * 既に登録済みなら参照を変えずにそのまま返す。
 */
export function registerCardUsage(
  state: GameState,
  cardName: string,
): GameState {
  const codexName = normalizeCardCodexName(cardName);
  if (state.run.discoveredCardNames.has(codexName)) return state;

  const discoveredCardNames = new Set(state.run.discoveredCardNames);
  discoveredCardNames.add(codexName);

  return {
    ...state,
    run: { ...state.run, discoveredCardNames },
  };
}
