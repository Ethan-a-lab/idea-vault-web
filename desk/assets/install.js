/* ============================================================
 * install.js —— 把「学习台」装到手机 / 平板的主屏幕
 * ------------------------------------------------------------
 * 做三件事：
 *   1. 捕获浏览器的安装信号，弹一条轻提示，一键装（Chrome / Edge 系）
 *   2. iOS 没有安装信号，改教手动：分享 → 添加到主屏幕
 *   3. 安卓收不到信号时兜底给文字指引（安装提示是一次性的，
 *      取消过几次浏览器会冷却很久，此后页面毫无反应）
 *
 * 不在的地方：桌面浏览器不打扰（浏览器自己有菜单入口），
 * 已经装成独立窗口时也完全不出现。
 *
 * Service Worker 由 list.js 注册，这里不重复。
 * 任何异常都只 warn，绝不影响清单本身。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 0. 什么时候该出现 ---------- */
  var FORCE = /[?&]install=1(&|$)/.test(location.search);

  var isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true ||
    (document.referrer || '').indexOf('android-app://') === 0;
  if (isStandalone) return;                       // 已经装好了

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  if (!isIOS && /Macintosh/.test(ua) && navigator.maxTouchPoints > 1) isIOS = true;  // iPadOS 伪装成 Mac
  var isAndroid = /Android/.test(ua);
  var isTouch = (navigator.maxTouchPoints || 0) > 0;

  if (!isTouch && !FORCE) return;                 // 桌面不打扰，?install=1 可强制

  var DISMISS_KEY = 'study.install.dismissed';
  var DISMISS_DAYS = 3;
  var deferredPrompt = null;
  var shown = false;

  /* ---------- 1. 静默期 ---------- */
  function inCooldown() {
    if (FORCE) return false;
    try {
      var t = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      return t ? (Date.now() - t < DISMISS_DAYS * 24 * 3600 * 1000) : false;
    } catch (e) { return false; }
  }
  function setCooldown() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }

  /* ---------- 2. 提示条样式：跟随学习台的纸感配色 ---------- */
  var CSS =
    '#insWrap{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));' +
    'z-index:9998;width:min(420px,calc(100vw - 20px));box-sizing:border-box;padding:11px 13px;border-radius:13px;' +
    'background:var(--surface,#FFFDF8);color:var(--ink,#24221C);border:1px solid var(--line-2,#DCD4C2);' +
    'box-shadow:0 10px 30px rgba(36,34,28,.16);display:flex;align-items:center;gap:10px;' +
    'font-family:var(--sans,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif);' +
    'animation:insIn .3s cubic-bezier(.16,1,.3,1)}' +
    '@keyframes insIn{from{opacity:0;transform:translateX(-50%) translateY(14px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}' +
    '#insWrap img{width:34px;height:34px;border-radius:9px;flex:0 0 auto;display:block}' +
    '#insTxt{flex:1 1 auto;min-width:0;font-size:13px;line-height:1.35}' +
    '#insTxt b{display:block;font-size:13.5px;font-weight:600;margin-bottom:1px}' +
    '#insTxt span{color:var(--ink-3,#9A9484);font-size:11.5px;display:block}' +
    '#insWrap button{flex:0 0 auto;border:0;cursor:pointer;font-family:inherit;font-size:13px;' +
    'padding:7px 13px;border-radius:9px;transition:filter .15s}' +
    '#insWrap button:active{filter:brightness(.94)}' +
    '#insOk{background:#2F5D50;color:#fff;font-weight:600}' +
    '#insClose{position:absolute;top:-8px;right:-8px;width:21px;height:21px;border-radius:50%;' +
    'background:var(--surface,#FFFDF8);border:1px solid var(--line-2,#DCD4C2);color:var(--ink-3,#9A9484);' +
    'font-size:12px;line-height:1;padding:0;cursor:pointer}' +
    '@media (max-width:400px){#insTxt span{font-size:11px}}';

  function injectCSS() {
    if (document.getElementById('insStyle')) return;
    var s = document.createElement('style');
    s.id = 'insStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- 3. 弹条 ---------- */
  function showBar(mode) {
    if (shown || inCooldown() || !document.body) return;
    shown = true;
    injectCSS();

    var wrap = document.createElement('div');
    wrap.id = 'insWrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', '安装到主屏幕');

    var icon = document.createElement('img');
    icon.src = 'assets/icons/icon-192.png';
    icon.alt = '';

    var txt = document.createElement('div');
    txt.id = 'insTxt';
    if (mode === 'ios') {
      txt.innerHTML = '<b>添加到主屏幕</b><span>点下方「分享」→ 选「添加到主屏幕」（需用 Safari 打开）</span>';
    } else if (mode === 'manual') {
      txt.innerHTML = '<b>没看到安装按钮？</b><span>' +
        (isAndroid ? '点右上角 ⋮ → 添加到主屏幕 / 安装应用' : '点地址栏右侧的安装图标') +
        '</span>';
    } else {
      txt.innerHTML = '<b>把学习台装到主屏幕</b><span>点开就是独立窗口，不用每次找网址</span>';
    }

    wrap.appendChild(icon);
    wrap.appendChild(txt);

    if (mode === 'chromium') {
      var ok = document.createElement('button');
      ok.id = 'insOk';
      ok.type = 'button';
      ok.textContent = '安装';
      ok.addEventListener('click', function () {
        if (!deferredPrompt) { hide(true); return; }
        try {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function () {
            deferredPrompt = null;
            hide(true);              // 装或取消都不再反复弹
          }).catch(function () { hide(true); });
        } catch (e) {
          hide(true);
        }
      });
      wrap.appendChild(ok);
    }

    var close = document.createElement('button');
    close.id = 'insClose';
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.textContent = '✕';
    close.addEventListener('click', function () { hide(true); });
    wrap.appendChild(close);

    document.body.appendChild(wrap);

    function hide(remember) {
      if (remember) setCooldown();
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }
  }

  /* ---------- 4. Chromium：捕获一次性安装事件 ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showBar('chromium');
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    /* 故意不写静默期：卸载后重装时不该被自己的记录挡住 */
  });

  /* ---------- 5. iOS：没有安装事件，延迟给手动引导 ---------- */
  if (isIOS) {
    window.addEventListener('load', function () {
      setTimeout(function () { showBar('ios'); }, 2600);
    });
  }

  /* ---------- 6. 安卓：等不到信号就给文字指引 ---------- */
  if (isAndroid) {
    window.addEventListener('load', function () {
      setTimeout(function () {
        if (deferredPrompt || shown) return;
        showBar('manual');
      }, 6000);
    });
  }
})();
