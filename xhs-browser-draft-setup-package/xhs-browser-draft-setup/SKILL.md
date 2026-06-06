---
name: xhs-browser-draft-setup
description: "Use when installing, validating, documenting, or troubleshooting the Xiaohongshu browser bridge workflow until it can fill the publish page and save drafts into the Xiaohongshu draft box from Hermes/CLI, with share-safe setup instructions, browser configuration guidance, and both macOS and WSL/Windows deployment paths."
version: 1.2.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [xiaohongshu, browser-bridge, draft-save, setup, troubleshooting, chrome-extension, shareable-doc, macos, wsl]
    related_skills: [xiaohongshu-skills, xhs-publish, xhs-auth, hermes-agent]
---

# 小红书浏览器桥接安装与草稿箱跑通

## Overview

这是安装/排障/分享文档型 skill，目标不是“能打开小红书就算完成”，而是把整条链路跑通到一个明确、可验证、可分享的终点：

- `check-login` 成功
- `fill-publish` 成功把标题、正文、图片打进发布页
- `save-draft` 成功把内容存进小红书草稿箱
- 页面上能看到草稿已落库的明确信号

这个 skill 额外强调三件事：

1. **适合分享**：文档中不依赖个人私密信息，不要求暴露账号、cookie、token、手机号、截图里的个人资料。
2. **浏览器配置要写清楚**：不是只写 Python/CLI 命令，还要把 Chrome 扩展安装、刷新、权限、端口、tab 选择这些步骤写清楚。
3. **兼容不同宿主环境**：既考虑 `macOS + Chrome`，也考虑 `WSL + Windows Chrome` 这种混合拓扑。

一句话说：**完成标准是“能稳定保存草稿”，而不是“理论上应该能工作”。**

## Open-Source Provenance

这是一份**配置辅助 / 安装排障型 skill**，用于帮助用户围绕开源项目 **`xiaohongshu-skills`** 完成浏览器桥接、发布页填充、草稿保存、环境配置与分享版文档整理。

它不是该开源项目本体，也不是官方文档镜像；它的定位是：

- 为 Hermes 用户补足可执行的安装与排障步骤
- 把浏览器侧配置、桥接链路验证、分享脱敏要求写清楚
- 在 `macOS + Chrome` 与 `WSL + Windows Chrome` 两种常见环境下提供可复用的操作指引

如果后续项目实现发生变化，应以开源项目源码与其官方文档为准，并同步更新本 skill。

## When to Use

当用户提出以下需求时使用：

- “安装小红书浏览器 MCP / bridge”
- “把小红书自动化跑通到能存草稿”
- “修一下小红书发布页桥接”
- “为什么 fill-publish 可以但 save-draft 不行”
- “帮我把 Hermes 这边的小红书浏览器链路配好”
- “把这套小红书浏览器自动化写成可分享教程”

不要用于：

- 只想登录小红书 → 改用 `xhs-auth`
- 只想发布现成内容 → 改用 `xhs-publish`
- 想把 AI 日报做成草稿内容 → 改用 `aihot-to-xhs-draft`
- 只想做 X/Twitter 浏览器复用 → 改用对应浏览器/X 技能

## Scope and Terminology

这套链路里常见会混用几个词，但它们不是一回事：

- **xiaohongshu-skills 项目**：Python CLI + Chrome 扩展 + bridge 代码仓
- **Bridge Server**：本地 WebSocket 服务，默认 `ws://localhost:9343`
- **XHS Bridge 扩展**：装在 Chrome 里的扩展，负责接收 CLI 命令并操作真实页面
- **CLI**：`python scripts/cli.py ...` 这一层，用户或 Agent 实际调用的命令入口
- **发布页**：`creator.xiaohongshu.com/publish/publish?...target=image`
- **草稿成功**：不是“命令返回 success”，而是浏览器页面出现草稿已保存的信号

