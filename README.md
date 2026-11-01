# 个人学习站 · 网页端

一个纯静态的多板块站点：首页是板块目录，下面挂「学习台」和「笔记库」。
用 GitHub 私有仓库存 `.md` 笔记，用这个网页**只读**地看。

没有服务器、没有数据库、没有账号系统——网页本身不存任何东西，数据始终在你自己的仓库里。

线上地址：<https://ethan-a-lab.github.io/idea-vault-web/>

---

## 板块

| 板块 | 入口 | 是什么 | 数据在哪 |
|---|---|---|---|
| 首页 | `index.html` | 板块目录，一张卡一个板块 | 无 |
| 学习台 | `desk/` | 清单记掌握度、速记暂存、成果展示，可装成 PWA | 浏览器 `localStorage` |
| 笔记库 | `notes.html` | 读私有仓库的 Markdown，三栏阅读器，**只读** | GitHub 私有库 `idea-vault` |

**写入只有一条路**：本机 Obsidian 整理 → 手动推 GitHub。网页端没有任何写库的能力，
`notes/gh.js` 里连 `putFile` 都不存在，token 只需要 `Contents: Read-only`。

---

## 第一次用：三步

### 1. 建一个 fine-grained token

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token

- **Repository access**：只选 `idea-vault` 这一个仓库
- **Permissions → Contents**：`Read-only`
- **Expiration**：按你自己习惯

> ⚠️ 令牌等于私有仓库的钥匙。**别截图、别发到聊天窗口、别提交进代码。**
> 如果已经泄露，去 GitHub 上直接 Delete 重发一个，旧的立刻作废。

### 2. 打开笔记页，填一次

点左上角的库名（或齿轮图标）→ 填：

| 字段 | 填什么 |
|---|---|
| GitHub 用户名 | `Ethan-a-lab` |
| 数据仓库名 | `idea-vault` |
| 分支 | `main` |
| 子目录 | 留空（读整个仓库） |
| Token | 粘贴上一步的令牌 |

点「保存并连接」。看到左侧出现文件树、底部显示「N 篇 · 时间」，就是成功了。

配置存在 `iv:cfg` 里，**同一域名下只填一次**。换浏览器、换设备、清缓存才需要重填。

### 3. 加到桌面

- **iPhone**：Safari 打开 → 分享 → 添加到主屏幕
- **Android**：Chrome 打开 → 菜单 → 添加到主屏幕

学习台带 `manifest.webmanifest`，装上之后是独立窗口，断网也能用（缓存范围内）。

---

## 加一个新板块

四个板块以外的内容（比如「读书」「课程」），加一个页面就行，不用动别人的代码：

1. 新建 `reading.html`，`<body>` 上写 `data-page="reading"`，末尾引 `assets/shell.js`
2. `assets/shell.js` 顶部的 `NAV` 数组加一行：`{ key: 'reading', label: '读书', href: 'reading.html' }`
3. 首页 `index.html` 里照着现有卡片加一张
4. 如果新页面自己也有吸顶栏，在 `assets/shell.css` 里补一条，把它下推到外壳下方：

```css
body[data-page="reading"] .topbar { top: var(--shell-h) !important; }
```

第 4 步容易漏。不写的话，页面自己的顶栏会和外壳导航叠在一起。
**注意选择器要避开 `.shell` 本身**（曾经写成 `header { top: var(--shell-h) }`，结果把外壳也推下去了）。

---

## 笔记该怎么写

笔记全部在私有库 `idea-vault` 里，用 Obsidian 写、推上来，网页只负责好看地读。

### frontmatter

文件最上面的 `---` 之间写属性，网页会渲染成顶部的「属性面板」：

```markdown
---
title: 关于"兴趣变现"的一个人
tags: [思考, 职业]
date: 2026-10-18
source: https://example.com/xxxx/
status: 待整理
---

正文从这里开始……
```

- `title` 不写的话，用正文第一个 `# 标题`，再没有就用文件名
- `tags` 支持 `[a, b]` 和每行 `- a` 两种写法
- 值是网址会自动变成可点链接

### 双链

```markdown
见 [[某篇笔记]]                → 显示文件名
见 [[某篇笔记|换个说法]]        → 显示成"换个说法"
见 [[某篇笔记#某个小节]]        → 跳到指定小节
```

目标可以写**文件名**、**路径**、或**标题**（三种都能匹配）。
匹配不上的显示成灰色虚线，点一下会提示"库里还没有这篇"。

