import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("card codex does not expose unused map entry types", async () => {
  const indexSource = await readFile(
    new URL("../src/core/types/index.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(indexSource, /CardCodexEntry|CardCodexState|cardCodex/);
});

test("startRun does not rely on nullish coalescing for discoveredCardNames", async () => {
  const battleSource = await readFile(
    new URL("../src/core/battle.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(
    battleSource,
    /persistentData\?\.discoveredCardNames\s*\?\?\s*\[\]/,
  );
});
