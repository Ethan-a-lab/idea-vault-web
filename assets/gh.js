/* ============================================================
   gh.js — GitHub 私有仓库读写 + 本地缓存
   设计要点：
     1) 一次 trees?recursive=1 拿到整棵文件树（1 次请求）
     2) 按 sha 逐个取 blob，已缓存的 sha 直接跳过（增量同步）
     3) 缓存放 IndexedDB（localStorage 只有 5MB，笔记多了会爆）
     4) 写入用 Contents API，必须带 sha 才能更新（防覆盖别人的提交）
   ============================================================ */
window.IV = window.IV || {};
(function (IV) {
  'use strict';

  var API = 'https://api.github.com';

  /* ---------- IndexedDB 缓存 ---------- */

  var dbPromise = null;
  var memCache = new Map();      // IndexedDB 不可用时的退路
  var useMem = false;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      if (!('indexedDB' in window)) { useMem = true; resolve(null); return; }
      var req;
      try { req = indexedDB.open('idea-vault', 1); }
      catch (e) { useMem = true; resolve(null); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { useMem = true; resolve(null); };
      // 某些浏览器隐私模式下 open 会挂住，2 秒后放弃
      setTimeout(function () { if (!dbPromise.__done) { /* noop */ } }, 2000);
    });
    return dbPromise;
  }

  function store(db, name, mode) {
    return db.transaction(name, mode).objectStore(name);
  }

  async function cacheGet(key) {
    if (useMem) return memCache.get(key);
    var db = await openDB();
    if (!db) return memCache.get(key);
    return new Promise(function (resolve) {
      var r = store(db, 'blobs', 'readonly').get(key);
      r.onsuccess = function () { resolve(r.result === undefined ? memCache.get(key) : r.result); };
      r.onerror = function () { resolve(memCache.get(key)); };
    });
  }

  async function cacheSet(key, val) {
    memCache.set(key, val);
    if (useMem) return;
    var db = await openDB();
    if (!db) return;
    try {
      store(db, 'blobs', 'readwrite').put(val, key);
    } catch (e) { /* 配额满了就只留内存 */ }
  }

  async function cacheClear() {
    memCache.clear();
    var db = await openDB();
    if (!db) return;
    try { store(db, 'blobs', 'readwrite').clear(); } catch (e) { }
  }

  /* ---------- base64 <-> UTF-8 ---------- */

  function b64ToUtf8(b64) {
    var clean = String(b64).replace(/[\r\n\s]/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function utf8ToB64(str) {
    var bytes = new TextEncoder().encode(str);
    var out = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(out);
  }

  /* ---------- HTTP ---------- */

  function ApiError(message, status, body) {
    var e = new Error(message);
    e.status = status;
    e.body = body;
    return e;
  }

  // 把 GitHub 的错误码翻译成人话，避免用户看到 "403" 就懵
  function humanError(status, body, what) {
    var msg = '';
    if (status === 401) msg = '令牌无效或已过期，去设置里重新填一个';
    else if (status === 403) {
      msg = '没有权限，或触发了 GitHub 限流。检查令牌是否勾了「Contents: Read and write」';
      if (body && body.message && /rate limit/i.test(body.message)) msg = '请求太频繁，等 1 小时或重新登录再来';
    }
    else if (status === 404) msg = '仓库或文件不存在。检查用户名 / 仓库名 / 分支名，以及令牌是否有这个库的权限';
    else if (status === 409) msg = '保存冲突：云端文件已被改动，请刷新后重试';
    else if (status === 422) msg = '提交被拒绝：文件路径非法或内容过大';
    else msg = 'GitHub 返回 ' + status + (body && body.message ? '：' + body.message : '');
    return ApiError((what ? what + '：' : '') + msg, status, body);
  }

  async function request(path, opts) {
    opts = opts || {};
    if (!opts.token) throw ApiError('还没配置令牌', 0);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, opts.timeout || 20000);
    var res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        signal: ctrl.signal,
        headers: {
          'Authorization': 'Bearer ' + opts.token,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw ApiError('请求超时，网络可能不通。可尝试换网络或稍后重试', 0);
      throw ApiError('网络错误：' + e.message, 0);
    }
    clearTimeout(timer);

    if (res.status === 304) return { notModified: true };
    var body = null;
    var text = await res.text();
    if (text) { try { body = JSON.parse(text); } catch (e) { body = null; } }
    if (!res.ok) throw humanError(res.status, body, '');
    return body;
  }

  /* ---------- 对外 API ---------- */

  var cfg = {
    owner: '', repo: '', branch: 'main', path: '', token: ''
  };

  function configure(c) {
    cfg = Object.assign({}, cfg, c || {});
    cfg.path = String(cfg.path || '').replace(/^\/+|\/+$/g, '');
  }

  function repoPath() {
    return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  }

  /**
   * 拉取整棵文件树
   * @returns {Promise<Array<{path, name, dir, sha, size, type}>>}
   */
  async function listTree() {
    var ref = encodeURIComponent(cfg.branch || 'main');
    var data = await request(repoPath() + '/git/trees/' + ref + '?recursive=1', { token: cfg.token });

    if (data.truncated) {
      console.warn('文件树被截断（文件太多），仅显示前 10 万条');
    }
    var prefix = cfg.path ? cfg.path + '/' : '';
    var files = [];

    (data.tree || []).forEach(function (node) {
      if (node.type !== 'blob') return;
      if (prefix && node.path.indexOf(prefix) !== 0) return;
      var rel = prefix ? node.path.slice(prefix.length) : node.path;
      if (!rel) return;
      // 忽略 Obsidian / git 内部文件
      if (/(^|\/)\.(git|obsidian|trash)(\/|$)/.test(rel)) return;
      if (/\.md$/i.test(rel)) {
        files.push({
          path: rel, name: rel.split('/').pop(), dir: rel.indexOf('/') >= 0 ? rel.slice(0, rel.lastIndexOf('/')) : '',
          sha: node.sha, size: node.size || 0, type: 'note'
        });
      } else if (/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(rel)) {
        files.push({
          path: rel, name: rel.split('/').pop(), dir: rel.indexOf('/') >= 0 ? rel.slice(0, rel.lastIndexOf('/')) : '',
          sha: node.sha, size: node.size || 0, type: 'image'
        });
      }
    });

    files.sort(function (a, b) { return a.path.localeCompare(b.path, 'zh'); });
    return files;
  }

  /**
   * 按 sha 取文本内容，带缓存
   */
  async function readBlob(sha) {
    var cached = await cacheGet(sha);
    if (typeof cached === 'string') return cached;
    var data = await request(repoPath() + '/git/blobs/' + sha, { token: cfg.token });
    var text = data.encoding === 'base64' ? b64ToUtf8(data.content) : data.content;
    await cacheSet(sha, text);
    return text;
  }

  /**
   * 读取单文件当前内容 + sha（写入前必须先拿 sha）
   */
  async function getFile(path) {
    var data = await request(repoPath() + '/contents/' + encodePath(path) + '?ref=' + encodeURIComponent(cfg.branch),
      { token: cfg.token });
    var text = b64ToUtf8(data.content || '');
    await cacheSet(data.sha, text);
    return { content: text, sha: data.sha, path: data.path };
  }

  function encodePath(p) {
    return String(p).split('/').map(encodeURIComponent).join('/');
  }

  /**
   * 写入 / 新建文件
   */
  async function putFile(path, content, sha, message) {
    var body = {
      message: message || ('更新 ' + path),
      content: utf8ToB64(content),
      branch: cfg.branch
    };
    if (sha) body.sha = sha;
    var data = await request(repoPath() + '/contents/' + encodePath(path), {
      token: cfg.token, method: 'PUT', body: body
    });
    var newSha = data.content && data.content.sha;
    if (newSha) await cacheSet(newSha, content);
    return { sha: newSha, commit: data.commit && data.commit.sha };
  }

  async function deleteFile(path, sha, message) {
    return request(repoPath() + '/contents/' + encodePath(path), {
      token: cfg.token, method: 'DELETE',
      body: { message: message || ('删除 ' + path), sha: sha, branch: cfg.branch }
    });
  }

  /**
   * 验证令牌 + 仓库是否可用
   */
  async function verify() {
    var user = await request('/user', { token: cfg.token });
    var repo = await request(repoPath(), { token: cfg.token });
    return { login: user.login, repo: repo.full_name, private: repo.private };
  }

  /**
   * 并发拉取多个 blob（限 6 并发，别把 GitHub 打爆）
   */
  async function readMany(items, onProgress) {
    var out = {}, idx = 0, done = 0, total = items.length, CONC = 6;
    if (!total) return out;

    return new Promise(function (resolve, reject) {
      var failed = false;
      function next() {
        if (failed) return;
        if (idx >= items.length) {
          if (done >= total) resolve(out);
          return;
        }
        var item = items[idx++];
        readBlob(item.sha).then(function (text) {
          out[item.path] = text;
          done++;
          if (onProgress) onProgress(done, total);
          if (done >= total) resolve(out); else next();
        }).catch(function (err) {
          failed = true;
          reject(err);
        });
      }
      for (var k = 0; k < Math.min(CONC, total); k++) next();
    });
  }

  IV.GH = {
    configure: configure,
    cfg: cfg,
    listTree: listTree,
    readBlob: readBlob,
    getFile: getFile,
    putFile: putFile,
    deleteFile: deleteFile,
    verify: verify,
    readMany: readMany,
    clearCache: cacheClear,
    _b64ToUtf8: b64ToUtf8,
    _utf8ToB64: utf8ToB64
  };
})(window.IV);
