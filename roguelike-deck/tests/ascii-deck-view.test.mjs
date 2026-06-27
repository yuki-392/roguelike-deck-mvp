import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const asciiSource = await readFile(
  new URL("../src/renderer/ascii.ts", import.meta.url),
  "utf8",
);

test("battle UI has separate buttons for deck and discard views", () => {
  assert.match(asciiSource, /id="deck-view-btn"[^>]*>山札を見る<\/button>/);
  assert.match(
    asciiSource,
    /id="discard-view-btn"[^>]*>捨て札を見る<\/button>/,
  );
});

test("deck view content does not contain the discard view", () => {
  const deckContent = asciiSource.match(
    /<div id="deck-view-content"[\s\S]*?<\/div>/,
  );

  assert.notEqual(deckContent, null);
  assert.doesNotMatch(deckContent[0], /deck-view-discard/);
});

test("renderer updates deck and discard contents independently", () => {
  assert.match(asciiSource, /getElementById\("deck-view-deck"\)/);
  assert.match(asciiSource, /getElementById\("discard-view-discard"\)/);
});

test("battle UI always has a top-right run info panel", () => {
  assert.match(asciiSource, /id="battle-run-info"/);
  assert.match(asciiSource, /id="battle-gold"/);
  assert.match(asciiSource, /id="battle-relic-list"/);
});

test("renderer updates battle gold and relic effect descriptions", () => {
  assert.match(asciiSource, /getElementById\("battle-gold"\)/);
  assert.match(asciiSource, /getElementById\("battle-relic-list"\)/);
  assert.match(asciiSource, /state\.run\.gold/);
  assert.match(asciiSource, /relic\.description/);
});