被引用的笔记底部会自动出现「被 N 篇笔记引用」，列出来源和上下文。

### 标签与表格

- 正文里写 `#日语` `#N3/语法` 会自动变成可点标签，左侧「标签」页签能看到全部和计数
- 表格列数多时**不压扁**，而是横向滚动，表头吸顶；手机上会提示「左右滑动」

---

## 学习台怎么用

三块，共用一条顶栏，`#/list` `#/scratch` `#/works` 三个地址直接切：

- **清单**（`study.v2`）：板块 → 章节 → 条目，结构自己定，没有预设内容。
  条目右侧三个方块记掌握度：**未学 → 听过 → 会用 → 能讲**，再点同一格退一级。
  每条可以填「判断标准」和笔记路径，填了路径右侧会出现「笔记 ↗」，直接跳到笔记库那篇。
- **速记**（`study.notes.v1`）：随手扔的碎片，一句话也行。
  「导出 .md」生成 `速记-YYYY-MM-DD.md`（带 frontmatter，时间正序），拖进 Obsidian 就能整理。
  「归档」是搬走但不删，留个墓碑（`del:1`），归档区里能翻回来。
- **成果**（`study.works.v1`）：对外展示的卡片，标题 / 类型 / 年份 / 说明 / 标签 / 链接，自己加自己改。
  链接只放行 `http(s)`，写了 `javascript:` 会被丢掉。

工具栏右侧的**备份 / 恢复**管三块数据：备份导出一个 JSON（清单 + 速记 + 成果），
恢复时清单和成果整体覆盖、速记按 id 合并。也能读旧版的 `study-progress-*.json`（只取里面的速记）。

**没有云同步**：这一页不连 GitHub、不需要令牌。跨设备就靠「备份 / 导出 .md」搬运，
正本始终在 Obsidian 那边。定位是**暂存箱**，不是唯一副本——整理完就清空，正式内容以私有库为准。

---

## 代码结构

```
index.html          首页：板块目录
notes.html          笔记库入口
manifest.webmanifest 站点级 PWA 清单（名字 / 图标 / 配色）
assets/
  shell.js          站级外壳：注入顶栏导航，板块清单在 NAV 数组
  shell.css         外壳样式（含深色适配）
  icons/            站点图标：favicon.svg + 32/180/192/512/maskable 各尺寸
notes/
  app.js            笔记库逻辑：路由、文件树、阅读、命令面板
  app.css           笔记库样式
  md.js             Markdown 渲染器（零依赖，含 frontmatter / 双链 / 表格）
  gh.js             GitHub API 只读 + IndexedDB 缓存
desk/
  index.html        学习台（清单 / 速记 / 成果三个视图）
  assets/
    list.js         学习台的逻辑：三个视图的渲染、存储、导入导出
    list.css        学习台的样式（动效令牌在 :root）
    icons/          图标（与站点图标同一套）
  data/content.js   旧版清单内容，只在新页面里「导入旧版」时读
  sw.js             Service Worker（只缓存 desk/ 内文件）
test/
  fixtures/         渲染器测试用的样本笔记（全部编造，不含真实笔记）
test-md.js          渲染器回归测试（node test-md.js）
tools/
  check-public-content.js   提交前检查：阻止真实笔记进入公开仓库
  make-icons.py             重出图标全套（改颜色后跑一次）
```

**为什么自己写 Markdown 解析器**：jsdelivr / unpkg 在国内经常连不上，一挂整个页面就白屏；
而且 `[[双链]]` 要跟库里文件做匹配，外部库做不到。代价是多几百行代码，好处是永远不会因为 CDN 挂掉而打不开。

### 本地预览

```bash
cd D:\Github\idea-vault-web
python -m http.server 8765
# 浏览器打开 http://127.0.0.1:8765/
```

要看到笔记内容得填真 token（联 `api.github.com`，国内需要加速器）。
只想看布局的话，直接打开首页和学习台就够了。

### 跑测试

```bash
node test-md.js
```

33 项，覆盖嵌套列表、任务列表、代码块、引用、表格对齐、双链、标签、HTML 转义、
方括号时间戳、YAML 引号陷阱，以及裸 HTML / 危险协议的安全过滤。路径都是相对 `test-md.js` 的，换电脑直接能跑。

---

## 想改的时候，改哪里

