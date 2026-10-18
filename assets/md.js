/* ============================================================
   md.js — 轻量 Markdown 渲染器（零外部依赖）
   为什么自己写而不引 CDN：
     1) GitHub Pages 在国内访问 jsdelivr/unpkg 经常超时，笔记打不开
     2) [[双链]] 需要和库里的文件做匹配，外部库做不到
     3) 代码要能读懂、能改 —— 这是这个项目的目的一半
   支持：frontmatter / 标题 / 段落 / 列表(嵌套+任务) / 引用 / 代码块 /
        表格(横向滚动) / 分割线 / 行内样式 / [[双链]] / #标签 / 图片 / 链接
   ============================================================ */
window.IV = window.IV || {};
(function (IV) {
  'use strict';

  /* ---------- 基础工具 ---------- */

  // HTML 转义：所有用户内容都必须先过这里，防止 XSS
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function indentOf(line) {
    var m = line.match(/^[ \t]*/);
    // tab 按 4 空格算
    return m[0].replace(/\t/g, '    ').length;
  }

  // 把行首的 tab 统一成空格，避免缩进判断错乱
  function normalizeTabs(line) {
    return line.replace(/^\t+/, function (t) { return '    '.repeat(t.length); });
  }

  function isBlank(line) { return /^\s*$/.test(line); }

  /* ---------- frontmatter ---------- */

  // 解析 --- ... --- 之间的简易 YAML
  // 只支持笔记里真正会用到的写法：key: value / key: [a, b] / key:\n  - item
  function parseYaml(src) {
    var data = {}, lines = src.split(/\r?\n/), i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (isBlank(line) || /^\s*#/.test(line)) { i++; continue; }
      var m = line.match(/^([A-Za-z0-9_\-\u4e00-\u9fa5]+)\s*:\s*(.*)$/);
      if (!m) { i++; continue; }
      var key = m[1], rest = m[2].trim();
      // 多行列表：key: 后面跟 "  - xxx"
      if (rest === '') {
        var arr = [], j = i + 1;
        while (j < lines.length) {
          var lm = lines[j].match(/^\s+-\s*(.*)$/);
          if (!lm) break;
          arr.push(unquote(lm[1]));
          j++;
        }
        if (arr.length) { data[key] = arr; i = j; continue; }
        data[key] = '';
        i++;
        continue;
      }
      // 行内数组：[a, b, c]
      if (/^\[.*\]$/.test(rest)) {
        data[key] = rest.slice(1, -1).split(',').map(function (s) { return unquote(s.trim()); })
          .filter(function (s) { return s !== ''; });
        i++; continue;
      }
      data[key] = unquote(rest);
      i++;
    }
    return data;
  }

  function unquote(s) {
    s = String(s).trim();
    if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return s.slice(1, -1);
    return s;
  }

  // 把 ### 标题变成 URL 友好的 id：中文保留，空格转 -
  function slug(text, used) {
    var base = text.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1')
      .replace(/[`*_~=#>|\\\/:[\]()（）「」]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    if (!base) base = 'section';
    var id = base, n = 1;
    while (used[id]) { id = base + '-' + (n++); }
    used[id] = 1;
    return id;
  }

  /* ---------- 行内渲染 ---------- */

  var PLACE = '\u0001'; // 占位符分隔符

  function inline(text, ctx) {
    var stash = [];
    function put(html) {
      stash.push(html);
      return PLACE + (stash.length - 1) + PLACE;
    }
    var src = text;

    // 1) 行内代码（最先，内部不再解析任何语法）
    src = src.replace(/(`+)([\s\S]*?)\1/g, function (m, f, code) {
      return put('<code class="md-code">' + esc(code.trim()) + '</code>');
    });

    // 2) [[双链]] 与 ![[嵌入]]
    src = src.replace(/(!?)\[\[([^\[\]]+?)\]\]/g, function (m, bang, inner) {
      var target = inner, label = inner;
      var pipe = inner.indexOf('|');
      if (pipe >= 0) { target = inner.slice(0, pipe); label = inner.slice(pipe + 1); }
      target = target.trim();
      // 去掉 #标题 部分用于文件匹配，但显示保留
      var file = target.split('#')[0].trim();
      if (bang) {
        return put('<span class="md-embed" data-wikilink="' + esc(file) + '" data-embed="1">' +
          esc(label) + '</span>');
      }
      return put('<a class="wikilink" data-wikilink="' + esc(file) + '" title="' + esc(target) + '">' +
        esc(label) + '</a>');
    });

    // 3) 图片
    src = src.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (m, alt, url) {
      return put('<img class="md-img" src="' + esc(url) + '" alt="' + esc(alt) + '" loading="lazy">');
    });

    // 4) 普通链接
    src = src.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, label, url) {
      var external = /^https?:\/\//i.test(url);
      return put('<a class="md-link" href="' + esc(url) + '"' +
        (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(label) + '</a>');
    });

    // 5) 尖括号自动链接
    src = src.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, function (m, url) {
      return put('<a class="md-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(url) + '</a>');
    });

    // 6) 转义（此时所有需要保留的 HTML 都已进 stash）
    src = esc(src);

    // 7) 强调
    src = src.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    src = src.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    src = src.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    src = src.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    src = src.replace(/==([^=]+)==/g, '<mark>$1</mark>');

    // 8) #标签（前面必须是行首或空格，且不是 # 标题）
    src = src.replace(/(^|[\s(（])#([\w\u4e00-\u9fa5][\w\u4e00-\u9fa5\/\-]*)/g, function (m, pre, tag) {
      // 纯数字不当标签（如 #123 可能是序号）
      if (/^\d+$/.test(tag)) return m;
      return pre + put('<a class="md-tag" data-tag="' + esc(tag) + '">#' + esc(tag) + '</a>');
    });

    // 9) 还原占位符（可能嵌套，循环几次）
    for (var round = 0; round < 3 && src.indexOf(PLACE) >= 0; round++) {
      src = src.replace(new RegExp(PLACE + '(\\d+)' + PLACE, 'g'), function (m, idx) {
        return stash[+idx] !== undefined ? stash[+idx] : '';
      });
    }

    return src;
  }

  /* ---------- 表格 ---------- */

  function isTableSep(line) {
    return /^\s*\|?\s*:?-{1,}\s*:?\s*(\|\s*:?-{1,}\s*:?\s*)+\|?\s*$/.test(line) ||
      /^\s*\|?\s*:?-{1,}\s*:?\s*\|/.test(line) && /\|/.test(line) && /^[\s|:\-]+$/.test(line);
  }

  function splitRow(line) {
    var s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    var cells = [], buf = '', i = 0;
    while (i < s.length) {
      if (s[i] === '\\' && s[i + 1] === '|') { buf += '|'; i += 2; continue; }
      if (s[i] === '|') { cells.push(buf); buf = ''; i++; continue; }
      buf += s[i]; i++;
    }
    cells.push(buf);
    return cells.map(function (c) { return c.trim(); });
  }

  function parseTable(lines, start, ctx) {
    var header = splitRow(lines[start]);
    var seps = splitRow(lines[start + 1]);
    var aligns = seps.map(function (s) {
      var l = /^:/.test(s), r = /:$/.test(s);
      if (l && r) return 'center';
      if (r) return 'right';
      if (l) return 'left';
      return '';
    });
    var rows = [], i = start + 2;
    while (i < lines.length && /\|/.test(lines[i]) && !isBlank(lines[i])) {
      rows.push(splitRow(lines[i]));
      i++;
    }
    // 关键：单元格上的 min-width 在 table 布局里经常被忽略，列会被压扁到看不清。
    // 所以按「列数 × 最小列宽」给表本身设下限，超出部分交给 .table-wrap 横向滚动。
    // 用 max() 保证列少的表在宽屏上仍然撑满整行。
    var minW = header.length * 66;
    var html = '<div class="table-wrap"><table class="md-table" style="min-width:max(100%,' +
      minW + 'px)"><thead><tr>';
    header.forEach(function (h, idx) {
      html += '<th' + (aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : '') + '>' +
        inline(h, ctx) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      html += '<tr>';
      for (var c = 0; c < header.length; c++) {
        html += '<td' + (aligns[c] ? ' style="text-align:' + aligns[c] + '"' : '') + '>' +
          inline(r[c] !== undefined ? r[c] : '', ctx) + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return { html: html, next: i };
  }

  /* ---------- 列表 ---------- */

  var MARKER = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

  function parseList(lines, start, ctx) {
    var first = lines[start].match(MARKER);
    var base = indentOf(lines[start]);
    var ordered = /^\d/.test(first[2]);
    var startNum = ordered ? parseInt(first[2], 10) : 1;
    var items = [], cur = null, i = start;

    while (i < lines.length) {
      var line = lines[i];

      if (isBlank(line)) {
        // 空行：判断是"项内空行"还是"列表结束"
        var j = i + 1;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length) break;
        var nextLine = lines[j];
        var nInd = indentOf(nextLine);
        var nIsMarker = MARKER.test(nextLine);
        if (nIsMarker && nInd === base) { i = j; continue; }   // 松散列表的下一项
        if (nInd > base || (nIsMarker && nInd > base)) {       // 仍在当前项内部
          if (cur) cur.lines.push('');
          i = j; continue;
        }
        break;
      }

      var m = line.match(MARKER);
      var ind = indentOf(line);

      if (m && ind === base) {
        cur = { text: m[3], lines: [] };
        items.push(cur);
        i++; continue;
      }
      if (m && ind < base) break;          // 退回上一层

      if (cur) {
        // 续行或嵌套内容：去掉 base 缩进后保留相对缩进
        cur.lines.push(ind >= base ? line.slice(base) : line.trim());
        i++; continue;
      }
      break;
    }

    var out = ordered ? '<ol' + (startNum !== 1 ? ' start="' + startNum + '"' : '') + '>' : '<ul>';
    items.forEach(function (it) {
      var task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
      var bodyHtml;
      if (task) {
        var checked = task[1].toLowerCase() === 'x';
        bodyHtml = '<span class="task' + (checked ? ' done' : '') + '">' +
          '<input type="checkbox" disabled' + (checked ? ' checked' : '') + '>' +
          '<span>' + inline(task[2], ctx) + '</span></span>';
      } else {
        bodyHtml = inline(it.text, ctx);
      }
      // 把项内的后续行（含嵌套列表）再解析一遍
      if (it.lines.length) {
        var sub = parseBlocks(it.lines, ctx);
        bodyHtml += sub.html;
      }
      out += '<li' + (task ? ' class="task-item"' : '') + '>' + bodyHtml + '</li>';
    });
    out += ordered ? '</ol>' : '</ul>';
    return { html: out, next: i };
  }

  /* ---------- 块级解析 ---------- */

  function parseBlocks(lines, ctx) {
    var out = [], i = 0;

    while (i < lines.length) {
      var line = normalizeTabs(lines[i]);

      if (isBlank(line)) { i++; continue; }

      // 代码块 ``` 或 ~~~
      var fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.\-]*)\s*$/);
      if (fence) {
        var mark = fence[1], lang = fence[2] || '';
        var buf = [];
        i++;
        while (i < lines.length) {
          var cl = lines[i];
          if (new RegExp('^\\s*' + mark[0] + '{' + mark.length + ',}\\s*$').test(cl)) { i++; break; }
          buf.push(cl);
          i++;
        }
        out.push('<pre class="md-pre"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') +
          '><code>' + esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // 标题
      var h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (h) {
        var level = h[1].length;
        var text = h[2];
        var id = slug(text, ctx.headingIds);
        ctx.headings.push({ level: level, text: text, id: id });
        out.push('<h' + level + ' id="' + esc(id) + '" class="md-h">' +
          inline(text, ctx) + '</h' + level + '>');
        i++; continue;
      }

      // 分割线
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        out.push('<hr class="md-hr">');
        i++; continue;
      }

      // 表格（必须在列表/引用之前判断，避免 | 开头被误判）
      if (/\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var tbl = parseTable(lines, i, ctx);
        out.push(tbl.html);
        i = tbl.next; continue;
      }

      // 引用
      if (/^\s*>/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(normalizeTabs(lines[i]).replace(/^\s*>\s?/, ''));
          i++;
        }
        var qb = parseBlocks(quote, ctx);
        out.push('<blockquote class="md-quote">' + qb.html + '</blockquote>');
        continue;
      }

      // 列表
      if (MARKER.test(line)) {
        var lst = parseList(lines, i, ctx);
        out.push(lst.html);
        i = lst.next; continue;
      }

      // HTML 块：整行是标签开头的，原样输出（允许笔记里手写少量 HTML）
      if (/^\s*<(div|table|details|summary|figure|img|br|iframe|video|audio|picture|p|ul|ol|li)\b/i.test(line)) {
        var htmlBuf = [line];
        i++;
        while (i < lines.length && !isBlank(lines[i])) { htmlBuf.push(lines[i]); i++; }
        out.push(htmlBuf.join('\n'));
        continue;
      }

      // 段落：收集到空行或下一个块开始
      var para = [line];
      i++;
      while (i < lines.length) {
        var pl = normalizeTabs(lines[i]);
        if (isBlank(pl)) break;
        if (/^\s*(`{3,}|~{3,})/.test(pl)) break;
        if (/^#{1,6}\s+/.test(pl)) break;
        if (/^\s*>/.test(pl)) break;
        if (MARKER.test(pl)) break;
        if (/\|/.test(pl) && i + 1 < lines.length && isTableSep(lines[i + 1])) break;
        if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(pl)) break;
        para.push(pl);
        i++;
      }
      var phtml = inline(para.join('\n'), ctx);
      // hardBreak：中文笔记常一行一句，保留换行更好读；关闭时按标准 Markdown 折叠成空格
      phtml = ctx.hardBreak ? phtml.replace(/\n/g, '<br>') : phtml.replace(/\n/g, ' ');
      out.push('<p class="md-p">' + phtml + '</p>');
    }

    return { html: out.join('\n') };
  }

  /* ---------- 对外接口 ---------- */

  /**
   * 渲染一整篇笔记
   * @param {string} raw 原始 md 文本
   * @param {{hardBreak?:boolean}} opts
   * @returns {{html, frontmatter, headings, links, tags, title, body}}
   */
  function render(raw, opts) {
    opts = opts || {};
    var text = String(raw || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var frontmatter = {};

    // 抽出 frontmatter
    var fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fmMatch) {
      frontmatter = parseYaml(fmMatch[1]);
      text = text.slice(fmMatch[0].length);
    }

    var ctx = {
      headings: [], headingIds: {}, links: [], tags: [],
      hardBreak: opts.hardBreak !== false
    };
    var result = parseBlocks(text.split('\n'), ctx);

    // 收集出链与标签（从渲染结果里再扫一遍，简单可靠）
    var links = [];
    result.html.replace(/data-wikilink="([^"]*)"/g, function (m, t) {
      var v = t.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      if (v && links.indexOf(v) < 0) links.push(v);
      return m;
    });
    var tags = [];
    result.html.replace(/data-tag="([^"]*)"/g, function (m, t) {
      var v = t.replace(/&amp;/g, '&');
      if (v && tags.indexOf(v) < 0) tags.push(v);
      return m;
    });
    // frontmatter 里的 tags 也算
    if (frontmatter.tags) {
      (Array.isArray(frontmatter.tags) ? frontmatter.tags : String(frontmatter.tags).split(/[,，]/))
        .forEach(function (t) {
          t = String(t).trim();
          if (t && tags.indexOf(t) < 0) tags.push(t);
        });
    }

    // 标题：frontmatter.title > 第一个 h1 > 空
    var title = frontmatter.title || '';
    if (!title) {
      var h1 = ctx.headings.filter(function (x) { return x.level === 1; })[0];
      title = h1 ? h1.text.replace(/[*`_]/g, '') : '';
    }

    // Obsidian 1.14 有 inline title：如果正文第一个 h1 和 title 一样，去掉避免重复
    var html = result.html;
    if (title && ctx.headings.length) {
      var firstH = ctx.headings[0];
      if (firstH.level === 1 && firstH.text.replace(/[*`_]/g, '').trim() === String(title).trim()) {
        html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/, '');
        ctx.headings.shift();
      }
    }

    return {
      html: html,
      frontmatter: frontmatter,
      headings: ctx.headings,
      links: links,
      tags: tags,
      title: title
    };
  }

  IV.MD = { render: render, esc: esc, inline: inline, parseYaml: parseYaml, slug: slug };
})(window.IV);
