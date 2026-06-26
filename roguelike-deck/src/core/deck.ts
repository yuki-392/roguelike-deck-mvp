// デッキ操作（シャッフル・ドロー・捨て札処理）
// すべての関数はイミュータブル更新（Player を直接ミューテーションしない）
import type { Player } from "./types";
import { shuffleArray, type RngFn } from "./rng";

/**
 * 指定した枚数のカードを手札にドローする
 * 山札が足りなければ捨て札をシャッフルして山札に戻してからドロー
 * 山札・捨て札ともに尽きた場合はドロー可能な枚数で停止する
 */
export function drawCards(player: Player, count: number, rng: RngFn): Player {
  let currentDeck = [...player.deck];
  let currentDiscard = [...player.discard];
  let currentHand = [...player.hand];

  for (let i = 0; i < count; i++) {
    // 山札が空なら捨て札をシャッフルして山札に補充
    if (currentDeck.length === 0) {
      if (currentDiscard.length === 0) {
        // 山札も捨て札も空：ドロー終了
        break;
      }
      currentDeck = shuffleArray(currentDiscard, rng);
      currentDiscard = [];
    }

    // 先頭からドロー（山札の先頭 = 一番上）
    const drawn = currentDeck[0];
    if (drawn === undefined) break;
    currentDeck = currentDeck.slice(1);
    currentHand = [...currentHand, drawn];
  }

  return {
    ...player,
    hand: currentHand,
    deck: currentDeck,
    discard: currentDiscard,
  };
}

/**
 * 指定した ID のカードを手札から捨て札に移動する
 * 該当カードが手札に存在しない場合は player をそのまま返す
 */
export function discardCard(player: Player, cardId: string): Player {
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) return player;

  const card = player.hand[cardIndex];
  if (card === undefined) return player;

  const newHand = [
    ...player.hand.slice(0, cardIndex),
    ...player.hand.slice(cardIndex + 1),
  ];
  const newDiscard = [...player.discard, card];

  return { ...player, hand: newHand, discard: newDiscard };
}

/**
 * 手札を全て捨て札に移動する（ターン終了時に呼ぶ）
 */
export function discardHand(player: Player): Player {
  const newDiscard = [...player.discard, ...player.hand];
  return { ...player, hand: [], discard: newDiscard };
}