如果用户说“浏览器 MCP”，这里通常指的就是这套 **扩展 + bridge + CLI** 浏览器桥接链路，不是标准 MCP server 协议本身。

## Share-Safe Documentation Rules

当你要把这份 skill 分享给别人，或者把操作记录整理成教程时，必须遵守这些脱敏规则：

### 必须隐藏的信息

- 手机号
- 小红书账号昵称、用户 ID、小红书号（除非用户明确允许公开）
- cookies、token、`xsec_token`
- 任何登录二维码截图原图
- 浏览器个人资料路径
- 本机代理地址、公司内网域名、私有 API key
- 终端输出中的真实个人文件路径、用户名、主机名（必要时替换成占位符）

### 推荐替换方式

将任何本机专用信息改成占位符：

- `<YOUR_PROJECT_PATH>`
- `<YOUR_PHONE>`
- `<YOUR_ACCOUNT>`
- `<ABS_IMAGE_PATH>`
- `<WSL_DISTRO_NAME>`

路径示例不要绑定某个具体人的机器。优先使用：

```text
/path/to/xiaohongshu-skills
/abs/path/to/test.png
/tmp/xhs_title.txt
/tmp/xhs_content.txt
```

### 分享截图时的要求

- 隐藏 Chrome 书签栏上可能泄露身份的网站
- 隐藏扩展弹窗里若出现个人信息的区域
- 登录态截图尽量只截扩展状态与页面结构，不截头像、昵称、私信红点等个人内容
- 终端截图不要包含 `.env` 内容、cookie 文件路径、代理地址、用户名、主机名

## Architecture / Components

这套方案包含四个关键组件：

### 1. Chrome 浏览器

真正执行页面操作的是 **持有真实小红书登录态的 Chrome**。

作用：
- 持有用户真实登录态
- 打开小红书页面
- 加载 `XHS Bridge` 扩展
- 接收扩展注入后的 DOM / tab / file upload 操作

### 2. XHS Bridge Chrome 扩展

扩展负责：
- 与 `bridge_server.py` 建立 WebSocket 长连接
- 接收 CLI 命令
- 在真实 tab 中执行脚本、注入内容、上传文件、触发发布/存草稿动作

已知 manifest 关键信息：
- `manifest_version: 3`
- 扩展名：`XHS Bridge`
- `host_permissions` 包含：
  - `https://*.xiaohongshu.com/*`
  - `https://xiaohongshu.com/*`
  - `ws://localhost/*`
- `content_scripts` 覆盖：
  - `https://www.xiaohongshu.com/*`
  - `https://xiaohongshu.com/*`
  - `https://creator.xiaohongshu.com/*`

这意味着：**如果扩展没有加载成功、没有刷新生效、或者 host permissions 不匹配，CLI 侧就算能连 bridge server，也未必能操作页面。**

### 3. Bridge Server

本地运行的 `scripts/bridge_server.py` 是桥：

- extension 作为 `role=extension` 长连进来
- CLI 作为 `role=cli` 短连进来
- server 负责把 CLI 命令转发给扩展，再把结果回传

已知关键事实：
- 默认监听：`localhost:9343`
- CLI 默认 `--bridge-url`: `ws://localhost:9343`
- 若 90 秒没拿到结果，会返回 `命令执行超时（90s）`
- 若扩展未连接，会直接返回：
  - `Extension 未连接，请确认浏览器已安装并启用 XHS Bridge 扩展`

### 4. CLI

CLI 是对外统一入口，常用命令包括：

- `check-login`
- `login`
- `fill-publish`
- `save-draft`
- `click-publish`

其中本 skill 最关心的完整验证链路是：

```bash
check-login -> fill-publish -> save-draft
```

## Supported Environment Topologies

这份 skill 支持两种最常见拓扑：

### A. macOS + Chrome

这是最简单的单机拓扑：

- CLI 跑在 macOS 本机
- bridge server 跑在 macOS 本机
- Chrome 跑在 macOS 本机
- 小红书登录态也在同一个 Chrome 中

