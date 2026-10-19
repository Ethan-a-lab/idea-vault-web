/* ============================================================
   app.js — 应用主逻辑
   结构：
     1. 状态与存储
     2. 同步（拉仓库 → 解析 → 建索引 → 建反向链接）
     3. 侧栏（文件树 / 标签 / 搜索）
     4. 主区（列表 / 阅读 / 编辑）
     5. 右栏（大纲 / 文档信息）
     6. 命令面板 · 快速切换 · 设置
     7. 事件绑定 · 启动
   ============================================================ */
(function (IV) {
  'use strict';

  var MD = IV.MD, GH = IV.GH;

  /* ========== 0. 小工具 ========== */

  function $(id) { return document.getElementById(id); }
  function esc(s) { return MD.esc(s); }
  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }
  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, isErr ? 4200 : 2200);
  }

  // 字数统计：中文按字，英文按词
  function countWords(text) {
    var s = String(text || '').replace(/```[\s\S]*?```/g, ' ');
    var cn = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
    var en = (s.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9_'-]+/g) || []).length;
    return cn + en;
  }

  // 从 md 里抽纯文本摘要（给列表卡片用）
  function excerptOf(raw, n) {
    var t = String(raw || '').replace(/^---[\s\S]*?\n---\n?/, '');
    t = t.replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_`>#~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return t.slice(0, n || 110);
  }

  function fmtDate(d) {
    if (!d) return '';
    var s = String(d);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    return s.slice(0, 16);
  }

  function pickDate(fm, file) {
    var keys = ['saved', 'date', 'created', 'imported', 'updated', 'time'];
    for (var i = 0; i < keys.length; i++) {
      if (fm && fm[keys[i]]) return fmtDate(fm[keys[i]]);
    }
    return '';
  }

  /* ========== 1. 状态与存储 ========== */

  var S = {
    cfg: { owner: '', repo: '', branch: 'main', path: '', token: '' },
    theme: 'dark',
    hardBreak: true,
    props: 'full',     // full | compact | hidden —— 笔记顶部的属性面板
    readonly: false,   // 只读模式：隐藏网页端的编辑/新建/保存入口
    files: [],
    docs: {},          // path -> { raw, parsed, sha }
    backlinks: {},     // targetPath -> [{ from, ctx }]
    linkIndex: {},     // name(小写) -> path
    current: '',       // 当前打开的文件路径
    mode: 'read',      // read | edit
    view: 'lib',       // lib | note
    query: '',
    side: 'files',
    tagFilter: '',
    openDirs: {},
    syncing: false,
    lastSync: 0
  };

  var LS_CFG = 'iv:cfg';
  var LS_UI = 'iv:ui';
  // 旧版（视频卡片那版）用的键名，升级时把配置搬过来，免得让人重填一次令牌
  var LS_CFG_OLD = 'idea-vault-cfg-v1';

  function loadLocal() {
    try {
      var c = JSON.parse(localStorage.getItem(LS_CFG) || '{}');
      if (c && typeof c === 'object') S.cfg = Object.assign(S.cfg, c);
    } catch (e) { }
    try {
      var u = JSON.parse(localStorage.getItem(LS_UI) || '{}');
      if (u) {
        if (u.theme) S.theme = u.theme;
        if (typeof u.hardBreak === 'boolean') S.hardBreak = u.hardBreak;
        if (u.props) S.props = u.props;
        if (typeof u.readonly === 'boolean') S.readonly = u.readonly;
        if (u.openDirs) S.openDirs = u.openDirs;
        if (u.side) S.side = u.side;
      }
    } catch (e) { }

    // 从旧版搬家：只在没配置过的情况下搬，不覆盖用户后来改的
    if (!S.cfg.token) {
      try {
        var old = JSON.parse(localStorage.getItem(LS_CFG_OLD) || '{}');
        if (old && old.owner && old.repo && old.token) {
          S.cfg.owner = old.owner;
          S.cfg.repo = old.repo;
          S.cfg.branch = old.branch || 'main';
          // 旧版只读 videos 子目录；新版要读整个库，所以这里故意留空不继承
          S.cfg.path = '';
          S.cfg.token = old.token;
          saveCfg();
          return true;
        }
      } catch (e) { }
    }
    return false;
  }

  function saveCfg() {
    try { localStorage.setItem(LS_CFG, JSON.stringify(S.cfg)); } catch (e) { }
  }
  function saveUI() {
    try {
      localStorage.setItem(LS_UI, JSON.stringify({
        theme: S.theme, hardBreak: S.hardBreak, props: S.props,
        readonly: S.readonly,
        openDirs: S.openDirs, side: S.side
      }));
    } catch (e) { }
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.theme);
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', S.theme === 'dark' ? '#1e1e1e' : '#ffffff');
  }

  // 只读模式：藏起网页端的写入入口（写入仍可用 Obsidian）
  function applyReadonly() {
    var ro = S.readonly;
    var nb = $('btnNew');
    if (nb) nb.style.display = ro ? 'none' : '';
    var me = document.querySelector('#modeSwitch [data-mode="edit"]');
    if (me) me.style.display = ro ? 'none' : '';
    var mbe = document.querySelector('#mobileBar [data-act="edit"]');
    if (mbe) mbe.style.display = ro ? 'none' : '';
  }

  /* ========== 2. 同步 ========== */

  async function sync(force) {
    if (!S.cfg.token) { showWelcome(); return; }
    if (S.syncing) return;
    S.syncing = true;
    setStatus('同步中…');

    GH.configure(S.cfg);
    try {
      var files = await GH.listTree();
      var notes = files.filter(function (f) { return f.type === 'note'; });

      // 只取没缓存过的（readMany 内部按 sha 查缓存）
      var rawMap = await GH.readMany(notes, function (done, total) {
        if (total > 12) setStatus('读取 ' + done + '/' + total);
      });

      // 重建索引
      S.files = files;
      S.docs = {};
      S.linkIndex = {};
      notes.forEach(function (f) {
        var raw = rawMap[f.path];
        if (typeof raw !== 'string') return;
        S.docs[f.path] = {
          raw: raw,
          sha: f.sha,
          parsed: MD.render(raw, { hardBreak: S.hardBreak })
        };
        S.linkIndex[f.path.toLowerCase()] = f.path;
        S.linkIndex[f.path.replace(/\.md$/i, '').toLowerCase()] = f.path;
        var base = f.name.replace(/\.md$/i, '').toLowerCase();
        if (!S.linkIndex[base]) S.linkIndex[base] = f.path;
        // Obsidian 里大家习惯用标题写双链，文件名却常带日期前缀，
        // 所以 title 也建一份索引，否则 [[示例：这条可以删掉]] 永远解析不到
        var t = String(S.docs[f.path].parsed.title || '').toLowerCase().trim();
        if (t && !S.linkIndex[t]) S.linkIndex[t] = f.path;
      });

      buildBacklinks();
      S.lastSync = Date.now();

      var cached = Object.keys(S.docs).length;
      setStatus(cached + ' 篇 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      $('connDot').className = 'dot-ok';
      $('vaultLabel').textContent = S.cfg.repo || 'vault';

      renderSidebar();
      renderMain();
      if (force) toast('已同步 ' + cached + ' 篇笔记');
    } catch (e) {
      console.error(e);
      setStatus('同步失败');
      $('connDot').className = 'dot-off';
      if (e.status === 401 || e.status === 403 || e.status === 404) {
        toast(e.message, true);
        openSettings();
      } else {
        toast(e.message || '同步失败', true);
        renderMain();
      }
    } finally {
      S.syncing = false;
    }
  }

  function setStatus(t) {
    var s = $('syncStatus');
    if (s) s.textContent = t;
  }

  // 解析 [[链接]] → 实际文件路径
  function resolveLink(name) {
    if (!name) return null;
    var key = String(name).trim().replace(/\.md$/i, '').toLowerCase();
    if (S.linkIndex[key]) return S.linkIndex[key];
    // 只给了文件名的情况
    var base = key.split('/').pop();
    if (S.linkIndex[base]) return S.linkIndex[base];
    // 模糊：后缀匹配
    var found = null;
    Object.keys(S.linkIndex).some(function (k) {
      if (k.endsWith('/' + key) || k.endsWith('/' + base)) { found = S.linkIndex[k]; return true; }
      return false;
    });
    return found;
  }

  function buildBacklinks() {
    S.backlinks = {};
    Object.keys(S.docs).forEach(function (path) {
      var doc = S.docs[path];
      var links = doc.parsed.links || [];
      links.forEach(function (target) {
        var tp = resolveLink(target);
        if (!tp || tp === path) return;
        if (!S.backlinks[tp]) S.backlinks[tp] = [];
        // 抓上下文：原文里含该链接的那一行
        var ctx = '';
        var re = new RegExp('\\[\\[\\s*' + escapeRe(target) + '[^\\]]*\\]\\]');
        var lines = doc.raw.split('\n');
        for (var i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) {
            ctx = lines[i].replace(/^[\s>#*-]+/, '').slice(0, 150);
            break;
          }
        }
        S.backlinks[tp].push({ from: path, ctx: ctx });
      });
    });
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* ========== 3. 侧栏 ========== */

  function renderSidebar() {
    var box = $('sideScroll');
    if (!box) return;

    document.querySelectorAll('.side-tab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.side === S.side);
    });

    if (S.side === 'tags') { renderTagPanel(box); return; }

    if (!S.cfg.token) {
      box.innerHTML = '<div class="rb-empty" style="padding:20px 16px">还没连接仓库</div>';
      return;
    }
    if (!S.files.length) {
      box.innerHTML = '<div class="rb-empty" style="padding:20px 16px">' +
        (S.syncing ? '正在读取…' : '仓库里还没有笔记') + '</div>';
      return;
    }

    var q = S.query.trim();
    if (q) { renderSearchResults(box, q); return; }
    renderTree(box);
  }

  function renderSearchResults(box, q) {
    var lowered = q.toLowerCase();
    var hits = [];
    Object.keys(S.docs).forEach(function (path) {
      var d = S.docs[path];
      var title = d.parsed.title || path;
      var inTitle = title.toLowerCase().indexOf(lowered) >= 0;
      var inBody = d.raw.toLowerCase().indexOf(lowered) >= 0;
      if (!inTitle && !inBody) return;
      // 摘要：取命中位置附近
      var ctx = '';
      if (inBody) {
        var idx = d.raw.toLowerCase().indexOf(lowered);
        var start = Math.max(0, idx - 34);
        ctx = d.raw.slice(start, idx + 60).replace(/\s+/g, ' ');
      }
      hits.push({ path: path, title: title, ctx: ctx, score: inTitle ? 2 : 1 });
    });
    hits.sort(function (a, b) { return b.score - a.score || a.title.localeCompare(b.title, 'zh'); });

    if (!hits.length) {
      box.innerHTML = '<div class="rb-empty" style="padding:20px 16px">没有匹配「' + esc(q) + '」的笔记</div>';
      return;
    }
    box.innerHTML = '<div class="side-section-title">' + hits.length + ' 条结果</div>' +
      '<div class="note-list">' + hits.map(function (h) {
        return '<div class="note-item' + (h.path === S.current ? ' active' : '') + '" data-open="' +
          esc(h.path) + '"><div class="t">' + hl(h.title, q) + '</div>' +
          (h.ctx ? '<div class="p">' + hl(esc(h.ctx), q) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
  }

  // 搜索词高亮
  function hl(text, q) {
    if (!q) return text;
    var safe = escapeRe(q);
    return text.replace(new RegExp('(' + safe + ')', 'gi'), '<mark style="background:var(--mark-bg);color:inherit">$1</mark>');
  }

  function renderTree(box) {
    var notes = S.files.filter(function (f) { return f.type === 'note'; });
    var root = { dirs: {}, notes: [] };

    notes.forEach(function (f) {
      var parts = f.path.split('/');
      var node = root;
      for (var i = 0; i < parts.length - 1; i++) {
        var name = parts[i];
        if (!node.dirs[name]) node.dirs[name] = { dirs: {}, notes: [], name: name };
        node = node.dirs[name];
      }
      node.notes.push(f);
    });

    var html = '<div class="tree">';
    html += walkTree(root, 0);
    html += '</div>';
    box.innerHTML = html;

    // 顶层散落的笔记也给个分组
    function walkTree(node, depth) {
      var out = '';
      var dirNames = Object.keys(node.dirs).sort(function (a, b) { return a.localeCompare(b, 'zh'); });
      dirNames.forEach(function (dn) {
        var d = node.dirs[dn];
        var key = depth + ':' + dn;
        var isOpen = S.openDirs[key] !== false;   // 默认展开
        out += '<div class="tree-node dir" data-dir="' + esc(key) + '" style="padding-left:' +
          (8 + depth * 12) + 'px">' +
          '<span class="twisty' + (isOpen ? ' open' : '') + '">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>' +
          '</span>' +
          '<span class="ico"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg></span>' +
          '<span class="label">' + esc(dn) + '</span></div>';
        if (isOpen) out += walkTree(d, depth + 1);
      });
      var sorted = node.notes.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
      sorted.forEach(function (f) {
        var d = S.docs[f.path];
        var title = (d && d.parsed.title) || f.name.replace(/\.md$/i, '');
        out += '<div class="tree-node' + (f.path === S.current ? ' active' : '') +
          '" data-open="' + esc(f.path) + '" style="padding-left:' + (8 + depth * 12 + 12) + 'px">' +
          '<span class="twisty"></span>' +
          '<span class="ico"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg></span>' +
          '<span class="label">' + esc(title) + '</span></div>';
      });
      return out;
    }
  }

  function renderTagPanel(box) {
    var counts = {};
    Object.keys(S.docs).forEach(function (p) {
      (S.docs[p].parsed.tags || []).forEach(function (t) {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    var tags = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!tags.length) {
      box.innerHTML = '<div class="rb-empty" style="padding:20px 16px">笔记里还没有 #标签</div>';
      return;
    }
    box.innerHTML = '<div class="side-section-title">' + tags.length + ' 个标签</div>' +
      '<div class="tag-list">' + tags.map(function (t) {
        return '<div class="tag-row' + (S.tagFilter === t ? ' on' : '') + '" data-tag="' + esc(t) + '">' +
          '<span class="hash">#</span><span>' + esc(t) + '</span>' +
          '<span class="cnt">' + counts[t] + '</span></div>';
      }).join('') + '</div>';
  }

  /* ========== 4. 主区 ========== */

  function renderMain() {
    var body = $('mainBody');
    if (!body) return;

    // 只读模式下永远不进编辑态
    if (S.readonly && S.mode === 'edit') S.mode = 'read';

    // 顶栏面包屑 + 模式按钮
    document.querySelectorAll('#modeSwitch button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.mode === S.mode);
    });
    $('modeSwitch').style.display = S.view === 'note' ? 'flex' : 'none';
    $('btnOutline').style.display = S.view === 'note' && !isMobile() ? 'grid' : 'none';

    if (!S.cfg.token) { showWelcome(); return; }

    if (S.view === 'note' && S.current && S.docs[S.current]) {
      if (S.mode === 'edit') renderEditor(body);
      else renderNote(body, S.current);
    } else {
      renderLibrary(body);
    }
  }

  function showWelcome() {
    S.view = 'lib';
    $('crumbs').innerHTML = '';
    $('modeSwitch').style.display = 'none';
    $('btnOutline').style.display = 'none';
    $('outline').innerHTML = '<div class="rb-empty">—</div>';
    $('rbInfo').innerHTML = '';
    $('mainBody').innerHTML =
      '<div class="empty">' +
      '<div class="big">📖</div>' +
      '<h2>还没有连接到笔记库</h2>' +
      '<p>这个网页本身什么都不存。它只是在你的浏览器里，<br>用你的令牌去读那个私有仓库。</p>' +
      '<div class="steps">' +
      '<div>① 点下面的按钮，填 GitHub 用户名和仓库名</div>' +
      '<div>② 粘贴 fine-grained token（只勾这一个库的 Contents 读写）</div>' +
      '<div>③ 保存后会看到左侧出现完整的文件树</div>' +
      '</div>' +
      '<button class="btn primary" id="welcomeConnect">去连接仓库</button>' +
      '<p style="margin-top:22px;font-size:12px">数据永远在你的仓库里。清掉浏览器缓存也不会丢。</p>' +
      '</div>';
    var b = $('welcomeConnect');
    if (b) b.onclick = openSettings;
  }

  function renderLibrary(body) {
    var notes = Object.keys(S.docs).map(function (p) { return { path: p, doc: S.docs[p] }; });
    if (S.tagFilter) {
      notes = notes.filter(function (n) { return (n.doc.parsed.tags || []).indexOf(S.tagFilter) >= 0; });
    }
    notes.sort(function (a, b) {
      var da = pickDate(a.doc.parsed.frontmatter, a.path);
      var db = pickDate(b.doc.parsed.frontmatter, b.path);
      if (da && db && da !== db) return db.localeCompare(da);
      return (a.doc.parsed.title || a.path).localeCompare(b.doc.parsed.title || b.path, 'zh');
    });

    var title = S.tagFilter ? '#' + S.tagFilter : '全部笔记';
    var sub = notes.length + ' 篇' +
      (S.tagFilter ? ' · <a href="#" data-tag-clear style="color:var(--accent)">清除筛选</a>' : '') +
      ' · 数据来自 ' + esc(S.cfg.owner + '/' + S.cfg.repo);

    var html = '<div class="lib-view"><h1>' + esc(title) + '</h1><div class="sub">' + sub + '</div>';
    if (!notes.length) {
      html += '<div class="rb-empty" style="padding:30px 0">这个筛选下没有笔记</div>';
    } else {
      html += '<div class="card-grid">';
      notes.forEach(function (n) {
        var p = n.doc.parsed;
        var tags = (p.tags || []).slice(0, 3);
        html += '<div class="note-card" data-open="' + esc(n.path) + '">' +
          '<div class="ct">' + esc(p.title || n.path) + '</div>' +
          '<div class="cx">' + esc(excerptOf(n.doc.raw, 105)) + '</div>' +
          '<div class="cm">' +
          (n.path.indexOf('/') >= 0 ? '<span>' + esc(n.path.split('/')[0]) + '</span>' : '') +
          (pickDate(p.frontmatter, n.path) ? '<span>' + esc(pickDate(p.frontmatter, n.path)) + '</span>' : '') +
          tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') +
          '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    body.innerHTML = html;
    body.scrollTop = 0;

    $('crumbs').innerHTML = '<b>' + esc(title) + '</b>';
    $('outline').innerHTML = '<div class="rb-empty">打开一篇笔记后<br>这里显示大纲</div>';
    $('rbInfo').innerHTML = '<b>' + notes.length + '</b> 篇笔记<br><b>' +
      S.files.length + '</b> 个文件';
  }

  function renderNote(body, path) {
    var doc = S.docs[path];
    var p = doc.parsed;
    var fm = p.frontmatter || {};

    var html = '<div class="reader">';

    // 属性面板：完整 / 折叠一行 / 不显示
    var propKeys = Object.keys(fm).filter(function (k) {
      if (k === 'title') return false;
      var v = fm[k];
      return v !== '' && v !== null && !(Array.isArray(v) && !v.length);
    });
    if (propKeys.length && S.props !== 'hidden') {
      html += S.props === 'compact'
        ? compactPropsHtml(propKeys, fm)
        : fullPropsHtml(propKeys, fm);
    }

    html += '<h1 class="note-title">' + esc(p.title || path.replace(/\.md$/i, '')) + '</h1>';

    var metaBits = [];
    metaBits.push(esc(path));
    metaBits.push(countWords(doc.raw) + ' 字');
    var d = pickDate(fm, path);
    if (d) metaBits.push(d);
    html += '<div class="note-sub">' + metaBits.join('<span style="opacity:.4">·</span>') + '</div>';

    html += '<div class="md" id="mdBody">' + p.html + '</div>';

    // 反向链接
    var bl = S.backlinks[path] || [];
    if (bl.length) {
      html += '<div class="backlinks" id="backlinks"><div class="bl-title">被 ' + bl.length + ' 篇笔记引用</div>';
      bl.forEach(function (b) {
        var t = (S.docs[b.from] && S.docs[b.from].parsed.title) || b.from;
        html += '<div class="bl-item" data-open="' + esc(b.from) + '">' +
          '<div class="bl-t">' + esc(t) + '</div>' +
          (b.ctx ? '<div class="bl-x">' + esc(b.ctx) + '</div>' : '') + '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    body.innerHTML = html;
    body.scrollTop = 0;

    // 面包屑
    var parts = path.split('/');
    $('crumbs').innerHTML = parts.map(function (x, i) {
      var t = esc(x.replace(/\.md$/i, ''));
      return i === parts.length - 1 ? '<b>' + t + '</b>' : t;
    }).join(' / ');

    // 折叠状态下的属性条：点一下就地展开
    var fold = body.querySelector('#propsFold');
    if (fold) {
      fold.onclick = function () {
        var tmp = document.createElement('div');
        tmp.innerHTML = fullPropsHtml(propKeys, fm);
        fold.replaceWith(tmp.firstElementChild);
      };
    }

    // 后处理：给未解析的双链打标记
    body.querySelectorAll('.wikilink').forEach(function (a) {
      if (!resolveLink(a.dataset.wikilink)) a.classList.add('missing');
    });

    // 后处理：表格比屏幕宽时给一条滑动提示，滚到最右自动淡出
    body.querySelectorAll('.table-wrap').forEach(function (w) {
      if (w.scrollWidth <= w.clientWidth + 4) return;
      var hint = document.createElement('div');
      hint.className = 'table-hint';
      hint.textContent = '← 左右滑动查看整张表 →';
      w.insertAdjacentElement('afterend', hint);
      w.addEventListener('scroll', function () {
        if (w.scrollLeft + w.clientWidth >= w.scrollWidth - 8) hint.style.opacity = '0';
      }, { passive: true });
    });

    renderOutline(p.headings || [], path);
    renderDocInfo(path, doc);
    highlightTree();
  }

  var LABELS = {
    title: '标题', tags: '标签', date: '日期', created: '创建', saved: '收藏于',
    imported: '导入', updated: '更新', author: '作者', url: '链接', source: '来源',
    platform: '平台', status: '状态', type: '类型', duration: '时长',
    my_take: '我的想法', take: '想法', category: '分类', topic: '主题'
  };
  function labelOf(k) { return LABELS[k] || k; }

  function renderPropVal(v, key) {
    if (Array.isArray(v)) {
      return v.map(function (x) {
        if (key === 'tags' || key === 'tag') {
          return '<span class="pchip" data-tag="' + esc(x) + '">' + esc(x) + '</span>';
        }
        return '<span class="pchip">' + esc(x) + '</span>';
      }).join('');
    }
    var s = String(v);
    if (/^https?:\/\//i.test(s)) {
      return '<a href="' + esc(s) + '" target="_blank" rel="noopener noreferrer">' + esc(s) + '</a>';
    }
    if (key === 'tags' || key === 'tag') {
      return s.split(/[,，\s]+/).filter(Boolean).map(function (x) {
        return '<span class="pchip" data-tag="' + esc(x) + '">' + esc(x) + '</span>';
      }).join('');
    }
    return esc(s);
  }

  // 完整的属性表格
  function fullPropsHtml(keys, fm) {
    var h = '<div class="props">';
    keys.forEach(function (k) {
      h += '<div class="prop"><div class="prop-k">' + esc(labelOf(k)) + '</div>' +
        '<div class="prop-v">' + renderPropVal(fm[k], k) + '</div></div>';
    });
    return h + '</div>';
  }

  // 折叠成一行摘要，点一下展开成完整表格
  function compactPropsHtml(keys, fm) {
    var parts = [];
    keys.slice(0, 3).forEach(function (k) {
      var v = fm[k];
      if (Array.isArray(v)) v = v.join('、');
      var s = String(v).replace(/^https?:\/\//i, '');
      if (s.length > 24) s = s.slice(0, 24) + '…';
      parts.push(labelOf(k) + ' ' + s);
    });
    var more = keys.length > 3 ? ' 等 ' + keys.length + ' 项' : '';
    return '<div class="props-fold" id="propsFold" title="点击展开全部属性">' +
      '<span class="pf-txt">' + esc(parts.join(' · ') + more) + '</span>' +
      '<span class="pf-more">展开</span></div>';
  }

  /* ---------- 编辑器 ---------- */

  function renderEditor(body) {
    var path = S.current;
    var doc = S.docs[path];
    var isNew = !doc;
    var raw = doc ? doc.raw : defaultTemplate(path);

    body.innerHTML =
      '<div class="editor-wrap">' +
      '<div class="editor-bar">' +
      '<span>' + (isNew ? '新建：' : '编辑：') + esc(path) + '</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn" id="edCancel">返回阅读</button>' +
      '<button class="btn primary" id="edSave">保存到仓库</button>' +
      '</div>' +
      '<textarea class="editor-area" id="edArea" spellcheck="false"></textarea>' +
      '</div>';

    var ta = $('edArea');
    ta.value = raw;

    /* ---------- [[ 双链自动补全 ---------- */
    var ac = { open: false, items: [], idx: 0, start: 0, query: '' };

    // 清掉上一次编辑残留的弹层
    document.querySelectorAll('.ac-pop').forEach(function (n) { n.remove(); });
    var acPop = document.createElement('div');
    acPop.className = 'ac-pop';
    acPop.hidden = true;
    document.body.appendChild(acPop);

    // 候选池：每个 .md 一条，显示标题，插入文件名
    var AC_ALL = (S.files || []).filter(function (f) {
      return /\.md$/i.test(f.name || '');
    }).map(function (f) {
      var name = String(f.name).replace(/\.md$/i, '');
      var d = S.docs[f.path];
      var title = (d && d.parsed && d.parsed.title || '').trim();
      return { label: title || name, insert: name, hint: f.dir || '' };
    });

    function acDetect() {
      var caret = ta.selectionStart;
      var before = ta.value.slice(Math.max(0, caret - 80), caret);
      var m = before.match(/(^|[^\[])(\[\[)([^\[\]\n]*)$/);
      if (!m) return null;
      return { query: m[3], start: caret - m[3].length - 2 };
    }

    // 用镜像元素算光标像素位置（textarea 没有原生 API）
    function caretPoint(el) {
      try {
        var cs = getComputedStyle(el);
        var m = document.createElement('div');
        var props = ['boxSizing', 'width', 'borderTopWidth', 'borderRightWidth',
          'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight',
          'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight',
          'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign',
          'textTransform', 'textIndent', 'textDecoration', 'letterSpacing',
          'wordSpacing', 'tabSize'];
        for (var i = 0; i < props.length; i++) m.style[props[i]] = cs[props[i]];
        m.style.position = 'absolute';
        m.style.visibility = 'hidden';
        m.style.top = '0';
        m.style.left = '-9999px';
        m.style.whiteSpace = 'pre-wrap';
        m.style.wordWrap = 'break-word';
        m.style.overflow = 'hidden';
        m.textContent = el.value.slice(0, el.selectionStart);
        var span = document.createElement('span');
        span.textContent = el.value.slice(el.selectionStart) || '.';
        m.appendChild(span);
        document.body.appendChild(m);
        var rect = el.getBoundingClientRect();
        var lineH = parseInt(cs.lineHeight, 10) || 20;
        var out = {
          left: rect.left + span.offsetLeft - el.scrollLeft,
          top: rect.top + span.offsetTop - el.scrollTop + lineH + 4,
          lineH: lineH
        };
        document.body.removeChild(m);
        return out;
      } catch (e) { return null; }
    }

    function acPlace() {
      var r = acPop.getBoundingClientRect();
      var w = r.width || 280, h = r.height || 160;
      var p = caretPoint(ta), left, top;
      if (p) {
        left = p.left;
        top = p.top;
        // 下方放不下就翻到光标上方
        if (top + h > window.innerHeight - 8) top = p.top - h - p.lineH - 10;
      } else {
        var tr = ta.getBoundingClientRect();
        left = tr.left + 16;
        top = tr.top + 44;
      }
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
      acPop.style.left = left + 'px';
      acPop.style.top = top + 'px';
    }

    function acRender() {
      if (!ac.open) { acPop.hidden = true; return; }
      acPop.innerHTML = ac.items.length
        ? ac.items.map(function (it, i) {
            return '<div class="ac-item' + (i === ac.idx ? ' on' : '') + '" data-ai="' + i + '">' +
              '<span class="ac-t">' + esc(it.label) + '</span>' +
              (it.hint ? '<span class="ac-d">' + esc(it.hint) + '</span>' : '') +
              '</div>';
          }).join('')
        : '<div class="ac-empty">没有匹配的笔记，直接输入文件名也能连</div>';
      acPop.hidden = false;
      acPlace();
      var on = acPop.querySelector('.ac-item.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    }

    function acClose() {
      ac.open = false;
      acPop.hidden = true;
    }

    function acRefresh() {
      var hit = acDetect();
      if (!hit) { acClose(); return; }
      var q = hit.query;
      var scored = AC_ALL.map(function (it) {
        var sc = fuzzyScore(q, it.label);
        if (!sc) sc = fuzzyScore(q, it.insert) * 0.7;
        return { it: it, sc: sc };
      }).filter(function (x) { return x.sc > 0 || !q; });
      scored.sort(function (a, b) { return b.sc - a.sc; });
      ac.items = scored.slice(0, 6).map(function (x) { return x.it; });
      ac.idx = 0;
      ac.start = hit.start;
      ac.query = q;
      ac.open = true;
      acRender();
    }

    function acAccept() {
      var it = ac.items[ac.idx];
      if (!it) { acClose(); return; }
      var caret = ta.selectionStart;
      var insert = '[[' + it.insert + ']]';
      ta.value = ta.value.slice(0, ac.start) + insert + ta.value.slice(caret);
      var pos = ac.start + insert.length;
      ta.selectionStart = ta.selectionEnd = pos;
      acClose();
      ta.focus();
    }

    ta.addEventListener('input', acRefresh);
    ta.addEventListener('click', function () { setTimeout(acRefresh, 0); });
    ta.addEventListener('blur', function () { setTimeout(acClose, 150); });
    acPop.addEventListener('mousedown', function (e) { e.preventDefault(); });
    acPop.addEventListener('click', function (e) {
      var it = e.target.closest('[data-ai]');
      if (!it) return;
      e.preventDefault();
      ac.idx = +it.dataset.ai;
      acAccept();
    });

    // Tab 插入两个空格；弹层打开时接管方向键 / 回车 / Tab / Esc
    ta.addEventListener('keydown', function (e) {
      if (ac.open) {
        var n = Math.max(1, ac.items.length);
        if (e.key === 'ArrowDown') { e.preventDefault(); ac.idx = (ac.idx + 1) % n; acRender(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); ac.idx = (ac.idx - 1 + n) % n; acRender(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acAccept(); return; }
        if (e.key === 'Escape') { e.preventDefault(); acClose(); return; }
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        var s = ta.selectionStart, t = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(t);
        ta.selectionStart = ta.selectionEnd = s + 2;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        doSave();
      }
    });

    $('edCancel').onclick = function () {
      if (ta.value !== raw && !confirm('改动还没保存，确定放弃？')) return;
      S.mode = 'read';
      renderMain();
    };
    $('edSave').onclick = doSave;

    var saving = false;
    async function doSave() {
      if (saving) return;
      var content = ta.value;
      if (!content.trim()) { toast('内容为空，没保存', true); return; }
      saving = true;
      var btn = $('edSave');
      btn.disabled = true;
      btn.textContent = '保存中…';
      try {
        // 先取最新 sha：Obsidian 那边可能也刚改过
        var sha = null;
        try {
          var remote = await GH.getFile(path);
          sha = remote.sha;
        } catch (e) {
          if (e.status !== 404) throw e;
        }
        await GH.putFile(path, content, sha, (sha ? '更新 ' : '新建 ') + path);
        // 更新本地
        S.docs[path] = {
          raw: content, sha: null,
          parsed: MD.render(content, { hardBreak: S.hardBreak })
        };
        var f = S.files.filter(function (x) { return x.path === path; })[0];
        if (f) f.sha = null;
        buildBacklinks();
        S.mode = 'read';
        toast('已保存到 GitHub');
        renderSidebar();
        renderMain();
        // 后台悄悄补一次 sha
        sync(false);
      } catch (err) {
        console.error(err);
        toast(err.message || '保存失败', true);
        btn.disabled = false;
        btn.textContent = '保存到仓库';
      } finally {
        saving = false;
      }
    }
  }

  function defaultTemplate(path) {
    var name = path.split('/').pop().replace(/\.md$/i, '');
    var today = new Date();
    var d = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');
    return '---\ntitle: ' + name + '\ntags: []\ndate: ' + d + '\n---\n\n';
  }

  /* ---------- 右栏 ---------- */

  function renderOutline(headings, path) {
    var box = $('outline');
    if (!headings.length) {
      box.innerHTML = '<div class="rb-empty">这篇没有小标题</div>';
      return;
    }
    box.innerHTML = headings.map(function (h) {
      return '<div class="ol-item l' + Math.min(h.level, 4) + '" data-hid="' + esc(h.id) + '">' +
        esc(h.text.replace(/[*`_~]/g, '')) + '</div>';
    }).join('');

    box.querySelectorAll('.ol-item').forEach(function (it) {
      it.onclick = function () {
        var target = document.getElementById(it.dataset.hid);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (isMobile()) closeDrawers();
      };
    });
  }

  // 滚动时高亮当前小节
  var spyLock = false;
  function onScrollSpy() {
    if (S.view !== 'note' || S.mode !== 'read') return;
    if (spyLock) return;
    spyLock = true;
    requestAnimationFrame(function () {
      spyLock = false;
      var body = $('mainBody');
      var heads = body.querySelectorAll('.md .md-h');
      if (!heads.length) return;
      var top = body.getBoundingClientRect().top + 80;
      var currentId = null;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top <= top) currentId = heads[i].id;
        else break;
      }
      $('outline').querySelectorAll('.ol-item').forEach(function (it) {
        it.classList.toggle('on', it.dataset.hid === currentId);
      });
    });
  }

  function renderDocInfo(path, doc) {
    var p = doc.parsed;
    var links = p.links || [];
    var bl = S.backlinks[path] || [];
    var tags = p.tags || [];
    $('rbInfo').innerHTML =
      '<b>路径</b><br>' + esc(path) + '<br>' +
      '<b>字数</b> ' + countWords(doc.raw) + '<br>' +
      '<b>标题</b> ' + (p.headings || []).length + ' 个<br>' +
      '<b>出链</b> ' + links.length + ' · <b>被引</b> ' + bl.length + '<br>' +
      (tags.length ? '<b>标签</b> ' + tags.map(function (t) { return '#' + esc(t); }).join(' ') : '');
  }

  function highlightTree() {
    document.querySelectorAll('#sideScroll .tree-node').forEach(function (n) {
      n.classList.toggle('active', n.dataset.open === S.current);
    });
    document.querySelectorAll('#sideScroll .note-item').forEach(function (n) {
      n.classList.toggle('active', n.dataset.open === S.current);
    });
  }

  /* ========== 5. 导航 ========== */

  function openNote(path, fromHash) {
    if (!S.docs[path]) {
      // 可能是图片或不存在
      if (/\.md$/i.test(path)) toast('笔记还没加载完，稍等一下', true);
      return;
    }
    S.current = path;
    S.view = 'note';
    S.mode = 'read';
    if (!fromHash) setHash('#/n/' + encodeURIComponent(path));
    renderSidebar();
    renderMain();
    if (isMobile()) closeDrawers();
  }

  function openLibrary() {
    S.view = 'lib';
    S.current = '';
    setHash('#/');
    renderSidebar();
    renderMain();
    if (isMobile()) closeDrawers();
  }

  function setHash(h) {
    if (location.hash === h) return;
    try { history.pushState(null, '', h); } catch (e) { location.hash = h; }
  }

  function readHash() {
    var h = decodeURIComponent(location.hash || '');
    var m = h.match(/^#\/n\/(.+)$/);
    if (m && S.docs[m[1]]) {
      S.current = m[1];
      S.view = 'note';
      return true;
    }
    return false;
  }

  /* ========== 6. 命令面板 / 快速切换 ========== */

  var paletteMode = 'cmd';       // cmd | note
  var paletteItems = [];
  var paletteIdx = 0;

  var COMMANDS = [
    { id: 'new', title: '新建笔记', hint: 'Ctrl+N', run: newNote },
    { id: 'all', title: '打开全部笔记', run: openLibrary },
    { id: 'sync', title: '同步（重新拉取仓库）', hint: 'Ctrl+R', run: function () { sync(true); } },
    { id: 'edit', title: '编辑当前笔记', hint: 'Ctrl+E', run: function () { if (S.current) { S.mode = 'edit'; renderMain(); } } },
    { id: 'theme', title: '切换主题（暗 / 亮）', run: toggleTheme },
    { id: 'copy', title: '复制当前笔记路径', run: copyPath },
    { id: 'settings', title: '连接设置', run: openSettings },
    { id: 'print', title: '打印 / 存成 PDF', run: function () { window.print(); } }
  ];

  function openPalette(mode) {
    paletteMode = mode || 'cmd';
    var ov = $('ovPalette');
    ov.classList.add('open');
    var input = $('paletteInput');
    input.value = mode === 'note' ? '' : '';
    input.placeholder = mode === 'note' ? '搜索并跳转笔记…' : '输入命令，或以 > 开头搜索笔记…';
    paletteIdx = 0;
    buildPalette('');
    input.focus();
  }

  function closePalette() {
    $('ovPalette').classList.remove('open');
  }

  function fuzzyScore(q, text) {
    if (!q) return 1;
    var lower = text.toLowerCase(), ql = q.toLowerCase();
    if (lower.indexOf(ql) >= 0) return 100 - lower.indexOf(ql);
    // 子序列匹配
    var ti = 0, score = 0;
    for (var i = 0; i < ql.length; i++) {
      var found = lower.indexOf(ql[i], ti);
      if (found < 0) return 0;
      score += found === ti ? 3 : 1;
      ti = found + 1;
    }
    return score;
  }

  function buildPalette(q) {
    var items = [];
    var onlyNotes = paletteMode === 'note' || q.trim().startsWith('>');
    var qq = onlyNotes && q.trim().startsWith('>') ? q.trim().slice(1).trim() : q.trim();

    if (!onlyNotes) {
      COMMANDS.forEach(function (c) {
        if (S.readonly && (c.id === 'new' || c.id === 'edit')) return;
        var sc = fuzzyScore(qq, c.title);
        if (sc > 0) items.push({ type: 'cmd', title: c.title, hint: c.hint || '', score: sc + 50, run: c.run });
      });
    }

    Object.keys(S.docs).forEach(function (p) {
      var d = S.docs[p];
      var title = d.parsed.title || p;
      var sc = fuzzyScore(qq, title) || fuzzyScore(qq, p) * 0.6;
      if (sc > 0) items.push({ type: 'note', title: title, hint: p, score: sc, path: p });
    });

    items.sort(function (a, b) { return b.score - a.score; });
    items = items.slice(0, 40);

    if (!items.length) {
      $('paletteList').innerHTML = '<div class="pal-empty">没有匹配结果</div>';
      paletteItems = [];
      return;
    }

    paletteItems = items;
    paletteIdx = Math.min(paletteIdx, items.length - 1);
    $('paletteList').innerHTML = items.map(function (it, i) {
      var ico = it.type === 'cmd'
        ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 17 6-6-6-6M12 19h8"/></svg>'
        : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>';
      return '<div class="pal-item' + (i === paletteIdx ? ' on' : '') + '" data-pi="' + i + '">' +
        '<span class="pi-ico">' + ico + '</span>' +
        '<span class="pi-t">' + esc(it.title) + '</span>' +
        (it.hint ? '<span class="pi-d">' + esc(it.hint) + '</span>' : '') + '</div>';
    }).join('');
  }

  function runPaletteItem(i) {
    var it = paletteItems[i];
    if (!it) return;
    closePalette();
    if (it.type === 'cmd') it.run();
    else openNote(it.path);
  }

  function movePalette(delta) {
    if (!paletteItems.length) return;
    paletteIdx = (paletteIdx + delta + paletteItems.length) % paletteItems.length;
    document.querySelectorAll('#paletteList .pal-item').forEach(function (n, i) {
      n.classList.toggle('on', i === paletteIdx);
      if (i === paletteIdx) n.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ========== 7. 设置 ========== */

  function openSettings() {
    var c = S.cfg;
    $('cfgOwner').value = c.owner || '';
    $('cfgRepo').value = c.repo || '';
    $('cfgBranch').value = c.branch || 'main';
    $('cfgPath').value = c.path || '';
    $('cfgToken').value = c.token || '';
    $('cfgMsg').textContent = '';
    $('cfgMsg').className = 'msg';
    document.querySelectorAll('#segTheme button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.theme === S.theme);
    });
    document.querySelectorAll('#segBreak button').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.break === '1') === S.hardBreak);
    });
    document.querySelectorAll('#segProps button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.props === S.props);
    });
    document.querySelectorAll('#segReadonly button').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.ro === '1') === !!S.readonly);
    });
    $('ovSettings').classList.add('open');
    setTimeout(function () { $('cfgOwner').focus(); }, 60);
  }

  function closeSettings() {
    $('ovSettings').classList.remove('open');
  }

  function toggleTheme() {
    S.theme = S.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    saveUI();
    toast(S.theme === 'dark' ? '暗色' : '亮色');
  }

  function copyPath() {
    if (!S.current) { toast('没有打开的笔记', true); return; }
    var text = S.current;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制：' + text); },
        function () { toast('复制失败，路径是：' + text); });
    } else {
      toast('路径：' + text);
    }
  }

  /* ---------- 新建笔记 ---------- */

  var promptCb = null;
  function askText(title, placeholder, value, cb) {
    $('promptInput').placeholder = placeholder || '';
    $('promptInput').value = value || '';
    $('promptMsg').textContent = title || '';
    $('promptMsg').className = 'msg';
    promptCb = cb;
    $('ovPrompt').classList.add('open');
    setTimeout(function () { $('promptInput').focus(); }, 60);
  }
  function closePrompt() { $('ovPrompt').classList.remove('open'); promptCb = null; }

  function newNote() {
    if (S.readonly) { toast('当前是只读模式，无法新建', true); return; }
    askText('文件名，可以用 目录/文件名 放到子目录', '例如：日语/动词变形', '', function (v) {
      var name = String(v || '').trim().replace(/^\/+/, '');
      if (!name) return false;
      if (!/\.md$/i.test(name)) name += '.md';
      if (S.docs[name] || S.files.some(function (f) { return f.path === name; })) {
        $('promptMsg').textContent = '这个路径已经存在了，换个名字';
        $('promptMsg').className = 'msg err';
        return false;
      }
      S.current = name;
      S.view = 'note';
      S.mode = 'edit';
      renderMain();
      return true;
    });
  }

  /* ========== 8. 抽屉 / 移动端 ========== */

  function openDrawer(which) {
    closeDrawers();
    if (which === 'sidebar') $('sidebar').classList.add('open');
    if (which === 'rightbar') $('rightbar').classList.add('open');
    $('scrim').classList.add('show');
  }
  function closeDrawers() {
    $('sidebar').classList.remove('open');
    $('rightbar').classList.remove('open');
    $('scrim').classList.remove('show');
  }

  function checkViewport() {
    var m = isMobile();
    $('btnMenu').style.display = m ? 'grid' : 'none';
    $('btnOutline').style.display = (m || S.view !== 'note') ? 'none' : 'grid';
  }

  /* ========== 9. 事件绑定 ========== */

  function bind() {
    // 侧栏：库名 / 同步 / 设置
    $('vaultName').onclick = openSettings;
    $('btnSync').onclick = function () { sync(true); };
    $('btnSettings').onclick = openSettings;
    $('btnNew').onclick = newNote;

    // 搜索
    var input = $('searchInput');
    input.addEventListener('input', debounce(function () {
      S.query = input.value;
      $('searchBox').classList.toggle('has-value', !!input.value);
      renderSidebar();
    }, 180));
    $('searchClear').onclick = function () {
      input.value = ''; S.query = '';
      $('searchBox').classList.remove('has-value');
      renderSidebar(); input.focus();
    };

    // 侧栏 tab
    document.querySelectorAll('.side-tab').forEach(function (b) {
      b.onclick = function () {
        S.side = b.dataset.side;
        saveUI();
        renderSidebar();
      };
    });

    // 侧栏点击：笔记 / 目录 / 标签
    $('sideScroll').addEventListener('click', function (e) {
      var t = e.target.closest('[data-open]');
      if (t) { openNote(t.dataset.open); return; }
      var dir = e.target.closest('[data-dir]');
      if (dir) {
        var k = dir.dataset.dir;
        S.openDirs[k] = S.openDirs[k] === false;
        saveUI();
        renderSidebar();
        return;
      }
      var tag = e.target.closest('[data-tag]');
      if (tag) {
        S.tagFilter = tag.dataset.tag;
        S.view = 'lib'; S.current = '';
        renderSidebar(); renderMain();
        if (isMobile()) closeDrawers();
      }
    });

    // 主区点击
    $('mainBody').addEventListener('click', function (e) {
      var wl = e.target.closest('.wikilink');
      if (wl) {
        e.preventDefault();
        var p = resolveLink(wl.dataset.wikilink);
        if (p) openNote(p);
        else toast('库里还没有「' + wl.dataset.wikilink + '」这篇', true);
        return;
      }
      var tag = e.target.closest('.md-tag, [data-tag]');
      if (tag && tag.dataset.tag) {
        S.tagFilter = tag.dataset.tag;
        S.view = 'lib'; S.current = '';
        setHash('#/');
        renderSidebar(); renderMain();
        return;
      }
      var open = e.target.closest('[data-open]');
      if (open) { openNote(open.dataset.open); return; }
      var clr = e.target.closest('[data-tag-clear]');
      if (clr) {
        e.preventDefault();
        S.tagFilter = '';
        renderMain(); renderSidebar();
      }
    });

    // 滚动 -> 大纲高亮
    $('mainBody').addEventListener('scroll', debounce(onScrollSpy, 60), { passive: true });

    // 顶栏
    $('btnMenu').onclick = function () { openDrawer('sidebar'); };
    $('btnOutline').onclick = function () { openDrawer('rightbar'); };
    document.querySelectorAll('#modeSwitch button').forEach(function (b) {
      b.onclick = function () {
        if (!S.current) return;
        if (b.dataset.mode === 'edit' && S.readonly) { toast('当前是只读模式，请到设置里切换', true); return; }
        S.mode = b.dataset.mode;
        renderMain();
      };
    });

    $('scrim').onclick = closeDrawers;

    // 底部工具栏
    $('mobileBar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      document.querySelectorAll('#mobileBar button').forEach(function (x) { x.classList.toggle('on', x === b); });
      if (act === 'lib') openLibrary();
      if (act === 'tree') openDrawer('sidebar');
      if (act === 'outline') openDrawer('rightbar');
      if (act === 'edit') {
        if (S.readonly) { toast('当前是只读模式', true); return; }
        if (!S.current) { toast('先打开一篇笔记', true); return; }
        S.mode = 'edit'; renderMain();
      }
    });

    // 命令面板
    $('paletteInput').addEventListener('input', function (e) {
      paletteIdx = 0;
      buildPalette(e.target.value);
    });
    $('paletteInput').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(paletteIdx); }
      else if (e.key === 'Escape') { closePalette(); }
    });
    $('paletteList').addEventListener('click', function (e) {
      var it = e.target.closest('[data-pi]');
      if (it) runPaletteItem(+it.dataset.pi);
    });
    $('ovPalette').addEventListener('click', function (e) {
      if (e.target === $('ovPalette')) closePalette();
    });

    // 设置
    $('btnCancelSettings').onclick = closeSettings;
    $('ovSettings').addEventListener('click', function (e) {
      if (e.target === $('ovSettings')) closeSettings();
    });
    document.querySelectorAll('#segTheme button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#segTheme button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        S.theme = b.dataset.theme;
        applyTheme();
      };
    });
    document.querySelectorAll('#segBreak button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#segBreak button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        S.hardBreak = b.dataset.break === '1';
      };
    });

    document.querySelectorAll('#segProps button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#segProps button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        S.props = b.dataset.props;
        saveUI();
        // 立即生效，关掉设置就能看到
        if (S.view === 'note') renderMain();
      };
    });

    document.querySelectorAll('#segReadonly button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#segReadonly button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        S.readonly = b.dataset.ro === '1';
        saveUI();
        applyReadonly();
        // 正开着编辑器时切到只读，立刻退回阅读态
        if (S.readonly && S.mode === 'edit') { S.mode = 'read'; }
        if (S.view === 'note') renderMain();
      };
    });

    $('btnSaveSettings').onclick = async function () {
      var msg = $('cfgMsg');
      var btn = $('btnSaveSettings');
      var cfg = {
        owner: $('cfgOwner').value.trim(),
        repo: $('cfgRepo').value.trim(),
        branch: $('cfgBranch').value.trim() || 'main',
        path: $('cfgPath').value.trim(),
        token: $('cfgToken').value.trim()
      };
      if (!cfg.owner || !cfg.repo || !cfg.token) {
        msg.textContent = '用户名、仓库名、令牌都要填';
        msg.className = 'msg err';
        return;
      }
      btn.disabled = true;
      msg.textContent = '验证中…';
      msg.className = 'msg';
      try {
        GH.configure(cfg);
        var info = await GH.verify();
        S.cfg = cfg;
        saveCfg();
        saveUI();
        msg.textContent = '连接成功：' + info.repo;
        msg.className = 'msg ok';
        setTimeout(closeSettings, 500);
        await sync(false);
      } catch (e) {
        msg.textContent = e.message || '连接失败';
        msg.className = 'msg err';
      } finally {
        btn.disabled = false;
      }
    };

    $('btnClearCache').onclick = async function () {
      if (!confirm('清空本地缓存后，下次会重新从 GitHub 下载全部笔记。确定？')) return;
      await GH.clearCache();
      toast('缓存已清空');
    };

    $('btnLogout').onclick = async function () {
      if (!confirm('将从这台设备清除令牌和已缓存的笔记，之后要重新填令牌才能看。\n\n注意：这不会吊销 GitHub 上的令牌。要彻底作废请到 GitHub 设置里删除。\n\n确定继续？')) return;
      try { await GH.clearCache(); } catch (e) { }
      try {
        localStorage.removeItem(LS_CFG);
        localStorage.removeItem(LS_CFG_OLD);
      } catch (e) { }
      // 内存里的配置与状态一并清空
      S.cfg = { owner: '', repo: '', branch: 'main', path: '', token: '' };
      try { GH.configure({ owner: '', repo: '', branch: 'main', path: '', token: '' }); } catch (e) { }
      S.files = []; S.docs = {}; S.backlinks = {}; S.linkIndex = {};
      S.current = ''; S.mode = 'read'; S.view = 'lib'; S.tagFilter = ''; S.query = '';
      if ($('searchInput')) $('searchInput').value = '';
      if ($('searchBox')) $('searchBox').classList.remove('has-value');
      closeSettings();
      showWelcome();
      renderSidebar();
      toast('已清除本地令牌');
    };

    // 通用输入框
    $('promptCancel').onclick = closePrompt;
    $('promptOk').onclick = function () {
      var ok = promptCb && promptCb($('promptInput').value);
      if (ok !== false) closePrompt();
    };
    $('promptInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('promptOk').click(); }
      if (e.key === 'Escape') closePrompt();
    });
    $('ovPrompt').addEventListener('click', function (e) {
      if (e.target === $('ovPrompt')) closePrompt();
    });

    // 键盘
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); openPalette('cmd'); return; }
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openPalette('note'); return; }
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isMobile()) openDrawer('sidebar');
        $('searchInput').focus();
        return;
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (S.readonly) { toast('当前是只读模式', true); return; }
        if (S.current) { S.mode = S.mode === 'edit' ? 'read' : 'edit'; renderMain(); }
        return;
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (S.readonly) { toast('当前是只读模式', true); return; }
        newNote();
        return;
      }
      if (mod && e.key.toLowerCase() === 'r') { e.preventDefault(); sync(true); return; }
      if (e.key === 'Escape') {
        closePalette(); closeSettings(); closePrompt(); closeDrawers();
      }
    });

    // 窗口尺寸变化
    window.addEventListener('resize', debounce(function () {
      checkViewport();
      if (!isMobile()) closeDrawers();
    }, 150));

    // 浏览器前进后退（pushState 只触发 popstate，不触发 hashchange）
    function onHistory() {
      if (readHash()) { renderSidebar(); renderMain(); }
      else {
        S.view = 'lib'; S.current = ''; S.mode = 'read';
        renderSidebar(); renderMain();
      }
    }
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);
  }

  /* ========== 10. 启动 ========== */

  function boot() {
    var migrated = loadLocal();
    applyTheme();
    checkViewport();
    bind();
    applyReadonly();

    if (!S.cfg.token) {
      showWelcome();
      renderSidebar();
    } else {
      GH.configure(S.cfg);
      $('vaultLabel').textContent = S.cfg.repo || 'vault';
      // 先把骨架显示出来，再去拉数据
      S.view = 'lib';
      $('mainBody').innerHTML = '<div class="empty"><div class="big">⏳</div>' +
        '<h2>正在读取仓库</h2><p>第一次打开要把笔记下载到本地缓存，<br>之后就是秒开。</p></div>';
      renderSidebar();
      readHash();
      sync(false).then(function () {
        if (readHash()) renderMain();
        if (migrated) setTimeout(function () {
          toast('已沿用之前填过的配置，不用重填令牌');
        }, 600);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  IV.app = { sync: sync, openNote: openNote, state: S };
})(window.IV);
