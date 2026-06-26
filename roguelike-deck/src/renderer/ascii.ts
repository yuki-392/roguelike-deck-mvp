// AsciiRenderer: テキストベースの描画実装
// DOM を操作するが、ゲームロジック（core/）には一切依存しない
// GameState を読み取り専用で参照して画面を更新する
import type { Renderer, RendererCallbacks } from "./types/renderer";
import type { GameState, Card, AchievementId } from "../core/types";
import type { OriginalCard } from "../core/types/originalCard";
import type { PersistentData } from "../save/saveData";
import { renderTitleScreen } from "../screens/title";
import { renderAchievementScreen } from "../screens/achievement";
import { renderRunSetupScreen } from "../screens/runSetup";
import { renderWorkshopScreen } from "../screens/workshop";
import { renderMapScreen } from "../screens/map";
import { renderRestScreen } from "../screens/rest";
import { renderResultScreen } from "../screens/result";
import { renderForgeScreen } from "../screens/forge";
import { renderShopScreen } from "../screens/shop";
import { defaultRng } from "../core/rng";

// DOM 要素の ID 定数
const APP_ID = "app";

export class AsciiRenderer implements Renderer {
  private callbacks: RendererCallbacks | null = null;
  // クリックハンドラーのクリーンアップ用に参照を保持
  private endTurnHandler: (() => void) | null = null;
  private skipRewardHandler: (() => void) | null = null;
  private deckViewHandler: (() => void) | null = null;
  // タイトル画面のクリーンアップ関数
  private titleCleanup: (() => void) | null = null;
  // 実績一覧画面のクリーンアップ関数
  private achievementCleanup: (() => void) | null = null;
  // 工房画面のクリーンアップ関数
  private workshopCleanup: (() => void) | null = null;
  // ラン準備画面のクリーンアップ関数
  private runSetupCleanup: (() => void) | null = null;
  // マップ画面のクリーンアップ関数
  private mapCleanup: (() => void) | null = null;
  // 休憩所画面のクリーンアップ関数
  private restCleanup: (() => void) | null = null;
  // 鍛冶所画面のクリーンアップ関数
  private forgeCleanup: (() => void) | null = null;
  private shopCleanup: (() => void) | null = null;
  // リザルト画面のクリーンアップ関数
  private resultCleanup: (() => void) | null = null;
  // リザルト画面に表示する新規取得実績ID
  private newAchievementsForResult: readonly AchievementId[] = [];

