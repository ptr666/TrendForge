function wrapWechatArticle({ title, bodyHtml }) {
  return `
<article class="wechat-article">
  <section class="wechat-article__inner">
    <header class="wechat-article__header">
      <div class="wechat-article__eyebrow">普通人的AI · 内容笔记</div>
      <h1 class="wechat-article__title">${title}</h1>
      <div class="wechat-article__title-divider"></div>
    </header>
    <section class="wechat-article__content">${bodyHtml}</section>
  </section>
</article>
<style>
  .wechat-article {
    color: #2b2b2b;
    font-size: 16px;
    line-height: 1.9;
    word-break: break-word;
    letter-spacing: 0.02em;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    background: #fff;
  }
  .wechat-article__inner {
    max-width: 100%;
    margin: 0 auto;
  }
  .wechat-article__header {
    margin: 0 0 30px;
    padding: 4px 0 0;
  }
  .wechat-article__eyebrow {
    display: inline-block;
    margin: 0 0 14px;
    padding: 4px 10px;
    border-radius: 999px;
    background: #eef8f2;
    color: #1f8f55;
    font-size: 12px;
    line-height: 1.4;
    letter-spacing: 0.08em;
  }
  .wechat-article__title {
    font-size: 30px;
    line-height: 1.34;
    margin: 0;
    font-weight: 700;
    color: #111;
    letter-spacing: 0.01em;
  }
  .wechat-article__title-divider {
    width: 72px;
    height: 4px;
    margin: 18px 0 0;
    border-radius: 999px;
    background: linear-gradient(90deg, #07c160 0%, #72d572 100%);
  }
  .wechat-article__content {
    color: #2f2f2f;
  }
  .wechat-article__content p {
    margin: 0 0 18px;
    color: #2f2f2f;
    text-align: justify;
  }
  .wechat-article__content > p:first-of-type {
    font-size: 18px;
    line-height: 1.95;
    color: #3b3b3b;
    margin-bottom: 24px;
  }
  .wechat-article__content h2 {
    margin: 40px 0 18px;
    padding: 0 0 0 14px;
    border-left: 4px solid #07c160;
    font-size: 22px;
    line-height: 1.5;
    color: #111;
    font-weight: 700;
  }
  .wechat-article__content h3 {
    margin: 30px 0 14px;
    font-size: 18px;
    line-height: 1.55;
    color: #1b1b1b;
    font-weight: 700;
  }
  .wechat-article__content blockquote {
    margin: 26px 0;
    padding: 16px 18px;
    background: linear-gradient(180deg, #f7fbf8 0%, #f4f6f5 100%);
    border-left: 4px solid #7ecf9a;
    border-radius: 10px;
    color: #4d5a52;
  }
  .wechat-article__content blockquote p:last-child {
    margin-bottom: 0;
  }
  .wechat-article__content .wechat-list {
    margin: 0 0 20px;
    padding: 2px 0;
  }
  .wechat-article__content .wechat-list-item {
    margin: 10px 0;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .wechat-article__content .wechat-list-item__marker {
    flex: 0 0 auto;
    min-width: 1.7em;
    color: #07c160;
    font-weight: 700;
    line-height: 1.9;
  }
  .wechat-article__content .wechat-list-item__text {
    flex: 1 1 auto;
    color: #2f2f2f;
  }
  .wechat-article__content strong {
    color: #111;
    font-weight: 700;
  }
  .wechat-article__content a {
    color: #576b95;
    text-decoration: none;
    border-bottom: 1px solid rgba(87, 107, 149, 0.35);
  }
  .wechat-article__content hr {
    border: none;
    border-top: 1px solid #e9eceb;
    margin: 30px 0;
  }
  .wechat-article__content code {
    font-family: Consolas, Monaco, monospace;
    font-size: 0.9em;
    background: #f5f7f8;
    color: #2d5f47;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .wechat-article__content pre {
    overflow-x: auto;
    background: #f7f8fa;
    padding: 16px 18px;
    border-radius: 10px;
    margin: 22px 0;
    border: 1px solid #edf0f2;
  }
  .wechat-article__content pre code {
    background: transparent;
    color: #2f2f2f;
    padding: 0;
    border-radius: 0;
    display: block;
    line-height: 1.8;
  }
  .wechat-article__content img {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 26px auto;
    border-radius: 8px;
  }
  .wechat-article__content table {
    width: 100%;
    border-collapse: collapse;
    margin: 22px 0;
    font-size: 14px;
    line-height: 1.7;
  }
  .wechat-article__content th,
  .wechat-article__content td {
    border: 1px solid #e7ebee;
    padding: 10px 12px;
    text-align: left;
  }
  .wechat-article__content th {
    background: #f6f8f9;
    color: #222;
  }
</style>
`.trim();
}

module.exports = {
  wrapWechatArticle,
};