优点：
- `localhost` 最简单
- 文件路径上传最少跨系统问题
- 更适合分享给普通用户

### B. WSL + Windows Chrome

这是混合拓扑：

- CLI / bridge server 跑在 WSL
- Chrome 跑在 Windows
- 扩展装在 Windows Chrome
- 小红书登录态也在 Windows Chrome

特点：
- localhost WebSocket 可能受代理影响
- 文件上传路径可能涉及 WSL → Windows 路径转换
- 浏览器扩展目录通常通过 `\\wsl$\...` 加载

## Install Target and Paths

分享文档里不要写死某个人的机器路径。统一使用下面这种形式：

```text
<YOUR_PROJECT_PATH>/extension
<YOUR_PROJECT_PATH>/scripts/bridge_server.py
<YOUR_PROJECT_PATH>/scripts/cli.py
```

实际使用时：

- macOS 示例项目路径：
  - `/Users/<YOUR_USER>/path/to/xiaohongshu-skills`
- Linux / WSL 示例项目路径：
  - `/home/<YOUR_USER>/path/to/xiaohongshu-skills`

## Browser Configuration Tutorial

这一节必须写进教程里。很多人不是 Python 配错，而是浏览器没配对。

### Step B1: 确认使用的是哪一个 Chrome

不要默认用户知道“浏览器在哪边跑”。先明确：

- **macOS 拓扑**：CLI、bridge、Chrome 都在同一台 Mac 上
- **WSL 拓扑**：CLI/bridge 在 WSL，真正打开小红书页面的是 Windows Chrome

扩展必须装在**持有真实小红书登录态**的那个 Chrome 里。

### Step B2: 打开扩展管理页

在 Chrome 地址栏输入：

```text
chrome://extensions/
```

### Step B3: 开启开发者模式

在扩展页右上角开启 **开发者模式**。

如果不开，无法加载本地解压扩展。

### Step B4: 加载已解压扩展

点击：
- “加载已解压的扩展程序”

然后选择 `extension/` 目录。

#### macOS 示例

如果项目在本机目录里，直接选择：

```text
/Users/<YOUR_USER>/path/to/xiaohongshu-skills/extension
```

#### WSL + Windows 示例

如果项目在 WSL 中，Windows Chrome 常见选择路径是：

```text
\\wsl$\<WSL_DISTRO_NAME>\home\<YOUR_USER>\path\to\xiaohongshu-skills\extension
```

注意：这里的 `<WSL_DISTRO_NAME>` 不能写死成某个人机器上的发行版名。

### Step B5: 确认扩展已启用

扩展卡片应显示：

- 名称：`XHS Bridge`
- 状态：已启用

如果扩展没启用，先不要继续桥接排障。

### Step B6: 固定扩展到工具栏（推荐）

推荐把 `XHS Bridge` 固定到 Chrome 工具栏，方便：

- 随时打开 popup
- 查看 bridge 状态
- 刷新后快速观察是否已重连

### Step B7: 打开至少一个小红书相关页面

推荐先手动打开其中一个页面：

- `https://www.xiaohongshu.com/`
- 或图文发布页：
  `https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image`

原因：
- 扩展需要有可选中的小红书 tab
- 某些排障要验证它到底选中了哪个页面

### Step B8: 登录小红书

最好先在浏览器里手动确认已经登录。不要把“CLI 应该能判断登录”当成第一验证手段。

建议人工确认：
- 首页是否能看到登录后界面
- 创作中心是否可进入
- 是否被重定向回登录页

## Step 1: 检查项目本体与依赖

先确认：

- Python >= 3.11
- `uv` 可用
- `xiaohongshu-skills` 目录存在
- 已执行 `uv sync`

通用命令：

```bash
cd <YOUR_PROJECT_PATH>
uv sync
```

如果是分享版文档，不要写死用户的专属 Python 虚拟环境路径；只保留上面的最小命令即可。

## Step 2: 启动 Bridge Server

