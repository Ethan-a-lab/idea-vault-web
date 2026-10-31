#!/usr/bin/env node
/*
 * 提交前扫描：防止把真实笔记内容提交进这个公开仓库。
 *
 * 原理：把私有笔记库里所有「有辨识度的句子」做成一张指纹表，
 * 拿它去比对本次暂存的文件。命中就拒绝提交，并指出是哪一段。
 *
 * 用法：pre-commit 钩子会自动调用；也可以手动跑 `node tools/check-public-content.js`
 * 真遇到误判，临时跳过：SKIP_PUBLIC_CHECK=1 git commit -m "..."
 * 私有库位置换过的话：VAULT_DIR="D:/别的路径" node tools/check-public-content.js
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VAULT = process.env.VAULT_DIR || 'D:/Github/idea-vault';
const MIN_LEN = 18;           // 归一化后短于此长度的行不参与比对（避免"你好"这类常见短句误报）
const TEXT_EXT = new Set(['.md', '.markdown', '.txt', '.js', '.json', '.html', '.css', '.py', '.yml', '.yaml']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function git(cmd) {
  return execSync('git ' + cmd, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
}

// 去掉空白和标点，只留下字词本身——这样缩进、全角半角、标点差异不会漏检
function norm(s) {
  return s
    .replace(/[\s|>#*\-_`~\[\](){}<>:;,.!?"'“”‘’、。，：；！？（）【】《》…—]/g, '')
    .toLowerCase();
}

// 表格行不参与比对：五十音表、助词表这类是公共知识，
// 示例数据和真实笔记撞行很正常，拦它只会制造误判，最后逼人把检查关掉。
function isTableRow(line) {
  return /^\s*\|/.test(line);
}

function walk(dir, out) {
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const d of list) {
    if (d.name === '.git' || d.name === '.obsidian' || d.name === 'node_modules') continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out);
    else if (/\.(md|markdown|txt)$/i.test(d.name)) out.push(p);
  }
  return out;
}

// ---------- 1. 建立私有库指纹 ----------
if (!fs.existsSync(VAULT)) {
  console.log('[检查跳过] 找不到私有库：' + VAULT + '（不影响本次提交）');
  process.exit(0);
}

const fingerprint = new Map();   // 归一化后的行 -> 来源笔记（相对路径）
for (const f of walk(VAULT, [])) {
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  const rel = path.relative(VAULT, f).replace(/\\/g, '/');
  for (const line of text.split(/\r?\n/)) {
    if (isTableRow(line)) continue;
    const n = norm(line);
    if (n.length >= MIN_LEN && !fingerprint.has(n)) fingerprint.set(n, rel);
  }
}

// ---------- 2. 取本次暂存的文件 ----------
let stagedRaw;
try {
  stagedRaw = git('diff --cached --name-only --diff-filter=ACM -z').toString('utf8');
} catch (e) {
  console.log('[检查跳过] 读取暂存区失败：' + e.message);
  process.exit(0);
}
const staged = stagedRaw.split('\0').filter(Boolean);

if (!staged.length) {
  console.log('[检查] 没有暂存文件，跳过。');
  process.exit(0);
}

// ---------- 3. 逐个比对 ----------
const hits = [];
const warnings = [];

for (const file of staged) {
  const ext = path.extname(file).toLowerCase();

  if (IMAGE_EXT.has(ext)) {
    warnings.push(file + '（图片：确认截图里没有真实笔记、文件名、路径）');
    continue;
  }
  if (!TEXT_EXT.has(ext)) continue;

  let content;
  try {
    content = git('show :' + JSON.stringify(file)).toString('utf8');
  } catch (e) {
    continue;   // 可能是二进制或已删除
  }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i])) continue;
    const n = norm(lines[i]);
    if (n.length < MIN_LEN) continue;
    if (fingerprint.has(n)) {
      hits.push({
        file,
        line: i + 1,
        from: fingerprint.get(n),
        text: lines[i].trim().slice(0, 60)
      });
    }
  }
}

// ---------- 4. 结论 ----------
if (warnings.length) {
  console.log('\n提醒（不阻止提交）：');
  warnings.forEach(w => console.log('  · ' + w));
}

if (!hits.length) {
  console.log('\n[检查通过] 暂存内容未发现与私有笔记重复的段落。');
  process.exit(0);
}

console.log('\n' + '='.repeat(56));
console.log('拒绝提交：暂存内容与你的私有笔记重复');
console.log('='.repeat(56));
const shown = hits.slice(0, 10);
for (const h of shown) {
  console.log('\n  ' + h.file + ' 第 ' + h.line + ' 行');
  console.log('    来源：' + h.from);
  console.log('    内容：' + h.text + '…');
}
if (hits.length > shown.length) console.log('\n  ...另有 ' + (hits.length - shown.length) + ' 处');

console.log('\n这个仓库是公开的，真实笔记一旦提交就会永久留在 git 历史里。');
console.log('处理办法：');
console.log('  1. 换成编造的内容，重新 git add');
console.log('  2. 确认是巧合误判：SKIP_PUBLIC_CHECK=1 git commit -m "..."');
console.log('');
process.exit(1);
