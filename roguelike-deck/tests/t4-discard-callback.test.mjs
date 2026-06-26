import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// T4a: RendererCallbacks に onSelectDiscardCard が追加されているか確認する
test("RendererCallbacks includes onSelectDiscardCard", async () => {
  const source = await readFile(
    new URL("../src/renderer/types/renderer.ts", import.meta.url),
    "utf8",
  );

  // onSelectDiscardCard が RendererCallbacks インターフェースに存在する
  assert.match(
    source,
    /readonly onSelectDiscardCard:\s*\(cardId:\s*string\)\s*=>\s*void/,
  );
});

// T4b: main.ts に onSelectDiscardCard コールバックが実装されているか確認する
test("main.ts implements onSelectDiscardCard callback", async () => {
  const source = await readFile(
    new URL("../src/main.ts", import.meta.url),
    "utf8",
  );

  // selectDiscardCard が core/battle から import されている
  assert.match(source, /selectDiscardCard/);

  // onSelectDiscardCard コールバックが実装されている
  assert.match(source, /onSelectDiscardCard:/);
});

// T4b: onSelectDiscardCard が state を更新して render を呼ぶことを確認する
test("onSelectDiscardCard updates state and calls render", async () => {
  const source = await readFile(
    new URL("../src/main.ts", import.meta.url),
    "utf8",
  );

  // コールバック内で selectDiscardCard を呼んで state を更新し render する
  const callback = source.match(
    /onSelectDiscardCard:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\},/,
  );

  assert.ok(callback, "onSelectDiscardCard コールバックが見つからない");
  assert.match(callback[1], /selectDiscardCard\(state,\s*cardId\)/);
});
