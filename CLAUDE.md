# CLAUDE.md

このファイルはClaude Codeがプロジェクトを理解するためのガイドです。

## プロジェクト概要

カードバトル型ローグライトのWebブラウザゲーム。
TypeScript + Vite + DOM/Canvas で実装。ASCII表示からスタートし、後でドット絵に移行する。

**コアコンセプト**：2枚のカードを合成して作った自分だけの「オリジナルカード」を軸に、開始デッキ・敵図鑑・進化カード・鍛冶を組み合わせて戦う。

主な独自要素：

- **オリジナルカード**：既存カード2枚を合成して作る切り札。ラン開始前に工房で作成し、1枚だけ持ち込む
- **エネミースロット**：オリジナルカード専用スロット。敵図鑑報酬のエネミーオーブを装着する
- **敵図鑑**：敵を倒すとポイントが貯まり、エネミーオーブを解放する長期目標
- **開始デッキ**：均衡型・連撃型・守護型・侵蝕型の4種類。キャラクターの代わりにランの戦術方針を決める
- **鍛冶**：カード特殊効果付与 or 遺物変換を選べるノード

詳細仕様は **[SPEC.md](./SPEC.md)** を参照。

## 開発計画

開発計画・フェーズ・ディレクトリ構成はすべて **[PLAN.md](./PLAN.md)** に記載する。
タスクの追加・進捗更新もPLAN.mdを編集すること。

## 技術スタック

- **言語**: TypeScript
- **ビルド**: Vite
- **レンダリング**: DOM / Canvas（ゲームエンジン不使用）

## 設計原則

### Renderer分離

`src/core/` 配下にDOMや描画処理を書いてはいけない。
ゲームロジックは `GameState` を受け取り・返すだけにする。

```
✅ core/battle.ts → GameState を受け取って新しい GameState を返す
❌ core/battle.ts → document.getElementById('hp').textContent = ...
```

- `Renderer` インターフェースを通じてレンダラーを差し替え可能にする
- `GameState` はロジック層が所有し、描画層は読み取り専用で参照する

### 型安全性

- `any` は使用禁止
- `strict: true` を維持する
- カード効果・敵行動は必ず Discriminated Union で表現する

### GameState はイミュータブルに更新

```typescript
// ✅
return { ...state, player: { ...state.player, hp: newHp } };
// ❌
state.player.hp = newHp;
```

## ファイル構成

```
src/
├── core/                  # ゲームロジック（DOM依存ゼロ）
│   ├── types/
│   │   ├── card.ts        # Card, OriginalCard, EvolveCard, CardSlot など
│   │   ├── enemy.ts       # Enemy, EnemyOrb, EnemyCodex など
│   │   ├── relic.ts       # Relic, StarterRelic など
│   │   ├── potion.ts      # Potion
│   │   ├── status.ts      # StatusEffect（毒・裂傷・ブロックなど）
│   │   ├── gameState.ts   # GameState（ラン中の状態）
│   │   ├── runSetup.ts    # StartingDeck, RunConfig など
│   │   └── index.ts       # re-export
│   ├── data/
│   │   ├── cards.ts       # カードデータ定義
│   │   ├── enemies.ts     # 敵データ定義
│   │   ├── relics.ts      # 遺物データ定義
│   │   ├── potions.ts     # ポーションデータ定義
│   │   └── startingDecks.ts  # 開始デッキ定義
│   ├── battle.ts          # バトルロジック
│   ├── deck.ts            # デッキ操作（ドロー・捨て札・循環）
│   ├── map.ts             # フロア・ノード生成
│   ├── workshop.ts        # オリジナルカード工房ロジック
│   ├── codex.ts           # 敵図鑑・エネミーオーブロジック
│   ├── forge.ts           # 鍛冶ロジック（カード鍛冶・遺物変換）
│   ├── reward.ts          # 報酬生成・補正ロジック
│   ├── progression.ts     # 実績・進行度解放ロジック
│   └── rng.ts             # 乱数生成
├── renderer/              # 描画層
│   ├── interface.ts       # Renderer インターフェース
│   ├── ascii.ts           # AsciiRenderer
│   └── pixel.ts           # PixelRenderer（将来）
├── screens/               # 各画面のUI制御
│   ├── battle.ts          # 戦闘画面
│   ├── map.ts             # マップ画面
│   ├── workshop.ts        # オリジナルカード工房画面
│   ├── codex.ts           # 敵図鑑画面
│   ├── runSetup.ts        # ラン準備画面
│   ├── forge.ts           # 鍛冶画面
│   ├── shop.ts            # ショップ画面
│   └── result.ts          # リザルト画面
├── save/
│   └── saveData.ts        # セーブ・ロード（localStorage）
└── main.ts
.claude/
├── agents/        # サブエージェント定義
├── commands/      # スラッシュコマンド
├── plans/         # Plannerの出力（実装計画）
└── progress/      # Generatorの作業ログ
```

## コミットルール

- `feat: カード[Draw]を追加` のように機能単位でコミットする
- 計画ファイルのステップ番号をコミットメッセージに含める
- PRはレビューなしでmainにマージしない

## サブエージェントの使い方

新機能を追加するとき：

```
/feature-pipeline <実装したい機能の説明>
```

個別に使うとき：

- 設計が必要 → `planner` エージェントに依頼
- 実装だけしたい → `generator` エージェントに依頼
- コードレビューしたい → `evaluator` エージェントに依頼

## 言語・コミュニケーション

- コメントは日本語で書く
- コード・変数名は英語
- PRのdescriptionは日本語で書く
