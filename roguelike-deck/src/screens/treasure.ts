// 宝箱画面 UI 制御
// 表示のみを担当し、受け取り処理は callbacks に委譲する
import type { GameState } from "../core/types";
import type { RendererCallbacks } from "../renderer/types/renderer";

export function renderTreasureScreen(
  container: HTMLElement,
  callbacks: RendererCallbacks,
  state: GameState,
): () => void {
  const screen = document.createElement("div");
  screen.id = "treasure-screen-dynamic";

  const heading = document.createElement("h1");
  heading.textContent = "宝箱";
  screen.appendChild(heading);

  const message = document.createElement("p");
  message.textContent =
    state.rewardRelic !== null
      ? `${state.rewardRelic.name}: ${state.rewardRelic.description}`
      : "入手できる遺物はありません。";
  screen.appendChild(message);

  const claimButton = document.createElement("button");
  claimButton.type = "button";
  claimButton.textContent = "受け取る";
  const claimHandler = () => {
    callbacks.onClaimRewardRelic();
  };
  claimButton.addEventListener("click", claimHandler);
  screen.appendChild(claimButton);

  container.appendChild(screen);

  return () => {
    claimButton.removeEventListener("click", claimHandler);
    screen.remove();
  };
}