  /**
   * DOM を構築し、コールバックを登録する
   * 起動時はゲーム画面を非表示にするだけで、工房画面は showWorkshop() で表示する
   */
  init(callbacks: RendererCallbacks): void {
    this.callbacks = callbacks;

    const app = document.getElementById(APP_ID);
    if (app === null) {
      throw new Error(`Element #${APP_ID} not found`);
    }

    // ゲーム画面の HTML 構造を構築
    app.innerHTML = `
      <div id="game">
        <div id="battle-screen">
          <section id="enemy-area">
            <h2 id="enemy-name"></h2>
            <p id="enemy-hp"></p>
            <p id="enemy-block"></p>
            <p id="enemy-intent"></p>
          </section>

          <section id="player-area">
            <p id="player-hp"></p>
            <p id="player-block"></p>
            <p id="player-energy"></p>
            <p id="player-deck-count"></p>
          </section>

          <section id="deck-view-area">
            <button id="deck-view-btn" type="button">山札を見る</button>
            <div id="deck-view-content" style="display:none;">
              <div id="deck-view-deck"></div>
              <div id="deck-view-discard"></div>
            </div>
          </section>

          <section id="potion-area">
            <div id="potion-list"></div>
          </section>

          <section id="hand-area">
            <h3>手札</h3>
            <div id="hand-cards"></div>
          </section>

          <section id="action-area">
            <button id="end-turn-btn" type="button">ターン終了</button>
          </section>

          <section id="log-area">
            <h3>バトルログ</h3>
            <ul id="log-list"></ul>
          </section>
        </div>

        <div id="reward-screen" style="display:none;">
          <p id="reward-defeated-message"></p>
          <p id="reward-gold-message"></p>
          <h2>報酬カードを選んでください</h2>
          <div id="reward-cards"></div>
          <div id="reward-potion"></div>
          <div id="reward-orb"></div>
          <button id="skip-reward-btn" type="button">スキップ</button>
        </div>

        <div id="dynamic-screens"></div>
      </div>
    `;

    // ターン終了ボタンにコールバックを登録
    const endTurnBtn = document.getElementById("end-turn-btn");
    if (endTurnBtn !== null) {
      this.endTurnHandler = () => {
        this.callbacks?.onEndTurn();
      };
      endTurnBtn.addEventListener("click", this.endTurnHandler);
    }

    // スキップボタンにコールバックを登録
    const skipRewardBtn = document.getElementById("skip-reward-btn");
    if (skipRewardBtn !== null) {
      this.skipRewardHandler = () => {
        this.callbacks?.onSkipReward();
      };
      skipRewardBtn.addEventListener("click", this.skipRewardHandler);
    }

    // 山札を見るボタンにトグル処理を登録
    const deckViewBtn = document.getElementById("deck-view-btn");
    const deckViewContent = document.getElementById("deck-view-content");
    if (deckViewBtn !== null && deckViewContent !== null) {
      this.deckViewHandler = () => {
        const isOpen = deckViewContent.style.display !== "none";
        deckViewContent.style.display = isOpen ? "none" : "";
        deckViewBtn.textContent = isOpen ? "山札を見る" : "山札を閉じる";
      };
      deckViewBtn.addEventListener("click", this.deckViewHandler);
    }

    // ゲーム画面を非表示にする（工房画面を showWorkshop() で後から表示する）
    const gameEl = document.getElementById("game");
    if (gameEl !== null) {
      gameEl.style.display = "none";
    }
  }

  /**
   * タイトル画面を表示する
   */
  showTitle(persistentData: PersistentData): void {
    this.cleanupTitleScreens();
    this.cleanupDynamicScreens();
    if (this.workshopCleanup !== null) {
      this.workshopCleanup();
      this.workshopCleanup = null;
    }
    if (this.runSetupCleanup !== null) {
      this.runSetupCleanup();
      this.runSetupCleanup = null;
    }

    const gameEl = document.getElementById("game");
    if (gameEl !== null) gameEl.style.display = "none";

    const app = document.getElementById(APP_ID);
    if (app === null || this.callbacks === null) return;

    // 型参照を保持してクロージャで使う
    const callbacks = this.callbacks;
    this.titleCleanup = renderTitleScreen(app, callbacks);

    // persistentData の参照は main.ts 側で onGoTo* コールバックに渡す
    void persistentData;
  }

  /**
   * 実績一覧画面を表示する
   */
  showAchievements(
    persistentData: PersistentData,
    achievements: import("../core/types/achievement").Achievement[],
    onClose: () => void,
  ): void {
    if (this.achievementCleanup !== null) {
      this.achievementCleanup();
      this.achievementCleanup = null;
    }
    const app = document.getElementById(APP_ID);
    if (app === null) return;

    this.achievementCleanup = renderAchievementScreen(
      app,
      achievements,
      persistentData.unlockedAchievementIds,
      onClose,
    );
  }

  /** タイトル・実績画面をクリーンアップする */
  private cleanupTitleScreens(): void {
    if (this.titleCleanup !== null) {
      this.titleCleanup();
      this.titleCleanup = null;
    }
    if (this.achievementCleanup !== null) {
      this.achievementCleanup();
      this.achievementCleanup = null;
    }
  }

