import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("onForgeCard renders immediately after applying the forge effect", async () => {
  const source = await readFile(
    new URL("../src/main.ts", import.meta.url),
    "utf8",
  );
  const callback = source.match(
    /onForgeCard:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\},/,
  );

  assert.ok(callback);
  assert.match(callback[1], /applyForge\(state,\s*cardId,\s*effect\)/);
});

test("onBuyShopPotion buys by item index and renders the updated state", async () => {
  const source = await readFile(
    new URL("../src/main.ts", import.meta.url),
    "utf8",
  );
  const callback = source.match(
    /onBuyShopPotion:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\s*\},/,
  );

  assert.match(source, /\bbuyShopPotion\b[\s\S]*from "\.\/core\/battle"/);
  assert.ok(callback);
  assert.match(callback[1], /buyShopPotion\(state,\s*itemIndex\)/);
});
