(()=>{
'use strict';
const $=id=>document.getElementById(id),KEY='format-desk-library-v1',DRAFT='format-desk-draft-v1';
const uid=()=>globalThis.crypto?.randomUUID?.()||'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);

let nameHintTimer,nameHint;
function hideNameHint(){clearTimeout(nameHintTimer);if(nameHint)nameHint.hidden=true}
function setNameHint(element,text){
 element.title='';element.dataset.fullName=text;
 if(element.nameHintBound)return;
 element.nameHintBound=true;
 const show=()=>{
  hideNameHint();
  if(!element.dataset.fullName)return;
  nameHintTimer=setTimeout(()=>{
   if(!nameHint){nameHint=document.createElement('div');nameHint.className='name-tooltip';nameHint.setAttribute('role','tooltip')}
   (element.closest('dialog[open]')||document.body).append(nameHint);
   nameHint.textContent=element.dataset.fullName;nameHint.hidden=false;
   const anchor=element.getBoundingClientRect(),size=nameHint.getBoundingClientRect();
   const left=Math.max(8,Math.min(anchor.left,globalThis.innerWidth-size.width-8));
   const top=anchor.bottom+8+size.height<=globalThis.innerHeight-8?anchor.bottom+8:Math.max(8,anchor.top-size.height-8);
   nameHint.style.left=left+'px';nameHint.style.top=top+'px';
  },200);
 };
 element.addEventListener('mouseenter',show);element.addEventListener('mouseleave',hideNameHint);
 element.addEventListener('focus',show);element.addEventListener('blur',hideNameHint);
}
document.addEventListener('scroll',hideNameHint,true);
document.addEventListener('pointerdown',hideNameHint);
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideNameHint()});
window.addEventListener('resize',hideNameHint);
window.addEventListener('blur',hideNameHint);

