/* 学习台 —— 纯前端，无依赖，数据来自 data/content.js */
(function () {
  "use strict";

  const DATA = window.CONTENT;
  if (!DATA || !Array.isArray(DATA.pillars)) {
    document.getElementById("app").innerHTML =
      '<div class="empty">没有读到 data/content.js，请确认文件存在。</div>';
    return;
  }

  const STORE_KEY = "study.done.v1";
  const TYPE_LABEL = {
    book: "书", course: "课", paper: "论文",
    practice: "练习", tool: "工具", note: "笔记"
  };

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function pct(a, b) {
    return b ? Math.round((a / b) * 100) : 0;
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2000);
  }

  /* ---------- 进度存储 ---------- */
  let done = new Set();
  let canStore = true;

  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) JSON.parse(raw).forEach((k) => done.add(k));
  } catch (e) {
    canStore = false;
  }

  function save() {
    if (!canStore) { toast("浏览器禁用了本地存储，这次勾选不会被保留"); return; }
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify([...done]));
    } catch (e) {
      toast("保存失败，可能是浏览器限制");
    }
  }

  const keyOf = (pid, mid, i) => pid + "|" + mid + "|" + i;

  /* ---------- 索引与统计 ---------- */
  const PILLAR = {};
  DATA.pillars.forEach((p) => { PILLAR[p.id] = p; });

  function stats(pillar) {
    let total = 0, fin = 0;
    pillar.modules.forEach((m) => {
      total += m.items.length;
      m.items.forEach((_, i) => {
        if (done.has(keyOf(pillar.id, m.id, i))) fin++;
      });
    });
    return { total, fin };
  }

  function moduleStats(pillar, mod) {
    let fin = 0;
    mod.items.forEach((_, i) => {
      if (done.has(keyOf(pillar.id, mod.id, i))) fin++;
    });
    return { total: mod.items.length, fin };
  }

  /* ---------- 渲染：首页 ---------- */
  function renderHome() {
    const app = document.getElementById("app");
    let gt = 0, gf = 0;
    DATA.pillars.forEach((p) => {
      const s = stats(p);
      gt += s.total; gf += s.fin;
    });

    const cards = DATA.pillars.map((p) => {
      const s = stats(p);
      const n = p.modules.reduce((a, m) => a + m.items.length, 0);
      return `
      <a class="pillar" href="#/p/${p.id}">
        <div class="pillar-top">
          <span class="dot" style="background:${p.color}"></span>
          <span class="pillar-name">${esc(p.name)}</span>
          <span class="pillar-en">${esc(p.en)}</span>
        </div>
        <p class="pillar-desc">${esc(p.desc)}</p>
        <div class="pillar-meta">
          <span>${p.modules.length} 模块 · ${n} 条</span>
          <span class="track"><span class="fill" style="width:${pct(s.fin, s.total)}%;background:${p.color}"></span></span>
          <span>${pct(s.fin, s.total)}%</span>
        </div>
      </a>`;
    }).join("");

    const pending = notes.filter((n) => !n.del).length;

    app.innerHTML = `
      <section class="hero">
        <p class="kicker">${esc(DATA.meta.owner)} · 个人学习索引</p>
        <h1>${esc(DATA.meta.tagline)}</h1>
        <p class="sub">${esc(DATA.meta.sub)}</p>
        <div class="total">
          <span class="track"><span class="fill" style="width:${pct(gf, gt)}%"></span></span>
          <span>全部 ${gt} 条，已完成 ${gf} 条 · ${pct(gf, gt)}%</span>
        </div>
      </section>
      ${pending ? `<a class="pending-bar" href="#/notes">
        <span>速记里攒了 <b>${pending}</b> 条没整理</span>
        <span class="pending-go">去导出 →</span>
      </a>` : ""}
      <section class="pillars">${cards}</section>`;

    document.getElementById("foot-note").textContent =
      "进度和草稿存在本机浏览器，清缓存会丢；速记可导出 .md 搬进 Obsidian。内容最后更新：" + DATA.meta.updated;
  }

  /* ---------- 渲染：支柱页 ---------- */
  function renderPillar(pid) {
    const p = PILLAR[pid];
    if (!p) return renderNotFound();

    const mods = p.modules.map((m) => {
      const s = moduleStats(p, m);
      const badge = m.status === "进行中"
        ? `<span class="badge live" style="color:${p.color}">进行中</span>`
        : `<span class="badge">${esc(m.status || "待启动")}</span>`;
      return `
      <a class="module" href="#/p/${p.id}/m/${m.id}">
        <div class="module-top">
          <span class="module-name">${esc(m.name)}</span>
          ${badge}
        </div>
        <p class="module-goal">${esc(m.goal)}</p>
        <div class="module-foot">
          <span>${s.fin}/${s.total}</span>
          <span class="track"><span class="fill" style="width:${pct(s.fin, s.total)}%;background:${p.color}"></span></span>
          <span>${pct(s.fin, s.total)}%</span>
        </div>
      </a>`;
    }).join("");

    document.getElementById("app").innerHTML = `
      <header class="page-head">
        <a class="back" href="#/">← 返回三根柱子</a>
        <h1><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</h1>
        <p class="lead">${esc(p.desc)}</p>
      </header>
      <section class="modules">${mods}</section>`;

    document.getElementById("foot-note").textContent =
      "进度和草稿存在本机浏览器，清缓存会丢；速记可导出 .md 搬进 Obsidian。";
  }

  /* ---------- 笔记链接 ----------
   * 电脑上你用的是 Obsidian，所以配了库名就直接唤起本地 Obsidian；
   * 没配就退回网页版笔记库（手机上用这个）。
   */
  function noteHref(ref) {
    const ob = ((DATA.meta && DATA.meta.obsidian) || "").trim();
    const base = (ref || "").replace(/\.md$/i, "");
    if (ob) {
      // 逐段编码，保留 / 作为路径分隔符——Obsidian 认这种写法
      const file = base.split("/").map(encodeURIComponent).join("/");
      return "obsidian://open?vault=" + encodeURIComponent(ob) +
        (file ? "&file=" + file : "");
    }
    if (!base) return "";
    const vault = DATA.meta && DATA.meta.vault;
    return vault ? `${vault}#/n/${encodeURIComponent(ref)}` : "";
  }

  function noteAnchor(ref) {
    const href = noteHref(ref);
    if (!href) return "";
    const isOb = href.startsWith("obsidian://");
    const label = isOb ? "Obsidian ↗" : "网页 ↗";
    return `<a class="item-ref" href="${esc(href)}" ${isOb ? "" : 'target="_blank" rel="noopener"'} title="${esc(ref || "打开笔记库")}">${label}</a>`;
  }

  /* ---------- 渲染：模块页 ---------- */
  function renderModule(pid, mid) {
    const p = PILLAR[pid];
    const m = p && p.modules.find((x) => x.id === mid);
    if (!m) return renderNotFound();

    const s = moduleStats(p, m);

    const rows = m.items.map((it, i) => {
      const k = keyOf(p.id, m.id, i);
      const isDone = done.has(k);
      const ref = it.ref ? noteAnchor(it.ref) : "";
      return `
      <label class="item${isDone ? " is-done" : ""}" data-key="${k}">
        <input type="checkbox" ${isDone ? "checked" : ""}>
        <span class="chk"></span>
        <div class="item-body">
          <div class="item-title">${esc(it.t)}</div>
          ${it.note ? `<div class="item-note">${esc(it.note)}</div>` : ""}
        </div>
        ${ref}
        <span class="type">${TYPE_LABEL[it.type] || "其他"}</span>
      </label>`;
    }).join("");

    document.getElementById("app").innerHTML = `
      <header class="page-head">
        <a class="back" href="#/p/${p.id}">← ${esc(p.name)}</a>
        <h1>${esc(m.name)}</h1>
        <p class="lead">${esc(m.goal)}</p>
        <div class="total">
          <span class="track"><span class="fill" id="m-fill" style="width:${pct(s.fin, s.total)}%;background:${p.color}"></span></span>
          <span id="m-count">${s.fin} / ${s.total} 已完成</span>
        </div>
      </header>
      <section class="module-page" style="--c:${p.color}">
        <div class="items">${rows}</div>
      </section>`;

    document.getElementById("foot-note").textContent =
      "勾选即保存。切换页面不影响进度。";
  }

  /* ---------- 渲染：搜索 ---------- */
  function flatten() {
    const out = [];
    DATA.pillars.forEach((p) => {
      p.modules.forEach((m) => {
        m.items.forEach((it, i) => {
          out.push({
            pid: p.id, mid: m.id, idx: i, item: it,
            pillar: p.name, module: m.name, color: p.color
          });
        });
      });
    });
    return out;
  }

  function hl(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const eq = esc(q);
    const re = new RegExp("(" + eq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }

  function renderSearch(q) {
    const term = (q || "").trim();
    const all = flatten();
    const hits = term
      ? all.filter((r) =>
          (r.item.t + " " + (r.item.note || "") + " " + r.module + " " + r.pillar)
            .toLowerCase().includes(term.toLowerCase()))
      : [];

    const body = term
      ? (hits.length
          ? hits.map((r) => `
            <a class="result" href="#/p/${r.pid}/m/${r.mid}">
              <div class="result-crumb">${esc(r.pillar)} / ${esc(r.module)}</div>
              <div class="result-title">${hl(r.item.t, term)}</div>
              ${r.item.note ? `<div class="result-note">${hl(r.item.note, term)}</div>` : ""}
            </a>`).join("")
          : `<div class="empty">没有匹配「${esc(term)}」的条目。</div>`)
      : `<div class="empty">在上方输入关键词，搜索全部 ${all.length} 条内容。</div>`;

    document.getElementById("app").innerHTML = `
      <header class="page-head">
        <a class="back" href="#/">← 返回首页</a>
        <h1>搜索</h1>
        <p class="lead">${term ? `「${esc(term)}」找到 ${hits.length} 条` : "覆盖三大支柱的全部条目与备注"}</p>
      </header>
      <section class="results">${body}</section>`;

    document.getElementById("foot-note").textContent =
      "进度和草稿存在本机浏览器，清缓存会丢；速记可导出 .md 搬进 Obsidian。";
  }

  /* ---------- 渲染：速记 ---------- */
  const NOTE_KEY = "study.notes.v1";
  let notes = [];

  try {
    const raw = localStorage.getItem(NOTE_KEY);
    if (raw) notes = JSON.parse(raw);
    if (!Array.isArray(notes)) notes = [];
  } catch (e) {
    notes = [];
  }

  function saveNotes() {
    if (!canStore) {
      toast("浏览器禁用了本地存储，这条不会保留");
      return false;
    }
    try {
      localStorage.setItem(NOTE_KEY, JSON.stringify(notes));
      return true;
    } catch (e) {
      toast("保存失败，可能存储空间已满");
      return false;
    }
  }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  function fmtTime(ts) {
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    const hm = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    if (new Date().toDateString() === d.toDateString()) return "今天 " + hm;
    return (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 " + hm;
  }

  /* 把草稿导成一个 .md，直接拖进 Obsidian 的 _inbox 就能整理 */
  function exportNotesMd() {
    const live = notes.filter((n) => !n.del).sort((a, b) => a.ts - b.ts);
    if (!live.length) { toast("还没有草稿"); return; }
    const p2 = (x) => String(x).padStart(2, "0");
    const fmt = (ts) => {
      const d = new Date(ts);
      return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) +
        " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
    };
    const now = fmt(Date.now());
    const head = "---\nsource: 学习台速记\nexported: " + now + "\ncount: " + live.length + "\n---\n\n";
    const body = live.map((n) => "## " + fmt(n.ts) + "\n\n" + String(n.text).trim() + "\n").join("\n");
    const blob = new Blob([head + body], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "速记-" + now.slice(0, 10) + ".md";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 " + live.length + " 条，拖进 Obsidian 的 _inbox 就行");
  }

  let showArchived = false;

  function renderNotes() {
    const live = notes.filter((n) => !n.del);
    const archived = notes.filter((n) => n.del).slice().sort((a, b) => b.ts - a.ts);

    const rows = live.slice().sort((a, b) => b.ts - a.ts).map((n) => `
      <div class="note">
        <div class="note-text">${esc(n.text)}</div>
        <div class="note-meta">
          <span>${fmtTime(n.ts)}</span>
          <button class="note-del" data-arch="${esc(n.id)}" title="搬进 Obsidian 之后点这里，从待整理里移走">归档</button>
        </div>
      </div>`).join("");

    const archRows = archived.map((n) => `
      <div class="note note-archived">
        <div class="note-text">${esc(n.text)}</div>
        <div class="note-meta">
          <span>${fmtTime(n.ts)}</span>
          <button class="note-del" data-unarch="${esc(n.id)}" title="放回待整理">恢复</button>
        </div>
      </div>`).join("");

    const obName = ((DATA.meta && DATA.meta.obsidian) || "").trim();
    const vault = DATA.meta && DATA.meta.vault;
    const obLink = obName
      ? `<a class="inline-link" href="${esc(noteHref(""))}">Obsidian</a>`
      : vault
      ? `<a class="inline-link" href="${esc(vault)}" target="_blank" rel="noopener">笔记库</a>`
      : "Obsidian";

    document.getElementById("app").innerHTML = `
      <header class="page-head head-split">
        <div>
          <h1>速记</h1>
          <p class="lead">随手扔，别管格式。攒够一批点右上导出成 Markdown，搬去 ${obLink} 整理成篇。${live.length ? `现在有 <strong>${live.length}</strong> 条待整理。` : ""}</p>
        </div>
        ${live.length ? '<button class="btn" id="notes-md" title="导成 Markdown，可以直接拖进 Obsidian">导出 .md</button>' : ""}
      </header>
      <div class="compose">
        <textarea id="note-input" placeholder="记一笔…" rows="3"></textarea>
        <div class="compose-bar">
          <span class="compose-hint">Ctrl + Enter 保存</span>
          <button class="btn-primary" id="note-save">保存</button>
        </div>
      </div>
      <section class="note-list">
        ${rows || '<div class="empty">待整理是空的。想记什么就往上写。</div>'}
      </section>
      ${(live.length || archived.length) ? `
      <div class="note-bar">
        ${archived.length ? `<button class="link-btn" id="arch-toggle">${showArchived ? "收起归档" : `已归档 ${archived.length} 条 · 展开`}</button>` : "<span></span>"}
        ${live.length ? `<button class="link-btn" id="arch-all">全部归档</button>` : ""}
      </div>` : ""}
      ${archived.length ? `<section class="note-list arch-list" id="arch-list"${showArchived ? "" : " hidden"}>
        <p class="arch-cap">已搬进 Obsidian 的，留在这里备查</p>
        ${archRows}
      </section>` : ""}`;

    const input = document.getElementById("note-input");
    input.focus();
    input.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        addNote();
      }
    });
    document.getElementById("note-save").addEventListener("click", addNote);

    const mdBtn = document.getElementById("notes-md");
    if (mdBtn) mdBtn.addEventListener("click", exportNotesMd);

    const archToggle = document.getElementById("arch-toggle");
    if (archToggle) archToggle.addEventListener("click", () => {
      showArchived = !showArchived;
      const list = document.getElementById("arch-list");
      if (list) list.hidden = !showArchived;
      archToggle.textContent = showArchived
        ? "收起归档"
        : "已归档 " + archived.length + " 条 · 展开";
    });

    const archAll = document.getElementById("arch-all");
    if (archAll) archAll.addEventListener("click", () => {
      if (!live.length) return;
      if (!window.confirm("把 " + live.length + " 条都标为已归档？内容会留在归档里，不会丢。")) return;
      live.forEach((n) => { n.del = 1; });
      saveNotes();
      renderNotes();
      toast("已归档 " + live.length + " 条");
    });

    document.getElementById("foot-note").textContent =
      "只存在这台浏览器，清缓存会丢。攒够了点「导出 .md」搬进 Obsidian。";
  }

  function addNote() {
    const el = document.getElementById("note-input");
    if (!el) return;
    const text = el.value.trim();
    if (!text) { toast("写点什么再保存"); return; }

    const item = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 7),
      text: text,
      ts: Date.now()
    };
    notes.push(item);
    if (saveNotes()) {
      toast("已保存");
      renderNotes();
    } else {
      notes.pop();
    }
  }

  /* ---------- 渲染：成果展示 ---------- */
  function renderWork() {
    const list = (DATA.works || []).slice().sort((a, b) =>
      String(b.year).localeCompare(String(a.year)));

    const cards = list.map((w) => `
      <article class="work">
        <div class="work-head">
          <span class="work-kind">${esc(w.kind)}</span>
          <span class="work-year">${esc(w.year)}</span>
        </div>
        <h3 class="work-title">${esc(w.title)}</h3>
        <p class="work-desc">${esc(w.desc)}</p>
        <div class="work-tags">${(w.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </article>`).join("");

    document.getElementById("app").innerHTML = `
      <header class="page-head">
        <h1>成果</h1>
        <p class="lead">对外展示的部分。改内容去 data/content.js 里的 works。</p>
      </header>
      <section class="works">${cards || '<div class="empty">还没有成果条目。</div>'}</section>`;

    document.getElementById("foot-note").textContent =
      "这一层是公开的，不需要登录就能看。";
  }

  function setNav(key) {
    document.querySelectorAll(".nav a").forEach((a) => {
      a.classList.toggle("on", a.dataset.nav === key);
    });
    // 手机底部标签栏同步高亮
    document.querySelectorAll(".tabbar a").forEach((a) => {
      if (a.dataset.tab === key) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function renderNotFound() {
    document.getElementById("app").innerHTML =
      `<div class="empty">这个页面不存在。 <a href="#/" style="text-decoration:underline">回首页</a></div>`;
  }

  /* ---------- 路由 ---------- */
  function route() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const [path, query] = hash.split("?");
    const seg = path.split("/").filter(Boolean);

    if (seg[0] === "s") {
      const q = new URLSearchParams(query || "").get("q") || "";
      const el = document.getElementById("q");
      if (el.value !== q) el.value = q;
      setNav("");
      return renderSearch(q);
    }
    if (seg[0] === "notes") { setNav("notes"); return renderNotes(); }
    if (seg[0] === "work") { setNav("work"); return renderWork(); }
    if (seg[0] === "p" && seg.length >= 4 && seg[2] === "m") {
      setNav("home");
      return renderModule(seg[1], seg[3]);
    }
    if (seg[0] === "p" && seg.length >= 2) {
      setNav("home");
      return renderPillar(seg[1]);
    }
    setNav("home");
    return renderHome();
  }

  /* ---------- 交互 ---------- */
  document.addEventListener("change", function (e) {
    const input = e.target.closest('.item input[type="checkbox"]');
    if (!input) return;

    const label = input.closest(".item");
    const k = label.dataset.key;
    if (input.checked) done.add(k); else done.delete(k);
    label.classList.toggle("is-done", input.checked);
    save();

    const seg = location.hash.replace(/^#/, "").split("/").filter(Boolean);
    if (seg[0] === "p" && seg[2] === "m") {
      const p = PILLAR[seg[1]];
      const m = p && p.modules.find((x) => x.id === seg[3]);
      if (m) {
        const s = moduleStats(p, m);
        const fill = document.getElementById("m-fill");
        const count = document.getElementById("m-count");
        if (fill) fill.style.width = pct(s.fin, s.total) + "%";
        if (count) count.textContent = s.fin + " / " + s.total + " 已完成";
      }
    }
  });

  document.addEventListener("click", function (e) {
    const arch = e.target.closest("[data-arch]");
    if (arch) {
      const target = notes.find((n) => n.id === arch.dataset.arch);
      if (!target) return;
      // 不真删，打个 del 标记——归档里还能翻回来
      target.del = 1;
      saveNotes();
      renderNotes();
      toast("已归档，下方「已归档」里能翻回来");
      return;
    }

    const un = e.target.closest("[data-unarch]");
    if (!un) return;
    const back = notes.find((n) => n.id === un.dataset.unarch);
    if (!back) return;
    delete back.del;
    saveNotes();
    renderNotes();
    toast("已放回待整理");
  });

  const searchInput = document.getElementById("q");
  let timer = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(timer);
    const v = searchInput.value;
    timer = setTimeout(() => {
      if (v.trim()) location.hash = "#/s?q=" + encodeURIComponent(v.trim());
      else if (location.hash.startsWith("#/s")) location.hash = "#/";
    }, 260);
  });

  document.getElementById("btn-export").addEventListener("click", function () {
    const payload = {
      app: "study-desk",
      exportedAt: new Date().toISOString(),
      done: [...done],
      notes: notes
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const d = new Date();
    const stamp = d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
    a.href = URL.createObjectURL(blob);
    a.download = "study-progress-" + stamp + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 " + done.size + " 条进度、" + notes.filter((n) => !n.del).length + " 条草稿");
  });

  const fileInput = document.getElementById("file-import");
  document.getElementById("btn-import").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", function () {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const obj = JSON.parse(reader.result);
        const arr = Array.isArray(obj) ? obj : (obj && obj.done);
        const incomingNotes = obj && Array.isArray(obj.notes) ? obj.notes : null;
        if (!Array.isArray(arr) && !incomingNotes) throw new Error("格式不对");

        if (Array.isArray(arr)) done = new Set(arr.filter((x) => typeof x === "string"));
        if (incomingNotes) notes = incomingNotes;
        save();
        saveNotes();
        route();
        toast("已导入 " + done.size + " 条进度、" + notes.filter((n) => !n.del).length + " 条草稿");
      } catch (err) {
        toast("导入失败：文件格式不正确");
      }
      fileInput.value = "";
    };
    reader.readAsText(f);
  });

  window.addEventListener("hashchange", route);
  route();

  // 注册 Service Worker：装到主屏后能秒开、断网也能记。
  // 双击本地文件（file://）不支持 SW，这里直接跳过，不影响使用。
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 注册失败就当普通网页用 */ });
    });
  }
})();