默认端口是 `9343`。

### macOS / Linux / 本机直连推荐写法

```bash
cd <YOUR_PROJECT_PATH>
uv run python scripts/bridge_server.py
```

### WSL 推荐写法

```bash
cd <YOUR_PROJECT_PATH>
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
    NO_PROXY=localhost,127.0.0.1 \
    uv run python scripts/bridge_server.py
```

### 为什么 WSL 要去掉代理变量

WSL 场景下，Python WebSocket 客户端可能把 `ws://localhost:9343` 错误走代理，导致：

- `HTTP 404`
- 握手失败
- 明明本地服务已启动，但 CLI 仍提示连不上

所以这不是“可选优化”，而是 WSL 场景下的推荐默认写法。

### Bridge Server 启动成功的信号

正常启动时通常应看到类似日志：

- `Bridge server 已启动: ws://localhost:9343`
- `等待浏览器扩展连接...`

如果你在分享文档，不要贴出包含本机用户名、终端主题、代理地址的完整大截图，只要描述关键行即可。

## Step 3: 验证扩展是否真的连上 Bridge

不要只看“扩展装了”。必须看 **popup 状态**。

期望结果：
- `Bridge 服务：已连接`

若显示“未连接”，按这个顺序排：

1. `bridge_server.py` 是否仍在运行
2. 扩展是否启用
3. 是否加载了正确目录
4. 是否需要在 `chrome://extensions/` 里刷新扩展
5. 若是 WSL，是否被代理变量影响 localhost WebSocket

## Step 4: 跑 `check-login` 作为最小真调用

### macOS / Linux / 本机直连

```bash
cd <YOUR_PROJECT_PATH>
uv run python scripts/cli.py check-login
```

### WSL 推荐写法

```bash
cd <YOUR_PROJECT_PATH>
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy \
    NO_PROXY=localhost,127.0.0.1 \
    uv run python scripts/cli.py check-login
```

### 预期结果

- 返回 JSON
- 表示当前是否已登录
- 若已登录，可能返回用户信息

### 分享时要注意

如果输出里带：
- 昵称
- 用户 ID
- 小红书号

分享出去前要手动打码或改写成占位符。

### 失败分流

- `Extension 未连接` → 先回 bridge/扩展层
- `HTTP 404` / 握手异常 → 先排代理（主要是 WSL）
- `未登录` → 走 `xhs-auth` 登录流程
- 页面打不开或跳登录页 → 先做浏览器侧人工验证，再怀疑 CLI

## Step 5: 验证发布页真实状态，不要先改代码

在任何修改发布 URL、tab 选择逻辑、或选择器之前，先验证真实页面：

- 当前最终 URL 是什么
- 页面标题是什么
- 是否跳到了登录页
- 是否真的落在图文发布页

当前已知稳定发布页应优先是：

```text
https://creator.xiaohongshu.com/publish/publish?source=official&from=menu&target=image
```

### 这里的原则

- **先看浏览器真实状态，再改代码**
- 不要只凭脚本常量或旧经验猜
- 不要一看到报错就先改选择器

很多问题根本不是选择器坏了，而是：
- tab 选错了
- 实际没在发布页
- 登录态丢了
- 扩展没注入到那个页面

## Step 6: 准备一个最小验证样本

为了排除内容复杂度因素，先准备最小样本：

### 标题文件

`/tmp/xhs_title.txt`

内容示例：

```text
小红书自动化测试
```

### 正文文件

`/tmp/xhs_content.txt`

内容示例：

```text
这是一条用于验证浏览器桥接与草稿保存链路的测试内容。

如果你现在能看到这段话，说明正文填充已经成功。

#自动化测试 #小红书草稿
```

### 测试图片

准备一张真实存在的本地图片，例如：

```text
<ABS_IMAGE_PATH>
```

分享文档时不要使用带个人隐私内容的图片。

## Step 7: 跑 `fill-publish` 真验证