let library={version:1,folders:[{id:'default',name:'默认收藏夹'}],documents:[]},folderId='default',activeId=null,type='JSON',output='',dirty=false,draftTimer;
function status(message,error=false){$('status').textContent=message;$('status').className='status-message'+(error?' error':'')}
function warnStorage(message){$('storage-notice').hidden=false;$('storage-notice').textContent=message}
try{const raw=localStorage.getItem(KEY);if(raw)library=FormatCore.validateBackup(JSON.parse(raw));if(!library.folders.length)library.folders.push({id:'default',name:'默认收藏夹'});folderId=library.folders[0].id}catch(e){warnStorage('收藏读取失败。为保护已有数据，本次不自动覆盖收藏；请先导出备份，或使用其他浏览器。');}
let storageBlocked=!$('storage-notice').hidden;
function persist(){if(storageBlocked){status('收藏无法保存，请先下载文档或导出备份。',true);return false}try{localStorage.setItem(KEY,JSON.stringify(library));return true}catch(e){warnStorage('浏览器存储不可用或空间不足。当前内容仍可使用，请下载文档或导出备份。');status('保存失败，请导出备份。',true);return false}}
function commit(next){const previous=library;library=next;if(!persist()){library=previous;return false}renderFolders();renderTrash();return true}
function clone(){return JSON.parse(JSON.stringify(library))}
function setType(next){type=next;document.querySelectorAll('[data-type]').forEach(b=>{const selected=b.dataset.type===type;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected)});$('compress').disabled=type!=='JSON';$('source').placeholder=type==='JSON'?'在这里粘贴 JSON…':'在这里粘贴 XML…';output='';renderResult();}
function lines(text){return text.split('\n').length}
function updateInput(){const text=$('source').value;$('input-info').textContent=text.length.toLocaleString()+' 字符 · '+lines(text)+' 行';$('input-lines').textContent=Array.from({length:Math.min(lines(text),20000)},(_,i)=>i+1).join('\n');$('input-lines').scrollTop=$('source').scrollTop;updateProgress('input')}
function escapeHTML(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderResult(){
 $('result').textContent=output||'格式化后的内容会显示在这里。';
 if(output&&type==='JSON'&&output.length<300000){$('result').innerHTML=output.replace(/"(?:\\[\s\S]|[^"\\])*"\s*:|"(?:\\[\s\S]|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[&<>]/g,token=>{if(/^[&<>]$/.test(token))return escapeHTML(token);const cls=token.startsWith('"')?(token.trimEnd().endsWith(':')?'tok-key':'tok-string'):/^(true|false|null)$/.test(token)?'tok-literal':'tok-number';return '<span class="'+cls+'">'+escapeHTML(token)+'</span>'})}
 $('output-lines').textContent=Array.from({length:Math.min(lines(output),20000)},(_,i)=>i+1).join('\n');$('output-info').textContent=output?output.length.toLocaleString()+' 字符 · '+lines(output)+' 行':'等待格式化';$('copy').disabled=!output;$('download').disabled=!output;updateProgress('output');
}
function format(compress=false){const text=$('source').value;if(!text.trim()){status('请先输入内容。',true);return false}if(text.length>5e6){status('内容超过 5 MB 上限。',true);return false}try{output=type==='JSON'?FormatCore.formatJSON(text,compress?0:Number($('indent').value)):FormatCore.formatXML(text,Number($('indent').value));renderResult();status(compress?'JSON 已压缩 · 数字原文保留':'格式化完成 · 校验通过');return true}catch(e){output='';renderResult();status('格式错误：'+e.message,true);return false}}
function draft(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{try{localStorage.setItem(DRAFT,JSON.stringify({content:$('source').value,type}))}catch(e){}},500)}
function changed(){dirty=true;output='';renderResult();updateInput();$('saved-info').textContent='有未保存修改';draft()}
function canLeave(){return !dirty||!$('source').value.trim()||confirm('当前有未保存修改，继续会替换编辑区内容。是否继续？')}
function syncActive(){const doc=library.documents.find(d=>d.id===activeId);$('active-name').textContent=doc?doc.name:'未收藏';setNameHint($('active-name'),doc?doc.name:'');$('document-actions').hidden=!doc;$('saved-info').textContent=dirty?'有未保存修改':doc?'已保存到 '+(library.folders.find(f=>f.id===doc.folderId)?.name||'收藏夹'):'修改后请保存收藏'}
function openDoc(doc){if(!canLeave())return;activeId=doc.id;folderId=doc.folderId;setType(doc.type);$('source').value=doc.content;dirty=false;updateInput();format();syncActive();renderFolders();draft()}
function renderFolders(){hideNameHint();$('trash-count').textContent=(library.trash||[]).length;const box=$('folder-list');box.replaceChildren();const query=$('search').value.toLowerCase().trim();library.folders.forEach(folder=>{const docs=library.documents.filter(d=>d.folderId===folder.id);const matching=docs.filter(d=>(d.name+' '+d.content).toLowerCase().includes(query));if(query&&!matching.length&&!folder.name.toLowerCase().includes(query))return;const row=document.createElement('div');row.className='folder-row'+(folder.id===folderId?' active':'');const btn=document.createElement('button');btn.className='folder-button';setNameHint(btn,folder.name);const icon=document.createElement('span');icon.textContent=folder.id===folderId?'▾':'▸';const name=document.createElement('span');name.textContent='▱ '+folder.name;const count=document.createElement('span');count.className='count';count.textContent=docs.length;btn.append(icon,name,count);btn.onclick=()=>{folderId=folder.id;renderFolders()};row.append(btn);const rename=document.createElement('button');rename.className='quiet small';rename.textContent='⋯';rename.setAttribute('aria-label','重命名文件夹 '+folder.name);rename.onclick=()=>{const value=prompt('文件夹名称',folder.name);if(!value?.trim())return;const next=clone();next.folders.find(f=>f.id===folder.id).name=value.trim().slice(0,200);commit(next)};row.append(rename);const remove=document.createElement('button');remove.className='quiet small folder-delete';remove.textContent='×';remove.setAttribute('aria-label','删除文件夹 '+folder.name);remove.title='移到回收站';remove.onclick=()=>removeFolder(folder.id);row.append(remove);box.append(row);if(folder.id===folderId||query){const visible=query?matching:docs;visible.forEach(doc=>{const button=document.createElement('button');button.className='document'+(doc.id===activeId?' active':'');const tag=document.createElement('span');tag.className='type-tag';tag.textContent=doc.type;const label=document.createElement('span');label.className='doc-name';label.textContent=doc.name;button.append(tag,label);setNameHint(button,doc.name);button.onclick=()=>openDoc(doc);box.append(button)});if(!visible.length){const p=document.createElement('div');p.className='empty-folder';p.textContent='还没有收藏，保存一份开始吧。';box.append(p)}}})}
function folderOptions(select,selected){select.replaceChildren();library.folders.forEach(f=>{const option=document.createElement('option');option.value=f.id;option.textContent=f.name;select.append(option)});select.value=selected}
function saveAs(){if(!format())return;folderOptions($('document-folder'),folderId);$('document-name').value=library.documents.find(d=>d.id===activeId)?.name||'';$('save-dialog').showModal();$('document-name').focus()}
function save(){if(!activeId){saveAs();return}if(!format())return;const next=clone(),doc=next.documents.find(d=>d.id===activeId);doc.content=output;doc.type=type;if(commit(next)){dirty=false;syncActive();status('已更新收藏：'+doc.name)}}
function downloadFile(content,name,mime){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
function filename(name){return name.replace(/[\\/:*?"<>|]/g,'_').slice(0,100)||'document'}
$('source').addEventListener('input',changed);$('source').addEventListener('scroll',()=>$('input-lines').scrollTop=$('source').scrollTop);$('result').addEventListener('scroll',()=>$('output-lines').scrollTop=$('result').scrollTop);
document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{if(type===b.dataset.type)return;setType(b.dataset.type);changed();status('已切换到 '+type)});
$('format').onclick=()=>format();$('compress').onclick=()=>format(true);$('indent').onchange=()=>{if(output)format()};$('save').onclick=save;$('save-as').onclick=saveAs;
$('restore-quotes').onclick=()=>{const source=$('source').value,count=(source.match(/&quot;/g)||[]).length;if(!count){status('未找到 &quot;，内容保持原样。');return}$('source').value=FormatCore.restoreQuotes(source);changed();status('已将 '+count+' 处 &quot; 还原为双引号。点击「格式化」查看结果。');$('source').focus()};
$('save-form').onsubmit=e=>{e.preventDefault();const name=$('document-name').value.trim();if(!name)return;const doc={id:uid(),folderId:$('document-folder').value,name,type,content:output};const next=clone();next.documents.push(doc);if(commit(next)){activeId=doc.id;folderId=doc.folderId;dirty=false;$('save-dialog').close();renderFolders();syncActive();status('已保存收藏：'+name)}};
$('new-folder').onclick=()=>{const name=prompt('新建文件夹名称，例如：订单回传 / 拆单参数');if(!name?.trim())return;const folder={id:uid(),name:name.trim().slice(0,200)},next=clone();next.folders.push(folder);if(commit(next)){folderId=folder.id;renderFolders();status('已新建文件夹')}};
$('new-document').onclick=()=>{if(!canLeave())return;activeId=null;$('source').value='';dirty=false;output='';renderResult();updateInput();syncActive();renderFolders();draft();$('source').focus()};
$('clear').onclick=()=>{clearTimeout(draftTimer);activeId=null;$('source').value='';output='';dirty=false;renderResult();updateInput();syncActive();renderFolders();try{localStorage.removeItem(DRAFT)}catch(e){}$('source').focus();status('输入与结果已清空，已保存的收藏保留。')};
$('sample').onclick=()=>{if(!canLeave())return;activeId=null;$('source').value=type==='JSON'?' {"orderId":1060202860000052756,"siteId":"1400","items":[{"skuId":10001763,"quantity":2}],"success":true}':'<?xml version="1.0" encoding="UTF-8"?><order><orderId>1060202860000052756</orderId><siteId>1400</siteId><receiver country="UK"><name>Alex</name><address>21 King Street</address></receiver></order>';changed();syncActive();renderFolders();format()};
$('search').oninput=renderFolders;$('help').onclick=()=>$('help-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());$('toggle-folders').onclick=()=>document.body.classList.toggle('show-folders');
$('rename-doc').onclick=()=>{const doc=library.documents.find(d=>d.id===activeId),name=prompt('文档名称',doc.name);if(!name?.trim())return;const next=clone();next.documents.find(d=>d.id===activeId).name=name.trim().slice(0,200);if(commit(next))syncActive()};
$('move-doc').onclick=()=>{folderOptions($('move-folder'),folderId);$('move-dialog').showModal()};$('move-form').onsubmit=e=>{e.preventDefault();const next=clone();next.documents.find(d=>d.id===activeId).folderId=$('move-folder').value;if(commit(next)){folderId=$('move-folder').value;$('move-dialog').close();syncActive();renderFolders();status('收藏已移动')}};
$('delete-doc').onclick=()=>{const doc=library.documents.find(d=>d.id===activeId);if(!doc)return;const next=FormatCore.trashDocument(library,doc.id,uid(),new Date().toISOString());if(commit(next)){activeId=null;dirty=!!$('source').value;syncActive();renderFolders();status('收藏已移到回收站，可随时恢复。')}};
function copyLegacy(text){const focus=document.activeElement,area=document.createElement('textarea');area.value=text;area.readOnly=true;area.style.position='fixed';area.style.top='0';area.style.left='0';area.style.opacity='0';document.body.append(area);let ok=false;try{area.focus();area.select();area.setSelectionRange(0,text.length);ok=!!document.execCommand('copy')}catch(e){}finally{area.remove();focus?.focus?.()}return ok}
$('copy').onclick=async()=>{const text=output;if(!text)return;let copied=false;if(navigator.clipboard&&globalThis.isSecureContext){try{await navigator.clipboard.writeText(text);copied=true}catch(e){}}if(!copied)copied=copyLegacy(text);if(copied){status('结果已复制');return}$('copy-content').value=text;try{$('copy-dialog').showModal()}catch(e){$('copy-dialog').setAttribute('open','')} $('copy-content').focus();$('copy-content').select();status('浏览器限制自动复制，内容已选中，请按 ⌘C / Ctrl+C。')};
$('download').onclick=()=>downloadFile(output,filename(library.documents.find(d=>d.id===activeId)?.name||'formatted')+'.'+type.toLowerCase(),type==='JSON'?'application/json;charset=utf-8':'application/xml;charset=utf-8');
async function importFile(file){if(!file)return;if(file.size>5e6){status('文件超过 5 MB 上限。',true);return}if(!canLeave())return;try{const content=await file.text();activeId=null;setType(file.name.toLowerCase().endsWith('.xml')||content.trim().startsWith('<')?'XML':'JSON');$('source').value=content.replace(/^\uFEFF/,'');changed();syncActive();renderFolders();format()}catch(e){status('文件读取失败：'+e.message,true)}}
$('file-open').onclick=()=>$('file-picker').click();$('file-picker').onchange=async e=>{await importFile(e.target.files[0]);e.target.value=''};
$('source').addEventListener('dragover',e=>e.preventDefault());$('source').addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();importFile(e.dataTransfer.files[0])}});
$('backup-export').onclick=()=>{downloadFile(JSON.stringify(library,null,2),'format-desk-backup-'+new Date().toISOString().slice(0,10)+'.json','application/json;charset=utf-8');status('备份已导出，包含全部文件夹、收藏与回收站')};
$('backup-import').onclick=()=>$('backup-picker').click();$('backup-picker').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>25e6)throw Error('备份超过 25 MB 上限');const data=FormatCore.validateBackup(JSON.parse(await file.text())),next=FormatCore.mergeBackup(library,data,uid);if(commit(next))status('已追加导入 '+data.documents.length+' 份收藏，原有内容保留')}catch(err){status('导入失败：'+err.message,true)}e.target.value=''};
document.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey){if(e.key==='Enter'){e.preventDefault();format()}if(e.key.toLowerCase()==='s'){e.preventDefault();save()}}});
$('source').addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const el=e.target,start=el.selectionStart,end=el.selectionEnd;el.setRangeText(' '.repeat(Number($('indent').value)),start,end,'end');changed()}});
window.addEventListener('beforeunload',e=>{if(dirty&&$('source').value.trim()){e.preventDefault();e.returnValue=''}});

