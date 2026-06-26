// 開始デッキのメタデータ定義
// デッキの「カード生成」は cards.ts が担当し、ここはメタ情報のみ保持する
import type { StartingDeck } from "../types";
import {
  ANCIENT_EMBLEM,
  BLACK_VIAL,
  CRACKED_SHIELD,
  SMALL_GEAR,
} from "./relics";

// 均衡型: バランスの取れた基本デッキ。古びた紋章で初手の攻撃を強める
export const BALANCED_DECK: StartingDeck = {
  type: "balanced",
  name: "均衡型",
  description:
    "攻守バランスの取れたデッキ。古びた紋章で1ターン目の最初の攻撃を強める。",
  starterRelicId: ANCIENT_EMBLEM.id,
};

// 連撃型: 複数回攻撃で小さな歯車の追加火力を活かす
export const COMBO_DECK: StartingDeck = {
  type: "combo",
  name: "連撃型",
  description:
    "複数回攻撃を軸にしたデッキ。小さな歯車で1ターン目の追撃を強める。",
  starterRelicId: SMALL_GEAR.id,
};

// 守護型: ブロックを維持しながら長期戦を狙う
export const GUARDIAN_DECK: StartingDeck = {
  type: "guardian",
  name: "守護型",
  description:
    "防御を軸にしたデッキ。ひび割れた盾でターン開始時の最低限の守りを確保する。",
  starterRelicId: CRACKED_SHIELD.id,
};

// 侵蝕型: 毒を軸に敵を削る
export const EROSION_DECK: StartingDeck = {
  type: "erosion",
  name: "侵蝕型",
  description: "毒と弱体を軸にしたデッキ。黒い小瓶で戦闘開始時に毒を付与する。",
  starterRelicId: BLACK_VIAL.id,
};

// 全開始デッキのリスト（UI で選択肢として表示する）
export const ALL_STARTING_DECKS: readonly StartingDeck[] = [
  BALANCED_DECK,
  COMBO_DECK,
  GUARDIAN_DECK,
  EROSION_DECK,
];
