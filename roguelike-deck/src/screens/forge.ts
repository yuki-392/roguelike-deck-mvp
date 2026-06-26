// 鍛冶所画面 UI 制御
// 候補抽出は core/forge.ts に委譲し、ここでは選択状態と DOM のみ扱う
import {
  getConvertibleRelics,
  getForgeableCards,
  getForgeEffectCandidates,
} from "../core/forge";
import type { ForgeEffect } from "../core/types/card";
import type { GameState } from "../core/types";
import type { RngFn } from "../core/rng";
import type { RendererCallbacks } from "../renderer/types/renderer";
import { describeCardCost } from "../renderer/ascii";

type ForgeScreenCallbacks = Pick<
  RendererCallbacks,
  "onForgeCard" | "onConvertRelics" | "onCompleteForge" | "onLeaveForge"
>;

type ButtonHandler = {
  readonly button: HTMLButtonElement;
  readonly handler: () => void;
};

const RARITY_LABELS = {
  normal: "通常",
  uncommon: "アンコモン",
  rare: "レア",
  legendary: "伝説",
} as const;

function describeForgeEffect(effect: ForgeEffect): string {
  switch (effect.kind) {
    case "poisonOnAttack":
      return `攻撃時に毒を${effect.stacks}付与`;
    case "healOnUse":
      return `使用時にHPを${effect.amount}回復`;
    case "reflectOnBlock":
      return `ブロック獲得時に${effect.amount}ダメージで反撃`;
    case "retain":
      return "ターン終了時に手札へ保持";
    case "lightweight":
      return "使用コストを軽量化";
    default: {
      const exhaustive: never = effect;
      return exhaustive;
    }
  }
}

