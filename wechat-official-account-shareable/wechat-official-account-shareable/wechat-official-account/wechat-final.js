#!/usr/bin/env node
// 微信公众号草稿自动发布工具
// 用法：
//   1) cp config.example.json config.json
//   2) 修改 config.json
//   3) node wechat-final.js --check   // 只检查配置和 token
//   4) node wechat-final.js           // 创建草稿

const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { renderMarkdownArticle } = require('./lib/render-markdown');

const DEFAULT_IMAGE_BASE_URL = 'https://your-openai-compatible-api.example.com/v1';
const DEFAULT_IMAGE_MODEL = 'YOUR_IMAGE_MODEL';
const DEFAULT_IMAGE_API_KEY = '***';

const cwd = process.cwd();
const configPath = path.join(cwd, 'config.json');
const outputDir = path.join(cwd, 'output');
const stateDir = path.join(cwd, 'state');
const publishStatePath = path.join(stateDir, 'published.json');
const isCheckMode = process.argv.includes('--check');
const forcePublish = process.argv.includes('--force');

function parseCredentialFromLegacyScript(legacyPath) {
  if (!legacyPath) return {};
  const resolved = path.resolve(cwd, legacyPath);
  if (!fs.existsSync(resolved)) {
    return { legacyPath: resolved, error: 'legacy script not found' };
  }

  try {
    const src = fs.readFileSync(resolved, 'utf8');
    const appidMatch = src.match(/const\s+APPID\s*=\s*'([^']+)'/);
    const appsecretMatch = src.match(/const\s+APPSECRET\s*=\s*'([^']+)'/);
    return {
      legacyPath: resolved,
      appid: appidMatch ? appidMatch[1] : undefined,
      appsecret: appsecretMatch ? appsecretMatch[1] : undefined,
    };
  } catch (error) {
    return { legacyPath: resolved, error: error.message };
  }
}

function fail(message, extra) {
  console.error(`❌ ${message}`);
  if (extra) console.error(extra);
  process.exit(1);
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    fail('未找到 config.json，请先从 config.example.json 复制一份并填写。');
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail('config.json 不是合法 JSON。', error.message);
  }

  const legacy = parseCredentialFromLegacyScript(config.legacyCredentialSource);
  const appid = process.env.WECHAT_APPID || config.appid || legacy.appid;
  const appsecret = process.env.WECHAT_APPSECRET || config.appsecret || legacy.appsecret;
  const articlePath = path.resolve(cwd, config.articlePath || '');

  if (!appid) fail('缺少 appid。');
  if (!appsecret || appsecret === 'YOUR_APP_SECRET_HERE') fail('缺少真实的 appsecret。');
  if (!config.articlePath) fail('缺少 articlePath。');
  if (!fs.existsSync(articlePath)) fail(`文章文件不存在：${articlePath}`);

  const coverImagePath = config.cover?.imagePath ? path.resolve(cwd, config.cover.imagePath) : '';
  if (coverImagePath && !fs.existsSync(coverImagePath)) {
    fail(`封面图文件不存在：${coverImagePath}`);
  }

  return {
    appid,
    appsecret,
    articlePath,
    author: config.author || '普通人的AI',
    digest: config.digest || 'QClaw 公众号自动发布的测试草稿',
    contentSourceUrl: config.contentSourceUrl || '',
    coverWidth: config.cover?.width || 1280,
    coverHeight: config.cover?.height || 720,
    coverImagePath,
    coverPrompt: config.cover?.prompt || '',
    coverAiMode: process.env.COVER_AI_MODE || config.cover?.ai?.mode || 'generate',
    imageBaseUrl: process.env.COVER_IMAGE_BASE_URL || config.cover?.ai?.baseUrl || DEFAULT_IMAGE_BASE_URL,
    imageModel: process.env.COVER_IMAGE_MODEL || config.cover?.ai?.model || DEFAULT_IMAGE_MODEL,
    imageApiKey: process.env.COVER_IMAGE_API_KEY || config.cover?.ai?.apiKey || DEFAULT_IMAGE_API_KEY,
    needOpenComment: config.comment?.needOpenComment ? 1 : 0,
    onlyFansCanComment: config.comment?.onlyFansCanComment ? 1 : 0,
    legacyPath: legacy.legacyPath,
    legacyError: legacy.error,
  };
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crcBuf]);
}

