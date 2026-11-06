'use strict';
(() => {
  const cfg=window.JUMPKAT_CONFIG, $=id=>document.getElementById(id);
  let token='', expires=0, doc=null, tab='posts', current=null, dirty=false, busy=false, preview=false, cursor=null;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const say=(text,error=false)=>{$('admin-status').textContent=text;$('admin-status').className='form-status '+(error?'error':'');};
  const abandon=()=>!dirty||confirm('Discard the unsaved changes in this editor?');
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  async function api(path,method='GET',body){
    if(!token||Date.now()>=expires){token='';$('sign-in').hidden=false;throw new Error('Your session has expired. Copy any unsaved text, then sign in again.');}
    const r=await fetch(cfg.apiBase+'/admin/'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store'});
    const data=await r.json();
    if(r.status===401||r.status===403){$('sign-in').hidden=false;throw new Error('Sign-in has expired or this account is not an editor. Copy your unsaved work before signing in again.');}
    if(r.status===409)throw new Error('Someone saved a newer version. Your text is still in the form. Copy it somewhere safe, then reload this page and reapply your changes.');
    if(!r.ok)throw new Error(data.error||'The request could not be completed.');return data;
  }
  function renderList(){
    const list=$('entries');list.replaceChildren();
    doc[tab].forEach(entry=>{const b=node('button',undefined,'entry-button'+(current===entry.id?' selected':''));b.type='button';b.append(node('strong',entry.title),node('small',entry.published?'Published':'Draft'));b.onclick=()=>{if(!busy&&abandon())edit(entry);};list.append(b);});
    if(!doc[tab].length)list.append(node('p','No entries yet.','muted'));
    $('revision-info').textContent='Saved version '+doc.revision+'. Drafts stay private.';
    $('new-entry').textContent=tab==='posts'?'+ New post':'+ New project';
  }
  function renderPreview(){const p=$('entry-preview');p.replaceChildren(node('p','TEXT PREVIEW','label accent'),node('h3',$('entry-title').value),node('p',$('entry-summary').value),node('div',$('entry-body').value));}
  function edit(entry){
    current=entry?.id??null;dirty=false;$('editor').hidden=false;$('choose-entry').hidden=true;
    for(const key of ['title','id','tag','summary','body'])$('entry-'+key).value=entry?.[key]||'';
    $('entry-date').value=entry?.date||new Date().toISOString().slice(0,10);$('entry-date').required=tab==='posts';$('date-field').hidden=tab!=='posts';
    $('entry-published').checked=entry?.published||false;$('entry-id').readOnly=Boolean(entry);$('delete-entry').hidden=!entry;
    $('editor-heading').textContent=(entry?'Edit ':'New ')+(tab==='posts'?'post':'project');renderList();renderPreview();
  }
  function setBusy(value){busy=value;$('save-entry').disabled=value;$('delete-entry').disabled=value;$('new-entry').disabled=value;document.querySelectorAll('[data-tab]').forEach(b=>b.disabled=value);}
  async function save(event){
    event.preventDefault();if(busy)return;
    const entry={};for(const key of ['id','title','tag','summary','body'])entry[key]=$('entry-'+key).value.trim();entry.published=$('entry-published').checked;if(tab==='posts')entry.date=$('entry-date').value;
    if(!current&&doc[tab].some(x=>x.id===entry.id)){say('That URL name already exists. Choose another.',true);return;}
    const next=structuredClone(doc);const i=next[tab].findIndex(x=>x.id===current);if(i<0)next[tab].push(entry);else next[tab][i]=entry;
    setBusy(true);say('Saving…');
    try{doc=await api('content','PUT',next);dirty=false;edit(doc[tab].find(x=>x.id===entry.id));say(entry.published?'Saved and published. The website updates within about a minute.':'Draft saved. It is not visible on the public website.');}
    catch(e){say(e.message,true);}finally{setBusy(false);}
  }
  async function remove(){
    if(busy||!current||!confirm('Delete this entry? If published, it will be removed from the website.'))return;
    const next=structuredClone(doc);next[tab]=next[tab].filter(x=>x.id!==current);setBusy(true);
    try{doc=await api('content','PUT',next);dirty=false;current=null;$('editor').hidden=true;$('choose-entry').hidden=false;renderList();say('Entry deleted.');}catch(e){say(e.message,true);}finally{setBusy(false);}
  }
  async function inbox(append=false){
    $('refresh-inbox').disabled=true;$('more-messages').disabled=true;
    try{const data=await api('messages'+(append&&cursor?'?cursor='+encodeURIComponent(cursor):''));if(!append)$('messages').replaceChildren();
      for(const message of data.messages){const article=node('article',undefined,'message');article.append(node('h3',message.subject),node('p',message.name+' · '+message.email+' · '+new Date(message.createdAt).toLocaleString(),'message-meta'),node('p',message.message,'message-body'));const actions=node('div',undefined,'message-actions');const reply=node('a','Reply by email ↗','button');reply.href='mailto:'+encodeURIComponent(message.email)+'?subject='+encodeURIComponent('Re: '+message.subject);const del=node('button','Delete message','button danger');del.onclick=async()=>{if(!confirm('Permanently delete this message from the inbox?'))return;del.disabled=true;try{await api('messages/'+encodeURIComponent(message.id),'DELETE');article.remove();say('Message deleted.');}catch(e){say(e.message,true);del.disabled=false;}};actions.append(reply,del);article.append(actions);$('messages').append(article);}
      cursor=data.cursor||null;$('more-messages').hidden=!cursor;if(!$('messages').children.length)$('messages').append(node('p','No messages in the inbox.','empty'));
    }catch(e){say(e.message,true);}finally{$('refresh-inbox').disabled=false;$('more-messages').disabled=false;}
  }
  async function openDashboard(){
    try{doc=await api('content');$('sign-in').hidden=true;$('dashboard').hidden=false;renderList();say('');}catch(e){say(e.message,true);}
  }
  const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  function authURL(path){const url=new URL(path,cfg.authDomain);if(url.protocol!=='https:'||!url.hostname.endsWith('.amazoncognito.com'))throw new Error('Sign-in configuration is invalid.');return url;}
  async function login(){
    if(!abandon())return;
    try{const verifier=base64url(crypto.getRandomValues(new Uint8Array(48)));const state=base64url(crypto.getRandomValues(new Uint8Array(32)));sessionStorage.setItem('jumpkat-oauth',JSON.stringify({verifier,state,at:Date.now()}));const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));const url=authURL('/oauth2/authorize');url.search=new URLSearchParams({response_type:'code',client_id:cfg.clientId,redirect_uri:location.origin+'/admin/',scope:'openid email',state,code_challenge:challenge,code_challenge_method:'S256'});dirty=false;location.assign(url);}
    catch(e){say('Could not start sign-in: '+e.message,true);}
  }
  async function callback(){
    const params=new URLSearchParams(location.search);if(!params.has('code')&&!params.has('error'))return;
    const raw=sessionStorage.getItem('jumpkat-oauth');sessionStorage.removeItem('jumpkat-oauth');history.replaceState(null,'','/admin/');
    if(params.has('error'))throw new Error('Sign-in was cancelled or declined. Please try again.');
    let saved;try{saved=JSON.parse(raw);}catch{throw new Error('Invalid sign-in session. Please start again.');}
    if(!saved||saved.state!==params.get('state')||Date.now()-saved.at>600000)throw new Error('Sign-in session is missing or expired. Please start again.');
    const response=await fetch(authURL('/oauth2/token'),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:cfg.clientId,code:params.get('code'),redirect_uri:location.origin+'/admin/',code_verifier:saved.verifier}),credentials:'omit'});
    const data=await response.json();if(!response.ok||!data.access_token)throw new Error('Sign-in could not finish. Please try again.');token=data.access_token;expires=Date.now()+data.expires_in*1000;await openDashboard();
  }
  $('editor').addEventListener('input',()=>{dirty=true;renderPreview();});$('editor').addEventListener('submit',save);$('delete-entry').onclick=remove;
  $('new-entry').onclick=()=>{if(!busy&&abandon())edit(null);};$('refresh-inbox').onclick=()=>inbox();$('more-messages').onclick=()=>inbox(true);
  document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{if(busy||!abandon())return;dirty=false;tab=button.dataset.tab;current=null;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));$('content-panel').hidden=tab==='messages';$('inbox-panel').hidden=tab!=='messages';$('editor').hidden=true;$('choose-entry').hidden=false;say('');if(tab==='messages')inbox();else renderList();});
  $('logout-button').onclick=()=>{if(!abandon())return;token='';expires=0;dirty=false;doc=null;$('dashboard').hidden=true;$('messages').replaceChildren();$('editor').reset();$('sign-in').hidden=false;if(preview){say('Signed out of the local preview.');return;}const url=authURL('/logout');url.search=new URLSearchParams({client_id:cfg.clientId,logout_uri:location.origin+'/admin/'});location.assign(url);};
  $('login-button').onclick=login;
  const exportButton=node('button','Export content backup','button');exportButton.type='button';
  exportButton.onclick=()=>{if(!doc)return;const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'}));const link=node('a');link.href=url;link.download='jumpkat-content-private-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Content backup downloaded. It includes drafts: keep it outside the public website. Unsaved form edits are not included.');};
  document.querySelector('#dashboard .admin-toolbar').append(exportButton);
  async function init(){
    if(['localhost','127.0.0.1'].includes(location.hostname)){try{const r=await fetch('/api/preview-status');preview=r.ok&&(await r.json()).preview===true;}catch{/* Production auth only. */}}
    if(preview){$('preview-banner').hidden=false;$('preview-login').hidden=false;$('login-button').hidden=true;$('login-help').textContent='Try the editor with local preview data. No AWS account or password is used.';$('preview-login').onclick=async()=>{try{const r=await fetch('/api/preview-session');if(!r.ok)throw new Error('Preview is unavailable.');token=(await r.json()).token;expires=Date.now()+3600000;await openDashboard();}catch(e){say(e.message,true);}};}
    else if(cfg.authDomain&&cfg.clientId){$('login-button').disabled=false;try{await callback();}catch(e){say(e.message,true);}}
    else{$('login-help').textContent='Admin sign-in will be available after the AWS setup. This page does not grant access to private data.';}
  }
  init();
})();
