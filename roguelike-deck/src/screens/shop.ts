import type { GameState } from "../core/types";
import type { RendererCallbacks } from "../renderer/types/renderer";
import { describeCardCost } from "../renderer/ascii";

type ShopScreenCallbacks = Pick<
  RendererCallbacks,
  | "onBuyShopCard"
  | "onBuyShopRelic"
  | "onBuyShopPotion"
  | "onRemoveShopCard"
  | "onLeaveShop"
>;

type ButtonHandler = {
  readonly button: HTMLButtonElement;
  readonly handler: () => void;
};

export function renderShopScreen(
  container: HTMLElement,
  callbacks: ShopScreenCallbacks,
  state: GameState,
): () => void {
  const screen = document.createElement("div");
  screen.id = "shop-screen-dynamic";
  const handlers: ButtonHandler[] = [];

  const heading = document.createElement("h1");
  heading.textContent = "ショップ";
  screen.appendChild(heading);

  const gold = document.createElement("p");
  gold.id = "shop-gold";
  gold.textContent = `所持ゴールド: ${state.run.gold}`;
  screen.appendChild(gold);

  const appendSection = (title: string): HTMLElement => {
    const section = document.createElement("section");
    const sectionHeading = document.createElement("h2");
    sectionHeading.textContent = title;
    section.appendChild(sectionHeading);
    screen.appendChild(section);
    return section;
  };

  let hasAvailableAction = false;

  const cardSection = appendSection("カード購入");
  for (const { card, price } of state.shopItems.cards) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `shop-card-${card.id}`;
    button.textContent = `${card.name}（コスト:${describeCardCost(card)}）— ${price}G`;
    button.disabled = state.run.gold < price;
    hasAvailableAction ||= !button.disabled;
    const handler = () => callbacks.onBuyShopCard(card.id);
    button.addEventListener("click", handler);
    handlers.push({ button, handler });
    cardSection.appendChild(button);
  }

  const relicSection = appendSection("遺物購入");
  for (const { relic, price } of state.shopItems.relics) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `shop-relic-${relic.id}`;
    button.textContent = `${relic.name} — ${price}G`;
    button.disabled = state.run.gold < price;
    hasAvailableAction ||= !button.disabled;
    const handler = () => callbacks.onBuyShopRelic(relic.id);
    button.addEventListener("click", handler);
    handlers.push({ button, handler });
    relicSection.appendChild(button);
  }

  const potionSection = appendSection("ポーション購入");
  for (const [index, { potion, price }] of state.shopItems.potions.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `shop-potion-${index}`;
    button.textContent = `${potion.name} — ${price}G`;
    button.disabled = state.run.gold < price || state.run.potions.length >= 2;
    hasAvailableAction ||= !button.disabled;
    const handler = () => callbacks.onBuyShopPotion(index);
    button.addEventListener("click", handler);
    handlers.push({ button, handler });
    potionSection.appendChild(button);
  }

  const removalSection = appendSection(
    `カード削除（${state.shopItems.cardRemovalPrice}G）`,
  );
  const renderedCardIds = new Set<string>();
  for (const card of state.player.deck) {
    if ("isOriginal" in card && card.isOriginal === true) continue;
    if (renderedCardIds.has(card.id)) continue;
    renderedCardIds.add(card.id);
    const button = document.createElement("button");
    button.type = "button";
    button.id = `shop-remove-${card.id}`;
    button.textContent = `${card.name}を削除`;
    button.disabled = state.run.gold < state.shopItems.cardRemovalPrice;
    hasAvailableAction ||= !button.disabled;
    const handler = () => callbacks.onRemoveShopCard(card.id);
    button.addEventListener("click", handler);
    handlers.push({ button, handler });
    removalSection.appendChild(button);
  }

  if (!hasAvailableAction) {
    const unavailable = document.createElement("p");
    unavailable.textContent = "購入できるものがありません。";
    screen.appendChild(unavailable);
    container.appendChild(screen);
    callbacks.onLeaveShop();

    return () => {
      for (const { button, handler } of handlers) {
        button.removeEventListener("click", handler);
      }
      screen.remove();
    };
  }

  container.appendChild(screen);

  return () => {
    for (const { button, handler } of handlers) {
      button.removeEventListener("click", handler);
    }
    screen.remove();
  };
}
