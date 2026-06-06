const MarkdownIt = require('markdown-it');
const { parseFrontmatter } = require('./parse-frontmatter');
const { wrapWechatArticle } = require('../templates/wechat-theme-default');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: false,
});

function stripWrappedParagraph(html) {
  return String(html || '').replace(/^<p>([\s\S]*)<\/p>$/i, '$1').trim();
}

function convertListBlock(innerHtml, ordered) {
  const items = [...innerHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((match) => stripWrappedParagraph(match[1]));
  if (!items.length) return innerHtml;
  return `<section class="wechat-list ${ordered ? 'wechat-list--ordered' : 'wechat-list--bullet'}">${items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '•';
      return `<p class="wechat-list-item"><span class="wechat-list-item__marker">${marker}</span><span class="wechat-list-item__text">${item}</span></p>`;
    })
    .join('')}</section>`;
}

function transformHtmlLists(html) {
  return String(html || '')
    .replace(/<ul>\s*([\s\S]*?)\s*<\/ul>/gi, (_, inner) => convertListBlock(inner, false))
    .replace(/<ol>\s*([\s\S]*?)\s*<\/ol>/gi, (_, inner) => convertListBlock(inner, true));
}

function renderMarkdownArticle(markdown, fallbackMeta = {}) {
  const parsed = parseFrontmatter(markdown);
  const meta = { ...fallbackMeta, ...(parsed.data || {}) };
  const content = parsed.content || '';
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = String(meta.title || (titleMatch ? titleMatch[1].trim() : fallbackMeta.title || '未命名文章'));

  const contentWithoutH1 = content.replace(/^#\s+.+\n*/m, '').trim();
  const bodyHtml = transformHtmlLists(md.render(contentWithoutH1));
  const html = wrapWechatArticle({ title, bodyHtml });

  return {
    meta,
    title,
    markdownBody: contentWithoutH1,
    bodyHtml,
    html,
  };
}

module.exports = {
  renderMarkdownArticle,
};
