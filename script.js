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
  }
}

function loadStats(page){
  const key='stats_'+page;
  const count=Number(localStorage.getItem(key)||'0')+1;
  localStorage.setItem(key,count);
  const el=document.getElementById('stats');
  if(el)el.textContent='Views: '+count;
}

function toggleStats(){
  const s=document.getElementById('stats');
  const b=document.getElementById('stats-btn');
  if(!s||!b)return;
  if(s.style.display==='none'){
    s.style.display='inline';
    b.textContent='Hide Stats';
  }else{
    s.style.display='none';
    b.textContent='Show Stats';
  }
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
});
