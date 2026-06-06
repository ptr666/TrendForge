import test from "node:test";
import assert from "node:assert/strict";
import { createXhsBrowserPublisher, checkXhsDraftGate } from "../../packages/publishers/src/xhs.js";
import type { PlatformDraft } from "../../packages/core/src/types.js";

const draft: PlatformDraft = {
  id: "xhs-source",
  sourceItemId: "source",
  platform: "xhs",
  title: "AI 热点小红书草稿",
  body: "这是一篇小红书图文草稿。\n#AI热点",
  digest: "用于测试的小红书摘要。"
};

test("XHS draft gate keeps dry-run queued without filesystem checks", async () => {
  let checked = false;
  const gate = await checkXhsDraftGate({
    enabled: false,
    projectDir: "missing",
    bridgeUrl: "ws://localhost:9343"
  }, {
    allowRealDraft: false,
    existsImpl: async () => {
      checked = true;
      return false;
    }
  });

  assert.equal(gate.ok, true);
  assert.equal(gate.status, "dry-run");
  assert.equal(checked, false);
});

test("XHS draft gate fails closed when config is disabled", async () => {
  const gate = await checkXhsDraftGate({
    enabled: false,
    projectDir: "vendor/xiaohongshu-skills",
    bridgeUrl: "ws://localhost:9343"
  }, { allowRealDraft: true });

  assert.equal(gate.ok, false);
  assert.equal(gate.status, "blocked");
  assert.match(gate.message, /enabled=true/);
});

test("XHS browser publisher requires page-level draft-saved signal", async () => {
  const calls: string[] = [];
  const publisher = createXhsBrowserPublisher({
    enabled: true,
    projectDir: "vendor/xiaohongshu-skills",
    bridgeUrl: "ws://localhost:9343"
  }, {
    existsImpl: async () => true,
    runCommand: async (_command, args) => {
      calls.push(args.join(" "));
      return { exitCode: 0, stdout: "command success without page signal", stderr: "" };
    }
  });

  const result = await publisher.publishDraft(draft, { allowRealDraft: true });

  assert.equal(result.status, "failed");
  assert.match(result.message ?? "", /page-level draft-saved signal/);
  assert.ok(calls.some((call) => call.includes("check-login")));
  assert.ok(calls.some((call) => call.includes("fill-publish")));
  assert.ok(calls.some((call) => call.includes("save-draft")));
});

test("XHS browser publisher saves a real draft when commands and page signal pass", async () => {
  const calls: string[] = [];
  const publisher = createXhsBrowserPublisher({
    enabled: true,
    projectDir: "vendor/xiaohongshu-skills",
    bridgeUrl: "ws://localhost:9343"
  }, {
    existsImpl: async () => true,
    runCommand: async (_command, args) => {
      calls.push(args.join(" "));
      const isSave = args.includes("save-draft");
      return { exitCode: 0, stdout: isSave ? "browser page draft-saved signal observed" : "ok", stderr: "" };
    }
  });

  const dryRun = await publisher.publishDraft(draft, { allowRealDraft: false });
  const result = await publisher.publishDraft(draft, { allowRealDraft: true });

  assert.equal(dryRun.status, "queued");
  assert.equal(result.status, "success");
  assert.match(result.verificationSignal ?? "", /draft-saved/);
  assert.ok(calls.some((call) => call.includes("--bridge-url ws://localhost:9343")));
});