  /**
   * 工房画面を表示する
   * 既存の工房・ラン準備画面があればクリーンアップしてから再描画する
   */
  showWorkshop(
    persistentData: PersistentData,
    materializableCards: readonly Card[],
  ): void {
    // タイトル・工房・ラン準備・動的画面をクリーンアップ
    this.cleanupTitleScreens();
    this.cleanupDynamicScreens();
    if (this.workshopCleanup !== null) {
      this.workshopCleanup();
      this.workshopCleanup = null;
    }
    if (this.runSetupCleanup !== null) {
      this.runSetupCleanup();
      this.runSetupCleanup = null;
    }

    // ゲーム画面を非表示
    const gameEl = document.getElementById("game");
    if (gameEl !== null) {
      gameEl.style.display = "none";
    }

    const app = document.getElementById(APP_ID);
    if (app === null || this.callbacks === null) return;

    this.workshopCleanup = renderWorkshopScreen(
      app,
      this.callbacks,
      persistentData,
      materializableCards,
    );
  }

  /**
   * ラン準備画面を表示する
   * 工房画面をクリーンアップしてからラン準備画面を表示する
   */
  showRunSetup(
    savedOriginalCards: readonly OriginalCard[],
    maxUnlockedTrialLevel: 0 | 1 = 0,
  ): void {
    // タイトル・工房画面をクリーンアップ
    this.cleanupTitleScreens();
    if (this.workshopCleanup !== null) {
      this.workshopCleanup();
      this.workshopCleanup = null;
    }

    const app = document.getElementById(APP_ID);
    if (app === null || this.callbacks === null) return;

    this.runSetupCleanup = renderRunSetupScreen(
      app,
      this.callbacks,
      savedOriginalCards,
      maxUnlockedTrialLevel,
    );
  }

  /** リザルト画面に表示する新規取得実績を設定する */
  setNewAchievementsForResult(ids: readonly AchievementId[]): void {
    this.newAchievementsForResult = ids;
  }

  /**
   * GameState を読み取り、フェーズに応じた画面を表示する
   * 初回呼び出し時はラン準備画面を閉じてゲーム画面を表示する
   */
  render(state: GameState): void {
    // ラン準備画面が残っている場合は閉じてゲーム画面を表示する
    if (this.runSetupCleanup !== null) {
      this.runSetupCleanup();
      this.runSetupCleanup = null;
      const gameEl = document.getElementById("game");
      if (gameEl !== null) {
        gameEl.style.display = "";
      }
    }

    this.updateScreenVisibility(state);

    switch (state.phase) {
      case "battle":
      case "gameover":
      case "victory":
        // 動的画面をクリーンアップ（マップ・休憩・リザルト）
        this.cleanupDynamicScreens();
        // 戦闘画面の各要素を更新
        this.renderEnemy(state);
        this.renderPlayer(state);
        this.renderHand(state);
        this.renderDeckView(state);
        this.renderLog(state);
        this.renderActionArea(state);
        break;

      case "reward":
        // 動的画面をクリーンアップ
        this.cleanupDynamicScreens();
        // 報酬選択画面を更新
        this.renderReward(state);
        break;

      case "map":
        // マップ画面を表示する（毎回再構築）
        this.showMap(state);
        break;

      case "rest":
        // 休憩所画面を表示する（毎回再構築）
        this.showRest(state);
        break;

      case "forge":
        this.showForge(state);
        break;

      case "shop":
        this.showShop(state);
        break;

      case "result":
        // リザルト画面を表示する（毎回再構築）
        this.showResult(state);
        break;

      default: {
        // exhaustive check
        const _never: never = state.phase;
        return _never;
      }
    }
  }

