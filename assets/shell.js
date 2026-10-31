/* 站点外壳：注入顶栏和板块导航
 *
 * 加一个板块，只需要两步：
 *   1. 在下面 NAV 数组里加一行 { key, label, href }
 *   2. 新建对应的 html 文件，把 <body data-page="你的 key"> 写上，
 *      页面里引入 <script src="路径/assets/shell.js"></script>
 *
 * 其他什么都不用改——每个板块是完全独立的页面，样式互不影响。
 */
(function () {
  'use strict';

  var BRAND = '学习台';

  var NAV = [
    { key: 'home',  label: '首页', href: 'index.html' },
    { key: 'desk',  label: '学习', href: 'desk/index.html' },
    { key: 'notes', label: '笔记', href: 'notes.html' }
    /* 例：{ key: 'reading', label: '读书', href: 'reading.html' } */
  ];

  var MARK =
    '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
    '<rect x="1.2" y="6.4" width="3.1" height="7.6" rx="1.55" fill="#2F5D50"/>' +
    '<rect x="6.45" y="2.6" width="3.1" height="11.4" rx="1.55" fill="#9A6B3F"/>' +
    '<rect x="11.7" y="5.2" width="3.1" height="8.8" rx="1.55" fill="#3D4F8C"/>' +
    '</svg>';

  var script = document.currentScript;
  var src = script ? script.src : '';
  var root = src.replace(/assets\/shell\.js.*$/, '');
  var page = (document.body && document.body.getAttribute('data-page')) || '';

  function url(href) { return root + href; }

  var links = NAV.map(function (it) {
    var cur = it.key === page ? ' aria-current="page"' : '';
    return '<a href="' + url(it.href) + '"' + cur + '>' + it.label + '</a>';
  }).join('');

  var bar = document.createElement('header');
  bar.className = 'shell';
  bar.innerHTML =
    '<div class="shell-in">' +
      '<a class="shell-brand" href="' + url('index.html') + '">' +
        '<span class="shell-mark">' + MARK + '</span>' + BRAND +
      '</a>' +
      '<button class="shell-btn" type="button" aria-expanded="false">菜单</button>' +
      '<nav class="shell-nav" aria-label="板块导航">' + links + '</nav>' +
    '</div>';

  if (document.body) document.body.insertBefore(bar, document.body.firstChild);
  else document.addEventListener('DOMContentLoaded', function () {
    document.body.insertBefore(bar, document.body.firstChild);
  });

  var btn = bar.querySelector('.shell-btn');
  if (btn) {
    btn.addEventListener('click', function () {
      var open = document.body.classList.toggle('shell-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('shell-open')) {
      document.body.classList.remove('shell-open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
})();