function generatePNG(width, height) {
  console.log(`🖼️ 生成兜底渐变封面图 (${width}x${height})...`);
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdr = chunk('IHDR', ihdrData);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const t = y / height;
      const noise = Math.floor(Math.random() * 10) - 5;
      row[1 + x * 3] = Math.max(0, Math.min(255, 26 + Math.floor(80 * (1 - t)) + noise));
      row[1 + x * 3 + 1] = Math.max(0, Math.min(255, 115 + Math.floor(20 * (1 - t)) + noise));
      row[1 + x * 3 + 2] = Math.max(0, Math.min(255, 232 - Math.floor(80 * t) + noise));
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const comp = zlib.deflateSync(raw, { level: 6 });
  const idat = chunk('IDAT', comp);
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function buildCoverPrompt(articleTitle, digest, width, height, customPrompt) {
  if (customPrompt && customPrompt.trim()) return customPrompt.trim();
  return [
    `为一篇微信公众号文章生成封面图。`,
    `文章标题：${articleTitle}`,
    `文章摘要：${digest}`,
    `要求：中文互联网审美，适合公众号头图，16:9 横版，无水印，无 logo，尽量不要出现难以辨认的小字。`,
    `风格：现代、干净、有传播感、适合商业与科技主题。`,
    `输出重点：强视觉中心，适合 ${width}x${height} 封面。`,
  ].join(' ');
}

function buildCoverPromptOnlyResult({ articleTitle, digest, width, height, prompt }) {
  const finalPrompt = buildCoverPrompt(articleTitle, digest, width, height, prompt);
  return {
    prompt: finalPrompt,
    filename: 'cover-prompt.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(finalPrompt, 'utf8'),
  };
}

async function generateCoverWithAI({ articleTitle, digest, width, height, prompt, model, baseUrl, apiKey }) {
  console.log(`🖼️ 使用 AI 生成封面图（Responses + 自然语言）...`);
  const normalizedBaseUrl = String(baseUrl || '').replace(/\/$/, '');
  const finalPrompt = buildCoverPrompt(articleTitle, digest, width, height, prompt);
  const requestModel = 'gpt-5.4';
  const body = {
    model: requestModel,
    input: finalPrompt,
    tools: [{ type: 'image_generation' }],
  };

  const response = await fetch(`${normalizedBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`生图响应不是合法 JSON: ${text.slice(0, 400)}`);
  }

  if (!response.ok) {
    throw new Error(`生图失败: ${text.slice(0, 600)}`);
  }

  const imageCall = Array.isArray(json?.output)
    ? json.output.find((item) => item && item.type === 'image_generation_call' && item.result)
    : null;
  const b64 = imageCall?.result;
  if (!b64) {
    throw new Error(`未返回图片数据: ${text.slice(0, 1000)}`);
  }

  return {
    buffer: Buffer.from(b64, 'base64'),
    filename: 'cover-ai.png',
    mimeType: 'image/png',
    sourceLabel: `ai:responses:${requestModel}:image_generation`,
    prompt: finalPrompt,
  };
}


function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function uploadFormData(token, apiPath, filename, mimeType, fileBuffer) {
  return new Promise((resolve, reject) => {
    const boundary = '----QClawBoundary' + Date.now();
    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media"; filename="${filename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
      'utf8'
    );
    const tail = Buffer.from(`\r\n--${boundary}--`, 'utf8');
    const body = Buffer.concat([head, fileBuffer, tail]);
    const url = new URL('https://api.weixin.qq.com' + apiPath + (apiPath.includes('?') ? '&' : '?') + 'access_token=' + token);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchRemoteFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`远程图片下载失败: ${url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const pathname = new URL(url).pathname;
  const basename = path.basename(pathname) || `remote-${Date.now()}`;
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: contentType.split(';')[0].trim(),
    filename: basename,
  };
}

async function uploadArticleImage(token, src) {
  let file;
  if (/^https?:\/\//i.test(src)) {
    file = await fetchRemoteFile(src);
  } else {
    const absolutePath = path.resolve(cwd, src);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`正文图片不存在: ${absolutePath}`);
    }
    file = {
      buffer: fs.readFileSync(absolutePath),
      mimeType: detectMimeType(absolutePath),
      filename: path.basename(absolutePath),
    };
  }

  const uploadRes = await uploadFormData(token, '/cgi-bin/media/uploadimg', file.filename, file.mimeType, file.buffer);
  if (uploadRes.errcode && uploadRes.errcode !== 0) {
    throw new Error(`正文图片上传失败: ${JSON.stringify(uploadRes)}`);
  }
  if (!uploadRes.url) {
    throw new Error(`正文图片上传后未返回 url: ${JSON.stringify(uploadRes)}`);
  }
  return uploadRes.url;
}

