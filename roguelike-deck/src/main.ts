// エントリーポイント: ゲームループの初期化
import "./style.css";
import { AsciiRenderer } from "./renderer/ascii";
import {
  startRun,
  playCard,
  endPlayerTurn,
  selectRewardCard,
  skipReward,
  claimRewardPotion,
  claimRewardRelic,
  usePotion,
  selectNode,
  healAtRest,
  upgradeCardInDeck,
  buyShopCard,
  buyShopRelic,
  buyShopPotion,
  removeShopCard,
  leaveShop,
  leaveForge,
  leaveRest,
  selectDiscardCard,
  selectTarget,
  resolveEventChoice,
  resolveEventForced,
  leaveEvent,
} from "./core/battle";
import { applyForge, applyRelicConversion } from "./core/forge";
import { defaultRng } from "./core/rng";
import { getUnlockedMaterializableCards } from "./core/workshop";
import {
  loadPersistentData,
  savePersistentData,
  renameOriginalCard,
  attachOrbToSavedCard,
  detachOrbFromSavedCard,
  unlockAchievement,
  MAX_SAVED_ORIGINAL_CARDS,
} from "./save/saveData";
import { getAchievementUnlocks, ALL_ACHIEVEMENTS } from "./core/progression";
import { renderCodexOverlay } from "./screens/codex";
import { buildCodexState } from "./core/codex";
import type { GameState, AchievementId } from "./core/types";
import type { StartingDeckType } from "./core/types";
import type { OriginalCard } from "./core/types/originalCard";

const renderer = new AsciiRenderer();

// ゲーム開始前は null（工房・ラン準備画面が表示されている状態）
let state: GameState | null = null;

// 起動時に永続データを読み込む
let persistentData = loadPersistentData();

// 起動時に「初心者」実績を解放する（テストプレイ用: 内部保存の確認）
{
  const unlocks = getAchievementUnlocks(
    persistentData.unlockedAchievementIds,
    "beginner",
  );
  if (unlocks.newAchievementIds.length > 0) {
    persistentData = unlockAchievement(
      persistentData,
      "beginner",
      unlocks.newCardIds,
      unlocks.newRelicIds,
    );
    savePersistentData(persistentData);
  }
}

/**
 * 最新のカード図鑑解放状態を反映して工房を開く
 */
function openWorkshop(): void {
  const unlockedCards = getUnlockedMaterializableCards(
    new Set(persistentData.discoveredCardNames),
  );
  renderer.showWorkshop(persistentData, unlockedCards);
}

/**
 * GameState を更新し、試練レベル1勝利時の実績解放を行ってから描画する
 */
function applyStateUpdate(nextState: GameState): void {
  const prevPhase = state?.phase;
  state = nextState;

  // 試練レベル1クリア時に「初心者卒業」実績を解放
  if (
    nextState.phase === "result" &&
    prevPhase !== "result" &&
    nextState.outcome === "victory" &&
    nextState.run.trialLevel === 1
  ) {
    const unlocks = getAchievementUnlocks(
      persistentData.unlockedAchievementIds,
      "beginner-graduate",
    );
    if (unlocks.newAchievementIds.length > 0) {
      persistentData = unlockAchievement(
        persistentData,
        "beginner-graduate",
        unlocks.newCardIds,
        unlocks.newRelicIds,
      );
      persistentData = {
        ...persistentData,
        maxUnlockedTrialLevel: Math.max(
          persistentData.maxUnlockedTrialLevel,
          nextState.run.trialLevel,
        ) as 0 | 1,
      };
    }
    renderer.setNewAchievementsForResult(
      unlocks.newAchievementIds as readonly AchievementId[],
    );
  }

  renderer.render(nextState);
}

