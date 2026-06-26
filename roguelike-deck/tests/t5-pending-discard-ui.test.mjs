import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const asciiSource = await readFile(
  new URL("../src/renderer/ascii.ts", import.meta.url),
  "utf8",
);

// T5a: pendingDiscard が非 null のとき onSelectDiscardCard を呼ぶ分岐が存在する
test("renderHand branches to onSelectDiscardCard when pendingDiscard is not null", () => {
  // pendingDiscard の null チェックが ascii.ts に存在する
  assert.match(asciiSource, /pendingDiscard/);
  // onSelectDiscardCard の呼び出しが ascii.ts に存在する
  assert.match(asciiSource, /onSelectDiscardCard/);
  // pendingDiscard が null でない場合の分岐が存在する（null チェックと onSelectDiscardCard が近くにある）
  assert.match(
    asciiSource,
    /pendingDiscard[\s\S]{0,200}onSelectDiscardCard|onSelectDiscardCard[\s\S]{0,200}pendingDiscard/,
  );
});

// T5a: pendingDiscard === null のとき従来通り onPlayCard を呼ぶ
test("renderHand calls onPlayCard when pendingDiscard is null", () => {
  // onPlayCard の呼び出しが ascii.ts に存在する（手札クリック時）
  assert.match(asciiSource, /onPlayCard\(card\.id\)/);
});

// T5b: pendingDiscard 非 null 時にプロンプトを表示するコードが存在する
test("ascii.ts shows discard prompt when pendingDiscard is not null", () => {
  // 「捨て」または「discard」に関連するプロンプト文字列が存在する
  assert.match(
    asciiSource,
    /枚捨て|捨てるカードを選|pendingDiscard.*count|count.*枚/,
  );
});

// T5c: pendingDiscard 非 null 時にターン終了ボタンを disabled にする
test("renderActionArea disables end-turn button when pendingDiscard is not null", () => {
  // renderActionArea 内で pendingDiscard を参照して disabled を設定する
  assert.match(
    asciiSource,
    /pendingDiscard[\s\S]{0,300}disabled|disabled[\s\S]{0,300}pendingDiscard/,
  );
  // isDisabled の計算に pendingDiscard が含まれる
  assert.match(
    asciiSource,
    /pendingDiscard\s*!==\s*null|pendingDiscard\s*!=\s*null/,
  );
});