### macOS / Linux / 本机直连

```bash
cd <YOUR_PROJECT_PATH>
uv run python scripts/cli.py fill-publish \
  --title-file /tmp/xhs_title.txt \
  --content-file /tmp/xhs_content.txt \
  --images <ABS_IMAGE_PATH>
```

### WSL 推荐写法

```bash
cd <YOUR_PROJECT_PATH>
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy NO_PROXY=localhost,127.0.0.1 \
uv run python scripts/cli.py fill-publish \
  --title-file /tmp/xhs_title.txt \
  --content-file /tmp/xhs_content.txt \
  --images <ABS_IMAGE_PATH>
```

### 正确的验证标准

不要只看命令退出码。要看真实页面里是否出现：

- 标题已填入
- 正文已填入
- 图片已上传或进入预览流

### 常见误判

- “命令没报错，所以一定成功” → 不对
- “页面进去了，所以图片一定传上了” → 不对
- “看到一个空壳发布页，所以 bridge 没问题” → 不对

## Step 8: 文件上传路径问题

如果能进发布页，但图片上传卡住，优先怀疑路径与宿主环境不匹配。

### WSL + Windows Chrome 典型问题

常见根因：
- WSL 路径被直接传给 Windows Chrome
- `DOM.setFileInputFiles` 没拿到 Windows 可识别路径

典型症状：
- 日志先显示“开始上传第 1 张图片”
- 之后 60 秒超时
- 页面 URL 明明已经是正确发布页

正确修复方向：
- 在 bridge 文件上传层统一做路径转换
- WSL 下优先 `wslpath -w <abs_path>`
- 再把转换后的路径交给浏览器侧文件上传逻辑
- 非 WSL 环境保持原样

### macOS 说明

macOS 一般没有 WSL→Windows 这种跨系统路径问题，但仍要确认：
- 传入的是绝对路径
- 文件真实存在
- Chrome 对该文件有可访问权限

### 不推荐的做法

- 每次手工改调用参数路径
- 把问题先甩给选择器
- 仅凭“图片预览没出现”就断言是 DOM 失效

这类问题的 durable fix 应该在 bridge 层，不应该让每个调用方背锅。

## Step 9: 跑 `save-draft` 真验证

在确认 `fill-publish` 已把内容真正打进页面后，再执行。

### macOS / Linux / 本机直连

```bash
cd <YOUR_PROJECT_PATH>
uv run python scripts/cli.py save-draft
```

### WSL 推荐写法

```bash
cd <YOUR_PROJECT_PATH>
env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy NO_PROXY=localhost,127.0.0.1 \
uv run python scripts/cli.py save-draft
```

## Save-Draft Compatibility Rule

新版页面优先逻辑：

1. 查找 `xhs-publish-btn[is-save-draft="true"]`
2. 若 `save-disabled != true`
3. 在组件 host 上 dispatch：

```js
host.dispatchEvent(new CustomEvent('save', {bubbles: true, cancelable: true}))
```

旧版页面回退逻辑：

- 查找可见 `button.custom-button`
- 文案等于 `暂存离开`
- 点击该按钮

### 为什么这一节必须写清楚

因为很多分享教程只会写“点击保存草稿按钮”，但小红书新版发布页可能已经不是普通按钮，而是：

- web component
- closed shadow DOM
- 自定义事件触发

如果不把这一点写明，别人照教程做时会以为页面没按钮就是工具坏了。

## Final Success Criteria

最终不是看 CLI 返回“success”，而是看真实页面状态：

- 已退出编辑页
- 已回到发布首页 / 上传首页
- 页面出现 `草稿箱(n)` 或其他草稿已保存的强信号

如果页面上已经出现 `草稿箱(n)`，即使某次 CLI 旧逻辑返回过失败，也优先认定草稿已落库。

## Recommended Verification Order

推荐验证顺序固定为：

