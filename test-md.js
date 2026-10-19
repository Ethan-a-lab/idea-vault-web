// 临时测试：在 node 里跑 md.js，验证真实笔记的渲染结果
global.window = {};
const fs = require('fs');
require('D:/Github/idea-vault-web/assets/md.js');
const MD = global.window.IV.MD;

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}

console.log('\n=== 1. 真实笔记：示例视频笔记 ===');
const sample = fs.readFileSync('D:/Github/idea-vault-web/test/fixtures/sample-video.md', 'utf8');
const r1 = MD.render(sample);
t('标题取自 frontmatter', r1.title === '示例：这条可以删掉', r1.title);
t('frontmatter 解析 tags', Array.isArray(r1.frontmatter.tags) && r1.frontmatter.tags[0] === '领域/职业', JSON.stringify(r1.frontmatter.tags));
t('frontmatter 保留含引号的 my_take', /兴趣要先能养活你/.test(r1.frontmatter.my_take || ''), r1.frontmatter.my_take);
t('正文有 h2 小节', r1.headings.length >= 3, 'headings=' + r1.headings.length);
t('正文含逐字稿段落', /很多人问我/.test(r1.html));
t('时间戳 [00:00] 未被误解析', /\[00:00\]/.test(r1.html));

console.log('\n=== 2. 真实笔记：日语笔记（表格是 L0 验收点）===');
const jp = fs.readFileSync('D:/Github/idea-vault-web/test/fixtures/japanese.md', 'utf8');
const r2 = MD.render(jp);
t('标题正确', r2.title === '日语 N3 学习笔记', r2.title);
t('表格被渲染成 <table>', /<table class="md-table"/.test(r2.html));
t('表格有外层滚动容器', /<div class="table-wrap">/.test(r2.html));
t('第一张表是 11 列表头', (r2.html.split('</thead>')[0].match(/<\/th>/g) || []).length === 11,
  'th=' + (r2.html.split('</thead>')[0].match(/<\/th>/g) || []).length);
t('多张表格都渲染出来', (r2.html.match(/<table class="md-table"/g) || []).length === 20,
  'tables=' + (r2.html.match(/<table class="md-table"/g) || []).length);
t('标题去重（h1 已提到 title）', !/<h1[^>]*>日语 N3 学习笔记<\/h1>/.test(r2.html));
const h2s = r2.headings.map(h => h.level + ':' + h.text);
t('大纲含「日语的声调」', h2s.includes('1:日语的声调'), h2s.join(' | '));

console.log('\n=== 3. 语法边界 ===');
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

console.log('\n=== 4. hardBreak 开关 ===');
const hb1 = MD.render('第一行\n第二行', { hardBreak: true }).html;
const hb2 = MD.render('第一行\n第二行', { hardBreak: false }).html;
t('开启时保留换行', /第一行<br>第二行/.test(hb1), hb1);
t('关闭时折叠为空格', /第一行 第二行/.test(hb2), hb2);

console.log('\n=== 5. YAML 陷阱（交接文档提到过）===');
const y = MD.parseYaml('title: "含冒号: 的标题"\ntags: [a, b]\nlist:\n  - x\n  - y\nempty:');
t('引号内的冒号不被切坏', y.title === '含冒号: 的标题', y.title);
t('行内数组', Array.isArray(y.tags) && y.tags.length === 2, JSON.stringify(y.tags));
t('多行数组', Array.isArray(y.list) && y.list[1] === 'y', JSON.stringify(y.list));

console.log('\n----------------------------------------');
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
