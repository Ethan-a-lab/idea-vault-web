# -*- coding: utf-8 -*-
"""
生成 test/preview.html：把 index.html 复制一份，
把 gh.js 换成 mock.js（本地假数据），并预置好配置。
只在本地调试用，不参与线上部署。

用法： python test/make-preview.py
"""
import os
import io
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8') as f:
    src = f.read()

# 1) 用假数据替换真实 API 层
src = src.replace('<script src="assets/gh.js"></script>',
                  '<script src="mock.js"></script>')
# 2) 资源路径上移一层
src = src.replace('href="assets/', 'href="../assets/')
src = src.replace('src="assets/', 'src="../assets/')

# 3) 在 app.js 之前把配置塞进 localStorage，省得每次手点
demo_cfg = (
    '<script>try{'
    'if(location.search.indexOf("legacy")>=0){'
    # 模拟"从旧版升级"：只留旧键，不留新键，验证迁移逻辑
    'localStorage.removeItem("iv:cfg");'
    'localStorage.setItem("idea-vault-cfg-v1",JSON.stringify('
    '{owner:"Ethan-a-lab",repo:"idea-vault",dir:"videos",branch:"main",token:"demo-token"}));'
    '}else{'
    'localStorage.setItem("iv:cfg",JSON.stringify('
    '{owner:"Ethan-a-lab",repo:"idea-vault",branch:"main",path:"",token:"demo-token"}));'
    '}'
    'var _ui={theme:location.search.indexOf("light")>=0?"light":"dark"};'
    'if(location.search.indexOf("props-full")>=0)_ui.props="full";'
    'else if(location.search.indexOf("props-compact")>=0)_ui.props="compact";'
    'else _ui.props="hidden";'
    'if(/[?&]ro([=&]|$)/.test(location.search))_ui.readonly=true;'
    'localStorage.setItem("iv:ui",JSON.stringify(_ui));'
    '}catch(e){}</script>\n'
    '<script>window.addEventListener("load",function(){'
    'setTimeout(function(){'
    'if(location.search.indexOf("edit")>=0){var b=document.querySelector("#modeSwitch [data-mode=edit]");if(b)b.click();}'
    'if(location.search.indexOf("palette")>=0){document.dispatchEvent(new KeyboardEvent("keydown",{key:"p",ctrlKey:true,bubbles:true}));}'
    'if(location.search.indexOf("settings")>=0){document.getElementById("btnSettings").click();}'
    'var has=function(k){return new RegExp("[?&]"+k+"([=&]|$)").test(location.search);};'
    'if(has("note")){var c3=document.querySelector(".note-card[data-open]");if(c3)c3.click();}'
    'if(has("ac")||has("acok")){var q2=has("acok")?"\\n[[日语":"\\n[[";'
    'var card=document.querySelector(".note-card[data-open]");if(card)card.click();'
    'setTimeout(function(){var eb=document.querySelector("#modeSwitch [data-mode=edit]");if(eb)eb.click();'
    'setTimeout(function(){var t=document.querySelector("#edArea");'
    'if(t){t.value+=q2;t.selectionStart=t.selectionEnd=t.value.length;t.focus();'
    't.dispatchEvent(new Event("input",{bubbles:true}));'
    'if(has("acok")){setTimeout(function(){t.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));},280);}'
    '}},220);},320);}'
    '},1400);});</script>\n'
)
src = src.replace('<script src="../assets/app.js"></script>',
                  demo_cfg + '<script src="../assets/app.js"></script>')

# 4) --diag：注入布局诊断，用 --dump-dom 读 #diagout
if '--diag' in sys.argv:
    diag = """
<script>
setTimeout(function(){
  var out=[];
  out.push('vw='+innerWidth+' dpr='+devicePixelRatio);
  out.push('docScrollW='+document.documentElement.scrollWidth+' bodyScrollW='+document.body.scrollWidth);
  var m=document.getElementById('main'), b=document.getElementById('mainBody');
  out.push('main.w='+m.getBoundingClientRect().width+' mainBody.w='+b.getBoundingClientRect().width+' mainBody.scrollW='+b.scrollWidth);
  var rd=document.querySelector('.reader');
  if(rd) out.push('reader.w='+rd.getBoundingClientRect().width);
  var wide=[];
  document.querySelectorAll('body *').forEach(function(n){
    var rc=n.getBoundingClientRect();
    if(rc.width>0 && rc.right>innerWidth+0.5){
      wide.push(n.tagName+'.'+(n.className||n.id||'')+' right='+Math.round(rc.right)+' w='+Math.round(rc.width));
    }
  });
  var ov=document.getElementById('ovSettings'), st=ov?ov.querySelector('.settings'):null;
  if(st){
    var r=st.getBoundingClientRect(), ro=ov.getBoundingClientRect();
    out.push('overlay: w='+Math.round(ro.width)+' pad='+getComputedStyle(ov).padding);
    out.push('settings: w='+Math.round(r.width)+' right='+Math.round(r.right)+' left='+Math.round(r.left));
    out.push('settings computed: width='+getComputedStyle(st).width+' maxW='+getComputedStyle(st).maxWidth+' overflow='+getComputedStyle(st).overflow);
    var fr=st.querySelector('.fld-row');
    if(fr) out.push('fld-row: w='+Math.round(fr.getBoundingClientRect().width)+' dir='+getComputedStyle(fr).flexDirection);
  }
  out.push('OVERFLOW['+wide.length+']: '+wide.slice(0,12).join(' | '));
  var pre=document.createElement('div'); pre.id='diagout'; pre.textContent=out.join('\\n');
  document.body.appendChild(pre);
},2500);
</script>
"""
    src = src.replace('</body>', diag + '</body>')

out = os.path.join(ROOT, 'test', 'preview.html')
with io.open(out, 'w', encoding='utf-8') as f:
    f.write(src)

print('已生成', out, '（诊断模式）' if '--diag' in sys.argv else '')
