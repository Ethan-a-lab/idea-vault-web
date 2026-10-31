// md.js 渲染器回归测试：node test-md.js
// 路径全部相对本文件，换电脑 / clone 到别处都能直接跑
const path = require('path');
const fs = require('fs');

global.window = {};
require(path.join(__dirname, 'notes', 'md.js'));
const MD = global.window.IV.MD;

const FIXTURES = path.join(__dirname, 'test', 'fixtures');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}

console.log('\n=== 1. 长文档：日语（表格是 L0 验收点）===');
const jp = fs.readFileSync(path.join(FIXTURES, 'japanese.md'), 'utf8');
const r2 = MD.render(jp);
t('标题正确', r2.title === '示例：日语学习笔记', r2.title);
t('表格被渲染成 <table>', /<table class="md-table"/.test(r2.html));
t('表格有外层滚动容器', /<div class="table-wrap">/.test(r2.html));
t('第一张表是 11 列表头', (r2.html.split('</thead>')[0].match(/<\/th>/g) || []).length === 11,
  'th=' + (r2.html.split('</thead>')[0].match(/<\/th>/g) || []).length);
t('多张表格都渲染出来', (r2.html.match(/<table class="md-table"/g) || []).length >= 8,
  'tables=' + (r2.html.match(/<table class="md-table"/g) || []).length);
t('标题去重（h1 已提到 title）', !/<h1[^>]*>示例：日语学习笔记<\/h1>/.test(r2.html));
const h2s = r2.headings.map(h => h.level + ':' + h.text);
t('大纲含「五十音图」', h2s.includes('1:五十音图'), h2s.join(' | '));

console.log('\n=== 2. 语法边界 ===');
const cases = [
  ['嵌套列表', '- A\n  - B\n  - C\n- D', /<ul><li>A<ul><li>B<\/li><li>C<\/li><\/ul><\/li><li>D<\/li><\/ul>/],
  ['有序列表', '1. 一\n2. 二', /<ol><li>一<\/li><li>二<\/li><\/ol>/],
  ['任务列表', '- [x] 完成\n- [ ] 未完成', /checked/],
  ['代码块不解析内部语法', '```js\nconst a = "**bold**";\n```', /const a = &quot;\*\*bold\*\*&quot;/],
  ['引用', '> 引用的内容', /<blockquote class="md-quote">/],
  ['分割线', 'a\n\n---\n\nb', /<hr class="md-hr">/],
  ['双链带别名', '见 [[笔记A|这个]]', /data-wikilink="笔记A"[^>]*>这个<\/a>/],
  ['双链带标题锚点', '[[笔记A#小节]]', /data-wikilink="笔记A"/],
  ['行内代码不被当强调', '`a*b*c`', /<code class="md-code">a\*b\*c<\/code>/],
  ['标签', '这是 #日语 和 #N3/语法', /data-tag="日语"/],
  ['HEX 颜色不被当标签', '#1e1e1e 是颜色', /#1e1e1e/],
  ['转义 HTML 防注入', '<script>alert(1)</script>', null],
  ['方括号时间戳不被当链接', '开场 [00:00] 讲这个', /\[00:00\]/],
  ['表格对齐', '| a | b |\n|:--|--:|\n| 1 | 2 |', /text-align:right/],
];
for (const [name, input, re] of cases) {
  const out = MD.render(input).html;
  if (name === '转义 HTML 防注入') {
    t(name, !/<script>/.test(out) && /&lt;script&gt;/.test(out), out.slice(0, 120));
  } else {
    t(name, re.test(out), out.slice(0, 200));
  }
}

console.log('\n=== 3. hardBreak 开关 ===');
const hb1 = MD.render('第一行\n第二行', { hardBreak: true }).html;
const hb2 = MD.render('第一行\n第二行', { hardBreak: false }).html;
t('开启时保留换行', /第一行<br>第二行/.test(hb1), hb1);
t('关闭时折叠为空格', /第一行 第二行/.test(hb2), hb2);

console.log('\n=== 4. YAML 陷阱（手写解析器的坑）===');
const y = MD.parseYaml('title: "含冒号: 的标题"\ntags: [a, b]\nlist:\n  - x\n  - y\nempty:');
t('引号内的冒号不被切坏', y.title === '含冒号: 的标题', y.title);
t('行内数组', Array.isArray(y.tags) && y.tags.length === 2, JSON.stringify(y.tags));
t('多行数组', Array.isArray(y.list) && y.list[1] === 'y', JSON.stringify(y.list));

console.log('\n----------------------------------------');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