renderer.init({
  // ---- タイトル画面コールバック ----

  onGoToWorkshop: () => {
    openWorkshop();
  },

  onGoToRunSetup: () => {
    renderer.showRunSetup(
      persistentData.savedOriginalCards,
      persistentData.maxUnlockedTrialLevel,
    );
  },

  onGoToAchievements: () => {
    renderer.showAchievements(persistentData, [...ALL_ACHIEVEMENTS], () => {
      renderer.showTitle(persistentData);
    });
  },

  onGoToCodex: () => {
    const viewData = {
      codexState: buildCodexState(
        persistentData.codexPoints,
        persistentData.acquiredOrbIds,
      ),
      acquiredOrbIds: persistentData.acquiredOrbIds,
      discoveredCardNames: new Set(persistentData.discoveredCardNames),
    };
    renderCodexOverlay(document.body, viewData, () => {
      renderer.showTitle(persistentData);
    });
  },

  onReturnToTitle: () => {
    if (state !== null) {
      // ラン終了時: オーブ入手・図鑑ポイントを永続化する
      const codexPoints: Record<string, number> = {};
      for (const [enemyId, entry] of state.run.codexState) {
        codexPoints[enemyId] = entry.points;
      }
      persistentData = {
        ...persistentData,
        acquiredOrbIds: state.run.acquiredOrbIds,
        codexPoints,
        discoveredCardNames: Array.from(state.run.discoveredCardNames),
      };
      savePersistentData(persistentData);
      state = null;
    }
    renderer.showTitle(persistentData);
  },

  // ---- 工房画面コールバック ----

  // オリジナルカードを保存する（最大5枚）
  onSaveOriginalCard: (card: OriginalCard) => {
    if (persistentData.savedOriginalCards.length >= MAX_SAVED_ORIGINAL_CARDS) {
      return;
    }
    persistentData = {
      ...persistentData,
      savedOriginalCards: [...persistentData.savedOriginalCards, card],
    };
    savePersistentData(persistentData);
    // 工房画面を最新データで再描画する
    openWorkshop();
  },

  // 保存済みオリジナルカードをリネームする
  onRenameOriginalCard: (id: string, newName: string) => {
    persistentData = renameOriginalCard(persistentData, id, newName);
    savePersistentData(persistentData);
    // 工房画面を最新データで再描画する
    openWorkshop();
  },

  // 保存済みオリジナルカードを削除する
  onDeleteOriginalCard: (cardId: string) => {
    persistentData = {
      ...persistentData,
      savedOriginalCards: persistentData.savedOriginalCards.filter(
        (c) => c.id !== cardId,
      ),
    };
    savePersistentData(persistentData);
    // 工房画面を最新データで再描画する
    openWorkshop();
  },

  // オリジナルカードにオーブを装着する
  onAttachOrb: (cardId: string, orbId: string) => {
    if (!persistentData.acquiredOrbIds.includes(orbId)) return;
    persistentData = attachOrbToSavedCard(persistentData, cardId, orbId);
    savePersistentData(persistentData);
    openWorkshop();
  },

  // オリジナルカードからオーブを取り外す
  onDetachOrb: (cardId: string) => {
    persistentData = detachOrbFromSavedCard(persistentData, cardId);
    savePersistentData(persistentData);
    openWorkshop();
  },

  // ---- ラン準備画面コールバック ----

  // ラン準備確定: デッキ種別・持ち込みカードID・試練レベルを受け取ってランを開始する
  onConfirmRunSetup: (
    deckType: StartingDeckType,
    originalCardId: string | null,
    trialLevel: 0 | 1,
  ) => {
    // 持ち込むカードの実体を PersistentData から取得する
    const originalCard: OriginalCard | null =
      originalCardId !== null
        ? (persistentData.savedOriginalCards.find(
            (c) => c.id === originalCardId,
          ) ?? null)
        : null;

    applyStateUpdate(
      startRun(
        { startingDeckType: deckType, originalCardId, trialLevel },
        originalCard,
        defaultRng,
        persistentData,
      ),
    );
  },

  // ---- バトル画面コールバック ----

  onPlayCard: (cardId: string) => {
    if (state === null) return;
    applyStateUpdate(playCard(state, cardId, defaultRng));
  },

  onSelectTarget: (instanceId: string) => {
    if (state === null) return;
    applyStateUpdate(selectTarget(state, instanceId, defaultRng));
  },

  onEndTurn: () => {
    if (state === null) return;
    applyStateUpdate(endPlayerTurn(state, defaultRng));
  },

  onSelectRewardCard: (cardId: string) => {
    if (state === null) return;
    applyStateUpdate(selectRewardCard(state, cardId));
  },

  onSkipReward: () => {
    if (state === null) return;
    applyStateUpdate(skipReward(state));
  },

  onUsePotion: (potionIndex: number) => {
    if (state === null) return;
    applyStateUpdate(usePotion(state, potionIndex, defaultRng));
  },

  onClaimRewardPotion: () => {
    if (state === null) return;
    applyStateUpdate(claimRewardPotion(state));
  },

  onClaimRewardRelic: () => {
    if (state === null) return;
    applyStateUpdate(claimRewardRelic(state));
  },

  // ---- マップ画面コールバック ----

  // ノードを選択する: 種別に応じてバトル開始 or 休憩所遷移
  onSelectNode: (nodeId: string) => {
    if (state === null) return;
    applyStateUpdate(selectNode(state, nodeId, defaultRng));
  },

  // ---- 休憩所コールバック ----

  // 休憩所で「回復」か「強化」を選択する
  // "heal": 即座に HP を回復してマップへ戻る
  // "upgrade": カード選択画面を表示（画面側で対応済み。state は変化しない）
  onSelectRest: (choice: "heal" | "upgrade") => {
    if (state === null) return;
    if (choice === "heal") {
      applyStateUpdate(healAtRest(state));
    }
    // "upgrade" の場合は rest 画面内で UI が切り替わるだけなので state は変化しない
  },

  // 休憩所でカードを強化する
  onSelectUpgradeCard: (cardId: string) => {
    if (state === null) return;
    applyStateUpdate(upgradeCardInDeck(state, cardId));
  },

  onLeaveRest: () => {
    if (state === null) return;
    applyStateUpdate(leaveRest(state));
  },

  // ---- 鍛冶所コールバック ----

  onForgeCard: (cardId, effect) => {
    if (state === null) return;
    applyStateUpdate(applyForge(state, cardId, effect));
  },

  onConvertRelics: (relicIdA, relicIdB) => {
    if (state === null) return null;
    const nextState = applyRelicConversion(
      state,
      relicIdA,
      relicIdB,
      defaultRng,
    );
    if (nextState === state) return null;
    applyStateUpdate(nextState);
    return state?.relics[state.relics.length - 1] ?? null;
  },

  onCompleteForge: () => {
    if (state === null) return;
    renderer.render(state);
  },

  onLeaveForge: () => {
    if (state === null) return;
    applyStateUpdate(leaveForge(state));
  },

  // ---- ショップコールバック ----

  onBuyShopCard: (cardId) => {
    if (state === null) return;
    applyStateUpdate(buyShopCard(state, cardId));
  },

  onBuyShopRelic: (relicId) => {
    if (state === null) return;
    applyStateUpdate(buyShopRelic(state, relicId));
  },

  onBuyShopPotion: (itemIndex) => {
    if (state === null) return;
    applyStateUpdate(buyShopPotion(state, itemIndex));
  },

  onRemoveShopCard: (cardId) => {
    if (state === null) return;
    applyStateUpdate(removeShopCard(state, cardId));
  },

  onLeaveShop: () => {
    if (state === null) return;
    applyStateUpdate(leaveShop(state));
  },

  // ---- 捨て札選択コールバック ----

  // pendingDiscard が非null のとき、手札から捨てるカードを選択する
  onSelectDiscardCard: (cardId: string) => {
    if (state === null) return;
    applyStateUpdate(selectDiscardCard(state, cardId));
  },

  // ---- イベントコールバック ----

  onSelectEventChoice: (choiceIndex: number) => {
    if (state === null) return;
    applyStateUpdate(resolveEventChoice(state, choiceIndex, defaultRng));
  },

  onLeaveEvent: () => {
    if (state === null) return;
    if (
      state.phase === "event" &&
      state.activeEvent !== null &&
      state.activeEvent.choices.length === 0
    ) {
      applyStateUpdate(resolveEventForced(state, defaultRng));
      return;
    }
    applyStateUpdate(leaveEvent(state));
  },
});

// 起動時にタイトル画面を最初に表示する
renderer.showTitle(persistentData);
