// タイトル画面 UI 制御
import type { RendererCallbacks } from "../renderer/types/renderer";

type TitleCallbacks = Pick<
  RendererCallbacks,
  "onGoToWorkshop" | "onGoToRunSetup" | "onGoToAchievements" | "onGoToCodex"
>;

/**
 * タイトル画面を container に構築する
 *
 * @returns クリーンアップ関数
 */
export function renderTitleScreen(
  container: HTMLElement,
  callbacks: TitleCallbacks,
): () => void {
  const screen = document.createElement("div");
  screen.id = "title-screen";

  const heading = document.createElement("h1");
  heading.textContent = "Battle Girls Abyss";
  screen.appendChild(heading);

  const menuArea = document.createElement("nav");
  menuArea.id = "title-menu";
  menuArea.style.display = "flex";
  menuArea.style.flexDirection = "row";
  menuArea.style.justifyContent = "center";
  menuArea.style.gap = "12px";

  const menuItems: Array<{ label: string; handler: () => void }> = [
    { label: "ラン", handler: () => callbacks.onGoToRunSetup() },
    { label: "工房", handler: () => callbacks.onGoToWorkshop() },
    { label: "実績一覧", handler: () => callbacks.onGoToAchievements() },
    { label: "図鑑", handler: () => callbacks.onGoToCodex() },
  ];

  const handlers: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];

  for (const item of menuItems) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "title-menu-btn";
    btn.textContent = item.label;
    btn.addEventListener("click", item.handler);
    menuArea.appendChild(btn);
    handlers.push({ btn, handler: item.handler });
  }

  screen.appendChild(menuArea);
  container.appendChild(screen);

  return () => {
    for (const { btn, handler } of handlers) {
      btn.removeEventListener("click", handler);
    }
    screen.remove();
  };
}
