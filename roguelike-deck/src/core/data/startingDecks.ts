// 開始デッキのメタデータ定義
// デッキの「カード生成」は cards.ts が担当し、ここはメタ情報のみ保持する
import type { StartingDeck } from "../types";
import { ANCIENT_EMBLEM, SMALL_GEAR } from "./relics";

// 均衡型: バランスの取れた基本デッキ。古びた紋章で毎戦闘ブロックを得る
export const BALANCED_DECK: StartingDeck = {
  type: "balanced",
  name: "均衡型",
  description:
    "攻守バランスの取れたデッキ。古びた紋章で毎バトル開始時にブロックを得る。",
  starterRelicId: ANCIENT_EMBLEM.id,
};

// 連撃型: コスト0カードで素早く展開し、歯車ダメージを蓄積する
export const COMBO_DECK: StartingDeck = {
  type: "combo",
  name: "連撃型",
  description:
    "コスト0カードを素早く連打するデッキ。小さな歯車で3枚目のプレイごとに敵にダメージを与える。",
  starterRelicId: SMALL_GEAR.id,
};

// 全開始デッキのリスト（UI で選択肢として表示する）
export const ALL_STARTING_DECKS: readonly StartingDeck[] = [
  BALANCED_DECK,
  COMBO_DECK,
];
