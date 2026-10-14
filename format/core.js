(function(root){
'use strict';
function restoreQuotes(source){return source.replace(/&quot;/g,'"')}
function normalizeJSON(source){
 const original=source.replace(/^\uFEFF/,'').trim();
 let originalValid=false;
 try{const value=JSON.parse(original);originalValid=true;if(typeof value!=='string')return original}catch(e){}
 // Decode only the outer transport representation. Never walk or rewrite
 // strings inside a valid object, and never serialize parsed numeric values.
 const queue=[{text:original,depth:0}],seen=new Set();
 while(queue.length){
  const {text,depth}=queue.shift();if(seen.has(text)||depth>6)continue;seen.add(text);
  try{
   const value=JSON.parse(text);
   if(value!==null&&typeof value==='object')return text.trim();
   if(typeof value==='string'&&/[{\[]/.test(value))queue.push({text:value.trim(),depth:depth+1});
   continue;
  }catch(e){}
  if(!/[{\[]/.test(text))continue;
  if(text.startsWith('"')&&text.endsWith('"'))queue.push({text:text.slice(1,-1).trim(),depth:depth+1});
  const decoded=text.replace(/\\(?:u[\da-fA-F]{4}|["\\/bfnrt])/g,escape=>JSON.parse('"'+escape+'"'));
  if(decoded!==text)queue.push({text:decoded,depth:depth+1});
 }
 if(originalValid)return original;
 JSON.parse(original); // Report the original syntax error when no valid structure exists.
 return original;
}
function formatJSON(source,spaces=2){
  source=normalizeJSON(source);
  JSON.parse(source); // Only validates syntax. Output uses raw tokens to preserve large numbers.
  const tokens=source.match(/"(?:\\[\s\S]|[^"\\])*"|[^\s"{}\[\],:]+|[{}\[\],:]/g)||[];
  if(!spaces)return tokens.join('');
  let depth=0,out='';const pad=()=> ' '.repeat(depth*spaces);
  tokens.forEach((token,index)=>{
    const next=tokens[index+1],prev=tokens[index-1];
    if(token==='{'||token==='['){out+=token;depth++;if(next!=='}'&&next!==']')out+='\n'+pad()}
    else if(token==='}'||token===']'){depth--;if(prev!=='{'&&prev!=='[')out+='\n'+pad();out+=token}
    else if(token===',')out+=',\n'+pad();else if(token===':')out+=': ';else out+=token;
  });return out;
}
function browserValidate(source){
 const doc=new DOMParser().parseFromString(source,'application/xml');
 const errors=doc.getElementsByTagNameNS('*','parsererror');
 if(errors.length)throw new Error(errors[0].textContent.trim().slice(0,400));
}
function formatXML(source,spaces=2,validate=browserValidate){
 if(/<!DOCTYPE\b/i.test(source))throw new Error('暂不支持含 DTD 的 XML，请移除 DOCTYPE 后再格式化。');
 validate(source);
 const tokens=source.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<(?:"[^"]*"|'[^']*'|[^'">])*>|[^<]+/g)||[];
 const tree={children:[]},stack=[tree];
 for(const raw of tokens){
   const parent=stack[stack.length-1];
   if(/^<\//.test(raw)){const node=stack.pop();node.close=raw}
   else if(/^<(?![!?/])/.test(raw)&&! /\/\s*>$/.test(raw)){
     const setting=raw.match(/\bxml:space\s*=\s*(['"])(preserve|default)\1/);
     const node={open:raw,children:[],preserve:setting?setting[2]==='preserve':!!parent.preserve};parent.children.push(node);stack.push(node);
   }else parent.children.push({raw});
 }
 const original=node=>node.raw!==undefined?node.raw:node.open+node.children.map(original).join('')+(node.close||'');
 function render(node,depth){
   const pad=' '.repeat(depth*spaces);
   if(node.raw!==undefined)return pad+node.raw;
   const mixed=node.children.some(child=>child.raw!==undefined&&(!child.raw.startsWith('<')&&child.raw.trim()||child.raw.startsWith('<![CDATA[')));
   if(mixed||node.preserve||!node.children.some(child=>child.open||child.raw?.startsWith('<')))return pad+original(node);
   const children=node.children.filter(child=>child.raw===undefined||child.raw.trim());
   if(!children.length)return pad+node.open+(node.close||'');
   return pad+node.open+'\n'+children.map(child=>render(child,depth+1)).join('\n')+'\n'+pad+node.close;
 }
 return tree.children.filter(node=>node.raw===undefined||node.raw.trim()).map(node=>render(node,0)).join('\n');
}
function validateBackup(data){
 if(!data||data.version!==1||!Array.isArray(data.folders)||!Array.isArray(data.documents))throw new Error('不是有效的 Format Desk 备份');
 const ids=new Set(),folderIds=new Set();
 function checkId(id){if(typeof id!=='string'||!id||ids.has(id))throw new Error('备份中包含重复或无效 ID');ids.add(id)}
 function checkName(name){if(typeof name!=='string'||!name.trim()||name.length>200)throw new Error('备份名称无效')}
 function readFolder(f){checkId(f.id);checkName(f.name);return {id:f.id,name:f.name}}
 function readDocument(d,allowedFolders){checkId(d.id);checkName(d.name);if(typeof d.folderId!=='string'||!d.folderId||(allowedFolders&&!allowedFolders.has(d.folderId))||!['JSON','XML'].includes(d.type)||typeof d.content!=='string'||d.content.length>5e6)throw new Error('备份文件内容或所属文件夹无效');return {id:d.id,folderId:d.folderId,name:d.name,type:d.type,content:d.content}}
 const folders=data.folders.map(f=>{const folder=readFolder(f);folderIds.add(f.id);return folder});
 const documents=data.documents.map(d=>readDocument(d,folderIds));
 const result={version:1,folders,documents};
 if(data.trash!==undefined){
  if(!Array.isArray(data.trash))throw new Error('回收站格式无效');
  result.trash=data.trash.map(item=>{
   checkId(item.id);if(typeof item.deletedAt!=='string'||!Number.isFinite(Date.parse(item.deletedAt)))throw new Error('回收站删除时间无效');
   if(item.kind==='folder'){const folder=readFolder(item.folder);if(!Array.isArray(item.documents))throw new Error('回收站文件夹内容无效');return {id:item.id,kind:'folder',deletedAt:item.deletedAt,folder,documents:item.documents.map(d=>readDocument(d,new Set([folder.id])))}}
   if(item.kind==='document'){checkName(item.folderName);return {id:item.id,kind:'document',deletedAt:item.deletedAt,folderName:item.folderName,document:readDocument(item.document)}}
   throw new Error('回收站类型无效');
  });
 }
 return result;
}
function trashFolder(data,folderId,entryId,deletedAt){
 const next=validateBackup(data),folder=next.folders.find(f=>f.id===folderId);if(!folder)throw new Error('文件夹不存在');
 const documents=next.documents.filter(d=>d.folderId===folderId);
 next.folders=next.folders.filter(f=>f.id!==folderId);next.documents=next.documents.filter(d=>d.folderId!==folderId);
 next.trash=[...(next.trash||[]),{id:entryId,kind:'folder',deletedAt,folder,documents}];return validateBackup(next);
}
function trashDocument(data,documentId,entryId,deletedAt){
 const next=validateBackup(data),document=next.documents.find(d=>d.id===documentId);if(!document)throw new Error('文档不存在');
 const folderName=next.folders.find(f=>f.id===document.folderId).name;
 next.documents=next.documents.filter(d=>d.id!==documentId);next.trash=[...(next.trash||[]),{id:entryId,kind:'document',deletedAt,folderName,document}];return validateBackup(next);
}
function restoreTrash(data,entryId){
 const next=validateBackup(data),entry=(next.trash||[]).find(t=>t.id===entryId);if(!entry)throw new Error('回收站项目不存在');
 next.trash=next.trash.filter(t=>t.id!==entryId);
 if(entry.kind==='folder'){next.folders.push(entry.folder);next.documents.push(...entry.documents)}
 else{let folder=next.folders.find(f=>f.id===entry.document.folderId)||next.folders[0];if(!folder){folder={id:'recovered-'+entry.id,name:'恢复的收藏'};next.folders.push(folder)}next.documents.push({...entry.document,folderId:folder.id})}
 return validateBackup(next);
}
function mergeBackup(current,incoming,makeId){
 const next=validateBackup(current),data=validateBackup(incoming),folderMap=new Map();
 const mapFolder=id=>{if(!folderMap.has(id))folderMap.set(id,makeId());return folderMap.get(id)};
 const mapDocument=d=>({...d,id:makeId(),folderId:mapFolder(d.folderId)});
 next.folders.push(...data.folders.map(f=>({id:mapFolder(f.id),name:f.name})));next.documents.push(...data.documents.map(mapDocument));
 next.trash=[...(next.trash||[]),...(data.trash||[]).map(t=>t.kind==='folder'?{id:makeId(),kind:'folder',deletedAt:t.deletedAt,folder:{id:mapFolder(t.folder.id),name:t.folder.name},documents:t.documents.map(mapDocument)}:{id:makeId(),kind:'document',deletedAt:t.deletedAt,folderName:t.folderName,document:mapDocument(t.document)})];
 return validateBackup(next);
}
const api={formatJSON,formatXML,validateBackup,restoreQuotes,normalizeJSON,trashFolder,trashDocument,restoreTrash,mergeBackup};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FormatCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
