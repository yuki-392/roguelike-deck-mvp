// イベント画面 UI 制御
// 表示とクリック委譲のみを担当し、効果処理は core に任せる
import type { GameState } from "../core/types";
import type { RendererCallbacks } from "../renderer/types/renderer";

export function renderEventScreen(
  container: HTMLElement,
  callbacks: RendererCallbacks,
  state: GameState,
): () => void {
  const screen = document.createElement("div");
  screen.id = "event-screen-dynamic";

  const handlers: Array<{ btn: HTMLButtonElement; handler: () => void }> = [];

  if (state.activeEvent === null) {
    const heading = document.createElement("h1");
    heading.textContent = "イベント結果";
    screen.appendChild(heading);

    const result = document.createElement("p");
    result.textContent = state.log[state.log.length - 1] ?? "出来事は終わった。";
    screen.appendChild(result);

    const leaveButton = document.createElement("button");
    leaveButton.type = "button";
    leaveButton.textContent = "次へ進む";
    const leaveHandler = () => {
      callbacks.onLeaveEvent();
    };
    leaveButton.addEventListener("click", leaveHandler);
    handlers.push({ btn: leaveButton, handler: leaveHandler });
    screen.appendChild(leaveButton);

    container.appendChild(screen);
    return () => {
      for (const { btn, handler } of handlers) {
        btn.removeEventListener("click", handler);
      }
      screen.remove();
    };
  }

  const eventDef = state.activeEvent;

  const heading = document.createElement("h1");
  heading.textContent = eventDef.title;
  screen.appendChild(heading);

  const description = document.createElement("p");
  description.textContent = eventDef.description;
  screen.appendChild(description);

  if (eventDef.choices.length === 0) {
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = "確認して進む";
    const confirmHandler = () => {
      callbacks.onLeaveEvent();
    };
    confirmButton.addEventListener("click", confirmHandler);
    handlers.push({ btn: confirmButton, handler: confirmHandler });
    screen.appendChild(confirmButton);
  } else {
    const choiceArea = document.createElement("div");
    choiceArea.id = "event-choice-area";

    eventDef.choices.forEach((choice, index) => {
      const choiceButton = document.createElement("button");
      choiceButton.type = "button";
      choiceButton.textContent = choice.label;
      const choiceHandler = () => {
        callbacks.onSelectEventChoice(index);
      };
      choiceButton.addEventListener("click", choiceHandler);
      handlers.push({ btn: choiceButton, handler: choiceHandler });
      choiceArea.appendChild(choiceButton);
    });

    screen.appendChild(choiceArea);
  }

  container.appendChild(screen);

  return () => {
    for (const { btn, handler } of handlers) {
      btn.removeEventListener("click", handler);
    }
    screen.remove();
  };
}
