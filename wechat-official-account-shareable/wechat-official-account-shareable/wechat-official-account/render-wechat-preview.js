#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { renderMarkdownArticle } = require('./lib/render-markdown');

const cwd = process.cwd();
const configPath = path.join(cwd, 'config.json');
const outputDir = path.join(cwd, 'output');

function fail(message, extra) {
  console.error(`❌ ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

if (!fs.existsSync(configPath)) fail('未找到 config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const articlePath = path.resolve(cwd, config.articlePath || '');
if (!articlePath || !fs.existsSync(articlePath)) fail(`文章文件不存在：${articlePath}`);

const markdown = fs.readFileSync(articlePath, 'utf8');
const rendered = renderMarkdownArticle(markdown, {
  title: '',
  author: config.author,
  digest: config.digest,
  source_url: config.contentSourceUrl,
});

fs.mkdirSync(outputDir, { recursive: true });
const previewPath = path.join(outputDir, 'article-preview.html');
fs.writeFileSync(previewPath, rendered.html, 'utf8');

console.log('✅ 预览文件已生成: ' + previewPath);
console.log('📰 标题: ' + rendered.title);
