import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const checkedFiles = [
  "README.md",
  "apps/web/src/components/panels.tsx",
  "apps/web/src/components/ui.tsx",
  "apps/web/src/main.tsx",
  "apps/web/index.html",
  "packages/providers/src/index.ts",
  "packages/generator/src/index.ts",
  "docs/README.md",
  "docs/development.md",
  "docs/local-setup.md",
  "docs/project-progress.md",
  "docs/usage-flow.md"
];

const mojibakeMarkers = [
  "鍩",
  "绛",
  "鑽",
  "楠",
  "鏄",
  "鐢",
  "灏",
  "寰",
  "閸",
  "缁",
  "閼",
  "妤",
  "閺",
  "閻",
  "鐏",
  "瀵"
];

test("Chinese UI, provider, generator, and docs text is not replaced by shell encoding artifacts", async () => {
  for (const file of checkedFiles) {
    const content = await readFile(path.resolve(file), "utf8");
    assert.equal(content.includes("????"), false, `${file} contains replacement question-mark runs`);
    for (const marker of mojibakeMarkers) {
      assert.equal(content.includes(marker), false, `${file} contains mojibake marker ${marker}`);
    }
  }
});
