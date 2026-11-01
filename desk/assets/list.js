/*
 * 学习台 —— 清单 / 速记 / 成果
 * 纯前端、零依赖。三份数据都存在本机 localStorage：
 *   study.v2        清单：板块 → 章节 → 条目
 *   study.notes.v1  速记：随手记的碎片（沿用旧版键名，改版不丢草稿）
 *   study.works.v1  成果：对外展示的条目
 */
(function () {
  'use strict';

  /* ================= 常量 ================= */
  var KEY_LIST = 'study.v2';
  var KEY_NOTE = 'study.notes.v1';
  var KEY_WORK = 'study.works.v1';

  var LV = ['未学', '听过', '会用', '能讲'];
  var ALPHA = [0, .3, .62, 1];
  var COLORS = ['#2F5D50', '#9A6B3F', '#3D4F8C', '#C2410C', '#7C3AED', '#0E7490'];
  var VIEWS = { list: 1, scratch: 1, works: 1 };
  var STICK = 46;                    /* 站点顶栏高度，与 --shell-h 保持一致 */

  var here = location.pathname.replace(/[^/]+$/, '');
  var ROOT = here.replace(/desk\/$/, '');        /* 站点根，用来拼笔记链接 */
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= 状态 ================= */
  var list = { v: 2, pillars: [], updated: '' };
  var notes = [];
  var works = [];
  var view = 'list';
  var ui = {
    form: null,        /* 清单里的内联表单 {kind,mode,pid,mid,iid,data} */
    wform: null,       /* 成果表单 {mode,id,data} */
    editing: null,     /* 速记正在改的那条 {id} */
    expand: {},
    flash: null,
    first: true,          /* 清单首次渲染，用来放板块级联入场 */
    worksFirst: true,     /* 成果首次渲染，同理 */
    showArch: false
  };

  /* ================= 存储 ================= */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 坏数据当没有 */ }
    return fallback;
  }

  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { toast('保存失败：浏览器存储可能满了'); return false; }
  }

  function loadAll() {
    var L = read(KEY_LIST, null);
    list = (L && Array.isArray(L.pillars)) ? L : { v: 2, pillars: [], updated: '' };
    if (!list.updated) list.updated = '';

    var N = read(KEY_NOTE, null);
    notes = Array.isArray(N) ? N.filter(function (n) { return n && typeof n.text === 'string'; }) : [];

    var W = read(KEY_WORK, null);
    works = Array.isArray(W) ? W.map(normalizeWork) : [];
  }

  function saveList() {
    list.updated = todayStr();
    write(KEY_LIST, list);
  }
  function saveNotes() { write(KEY_NOTE, notes); }
  function saveWorks() { write(KEY_WORK, works); }

  /* ================= 小工具 ================= */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtDate(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function fmtTime(ts) {
    var d = new Date(ts), diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (new Date().toDateString() === d.toDateString()) return '今天 ' + hm;
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + hm;
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  function shade(hex, a) {
    var n = parseInt(String(hex || '#2F5D50').slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 只放行 http(s) / mailto；没写协议的裸域名自动补 https */
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (/^mailto:/i.test(u)) return u;
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) return 'https://' + u;
    return '';
  }

  function normalizeNote(n) {
    return {
      id: String(n.id || uid()),
      text: String(n.text || ''),
      ts: +n.ts || Date.now(),
      del: n.del ? 1 : 0
    };
  }

  function normalizeWork(w) {
    w = w || {};
    return {
      id: String(w.id || uid()),
      kind: String(w.kind || '项目').slice(0, 8),
      year: String(w.year || new Date().getFullYear()).slice(0, 4),
      title: String(w.title || '(未命名)'),
      desc: String(w.desc || ''),
      tags: Array.isArray(w.tags) ? w.tags.map(String).filter(Boolean).slice(0, 8) : [],
      link: String(w.link || ''),
      ts: +w.ts || Date.now()
    };
  }

  /* ================= 清单：数据操作 ================= */
  function walk(fn) {
    (list.pillars || []).forEach(function (p) {
      (p.modules || []).forEach(function (m) {
        (m.items || []).forEach(function (it) { fn(it, m, p); });
      });
    });
  }
  function findP(id) { return list.pillars.filter(function (p) { return p.id === id; })[0]; }
  function findM(pid, mid) {
    var p = findP(pid);
    return p ? (p.modules || []).filter(function (m) { return m.id === mid; })[0] : null;
  }
  function findI(pid, mid, iid) {
    var m = findM(pid, mid);
    return m ? (m.items || []).filter(function (x) { return x.id === iid; })[0] : null;
  }
  function lvOf(it) { return Math.min(3, Math.max(0, (it && it.lv) || 0)); }

  function tally() {
    var t = { n: 0, m3: 0, m12: 0, m0: 0, sum: 0 };
    walk(function (it) {
      var l = lvOf(it);
      t.n++; t.sum += l;
      if (l === 3) t.m3++; else if (l > 0) t.m12++; else t.m0++;
    });
    t.pct = t.n ? Math.round(t.sum / (t.n * 3) * 100) : 0;
    return t;
  }

  function pctOf(p) {
    var total = 0, sum = 0;
    (p.modules || []).forEach(function (m) {
      (m.items || []).forEach(function (it) { total++; sum += lvOf(it); });
    });
    return total ? Math.round(sum / (total * 3) * 100) : 0;
  }

  /* ================= 数字滚动 ================= */
  function setNum(node, to, animate) {
    var from = node._v == null ? 0 : node._v;
    node._v = to;
    cancelAnimationFrame(node._raf);
    if (!animate || REDUCE || from === to) { node.textContent = to; return; }
    var t0 = performance.now(), dur = 520;
    function step(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      node.textContent = Math.round(from + (to - from) * e);
      if (k < 1) node._raf = requestAnimationFrame(step);
    }
    node._raf = requestAnimationFrame(step);
  }

  /* ================= 路由 ================= */
  function readRoute() {
    var h = decodeURIComponent(location.hash || '').replace(/^#\/?/, '');
    var seg = h.split('?')[0];
    return VIEWS[seg] ? seg : 'list';
  }

  function route() {
    var v = readRoute();
    var changed = v !== view;
    view = v;
    if (changed) { ui.form = null; ui.wform = null; ui.editing = null; }

    renderChrome();
    renderView();
    if (changed && !REDUCE) swapIn();
    if (changed && location.hash) window.scrollTo(0, 0);
    moveTabInd();
  }

  function swapIn() {
    var m = document.getElementById('main');
    m.classList.remove('swap');
    void m.offsetWidth;          /* 强制回流，动画才能从头再放一次 */
    m.classList.add('swap');
    clearTimeout(swapIn._t);
    swapIn._t = setTimeout(function () { m.classList.remove('swap'); }, 520);
  }

  function moveTabInd() {
    var tabs = document.getElementById('tabs');
    var ind = document.getElementById('tabInd');
    var cur = tabs.querySelector('.tab[aria-current]');
    if (!cur || !ind) return;
    ind.style.width = cur.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + cur.offsetLeft + 'px)';
  }

  /* ================= 页面骨架 ================= */
  function noteLive() { return notes.filter(function (n) { return !n.del; }); }
  function noteArch() { return notes.filter(function (n) { return n.del; }); }

  var META = {
    list: {
      kicker: '学习台 · 自己定结构',
      title: '清单',
      foot: '板块 = 大方向（金融 / 外语 / AI…）　章节 = 一本书或一个专题　条目 = 具体要做的事<br>' +
            '点条目右侧三个方块记掌握度：<b>未学 → 听过 → 会用 → 能讲</b>。<br>' +
            '只存在这台浏览器，<b>清缓存会丢</b>，攒一段时间就「备份」存一份。时间投入记在<b>日程管家</b>。'
    },
    scratch: {
      kicker: '学习台 · 随手扔',
      title: '速记',
      foot: '这儿是暂存点，不用管格式，也不用想属于哪一章。<br>' +
            '攒够一批点「导出 .md」，拖进 Obsidian 的 <b>_inbox</b> 再慢慢拆成篇。<br>' +
            '归档只是标记，内容不会丢，随时能翻回来。'
    },
    works: {
      kicker: '学习台 · 对外',
      title: '成果',
      foot: '这一层是给别人看的：做完了什么、凭什么算做完。<br>' +
            '只存在这台浏览器，<b>清缓存会丢</b>，记得「备份」或「导出 content.js」留一份。'
    }
  };

  function renderChrome() {
    var m = META[view];
    document.title = '学习台 · ' + m.title;
    document.getElementById('kicker').textContent = m.kicker;
    document.getElementById('title').textContent = m.title;
    document.getElementById('foot').innerHTML = m.foot;

    var sub, updated;
    if (view === 'list') {
      sub = list.pillars.length
        ? '点方块记掌握度，随时可改。这一页只记「学到哪一步」。'
        : '还没有内容。先建一个板块，再往下加章节和条目。';
      updated = list.updated || '—';
      var t = tally();
      paintStats([
        { l: '总进度', v: t.pct, suffix: '%' },
        { l: '能讲', v: t.m3 },
        { l: '在学', v: t.m12 },
        { l: '未开始', v: t.m0 }
      ], t.n + ' 条 · ' + list.pillars.reduce(function (a, p) { return a + (p.modules || []).length; }, 0) + ' 章节', !ui.first);

    } else if (view === 'scratch') {
      var live = noteLive(), arch = noteArch();
      var today = live.filter(function (n) { return fmtDate(n.ts) === todayStr(); }).length;
      sub = live.length
        ? '随手扔，别管格式。攒够一批导成 Markdown，搬去 Obsidian 整理成篇。'
        : '想到什么先扔进来，一句话也行。之后导成 .md 搬去 Obsidian 整理。';
      updated = live.length ? fmtDate(Math.max.apply(null, live.map(function (n) { return n.ts; }))) : '—';
      paintStats([
        { l: '待整理', v: live.length },
        { l: '今天', v: today },
        { l: '已归档', v: arch.length }
      ], live.length ? '最近一条 ' + fmtTime(Math.max.apply(null, live.map(function (n) { return n.ts; }))) : '还没有草稿', false);

    } else {
      var thisYear = works.filter(function (w) { return w.year === String(new Date().getFullYear()); }).length;
      var withLink = works.filter(function (w) { return !!safeUrl(w.link); }).length;
      sub = works.length
        ? '做完了什么、凭什么算做完。写清判断标准，比写结论有用。'
        : '还没有成果。做成一件事就记一条，年底翻出来就是一份简历。';
      updated = works.length ? fmtDate(Math.max.apply(null, works.map(function (w) { return w.ts; }))) : '—';
      paintStats([
        { l: '全部', v: works.length },
        { l: '今年', v: thisYear },
        { l: '有链接', v: withLink }
      ], works.length ? '覆盖 ' + tagCount() + ' 个标签' : '还没有条目', false);
    }

    document.getElementById('sub').textContent = sub;
    document.getElementById('updated').textContent = updated;

    var tabs = document.getElementById('tabs');
    Array.prototype.forEach.call(tabs.querySelectorAll('.tab'), function (a) {
      if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });

    paintToolbar();
  }

  function tagCount() {
    var s = {};
    works.forEach(function (w) { (w.tags || []).forEach(function (t) { s[t] = 1; }); });
    return Object.keys(s).length;
  }

  function paintStats(defs, tail, animate) {
    var el = document.getElementById('stats');
    var sig = defs.map(function (d) { return d.l + (d.suffix || ''); }).join('|');
    if (el.dataset.sig !== sig) {
      el.innerHTML = defs.map(function (d) {
        return '<div class="stat"><div class="l">' + esc(d.l) + '</div>' +
          '<div class="n"><span class="v">0</span>' + (d.suffix ? '<small>' + esc(d.suffix) + '</small>' : '') +
          '</div></div>';
      }).join('') + '<div class="tail" id="statsTail"></div>';
      el.dataset.sig = sig;
      animate = false;
    }
    var vs = el.querySelectorAll('.stat .v');
    for (var i = 0; i < defs.length; i++) if (vs[i]) setNum(vs[i], defs[i].v, animate);
    var t = document.getElementById('statsTail');
    if (t) t.textContent = tail || '';
  }

  function anyOpen() {
    var open = false;
    list.pillars.forEach(function (p) {
      (p.modules || []).forEach(function (m) { if (ui.expand[p.id + '/' + m.id]) open = true; });
    });
    return open;
  }

  function paintToolbar() {
    var el = document.getElementById('toolbar');
    var html = '';
    if (view === 'list') {
      var has = list.pillars.length > 0;
      html += '<div class="acts-row">' +
        '<button class="btn primary" data-act="addPillar">＋ 新建板块</button>' +
        '<button class="btn" data-act="toggleAll" id="btnAll"' + (has ? '' : ' disabled') + '>' + (anyOpen() ? '全部收起' : '全部展开') + '</button>' +
        '</div><span class="spacer"></span>' +
        '<span class="legend">' + [1, 2, 3].map(function (l) {
          return '<span><i style="background:' + shade('#2F5D50', ALPHA[l]) + '"></i>' + LV[l] + '</span>';
        }).join('') + '</span>' +
        '<div class="acts-row">' +
        '<button class="btn ghost" data-act="exportJs"' + (has ? '' : ' disabled') +
        ' title="生成一份可以直接替换 desk/data/content.js 的文件">导出 content.js</button>' +
        '</div>';
    } else if (view === 'scratch') {
      var live = noteLive().length;
      html += '<div class="acts-row">' +
        '<button class="btn" data-act="exportMd" title="导成 Markdown，可以直接拖进 Obsidian">导出 .md</button>' +
        (live ? '<button class="btn ghost" data-act="archAll">全部归档</button>' : '') +
        (noteArch().length ? '<button class="btn ghost" data-act="toggleArch">' + (ui.showArch ? '收起归档' : '已归档 ' + noteArch().length + ' 条') + '</button>' : '') +
        '</div><span class="spacer"></span>';
    } else {
      html += '<div class="acts-row">' +
        '<button class="btn primary" data-act="addWork">＋ 新建成果</button>' +
        (window.CONTENT && (window.CONTENT.works || []).length
          ? '<button class="btn ghost" data-act="importOldWorks">导入旧版 ' + window.CONTENT.works.length + ' 条</button>' : '') +
        '</div><span class="spacer"></span>';
    }
    html += '<div class="acts-row">' +
      '<button class="btn ghost" data-act="backup" title="把清单、速记、成果一起存成一个 JSON">备份</button>' +
      '<button class="btn ghost" data-act="restore" title="从备份文件恢复">恢复</button>' +
      '</div>';
    el.innerHTML = html;
  }

  function renderView() {
    var main = document.getElementById('main');
    if (view === 'list') renderList(main);
    else if (view === 'scratch') renderScratch(main);
    else renderWorks(main);
    measureScroll();
    paintScroll();
    moveTabInd();
  }

  /* ================= 清单：表单 ================= */
  function formHTML(kind, ctx) {
    var d = (ui.form && ui.form.data) || {};
    var editing = ui.form && ui.form.mode === 'edit';

    if (kind === 'pillar') {
      var picked = d.color || COLORS[0];
      return '<div class="form" data-form="pillar">' +
        '<input class="inp name" data-f="name" placeholder="板块名称，例如：金融" value="' + esc(d.name) + '">' +
        '<span class="dots" data-f="color">' + COLORS.map(function (c) {
          return '<b data-color="' + c + '" style="background:' + c + '" class="' + (c === picked ? 'on' : '') + '"></b>';
        }).join('') + '</span>' +
        '<button class="btn primary" data-submit="pillar">' + (editing ? '保存' : '添加板块') + '</button>' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '</div>';
    }
    if (kind === 'module') {
      return '<div class="form" data-form="module" data-pid="' + ctx.pid + '">' +
        '<input class="inp name" data-f="name" placeholder="章节名称，例如：计量经济学" value="' + esc(d.name) + '">' +
        '<input class="inp mid" data-f="goal" placeholder="目标（可选），例如：能独立跑完一篇实证" value="' + esc(d.goal) + '">' +
        '<button class="btn primary" data-submit="module">' + (editing ? '保存' : '添加章节') + '</button>' +
        '<button class="btn ghost" data-cancel="1">取消</button>' +
        '</div>';
    }
    return '<div class="form" data-form="item" data-pid="' + ctx.pid + '" data-mid="' + ctx.mid + '">' +
      '<input class="inp name" data-f="t" placeholder="要做什么，例如：伍德里奇第 1–3 章" value="' + esc(d.t) + '">' +
      '<input class="inp small" data-f="note" placeholder="判断标准（可选）" value="' + esc(d.note) + '">' +
      '<input class="inp small" data-f="ref" placeholder="笔记路径（可选）" value="' + esc(d.ref) + '">' +
      '<button class="btn primary" data-submit="item">' + (editing ? '保存' : '添加') + '</button>' +
      '<button class="btn ghost" data-cancel="1">取消</button>' +
      '</div>';
  }

  function formFor(kind, pid, mid) {
    var f = ui.form;
    if (!f || f.kind !== kind) return '';
    if (kind === 'pillar') return formHTML('pillar', {});
    if (kind === 'module' && f.pid === pid) return formHTML('module', { pid: pid });
    if (kind === 'item' && f.pid === pid && f.mid === mid) return formHTML('item', { pid: pid, mid: mid });
    return '';
  }

  /* ================= 清单：局部重绘 ================= */
  /* 掌握度变化只改被点的那一行 + 上级进度，绝不动整棵树 —— 这是丝滑的关键 */
  function applyLevel(row, color, lv, pop) {
    var dots = row.querySelectorAll('.lv b');
    for (var i = 0; i < dots.length; i++) {
      var b = dots[i], on = i < lv;
      b.style.transitionDelay = (i * 45) + 'ms';
      b.style.background = on ? shade(color, ALPHA[i + 1]) : 'transparent';
      b.style.borderColor = on ? color : shade(color, .34);
      if (pop && !REDUCE) {
        b.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.32)' }, { transform: 'scale(1)' }],
          { duration: 380, delay: i * 45, easing: 'cubic-bezier(.34,1.56,.64,1)' }
        );
      }
    }
    var u = row.querySelector('.lv u');
    if (u) {
      u.textContent = LV[lv];
      if (pop && !REDUCE) {
        u.animate(
          [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
          { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' }
        );
      }
    }
    setTimeout(function () {
      for (var j = 0; j < dots.length; j++) dots[j].style.transitionDelay = '0ms';
    }, 480);
  }

  /* 展开/收起：给定确切高度让 CSS 补间，结束后交回 auto，内容再多也不会被截断 */
  function setOpen(mEl, open) {
    var box = mEl.querySelector('.items');
    if (!box) return;
    var cur = box.getBoundingClientRect().height;
    box.style.height = cur + 'px';
    void box.offsetHeight;
    if (open) {
      mEl.classList.add('open');
      box.style.height = box.scrollHeight + 'px';
    } else {
      mEl.classList.remove('open');
      box.style.height = '0px';
    }
    clearTimeout(box._settle);
    box._settle = setTimeout(function () {
      box.style.height = open ? 'auto' : '0px';
      measureScroll();
      paintScroll();
    }, REDUCE ? 0 : 460);
  }

  function paintCells(mEl, color, items) {
    var cells = mEl.querySelectorAll('.cells i');
    for (var i = 0; i < cells.length; i++) {
      var it = items[i];
      var l = it ? lvOf(it) : 0;
      cells[i].style.background = (it && l) ? shade(color, ALPHA[l]) : shade(color, .13);
    }
  }

  function paintAggregates(pid) {
    var p = findP(pid);
    if (!p) return;
    var pEl = document.querySelector('.pillar[data-pid="' + pid + '"]');
    if (!pEl) return;

    var total = 0;
    (p.modules || []).forEach(function (m) { (m.items || []).forEach(function () { total++; }); });
    var pct = pctOf(p);
    pEl.querySelector('.p-count').textContent = (p.modules || []).length + ' 章节 · ' + total + ' 条 · ' + pct + '%';
    var bar = pEl.querySelector('.p-bar i');
    if (bar) bar.style.width = pct + '%';

    (p.modules || []).forEach(function (m) {
      var mEl = pEl.querySelector('.m[data-mid="' + m.id + '"]');
      if (!mEl) return;
      var items = m.items || [];
      var done = items.filter(function (it) { return lvOf(it) === 3; }).length;
      paintCells(mEl, p.color, items);
      mEl.querySelector('.m-num').textContent = items.length ? done + '/' + items.length : '—';
    });
  }

  /* ================= 清单：渲染 ================= */
  function renderList(main) {
    if (!list.pillars.length) {
      var opening = ui.form && ui.form.kind === 'pillar';
      var old = oldItemCount();
      main.innerHTML = '<div class="empty"><h2>' + (opening ? '新建第一个板块' : '还没有内容') + '</h2>' +
        (opening
          ? '<p>板块是大方向。之后可以在里面加章节和条目。</p>' + formFor('pillar')
          : '<p>按你自己的学法来：先建板块（金融 / 外语 / AI…），再在板块里加章节（一本书、一个专题），最后往章节里加条目。</p>' +
            '<button class="btn primary" data-act="addPillar">＋ 新建板块</button>' +
            (old ? '<button class="alt" data-act="importOld">或：导入旧版 content.js 里的 ' + old + ' 条，再自己删减</button>' : '')) +
        '</div>';
      ui.first = false;
      return;
    }

    main.innerHTML = formFor('pillar', null, null) + list.pillars.map(function (p, pi) {
      var mods = p.modules || [];
      var total = 0;
      mods.forEach(function (m) { total += (m.items || []).length; });
      var pct = pctOf(p);

      return '<section class="pillar' + (ui.first ? ' enter' : '') + '"' +
        (ui.first ? ' style="--d:' + Math.min(pi, 6) * 70 + '"' : '') +
        ' data-pid="' + p.id + '">' +
        '<div class="p-head">' +
          '<span class="p-dot" style="background:' + p.color + '"></span>' +
          '<span class="p-name">' + esc(p.name) + '</span>' +
          '<span class="p-act">' +
            '<button class="mini" data-act="addModule" data-pid="' + p.id + '">＋ 章节</button>' +
            '<button class="mini" data-act="editPillar" data-pid="' + p.id + '">改</button>' +
            '<button class="mini danger" data-act="delPillar" data-pid="' + p.id + '">删</button>' +
          '</span>' +
          '<span class="p-count">' + mods.length + ' 章节 · ' + total + ' 条 · ' + pct + '%</span>' +
          '<span class="p-bar" style="color:' + p.color + '"><i style="width:' + pct + '%"></i></span>' +
        '</div>' +
        mods.map(function (m) { return moduleHTML(p, m); }).join('') +
        (mods.length || (ui.form && ui.form.kind === 'module' && ui.form.pid === p.id) ? ''
          : '<div class="hintline">还没有章节<button class="mini" data-act="addModule" data-pid="' + p.id + '">＋ 添加章节</button></div>') +
        (ui.form && ui.form.kind === 'module' && ui.form.pid === p.id ? formFor('module', p.id) : '') +
        '</section>';
    }).join('');

    ui.first = false;
    flashNew();
  }

  function moduleHTML(p, m) {
    var items = m.items || [];
    var done = items.filter(function (it) { return lvOf(it) === 3; }).length;
    var open = ui.expand[p.id + '/' + m.id];

    var cells = items.length
      ? items.map(function (it) {
          var l = lvOf(it);
          return '<i style="background:' + (l ? shade(p.color, ALPHA[l]) : shade(p.color, .13)) + '"></i>';
        }).join('')
      : '<i style="background:' + shade(p.color, .13) + '"></i><i style="background:' + shade(p.color, .13) + '"></i><i style="background:' + shade(p.color, .13) + '"></i>';

    var lis = items.map(function (it) {
      var l = lvOf(it);
      /* 三个方块 = 三个等级：听过 / 会用 / 能讲。未学就是全空，所以只放三格 */
      var dots = [0, 1, 2].map(function (d) {
        var on = d < l;
        return '<b data-act="lv" data-pid="' + p.id + '" data-mid="' + m.id + '" data-iid="' + it.id +
          '" data-lv="' + (d + 1) + '"' +
          ' style="background:' + (on ? shade(p.color, ALPHA[d + 1]) : 'transparent') +
          ';border-color:' + (on ? p.color : shade(p.color, .34)) + '" title="' + LV[d + 1] + '"></b>';
      }).join('');

      var ref = it.ref
        ? '<a class="ref" href="' + ROOT + 'notes.html#/n/' + encodeURIComponent(it.ref) + '" target="_blank" rel="noopener">笔记 ↗</a>'
        : '';

      return '<div class="item" data-iid="' + it.id + '">' +
        '<div class="it-top">' +
          '<span class="it-t">' + esc(it.t) + '</span>' +
          ref +
          '<span class="acts">' +
            '<button class="mini" data-act="editItem" data-pid="' + p.id + '" data-mid="' + m.id + '" data-iid="' + it.id + '">改</button>' +
            '<button class="mini danger" data-act="delItem" data-pid="' + p.id + '" data-mid="' + m.id + '" data-iid="' + it.id + '">删</button>' +
          '</span>' +
          '<span class="lv">' + dots + '<u>' + LV[l] + '</u></span>' +
        '</div>' +
        (it.note ? '<div class="it-note">' + esc(it.note) + '</div>' : '') +
        '</div>';
    }).join('');

    return '<div class="m' + (open ? ' open' : '') + '" data-pid="' + p.id + '" data-mid="' + m.id + '">' +
      '<div class="m-head" data-act="toggle" data-pid="' + p.id + '" data-mid="' + m.id + '">' +
        '<span class="chev"></span>' +
        '<span class="m-name">' + esc(m.name) + '</span>' +
        '<span class="m-goal">' + esc(m.goal || '') + '</span>' +
        '<span class="cells">' + cells + '</span>' +
        '<span class="m-num">' + (items.length ? done + '/' + items.length : '—') + '</span>' +
        '<span class="m-act">' +
          '<button class="mini" data-act="addItem" data-pid="' + p.id + '" data-mid="' + m.id + '">＋ 条目</button>' +
          '<button class="mini" data-act="editModule" data-pid="' + p.id + '" data-mid="' + m.id + '">改</button>' +
          '<button class="mini danger" data-act="delModule" data-pid="' + p.id + '" data-mid="' + m.id + '">删</button>' +
        '</span>' +
      '</div>' +
      '<div class="items"' + (open ? ' style="height:auto"' : '') + '><div class="items-in">' + lis +
        (ui.form && ui.form.kind === 'item' && ui.form.pid === p.id && ui.form.mid === m.id ? formFor('item', p.id, m.id) : '') +
        (items.length || (ui.form && ui.form.mid === m.id) ? '' : '<div class="it-note" style="padding:8px 0">还没有条目，点上面的「＋ 条目」加一条。</div>') +
      '</div></div>' +
      '</div>';
  }

  /* 新增的那一条：高亮 + 滑到视野内，让你看得见自己刚加的东西 */
  function flashNew() {
    var f = ui.flash;
    ui.flash = null;
    if (!f) return;
    var n = document.querySelector(
      f.t === 'item' ? '.item[data-iid="' + f.id + '"]'
        : f.t === 'module' ? '.m[data-mid="' + f.id + '"]'
          : '.pillar[data-pid="' + f.id + '"]'
    );
    if (!n) return;
    n.classList.add('is-new');
    n.addEventListener('animationend', function () { n.classList.remove('is-new'); }, { once: true });
    if (f.scroll) n.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
  }

  /* ================= 速记：渲染 ================= */
  function renderScratch(main) {
    var live = noteLive().sort(function (a, b) { return b.ts - a.ts; });
    var arch = noteArch().sort(function (a, b) { return b.ts - a.ts; });
    var editing = ui.editing ? notes.filter(function (n) { return n.id === ui.editing.id; })[0] : null;

    main.innerHTML =
      '<div class="compose' + (editing ? ' editing' : '') + '">' +
        '<textarea id="noteInput" placeholder="记一笔，别管格式…">' + (editing ? esc(editing.text) : '') + '</textarea>' +
        '<div class="compose-bar">' +
          '<span class="compose-hint">' + (editing ? '正在改这一条 · Esc 取消' : 'Ctrl + Enter 保存') + '</span>' +
          '<span class="spacer"></span>' +
          (editing ? '<button class="btn ghost" data-act="cancelEdit">取消</button>' : '') +
          '<button class="btn primary" data-act="saveNote">' + (editing ? '保存修改' : '保存') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="note-list">' +
        (live.length ? live.map(function (n) { return noteHTML(n, false); }).join('')
          : '<div class="empty" style="margin-top:26px;padding:34px 24px"><h2>待整理是空的</h2>' +
            '<p>想到什么就往上写一句。它不用属于哪一章，也不用现在就想明白。</p></div>') +
      '</div>' +
      (arch.length ? '<div class="note-list arch"' + (ui.showArch ? '' : ' hidden') + '>' +
        '<p class="note-cap">已归档 · ' + arch.length + ' 条</p>' +
        arch.map(function (n) { return noteHTML(n, true); }).join('') +
        '</div>' : '');

    if (editing) {
      var inp = document.getElementById('noteInput');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    }
  }

  function noteHTML(n, archived) {
    return '<div class="note" data-nid="' + n.id + '">' +
      '<div class="note-main">' +
        '<div class="note-text">' + esc(n.text) + '</div>' +
        '<div class="note-meta"><span>' + fmtTime(n.ts) + '</span>' +
          (n.upd ? '<span class="dirty">改过</span>' : '') +
        '</div>' +
      '</div>' +
      '<span class="note-act">' +
        (archived
          ? '<button class="mini" data-act="unarchNote" data-nid="' + n.id + '">恢复</button>' +
            '<button class="mini danger" data-act="delNote" data-nid="' + n.id + '">删</button>'
          : '<button class="mini" data-act="editNote" data-nid="' + n.id + '">改</button>' +
            '<button class="mini" data-act="archNote" data-nid="' + n.id + '">归档</button>') +
      '</span>' +
      '</div>';
  }

  /* ================= 成果：渲染 ================= */
  function sortedWorks() {
    return works.slice().sort(function (a, b) {
      var ya = parseInt(a.year, 10) || 0, yb = parseInt(b.year, 10) || 0;
      if (ya !== yb) return yb - ya;
      return b.ts - a.ts;
    });
  }

  function renderWorks(main) {
    var wf = ui.wform;
    var html = wf ? workFormHTML(wf) : '';

    if (!works.length) {
      var old = (window.CONTENT && (window.CONTENT.works || []).length) || 0;
      html += '<div class="empty"><h2>还没有成果</h2>' +
        '<p>做成一件事就记一条：标题、一句话说清「做成了什么」、凭什么算做成。加了之后这里会变成卡片。</p>' +
        '<button class="btn primary" data-act="addWork">＋ 新建成果</button>' +
        (old && !wf ? '<button class="alt" data-act="importOldWorks">或：导入旧版 content.js 里的 ' + old + ' 条，再自己改</button>' : '') +
        '</div>';
      main.innerHTML = html;
      if (wf) focusWorkForm();
      return;
    }

    html += '<section class="works">' + sortedWorks().map(function (w, i) {
      return workHTML(w, i);
    }).join('') + '</section>';
    main.innerHTML = html;
    ui.worksFirst = false;
    if (wf) focusWorkForm();
  }

  function workHTML(w, i) {
    var link = safeUrl(w.link);
    return '<article class="work' + (ui.worksFirst ? ' enter' : '') + '"' +
      (ui.worksFirst ? ' style="--d:' + Math.min(i, 8) * 60 + '"' : '') +
      ' data-wid="' + w.id + '">' +
      '<div class="work-head">' +
        (w.kind ? '<span class="work-kind">' + esc(w.kind) + '</span>' : '') +
        (w.year ? '<span class="work-year">' + esc(w.year) + '</span>' : '') +
      '</div>' +
      '<h3 class="work-title">' + esc(w.title) + '</h3>' +
      (w.desc ? '<p class="work-desc">' + esc(w.desc) + '</p>' : '') +
      ((w.tags || []).length ? '<div class="work-tags">' + w.tags.map(function (t) {
        return '<span class="tag">' + esc(t) + '</span>';
      }).join('') + '</div>' : '') +
      (link ? '<a class="work-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">查看 ↗</a>' : '') +
      '<span class="work-act">' +
        '<button class="mini" data-act="editWork" data-wid="' + w.id + '">改</button>' +
        '<button class="mini danger" data-act="delWork" data-wid="' + w.id + '">删</button>' +
      '</span>' +
      '</article>';
  }

  function workFormHTML(wf) {
    var d = wf.data || {};
    return '<div class="wform" data-wform="1"' + (wf.id ? ' data-wid="' + wf.id + '"' : '') + '>' +
      '<input class="inp c4" data-f="title" placeholder="标题：做成了什么" value="' + esc(d.title) + '">' +
      '<input class="inp c2" data-f="kind" placeholder="类型：项目 / 论文 / 作品" value="' + esc(d.kind || '项目') + '">' +
      '<textarea class="area c6" data-f="desc" placeholder="一句话说清：做了什么、凭什么算做成">' + esc(d.desc) + '</textarea>' +
      '<input class="inp c2" data-f="year" placeholder="年份" value="' + esc(d.year || new Date().getFullYear()) + '">' +
      '<input class="inp c2" data-f="tags" placeholder="标签，逗号分隔" value="' + esc((d.tags || []).join('，')) + '">' +
      '<input class="inp c2" data-f="link" placeholder="链接（可选）" value="' + esc(d.link) + '">' +
      '<div class="wform-foot">' +
        '<span class="compose-hint">Enter 保存 · Esc 取消</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn ghost" data-act="cancelWork">取消</button>' +
        '<button class="btn primary" data-act="saveWork">' + (wf.mode === 'edit' ? '保存' : '添加成果') + '</button>' +
      '</div>' +
      '</div>';
  }

  function focusWorkForm() {
    var f = document.querySelector('.wform .inp');
    if (f) { f.focus(); f.select && f.select(); }
  }

  /* ================= 滚动 ================= */
  var maxScroll = 0;
  function measureScroll() {
    maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function paintScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    if (view === 'list') paintStuck();       /* 先读布局，再写样式，一次回流 */
    var k = maxScroll ? Math.min(1, y / maxScroll) : 0;
    var p = document.getElementById('prog');
    if (p) {
      p.style.width = (k * 100).toFixed(2) + '%';
      p.classList.toggle('on', y > 8 && k > 0.002);
    }
  }

  /* 吸顶态：标题顶到顶栏下沿时打上 .stuck，浮出投影和该板块自己的进度线 */
  function paintStuck() {
    var heads = document.querySelectorAll('.p-head');
    for (var i = 0; i < heads.length; i++) {
      var on = heads[i].getBoundingClientRect().top <= STICK + .5;
      if (on !== heads[i].classList.contains('stuck')) heads[i].classList.toggle('stuck', on);
    }
  }

  window.addEventListener('scroll', paintScroll, { passive: true });
  window.addEventListener('resize', function () {
    measureScroll(); paintScroll(); moveTabInd();
  }, { passive: true });
  window.addEventListener('load', function () { measureScroll(); paintScroll(); moveTabInd(); });
  window.addEventListener('pageshow', function () { measureScroll(); paintScroll(); });

  /* ================= 表单交互 ================= */
  function openForm(kind, opts) {
    ui.form = { kind: kind, mode: opts.mode || 'new', pid: opts.pid, mid: opts.mid, iid: opts.iid, data: opts.data || {} };
    if (kind === 'item') ui.expand[opts.pid + '/' + opts.mid] = true;
    renderView();
    var f = document.querySelector('.form');
    if (f) {
      var inp = f.querySelector('.inp');
      if (inp) { inp.focus(); inp.select && inp.select(); }
    }
  }

  function closeForm() { ui.form = null; renderView(); }

  function submitForm(form) {
    var kind = form.dataset.form;
    var val = {};
    Array.prototype.forEach.call(form.querySelectorAll('.inp'), function (i) { val[i.dataset.f] = i.value.trim(); });

    if (kind === 'pillar') {
      var colorEl = form.querySelector('.dots b.on');
      var color = colorEl ? colorEl.dataset.color : COLORS[0];
      if (!val.name) { toast('板块名称不能为空'); return; }
      if (ui.form.mode === 'edit') {
        var p0 = findP(ui.form.pid);
        p0.name = val.name; p0.color = color;
      } else {
        var newP = { id: uid(), name: val.name, color: color, modules: [] };
        list.pillars.push(newP);
        ui.flash = { t: 'pillar', id: newP.id, scroll: true };
      }
    } else if (kind === 'module') {
      var p = findP(form.dataset.pid);
      if (!val.name) { toast('章节名称不能为空'); return; }
      if (ui.form.mode === 'edit') {
        var m0 = findM(p.id, ui.form.mid);
        m0.name = val.name; m0.goal = val.goal || '';
      } else {
        p.modules = p.modules || [];
        var newM = { id: uid(), name: val.name, goal: val.goal || '', items: [] };
        p.modules.push(newM);
        ui.expand[p.id + '/' + newM.id] = true;
        ui.flash = { t: 'module', id: newM.id, scroll: true };
      }
    } else {
      var m = findM(form.dataset.pid, form.dataset.mid);
      if (!val.t) { toast('条目内容不能为空'); return; }
      if (ui.form.mode === 'edit') {
        var it0 = findI(form.dataset.pid, form.dataset.mid, ui.form.iid);
        it0.t = val.t; it0.note = val.note || ''; it0.ref = val.ref || '';
      } else {
        m.items = m.items || [];
        var newI = { id: uid(), t: val.t, note: val.note || '', ref: val.ref || '', lv: 0 };
        m.items.push(newI);
        ui.flash = { t: 'item', id: newI.id, scroll: true };
      }
    }
    ui.form = null;
    ui.first = false;
    saveList();
    renderChrome();
    renderView();
  }

  function openWorkForm(mode, id) {
    var d = {};
    if (mode === 'edit') {
      var w = works.filter(function (x) { return x.id === id; })[0];
      if (!w) return;
      d = { title: w.title, kind: w.kind, year: w.year, desc: w.desc, tags: w.tags, link: w.link };
    }
    ui.wform = { mode: mode, id: id, data: d };
    renderView();
  }

  function submitWork() {
    var f = document.querySelector('.wform');
    if (!f) return;
    var val = {};
    Array.prototype.forEach.call(f.querySelectorAll('[data-f]'), function (i) { val[i.dataset.f] = i.value.trim(); });
    if (!val.title) { toast('标题不能为空'); return; }
    var tags = String(val.tags || '').split(/[,，、\s]+/).filter(Boolean).slice(0, 8);
    var data = {
      kind: val.kind || '项目',
      year: val.year || String(new Date().getFullYear()),
      title: val.title,
      desc: val.desc || '',
      tags: tags,
      link: val.link || ''
    };
    if (ui.wform.mode === 'edit') {
      var w = works.filter(function (x) { return x.id === ui.wform.id; })[0];
      if (w) { Object.keys(data).forEach(function (k) { w[k] = data[k]; }); }
    } else {
      var nw = normalizeWork(data);
      works.push(nw);
      ui.flash = { t: 'work', id: nw.id, scroll: true };
    }
    ui.wform = null;
    saveWorks();
    renderChrome();
    renderView();
    if (ui.flash && ui.flash.t === 'work') {
      var el = document.querySelector('.work[data-wid="' + ui.flash.id + '"]');
      ui.flash = null;
      if (el) el.classList.add('is-new');
    }
    toast('已保存');
  }

  /* ================= 速记：增改 ================= */
  function saveNote() {
    var inp = document.getElementById('noteInput');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) { toast('写点什么再保存'); inp.focus(); return; }

    if (ui.editing) {
      var n = notes.filter(function (x) { return x.id === ui.editing.id; })[0];
      if (n) { n.text = text; n.upd = Date.now(); }
      ui.editing = null;
      saveNotes();
      renderChrome(); renderView();
      toast('已修改');
      return;
    }
    notes.push({ id: uid(), text: text, ts: Date.now() });
    saveNotes();
    renderChrome(); renderView();
    var again = document.getElementById('noteInput');
    if (again) again.focus();
    toast('已记下');
  }

  function findNote(id) {
    return notes.filter(function (n) { return n.id === id; })[0];
  }

  /* ================= 导出 ================= */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  }

  function exportBackup() {
    var payload = {
      app: 'study.desk',
      v: 2,
      at: new Date().toISOString(),
      list: list,
      notes: notes,
      works: works
    };
    download('学习台备份-' + todayStr() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('已备份：清单 ' + tally().n + ' 条、速记 ' + noteLive().length + ' 条、成果 ' + works.length + ' 条');
  }

  function exportNotesMd() {
    var live = noteLive().sort(function (a, b) { return a.ts - b.ts; });
    if (!live.length) { toast('还没有草稿'); return; }
    var fmt = function (ts) {
      var d = new Date(ts);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
        ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    };
    var head = '---\nsource: 学习台速记\nexported: ' + fmt(Date.now()) + '\ncount: ' + live.length + '\n---\n\n';
    var body = live.map(function (n) {
      return '## ' + fmt(n.ts) + '\n\n' + String(n.text).trim() + '\n';
    }).join('\n');
    download('速记-' + todayStr() + '.md', head + body, 'text/markdown');
    toast('已导出 ' + live.length + ' 条，拖进 Obsidian 的 _inbox 就行');
  }

  function buildContentJs() {
    var vault = /^https?:$/.test(location.protocol) ? location.origin + ROOT : ROOT;
    var out = {
      meta: {
        site: '学习台', owner: '', tagline: '', sub: '',
        updated: list.updated || todayStr(), vault: vault, obsidian: ''
      },
      pillars: list.pillars.map(function (p) {
        return {
          id: p.id, name: p.name, en: '', color: p.color, desc: '',
          modules: (p.modules || []).map(function (m) {
            return {
              id: m.id, name: m.name, goal: m.goal || '', status: '',
              items: (m.items || []).map(function (it) {
                var o = { t: it.t, type: 'practice' };
                if (it.note) o.note = it.note;
                if (it.ref) o.ref = it.ref;
                o.lv = lvOf(it);
                return o;
              })
            };
          })
        };
      }),
      works: sortedWorks().map(function (w) {
        return { title: w.title, kind: w.kind, year: w.year, desc: w.desc, link: w.link, tags: w.tags };
      })
    };
    return '/* 由学习台「导出 content.js」生成，' + todayStr() + ' */\nwindow.CONTENT = ' +
      JSON.stringify(out, null, 2) + ';\n';
  }

  function oldItemCount() {
    var n = 0;
    ((window.CONTENT && window.CONTENT.pillars) || []).forEach(function (p) {
      (p.modules || []).forEach(function (m) { n += (m.items || []).length; });
    });
    return n;
  }

  function importOldList() {
    if (!window.CONTENT) return;
    if (!confirm('把旧版 content.js 的 ' + oldItemCount() + ' 条导入进来？导完可以逐条删。')) return;
    var v2 = { v: 2, pillars: [], updated: '' };
    (window.CONTENT.pillars || []).forEach(function (p) {
      var np = { id: uid(), name: p.name, color: p.color || COLORS[0], modules: [] };
      (p.modules || []).forEach(function (m) {
        np.modules.push({
          id: uid(), name: m.name, goal: m.goal || '',
          items: (m.items || []).map(function (it) {
            return { id: uid(), t: it.t, note: it.note || '', ref: it.ref || '', lv: 0 };
          })
        });
      });
      v2.pillars.push(np);
    });
    list = v2;
    saveList();
    ui.first = true;
    renderChrome(); renderView();
    toast('已导入，可以开始删减');
  }

  function importOldWorks() {
    var src = (window.CONTENT && window.CONTENT.works) || [];
    if (!src.length) return;
    if (!confirm('导入旧版 ' + src.length + ' 条成果？会加在现有 ' + works.length + ' 条后面。')) return;
    src.forEach(function (w) { works.push(normalizeWork(w)); });
    saveWorks();
    ui.worksFirst = true;
    renderChrome(); renderView();
    toast('已导入 ' + src.length + ' 条');
  }

  /* ================= 恢复 ================= */
  function normalizeImport(o) {
    if (!o || typeof o !== 'object') return null;
    var out = {};

    var L = (o.list && Array.isArray(o.list.pillars)) ? o.list
      : (Array.isArray(o.pillars) ? o : null);
    if (L) out.list = { v: 2, pillars: L.pillars, updated: L.updated || '' };

    if (Array.isArray(o.notes)) {
      out.notes = o.notes.filter(function (n) { return n && typeof n.text === 'string'; }).map(normalizeNote);
    }
    if (Array.isArray(o.works)) out.works = o.works.map(normalizeWork);

    return (out.list || out.notes || out.works) ? out : null;
  }

  function applyImport(data) {
    var bits = [];
    if (data.list) bits.push('清单 ' + data.list.pillars.length + ' 个板块');
    if (data.works) bits.push('成果 ' + data.works.length + ' 条');
    if (data.notes) bits.push('速记 ' + data.notes.length + ' 条（合并，不删现有的）');
    if (!confirm('恢复内容：' + bits.join('、') + '。\n清单和成果会被整体覆盖，速记按 id 合并。确定？')) return;

    if (data.list) { list = data.list; saveList(); }
    if (data.works) { works = data.works; saveWorks(); }
    if (data.notes) {
      var have = {};
      notes.forEach(function (n) { have[n.id] = 1; });
      data.notes.forEach(function (n) { if (!have[n.id]) notes.push(n); });
      saveNotes();
    }
    ui.first = true;
    ui.worksFirst = true;
    ui.form = null; ui.wform = null; ui.editing = null;
    renderChrome(); renderView();
    toast('已恢复');
  }

  /* ================= 点击 ================= */
  document.addEventListener('click', function (e) {
    var colorDot = e.target.closest('.dots b');
    if (colorDot) {
      Array.prototype.forEach.call(colorDot.parentNode.querySelectorAll('b'), function (b) { b.classList.remove('on'); });
      colorDot.classList.add('on');
      return;
    }

    var sub = e.target.closest('[data-submit]');
    if (sub) { submitForm(sub.closest('.form')); return; }
    if (e.target.closest('[data-cancel]')) { closeForm(); return; }

    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.dataset.act;
    var pid = el.dataset.pid, mid = el.dataset.mid, iid = el.dataset.iid, nid = el.dataset.nid, wid = el.dataset.wid;

    /* ---- 清单 ---- */
    if (act === 'addPillar') { openForm('pillar', {}); return; }
    if (act === 'addModule') { openForm('module', { pid: pid }); return; }
    if (act === 'addItem') {
      if (ui.form && ui.form.kind === 'item' && ui.form.mid === mid && ui.form.mode === 'new') { closeForm(); return; }
      openForm('item', { pid: pid, mid: mid }); return;
    }
    if (act === 'editPillar') {
      var p = findP(pid);
      openForm('pillar', { pid: pid, mode: 'edit', data: { name: p.name, color: p.color } });
      return;
    }
    if (act === 'editModule') {
      var mm = findM(pid, mid);
      openForm('module', { pid: pid, mid: mid, mode: 'edit', data: { name: mm.name, goal: mm.goal } });
      return;
    }
    if (act === 'editItem') {
      var it = findI(pid, mid, iid);
      openForm('item', { pid: pid, mid: mid, mode: 'edit', iid: iid, data: { t: it.t, note: it.note, ref: it.ref } });
      return;
    }
    if (act === 'delPillar') {
      var pp = findP(pid);
      if (!confirm('删除板块「' + pp.name + '」？里面的章节和条目会一起删掉，不能撤销。')) return;
      list.pillars = list.pillars.filter(function (x) { return x.id !== pid; });
      saveList(); ui.first = false; renderChrome(); renderView(); return;
    }
    if (act === 'delModule') {
      var md = findM(pid, mid);
      if (!confirm('删除章节「' + md.name + '」？里面的条目会一起删掉。')) return;
      var p2 = findP(pid);
      p2.modules = p2.modules.filter(function (x) { return x.id !== mid; });
      saveList(); ui.first = false; renderChrome(); renderView(); return;
    }
    if (act === 'delItem') {
      var ii = findI(pid, mid, iid);
      if (!confirm('删除「' + ii.t + '」？')) return;
      var m2 = findM(pid, mid);
      m2.items = m2.items.filter(function (x) { return x.id !== iid; });
      saveList(); ui.first = false; renderChrome(); renderView(); return;
    }

    /* 记掌握度：只改这一行 + 上级汇总，不重建 DOM */
    if (act === 'lv') {
      var item = findI(pid, mid, iid);
      var want = Math.min(3, Math.max(1, +el.dataset.lv));
      var before = lvOf(item);
      item.lv = (before === want) ? want - 1 : want;
      saveList();
      var row = el.closest('.item');
      if (row) applyLevel(row, findP(pid).color, lvOf(item), true);
      paintAggregates(pid);
      /* 只刷数字，不重建统计条 */
      var t = tally();
      var vs = document.querySelectorAll('#stats .stat .v');
      if (vs.length === 4) {
        setNum(vs[0], t.pct, true); setNum(vs[1], t.m3, true);
        setNum(vs[2], t.m12, true); setNum(vs[3], t.m0, true);
      }
      return;
    }

    /* 展开/收起：只切一个 class + 一个高度，零重绘 */
    if (act === 'toggle') {
      var key = pid + '/' + mid;
      ui.expand[key] = !ui.expand[key];
      var box = el.closest('.m');
      if (box) setOpen(box, !!ui.expand[key]);
      var ba = document.getElementById('btnAll');
      if (ba) ba.textContent = anyOpen() ? '全部收起' : '全部展开';
      return;
    }

    /* 全部展开：逐个错开 28ms，形成瀑布 */
    if (act === 'toggleAll') {
      var open = !anyOpen();
      ui.expand = {};
      Array.prototype.forEach.call(document.querySelectorAll('.m'), function (mEl, i) {
        var k = mEl.dataset.pid + '/' + mEl.dataset.mid;
        if (open) ui.expand[k] = true;
        setTimeout(function () { setOpen(mEl, open); }, Math.min(i, 14) * 28);
      });
      el.textContent = open ? '全部收起' : '全部展开';
      return;
    }

    /* ---- 速记 ---- */
    if (act === 'saveNote') { saveNote(); return; }
    if (act === 'editNote') {
      ui.editing = { id: nid };
      renderView();
      return;
    }
    if (act === 'cancelEdit') { ui.editing = null; renderView(); return; }
    if (act === 'archNote') {
      var na = findNote(nid);
      if (na) { na.del = 1; saveNotes(); }
      ui.editing = null;
      renderChrome(); renderView();
      toast('已归档，工具栏里能翻回来');
      return;
    }
    if (act === 'unarchNote') {
      var nu = findNote(nid);
      if (nu) { delete nu.del; saveNotes(); }
      renderChrome(); renderView();
      toast('已放回待整理');
      return;
    }
    if (act === 'delNote') {
      var nd = findNote(nid);
      if (!nd) return;
      if (!confirm('彻底删掉这条速记？归档只是标记，这个是真的删。')) return;
      notes = notes.filter(function (x) { return x.id !== nid; });
      saveNotes(); renderChrome(); renderView();
      toast('已删除');
      return;
    }
    if (act === 'toggleArch') { ui.showArch = !ui.showArch; renderChrome(); renderView(); return; }
    if (act === 'archAll') {
      var live = noteLive();
      if (!live.length) return;
      if (!confirm('把 ' + live.length + ' 条都归档？内容留在归档里，不会丢。')) return;
      live.forEach(function (n) { n.del = 1; });
      saveNotes(); renderChrome(); renderView();
      toast('已归档 ' + live.length + ' 条');
      return;
    }
    if (act === 'exportMd') { exportNotesMd(); return; }

    /* ---- 成果 ---- */
    if (act === 'addWork') { openWorkForm('new'); return; }
    if (act === 'editWork') { openWorkForm('edit', wid); return; }
    if (act === 'cancelWork') { ui.wform = null; renderView(); return; }
    if (act === 'saveWork') { submitWork(); return; }
    if (act === 'delWork') {
      var w = works.filter(function (x) { return x.id === wid; })[0];
      if (!w) return;
      if (!confirm('删除成果「' + w.title + '」？')) return;
      works = works.filter(function (x) { return x.id !== wid; });
      saveWorks(); renderChrome(); renderView();
      return;
    }
    if (act === 'importOldWorks') { importOldWorks(); return; }

    /* ---- 公共 ---- */
    if (act === 'exportJs') { download('content.js', buildContentJs(), 'text/javascript'); return; }
    if (act === 'backup') { exportBackup(); return; }
    if (act === 'restore') { document.getElementById('file').click(); return; }
    if (act === 'importOld') { importOldList(); return; }
  });

  /* ================= 键盘 ================= */
  document.addEventListener('keydown', function (e) {
    /* 速记：Ctrl/Cmd + Enter 保存 */
    if (e.target.id === 'noteInput') {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveNote(); return; }
      if (e.key === 'Escape' && ui.editing) { ui.editing = null; renderView(); return; }
      return;
    }

    /* 成果表单：Enter 保存（textarea 除外） */
    if (ui.wform) {
      if (e.key === 'Escape') { ui.wform = null; renderView(); return; }
      if (e.key === 'Enter' && e.target.closest('.wform') && e.target.tagName === 'INPUT') {
        e.preventDefault(); submitWork(); return;
      }
    }

    /* 清单内联表单 */
    if (!ui.form) return;
    if (e.key === 'Escape') { closeForm(); return; }
    if (e.key === 'Enter' && e.target.classList.contains('inp')) {
      var form = e.target.closest('.form');
      if (form) submitForm(form);
    }
  });

  /* ================= 恢复文件 ================= */
  document.getElementById('file').addEventListener('change', function (e) {
    var f = e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var data = normalizeImport(JSON.parse(r.result));
        if (!data) throw new Error('没认出这是学习台的备份');
        applyImport(data);
      } catch (err) { toast('恢复失败：' + err.message); }
    };
    r.readAsText(f);
    e.target.value = '';
  });

  /* ================= 启动 ================= */
  loadAll();
  route();
  window.addEventListener('hashchange', route);

  /* 装到桌面用：断网也能开 */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 注册失败就当普通网页用 */ });
    });
  }
})();