async function processArticleImages(token, html) {
  const seen = new Map();
  const matches = [...html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/gi)];
  if (!matches.length) {
    return { html, uploadedImages: [] };
  }

  let nextHtml = html;
  const uploadedImages = [];
  for (const match of matches) {
    const originalSrc = match[1];
    if (/^data:/i.test(originalSrc)) continue;

    let uploadedUrl = seen.get(originalSrc);
    if (!uploadedUrl) {
      uploadedUrl = await uploadArticleImage(token, originalSrc);
      seen.set(originalSrc, uploadedUrl);
      uploadedImages.push({ source: originalSrc, url: uploadedUrl });
      console.log('🖼️ 正文图片上传成功: ' + originalSrc);
    }

    nextHtml = nextHtml.replaceAll(`src="${originalSrc}"`, `src="${uploadedUrl}"`);
  }

  return { html: nextHtml, uploadedImages };
}

function loadPublishState() {
  if (!fs.existsSync(publishStatePath)) {
    return { articles: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(publishStatePath, 'utf8'));
  } catch {
    return { articles: [] };
  }
}

function savePublishState(entry) {
  fs.mkdirSync(stateDir, { recursive: true });
  const current = loadPublishState();
  current.lastPublishedAt = entry.publishedAt;
  current.articles = Array.isArray(current.articles) ? current.articles : [];
  current.articles.unshift(entry);
  current.articles = current.articles.slice(0, 50);
  fs.writeFileSync(publishStatePath, JSON.stringify(current, null, 2) + '\n', 'utf8');
}

function buildPublishFingerprint({ articlePath, title, markdownSource, digest }) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ articlePath, title, markdownSource, digest }))
    .digest('hex');
}

function findExistingPublication(fingerprint) {
  const state = loadPublishState();
  const articles = Array.isArray(state.articles) ? state.articles : [];
  return articles.find((item) => item && item.fingerprint === fingerprint) || null;
}

async function getAccessToken(appid, appsecret) {
  console.log('📡 获取 access_token...');
  const response = await httpsRequest({
    hostname: 'api.weixin.qq.com',
    path: `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(appsecret)}`,
    method: 'GET',
  });

  if (!response.access_token) {
    fail('Token 获取失败。', JSON.stringify(response, null, 2));
  }

  console.log('✅ Token 获取成功');
  return response.access_token;
}

