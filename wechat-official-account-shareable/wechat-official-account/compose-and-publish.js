#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const cwd = process.cwd();
const briefArg = process.argv[2] || 'article-brief.json';
const briefPath = path.isAbsolute(briefArg) ? briefArg : path.resolve(cwd, briefArg);
const configPath = path.join(cwd, 'config.json');

function fail(message, extra) {
  console.error(`❌ ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) fail(`文件不存在：${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`JSON 解析失败：${filePath}`, error.message);
  }
}

function slugify(text) {
  return String(text || 'article')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'article';
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanLine(text) {
  return String(text || '').trim();
}

function pushParagraphs(parts, paragraphs = []) {
  for (const p of ensureArray(paragraphs).map(cleanLine).filter(Boolean)) {
    parts.push(p);
    parts.push('');
  }
}

function pushBullets(parts, bullets = []) {
  const normalized = ensureArray(bullets).map(cleanLine).filter(Boolean);
  for (const bullet of normalized) {
    parts.push(`- ${bullet}`);
  }
  if (normalized.length) parts.push('');
}

function pushQuote(parts, quote) {
  const lines = ensureArray(quote).map(cleanLine).filter(Boolean);
  if (!lines.length) return;
  for (const line of lines) {
    parts.push(`> ${line}`);
  }
  parts.push('');
}

function normalizeConclusion(brief) {
  const conclusion = ensureArray(brief.conclusion).map(cleanLine).filter(Boolean);
  const cta = cleanLine(brief.cta);
  const closing = ensureArray(brief.closingNote).map(cleanLine).filter(Boolean);
  const hasAnything = conclusion.length || cta || closing.length;
  if (!hasAnything) return [];

  const result = [];
  result.push({ type: 'heading', text: brief.conclusionHeading || '结语' });
  conclusion.forEach((text) => result.push({ type: 'paragraph', text }));
  closing.forEach((text) => result.push({ type: 'paragraph', text }));
  if (cta) result.push({ type: 'paragraph', text: cta });
  return result;
}

function buildMarkdown(brief) {
  const parts = [];
  parts.push('---');
  parts.push(`title: ${brief.title}`);
  if (brief.author) parts.push(`author: ${brief.author}`);
  if (brief.digest) parts.push(`digest: ${brief.digest}`);
  if (brief.coverImagePath) parts.push(`cover: ${brief.coverImagePath}`);
  if (brief.sourceUrl) parts.push(`source_url: ${brief.sourceUrl}`);
  parts.push('---');
  parts.push('');
  parts.push(`# ${brief.title}`);
  parts.push('');

  if (brief.lead) {
    pushParagraphs(parts, brief.lead);
  } else {
    pushParagraphs(parts, brief.intro);
  }

  pushQuote(parts, brief.quote || brief.keyTakeaway);

  if (!brief.lead) {
    const introBridge = cleanLine(brief.introBridge);
    if (introBridge) {
      parts.push(introBridge);
      parts.push('');
    }
  }

  const sections = ensureArray(brief.sections);
  for (const section of sections) {
    if (!section || !section.heading) continue;
    parts.push(`## ${cleanLine(section.heading)}`);
    parts.push('');

    if (section.lead) {
      pushParagraphs(parts, section.lead);
    }

    pushParagraphs(parts, section.paragraphs);

    if (section.quote || section.keyTakeaway) {
      pushQuote(parts, section.quote || section.keyTakeaway);
    }

    pushBullets(parts, section.bullets);

    if (section.examplesHeading && ensureArray(section.examples).length) {
      parts.push(`### ${cleanLine(section.examplesHeading)}`);
      parts.push('');
    }
    pushBullets(parts, section.examples);

    if (section.actionHeading && ensureArray(section.actionItems).length) {
      parts.push(`### ${cleanLine(section.actionHeading)}`);
      parts.push('');
    }
    pushBullets(parts, section.actionItems);

    pushParagraphs(parts, section.closing);
  }

  const conclusionBlocks = normalizeConclusion(brief);
  if (conclusionBlocks.length) {
    for (const block of conclusionBlocks) {
      if (block.type === 'heading') {
        parts.push(`## ${block.text}`);
        parts.push('');
      } else if (block.type === 'paragraph') {
        parts.push(block.text);
        parts.push('');
      }
    }
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function main() {
  const brief = loadJson(briefPath);
  if (!brief.title) fail('article brief 缺少 title');
  if (!fs.existsSync(configPath)) fail('未找到 config.json，请先完成公众号基础配置。');

  const config = loadJson(configPath);
  const articlesDir = path.join(cwd, 'articles');
  fs.mkdirSync(articlesDir, { recursive: true });

  const filename = `${new Date().toISOString().slice(0,10)}-${slugify(brief.title)}.md`;
  const articlePath = path.join(articlesDir, filename);
  const markdown = buildMarkdown(brief);
  fs.writeFileSync(articlePath, markdown, 'utf8');

  config.articlePath = './articles/' + filename;
  if (brief.author) config.author = brief.author;
  if (brief.digest) config.digest = brief.digest;
  if (Object.prototype.hasOwnProperty.call(brief, 'coverImagePath')) {
    config.cover = config.cover || {};
    config.cover.imagePath = brief.coverImagePath || '';
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');

  console.log('✅ Markdown 已生成:', articlePath);
  console.log('✅ config.json 已更新为当前文章');

  const result = spawnSync('node', ['wechat-final.js'], {
    cwd,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

main();
