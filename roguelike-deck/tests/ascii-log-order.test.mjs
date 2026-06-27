import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const asciiSource = await readFile(
  new URL("../src/renderer/ascii.ts", import.meta.url),
  "utf8",
);

test("battle log renders newest entries first without changing state log order", () => {
  const renderLogSource = asciiSource.match(
    /private renderLog\(state: GameState\): void \{[\s\S]*?\n  \}/,
  );

  assert.notEqual(renderLogSource, null);
  assert.match(renderLogSource[0], /state\.log\.toReversed\(\)/);
});
