# Phase 3 ボス戦 実装計画

作成日: 2026-06-21

---

## 目的

10マス目に到達した際にボスとの戦闘を発生させ、勝利でゲームクリア・敗北でゲームオーバーへ
遷移するコアループを完成させる。
これにより Phase 3「ローグライク要素」の全項目を完了し、一周プレイが通しでできる状態にする。

---

## スプリント契約

### 実装する

- `Enemy` 型に `tier` フィールドを追加し、ボスを型レベルで識別できるようにする
- ボス用の行動定義（HP しきい値またはターン数による多段階パターン）を `core/data/enemies.ts` に追加する
- `roomNumber === 10` 到達時にボスを生成するロジックを `core/battle.ts` に組み込む
- ボス撃破時に `"victory"` フェーズへ遷移させる（既存の `"reward"` ルーティングを条件分岐に変更）
- `AsciiRenderer` にボス専用の視覚表現（タイトル装飾・HP バー強調）を追加する
- ゲームクリア画面を `"gameover"` 画面とは視覚的に区別できるよう `ascii.ts` を更新する

### 実装しない（スコープ外）

- ステータス効果（vulnerable / weak / poison / strength）の実装（現在スタブ扱い）
- ゲームリスタートボタン（クリア・ゲームオーバー後にリロードで対応）
- ボス撃破後の追加報酬・エンディング演出
- 中ボス（PLAN.md Phase 4 スコープ）

---

## 影響範囲

| ファイル                      | 変更種別                                                            |
| ----------------------------- | ------------------------------------------------------------------- |
| `src/core/types/enemy.ts`     | `Enemy` インターフェースに `tier` フィールドを追加                  |
| `src/core/types/gameState.ts` | `GameState` にターンカウンター追加（案Bを採用した場合のみ）         |
| `src/core/data/enemies.ts`    | ボス生成ファクトリ関数・行動定義を追加                              |
| `src/core/battle.ts`          | `checkPhase` のルーティング変更、`proceedToNextRoom` のボス分岐追加 |
| `src/renderer/ascii.ts`       | ボス視覚表現、クリア画面の強化                                      |

---

## 型定義の変更案

### `core/types/enemy.ts` への追加

```typescript
// 敵の格付け（ボス判別・将来の中ボス追加に対応）
export type EnemyTier = "normal" | "boss";

// Enemy インターフェースに追加するフィールド
readonly tier: EnemyTier;
```

### `selectAction` シグネチャの選択肢（友達が選ぶ）

現在のシグネチャ `(turn: number, playerHp: number) => EnemyAction` では、ボス自身の HP
しきい値による行動変化を表現できない。以下のいずれかを友達が選択する：

- **案A**: 引数を `(context: { turn: number; enemyHp: number; playerHp: number })` に変更する
- **案B**: `turn` 引数でフェーズ管理（`GameState` に `battleTurn` フィールドを追加）
- **案C**: ボス専用の行動関数を `EnemyBehavior` の外に定義し、`battle.ts` 内で直接呼ぶ

> 注意：`battle.ts` の `selectAction(0, ...)` 呼び出しはターン番号を常に 0 で渡しており、
> 案A・案Bどちらを採用するにせよ修正が必要。

### `core/types/gameState.ts`（案Bのみ）

```typescript
// GameState に追加するフィールド（案B のみ）
readonly battleTurn: number; // バトル内ターン番号（0始まり）
```

---

## 実装ステップ

### ステップ 1: `Enemy` 型に `tier` を追加（担当：友達）

`src/core/types/enemy.ts` に `EnemyTier` 型を定義し、`Enemy` インターフェースに
`readonly tier: EnemyTier` を追加する。

既存の `createStarterEnemy()` が返すオブジェクトに `tier: "normal"` を追記する必要があるため、
`src/core/data/enemies.ts` も同時に修正すること（型エラーを解消するため）。

### ステップ 2: `selectAction` の呼び出し問題を解決（担当：友達）

`battle.ts` の `selectAction(0, ...)` を修正する。
採用する案（A/B/C）に応じて `EnemyBehavior` のシグネチャ変更と `GameState` への
フィールド追加を行う。

### ステップ 3: ボス生成ファクトリと行動定義を追加（担当：友達）

`src/core/data/enemies.ts` にボス用の行動パターンとファクトリ関数を追加する。

- HP・攻撃力などのバランス数値は名前付き定数として定義（目安: HP 80〜100、攻撃力は通常敵より高め）
- 多段階行動パターン（例：HP が一定以下になると攻撃力が上がるなど）を実装する
- `attack` / `block` / `idle` のみで表現すること（`applyStatus` / `buff` は現在スタブのため使用禁止）

### ステップ 4: `checkPhase` のルーティング修正（担当：友達）

現在 `checkPhase` は敵 HP が 0 以下になると常に `"reward"` フェーズへ遷移する。

```
敵 HP ≤ 0 かつ tier === "boss"  →  phase: "victory"
敵 HP ≤ 0 かつ tier === "normal" →  phase: "reward"（現状維持）
プレイヤー HP ≤ 0               →  phase: "gameover"（現状維持）
```

### ステップ 5: `proceedToNextRoom` にボス分岐を追加（担当：友達）

現在 `proceedToNextRoom` は常に `createStarterEnemy()` を呼ぶ。
`roomNumber` は 1 始まりのため、ボス出現条件は `nextRoomNumber === 10` と定義する。

### ステップ 6: AsciiRenderer にボス視覚表現を追加（担当：Yuki）

`state.enemy.tier === "boss"` を参照して以下を変更する：

- 敵名称エリアに視覚的マーカーを追加（例：`【BOSS】` プレフィックス、CSSクラス付与）
- 敵 HP 表示をボス専用スタイルに（例：色変更・装飾）
- 行動予告表示はそのまま流用可（ロジック変更なし）

### ステップ 7: AsciiRenderer でゲームクリア画面を強化（担当：Yuki）

`"victory"` と `"gameover"` を視覚的に区別できるよう `ascii.ts` を更新する。
`"gameover"` 表示との視覚的区別が分かることが最低条件。

---

## リスク

| リスク                                                              | 影響 | 対策                                                                 |
| ------------------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| `selectAction` シグネチャ変更で型エラーが発生する                   | 中   | ステップ2を先行させ、型エラーをゼロにしてからステップ3以降に進む     |
| ボスが `"reward"` フェーズを経由してしまう（分岐漏れ）              | 高   | `checkPhase` の変更後に `tier: "boss"` 時の遷移を確認する            |
| `roomNumber` の 1 始まりを見落として11部屋目にボスが出現する        | 中   | ステップ5のコメントに「1始まり・10が最終マス」を明記する             |
| ボスの `applyStatus` 系行動を定義してしまい、サイレントに無視される | 低   | ステップ3のコメントに現在スタブ中の EnemyAction を列挙して禁止を明記 |

---

## 担当サマリー

| ステップ                                      | 担当 |
| --------------------------------------------- | ---- |
| 1. `Enemy` に `tier` 追加・既存ファクトリ修正 | 友達 |
| 2. `selectAction` 呼び出し問題の解決          | 友達 |
| 3. ボス生成ファクトリ・行動定義               | 友達 |
| 4. `checkPhase` のルーティング修正            | 友達 |
| 5. `proceedToNextRoom` のボス分岐追加         | 友達 |
| 6. AsciiRenderer ボス視覚表現                 | Yuki |
| 7. AsciiRenderer クリア画面強化               | Yuki |