(async () => {
  const config = loadConfig();
  const mdContent = fs.readFileSync(config.articlePath, 'utf8');
  const rendered = renderMarkdownArticle(mdContent, {
    title: '',
    author: config.author,
    digest: config.digest,
    source_url: config.contentSourceUrl,
  });
  const articleTitle = rendered.title;
  let htmlContent = rendered.html;
  const articleMeta = rendered.meta || {};
  const finalAuthor = articleMeta.author || config.author;
  const finalDigest = articleMeta.digest || config.digest;
  const finalSourceUrl = articleMeta.source_url || config.contentSourceUrl;
  const frontmatterCover = articleMeta.cover ? path.resolve(cwd, articleMeta.cover) : '';

  console.log('==========================================');
  console.log(' 微信公众号草稿发布工具');
  console.log(' 文章: ' + articleTitle);
  console.log(' 文件: ' + config.articlePath);
  console.log(' 模式: ' + (isCheckMode ? '检查模式' : '发布模式'));
  if (config.legacyPath) {
    console.log(' 凭证来源候选: ' + config.legacyPath);
    if (config.legacyError) console.log(' 凭证候选读取提示: ' + config.legacyError);
  }
  console.log('==========================================');

  const initialFingerprint = buildPublishFingerprint({
    articlePath: config.articlePath,
    title: articleTitle,
    markdownSource: mdContent,
    digest: finalDigest,
  });
  const existingPublication = findExistingPublication(initialFingerprint);

  const accessToken = await getAccessToken(config.appid, config.appsecret);

  if (isCheckMode) {
    console.log('\n✅ 配置检查通过，可以开始发布。');
    if (existingPublication) {
      console.log('ℹ️ 这篇文章此前已发布过，但检查模式不会因此提前退出。');
      console.log('上次发布时间: ' + existingPublication.publishedAt);
    }
    process.exit(0);
  }

  if (existingPublication && !forcePublish) {
    console.log('⚠️ 检测到这篇文章已经发布过，已自动跳过。');
    console.log('上次发布时间: ' + existingPublication.publishedAt);
    console.log('如需强制重发，请使用: node wechat-final.js --force');
    process.exit(0);
  }
  if (existingPublication && forcePublish) {
    console.log('⚠️ 检测到重复发布，但已启用 --force，继续执行。');
  }

  fs.mkdirSync(outputDir, { recursive: true });

  console.log('\n📡 上传封面图到永久素材库...');
  let coverBuffer;
  let coverFilename;
  let coverMimeType;
  let coverSourceLabel;

  if (frontmatterCover && fs.existsSync(frontmatterCover)) {
    coverBuffer = fs.readFileSync(frontmatterCover);
    coverFilename = path.basename(frontmatterCover);
    coverMimeType = detectMimeType(frontmatterCover);
    coverSourceLabel = frontmatterCover;
    console.log('🖼️ 使用 frontmatter 封面图: ' + frontmatterCover);
  } else if (config.coverImagePath) {
    coverBuffer = fs.readFileSync(config.coverImagePath);
    coverFilename = path.basename(config.coverImagePath);
    coverMimeType = detectMimeType(config.coverImagePath);
    coverSourceLabel = config.coverImagePath;
    console.log('🖼️ 使用本地封面图: ' + config.coverImagePath);
  } else if (config.coverAiMode === 'prompt-only') {
    const promptOnly = buildCoverPromptOnlyResult({
      articleTitle,
      digest: finalDigest,
      width: config.coverWidth,
      height: config.coverHeight,
      prompt: config.coverPrompt,
    });
    fs.mkdirSync(outputDir, { recursive: true });
    const promptOutputPath = path.join(outputDir, promptOnly.filename);
    fs.writeFileSync(promptOutputPath, promptOnly.buffer);
    console.log('📝 已生成封面提示词（未直接请求生图接口）: ' + promptOutputPath);
    console.log('📝 封面提示词: ' + promptOnly.prompt);
    coverBuffer = generatePNG(config.coverWidth, config.coverHeight);
    coverFilename = 'cover.png';
    coverMimeType = 'image/png';
    coverSourceLabel = 'prompt-only:' + promptOutputPath;
  } else {
    try {
      const aiCover = await generateCoverWithAI({
        articleTitle,
        digest: finalDigest,
        width: config.coverWidth,
        height: config.coverHeight,
        prompt: config.coverPrompt,
        model: config.imageModel,
        baseUrl: config.imageBaseUrl,
        apiKey: config.imageApiKey,
      });
      coverBuffer = aiCover.buffer;
      coverFilename = aiCover.filename;
      coverMimeType = aiCover.mimeType;
      coverSourceLabel = aiCover.sourceLabel || ('ai:' + config.imageModel);
      console.log('✅ AI 封面图生成成功');
    } catch (error) {
      console.warn('⚠️ AI 生图失败，回退到本地渐变封面兜底');
      console.warn(String(error && error.message ? error.message : error));
      coverBuffer = generatePNG(config.coverWidth, config.coverHeight);
      coverFilename = 'cover.png';
      coverMimeType = 'image/png';
      coverSourceLabel = 'fallback:gradient';
    }
  }

  const matRes = await uploadFormData(accessToken, '/cgi-bin/material/add_material', coverFilename, coverMimeType, coverBuffer);
  if (matRes.errcode && matRes.errcode !== 0) {
    fail('封面图上传失败。', JSON.stringify(matRes, null, 2));
  }

  const thumbMediaId = matRes.media_id;
  if (!thumbMediaId) {
    fail('封面图上传后未返回 media_id。', JSON.stringify(matRes, null, 2));
  }
  console.log('✅ 封面图上传成功! media_id:', thumbMediaId);

  console.log('\n📡 上传正文图片到微信图床...');
  const articleImageResult = await processArticleImages(accessToken, htmlContent);
  htmlContent = articleImageResult.html;
  fs.writeFileSync(path.join(outputDir, 'article-final.html'), htmlContent, 'utf8');

  console.log('\n📡 创建草稿...');
  const draftPayload = JSON.stringify({
    articles: [{
      title: articleTitle,
      author: finalAuthor,
      digest: finalDigest,
      content: htmlContent,
      content_source_url: finalSourceUrl,
      thumb_media_id: thumbMediaId,
      need_open_comment: config.needOpenComment,
      only_fans_can_comment: config.onlyFansCanComment,
    }],
  });

  const draftRes = await httpsRequest({
    hostname: 'api.weixin.qq.com',
    path: '/cgi-bin/draft/add?access_token=' + accessToken,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(draftPayload),
    },
  }, draftPayload);

  const draftOk = !draftRes.errcode || draftRes.errcode === 0;
  if (!draftOk) {
    fail('草稿创建失败。', JSON.stringify(draftRes, null, 2));
  }

  const publishedAt = new Date().toISOString();
  const finalFingerprint = buildPublishFingerprint({
    articlePath: config.articlePath,
    title: articleTitle,
    markdownSource: mdContent,
    digest: finalDigest,
  });

  savePublishState({
    publishedAt,
    fingerprint: finalFingerprint,
    articlePath: config.articlePath,
    title: articleTitle,
    author: finalAuthor,
    digest: finalDigest,
    contentSourceUrl: finalSourceUrl,
    thumbMediaId,
    coverSource: coverSourceLabel || frontmatterCover || config.coverImagePath || ('ai:' + config.imageModel),
    articleImageCount: articleImageResult.uploadedImages.length,
    articleImages: articleImageResult.uploadedImages,
  });

  console.log('\n==========================================');
  console.log(' 🎉 草稿创建成功');
  console.log('==========================================');
  console.log('请登录公众号后台: https://mp.weixin.qq.com');
  console.log('→ 「内容与互动」→「草稿箱」查看草稿');
  console.log('📝 发布记录已写入: ' + publishStatePath);
  console.log('🧾 最终 HTML 已写入: ' + path.join(outputDir, 'article-final.html'));
  console.log('==========================================');
})().catch((error) => {
  fail('执行失败。', error && error.stack ? error.stack : String(error));
});