  /**
   * イベントリスナーを解除し、DOM をクリアする
   */
  destroy(): void {
    // タイトル・実績画面のクリーンアップ
    this.cleanupTitleScreens();

    // 工房画面のクリーンアップ
    if (this.workshopCleanup !== null) {
      this.workshopCleanup();
      this.workshopCleanup = null;
    }

    // ラン準備画面のクリーンアップ
    if (this.runSetupCleanup !== null) {
      this.runSetupCleanup();
      this.runSetupCleanup = null;
    }

    // 動的画面のクリーンアップ
    this.cleanupDynamicScreens();

    // ターン終了ボタンのハンドラーを解除
    const endTurnBtn = document.getElementById("end-turn-btn");
    if (endTurnBtn !== null && this.endTurnHandler !== null) {
      endTurnBtn.removeEventListener("click", this.endTurnHandler);
    }
    this.endTurnHandler = null;

    // スキップボタンのハンドラーを解除
    const skipRewardBtn = document.getElementById("skip-reward-btn");
    if (skipRewardBtn !== null && this.skipRewardHandler !== null) {
      skipRewardBtn.removeEventListener("click", this.skipRewardHandler);
    }
    this.skipRewardHandler = null;

    // 山札を見るボタンのハンドラーを解除
    const deckViewBtn = document.getElementById("deck-view-btn");
    if (deckViewBtn !== null && this.deckViewHandler !== null) {
      deckViewBtn.removeEventListener("click", this.deckViewHandler);
    }
    this.deckViewHandler = null;

    this.callbacks = null;

    // 手札エリアをクリア（各カードボタンは innerHTML クリアで自動解除）
    const handCards = document.getElementById("hand-cards");
    if (handCards !== null) {
      handCards.innerHTML = "";
    }

    // 報酬カードエリアをクリア
    const rewardCards = document.getElementById("reward-cards");
    if (rewardCards !== null) {
      rewardCards.innerHTML = "";
    }
  }

  // ---- プライベートメソッド ----

  /**
   * マップ・休憩・リザルトの動的画面をクリーンアップする
   */
  private cleanupDynamicScreens(): void {
    if (this.mapCleanup !== null) {
      this.mapCleanup();
      this.mapCleanup = null;
    }
    if (this.restCleanup !== null) {
      this.restCleanup();
      this.restCleanup = null;
    }
    if (this.forgeCleanup !== null) {
      this.forgeCleanup();
      this.forgeCleanup = null;
    }
    if (this.shopCleanup !== null) {
      this.shopCleanup();
      this.shopCleanup = null;
    }
    if (this.resultCleanup !== null) {
      this.resultCleanup();
      this.resultCleanup = null;
    }
  }

  /**
   * マップ画面を表示する（screens/map.ts に委譲）
   */
  private showMap(state: GameState): void {
    // 既存のマップ・休憩・リザルト画面をクリーンアップしてから再描画
    this.cleanupDynamicScreens();

    const dynamicScreens = document.getElementById("dynamic-screens");
    if (dynamicScreens === null || this.callbacks === null) return;

    this.mapCleanup = renderMapScreen(dynamicScreens, this.callbacks, state);
  }

  /**
   * 休憩所画面を表示する（screens/rest.ts に委譲）
   */
  private showRest(state: GameState): void {
    // 既存のマップ・休憩・リザルト画面をクリーンアップしてから再描画
    this.cleanupDynamicScreens();

    const dynamicScreens = document.getElementById("dynamic-screens");
    if (dynamicScreens === null || this.callbacks === null) return;

    this.restCleanup = renderRestScreen(dynamicScreens, this.callbacks, state);
  }

  /**
   * 鍛冶所画面を表示する（screens/forge.ts に委譲）
   */
  private showForge(state: GameState): void {
    this.cleanupDynamicScreens();

    const dynamicScreens = document.getElementById("dynamic-screens");
    if (dynamicScreens === null || this.callbacks === null) return;

    this.forgeCleanup = renderForgeScreen(
      dynamicScreens,
      this.callbacks,
      state,
      defaultRng,
    );
  }

  private showShop(state: GameState): void {
    this.cleanupDynamicScreens();

    const dynamicScreens = document.getElementById("dynamic-screens");
    if (dynamicScreens === null || this.callbacks === null) return;

    this.shopCleanup = renderShopScreen(dynamicScreens, this.callbacks, state);
  }

