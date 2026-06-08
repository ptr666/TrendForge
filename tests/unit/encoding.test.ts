import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const checkedFiles = [
  "apps/web/src/components/panels.tsx",
  "apps/web/src/components/ui.tsx",
  "apps/web/src/main.tsx",
  "apps/web/index.html",
  "docs/development.md",
  "docs/usage-flow.md"
];

const mojibakeMarkers = ["鍩", "绛", "鑽", "楠", "鏄", "鐢", "灏", "寰"];

test("Chinese UI and docs text is not replaced by shell encoding artifacts", async () => {
  for (const file of checkedFiles) {
    const content = await readFile(path.resolve(file), "utf8");
    assert.equal(content.includes("????"), false, `${file} contains replacement question-mark runs`);
    for (const marker of mojibakeMarkers) {
      assert.equal(content.includes(marker), false, `${file} contains mojibake marker ${marker}`);
    }
  }
});
