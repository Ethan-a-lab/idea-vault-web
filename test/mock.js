/* 演示模式：不连 GitHub，用本地 fixtures 里的笔记冒充仓库内容。
   只被 test/preview.html 加载，线上 index.html 不会引用这个文件。 */
window.IV = window.IV || {};
(function (IV) {
  'use strict';

  var FILES = [
    { path: 'videos/2026-10-18-示例-这条可以删掉.md', url: 'fixtures/sample-video.md', sha: 'aaa1', size: 1443 },
    { path: '日语/日语N3学习笔记.md', url: 'fixtures/japanese.md', sha: 'aaa2', size: 13984 },
    { path: '思考/关于兴趣变现.md', url: 'fixtures/linked.md', sha: 'aaa3', size: 900 }
  ];

  var CACHE = null;

  async function loadAll() {
    if (CACHE) return CACHE;
    CACHE = {};
    for (var i = 0; i < FILES.length; i++) {
      var res = await fetch(FILES[i].url);
      CACHE[FILES[i].path] = await res.text();
    }
    return CACHE;
  }

  IV.GH = {
    configure: function () { },
    cfg: {},
    listTree: async function () {
      return FILES.map(function (f) {
        return {
          path: f.path, name: f.path.split('/').pop(),
          dir: f.path.indexOf('/') >= 0 ? f.path.slice(0, f.path.lastIndexOf('/')) : '',
          sha: f.sha, size: f.size, type: 'note'
        };
      });
    },
    readMany: async function (items, onProgress) {
      var all = await loadAll();
      var out = {};
      items.forEach(function (it, i) {
        out[it.path] = all[it.path];
        if (onProgress) onProgress(i + 1, items.length);
      });
      return out;
    },
    verify: async function () { return { login: 'demo', repo: 'demo/vault', private: true }; },
    getFile: async function () { var e = new Error('演示模式不能写'); e.status = 403; throw e; },
    putFile: async function () { var e = new Error('演示模式不能写'); e.status = 403; throw e; },
    clearCache: async function () { }
  };
})(window.IV);