  /**
   * リザルト画面を表示する（screens/result.ts に委譲）
   */
  private showResult(state: GameState): void {
    // 既存のマップ・休憩・リザルト画面をクリーンアップしてから再描画
    this.cleanupDynamicScreens();

    const dynamicScreens = document.getElementById("dynamic-screens");
    if (dynamicScreens === null || this.callbacks === null) return;

    this.resultCleanup = renderResultScreen(
      dynamicScreens,
      this.callbacks,
      state,
      this.newAchievementsForResult,
    );
    // 表示後はリセット
    this.newAchievementsForResult = [];
  }

  /**
   * フェーズに応じて各スクリーンの表示・非表示を切り替える
   */
  private updateScreenVisibility(state: GameState): void {
    const battleScreen = document.getElementById("battle-screen");
    const rewardScreen = document.getElementById("reward-screen");
    const dynamicScreens = document.getElementById("dynamic-screens");

    const isBattlePhase =
      state.phase === "battle" ||
      state.phase === "gameover" ||
      state.phase === "victory";

    const isDynamicPhase =
      state.phase === "map" ||
      state.phase === "rest" ||
      state.phase === "forge" ||
      state.phase === "shop" ||
      state.phase === "result";

    if (battleScreen !== null)
      battleScreen.style.display = isBattlePhase ? "" : "none";
    if (rewardScreen !== null)
      rewardScreen.style.display = state.phase === "reward" ? "" : "none";
    if (dynamicScreens !== null)
      dynamicScreens.style.display = isDynamicPhase ? "" : "none";
  }

  private renderEnemy(state: GameState): void {
    const enemy = state.enemy;
    const isBoss = enemy.tier === "boss";
    const nameEl = document.getElementById("enemy-name");
    const hpEl = document.getElementById("enemy-hp");
    const blockEl = document.getElementById("enemy-block");
    const intentEl = document.getElementById("enemy-intent");

    // ボスのときは名称に【BOSS】プレフィックスを追加し、CSSクラスで強調する
    if (nameEl !== null) {
      nameEl.textContent = isBoss ? `【BOSS】${enemy.name}` : enemy.name;
      nameEl.classList.toggle("enemy-name--boss", isBoss);
    }
    // ボスの HP 表示を専用スタイルで強調する
    if (hpEl !== null) {
      hpEl.textContent = `HP: ${enemy.currentHp} / ${enemy.maxHp}`;
      hpEl.classList.toggle("enemy-hp--boss", isBoss);
    }
    if (blockEl !== null)
      blockEl.textContent = enemy.block > 0 ? `ブロック: ${enemy.block}` : "";
    if (intentEl !== null)
      intentEl.textContent = `行動予告: ${describeAction(enemy.nextAction)}`;
  }

