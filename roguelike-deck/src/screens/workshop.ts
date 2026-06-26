// カード工房画面 UI 制御
// DOM を構築し、クリーンアップ関数を返すパターン
// 合成ロジック・コスト計算は core/workshop.ts に委譲する
import type { Card } from "../core/types/card";
import type { OriginalCard } from "../core/types/originalCard";
import type { RendererCallbacks } from "../renderer/types/renderer";
import type { PersistentData } from "../save/saveData";
import {
  MAX_SAVED_ORIGINAL_CARDS,
  generateOriginalCardId,
} from "../save/saveData";
import {
  computeOriginalCard,
  checkForbiddenCombination,
  normalizeOriginalCardName,
  checkDuplicateName,
} from "../core/workshop";
import { ALL_ORBS, getOrbById } from "../core/data/orbData";
import { buildCodexState } from "../core/codex";
import { renderCodexOverlay } from "./codex";

// 工房エディタの状態（DOM 内ローカル管理）
interface WorkshopEditorState {
  materialAId: string | null;
  materialBId: string | null;
  preview: OriginalCard | null;
  error: string | null;
}

/**
 * カード工房画面を container に構築する
 *
 * @param container 画面を挿入する DOM 要素
 * @param callbacks Renderer コールバック群
 * @param persistentData 永続データ（保存済みオリジナルカード一覧）
 * @param materializableCards 素材化可能なカード一覧
 * @returns クリーンアップ関数（イベントリスナーを解除して DOM から削除する）
 */