function updateProgress(side){const editor=side==='input'?$('source'):$('result'),maximum=Math.max(0,editor.scrollHeight-editor.clientHeight),percent=maximum?Math.round(editor.scrollTop/maximum*100):0;$(side+'-progress').value=percent;$(side+'-progress').disabled=!maximum;$(side+'-percent').textContent=percent+'%'}
['input','output'].forEach(side=>{const editor=side==='input'?$('source'):$('result');editor.addEventListener('scroll',()=>updateProgress(side));$(side+'-progress').addEventListener('input',()=>{editor.scrollTop=Math.max(0,editor.scrollHeight-editor.clientHeight)*Number($(side+'-progress').value)/100;updateProgress(side)});});
window.addEventListener('resize',()=>{updateProgress('input');updateProgress('output')});
let pendingConfirm=null;
function askConfirm(title,message,action,label='确认'){pendingConfirm=action;$('confirm-title').textContent=title;$('confirm-message').textContent=message;$('confirm-accept').textContent=label;$('confirm-dialog').showModal()}
$('confirm-accept').onclick=()=>{const action=pendingConfirm;pendingConfirm=null;$('confirm-dialog').close();if(action)action()};
function removeFolder(id){const folder=library.folders.find(f=>f.id===id);if(!folder)return;const count=library.documents.filter(d=>d.folderId===id).length;askConfirm('删除文件夹','「'+folder.name+'」和其中 '+count+' 份文档会移到回收站，可随时恢复。',()=>{const next=FormatCore.trashFolder(library,id,uid(),new Date().toISOString());if(!next.folders.length)next.folders.push({id:uid(),name:'默认收藏夹'});if(commit(next)){if(folderId===id)folderId=library.folders[0].id;if(activeId&&!library.documents.some(d=>d.id===activeId)){activeId=null;dirty=!!$('source').value}syncActive();renderFolders();status('文件夹已移到回收站。')}},'移到回收站')}
function renderTrash(){hideNameHint();const list=$('trash-list');list.replaceChildren();const entries=library.trash||[];if(!entries.length){const empty=document.createElement('p');empty.className='trash-empty';empty.textContent='回收站为空';list.append(empty);return}entries.slice().reverse().forEach(entry=>{const card=document.createElement('div');card.className='trash-card';const info=document.createElement('div');info.className='trash-info';const title=document.createElement('strong'),name=entry.kind==='folder'?entry.folder.name:entry.document.name;title.textContent=(entry.kind==='folder'?'▱ 文件夹 · ':'文档 · ')+name;setNameHint(title,name);const detail=document.createElement('small');detail.textContent=(entry.kind==='folder'?entry.documents.length+' 份文档':'原文件夹：'+entry.folderName)+' · '+new Date(entry.deletedAt).toLocaleString('zh-CN');info.append(title,detail);const actions=document.createElement('div');actions.className='trash-actions';const restore=document.createElement('button');restore.textContent='恢复';restore.setAttribute('aria-label','恢复 '+name);restore.onclick=()=>{const next=FormatCore.restoreTrash(library,entry.id);if(commit(next)){folderId=entry.kind==='folder'?entry.folder.id:library.documents.find(d=>d.id===entry.document.id).folderId;renderFolders();syncActive();status('已恢复：'+name)}};const purge=document.createElement('button');purge.className='quiet small';purge.textContent='彻底删除';purge.setAttribute('aria-label','彻底删除 '+name);purge.onclick=()=>askConfirm('彻底删除','「'+name+'」将永久删除，无法从回收站恢复。',()=>{const next=clone();next.trash=next.trash.filter(t=>t.id!==entry.id);if(commit(next))status('已彻底删除：'+name)},'彻底删除');actions.append(restore,purge);card.append(info,actions);list.append(card)})}
$('trash-open').onclick=()=>{renderTrash();$('trash-dialog').showModal()};

try{const raw=localStorage.getItem(DRAFT);if(raw){const d=JSON.parse(raw);if(typeof d.content==='string'&&d.content.length<=5e6&&['JSON','XML'].includes(d.type)){setType(d.type);$('source').value=d.content;dirty=!!d.content;if(d.content)status('已恢复上次编辑草稿')}}}catch(e){}
renderFolders();renderTrash();updateInput();renderResult();syncActive();
})();
