function toggleTheme(){
  const root=document.documentElement;
  const current=root.style.getPropertyValue('--bg-color')||getComputedStyle(root).getPropertyValue('--bg-color');
  if(current.trim()==='#000'){
    root.style.setProperty('--bg-color','#fff');
    root.style.setProperty('--text-color','#000');
    localStorage.setItem('theme','light');
  }else{
    root.style.setProperty('--bg-color','#000');
    root.style.setProperty('--text-color','#fff');
    localStorage.setItem('theme','dark');
  }
}

function loadTheme(){
  const saved=localStorage.getItem('theme');
  if(saved==='light'){
    document.documentElement.style.setProperty('--bg-color','#fff');
    document.documentElement.style.setProperty('--text-color','#000');
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
});
