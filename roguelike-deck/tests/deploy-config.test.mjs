import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("Vercel can install the build tools needed by the build command", async () => {
  const packageJson = await readJson(new URL("../package.json", import.meta.url));

  assert.equal(packageJson.scripts?.build, "tsc && vite build");
  assert.equal(packageJson.dependencies?.typescript, "~6.0.2");
  assert.equal(packageJson.dependencies?.vite, "^8.0.12");
});

test("Vercel build settings are checked in", async () => {
  const vercelConfig = await readJson(new URL("../vercel.json", import.meta.url));

  assert.equal(vercelConfig.installCommand, "npm ci");
  assert.equal(vercelConfig.buildCommand, "npm run build");
  assert.equal(vercelConfig.outputDirectory, "dist");
});

test("repository root Vercel settings publish the app subdirectory", async () => {
  const vercelConfig = await readJson(
    new URL("../../vercel.json", import.meta.url),
  );

  assert.equal(vercelConfig.installCommand, "cd roguelike-deck && npm ci");
  assert.equal(
    vercelConfig.buildCommand,
    "cd roguelike-deck && npm run build",
  );
  assert.equal(vercelConfig.outputDirectory, "roguelike-deck/dist");
});