  private renderPlayer(state: GameState): void {
    const player = state.player;
    const hpEl = document.getElementById("player-hp");
    const blockEl = document.getElementById("player-block");
    const energyEl = document.getElementById("player-energy");
    const deckCountEl = document.getElementById("player-deck-count");

    if (hpEl !== null)
      hpEl.textContent = `HP: ${player.currentHp} / ${player.maxHp}`;
    if (blockEl !== null)
      blockEl.textContent = player.block > 0 ? `ブロック: ${player.block}` : "";
    if (energyEl !== null)
      energyEl.textContent = `エナジー: ${player.energy} / ${player.maxEnergy}`;
    if (deckCountEl !== null)
      deckCountEl.textContent = `山札: ${player.deck.length}枚　捨て札: ${player.discard.length}枚`;

    // 所持ポーション一覧を描画（戦闘中のみ使用ボタンを有効化）
    const potionList = document.getElementById("potion-list");
    if (potionList !== null) {
      potionList.innerHTML = "";
      if (state.run.potions.length === 0) {
        potionList.textContent = "ポーション: なし";
      } else {
        state.run.potions.forEach((potion, index) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = `🧪 ${potion.name} — ${potion.description}`;
          // battleOnly のポーションは戦闘外では無効化
          const canUse =
            state.phase === "battle" &&
            (!potion.battleOnly || state.phase === "battle");
          btn.disabled = !canUse;
          btn.addEventListener("click", () => {
            this.callbacks?.onUsePotion(index);
          });
          potionList.appendChild(btn);
        });
      }
    }
  }

  private renderDeckView(state: GameState): void {
    const player = state.player;
    const deckEl = document.getElementById("deck-view-deck");
    const discardEl = document.getElementById("deck-view-discard");

    if (deckEl !== null) {
      const deckItems = player.deck.map((c) => `${c.name}（${c.description}）`);
      deckEl.innerHTML = `<strong>山札（${player.deck.length}枚）</strong><ul>${deckItems.map((s) => `<li>${s}</li>`).join("")}</ul>`;
    }

    if (discardEl !== null) {
      const discardItems = player.discard.map(
        (c) => `${c.name}（${c.description}）`,
      );
      discardEl.innerHTML = `<strong>捨て札（${player.discard.length}枚）</strong><ul>${discardItems.map((s) => `<li>${s}</li>`).join("")}</ul>`;
    }
  }

  private renderHand(state: GameState): void {
    const handCards = document.getElementById("hand-cards");
    if (handCards === null) return;

    // 手札エリアを丸ごと再構築（旧ボタンのイベントリスナーも自動解除）
    handCards.innerHTML = "";

    // 捨て選択プロンプトの表示・非表示を切り替える
    const existingPrompt = document.getElementById("discard-prompt");
    if (existingPrompt !== null) existingPrompt.remove();

    if (state.pendingDiscard !== null) {
      // 捨てるカードを選ぶよう促すプロンプトを手札エリア上部に追加する
      const prompt = document.createElement("p");
      prompt.id = "discard-prompt";
      prompt.style.color = "#e08040";
      prompt.style.fontWeight = "bold";
      prompt.textContent = `あと ${state.pendingDiscard.count} 枚捨てるカードを選んでください`;
      handCards.insertAdjacentElement("beforebegin", prompt);
    }

    const isDisabled = state.phase === "gameover" || state.phase === "victory";

    for (const card of state.player.hand) {
      const btn = this.createCardButton(
        card,
        isDisabled,
        state.pendingDiscard !== null,
      );
      handCards.appendChild(btn);
    }
  }

  private createCardButton(
    card: Card,
    disabled: boolean,
    isDiscardMode: boolean,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = `${card.name} (${describeCardCost(card)}) — ${card.description}`;
    btn.disabled = disabled;
    btn.dataset["cardId"] = card.id;

    btn.addEventListener("click", () => {
      // pendingDiscard が非 null のとき（捨て選択モード）は onSelectDiscardCard を呼ぶ
      if (isDiscardMode) {
        this.callbacks?.onSelectDiscardCard(card.id);
      } else {
        this.callbacks?.onPlayCard(card.id);
      }
    });

    return btn;
  }

  private renderLog(state: GameState): void {
    const logList = document.getElementById("log-list");
    if (logList === null) return;

    logList.innerHTML = "";
    // 最新のログが下になるよう順に追加
    for (const entry of state.log) {
      const li = document.createElement("li");
      li.textContent = entry;
      logList.appendChild(li);
    }
  }

  private renderActionArea(state: GameState): void {
    const endTurnBtn = document.getElementById(
      "end-turn-btn",
    ) as HTMLButtonElement | null;
    if (endTurnBtn === null) return;

    // pendingDiscard が非 null のとき（捨て選択待ち）もターン終了を無効化する
    const isDisabled =
      state.phase === "gameover" ||
      state.phase === "victory" ||
      state.pendingDiscard !== null;
    endTurnBtn.disabled = isDisabled;

    // 勝敗メッセージの表示
    const existingMsg = document.getElementById("phase-message");
    if (existingMsg !== null) existingMsg.remove();

    if (state.phase === "victory" || state.phase === "gameover") {
      const msg = document.createElement("p");
      msg.id = "phase-message";
      msg.style.fontWeight = "bold";
      msg.style.fontSize = "2rem";

      if (state.phase === "victory") {
        // クリア画面：金色で祝福メッセージ
        msg.textContent = "★ GAME CLEAR ★ ボスを打ち倒した！おめでとう！";
        msg.style.color = "#f0c040";
        msg.style.textShadow = "0 0 8px #f0c040";
      } else {
        // ゲームオーバー画面：赤色で終了メッセージ
        msg.textContent = "GAME OVER... 力尽きてしまった。";
        msg.style.color = "#e04040";
        msg.style.textShadow = "0 0 8px #e04040";
      }

      endTurnBtn.insertAdjacentElement("afterend", msg);
    }
  }

  /**
   * 報酬選択画面を更新する
   */
  private renderReward(state: GameState): void {
    const defeatedMsg = document.getElementById("reward-defeated-message");
    const goldMsg = document.getElementById("reward-gold-message");
    const rewardCards = document.getElementById("reward-cards");
    if (rewardCards === null) return;

    if (defeatedMsg !== null) {
      defeatedMsg.textContent =
        state.lastDefeatedEnemyName !== ""
          ? `${state.lastDefeatedEnemyName} を倒した！`
          : "";
    }
    if (goldMsg !== null) {
      goldMsg.textContent =
        state.rewardGold > 0 ? `${state.rewardGold} ゴールドを獲得！` : "";
    }

    rewardCards.innerHTML = "";

    for (const card of state.rewardCandidates) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset["cardId"] = card.id;
      btn.textContent = `${card.name} (コスト:${describeCardCost(card)}) — ${card.description}`;

      btn.addEventListener("click", () => {
        this.callbacks?.onSelectRewardCard(card.id);
      });

      rewardCards.appendChild(btn);
    }

    // ポーション報酬の表示・取得ボタン
    const rewardPotion = document.getElementById("reward-potion");
    if (rewardPotion !== null) {
      rewardPotion.innerHTML = "";
      if (state.rewardPotion !== null) {
        const potion = state.rewardPotion;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = `🧪 ポーション：${potion.name} を受け取る — ${potion.description}`;
        btn.addEventListener("click", () => {
          this.callbacks?.onClaimRewardPotion();
        });
        rewardPotion.appendChild(btn);
      }
    }

    // オーブ解放通知
    const rewardOrb = document.getElementById("reward-orb");
    if (rewardOrb !== null) {
      rewardOrb.innerHTML = "";
      if (state.rewardUnlockedOrb !== null) {
        const orb = state.rewardUnlockedOrb;
        const msg = document.createElement("p");
        msg.style.color = "#f0c040";
        msg.textContent = `【図鑑オーブ解放】${orb.name}を入手した！`;
        rewardOrb.appendChild(msg);
      }
    }
  }
}

