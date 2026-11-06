'use strict';
(() => {
  const config = window.JUMPKAT_CONFIG;
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  const paragraphs = (text) => { const node = el('div', undefined, 'prose'); text.split(/\n\s*\n/).forEach(p => node.append(el('p', p))); return node; };
  const date = value => new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value + 'T12:00:00Z'));
  function postRow(post, index) {
    const link = el('a', undefined, 'post-row'); link.href = '/post.html?slug=' + encodeURIComponent(post.id);
    const copy = el('div'); copy.append(el('h3',post.title),el('p',post.summary));
    const meta = el('div', undefined, 'post-meta'); meta.append(el('div',post.tag),el('time',date(post.date))); meta.lastChild.dateTime=post.date;
    const arrow=el('span','↗','arrow'); arrow.setAttribute('aria-hidden','true');
    link.append(el('span',String(index+1).padStart(2,'0'),'number'),copy,meta,arrow); return link;
  }
  async function content() {
    const targets = document.querySelectorAll('[data-projects],[data-posts],[data-post]');
    if (!targets.length) return;
    try {
      const response = await fetch(config.apiBase + '/public/content', {credentials:'omit'});
      if (!response.ok) throw new Error('Unavailable');
      const data = await response.json();
      document.querySelectorAll('[data-projects]').forEach(target => {
        target.replaceChildren();
        data.projects.forEach(project => {
          const article=el('article',undefined,'project');
          article.append(el('p',project.tag,'eyebrow'),el(target.childElementCount ? 'h2' : 'h1',project.title),el('p',project.summary,'hero-copy'),paragraphs(project.body));
          target.append(article);
        });
        if(!data.projects.length) target.append(el('p','The next chapter is taking shape. Watch the blog for updates.','empty'));
      });
      const posts=data.posts.sort((a,b)=>b.date.localeCompare(a.date));
      document.querySelectorAll('[data-posts]').forEach(target=>{target.replaceChildren();posts.slice(0,Number(target.dataset.limit)||posts.length).forEach((p,i)=>target.append(postRow(p,i)));if(!posts.length)target.append(el('p','Development updates are on their way.','empty'));});
      const target=document.querySelector('[data-post]');
      if(target){const post=posts.find(p=>p.id===new URLSearchParams(location.search).get('slug'));target.replaceChildren();if(!post){target.append(el('h1','Post not found.'),el('p','This post may be unpublished. Explore the blog for the latest.'));return;}document.title=post.title+' — Jumpkat';target.append(el('p',post.tag+' / '+date(post.date),'label'),el('h1',post.title),el('p',post.summary,'summary'),el('hr'),paragraphs(post.body));}
    } catch { targets.forEach(target=>{target.replaceChildren(el('p','Updates are temporarily unavailable. Please try again shortly.','empty'));}); }
  }
  async function contact() {
    const form=document.querySelector('#contact-form'); if(!form)return;
    const status=document.querySelector('#contact-status');const button=form.querySelector('button[type=submit]');let preview=false;let widget;
    const say=(text,kind='')=>{status.textContent=text;status.className='form-status '+kind;};
    if(['127.0.0.1','localhost'].includes(location.hostname)){
      try{const r=await fetch('/api/preview-status');preview=r.ok && (await r.json()).preview===true;}catch{/* Static-only preview. */}
    }
    if(preview){button.disabled=false;say('Local preview: messages stay on this Mac. Nothing is sent to Jumpkat.');}
    else if(!config.turnstileSiteKey){say('The form is not available yet. Please email kuba@jumpkat.com.');return;}
    else{
      const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
      script.onload=()=>{widget=window.turnstile.render('#contact-challenge',{sitekey:config.turnstileSiteKey,action:'contact',theme:'auto',callback:()=>{button.disabled=false;say('');},'expired-callback':()=>{button.disabled=true;say('Please complete the spam check again.');},'error-callback':()=>{button.disabled=true;say('Spam protection is unavailable. Please email kuba@jumpkat.com.','error');}});};
      script.onerror=()=>say('Spam protection could not load. Please email kuba@jumpkat.com.','error');document.head.append(script);say('Complete the spam check to send your message.');
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(button.disabled)return;button.disabled=true;say('Sending…');
      const fields=new FormData(form);const payload=Object.fromEntries(fields);payload.token=preview?'local-preview':window.turnstile.getResponse(widget);delete payload['cf-turnstile-response'];
      try{const r=await fetch(config.apiBase+'/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),credentials:'omit'});const result=await r.json();if(!r.ok)throw new Error(result.error||'Your message could not be sent. Please try again later.');form.reset();say(preview?'Saved to the local preview inbox. No email was sent.':'Message received. Thanks for getting in touch.','success');}
      catch(error){say(error.message+' Your message is still here to copy or retry.','error');}
      finally{if(preview)button.disabled=false;else window.turnstile.reset(widget);}
    });
  }
  content();contact();
})();