export function renderWorkshopScreen(
  container: HTMLElement,
  callbacks: RendererCallbacks,
  persistentData: PersistentData,
  materializableCards: readonly Card[],
): () => void {
  // 工房エディタのローカル状態
  let editorState: WorkshopEditorState = {
    materialAId: null,
    materialBId: null,
    preview: null,
    error: null,
  };

  // ---- DOM 構築 ----
  const screen = document.createElement("div");
  screen.id = "workshop-screen";

  // タイトル
  const heading = document.createElement("h1");
  heading.textContent = "工房";
  screen.appendChild(heading);

  const subtitle = document.createElement("p");
  subtitle.textContent =
    "2枚のカードを合成してオリジナルカードを作成できます。";
  screen.appendChild(subtitle);

  // 素材選択エリア
  const materialsArea = document.createElement("section");
  materialsArea.id = "workshop-materials";

  const materialsHeading = document.createElement("h2");
  materialsHeading.textContent = "素材カードを選ぶ";
  materialsArea.appendChild(materialsHeading);

  // 素材A選択
  const selectALabel = document.createElement("label");
  selectALabel.textContent = "素材 A：";
  const selectA = document.createElement("select");
  selectA.id = "material-a-select";

  const defaultOptA = document.createElement("option");
  defaultOptA.value = "";
  defaultOptA.textContent = "-- 選択してください --";
  selectA.appendChild(defaultOptA);

  for (const card of materializableCards) {
    const opt = document.createElement("option");
    opt.value = card.id;
    opt.textContent = `${card.name}（コスト:${describeSelectCost(card)}）`;
    selectA.appendChild(opt);
  }
  selectALabel.appendChild(selectA);
  materialsArea.appendChild(selectALabel);

  // 素材B選択
  const selectBLabel = document.createElement("label");
  selectBLabel.textContent = "素材 B：";
  const selectB = document.createElement("select");
  selectB.id = "material-b-select";

  const defaultOptB = document.createElement("option");
  defaultOptB.value = "";
  defaultOptB.textContent = "-- 選択してください --";
  selectB.appendChild(defaultOptB);

  for (const card of materializableCards) {
    const opt = document.createElement("option");
    opt.value = card.id;
    opt.textContent = `${card.name}（コスト:${describeSelectCost(card)}）`;
    selectB.appendChild(opt);
  }
  selectBLabel.appendChild(selectB);
  materialsArea.appendChild(selectBLabel);

  screen.appendChild(materialsArea);

  // プレビューエリア
  const previewArea = document.createElement("section");
  previewArea.id = "workshop-preview";
  const previewHeading = document.createElement("h2");
  previewHeading.textContent = "合成プレビュー";
  previewArea.appendChild(previewHeading);

  // 名前入力欄（previewContent の兄弟要素として配置する）
  const nameInputArea = document.createElement("div");
  nameInputArea.id = "workshop-name-input-area";
  nameInputArea.style.display = "none";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "カード名：";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.id = "workshop-name-input";
  nameInput.maxLength = 20;
  nameLabel.appendChild(nameInput);
  nameInputArea.appendChild(nameLabel);

  const nameError = document.createElement("p");
  nameError.id = "workshop-name-error";
  nameError.style.color = "#e04040";
  nameInputArea.appendChild(nameError);

  previewArea.appendChild(nameInputArea);

  const previewContent = document.createElement("div");
  previewContent.id = "workshop-preview-content";
  previewContent.textContent =
    "素材カードをA・B両方選ぶとプレビューが表示されます。";
  previewArea.appendChild(previewContent);
  screen.appendChild(previewArea);

  // 保存ボタン
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "workshop-save-btn";
  saveBtn.textContent = "このカードを保存する";
  saveBtn.disabled = true;
  screen.appendChild(saveBtn);

  // 保存済みカード一覧エリア
  const savedArea = document.createElement("section");
  savedArea.id = "workshop-saved";
  const savedHeading = document.createElement("h2");
  savedHeading.textContent = `保存済みオリジナルカード（最大${MAX_SAVED_ORIGINAL_CARDS}枚）`;
  savedArea.appendChild(savedHeading);
  const savedList = document.createElement("div");
  savedList.id = "workshop-saved-list";
  savedArea.appendChild(savedList);
  screen.appendChild(savedArea);

  // 下部ボタンエリア
  const bottomButtonArea = document.createElement("div");
  bottomButtonArea.id = "workshop-bottom-buttons";

  // 図鑑を見るボタン
  const codexBtn = document.createElement("button");
  codexBtn.type = "button";
  codexBtn.id = "workshop-codex-btn";
  codexBtn.textContent = "図鑑を見る";
  bottomButtonArea.appendChild(codexBtn);

  // タイトルへ戻るボタン
  const returnBtn = document.createElement("button");
  returnBtn.type = "button";
  returnBtn.id = "workshop-return-btn";
  returnBtn.textContent = "タイトルへ戻る";
  bottomButtonArea.appendChild(returnBtn);

  screen.appendChild(bottomButtonArea);

  container.appendChild(screen);

  // ---- ローカル状態に基づくUI更新 ----

  // 現在の persistentData のローカルコピー（保存済みカードを追跡）
  let currentData = persistentData;

  /**
   * プレビューエリアを更新する
   */
  function updatePreview(): void {
    const aId = editorState.materialAId;
    const bId = editorState.materialBId;

    if (aId === null || bId === null) {
      previewContent.textContent =
        "素材カードをA・B両方選ぶとプレビューが表示されます。";
      saveBtn.disabled = true;
      nameInputArea.style.display = "none";
      nameInput.value = "";
      nameError.textContent = "";
      editorState = { ...editorState, preview: null, error: null };
      return;
    }

    const cardA = materializableCards.find((c) => c.id === aId);
    const cardB = materializableCards.find((c) => c.id === bId);

    if (cardA === undefined || cardB === undefined) {
      previewContent.textContent = "カードが見つかりません。";
      saveBtn.disabled = true;
      nameInputArea.style.display = "none";
      nameInput.value = "";
      nameError.textContent = "";
      editorState = { ...editorState, preview: null, error: null };
      return;
    }

    // 禁止チェック
    const check = checkForbiddenCombination(cardA, cardB);
    if (!check.ok) {
      previewContent.textContent = `合成できません: ${check.reason}`;
      saveBtn.disabled = true;
      nameInputArea.style.display = "none";
      nameInput.value = "";
      nameError.textContent = "";
      editorState = { ...editorState, preview: null, error: check.reason };
      return;
    }

    // 合成プレビュー計算
    const tempId = generateOriginalCardId();
    const preview = computeOriginalCard(cardA, cardB, tempId);
    editorState = { ...editorState, preview, error: null };

    // 名前入力欄を表示し、自動生成名を初期値として設定する
    nameInput.value = preview.name;
    nameError.textContent = "";
    nameInputArea.style.display = "";

    // プレビュー表示（XSS対策: innerHTML を使わず DOM API で構築）
    const costText = describeCardCost(preview);
    const slotText = "エネミースロット: 空き";
    const compensationText =
      preview.compensation !== null
        ? `代償: ${preview.compensation.kind === "exhaust" ? "使用後このカードを除外する" : preview.compensation.kind}`
        : "代償: なし";

    previewContent.replaceChildren();

    const cardEl = document.createElement("div");
    cardEl.className = "preview-card";

    const nameEl = document.createElement("strong");
    nameEl.textContent = preview.name;
    cardEl.appendChild(nameEl);

    cardEl.appendChild(document.createElement("br"));

    const costLine = document.createTextNode(`コスト: ${costText}`);
    cardEl.appendChild(costLine);

    cardEl.appendChild(document.createElement("br"));

    // 効果説明は \n で代償行が分かれるので行ごとに要素化する
    const descLines = preview.description.split("\n");
    const effectLabel = document.createTextNode(`効果: ${descLines[0]}`);
    cardEl.appendChild(effectLabel);
    for (let i = 1; i < descLines.length; i++) {
      cardEl.appendChild(document.createElement("br"));
      cardEl.appendChild(document.createTextNode(descLines[i]));
    }

    cardEl.appendChild(document.createElement("br"));
    cardEl.appendChild(document.createTextNode(compensationText));
    cardEl.appendChild(document.createElement("br"));
    cardEl.appendChild(document.createTextNode(slotText));

    previewContent.appendChild(cardEl);

    // 保存ボタンの活性制御（5枚上限チェック）
    const atLimit =
      currentData.savedOriginalCards.length >= MAX_SAVED_ORIGINAL_CARDS;
    saveBtn.disabled = atLimit;
    if (atLimit) {
      saveBtn.title = `保存済みカードが${MAX_SAVED_ORIGINAL_CARDS}枚に達しています`;
    } else {
      saveBtn.title = "";
    }
  }

  /**
   * 保存済みカード一覧を更新する
   */
  function updateSavedList(): void {
    savedList.replaceChildren();

    if (currentData.savedOriginalCards.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "保存済みのオリジナルカードはありません。";
      savedList.appendChild(empty);
      return;
    }

    for (const card of currentData.savedOriginalCards) {
      const cardEl = document.createElement("div");
      cardEl.className = "saved-card-entry";

      const costText = describeCardCost(card);
      const compensationText =
        card.compensation !== null
          ? `代償あり（${card.compensation.kind}）`
          : "代償なし";

      const infoEl = document.createElement("span");
      infoEl.textContent = `【${card.name}】コスト:${costText} ${compensationText}`;
      cardEl.appendChild(infoEl);

      // リネームボタン
      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.textContent = "リネーム";
      cardEl.appendChild(renameBtn);

      // リネームエリア（初期非表示）
      const renameArea = document.createElement("div");
      renameArea.style.display = "none";

      const renameInput = document.createElement("input");
      renameInput.type = "text";
      renameInput.maxLength = 20;
      renameArea.appendChild(renameInput);

      const renameConfirmBtn = document.createElement("button");
      renameConfirmBtn.type = "button";
      renameConfirmBtn.textContent = "確定";
      renameArea.appendChild(renameConfirmBtn);

      const renameCancelBtn = document.createElement("button");
      renameCancelBtn.type = "button";
      renameCancelBtn.textContent = "キャンセル";
      renameArea.appendChild(renameCancelBtn);

      const renameError = document.createElement("p");
      renameError.style.color = "#e04040";
      renameArea.appendChild(renameError);

      cardEl.appendChild(renameArea);

      // リネームボタン押下: 入力欄を表示してボタンを隠す
      renameBtn.addEventListener("click", () => {
        renameInput.value = card.name;
        renameError.textContent = "";
        renameArea.style.display = "";
        renameBtn.style.display = "none";
      });

      // キャンセルボタン押下: 入力欄を非表示にしてボタンを表示
      renameCancelBtn.addEventListener("click", () => {
        renameArea.style.display = "none";
        renameBtn.style.display = "";
      });

      // 確定ボタン押下: 正規化 → 重複チェック → コールバック
      renameConfirmBtn.addEventListener("click", () => {
        // 空文字フォールバックなしで正規化（空なら拒否）
        const normalized = normalizeOriginalCardName(renameInput.value, "");
        if (normalized === "") {
          renameError.textContent = "カード名を入力してください";
          return;
        }

        // 重複チェック（自分自身のIDを除外）
        const dupCheck = checkDuplicateName(
          normalized,
          currentData.savedOriginalCards,
          card.id,
        );
        if (!dupCheck.ok) {
          renameError.textContent = dupCheck.reason;
          return;
        }

        callbacks.onRenameOriginalCard(card.id, normalized);
      });

      // エネミースロット表示 & 装着UI
      const slotEl = document.createElement("div");
      slotEl.className = "enemy-slot-area";
      const slot = card.enemySlot;
      if (slot.kind === "empty") {
        const availableOrbs = ALL_ORBS.filter((orb) =>
          currentData.acquiredOrbIds.includes(orb.id),
        );
        if (availableOrbs.length === 0) {
          const slotText = document.createElement("span");
          slotText.textContent = "エネミースロット: なし（オーブ未入手）";
          slotEl.appendChild(slotText);
        } else {
          const slotText = document.createElement("span");
          slotText.textContent = "エネミースロット: 空き　";
          slotEl.appendChild(slotText);

          const orbSelect = document.createElement("select");
          for (const orb of availableOrbs) {
            const opt = document.createElement("option");
            opt.value = orb.id;
            opt.textContent = orb.name;
            orbSelect.appendChild(opt);
          }
          slotEl.appendChild(orbSelect);

          const attachBtn = document.createElement("button");
          attachBtn.type = "button";
          attachBtn.textContent = "装着";
          attachBtn.addEventListener("click", () => {
            if (orbSelect.value !== "") {
              callbacks.onAttachOrb(card.id, orbSelect.value);
            }
          });
          slotEl.appendChild(attachBtn);
        }
      } else if (slot.kind === "filled") {
        const orb = getOrbById(slot.orbId);
        const orbName = orb !== undefined ? orb.name : slot.orbId;
        const slotText = document.createElement("span");
        slotText.textContent = `エネミースロット: ${orbName}装着中　`;
        slotEl.appendChild(slotText);

        const detachBtn = document.createElement("button");
        detachBtn.type = "button";
        detachBtn.textContent = "取り外す";
        detachBtn.addEventListener("click", () => {
          callbacks.onDetachOrb(card.id);
        });
        slotEl.appendChild(detachBtn);
      } else {
        // kind === "locked"（セーブデータ不整合時の防御）
        const slotText = document.createElement("span");
        slotText.textContent = "エネミースロット: （ラン中のため操作不可）";
        slotEl.appendChild(slotText);
      }
      cardEl.appendChild(slotEl);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "削除";
      deleteBtn.dataset["cardId"] = card.id;
      deleteBtn.addEventListener("click", () => {
        callbacks.onDeleteOriginalCard(card.id);
      });
      cardEl.appendChild(deleteBtn);

      savedList.appendChild(cardEl);
    }

    // 上限に達した場合のメッセージ
    if (currentData.savedOriginalCards.length >= MAX_SAVED_ORIGINAL_CARDS) {
      const limitMsg = document.createElement("p");
      limitMsg.style.color = "#e04040";
      limitMsg.textContent = `保存上限（${MAX_SAVED_ORIGINAL_CARDS}枚）に達しました。削除してから新しいカードを保存してください。`;
      savedList.appendChild(limitMsg);
    }
  }

  // ---- イベントリスナー登録 ----

  const handleSelectA = () => {
    editorState = { ...editorState, materialAId: selectA.value || null };
    updatePreview();
  };

  const handleSelectB = () => {
    editorState = { ...editorState, materialBId: selectB.value || null };
    updatePreview();
  };

  const handleSave = () => {
    if (editorState.preview === null) return;
    if (currentData.savedOriginalCards.length >= MAX_SAVED_ORIGINAL_CARDS)
      return;

    // 名前を正規化する（空欄の場合は自動生成名にフォールバック）
    const normalizedName = normalizeOriginalCardName(
      nameInput.value,
      editorState.preview.name,
    );

    // 重複チェック
    const dupCheck = checkDuplicateName(
      normalizedName,
      currentData.savedOriginalCards,
    );
    if (!dupCheck.ok) {
      nameError.textContent = dupCheck.reason;
      return;
    }
    nameError.textContent = "";

    // 保存時に新しいIDを生成してカードを確定する
    const newId = generateOriginalCardId();
    const cardToSave: OriginalCard = {
      ...editorState.preview,
      id: newId,
      name: normalizedName,
    };
    callbacks.onSaveOriginalCard(cardToSave);
  };

  const handleReturn = () => {
    callbacks.onReturnToTitle();
  };

  // 図鑑オーバーレイの開閉
  let codexCleanup: (() => void) | null = null;
  const handleCodex = () => {
    if (codexCleanup !== null) {
      codexCleanup();
      codexCleanup = null;
    }
    const viewData = {
      codexState: buildCodexState(
        currentData.codexPoints,
        currentData.acquiredOrbIds,
      ),
      acquiredOrbIds: currentData.acquiredOrbIds,
    };
    codexCleanup = renderCodexOverlay(container, viewData, () => {
      if (codexCleanup !== null) {
        codexCleanup();
        codexCleanup = null;
      }
    });
  };

  selectA.addEventListener("change", handleSelectA);
  selectB.addEventListener("change", handleSelectB);
  saveBtn.addEventListener("click", handleSave);
  returnBtn.addEventListener("click", handleReturn);
  codexBtn.addEventListener("click", handleCodex);

  // 初期描画
  updateSavedList();

  // ---- 外部から保存済みデータを更新するための関数（クロージャ経由） ----
  // main.ts が onSaveOriginalCard / onDeleteOriginalCard を呼んだ後、
  // ascii.ts が再度 renderWorkshopScreen を呼ぶことで全体を再描画する設計。
  // このため、ここでは初期データのみ使用する。

  // クリーンアップ関数
  return () => {
    selectA.removeEventListener("change", handleSelectA);
    selectB.removeEventListener("change", handleSelectB);
    saveBtn.removeEventListener("click", handleSave);
    returnBtn.removeEventListener("click", handleReturn);
    codexBtn.removeEventListener("click", handleCodex);
    if (codexCleanup !== null) {
      codexCleanup();
      codexCleanup = null;
    }
    screen.remove();
  };
}

// ---- ユーティリティ（workshop 画面専用） ----

import type { CardCost } from "../core/types/card";

function describeSelectCost(card: Card): string {
  return describeCardCost(card);
}

function describeCardCost(card: { cost: CardCost }): string {
  const cost = card.cost;
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
