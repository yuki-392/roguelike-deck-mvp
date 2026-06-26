// 休憩所画面 UI 制御
// 「HP回復」か「カード強化」を選択し、callbacks に委譲する
// ゲームロジックはここでは行わない
import type { GameState } from "../core/types";
import type { RendererCallbacks } from "../renderer/types/renderer";
import type { Card } from "../core/types";
import { describeCardCost } from "../renderer/ascii";

/**
 * 休憩所画面を container に構築する
 * - 「HP を回復する」ボタン → callbacks.onSelectRest("heal")
 * - 「カードを強化する」ボタン → カード選択エリアを表示
 * - カード選択エリア: upgraded !== true のカードのみ表示
 *   選択で callbacks.onSelectUpgradeCard(cardId)
 *
 * @param container 画面を挿入する DOM 要素
 * @param callbacks Renderer コールバック群
 * @param state 現在の GameState
 * @returns クリーンアップ関数（イベントリスナーを解除して DOM から削除する）
 */
export function renderRestScreen(
  container: HTMLElement,
  callbacks: RendererCallbacks,
  state: GameState,
): () => void {
  const screen = document.createElement("div");
  screen.id = "rest-screen-dynamic";

  const heading = document.createElement("h1");
  heading.textContent = "休憩所";
  screen.appendChild(heading);

  // 現在のHP表示
  const hpInfo = document.createElement("p");
  hpInfo.textContent = `HP: ${state.player.currentHp} / ${state.player.maxHp}`;
  screen.appendChild(hpInfo);

  // クリーンアップ用にハンドラーを記録
  const handlers: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];

  // 「HP を回復する」ボタン
  const healBtn = document.createElement("button");
  healBtn.type = "button";
  healBtn.id = "rest-heal-btn";
  healBtn.textContent = "HP を回復する（最大HPの20%）";

  const healHandler = () => {
    callbacks.onSelectRest("heal");
  };
  healBtn.addEventListener("click", healHandler);
  handlers.push({ btn: healBtn, handler: healHandler });
  screen.appendChild(healBtn);

  // 「カードを強化する」ボタン
  const upgradeBtn = document.createElement("button");
  upgradeBtn.type = "button";
  upgradeBtn.id = "rest-upgrade-btn";
  upgradeBtn.textContent = "カードを強化する";

  // カード選択エリア（初期は非表示）
  const cardChoiceArea = document.createElement("section");
  cardChoiceArea.id = "rest-card-choice-area";
  cardChoiceArea.style.display = "none";

  const cardChoiceHeading = document.createElement("h2");
  cardChoiceHeading.textContent = "強化するカードを選んでください";
  cardChoiceArea.appendChild(cardChoiceHeading);

  const cardChoiceDesc = document.createElement("p");
  cardChoiceDesc.textContent = "強化済みのカードは表示されません。";
  cardChoiceArea.appendChild(cardChoiceDesc);

  const cardList = document.createElement("div");
  cardList.id = "rest-card-list";

  // upgraded !== true のカードのみ表示（hand + discard は戦闘前に deck に統合済み）
  const upgradableCards: Card[] = state.player.deck.filter(
    (c) => c.upgraded !== true,
  );

  if (upgradableCards.length === 0) {
    const noCards = document.createElement("p");
    noCards.textContent = "強化できるカードがありません。";
    cardList.appendChild(noCards);
  } else {
    for (const card of upgradableCards) {
      const cardBtn = document.createElement("button");
      cardBtn.type = "button";
      cardBtn.className = "rest-card-btn";
      cardBtn.dataset["cardId"] = card.id;

      const costText = describeCardCost(card);
      const isOriginal =
        "isOriginal" in card &&
        (card as { isOriginal: boolean }).isOriginal === true;
      const originalMark = isOriginal ? "【オリジナル】" : "";
      cardBtn.textContent = `${originalMark}${card.name} コスト:${costText} — ${card.description}`;

      const cardHandler = () => {
        callbacks.onSelectUpgradeCard(card.id);
      };
      cardBtn.addEventListener("click", cardHandler);
      handlers.push({ btn: cardBtn, handler: cardHandler });
      cardList.appendChild(cardBtn);
    }
  }

  cardChoiceArea.appendChild(cardList);

  // 「カードを強化する」ボタンのクリックでカード選択エリアを表示
  const upgradeHandler = () => {
    callbacks.onSelectRest("upgrade");
    // カード選択エリアを表示し、ボタンを非活性にする
    cardChoiceArea.style.display = "";
    upgradeBtn.disabled = true;
    healBtn.disabled = true;
  };
  upgradeBtn.addEventListener("click", upgradeHandler);
  handlers.push({ btn: upgradeBtn, handler: upgradeHandler });

  screen.appendChild(upgradeBtn);
  screen.appendChild(cardChoiceArea);

  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.id = "rest-leave-btn";
  leaveBtn.textContent = "戻る（何もしない）";
  const leaveHandler = () => callbacks.onLeaveRest();
  leaveBtn.addEventListener("click", leaveHandler);
  handlers.push({ btn: leaveBtn, handler: leaveHandler });
  screen.appendChild(leaveBtn);

  container.appendChild(screen);

  // クリーンアップ関数
  return () => {
    for (const { btn, handler } of handlers) {
      btn.removeEventListener("click", handler);
    }
    screen.remove();
  };
}