export function renderForgeScreen(
  container: HTMLElement,
  callbacks: ForgeScreenCallbacks,
  state: GameState,
  rng: RngFn,
): () => void {
  const screen = document.createElement("div");
  screen.id = "forge-screen-dynamic";
  const handlers: ButtonHandler[] = [];

  const heading = document.createElement("h1");
  heading.textContent = "鍛冶所";
  screen.appendChild(heading);

  const description = document.createElement("p");
  description.textContent = "行う鍛冶を選んでください。";
  screen.appendChild(description);

  const cardModeButton = document.createElement("button");
  cardModeButton.type = "button";
  cardModeButton.id = "forge-card-mode-btn";
  cardModeButton.textContent = "カード鍛冶";
  screen.appendChild(cardModeButton);

  const relicModeButton = document.createElement("button");
  relicModeButton.type = "button";
  relicModeButton.id = "forge-relic-mode-btn";
  relicModeButton.textContent = "遺物変換";
  screen.appendChild(relicModeButton);

  const cardArea = document.createElement("section");
  cardArea.id = "forge-card-area";
  cardArea.style.display = "none";
  const cardHeading = document.createElement("h2");
  cardHeading.textContent = "空きスロットを持つカード";
  cardArea.appendChild(cardHeading);
  const cardList = document.createElement("div");
  cardList.id = "forge-card-list";
  cardArea.appendChild(cardList);
  const effectList = document.createElement("div");
  effectList.id = "forge-effect-list";
  cardArea.appendChild(effectList);
  const confirmCardButton = document.createElement("button");
  confirmCardButton.type = "button";
  confirmCardButton.id = "forge-confirm-card-btn";
  confirmCardButton.textContent = "この効果で鍛冶する";
  confirmCardButton.disabled = true;
  cardArea.appendChild(confirmCardButton);
  screen.appendChild(cardArea);

  const relicArea = document.createElement("section");
  relicArea.id = "forge-relic-area";
  relicArea.style.display = "none";
  const relicHeading = document.createElement("h2");
  relicHeading.textContent = "変換する遺物を2つ選んでください";
  relicArea.appendChild(relicHeading);
  const relicList = document.createElement("div");
  relicList.id = "forge-relic-list";
  relicArea.appendChild(relicList);
  const confirmRelicButton = document.createElement("button");
  confirmRelicButton.type = "button";
  confirmRelicButton.id = "forge-confirm-relic-btn";
  confirmRelicButton.textContent = "選んだ遺物を変換する";
  confirmRelicButton.disabled = true;
  relicArea.appendChild(confirmRelicButton);
  screen.appendChild(relicArea);

  const result = document.createElement("section");
  result.id = "forge-result";
  result.style.display = "none";
  screen.appendChild(result);

  let selectedCardId: string | null = null;
  let selectedEffect: ForgeEffect | null = null;
  const selectedRelicIds: string[] = [];

  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.id = "forge-leave-btn";
  leaveBtn.textContent = "戻る（何もしない）";
  const leaveHandler = () => callbacks.onLeaveForge();
  leaveBtn.addEventListener("click", leaveHandler);
  handlers.push({ button: leaveBtn, handler: leaveHandler });
  screen.appendChild(leaveBtn);

  const showResult = (message: string) => {
    leaveBtn.style.display = "none";
    cardArea.style.display = "none";
    relicArea.style.display = "none";
    cardModeButton.disabled = true;
    relicModeButton.disabled = true;
    result.textContent = message;
    result.style.display = "";

    const completeButton = document.createElement("button");
    completeButton.type = "button";
    completeButton.id = "forge-complete-btn";
    completeButton.textContent = "マップへ戻る";
    const completeHandler = () => callbacks.onCompleteForge();
    completeButton.addEventListener("click", completeHandler);
    handlers.push({ button: completeButton, handler: completeHandler });
    result.appendChild(completeButton);
  };

  const forgeableCards = getForgeableCards(state);
  if (forgeableCards.length === 0) {
    cardList.textContent = "鍛冶できるカードがありません。";
    cardModeButton.disabled = true;
  } else {
    for (const card of forgeableCards) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `forge-card-${card.id}`;
      button.textContent = `${card.name}（コスト:${describeCardCost(card)}）— ${card.description}`;
      const handler = () => {
        selectedCardId = card.id;
        selectedEffect = null;
        confirmCardButton.disabled = true;
        effectList.textContent = "";
        const candidates = getForgeEffectCandidates(card, rng);
        for (const effect of candidates) {
          const effectButton = document.createElement("button");
          effectButton.type = "button";
          effectButton.textContent = describeForgeEffect(effect);
          const effectHandler = () => {
            selectedEffect = effect;
            confirmCardButton.disabled = false;
          };
          effectButton.addEventListener("click", effectHandler);
          handlers.push({ button: effectButton, handler: effectHandler });
          effectList.appendChild(effectButton);
        }
      };
      button.addEventListener("click", handler);
      handlers.push({ button, handler });
      cardList.appendChild(button);
    }
  }

  const convertibleRelics = getConvertibleRelics(state);
  if (convertibleRelics.length < 2) {
    relicList.textContent = "変換できる遺物が2つ以上ありません。";
    relicModeButton.disabled = true;
  } else {
    for (const relic of convertibleRelics) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `forge-relic-${relic.id}`;
      const baseLabel = `${relic.name}【${RARITY_LABELS[relic.rarity]}】`;
      button.textContent = baseLabel;
      const handler = () => {
        const selectedIndex = selectedRelicIds.indexOf(relic.id);
        if (selectedIndex >= 0) {
          selectedRelicIds.splice(selectedIndex, 1);
          button.textContent = baseLabel;
        } else if (selectedRelicIds.length < 2) {
          selectedRelicIds.push(relic.id);
          button.textContent = `選択中: ${baseLabel}`;
        }
        confirmRelicButton.disabled = selectedRelicIds.length !== 2;
      };
      button.addEventListener("click", handler);
      handlers.push({ button, handler });
      relicList.appendChild(button);
    }
  }

  const cardModeHandler = () => {
    cardArea.style.display = "";
    relicArea.style.display = "none";
  };
  cardModeButton.addEventListener("click", cardModeHandler);
  handlers.push({ button: cardModeButton, handler: cardModeHandler });

  const relicModeHandler = () => {
    cardArea.style.display = "none";
    relicArea.style.display = "";
  };
  relicModeButton.addEventListener("click", relicModeHandler);
  handlers.push({ button: relicModeButton, handler: relicModeHandler });

  const confirmCardHandler = () => {
    if (selectedCardId === null || selectedEffect === null) return;
    confirmCardButton.disabled = true;
    callbacks.onForgeCard(selectedCardId, selectedEffect);
    showResult("カード鍛冶が完了しました。");
  };
  confirmCardButton.addEventListener("click", confirmCardHandler);
  handlers.push({ button: confirmCardButton, handler: confirmCardHandler });

  const confirmRelicHandler = () => {
    const relicIdA = selectedRelicIds[0];
    const relicIdB = selectedRelicIds[1];
    if (relicIdA === undefined || relicIdB === undefined) return;
    confirmRelicButton.disabled = true;
    const convertedRelic = callbacks.onConvertRelics(relicIdA, relicIdB);
    if (convertedRelic === null) {
      confirmRelicButton.disabled = false;
      return;
    }
    showResult(
      `変換結果: ${convertedRelic.name}【${RARITY_LABELS[convertedRelic.rarity]}】`,
    );
  };
  confirmRelicButton.addEventListener("click", confirmRelicHandler);
  handlers.push({ button: confirmRelicButton, handler: confirmRelicHandler });

  container.appendChild(screen);

  return () => {
    for (const { button, handler } of handlers) {
      button.removeEventListener("click", handler);
    }
    screen.remove();
  };
}
