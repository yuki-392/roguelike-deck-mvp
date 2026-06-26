// ラン準備画面: 開始デッキ選択 + 持ち込みオリジナルカード選択UI
// DOM を構築してボタンをレンダリングし、選択を callbacks に委譲する
// ゲームロジック（デッキ生成・遺物割り当て）はここでは行わない
import type { RendererCallbacks } from "../renderer/types/renderer";
import type { OriginalCard } from "../core/types/originalCard";
import type { StartingDeckType } from "../core/types/runSetup";
import { ALL_STARTING_DECKS } from "../core/data/startingDecks";

/**
 * ラン準備画面を構築して container に追加する
 * デッキ選択後に持ち込みオリジナルカード選択エリアを表示する
 * 「ランを始める」ボタンで callbacks.onConfirmRunSetup(deckType, cardId|null) を呼び出す
 *
 * @param container 画面を挿入する DOM 要素
 * @param callbacks Renderer コールバック群
 * @param savedOriginalCards 保存済みオリジナルカード一覧
 * @returns クリーンアップ関数（ハンドラーを解除する）
 */
export function renderRunSetupScreen(
  container: HTMLElement,
  callbacks: RendererCallbacks,
  savedOriginalCards: readonly OriginalCard[],
  maxUnlockedTrialLevel: 0 | 1 = 0,
): () => void {
  // 選択中のデッキタイプと持ち込みカードID・試練レベル
  let selectedDeckType: StartingDeckType | null = null;
  let selectedDeckName: string | null = null;
  let selectedOriginalCardId: string | null = null;
  let selectedOriginalCardName: string | null = null;
  let selectedTrialLevel: 0 | 1 = 0;

  // ---- DOM 構築 ----
  const screen = document.createElement("div");
  screen.id = "run-setup-screen";

  const heading = document.createElement("h1");
  heading.textContent = "ラン準備";
  screen.appendChild(heading);

  const description = document.createElement("p");
  description.textContent =
    "開始デッキを選択してください。デッキの種類によって戦術方針と初期遺物が変わります。";
  screen.appendChild(description);

  // 選択サマリー（常に表示。選択に応じて内容を更新）
  const summary = document.createElement("div");
  summary.id = "run-setup-summary";
  const updateSummary = (deckName: string | null, cardName: string | null) => {
    summary.innerHTML = `
      <div>デッキ: <strong>${deckName ?? "未選択"}</strong></div>
      <div>持ち込みカード: <strong>${cardName ?? "なし"}</strong></div>
    `;
  };
  updateSummary(null, null);
  screen.appendChild(summary);

  // デッキ選択エリア
  const deckChoiceArea = document.createElement("div");
  deckChoiceArea.id = "deck-choice-area";
  screen.appendChild(deckChoiceArea);

  // クリーンアップ用にハンドラーを記録
  const handlers: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];

  // 各開始デッキのボタンを生成
  for (const deck of ALL_STARTING_DECKS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "deck-choice-btn";
    btn.dataset["deckType"] = deck.type;

    const btnTitle = document.createElement("strong");
    btnTitle.textContent = deck.name;
    btn.appendChild(btnTitle);

    const btnDesc = document.createElement("p");
    btnDesc.textContent = deck.description;
    btn.appendChild(btnDesc);

    const handler = () => {
      selectedDeckType = deck.type;
      selectedDeckName = deck.name;
      // 選択状態のスタイルを更新
      for (const { btn: b } of handlers) {
        b.classList.remove("deck-choice-btn--selected");
      }
      btn.classList.add("deck-choice-btn--selected");
      startBtn.disabled = false;
      // 持ち込みカード選択エリアを表示
      originalCardArea.style.display = "";
      updateSummary(deck.name, selectedOriginalCardName);
    };
    btn.addEventListener("click", handler);
    handlers.push({ btn, handler });

    deckChoiceArea.appendChild(btn);
  }

  // 持ち込みオリジナルカード選択エリア（デッキ選択後に表示）
  const originalCardArea = document.createElement("section");
  originalCardArea.id = "run-setup-original-card-area";
  originalCardArea.style.display = "none";

  const originalCardHeading = document.createElement("h2");
  originalCardHeading.textContent = "持ち込むオリジナルカードを選ぶ（任意）";
  originalCardArea.appendChild(originalCardHeading);

  const originalCardDesc = document.createElement("p");
  originalCardDesc.textContent =
    "保存済みのオリジナルカードを1枚持ち込めます。選択しなくてもランを始められます。";
  originalCardArea.appendChild(originalCardDesc);

  const originalCardButtons = document.createElement("div");
  originalCardButtons.id = "original-card-buttons";

  if (savedOriginalCards.length === 0) {
    const noCards = document.createElement("p");
    noCards.textContent =
      "保存済みのオリジナルカードがありません。工房でカードを作成してください。";
    originalCardButtons.appendChild(noCards);
  } else {
    // 「選択しない」ボタン
    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "original-card-btn original-card-btn--selected";
    noneBtn.textContent = "持ち込まない（9枚デッキ）";
    noneBtn.dataset["cardId"] = "";

    const allOriginalBtns: HTMLButtonElement[] = [noneBtn];

    const noneHandler = () => {
      selectedOriginalCardId = null;
      selectedOriginalCardName = null;
      for (const b of allOriginalBtns) {
        b.classList.remove("original-card-btn--selected");
      }
      noneBtn.classList.add("original-card-btn--selected");
      updateSummary(selectedDeckName, null);
    };
    noneBtn.addEventListener("click", noneHandler);
    handlers.push({ btn: noneBtn, handler: noneHandler });
    originalCardButtons.appendChild(noneBtn);

    // 各オリジナルカードのボタン
    for (const card of savedOriginalCards) {
      const cardBtn = document.createElement("button");
      cardBtn.type = "button";
      cardBtn.className = "original-card-btn";
      cardBtn.dataset["cardId"] = card.id;

      const costText = describeCardCost(card.cost);
      const compensationText =
        card.compensation !== null ? `（代償: ${card.compensation.kind}）` : "";
      cardBtn.textContent = `${card.name} コスト:${costText} ${compensationText}`;

      allOriginalBtns.push(cardBtn);

      const cardHandler = () => {
        selectedOriginalCardId = card.id;
        selectedOriginalCardName = card.name;
        for (const b of allOriginalBtns) {
          b.classList.remove("original-card-btn--selected");
        }
        cardBtn.classList.add("original-card-btn--selected");
        updateSummary(selectedDeckName, card.name);
      };
      cardBtn.addEventListener("click", cardHandler);
      handlers.push({ btn: cardBtn, handler: cardHandler });
      originalCardButtons.appendChild(cardBtn);
    }
  }

  originalCardArea.appendChild(originalCardButtons);
  screen.appendChild(originalCardArea);

  // 試練レベル選択エリア（試練レベル1が解放されている場合のみ表示）
  if (maxUnlockedTrialLevel >= 1) {
    const trialArea = document.createElement("section");
    trialArea.id = "run-setup-trial-area";

    const trialHeading = document.createElement("h2");
    trialHeading.textContent = "試練レベル";
    trialArea.appendChild(trialHeading);

    const trialDesc = document.createElement("p");
    trialDesc.textContent =
      "試練レベル1は全エネミーのHPが増加し、ボスも強化されます。";
    trialArea.appendChild(trialDesc);

    const trialBtns: HTMLButtonElement[] = [];

    const trialLevels: Array<{ level: 0 | 1; label: string }> = [
      { level: 0, label: "試練レベル0（通常）" },
      { level: 1, label: "試練レベル1（高難易度）" },
    ];

    for (const { level, label } of trialLevels) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "trial-level-btn" + (level === 0 ? " trial-level-btn--selected" : "");
      btn.textContent = label;

      const trialHandler = () => {
        selectedTrialLevel = level;
        for (const b of trialBtns) {
          b.classList.remove("trial-level-btn--selected");
        }
        btn.classList.add("trial-level-btn--selected");
      };
      btn.addEventListener("click", trialHandler);
      handlers.push({ btn, handler: trialHandler });
      trialBtns.push(btn);
      trialArea.appendChild(btn);
    }

    screen.appendChild(trialArea);
  }

  // 「ランを始める」ボタン（デッキ未選択時は非活性）
  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.id = "run-setup-start-btn";
  startBtn.textContent = "ランを始める";
  startBtn.disabled = true;

  const startHandler = () => {
    if (selectedDeckType === null) return;
    callbacks.onConfirmRunSetup(
      selectedDeckType,
      selectedOriginalCardId,
      selectedTrialLevel,
    );
  };
  startBtn.addEventListener("click", startHandler);
  handlers.push({ btn: startBtn, handler: startHandler });

  const buttonArea = document.createElement("div");
  buttonArea.id = "run-setup-button-area";

  buttonArea.appendChild(startBtn);

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "run-setup-back-btn";
  backBtn.textContent = "タイトルへ戻る";
  const backHandler = () => callbacks.onReturnToTitle();
  backBtn.addEventListener("click", backHandler);
  handlers.push({ btn: backBtn, handler: backHandler });

  buttonArea.appendChild(backBtn);
  screen.appendChild(buttonArea);

  container.appendChild(screen);
  // クリーンアップ関数
  return () => {
    for (const { btn, handler } of handlers) {
      btn.removeEventListener("click", handler);
    }
    screen.remove();
  };
}

// ---- ユーティリティ ----

import type { CardCost } from "../core/types/card";

function describeCardCost(cost: CardCost): string {
  switch (cost.kind) {
    case "fixed":
      return String(cost.energy);
    case "zero":
      return "0";
    case "variable":
      return "X";
    default: {
      const _never: never = cost;
      return _never;
    }
  }
}
