#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const sourcePath = path.join(cwd, 'topic-sources.json');
const examplePath = path.join(cwd, 'topic-sources.example.json');
const stateDir = path.join(cwd, 'state');
const statePath = path.join(stateDir, 'topic-watch-state.json');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`JSON 解析失败：${filePath}\n${error.message}`);
  }
}

function hoursSince(isoTime) {
  if (!isoTime) return Infinity;
  const ms = Date.now() - new Date(isoTime).getTime();
  return ms / 3600000;
}

const config = readJson(sourcePath);
if (!config) {
  fail(`未找到 topic-sources.json，请先从 ${path.basename(examplePath)} 复制一份。`);
}

const sources = Array.isArray(config.sources) ? config.sources : [];
const state = readJson(statePath, { sources: {} });
state.sources = state.sources || {};

const due = [];
const notDue = [];
for (const source of sources) {
  if (!source || !source.id || !source.name) continue;
  const sourceState = state.sources[source.id] || {};
  const everyHours = Number(source.checkEveryHours || 24);
  const elapsed = hoursSince(sourceState.lastCheckedAt);
  const item = {
    id: source.id,
    name: source.name,
    type: source.type || 'unknown',
    url: source.url || '',
    watchFor: Array.isArray(source.watchFor) ? source.watchFor : [],
    priority: source.priority || 'medium',
    notes: source.notes || '',
    lastCheckedAt: sourceState.lastCheckedAt || null,
    elapsedHours: Number.isFinite(elapsed) ? elapsed.toFixed(1) : 'never',
    checkEveryHours: everyHours,
  };

  if (elapsed >= everyHours) due.push(item);
  else notDue.push(item);
}

fs.mkdirSync(stateDir, { recursive: true });
const now = new Date().toISOString();
for (const item of due) {
  state.sources[item.id] = {
    ...(state.sources[item.id] || {}),
    lastCheckedAt: now,
  };
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');

console.log('🧭 选题来源池检查结果');
console.log(`应检查来源：${due.length}`);
console.log(`暂不到期：${notDue.length}`);
console.log('');

if (!due.length) {
  console.log('暂无到期来源。');
  console.log('如果你要接 cron，可以直接定时运行这个脚本。');
  process.exit(0);
}

for (const item of due) {
  console.log(`- [${item.priority}] ${item.name}`);
  console.log(`  type: ${item.type}`);
  if (item.url) console.log(`  url: ${item.url}`);
  if (item.watchFor.length) console.log(`  watchFor: ${item.watchFor.join(' / ')}`);
  if (item.notes) console.log(`  notes: ${item.notes}`);
  console.log(`  lastCheckedAt: ${item.lastCheckedAt || 'never'}`);
  console.log('');
}

console.log('建议下一步：');
console.log('1. 逐个抓取这些来源的最新内容');
console.log('2. 提炼成可改写的公众号选题');
console.log('3. 进入 compose-and-publish 流程');