```text
1. 扩展已加载
2. bridge server 已启动
3. 扩展 popup 显示已连接
4. check-login 成功
5. 发布页真实可达且处于登录态
6. fill-publish 页面可见内容已真正填入
7. save-draft 后页面出现草稿箱信号
```

不要颠倒顺序。越早的层没通，越后面的测试越没有意义。

## Port Conflict Rule

如果扩展报 `WebSocket handshake 403`，或者你怀疑端口连错目标，优先检查是否撞上了别的 Chrome/CDP 会话。

处理原则：

1. 不要优先关闭用户现有浏览器工作流
2. 优先给 XHS Bridge 改端口
3. 改端口要同步修改：
   - `extension/background.js` 的 `BRIDGE_URL`
   - `scripts/cli.py` 默认 `--bridge-url`
   - `scripts/xhs/bridge.py` 默认 bridge URL
   - 相关文档和启动命令
4. 修改后必须重载扩展并重新验证连接

当前默认端口已是 `9343`，是为了绕开常见的 `9333` 冲突位。

## Common Pitfalls

1. **扩展装好了，但其实没连上 bridge**  
   “已安装”不等于“已连接”。

2. **WSL 下代理变量劫持 localhost WebSocket**  
   这是混合拓扑里的高频坑，优先级非常高。

3. **没验证真实页面 URL 就改代码**  
   先看浏览器真实状态，再改常量或选择器。

4. **把图片上传失败误判成选择器失效**  
   很多时候根因其实是路径或宿主环境不匹配。

5. **把 save-draft 当成普通按钮点击**  
   新版小红书发布页可能是 web component + 自定义 `save` 事件。

6. **只看 CLI 返回值，不看页面是否出现草稿箱**  
   真实页面状态更可信。

7. **分享教程时泄露账号/路径/截图隐私**  
   这是文档化时最容易忽略的问题。

8. **把“浏览器配置”写成一句话带过**  
   实际上浏览器配置往往比 CLI 命令更容易出错。

9. **默认只考虑 WSL，不考虑 mac 用户**  
   分享版文档必须把两种常见环境都说明白。

## Shareable One-Shot Recipe

当你要把这套流程写给别人照着做，推荐最小手册结构如下：

1. 先说明自己使用的是 `macOS + Chrome` 还是 `WSL + Windows Chrome`
2. 安装项目并 `uv sync`
3. 在 Chrome `chrome://extensions/` 加载 `extension/`
4. 启动 `bridge_server.py`
5. 打开扩展 popup，确认已连接
6. 手动确认小红书已登录且发布页可打开
7. 用 `/tmp/xhs_title.txt`、`/tmp/xhs_content.txt`、测试图跑 `fill-publish`
8. 再跑 `save-draft`
9. 用页面里的 `草稿箱(n)` 做最终验收
10. 分享时删掉所有账号、cookie、token、手机号、个人截图细节

## Verification Checklist

- [ ] 文档中未包含手机号、cookie、token、二维码原图、个人昵称、用户 ID、主机名或真实用户名
- [ ] 文档中的路径已改为占位符或通用示例，而不是某个人机器专用路径
- [ ] 浏览器配置步骤已写清：`chrome://extensions/`、开发者模式、加载扩展、刷新扩展、查看 popup
- [ ] 已同时说明 `macOS + Chrome` 与 `WSL + Windows Chrome` 两种常见拓扑
- [ ] `xiaohongshu-skills` 项目存在且 `uv sync` 完成
- [ ] `bridge_server.py` 在 9343 正常运行
- [ ] 扩展 popup 显示 bridge 已连接
- [ ] `check-login` 成功
- [ ] 能打开真实图文发布页且处于登录态
- [ ] `fill-publish` 后页面里能看到标题、正文、图片都已进入页面
- [ ] `save-draft` 后页面回到发布首页或上传首页
- [ ] 页面出现 `草稿箱(n)` 或其他明确草稿已保存信号
- [ ] 教程结论以页面真实状态为准，而不是只以 CLI 输出为准