| 想改什么 | 改哪个文件 | 找什么 |
|---|---|---|
| 顶栏导航项 | `assets/shell.js` | 顶部 `NAV` 数组 |
| 外壳配色 / 高度 | `assets/shell.css` | `--shell-h` 与各主题变量 |
| 笔记库配色 | `notes/app.css` | `html[data-theme="dark"]` 变量块 |
| 阅读区宽度 | `notes/app.css` | `:root { --read-w }` |
| 属性面板显示哪些字段 | `notes/app.js` | `LABELS` 对象 |
| 命令面板的命令 | `notes/app.js` | `COMMANDS` 数组 |
| 表格最小列宽 | `notes/md.js` | `parseTable` 里的 `header.length * 66` |
| 学习台配色 / 动效时长 | `desk/assets/list.css` | 顶部 `:root` 变量 |
| 学习台旧版清单内容 | `desk/data/content.js` | `meta` 与条目数组 |

改完提交，GitHub Pages 一两分钟后自动更新。

---

## 安全

- Token 存在浏览器的 `localStorage` 里，**只存在你这台设备**，不上传任何地方
- 网页没有后端，别人读不到你的 token
- 反过来说：**这台设备上的任何脚本都能读到它**。别在陌生页面粘贴这个网页的地址，也别装来路不明的浏览器扩展
- 令牌权限卡死：**只给一个仓库、只给 Contents 只读**。即使泄露，最坏也只是被读走笔记，改不了
- 想立刻失效：GitHub → Settings → Developer settings → 删掉那个 token

### 笔记里写 HTML 会被过滤

`md.js` 允许笔记里手写少量 HTML（`<div>` `<details>` `<img>` 这类），但输出前会过一遍 `cleanHtml`：

- `<script>` `<style>` `<iframe>` `<object>` `<embed>` `<form>` 连内容一起删
- `onclick` / `onerror` 这类事件属性删掉
- `href` / `src` 里的 `javascript:`、`data:text/html` 换成 `#`；`srcdoc` 整条删
- 链接和图片只认 `http(s)` / `mailto` / `tel` / 相对路径；被拦下的只留文字，显示成灰色虚线

这是**黑名单**式过滤，够挡住笔记里的脚本执行。哪天要读别人的库，应该换成白名单或直接上 DOMPurify。

---

## 已知限制

1. **首次打开会慢**——要把所有笔记下载到本地缓存。之后靠 sha 比对，只拉变化的文件。
2. **笔记页只读**。网页不能新建、不能编辑、不能删除，全部去 Obsidian 操作。这是刻意的设计。
3. **图片暂时不显示**。私有库的图片需要额外解码。正文里的网络图片（`https://...`）正常。
   也不建议把图片提交进私有库——它会让仓库体积一路上涨，笔记里放外链就够。
4. **没有搜索索引**。全文搜索遍历内存里的笔记，几百篇以内很快，上千篇会变慢。
5. **离线只有学习台**，而且 Service Worker 只缓存 `desk/` 内的文件加一份 `shell.css`——
   断网时学习台本身照常用，顶栏也在，但点顶栏上的「首页 / 笔记」是打不开的。

---

## 这个仓库是公开的：别把真实笔记放进来

`test/fixtures/` 里的笔记**全部是编造的**，用途只是给渲染器提供样本：多列表格、双链、任务列表、frontmatter。

真实笔记请放私有库 `idea-vault`。一旦进了这个仓库，就算后来删掉，`git log` 里也永远查得到。

### 已经有自动检查

`tools/check-public-content.js` 会把私有库里有辨识度的段落做成指纹，比对本次暂存的内容，命中就拒绝提交
（表格行除外——五十音表这类是公共知识，撞行不算）。

```bash
node tools/check-public-content.js     # 手动跑
```

它由 git 钩子自动调用。钩子不随仓库同步，**换电脑或重新 clone 后要装一次**：

```bash
printf '#!/bin/sh\nROOT=$(git rev-parse --show-toplevel)\nnode "$ROOT/tools/check-public-content.js" || exit 1\n' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

误判时临时跳过：`SKIP_PUBLIC_CHECK=1 git commit -m "..."`。
私有库搬家了：`VAULT_DIR="D:/新路径" node tools/check-public-content.js`。

### 顺带两条

- **截图**：`test/*.png` 已在 `.gitignore` 里。别在别处提交带笔记内容的截图。
- **commit message**：别把笔记原文粘进提交说明，它同样永久可见。
