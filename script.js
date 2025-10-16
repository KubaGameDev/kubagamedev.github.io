function toggleTheme(){
  const root=document.documentElement;
  const current=root.style.getPropertyValue('--bg-color')||getComputedStyle(root).getPropertyValue('--bg-color');
  if(current.trim()==='#000'){
    root.style.setProperty('--bg-color','#fff');
    root.style.setProperty('--text-color','#000');
    root.style.setProperty('--logo-filter','invert(0)');
    localStorage.setItem('theme','light');
  }else{
    root.style.setProperty('--bg-color','#000');
    root.style.setProperty('--text-color','#fff');
    root.style.setProperty('--logo-filter','invert(1)');
    localStorage.setItem('theme','dark');
  }
}

function loadTheme(){
  const saved=localStorage.getItem('theme');
  if(saved==='light'){
    document.documentElement.style.setProperty('--bg-color','#fff');
    document.documentElement.style.setProperty('--text-color','#000');
    document.documentElement.style.setProperty('--logo-filter','invert(0)');
  }else{
    // Default to dark theme (saved==='dark' or no saved preference)
    document.documentElement.style.setProperty('--bg-color','#000');
    document.documentElement.style.setProperty('--text-color','#fff');
    document.documentElement.style.setProperty('--logo-filter','invert(1)');
  }
}

const PLAUSIBLE_SITE='jumpkat.com';
// Replace with your Plausible API key if you wish to show global stats
const PLAUSIBLE_API_KEY='YOUR_API_KEY_HERE';

async function loadStats(page){
  const el=document.getElementById('stats');
  if(!el)return;
  
  // Track page views
  const viewKey='allTimeViews';
  const currentViews=Number(localStorage.getItem(viewKey)||'0')+1;
  localStorage.setItem(viewKey,currentViews);
  
  try{
    const url=`https://plausible.io/api/v1/stats/aggregate?site_id=${PLAUSIBLE_SITE}&period=all&metrics=pageviews&filters=event%3Apage%3D%3D/${page}`;
    const res=await fetch(url,{headers:{'Authorization':'Bearer '+PLAUSIBLE_API_KEY}});
    if(!res.ok)throw new Error('bad response');
    const data=await res.json();
    const count=data.results.pageviews.value||0;
    el.textContent='Views: '+count+' | Total Site Views: '+currentViews;
  }catch(err){
    const key='stats_'+page;
    const count=Number(localStorage.getItem(key)||'0')+1;
    localStorage.setItem(key,count);
    el.textContent='Views: '+count+' (local) | Total Site Views: '+currentViews;
  }
}

async function loadClicks(eventName){
  const el=document.getElementById('stats');
  if(!el)return;
  
  // Track total clicks
  const clickKey='allTimeClicks';
  const currentClicks=Number(localStorage.getItem(clickKey)||'0');
  
  try{
    const url=`https://plausible.io/api/v1/stats/aggregate?site_id=${PLAUSIBLE_SITE}&period=all&metrics=events&filters=event:name==${eventName}`;
    const res=await fetch(url,{headers:{'Authorization':'Bearer '+PLAUSIBLE_API_KEY}});
    if(!res.ok)throw new Error('bad response');
    const data=await res.json();
    const count=data.results.events.value||0;
    el.textContent+='\nClicks: '+count+' | Total Site Clicks: '+currentClicks;
  }catch(err){
    el.textContent+='\nTotal Site Clicks: '+currentClicks;
  }
}

function toggleStats(){
  const s=document.getElementById('stats');
  if(!s)return;
  s.style.display=s.style.display==='none'? 'inline' : 'none';
}

function particles(){
  const canvas=document.getElementById('particles');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  let width,height,particles=[];
  function resize(){
    width=canvas.width=window.innerWidth;
    height=canvas.height=window.innerHeight;
  }
  window.addEventListener('resize',resize);
  resize();
  function addParticle(){
    particles.push({x:Math.random()*width,y:-10,s:2+Math.random()*3,v:0.5+Math.random(),life:100+Math.random()*100});
  }
  function update(){
    ctx.clearRect(0,0,width,height);
    if(particles.length<100)addParticle();
    particles.forEach(p=>{
      p.y+=p.v;
      p.life--;
      ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text-color');
      ctx.globalAlpha=Math.max(p.life/200,0);
      ctx.fillRect(p.x,p.y,p.s,p.s);
    });
    particles=particles.filter(p=>p.life>0);
    requestAnimationFrame(update);
  }
  update();
}

document.addEventListener('DOMContentLoaded',()=>{
  loadTheme();
  particles();
  const page=location.pathname.replace(/^\//,'');
  loadStats(page||'index');
  loadClicks('stats-click');
  attachEventTracking();
  albumReveal();
});

function albumReveal(){
  const album=document.getElementById('album');
  const marker=document.querySelector('footer p');
  if(!album||!marker)return;
  function check(){
    const rect=marker.getBoundingClientRect();
    if(rect.top<=window.innerHeight)album.style.display='block';
  }
  document.addEventListener('scroll',check);
  check();
}

function attachEventTracking(){
  document.querySelectorAll('[data-event]').forEach(el=>{
    el.addEventListener('click',()=>{
      // Track click in localStorage
      const clickKey='allTimeClicks';
      const currentClicks=Number(localStorage.getItem(clickKey)||'0')+1;
      localStorage.setItem(clickKey,currentClicks);
      
      if(window.plausible)window.plausible(el.dataset.event);
    });
  });
}