// ---- ユーティリティ関数（AsciiRenderer 専用、core に依存しない） ----

import type { EnemyAction, CardCost } from "../core/types";

/**
 * 敵の行動を人間可読な文字列に変換する
 */
function describeAction(action: EnemyAction): string {
  switch (action.kind) {
    case "attack":
      return `攻撃 ${action.amount}`;
    case "block":
      return `ブロック ${action.amount}`;
    case "multiAttack":
      return `連撃 ${action.amount}×${action.times}`;
    case "attackAndApplyStatus":
      return `攻撃 ${action.amount}＋${action.status.kind} x${action.stacks}`;
    case "applyStatus":
      return `${action.target}に${action.status.kind} x${action.stacks}を付与`;
    case "buff":
      return `バフ: ${action.description}`;
    case "idle":
      return "待機";
    case "omen":
      return `予兆: ${action.description}`;
    case "blockAndAttack":
      return `ブロック ${action.blockAmount}＋攻撃 ${action.attackAmount}`;
    default: {
      const _never: never = action;
      return _never;
    }
  }
}

/**
 * カードコストを人間可読な文字列に変換する
 */
export function describeCardCost(card: Card): string {
  const cost: CardCost = card.cost;
  switch (cost.kind) {
    case "fixed":
      return `${cost.energy}`;
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
