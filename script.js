/* =====================================================
   LA SÚPER LIGA — JS COMPLETO CORREGIDO
   ===================================================== */
const STORE='lsl_v5';
const ADMIN_DEFAULT='Admin123';
// ---- SUPABASE — credenciales hardcodeadas ----
const SB_URL='https://szojprkfdmggfegxksgk.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN6b2pwcmtmZG1nZ2ZlZ3hrc2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MDMxNDcsImV4cCI6MjA5NDk3OTE0N30.ocRZTP3CH-fb8ZnMm7zuMlGqlkIBFYxrINn4fxkdoxk';
const SB_BUCKET='lsl-images';
let D={
  cfg:{name:'La Súper Liga',short:'LSL',season:'T9 "Reinicio"',status:'en_curso',seasonDesc:'',logo:'',rules:'',adminPass:ADMIN_DEFAULT},
  user:{name:'joelito',bio:'',avatar:'',banner:'',favTeam:'',isAdmin:false},
  teams:[],matches:[],news:[],players:[],channels:[],sanctions:[],seasons:[],notifications:[],
  settings:{theme:'dark'},
  editTransforms:{}
};
let pending={};
let deferredPWA=null;
let logoTapCount=0,logoTapTimer=null,logoHoldTimer=null,logoHoldProgress=null;
let curPage='inicio';
let ambientDebounce=null;
let reminders={};
let editMode=false;

let _saveTimer=null;
/* ---- Persistencia con debounce — evita stringify repetido ---- */
function save(){
  _doSave();
  // Si es admin, sincronizar con Supabase automáticamente
  if(D.user.isAdmin && _sbReady){
    clearTimeout(window._autoSyncTimer);
    window._autoSyncTimer=setTimeout(()=>pushToSupabase(),1500);
  }
}
function saveLater(){
  // Para cambios rápidos (scores en vivo), esperar 300ms
  clearTimeout(_saveTimer);
  _saveTimer=setTimeout(_doSave,300);
}
function _doSave(){
  try{
    localStorage.setItem(STORE,JSON.stringify(D));
  }catch(e){
    try{
      // Storage lleno — limpiar base64 de imágenes (ya están en Supabase)
      const D2=JSON.parse(JSON.stringify(D));
      const strip=s=>s&&s.startsWith('data:')?'':s;
      D2.teams=D2.teams.map(t=>({...t,logo:strip(t.logo)}));
      D2.players=D2.players.map(p=>({...p,photo:strip(p.photo)}));
      D2.news=D2.news.map(n=>({...n,image:strip(n.image)}));
      D2.cfg.logo=strip(D2.cfg.logo);
      localStorage.setItem(STORE,JSON.stringify(D2));
    }catch(e2){console.warn('localStorage lleno')}
  }
}
function load(){
  try{
    const r=localStorage.getItem(STORE);
    if(r){const p=JSON.parse(r);D=deepMerge(D,p)}
  }catch(e){console.warn('Error al cargar datos',e)}
}
function deepMerge(target,source){
  const r={...target};
  for(const k of Object.keys(source)){
    if(source[k]!==null&&typeof source[k]==='object'&&!Array.isArray(source[k])){
      r[k]=deepMerge(target[k]||{},source[k]);
    }else{r[k]=source[k]}
  }
  return r;
}
function $(id){return document.getElementById(id)}

/* ---- INIT ---- */
function init(){
  load();
  // Check login
  if(!checkLogin())return;
  
  // Ensure default teams
  if(!D.teams.length){
    D.teams=[
      {id:'lanza-all',name:'Lanza All',logo:'',pj:0,pg:0,pp:0,pe:0,gf:0,gc:0,pts:0,adj:0},
      {id:'la-t-de',name:'La T De Dios',logo:'',pj:0,pg:0,pp:0,pe:0,gf:0,gc:0,pts:0,adj:0},
      {id:'lanza-air',name:'Lanza Air',logo:'',pj:0,pg:0,pp:0,pe:0,gf:0,gc:0,pts:0,adj:0},
      {id:'todo-dios',name:'Todo De Dios',logo:'',pj:0,pg:0,pp:0,pe:0,gf:0,gc:0,pts:0,adj:0}
    ];
    D.matches=[
      {id:'m1',homeTeam:'lanza-all',awayTeam:'la-t-de',homeScore:0,awayScore:0,
        datetime:'2026-04-17T19:31:00',status:'proximo',stadium:'',channel:'',events:[],stats:{}},
      {id:'m2',homeTeam:'lanza-air',awayTeam:'todo-dios',homeScore:0,awayScore:0,
        datetime:'2026-04-18T13:18:00',status:'proximo',stadium:'Nose',channel:'',events:[],stats:{}}
    ];
    save();
  }
  D.teams.forEach(t=>{if(t.pe===undefined)t.pe=0});
  if(!D.cfg.adminPass)D.cfg.adminPass=ADMIN_DEFAULT;
  if(!D.editTransforms)D.editTransforms={};
  // Single warm theme — no toggle needed
  updateHdr();updateGreet();updateUser();renderAll();checkAdmin();
  restoreLastPage();
  setupLogoHold();setupBroadcast();setupPWA();setupManifest();
  initSupabase();
  // Sync inicial — sin bloquear render
    // Aplicar settings guardados
  if(D.settings){
    const s=D.settings;
    if(s.anims===false){const r=document.documentElement;r.style.setProperty('--spd','0s');r.style.setProperty('--slow','0s');}
    if(s.glass===false){const h=$('hdr'),n=$('nav');if(h)h.style.backdropFilter='none';if(n)n.style.backdropFilter='none';}
    if(s.accentHex)document.documentElement.style.setProperty('--accent',s.accentHex);
    if(s.accentRgb)document.documentElement.style.setProperty('--amb-color',s.accentRgb);
  }
  setTimeout(()=>syncOnLoad(), 1500);
  // Polling cada 45s — todos los usuarios ven cambios del admin
  setInterval(()=>{if(_sbReady&&!D.user.isAdmin)syncOnLoad()},45000);
  setInterval(()=>{if(checkAutoLive())renderAll()},30000);
  setInterval(updateGreet,60000);
  setTimeout(maybeShowPWABanner,5000);
  setTimeout(prefillMatchDate,400);
}

/* ---- LOGIN SYSTEM ---- */
function checkLogin(){
  const savedName=localStorage.getItem('lsl_username');
  if(savedName){
    D.user.name=savedName;
    $('login-screen').classList.add('hidden');
    return true;
  }
  // Show login screen
  $('login-screen').classList.remove('hidden');
  // Update logo
  const li=$('login-logo-img'),fb=$('login-logo-fb');
  if(D.cfg.logo){li.src=D.cfg.logo;li.style.display='block';fb.style.display='none'}
  else{fb.textContent=D.cfg.short||'LSL'}
  $('login-app-name').textContent=D.cfg.name||'La Súper Liga';
  setTimeout(()=>$('login-name-input')?.focus(),300);
  return false;
}
function submitLogin(){
  const name=$('login-name-input').value.trim();
  if(!name||name.length<2){toast('⚠️ Ingresá un nombre válido');$('login-name-input').focus();return}
  localStorage.setItem('lsl_username',name);
  D.user.name=name;
  save();
  $('login-screen').classList.add('hidden');
  init(); // Re-initialize with user name
  toast(`👋 ¡Bienvenido/a, ${name}!`);
}

/* ---- BROADCAST ---- */
let bc=null;
function setupBroadcast(){
  try{bc=new BroadcastChannel('lsl_live');bc.onmessage=()=>{load();renderAll();updateHdr()}}catch(e){}
}
function broadcastUpdate(){try{bc?.postMessage({ts:Date.now()})}catch(e){}}

/* ---- PWA ---- */
function setupPWA(){
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();deferredPWA=e;
    const btn=$('sm-pwa-btn');if(btn)btn.style.display='flex';
  });
  window.addEventListener('appinstalled',()=>{
    toast('✅ ¡App instalada correctamente!');
    localStorage.setItem('lsl_pwa_ok','1');
  });
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').then(reg=>{
      console.log('✅ SW OK, scope:',reg.scope);
      window._swReg=reg;
      if('PushManager' in window && 'Notification' in window && Notification.permission==='granted'){
        subscribeToPush(reg);
      }
      /* ---- Sistema de actualización automática ----
         Cuando hay un sw.js nuevo en el servidor, el navegador lo descarga
         e instala en segundo plano (sin afectar la sesión actual). Acá
         detectamos ese momento y avisamos al usuario. */
      reg.addEventListener('updatefound',()=>{
        const newWorker=reg.installing;
        if(!newWorker)return;
        newWorker.addEventListener('statechange',()=>{
          if(newWorker.state==='installed'&&navigator.serviceWorker.controller){
            // 'installed' + ya había un SW controlando la página = es una
            // actualización real (no la primera instalación)
            mostrarCartelActualizacion(newWorker);
          }
        });
      });
    }).catch(err=>{
      console.warn('SW registration failed:',err);
    });
    navigator.serviceWorker.addEventListener('message',e=>{
      if(e.data?.type==='lsl-push'&&typeof triggerIslandNotify==='function'){
        triggerIslandNotify(e.data.title||'La Súper Liga',e.data.body||'');
      }
    });
  }
}

/* ---- Cartel de "nueva versión disponible" ----
   Usa el toast existente para avisar y un confirm() nativo para la acción,
   porque el toast se auto-oculta a los 2.8s y no alcanza para decidir. */
function mostrarCartelActualizacion(newWorker){
  toast('🚀 Nueva versión disponible');
  const actualizar=confirm('🚀 Nueva versión disponible. ¿Actualizar?');
  if(!actualizar)return;
  const waiting=(newWorker&&newWorker.state==='installed')?newWorker:(window._swReg&&window._swReg.waiting);
  if(waiting)waiting.postMessage({type:'SKIP_WAITING'});
  window.location.reload(true);
}
function setupManifest(){
  // ANTES: acá se generaba un manifest dinámico vía Blob URL y se inyectaba
  // en <link rel="manifest">. Eso es la causa real de que la PWA no abra en
  // standalone: Chrome/Android necesita el manifest disponible como un
  // archivo ESTÁTICO (manifest.json) desde el primer momento para decidir
  // si la app abre en pantalla completa — un blob: URL generado por JS
  // después de cargar la página no siempre llega a tiempo (o se pierde al
  // reabrir desde el ícono), así que termina abriendo con la barra de Chrome.
  // Ahora el manifest vive en /manifest.json (estático, confiable) y acá
  // solo actualizamos lo que SÍ es seguro cambiar en caliente: título y color.
  const t=$('app-title');if(t)t.textContent=D.cfg.name||'La Súper Liga';
  const tm=$('theme-color-meta');if(tm)tm.content='#080c14';
}
function maybeShowPWABanner(){
  if(deferredPWA&&!localStorage.getItem('lsl_pwa_ok')){
    const b=$('pwa-banner');
    updatePWABannerLogo();
    b.classList.add('show');
  }
}
function updatePWABannerLogo(){
  const pi=$('pwab-img'),pf=$('pwab-fb');
  if(D.cfg.logo){pi.src=D.cfg.logo;pi.style.display='block';pf.style.display='none'}
  else{pi.style.display='none';pf.style.display=''}
  $('pwab-title').textContent=D.cfg.name||'La Súper Liga';
}
function installPWA(){
  $('pwa-banner').classList.remove('show');
  if(deferredPWA){deferredPWA.prompt();deferredPWA.userChoice.then(r=>{if(r.outcome==='accepted'){localStorage.setItem('lsl_pwa_ok','1');$('sm-pwa-btn').style.display='none';toast('✅ App instalada')}deferredPWA=null})}
  else toast('💡 Usa "Agregar a pantalla de inicio" del navegador');
}
function dismissPWA(){$('pwa-banner').classList.remove('show');localStorage.setItem('lsl_pwa_ok','dismissed')}
function shareApp(){if(navigator.share)navigator.share({title:D.cfg.name,url:location.href}).catch(()=>{});else{navigator.clipboard?.writeText(location.href);toast('Link copiado')}}
function updateNotifLabel(){
  const lbl=$('notif-perm-lbl');if(!lbl)return;
  const p='Notification' in window?Notification.permission:'not-supported';
  lbl.textContent=p==='granted'?'Activadas ✓':p==='denied'?'Bloqueadas':'Toca para activar';
}

/* ---- ADMIN ACCESS — LOGO HOLD 3s ---- */
function setupLogoHold(){
  const el=$('hlogo');if(!el)return;
  function startHold(){
    logoHoldTimer=setTimeout(()=>{openAdminGate()},3000);
    // Visual ring progress
    let start=null;
    const ring=$('hlogo-ring');
    ring.style.opacity='1';
    function anim(ts){
      if(!start)start=ts;
      const pct=Math.min((ts-start)/3000,1);
      ring.style.background=`conic-gradient(var(--text) ${pct*360}deg, transparent 0deg)`;
      ring.style.webkitMask='linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)';
      ring.style.webkitMaskComposite='destination-out';
      ring.style.maskComposite='exclude';
      if(pct<1)logoHoldProgress=requestAnimationFrame(anim);
    }
    logoHoldProgress=requestAnimationFrame(anim);
  }
  function cancelHold(){
    clearTimeout(logoHoldTimer);
    cancelAnimationFrame(logoHoldProgress);
    $('hlogo-ring').style.opacity='0';
    $('hlogo-ring').style.background='';
  }
  el.addEventListener('touchstart',startHold,{passive:true});
  el.addEventListener('touchend',cancelHold,{passive:true});
  el.addEventListener('touchmove',cancelHold,{passive:true});
  el.addEventListener('mousedown',startHold);
  el.addEventListener('mouseup',cancelHold);
  el.addEventListener('mouseleave',cancelHold);
}
function onLogoTap(){
  logoTapCount++;
  clearTimeout(logoTapTimer);
  logoTapTimer=setTimeout(()=>{logoTapCount=0},700);
  if(logoTapCount>=5){logoTapCount=0;openAdminGate()}
}
function openAdminGate(){
  if(D.user.isAdmin){go('admin');return}
  $('gate-pass').value='';$('gate-err').textContent='';
  $('admin-gate').classList.add('open');
  setTimeout(()=>$('gate-pass').focus(),300);
}
function closeAdminGate(){$('admin-gate').classList.remove('open')}
function verifyAdmin(){
  const pass=$('gate-pass').value;
  if(pass===(D.cfg.adminPass||ADMIN_DEFAULT)){
    D.user.isAdmin=true;save();checkAdmin();closeAdminGate();go('admin');toast('✅ Bienvenido Admin');
  }else{
    $('gate-err').textContent='Contraseña incorrecta';
    $('gate-pass').value='';$('gate-pass').focus();
  }
}
function checkAdmin(){
  const isA=D.user.isAdmin;
  $('ni-admin').classList.toggle('hidden',!isA);
  $('sm-admin-item').style.display=isA?'flex':'none';
  $('sm-urole').textContent=isA?'Administrador':'Miembro';
}

/* ---- EDIT MODE (drag / scale / rotate) ---- */
function toggleEditMode(){
  editMode=!editMode;
  $('edit-bar').classList.toggle('hidden',!editMode);
  $('edit-mode-toggle').textContent=editMode?'✏️ Salir edición':'✏️ Editar UI';
  if(editMode)activateEditMode();
  else deactivateEditMode();
}
function activateEditMode(){
  const targets=[...document.querySelectorAll('.sec,.greet,.hscroll,.stw')];
  targets.forEach(el=>{
    el.classList.add('editable');
    const id=el.id||el.className.split(' ')[0];
    if(D.editTransforms[id]){el.style.transform=D.editTransforms[id]}
    makeDraggable(el,id);
  });
}
function deactivateEditMode(){
  document.querySelectorAll('.editable').forEach(el=>{
    el.classList.remove('editable');
    el._dragCleanup?.();
  });
}
function makeDraggable(el,id){
  let startX=0,startY=0,curX=0,curY=0;
  const saved=D.editTransforms[id]||'';
  // parse existing translate
  const m=saved.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  curX=m?parseFloat(m[1]):0;curY=m?parseFloat(m[2]):0;

  function onDown(e){
    if(!editMode)return;
    const src=e.touches?e.touches[0]:e;
    startX=src.clientX-curX;startY=src.clientY-curY;
    document.addEventListener('mousemove',onMove);document.addEventListener('touchmove',onMove,{passive:false});
    document.addEventListener('mouseup',onUp);document.addEventListener('touchend',onUp);
    e.preventDefault();
  }
  function onMove(e){
    const src=e.touches?e.touches[0]:e;
    curX=src.clientX-startX;curY=src.clientY-startY;
    el.style.transform=`translate(${curX}px,${curY}px)`;
    e.preventDefault();
  }
  function onUp(){
    document.removeEventListener('mousemove',onMove);document.removeEventListener('touchmove',onMove);
    document.removeEventListener('mouseup',onUp);document.removeEventListener('touchend',onUp);
    D.editTransforms[id]=el.style.transform;
  }
  el.addEventListener('mousedown',onDown);el.addEventListener('touchstart',onDown,{passive:false});
  el._dragCleanup=()=>{el.removeEventListener('mousedown',onDown);el.removeEventListener('touchstart',onDown)};
}
function saveEditMode(){
  save();editMode=false;$('edit-bar').classList.add('hidden');$('edit-mode-toggle').textContent='✏️ Editar UI';
  deactivateEditMode();toast('✅ Transformaciones guardadas');
}
function resetEditMode(){D.editTransforms={};save();document.querySelectorAll('.editable').forEach(el=>el.style.transform='');toast('🔄 Posiciones reseteadas')}

/* ---- NAV ---- */
function go(p){
  if(curPage===p&&p!=='admin')return;
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(x=>x.classList.remove('on'));
  const pg=$('pg-'+p),ni=$('ni-'+p);
  if(pg){pg.classList.add('active');curPage=p}
  if(ni)ni.classList.add('on');
  $('scroll').scrollTop=0;closeMenu();
  // M4: Header solo en inicio
  const hdr=$('hdr');
  if(hdr)hdr.classList.toggle('hdr-hidden',p!=='inicio');
  clearTimeout(ambientDebounce);ambientDebounce=setTimeout(updateAmbient,150);
  renderPage(p);
  if(p==='admin'){
    populateSels();renderAdmLists();updateAdmCfg();prefillMatchDate();
    const hub=document.getElementById('adm-hub');if(hub)hub.style.display='grid';
    document.querySelectorAll('.apane').forEach(pn=>pn.classList.remove('on'));
    const backBtn=document.getElementById('adm-back-btn');if(backBtn)backBtn.style.display='none';
    const titleEl=document.getElementById('adm-hdr-title');if(titleEl)titleEl.textContent='Panel Admin';
  }
  // Guardar posición actual para restaurar al volver
  try{sessionStorage.setItem('lsl_cur_page',p);}catch(e){}
}
// Restaurar página al cargar (solo si no es inicio)
function restoreLastPage(){
  try{
    const last=sessionStorage.getItem('lsl_cur_page');
    if(last&&last!=='inicio'&&document.getElementById('pg-'+last)){
      // Pequeño delay para que init() termine primero
      setTimeout(()=>go(last),180);
    }
  }catch(e){}
}
// Guardar al ir a segundo plano
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    try{sessionStorage.setItem('lsl_cur_page',curPage);}catch(e){}
  }
});

/* ---- THEME ---- */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);D.settings.theme=t;
  const tgl=$('tgl-theme');if(tgl)tgl.classList.toggle('on',t==='dark');
  $('theme-color-meta')?.setAttribute('content',t==='dark'?'#000000':'#ffffff');
}
function toggleTheme(){applyTheme(D.settings.theme==='dark'?'light':'dark');save();setTimeout(updateAmbient,50)}

/* ══════════════════════════════════════════════════════
   AMBIENT SYSTEM — extrae color de imágenes, tinta la UI
   Como YouTube Ambient Mode / HyperOS Texturas Avanzadas
   ══════════════════════════════════════════════════════ */

let _ambCurrent=[99,102,241]; // [r,g,b] — inicia en indigo

function extractImageColor(imgSrc, callback){
  if(!imgSrc)return callback(null);
  const img=new Image();
  img.crossOrigin='anonymous';
  img.onload=()=>{
    try{
      const cv=document.createElement('canvas');
      cv.width=cv.height=16; // tiny = rápido
      const ctx=cv.getContext('2d');
      ctx.drawImage(img,0,0,16,16);
      const d=ctx.getImageData(0,0,16,16).data;
      let r=0,g=0,b=0,n=0;
      for(let i=0;i<d.length;i+=4){
        if(d[i+3]>80&&(d[i]+d[i+1]+d[i+2])>30){ // skip transparent + near-black
          r+=d[i];g+=d[i+1];b+=d[i+2];n++;
        }
      }
      if(n>8)callback([Math.round(r/n),Math.round(g/n),Math.round(b/n)]);
      else callback(null);
    }catch(e){callback(null)}
  };
  img.onerror=()=>callback(null);
  img.src=imgSrc;
}

function applyAmbientColor(rgb, intensity=1){
  const [r,g,b]=rgb;
  _ambCurrent=[r,g,b];
  const root=document.documentElement;
  root.style.setProperty('--amb-color',`${r}, ${g}, ${b}`);
  root.style.setProperty('--amb-tint-hdr',`rgba(${r},${g},${b},${0.10*intensity})`);
  root.style.setProperty('--amb-tint-nav',`rgba(${r},${g},${b},${0.07*intensity})`);
  // Solo actualizar accent si NO hay un tema de color activo guardado
  const activeTheme=D.settings?.colorTheme;
  if(!activeTheme||activeTheme==='default'){
    root.style.setProperty('--accent',`rgb(${Math.min(r+40,255)},${Math.min(g+40,255)},${Math.min(b+40,255)})`);
    root.style.setProperty('--accent2',`rgb(${Math.min(r+70,255)},${Math.min(g+70,255)},${Math.min(b+70,255)})`);
  }
  // Blobs de fondo — seteamos "color" (no "background") porque el CSS ahora
  // pinta el degradé con currentColor para evitar filter:blur (costoso en GPU/scroll)
  const abt=document.getElementById('ab-top');
  if(abt){abt.style.color=`rgb(${r},${g},${b})`;abt.style.opacity=(0.12*intensity).toString()}
  const abb=document.getElementById('ab-bot');
  if(abb){abb.style.color=`rgb(${Math.min(r+30,255)},${Math.min(g-20,200)},${Math.min(b+20,255)})`;abb.style.opacity=(0.07*intensity).toString()}
}

function resetAmbient(){
  applyAmbientColor([99,102,241], 0.8);
}

function updateAmbient(){
  // 1. Si hay partido en vivo → rojo
  if(D.matches.some(m=>m.status==='en_vivo')){
    applyAmbientColor([239,68,68], 1.2);
    return;
  }
  // 2. Intentar extraer color del featured match (logos de equipos)
  const fm=$('mc-imgs');
  const imgs=fm?fm.querySelectorAll('img'):[];
  const firstImg=Array.from(imgs).find(i=>i.src&&!i.src.endsWith('/'));
  if(firstImg&&firstImg.complete&&firstImg.naturalWidth>0){
    extractImageColor(firstImg.src,(rgb)=>{
      if(rgb)applyAmbientColor(rgb,1.0);
      else resetAmbient();
    });
    return;
  }
  // 3. Intentar extraer de la primera noticia
  const nImg=document.querySelector('#pg-inicio .ncbig img');
  if(nImg&&nImg.src&&nImg.complete){
    extractImageColor(nImg.src,(rgb)=>{
      if(rgb)applyAmbientColor(rgb,0.85);
      else resetAmbient();
    });
    return;
  }
  // 4. Fallback: usar acento base
  resetAmbient();
}


/* ---- HDR / GREET / USER ---- */
function updateHdr(){
  const c=D.cfg;
  $('hname').textContent=c.name||'La Súper Liga';
  $('hseason').textContent=c.season||'T9';
  $('sm-aln').textContent=c.name||'La Súper Liga';
  const sl={en_curso:'En curso',proximo:'Próximamente',pausado:'Pausado',finalizado:'Finalizado'};
  $('hstatus').textContent=sl[c.status]||'En curso';
  $('hdot').className='sdot'+(D.matches.some(m=>m.status==='en_vivo')?' live':'');
  const li=$('logo-img'),fb=$('logo-fb');
  if(c.logo){li.src=c.logo;li.style.display='block';fb.style.display='none'}
  else{li.style.display='none';fb.style.display='';fb.textContent=c.short||'LSL'}
  updatePWABannerLogo();
  setupManifest();
}
function greetStr(){const h=new Date().getHours();return h<5?'Buenas noches':h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'}
function updateGreet(){
  $('greet-time').textContent=greetStr();
  $('greet-user').textContent=D.user.name||'Usuario';
  $('greet-sea').textContent=(D.cfg.season||'').toUpperCase();
}
function updateUser(){
  const u=D.user;
  const init=(u.name||'U').charAt(0).toUpperCase();
  $('hav-init').textContent=init;$('pav-init').textContent=init;$('sm-av-init').textContent=init;
  $('sm-uname').textContent=u.name||'Usuario';$('pnm').textContent=u.name||'Usuario';
  $('pbio').textContent=u.bio||'Sin bio aún.';
  [$('hav-img'),$('pav-img'),$('sm-av-img')].forEach(el=>{if(el){el.src=u.avatar||'';el.style.display=u.avatar?'block':'none'}});
  $('hav-init').style.display=u.avatar?'none':'';$('pav-init').style.display=u.avatar?'none':'';$('sm-av-init').style.display=u.avatar?'none':'';
  const pbi=$('pban-img'),pbph=$('pbanph');
  if(u.banner){pbi.src=u.banner;pbi.style.display='block';pbph.style.display='none'}else{pbi.style.display='none';pbph.style.display=''}
  const pt=team(u.favTeam);
  $('ptbnm').textContent=pt?pt.name:'Sin equipo favorito';
  const ptc=$('ptbcr');ptc.innerHTML=pt&&pt.logo?`<img src="${pt.logo}"/>`:'⚽';
  const finished=D.matches.filter(m=>m.status==='finalizado');
  $('ps-pj').textContent=finished.length;
  let tg=0;finished.forEach(m=>{tg+=m.homeScore+m.awayScore});$('ps-gf').textContent=tg;
  if(pt){const rank=sortedTeams().findIndex(t=>t.id===pt.id);$('ps-rk').textContent=rank>=0?`#${rank+1}`:'-'}else $('ps-rk').textContent='-';
  updateNotifLabel();
  const unread=D.notifications.filter(n=>!n.read).length;
  $('nbadge').textContent=unread;$('nbadge').classList.toggle('hidden',!unread);
}

/* ---- RENDER INTELIGENTE — solo renderiza la página visible ---- */
function checkAutoLive(){
  if(!D.matches)return false;
  const now=Date.now();
  let changed=false;
  D.matches.forEach(m=>{
    if(m.status==='proximo'&&m.datetime&&new Date(m.datetime).getTime()<=now){
      m.status='en_vivo';
      changed=true;
      addNotif('¡Comenzó el partido!',`${teamName(m.homeTeam)} vs ${teamName(m.awayTeam)} ya está en vivo`);
      try{sendPushToAll('🔴 ¡Partido en vivo!',`${teamName(m.homeTeam)} vs ${teamName(m.awayTeam)} acaba de empezar`)}catch(e){}
    }
  });
  if(changed){save();broadcastUpdate()}
  return changed;
}
function renderAll(){
  checkAutoLive();
  // Siempre renderizar las partes del header y datos globales
  renderFeatM();
  renderMiniTbl();
  // Renderizar solo la página activa
  renderPage(curPage);
  // Admin: solo si está visible
  if(curPage==='admin')renderAdmLists();
  populateSels();
  updateAdmCfg();
}

function renderPage(p){
  if(p==='inicio'){renderFeatN()}
  if(p==='partidos'){renderMList()}
  if(p==='info'){renderAllN();renderStandings();renderSanc();renderRulesAndInfo()}
  if(p==='admin'){renderAdmLists()}
  updateDIVisibility();
}

/* ---- HELPERS ---- */
function stLabel(s){return{proximo:'Próximo',en_vivo:'EN VIVO',finalizado:'Final',pausado:'Pausado'}[s]||s}
function crEl(logo,initials,cls=''){return logo?`<img src="${logo}" loading="lazy" decoding="async" class="${cls}"/>`:`<span>${initials}</span>`}
function fmtND(d){try{return new Date(d).toLocaleDateString('es-AR',{day:'numeric',month:'short',year:'numeric'})}catch(e){return d}}
function fmtDT(d){try{const dt=new Date(d);return dt.toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})+' '+dt.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}catch(e){return d}}
function fmtTime(d){try{return new Date(d).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
function fmtDate(d){try{return new Date(d).toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}catch(e){return d}}
const EV_ICONS={
  goal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/></svg>',
  yellow:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/></svg>',
  red:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="2"/></svg>',
  assist:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  sub:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>',
  default:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>'
};
function evIcon(type){return EV_ICONS[type]||EV_ICONS.default}
function team(id){return D.teams.find(t=>t.id===id)}
function channel(id){return D.channels.find(c=>c.id===id)}

/* ---- FEATURED MATCHES — máx 3, priorizando en vivo > próximos > finales recientes ---- */
function renderFeatM(){
  const c=$('feat-m');if(!c)return;
  // Prioridad: 1° en vivo, 2° próximos (más cercanos al ahora), 3° finales recientes
  const now=Date.now();
  const scored=D.matches.map(m=>{
    let score=0;
    if(m.status==='en_vivo')score=10000;
    else if(m.status==='pausado')score=9000;
    else if(m.status==='proximo'){
      // más cercano al presente = mayor score
      const diff=new Date(m.datetime)-now;
      if(diff>=0)score=5000-Math.floor(diff/60000); // próximos futuros, más cercano = mejor
      else score=3000+Math.floor(diff/60000); // ya pasó la hora pero sigue "proximo"
    }else if(m.status==='finalizado'){
      // más reciente = mejor, pero baja prioridad
      score=1000-Math.abs(new Date(m.datetime)-now)/3600000;
    }
    return{m,score};
  }).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.m);

  if(!scored.length){c.innerHTML='<div class="empty" style="width:100%;padding:14px 0"><div class="etic">&#x26BD;</div><div class="etit">Sin partidos</div></div>';return}
  c.innerHTML=scored.map(m=>{
    const h=team(m.homeTeam),a=team(m.awayTeam);if(!h||!a)return'';
    const live=m.status==='en_vivo';
    const ch=channel(m.channel);
    return`<div class="mc${live?' live':''}" onclick="openMatch('${m.id}')">
      <div class="mcst${live?' lv':''}">
        ${live?'<div class="ldot"></div>':''}${stLabel(m.status)}${m.stadium?` · ${m.stadium}`:''}
      </div>
      <div id="mc-imgs" class="mcts">
        <div class="mct"><div class="mccr">${crEl(h.logo,h.name.substring(0,3).toUpperCase())}</div><div class="mctn">${h.name}</div></div>
        <div class="mcmd">
          ${m.status==='proximo'?
            `<div class="mctl">${fmtTime(m.datetime)}</div><div class="mcdsh" style="font-family:'Bebas Neue';font-size:18px">VS</div>`:
            `<div class="mcsc"><span>${m.homeScore??0}</span><span class="mcdsh">-</span><span>${m.awayScore??0}</span></div>`}
          <div class="mctl">${new Date(m.datetime).toLocaleDateString('es-AR',{day:'numeric',month:'short'})}</div>
        </div>
        <div class="mct"><div class="mccr">${crEl(a.logo,a.name.substring(0,3).toUpperCase())}</div><div class="mctn">${a.name}</div></div>
      </div>
      ${ch?`<div class="mcft"><div class="mcftxt">${ch.logo?`<img class="chl" src="${ch.logo}"/>`:''}<span>${ch.name}</span></div></div>`:''}
    </div>`;
  }).join('');
  setTimeout(updateAmbient,300);
}

/* ---- MATCH LIST ---- */
let curFlt='todos';
function flt(f,el){curFlt=f;document.querySelectorAll('.chips .chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');renderMList()}
function renderMList(){
  const c=$('mlist');if(!c)return;
  let ms=D.matches.slice().sort((a,b)=>new Date(b.datetime)-new Date(a.datetime));
  if(curFlt!=='todos')ms=ms.filter(m=>m.status===curFlt);
  if(!ms.length){c.innerHTML='<div class="empty"><div class="etic">&#x26BD;</div><div class="etit">Sin partidos</div></div>';return}
  const groups={};
  ms.forEach(m=>{const k=fmtDate(m.datetime);if(!groups[k])groups[k]=[];groups[k].push(m)});
  c.innerHTML=Object.entries(groups).map(([day,gms])=>`
    <div class="jornhd"><div class="jornt">${day}</div><div class="jornl"></div></div>
    ${gms.map(m=>{
      const h=team(m.homeTeam),a=team(m.awayTeam);if(!h||!a)return'';
      const live=m.status==='en_vivo';
      return`<div class="mr${live?' live':''}" onclick="openMatch('${m.id}')">
        <div class="mrts">
          <div class="mrt"><div class="mrcr">${crEl(h.logo,h.name.substring(0,3))}</div><div class="mrtn">${h.name}</div></div>
          <div class="mrt"><div class="mrcr">${crEl(a.logo,a.name.substring(0,3))}</div><div class="mrtn">${a.name}</div></div>
        </div>
        <div class="mrr">
          ${m.status==='proximo'?
            `<div class="mrtm">${fmtTime(m.datetime)}</div><div class="mrbdg mrbdg-prox">PRÓ</div>`:
            `<div class="mrsc"><span id="rmh-${m.id}">${m.homeScore??0}</span><span class="mrsp">-</span><span id="rma-${m.id}">${m.awayScore??0}</span></div><div class="mrbdg${live?' mrbdg-live':''}">${live?'LIVE':'FIN'}</div>`}
        </div>
      </div>`;
    }).join('')}
  `).join('');
}

/* ====================================================
   COUNTDOWN — para partidos próximos
   ==================================================== */
function getCountdown(datetime){
  const diff=new Date(datetime)-Date.now();
  if(diff<=0)return'Comenzando...';
  const h=Math.floor(diff/3600000);
  const m=Math.floor((diff%3600000)/60000);
  const s=Math.floor((diff%60000)/1000);
  return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
let _cdTimer=null;
function startCountdown(matchId,datetime){
  clearInterval(_cdTimer);
  _cdTimer=setInterval(()=>{
    const el=document.getElementById('cd-'+matchId);
    if(!el){clearInterval(_cdTimer);return}
    const cd=getCountdown(datetime);
    el.textContent=cd;
    if(cd==='Comenzando...')clearInterval(_cdTimer);
  },1000);
}

/* ====================================================
   MATCH DETAIL — 85% altura, full-width, redesigned
   ==================================================== */
function openMatch(id){
  const m=D.matches.find(x=>x.id===id);if(!m)return;
  const h=team(m.homeTeam),a=team(m.awayTeam);if(!h||!a)return;
  const live=m.status==='en_vivo',done=m.status==='finalizado',prox=m.status==='proximo';
  const ch=channel(m.channel);
  const hs=m.homeScore??0,as_=m.awayScore??0;
  const poss=m.stats?.possession??50,shots=m.stats?.shots??0,shotsA=m.stats?.shotsAway??0,
        fouls=m.stats?.fouls??0,foulsA=m.stats?.foulsAway??0,
        corners=m.stats?.corners??0,cornersA=m.stats?.cornersAway??0,
        passes=m.stats?.passes??0,passesA=m.stats?.passesAway??0,
        offsides=m.stats?.offsides??0,offsidesA=m.stats?.offsidesAway??0;
  const events=(m.events||[]).slice().sort((x,y)=>x.minute-y.minute);
  const hPlayers=D.players.filter(p=>p.teamId===h.id);
  const aPlayers=D.players.filter(p=>p.teamId===a.id);
  const hasReminder=reminders[id];

  /* ── HERO badge ── */
  const badgeH=h.logo
    ?`<img src="${h.logo}" style="width:100%;height:100%;object-fit:contain;padding:6px"/>`
    :`<span class="md-badge-init">${h.name.substring(0,2).toUpperCase()}</span>`;
  const badgeA=a.logo
    ?`<img src="${a.logo}" style="width:100%;height:100%;object-fit:contain;padding:6px"/>`
    :`<span class="md-badge-init">${a.name.substring(0,2).toUpperCase()}</span>`;

  /* ── Status pill ── */
  const pillCls=live?'live':prox?'prox':'done';
  const pillTxt=live?'<span class="md-live-dot"></span> EN VIVO':prox?'PRÓXIMO':'FINALIZADO';

  /* ── Tabs según estado ── */
  const firstTab=(done||live)?`mdt-ev-${id}`:`mdt-info-${id}`;
  const tabsHTML=`
    ${(done||live)?`
      <div class="md-tab-v2 on" onclick="mdTabV2(this,'mdt-ev-${id}')">Eventos</div>
      <div class="md-tab-v2" onclick="mdTabV2(this,'mdt-st-${id}')">Estadísticas</div>
    `:`
      <div class="md-tab-v2 on" onclick="mdTabV2(this,'mdt-info-${id}')">Info</div>
    `}
    <div class="md-tab-v2" onclick="mdTabV2(this,'mdt-pr-${id}')">Predicciones</div>
    <div class="md-tab-v2" onclick="mdTabV2(this,'mdt-h2h-${id}')">Cara a Cara</div>
    ${hPlayers.length||aPlayers.length?`<div class="md-tab-v2" onclick="mdTabV2(this,'mdt-pl-${id}')">Plantillas</div>`:''}
  `;

  $('md-content').innerHTML=`
    <!-- ══ HERO ══ -->
    <div class="md-hero">
      <div class="md-hero-bg"></div>

      <!-- Liga + canal arriba -->
      <div style="text-align:center;padding:18px 18px 0">
        <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--t2)">
          ${D.cfg.name||'La Súper Liga'}${ch?` &nbsp;·&nbsp; ${ch.name}`:''}
        </div>
        ${m.jornada||m.competition?`<div style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;background:rgba(var(--amb-color),.10);border:1px solid rgba(var(--amb-color),.22)">
          <span style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--accent2)">${({liga:'Liga',copa:'Copa',amistoso:'Amistoso'})[m.competition]||'Liga'}</span>
          ${m.jornada?`<span style="font-size:9px;color:var(--t3)">·</span><span style="font-size:9px;font-weight:700;color:var(--t2)">${m.jornada}</span>`:''}
        </div>`:''}
      </div>

      <!-- Countdown grande (solo próximos) -->
      ${prox?`
      <div style="padding:14px 18px 0;text-align:center">
        <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--t3);margin-bottom:8px">TIEMPO PARA EL PARTIDO</div>
        <div id="cd-${id}" style="display:flex;align-items:flex-end;justify-content:center;gap:4px">
          <!-- Rellenado por startCountdown() -->
          <div class="md-cd-seg"><div class="md-cd-n" id="cd-d-${id}">--</div><div class="md-cd-u">días</div></div>
          <div class="md-cd-sep">:</div>
          <div class="md-cd-seg"><div class="md-cd-n" id="cd-h-${id}">--</div><div class="md-cd-u">hrs</div></div>
          <div class="md-cd-sep">:</div>
          <div class="md-cd-seg"><div class="md-cd-n" id="cd-m-${id}">--</div><div class="md-cd-u">min</div></div>
          <div class="md-cd-sep">:</div>
          <div class="md-cd-seg"><div class="md-cd-n" id="cd-s-${id}">--</div><div class="md-cd-u">seg</div></div>
        </div>
      </div>`:''}

      <!-- Equipos + marcador -->
      <div class="md-teams-row">
        <!-- Local -->
        <div class="md-team-col">
          <div class="md-badge">${badgeH}</div>
          <div>
            <div class="md-team-name">${h.name}</div>
            <div class="md-team-sub">Local</div>
          </div>
        </div>

        <!-- Centro -->
        <div class="md-score-center">
          ${prox
            ?`<div class="md-match-time-big" id="mdscn-${id}">${fmtTime(m.datetime)}</div>
               <div class="md-match-date">${fmtDate(m.datetime)}</div>`
            :`<div class="md-score-big">
                <span id="mdh-${id}">${hs}</span><span class="md-score-sep" style="opacity:.25">–</span><span id="mda-${id}">${as_}</span>
              </div>`}
          <div class="md-status-pill ${pillCls}" style="margin-top:6px">${pillTxt}</div>
          ${live&&m.minute?`<div style="font-size:11px;color:var(--t2);margin-top:4px">${m.minute}'</div>`:''}
        </div>

        <!-- Visitante -->
        <div class="md-team-col">
          <div class="md-badge">${badgeA}</div>
          <div>
            <div class="md-team-name">${a.name}</div>
            <div class="md-team-sub">Visitante</div>
          </div>
        </div>
      </div>
    </div>

    <!-- META ROW: estadio / canal / fecha -->
    <div class="md-meta-row">
      ${m.datetime?`<div class="md-meta-item">
        <span class="md-meta-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span>
        <div class="md-meta-txt">
          <span class="md-meta-lbl">Fecha</span>
          <span class="md-meta-val">${fmtDate(m.datetime)}</span>
        </div>
      </div>`:''}
      ${m.datetime?`<div class="md-meta-item">
        <span class="md-meta-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></span>
        <div class="md-meta-txt">
          <span class="md-meta-lbl">Horario</span>
          <span class="md-meta-val">${fmtTime(m.datetime)}</span>
        </div>
      </div>`:''}
      ${m.stadium?`<div class="md-meta-item">
        <span class="md-meta-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="4" ry="6"/></svg></span>
        <div class="md-meta-txt">
          <span class="md-meta-lbl">Estadio</span>
          <span class="md-meta-val">${m.stadium}</span>
        </div>
      </div>`:''}
      ${ch?`<div class="md-meta-item">
        <span class="md-meta-ico">${ch.logo?`<img src="${ch.logo}" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;border-radius:4px"/>`:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M9 2l3 4 3-4"/></svg>'}</span>
        <div class="md-meta-txt">
          <span class="md-meta-lbl">Canal</span>
          <span class="md-meta-val">${ch.logo?`<img src="${ch.logo}" style="height:16px;max-width:56px;object-fit:contain;vertical-align:middle;border-radius:3px"/>`:ch.name}</span>
        </div>
      </div>`:''}
      ${m.roomCode?`<div class="md-meta-item" style="flex-direction:column;align-items:flex-start;gap:4px">
          <span class="md-meta-lbl">Código de sala</span>
          <div class="room-code-wrap" style="width:100%">
            <div class="room-code" onclick="navigator.clipboard.writeText('${m.roomCode}').then(()=>toast('✅ Código copiado'))">${m.roomCode}</div>
          </div>
        </div>`:''}
    </div>

    <!-- TABS -->
    <div class="md-tabs-v2">${tabsHTML}</div>

    <!-- ══ PANEL INFO (próximos) ══ -->
    <div class="md-panel${prox?' on':''}" id="mdt-info-${id}">

      <!-- Recordatorio v2 -->
      ${prox?`
      <div class="md-remind-v2${hasReminder?' set':''}" id="reminder-btn-${id}" onclick="toggleReminderV2('${id}')">
        <div class="md-remind-left">
          <div class="md-remind-ico">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </div>
          <div>
            <div class="md-remind-txt">${hasReminder?'Recordatorio activo':'Activar recordatorio'}</div>
            <div class="md-remind-sub">${hasReminder?'Te avisamos 15 min antes':'Notificación 15 min antes del partido'}</div>
          </div>
        </div>
        <div class="md-remind-chk">
          ${hasReminder?'<svg width="11" height="11" fill="none" stroke="#fff" viewBox="0 0 24 24" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>':''}
        </div>
      </div>`:''}

      <!-- Info cards en grid -->
      <div class="md-info-cards">

        <!-- FECHA -->
        <div class="md-info-card">
          <div class="md-ic-inner">
            <div class="md-ic-ico">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2.5"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div class="md-info-card-lbl">Fecha</div>
            <div class="md-info-card-val">${fmtDate(m.datetime)}</div>
          </div>
        </div>

        <!-- HORARIO -->
        <div class="md-info-card">
          <div class="md-ic-inner">
            <div class="md-ic-ico">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"/>
                <polyline points="12 7 12 12 15.5 15.5"/>
              </svg>
            </div>
            <div class="md-info-card-lbl">Horario</div>
            <div class="md-info-card-val">${fmtTime(m.datetime)}</div>
          </div>
        </div>

        <!-- ESTADIO -->
        <div class="md-info-card">
          <div class="md-ic-inner">
            <div class="md-ic-ico">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div class="md-info-card-lbl">Estadio</div>
            <div class="md-info-card-val">${m.stadium||'Por confirmar'}</div>
          </div>
        </div>

        <!-- CANAL — logo limpio sin fondo blanco -->
        ${ch&&ch.logo?`
        <div class="md-info-card md-ic-channel">
          <span class="md-ic-channel-lbl">Canal</span>
          <div class="md-ic-channel-bg">
            <img src="${ch.logo}" alt="${ch.name}"/>
          </div>
          <div class="md-ic-channel-name">${ch.name}</div>
        </div>
        `:`
        <div class="md-info-card">
          <div class="md-ic-inner">
            <div class="md-ic-ico">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/>
                <path d="M16 3l-4 4-4-4"/>
              </svg>
            </div>
            <div class="md-info-card-lbl">Canal</div>
            <div class="md-info-card-val">${ch?ch.name:'Sin definir'}</div>
          </div>
        </div>
        `}

      </div>

      ${D.user.isAdmin&&(done||live)?`<button class="abtn sec" style="font-size:12px;padding:10px" onclick="closeOv('md-ov');openLiveEdit('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1px;margin-right:4px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>Editar partido</button>`:''}
    </div>

    <!-- ══ PANEL EVENTOS ══ -->
    <div class="md-panel${(done||live)?' on':''}" id="mdt-ev-${id}">
      ${events.length?events.map(ev=>{
        const eico=evIcon(ev.type);
        const ecolor={'goal':'#22c55e','yellow':'#facc15','red':'#f87171','assist':'#60a5fa','sub':'#a78bfa'}[ev.type]||'#888';
        const isHome=ev.team==='home';
        return `<div class="evit" style="border-left:3px solid ${ecolor};justify-content:${isHome?'flex-start':'flex-end'}">
          ${isHome?`
            <div class="evmin" style="color:${ecolor}">${ev.minute}'</div>
            <div class="ev-ico-svg" style="color:${ecolor}">${eico}</div>
            <div>
              <div class="evnm">${ev.player}</div>
              <div class="evtm">${h.name}</div>
            </div>
          `:`
            <div style="text-align:right;flex:1">
              <div class="evnm">${ev.player}</div>
              <div class="evtm">${a.name}</div>
            </div>
            <div class="ev-ico-svg" style="color:${ecolor}">${eico}</div>
            <div class="evmin" style="color:${ecolor}">${ev.minute}'</div>
          `}
        </div>`;
      }).join(''):`<div class="empty" style="padding:28px 0"><div class="etic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg></div><div class="etit">Sin eventos registrados</div><div class="esub">Los eventos aparecerán en vivo</div></div>`}
      ${D.user.isAdmin?`<div style="margin-top:12px"><button class="abtn sec" style="font-size:12px;padding:10px" onclick="closeOv('md-ov');openLiveEdit('${id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-1px;margin-right:4px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>Editar partido</button></div>`:''}
    </div>

    <!-- ══ PANEL ESTADÍSTICAS ══ -->
    <div class="md-panel" id="mdt-st-${id}">
      <!-- Cabecera con logos -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--bdr)">
        <div style="display:flex;align-items:center;gap:8px">
          ${h.logo?`<img src="${h.logo}" style="width:24px;height:24px;object-fit:contain"/>`:''}
          <span style="font-size:12px;font-weight:700;color:var(--text)">${h.name}</span>
        </div>
        <span style="font-size:10px;font-weight:700;letter-spacing:.8px;color:var(--t3);text-transform:uppercase">Estadísticas</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;font-weight:700;color:var(--text)">${a.name}</span>
          ${a.logo?`<img src="${a.logo}" style="width:24px;height:24px;object-fit:contain"/>`:''}
        </div>
      </div>
      ${buildStatV2('Posesión',`${poss}%`,`${100-poss}%`,poss,100-poss)}
      ${buildStatV2('Remates',shots,shotsA,shots,shotsA)}
      ${buildStatV2('Pases',passes,passesA,passes,passesA)}
      ${buildStatV2('Faltas',fouls,foulsA,fouls,foulsA)}
      ${buildStatV2('Fuera de juego',offsides,offsidesA,offsides,offsidesA)}
      ${buildStatV2('Goles',hs,as_,hs,as_)}
      ${corners||cornersA?buildStatV2('Córners',corners,cornersA,corners,cornersA):''}
      ${(m.mvp||m.mvpHome||m.mvpAway)?buildMvpCards(m,h,a):''}
    </div>

    <!-- ══ PANEL PREDICCIONES ══ -->
    <div class="md-panel" id="mdt-pr-${id}">
      ${buildPredV2(m,h,a)}
    </div>

    <!-- ══ PANEL CARA A CARA ══ -->
    <div class="md-panel" id="mdt-h2h-${id}">
      ${buildH2HV2(m,h,a)}
    </div>

    <!-- ══ PANEL PLANTILLAS ══ -->
    ${hPlayers.length||aPlayers.length?`
    <div class="md-panel" id="mdt-pl-${id}">
      ${hPlayers.length?`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          ${h.logo?`<img src="${h.logo}" style="width:20px;height:20px;object-fit:contain"/>`:''}
          <span style="font-size:13px;font-weight:700;color:var(--text)">${h.name}</span>
        </div>
        ${hPlayers.map(p=>`<div class="sancrow"><span class="sancn">#${p.number||'?'} ${p.name}</span><span class="sanct">${p.position||''}</span></div>`).join('')}`:''}
      ${aPlayers.length?`
        <div style="display:flex;align-items:center;gap:8px;margin:16px 0 10px">
          ${a.logo?`<img src="${a.logo}" style="width:20px;height:20px;object-fit:contain"/>`:''}
          <span style="font-size:13px;font-weight:700;color:var(--text)">${a.name}</span>
        </div>
        ${aPlayers.map(p=>`<div class="sancrow"><span class="sancn">#${p.number||'?'} ${p.name}</span><span class="sanct">${p.position||''}</span></div>`).join('')}`:''}
    </div>`:''}
  `;

  openOv('md-ov');
  if(prox)startCountdownV2(id,m.datetime);
  // Ambient
  if(h.logo){extractImageColor(h.logo,(rgb)=>{if(rgb)applyAmbientColor(rgb,1.1)})}
  else setTimeout(updateAmbient,250);
}

/* ─── mdTab para nuevos paneles ─── */
function mdTabV2(el,contentId){
  const sheet=el.closest('#md-content')||document;
  sheet.querySelectorAll('.md-tab-v2').forEach(t=>t.classList.remove('on'));
  sheet.querySelectorAll('.md-panel').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
  const tc=document.getElementById(contentId);
  if(tc)tc.classList.add('on');
}

/* ─── Countdown desglosado d/h/m/s ─── */
function startCountdownV2(id,datetime){
  if(!datetime)return;
  function tick(){
    const diff=new Date(datetime)-Date.now();
    if(diff<=0){
      ['d','h','m','s'].forEach(u=>{const el=document.getElementById('cd-'+u+'-'+id);if(el)el.textContent='00'});
      return;
    }
    const d=Math.floor(diff/86400000);
    const h=Math.floor((diff%86400000)/3600000);
    const mn=Math.floor((diff%3600000)/60000);
    const s=Math.floor((diff%60000)/1000);
    const fmt=n=>String(n).padStart(2,'0');
    const elD=document.getElementById('cd-d-'+id);const elH=document.getElementById('cd-h-'+id);
    const elM=document.getElementById('cd-m-'+id);const elS=document.getElementById('cd-s-'+id);
    if(elD)elD.textContent=fmt(d);if(elH)elH.textContent=fmt(h);
    if(elM)elM.textContent=fmt(mn);if(elS)elS.textContent=fmt(s);
  }
  tick();
  const t=setInterval(()=>{
    if(!document.getElementById('cd-d-'+id)){clearInterval(t);return}
    tick();
  },1000);
}

/* ─── Recordatorio v2 ─── */
function toggleReminderV2(id){
  const m=D.matches.find(x=>x.id===id);if(!m)return;
  reminders[id]=!reminders[id];
  const btn=document.getElementById('reminder-btn-'+id);
  if(btn){
    btn.classList.toggle('set',reminders[id]);
    btn.querySelector('.md-remind-txt').textContent=reminders[id]?'Recordatorio activo':'Activar recordatorio';
    btn.querySelector('.md-remind-sub').textContent=reminders[id]?'Te avisamos 15 min antes':'Notificación 15 min antes del partido';
    btn.querySelector('.md-remind-chk').innerHTML=reminders[id]?'<svg width="11" height="11" fill="none" stroke="#fff" viewBox="0 0 24 24" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>':'';
  }
  if(reminders[id]){toast('🔔 Recordatorio activado')}
  else{toast('🔕 Recordatorio desactivado')}
}

/* ─── Jugador del partido (MVP) ─── */
function mvpRatingColor(r){
  if(r>=9)return'#22c55e';
  if(r>=7.5)return'#818cf8';
  if(r>=6)return'#facc15';
  return'#f87171';
}
function buildMvpCard(mvp,teamName,teamLogo,highlight){
  if(!mvp||!mvp.name)return'';
  const rc=mvpRatingColor(mvp.rating);
  const stats=[
    mvp.goals?`${mvp.goals} ${mvp.goals===1?'gol':'goles'}`:null,
    mvp.assists?`${mvp.assists} asist.`:null,
    mvp.passes?`${mvp.passes} pases`:null,
    mvp.fouls?`${mvp.fouls} faltas`:null,
  ].filter(Boolean).join(' · ')||'Sin acciones registradas';
  return`
    <div class="mvp-card${highlight?' mvp-main':''}">
      <div class="mvp-card-top">
        <div class="mvp-card-info">
          <div class="mvp-card-tag">${highlight?'Jugador del partido':teamName||''}</div>
          <div class="mvp-card-name">${mvp.name}</div>
          <div class="mvp-card-stats">${stats}</div>
        </div>
        <div class="mvp-card-rating" style="background:${rc}1a;color:${rc};border-color:${rc}40">${mvp.rating?.toFixed(1)??'-'}</div>
      </div>
    </div>
  `;
}
function buildMvpCards(m,h,a){
  const main=buildMvpCard(m.mvp,null,null,true);
  const homeC=buildMvpCard(m.mvpHome,h.name,h.logo,false);
  const awayC=buildMvpCard(m.mvpAway,a.name,a.logo,false);
  if(!main&&!homeC&&!awayC)return'';
  return`
    <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--bdr)">
      <div style="font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--t3);text-transform:uppercase;margin-bottom:10px">Jugadores destacados</div>
      ${main}
      ${(homeC||awayC)?`<div class="mvp-grid">${homeC}${awayC}</div>`:''}
    </div>
  `;
}
/* ─── Estadísticas v2 ─── */
function buildStatV2(label,valL,valR,numL,numR){
  const total=(+numL+ +numR)||1;
  const pL=Math.round((+numL/total)*100);
  const pR=100-pL;
  return`
    <div class="stat-v2-row">
      <div class="stat-v2-val home">${valL}</div>
      <div class="stat-v2-bars">
        <div class="stat-v2-bar-wrap" style="direction:rtl">
          <div class="stat-v2-bar-fill home" style="width:${pL}%"></div>
        </div>
        <div style="padding:0 8px;min-width:90px;text-align:center">
          <span class="stat-v2-lbl">${label}</span>
        </div>
        <div class="stat-v2-bar-wrap">
          <div class="stat-v2-bar-fill away" style="width:${pR}%"></div>
        </div>
      </div>
      <div class="stat-v2-val away">${valR}</div>
    </div>
  `;
}

/* ─── Predicciones v2 ─── */
function buildPredV2(m,h,a){
  if(!m.pred)m.pred={home:0,draw:0,away:0,userVote:null};
  const p=m.pred;
  const total=(p.home+p.draw+p.away)||0;
  const ph=total?Math.round((p.home/total)*100):33;
  const pd=total?Math.round((p.draw/total)*100):34;
  const pa=total?Math.round((p.away/total)*100):33;
  const voted=p.userVote;
  const logoH=h.logo?`<img class="pred-v2-team-logo" src="${h.logo}"/>`:`<span class="pred-v2-team-init">${h.name.substring(0,3)}</span>`;
  const logoA=a.logo?`<img class="pred-v2-team-logo" src="${a.logo}"/>`:`<span class="pred-v2-team-init">${a.name.substring(0,3)}</span>`;
  return`
    <div class="pred-v2">
      <div class="pred-v2-header">
        <span class="pred-v2-title">¿Quién ganará?</span>
        <span class="pred-v2-votes">${total?total+' votos':'Sin votos aún'}</span>
      </div>
      <div class="pred-v2-opts">
        <div class="pred-v2-opt${voted==='home'?' voted':''}" onclick="votePredV2('${m.id}','home')">
          ${voted==='home'?'<div class="pred-v2-voted-badge">✓</div>':''}
          ${logoH}
          <div class="pred-v2-pct">${ph}%</div>
          <div class="pred-v2-lbl">${h.name.substring(0,8)}</div>
        </div>
        <div class="pred-v2-opt${voted==='draw'?' voted':''}" onclick="votePredV2('${m.id}','draw')" style="border-left:1px solid var(--bdr);border-right:1px solid var(--bdr)">
          ${voted==='draw'?'<div class="pred-v2-voted-badge">✓</div>':''}
          <span style="font-size:22px">🤝</span>
          <div class="pred-v2-pct">${pd}%</div>
          <div class="pred-v2-lbl">Empate</div>
        </div>
        <div class="pred-v2-opt${voted==='away'?' voted':''}" onclick="votePredV2('${m.id}','away')">
          ${voted==='away'?'<div class="pred-v2-voted-badge">✓</div>':''}
          ${logoA}
          <div class="pred-v2-pct">${pa}%</div>
          <div class="pred-v2-lbl">${a.name.substring(0,8)}</div>
        </div>
      </div>
      <div class="pred-v2-bar">
        <div class="pred-v2-bar-h" style="width:${ph}%"></div>
        <div class="pred-v2-bar-d" style="width:${pd}%"></div>
        <div class="pred-v2-bar-a" style="width:${pa}%"></div>
      </div>
    </div>
    ${!voted?'<div style="font-size:12px;color:var(--t3);text-align:center;padding:6px 0">Tocá una opción para votar</div>':''}
  `;
}

function votePredV2(matchId,option){
  const m=D.matches.find(x=>x.id===matchId);if(!m)return;
  if(!m.pred)m.pred={home:0,draw:0,away:0,userVote:null};
  if(m.pred.userVote){toast('⚠️ Ya votaste en este partido');return}
  m.pred[option]++;m.pred.userVote=option;save();
  const h=team(m.homeTeam),a=team(m.awayTeam);
  const panel=document.getElementById('mdt-pr-'+matchId);
  if(panel&&h&&a)panel.innerHTML=buildPredV2(m,h,a);
  toast('✅ Voto registrado');
}

/* ─── Cara a Cara v2 ─── */
function buildH2HV2(m,h,a){
  const history=D.matches.filter(x=>
    x.status==='finalizado'&&(
      (x.homeTeam===h.id&&x.awayTeam===a.id)||
      (x.homeTeam===a.id&&x.awayTeam===h.id)
    )
  ).slice(-10);

  let hw=0,aw=0,draws=0;
  history.forEach(x=>{
    const hs=x.homeScore??0,as=x.awayScore??0;
    const hWins=hs>as;const aWins=hs<as;
    if(hWins){if(x.homeTeam===h.id)hw++;else aw++}
    else if(aWins){if(x.awayTeam===h.id)hw++;else aw++}
    else draws++;
  });
  const total=(hw+aw+draws)||1;
  const ph=Math.round((hw/total)*100);
  const pa=Math.round((aw/total)*100);
  const pd=100-ph-pa;

  const getForm=(tid)=>D.matches
    .filter(x=>x.status==='finalizado'&&(x.homeTeam===tid||x.awayTeam===tid))
    .slice(-5).map(x=>{
      const isHome=x.homeTeam===tid;
      const ts=isHome?x.homeScore:x.awayScore;
      const os=isHome?x.awayScore:x.homeScore;
      return ts>os?'G':ts<os?'P':'E';
    });
  const hForm=getForm(h.id);
  const aForm=getForm(a.id);

  const logoH=h.logo?`<img src="${h.logo}" style="width:100%;height:100%;object-fit:contain;padding:2px"/>`
    :`<span style="font-family:'Bebas Neue';font-size:9px">${h.name.substring(0,2)}</span>`;
  const logoA=a.logo?`<img src="${a.logo}" style="width:100%;height:100%;object-fit:contain;padding:2px"/>`
    :`<span style="font-family:'Bebas Neue';font-size:9px">${a.name.substring(0,2)}</span>`;

  return`
    <!-- Barra H2H -->
    ${history.length?`
    <div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:700;color:var(--text)">${h.name}</span>
        <span style="font-size:10px;color:var(--t3)">${history.length} partidos</span>
        <span style="font-size:12px;font-weight:700;color:var(--text)">${a.name}</span>
      </div>
      <div class="h2h-vis">
        <div class="h2h-seg-v2 home" style="flex:${Math.max(ph,10)}">
          <div class="h2h-n">${hw}</div>
          <div class="h2h-pct">${ph}%</div>
          <div class="h2h-lbl">Victorias</div>
        </div>
        <div class="h2h-seg-v2 draw" style="flex:${Math.max(pd,10)}">
          <div class="h2h-n">${draws}</div>
          <div class="h2h-pct">${pd}%</div>
          <div class="h2h-lbl">Empates</div>
        </div>
        <div class="h2h-seg-v2 away" style="flex:${Math.max(pa,10)}">
          <div class="h2h-n">${aw}</div>
          <div class="h2h-pct">${pa}%</div>
          <div class="h2h-lbl">Victorias</div>
        </div>
      </div>
    </div>`:`<div class="empty" style="padding:16px 0"><div class="etic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg></div><div class="etit">Sin enfrentamientos previos</div></div>`}

    <!-- Forma reciente -->
    ${hForm.length||aForm.length?`
    <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t3);margin-bottom:10px">Forma reciente</div>
    <div style="background:var(--surf2);border-radius:14px;border:1px solid var(--bdr);overflow:hidden;margin-bottom:14px">
      <div class="form-row-v2">
        <div class="form-team-logo">${logoH}</div>
        <span class="form-team-name-s">${h.name}</span>
        <div class="form-dots-row">
          ${hForm.map(r=>`<div class="fd2 ${r}">${r}</div>`).join('')}
        </div>
      </div>
      <div class="form-row-v2">
        <div class="form-team-logo">${logoA}</div>
        <span class="form-team-name-s">${a.name}</span>
        <div class="form-dots-row">
          ${aForm.map(r=>`<div class="fd2 ${r}">${r}</div>`).join('')}
        </div>
      </div>
    </div>`:''}

    <!-- Historial de resultados -->
    ${history.length?`
    <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t3);margin-bottom:8px">Historial</div>
    <div style="background:var(--surf2);border-radius:14px;border:1px solid var(--bdr);overflow:hidden">
      ${history.slice().reverse().map(x=>{
        const xh=team(x.homeTeam),xa=team(x.awayTeam);
        if(!xh||!xa)return'';
        const sc=`${x.homeScore??0} – ${x.awayScore??0}`;
        const hWon=(x.homeScore??0)>(x.awayScore??0);
        const aWon=(x.awayScore??0)>(x.homeScore??0);
        const dt=x.datetime?new Date(x.datetime).toLocaleDateString('es-AR',{day:'numeric',month:'short'}):'';
        const crH=xh.logo?`<img src="${xh.logo}" style="width:100%;height:100%;object-fit:contain;padding:1px"/>`:`<span style="font-family:'Bebas Neue';font-size:8px">${xh.name.substring(0,2)}</span>`;
        const crA=xa.logo?`<img src="${xa.logo}" style="width:100%;height:100%;object-fit:contain;padding:1px"/>`:`<span style="font-family:'Bebas Neue';font-size:8px">${xa.name.substring(0,2)}</span>`;
        return`<div class="h2h-match-row">
          <div class="h2h-match-date">${dt}</div>
          <div class="h2h-match-teams">
            <div class="h2h-match-team ${hWon?'winner':aWon?'loser':''}"><span class="h2h-match-crest">${crH}</span>${xh.name}</div>
            <div class="h2h-match-team ${aWon?'winner':hWon?'loser':''}"><span class="h2h-match-crest">${crA}</span>${xa.name}</div>
          </div>
          <div class="h2h-match-score">${sc}</div>
        </div>`;
      }).join('')}
    </div>`:''}
  `;
}

/* ---- PREDICCIONES ---- */
function buildPredPanel(m,h,a){
  if(!m.pred)m.pred={home:0,draw:0,away:0,userVote:null};
  const p=m.pred;
  const total=(p.home+p.draw+p.away)||0;
  const ph=total?Math.round((p.home/total)*100):0;
  const pd=total?Math.round((p.draw/total)*100):0;
  const pa=total?Math.round((p.away/total)*100):0;
  const voted=p.userVote;
  return`
    <div class="pred-wrap">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-size:14px;font-weight:700;color:var(--text)">¿Quién ganará?</span>
        <span style="font-size:12px;color:var(--t2)">${total} votos</span>
      </div>
      <div class="pred-bar">
        <div class="pred-opt home${voted==='home'?' voted':''}" onclick="votePred('${m.id}','home')">
          ${h.logo?`<img src="${h.logo}" style="width:28px;height:28px;object-fit:contain"/>`:
          `<span style="font-size:12px;font-weight:700">${h.name.substring(0,3)}</span>`}
          ${total?`<span class="pred-opt-pct">${ph}%</span>`:''}
        </div>
        <div class="pred-divider"></div>
        <div class="pred-opt draw${voted==='draw'?' voted':''}" onclick="votePred('${m.id}','draw')">
          <span>Empate</span>
          ${total?`<span class="pred-opt-pct">${pd}%</span>`:''}
        </div>
        <div class="pred-divider"></div>
        <div class="pred-opt away${voted==='away'?' voted':''}" onclick="votePred('${m.id}','away')">
          ${a.logo?`<img src="${a.logo}" style="width:28px;height:28px;object-fit:contain"/>`:
          `<span style="font-size:12px;font-weight:700">${a.name.substring(0,3)}</span>`}
          ${total?`<span class="pred-opt-pct">${pa}%</span>`:''}
        </div>
      </div>
      ${total?`
      <div class="pred-pct-bar">
        <div class="pred-pct-h" style="width:${ph}%"></div>
        <div class="pred-pct-d" style="width:${pd}%"></div>
        <div class="pred-pct-a" style="width:${pa}%"></div>
      </div>
      <div class="pred-labels">
        <span>${ph}% ${h.name}</span><span>${pd}% Empate</span><span>${pa}% ${a.name}</span>
      </div>`:'<div style="font-size:12px;color:var(--t3);margin-top:4px;text-align:center">Sé el primero en votar</div>'}
    </div>
  `;
}

function votePred(matchId,option){
  const m=D.matches.find(x=>x.id===matchId);if(!m)return;
  if(!m.pred)m.pred={home:0,draw:0,away:0,userVote:null};
  if(m.pred.userVote){toast('⚠️ Ya votaste en este partido');return}
  m.pred[option]++;
  m.pred.userVote=option;
  save();
  const h=team(m.homeTeam),a=team(m.awayTeam);
  const panel=document.getElementById('mdt-pr-'+matchId);
  if(panel&&h&&a)panel.innerHTML=buildPredPanel(m,h,a);
  toast('✅ Voto registrado');
}

/* ---- CARA A CARA ---- */
function buildH2HPanel(m,h,a){
  const history=D.matches.filter(x=>
    x.status==='finalizado'&&(
      (x.homeTeam===h.id&&x.awayTeam===a.id)||
      (x.homeTeam===a.id&&x.awayTeam===h.id)
    )
  ).slice(-10);

  let hw=0,aw=0,draws=0;
  history.forEach(x=>{
    const hs=x.homeScore??0,as=x.awayScore??0;
    const hWins=hs>as;const aWins=hs<as;
    if(hWins){if(x.homeTeam===h.id)hw++;else aw++}
    else if(aWins){if(x.awayTeam===h.id)hw++;else aw++}
    else draws++;
  });
  const total=(hw+aw+draws)||1;
  const ph=Math.round((hw/total)*100);
  const pa=Math.round((aw/total)*100);
  const pd=Math.round((draws/total)*100);

  const getForm=(teamId)=>D.matches
    .filter(x=>x.status==='finalizado'&&(x.homeTeam===teamId||x.awayTeam===teamId))
    .slice(-5).map(x=>{
      const isHome=x.homeTeam===teamId;
      const ts=isHome?x.homeScore:x.awayScore;
      const os=isHome?x.awayScore:x.homeScore;
      return ts>os?'G':ts<os?'P':'E';
    });
  const hForm=getForm(h.id);
  const aForm=getForm(a.id);

  return`
    <div style="margin-bottom:6px">
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px">Cara a Cara</div>
      <div style="font-size:12px;color:var(--t2);margin-bottom:12px">Últimos ${history.length} enfrentamientos</div>
      ${history.length?`
      <div class="h2h-bar">
        <div class="h2h-seg home" style="flex:${ph||8}">
          <div class="h2h-seg-lbl">G · ${ph}%</div>
          <div class="h2h-seg-n">${hw}</div>
        </div>
        <div class="h2h-seg draw" style="flex:${pd||8};border-left:1px solid rgba(255,255,255,.08);border-right:1px solid rgba(255,255,255,.08)">
          <div class="h2h-seg-lbl">E · ${pd}%</div>
          <div class="h2h-seg-n">${draws}</div>
        </div>
        <div class="h2h-seg away" style="flex:${pa||8}">
          <div class="h2h-seg-lbl">G · ${pa}%</div>
          <div class="h2h-seg-n">${aw}</div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t2);margin-bottom:18px">
        <span>${h.name}</span><span>Empates</span><span>${a.name}</span>
      </div>`:'<div class="empty" style="padding:20px 0"><div class="etic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg></div><div class="etit">Sin enfrentamientos</div></div>'}
    </div>

    ${hForm.length||aForm.length?`
    <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:12px">Forma reciente</div>
    <div style="margin-bottom:10px">
      <div style="font-size:11px;color:var(--t2);margin-bottom:5px">${h.name}</div>
      <div>${hForm.map(r=>`<span class="form-dot ${r}">${r}</span>`).join('')}</div>
    </div>
    <div>
      <div style="font-size:11px;color:var(--t2);margin-bottom:5px">${a.name}</div>
      <div>${aForm.map(r=>`<span class="form-dot ${r}">${r}</span>`).join('')}</div>
    </div>`:''}
  `;
}

function buildStatBar2(label,valL,valR,numL,numR){
  const total=(numL+numR)||1;
  const pL=Math.round((numL/total)*100);
  return`
    <div style="margin-bottom:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span class="stn l">${valL}</span>
        <span class="stlbl">${label.toUpperCase()}</span>
        <span class="stn r">${valR}</span>
      </div>
      <div class="stbar">
        <div class="stfill" style="width:${pL}%"></div>
      </div>
    </div>
  `;
}
function mdTab(el,contentId){
  document.querySelectorAll('.mdtab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.mdtc').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');const tc=$(contentId);if(tc)tc.classList.add('on');
}

/* ---- REMINDER ---- */
function toggleReminder(id){
  const m=D.matches.find(x=>x.id===id);if(!m)return;
  reminders[id]=!reminders[id];
  if(reminders[id]){
    toast('🔔 Recordatorio establecido');
    if('Notification' in window&&Notification.permission==='granted'){
      const ms=new Date(m.datetime)-Date.now()-15*60*1000;
      if(ms>0)setTimeout(()=>new Notification('LSL — Partido próximo',{body:`${team(m.homeTeam)?.name} vs ${team(m.awayTeam)?.name} en 15 minutos`}),ms);
    }
  }else{toast('🔕 Recordatorio eliminado')}
  // Refresh button
  const btn=$(`reminder-btn-${id}`);
  if(btn){btn.className=`md-reminder-btn${reminders[id]?' set':''}`;btn.innerHTML=`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>${reminders[id]?'<path d="M3 3l18 18" stroke-width="2.2"/>':''}</svg>${reminders[id]?'Recordatorio establecido ✓':'Establecer recordatorio'}`}
}

/* ---- NEWS ---- */
function renderFeatN(){
  const c=$('feat-n');if(!c)return;
  if(!D.news.length){c.innerHTML='<div class="empty"><div class="etic">&#x1F4F0;</div><div class="etit">Sin noticias</div></div>';return}
  const [big,...rest]=D.news.slice(0,4);
  c.innerHTML=`
    <div style="padding:0 14px">
      <div class="ncbig" onclick="openNews('${big.id}')">
        <div class="ncbig-img">${big.image?`<img src="${big.image}" loading="lazy"/>`:'<span style="font-size:48px;opacity:.2">📰</span>'}</div>
        <div class="ncbig-body"><div class="nccat">${big.category||'NOTICIAS'}</div><div class="ncbig-t">${big.title}</div><div class="ncexc">${big.excerpt}</div></div>
      </div>
    </div>
    ${rest.length?`<div style="padding:10px 14px 0">${rest.map(n=>`<div class="ncsm" onclick="openNews('${n.id}')"><div class="ncsm-img" style="height:80px">${n.image?`<img src="${n.image}" loading="lazy"/>`:''}</div><div class="ncsm-body"><div class="ncsm-t">${n.title}</div><div class="nccat">${n.category||''}</div><div class="ncdt">${fmtND(n.date)}</div></div></div>`).join('')}</div>`:''}
  `;
  setTimeout(updateAmbient,300);
}
function renderAllN(){
  const c=$('all-n');if(!c)return;
  if(!D.news.length){c.innerHTML='<div class="empty"><div class="etic">&#x1F4F0;</div><div class="etit">Sin noticias</div></div>';return}
  c.innerHTML=`<div style="padding:0 14px">${D.news.map(n=>`<div class="ncsm" onclick="openNews('${n.id}')"><div class="ncsm-img" style="height:72px">${n.image?`<img src="${n.image}" loading="lazy"/>`:''}</div><div class="ncsm-body"><div class="ncsm-t">${n.title}</div><div class="nccat">${n.category||''}</div><div class="ncdt">${fmtND(n.date)}</div></div></div>`).join('')}</div>`;
}
function openNews(id){
  const n=D.news.find(x=>x.id===id);if(!n)return;
  $('nw-content').innerHTML=`
    <div class="ndimg">${n.image?`<img src="${n.image}"/>`:''}</div>
    <div class="ndbody">
      <div class="ndcat">${n.category||'NOTICIAS'}</div>
      <div class="ndtit">${n.title}</div>
      <div class="nddate">${fmtND(n.date)}</div>
      <div class="ndtxt">${(n.content||'').replace(/\n/g,'<br/>')}</div>
    </div>
  `;
  openOv('nw-ov');setTimeout(updateAmbient,300);
}

/* ---- STANDINGS ---- */
function calcStandings(){
  D.teams.forEach(t=>{t.pj=0;t.pg=0;t.pp=0;t.pe=0;t.gf=0;t.gc=0;t.pts=0});
  D.matches.filter(m=>m.status==='finalizado').forEach(m=>{
    const h=team(m.homeTeam),a=team(m.awayTeam);if(!h||!a)return;
    const hs=m.homeScore??0,as=m.awayScore??0;
    h.pj++;a.pj++;h.gf+=hs;h.gc+=as;a.gf+=as;a.gc+=hs;
    if(hs>as){h.pg++;h.pts+=3;a.pp++}
    else if(hs<as){a.pg++;a.pts+=3;h.pp++}
    else{h.pe++;a.pe++;h.pts++;a.pts++}
  });
}
function sortedTeams(){
  calcStandings();
  return D.teams.slice().sort((a,b)=>{
    const ap=a.pts+(a.adj||0),bp=b.pts+(b.adj||0);
    if(bp!==ap)return bp-ap;
    return(b.gf-b.gc)-(a.gf-a.gc);
  });
}
function renderStandings(){
  const tb=$('ftbody');if(!tb)return;
  const ts=sortedTeams();
  if(!ts.length){tb.innerHTML='<tr><td colspan="10"><div class="empty"><div class="etic">&#x1F3C6;</div><div class="etit">Sin datos</div></div></td></tr>';return}
  tb.innerHTML=ts.map((t,i)=>{
    const pts=t.pts+(t.adj||0);
    const dg=t.gf-t.gc;
    const dgTxt=dg>0?`+${dg}`:dg===0?'0':dg;
    return`<tr>
      <td>${i+1}</td>
      <td><div class="sttr"><div class="stcr">${crEl(t.logo,t.name.substring(0,3))}</div><span>${t.name}</span></div></td>
      <td>${t.pj}</td><td>${t.pg}</td><td>${t.pe||0}</td><td>${t.pp}</td>
      <td>${t.gf}</td><td>${t.gc}</td>
      <td style="color:${dg>0?'var(--live)':dg<0?'var(--danger)':'var(--t2)'}">${dgTxt}</td>
      <td>${pts}</td>
    </tr>`;
  }).join('');
}
function renderMiniTbl(){
  const c=$('mini-tbl');if(!c)return;
  const ts=sortedTeams().slice(0,5);
  if(!ts.length){c.innerHTML='<div class="empty"><div class="etic">&#x1F3C6;</div><div class="etit">Sin equipos</div></div>';return}
  c.innerHTML=`<div class="stw" style="margin:0 14px"><table class="stt"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>Pts</th></tr></thead><tbody>${ts.map((t,i)=>`<tr><td>${i+1}</td><td><div class="sttr"><div class="stcr">${crEl(t.logo,t.name.substring(0,3))}</div><span>${t.name}</span></div></td><td>${t.pj}</td><td>${t.pts+(t.adj||0)}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderSanc(){
  const c=$('sanc-box');if(!c)return;
  if(!D.sanctions.length){c.innerHTML='<div class="empty"><div class="etic">&#x1F7E8;</div><div class="etit">Sin sancionados</div></div>';return}
  const ic={sancion:'🟨',expulsion:'🟥',lesion:'🏥',otro:'📋'};
  c.innerHTML=D.sanctions.map(s=>`<div class="sancrow"><div><div class="sancn">${ic[s.type]||'📋'} ${s.player}</div><div class="sanct">${team(s.teamId)?.name||''} · ${s.duration||''}</div></div><div class="sanct">${s.notes||''}</div></div>`).join('');
}

/* ---- ADMIN LISTS ---- */
function renderAdmLists(){
  const ml=$('adm-m-list');if(ml)ml.innerHTML=D.matches.length?D.matches.map(m=>{
    const h=team(m.homeTeam),a=team(m.awayTeam);if(!h||!a)return'';
    return`<div class="ali"><div class="alcr">${crEl(h.logo,h.name.substring(0,3))}</div><div class="alinf"><div class="aln">${h.name} ${m.homeScore??'-'} - ${m.awayScore??'-'} ${a.name}</div><div class="als">${stLabel(m.status)} · ${fmtND(m.datetime)}</div></div><div class="alacts">
      <button class="albtn" onclick="openLiveEdit('${m.id}')" title="Editar"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
      <button class="albtn" onclick="delMatch('${m.id}')" title="Eliminar"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
    </div></div>`;
  }).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">&#x26BD;</div><div class="etit">Sin partidos</div></div>';
  const lc=$('live-ctrls');if(lc){const live=D.matches.filter(m=>m.status==='en_vivo');lc.innerHTML=live.length?live.map(m=>{const h=team(m.homeTeam),a=team(m.awayTeam);if(!h||!a)return'';return`<div class="lcbox"><div class="lctit">${h.name} vs ${a.name}</div><div class="lcsc"><div class="lctn">${h.name}</div><div class="scc"><button class="scb" onclick="chSc('${m.id}','h',1)">+</button><button class="scb" onclick="chSc('${m.id}','h',-1)">-</button></div><div class="lcn" id="lch-${m.id}">${m.homeScore??0}</div><div style="font-family:'Bebas Neue';font-size:26px;color:var(--t3)">-</div><div class="lcn" id="lca-${m.id}">${m.awayScore??0}</div><div class="scc"><button class="scb" onclick="chSc('${m.id}','a',1)">+</button><button class="scb" onclick="chSc('${m.id}','a',-1)">-</button></div><div class="lctn">${a.name}</div></div></div>`}).join(''):'<div class="empty" style="padding:16px 0"><div class="etit" style="font-size:12px">No hay partidos activos</div></div>'}
  const tl=$('adm-t-list');if(tl)tl.innerHTML=D.teams.length?D.teams.map(t=>`<div class="ali"><div class="alcr">${crEl(t.logo,t.name.substring(0,3))}</div><div class="alinf"><div class="aln">${t.name}</div><div class="als">PJ:${t.pj||0} Pts:${(t.pts+(t.adj||0))||0}</div></div><div class="alacts"><button class="albtn" onclick="delTeam('${t.id}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">&#x1F3C6;</div><div class="etit">Sin equipos</div></div>';
  const pl=$('adm-pl-list');if(pl)pl.innerHTML=D.players.length?D.players.map(p=>{const t=team(p.teamId);return`<div class="ali"><div class="alcr" style="font-family:'Bebas Neue';font-size:13px">${p.number||'#'}</div><div class="alinf"><div class="aln">${p.name}</div><div class="als">${p.position} · ${t?.name||'?'}</div></div><div class="alacts"><button class="albtn" onclick="delPlayer('${p.id}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`}).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">&#x1F464;</div><div class="etit">Sin jugadores</div></div>';
  const nl=$('adm-n-list');if(nl)nl.innerHTML=D.news.length?D.news.map(n=>`<div class="ali"><div class="alinf"><div class="aln">${n.title}</div><div class="als">${n.category} · ${fmtND(n.date)}</div></div><div class="alacts"><button class="albtn" onclick="delNews('${n.id}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">&#x1F4F0;</div><div class="etit">Sin noticias</div></div>';
  const chl=$('adm-ch-list');if(chl)chl.innerHTML=D.channels.length?D.channels.map(c=>`<div class="ali"><div class="alcr">${crEl(c.logo,c.name.substring(0,2))}</div><div class="alinf"><div class="aln">${c.name}</div><div class="als">${c.url||'Sin URL'}</div></div><div class="alacts"><button class="albtn" onclick="delChannel('${c.id}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">&#x1F4FA;</div><div class="etit">Sin canales</div></div>';
  const sl=$('adm-sa-list');if(sl)sl.innerHTML=D.sanctions.length?D.sanctions.map(s=>`<div class="ali"><div class="alinf"><div class="aln">${s.player}</div><div class="als">${s.type} · ${s.duration||''}</div></div><div class="alacts"><button class="albtn" onclick="delSanction('${s.id}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">&#x1F7E8;</div><div class="etit">Sin sanciones</div></div>';
  // Referees
  const refl=$('adm-ref-list');if(refl)refl.innerHTML=(D.referees||[]).length?(D.referees||[]).map(r=>`<div class="ali"><div class="alinf"><div class="aln">${r.name}</div><div class="als">${r.category}</div></div><div class="alacts"><button class="albtn" onclick="delReferee('${r.id}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">👨‍⚖️</div><div class="etit">Sin árbitros</div></div>';
  // Sponsors
  const spl=$('adm-sp-list');if(spl)spl.innerHTML=(D.sponsors||[]).length?(D.sponsors||[]).map(s=>`<div class="ali"><div class="alcr">${crEl(s.logo,s.name.substring(0,2))}</div><div class="alinf"><div class="aln">${s.name}</div><div class="als">${s.type}</div></div><div class="alacts"><button class="albtn" onclick="delSponsor('${s.id}')"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`).join(''):'<div class="empty" style="padding:16px 0"><div class="etic">💼</div><div class="etit">Sin sponsors</div></div>';
  // Stats
  updateStatsPanel();
}
function delReferee(id){if(!confirm('¿Eliminar árbitro?'))return;if(!D.referees)D.referees=[];D.referees=D.referees.filter(r=>r.id!==id);save();renderAdmLists();toast('Árbitro eliminado')}
function delSponsor(id){if(!confirm('¿Eliminar sponsor?'))return;if(!D.sponsors)D.sponsors=[];D.sponsors=D.sponsors.filter(s=>s.id!==id);save();renderAdmLists();toast('Sponsor eliminado')}

/* ---- ADMIN SELECTS ---- */
function populateSels(){
  const opts='<option value="">Seleccionar...</option>'+D.teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  ['mh-team','ma-team','sa-team','pl-team','pts-team'].forEach(id=>{const el=$(id);if(el){const v=el.value;el.innerHTML=opts;el.value=v}});
  const mch=$('m-ch');if(mch){mch.innerHTML='<option value="">Sin canal</option>'+D.channels.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
}
function updateAdmCfg(){
  if($('cfg-name'))$('cfg-name').value=D.cfg.name||'';
  if($('cfg-short'))$('cfg-short').value=D.cfg.short||'';
  if($('cfg-rules'))$('cfg-rules').value=D.cfg.rules||'';
  if($('cfg-info'))$('cfg-info').value=D.cfg.info||'';
  if($('sea-name'))$('sea-name').value=D.cfg.season||'';
  if($('sea-status'))$('sea-status').value=D.cfg.status||'en_curso';
  if($('sea-desc'))$('sea-desc').value=D.cfg.seasonDesc||'';
}

/* ---- SAVES ---- */
function prefillMatchDate(){
  const el=$('m-dt');
  if(el&&!el.value){
    // Pre-fill with today's date and next round hour
    const now=new Date();
    now.setMinutes(0,0,0);
    now.setHours(now.getHours()+1);
    // Format as yyyy-MM-ddTHH:mm (required for datetime-local)
    const pad=n=>String(n).padStart(2,'0');
    el.value=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
  }
}
function saveMatch(){
  const h=$('mh-team')?.value||'';
  const a=$('ma-team')?.value||'';
  const dt=$('m-dt')?.value||'';
  const st=$('m-st')?.value||'proximo';
  const stad=$('m-stad')?.value.trim()||'';
  const ch=$('m-ch')?.value||'';
  const roomCode=$('m-room')?.value?.trim()||'';
  const competition=$('m-comp')?.value||'liga';
  const jornada=$('m-jornada')?.value?.trim()||'';
  if(!h&&!a&&!dt){toast('⚠️ Completá: local, visitante y fecha');return}
  if(!h){toast('⚠️ Seleccioná el equipo Local');$('mh-team')?.focus();return}
  if(!a){toast('⚠️ Seleccioná el equipo Visitante');$('ma-team')?.focus();return}
  if(!dt){toast('⚠️ Ingresá la fecha y hora del partido');$('m-dt')?.focus();return}
  if(h===a){toast('⚠️ El local y visitante deben ser equipos distintos');return}
  let isoDate;try{isoDate=new Date(dt).toISOString()}catch(e){toast('⚠️ Fecha inválida');return}
  const newMatch={id:Date.now().toString(),homeTeam:h,awayTeam:a,homeScore:0,awayScore:0,datetime:isoDate,status:st,stadium:stad,channel:ch,roomCode:roomCode,competition:competition,jornada:jornada,events:[],stats:{}};
  D.matches.push(newMatch);save();renderAll();
  const hSel=$('mh-team'),aSel=$('ma-team');if(hSel)hSel.value='';if(aSel)aSel.value='';
  const stadEl=$('m-stad');if(stadEl)stadEl.value='';
  const roomEl=$('m-room');if(roomEl)roomEl.value='';
  const jornadaEl=$('m-jornada');if(jornadaEl)jornadaEl.value='';
  prefillMatchDate();
  addNotif('Nuevo partido',`${teamName(h)} vs ${teamName(a)}`);
  try{sendPushToAll('⚽ Nuevo partido',`${teamName(h)} vs ${teamName(a)}`)}catch(e){}
  toast('✅ Partido guardado correctamente');broadcastUpdate();adminSync();
}
function updateJornadaPlaceholder(){
  const comp=$('m-comp')?.value;const inp=$('m-jornada');if(!inp)return;
  const placeholders={liga:'Ej: Fecha 5',copa:'Ej: Octavos de Final',amistoso:'Ej: Amistoso de pretemporada'};
  inp.placeholder=placeholders[comp]||'Ej: Fecha 5';
}
function teamName(id){return D.teams.find(t=>t.id===id)?.name||id}
function delMatch(id){if(!confirm('¿Eliminar partido?'))return;D.matches=D.matches.filter(m=>m.id!==id);save();renderAll();broadcastUpdate();adminSync();toast('🗑️ Eliminado')}
function setStatus(id,st){const m=D.matches.find(x=>x.id===id);if(m){m.status=st;save();renderAll();broadcastUpdate();adminSync()}}
function chSc(id,side,d){
  const m=D.matches.find(x=>x.id===id);if(!m)return;
  if(side==='h')m.homeScore=Math.max(0,(m.homeScore??0)+d);
  else m.awayScore=Math.max(0,(m.awayScore??0)+d);
  if(d>0){[`lch-${id}`,`lca-${id}`,`mdh-${id}`,`mda-${id}`,`fcmh-${id}`,`fcma-${id}`,`rmh-${id}`,`rma-${id}`].forEach(eid=>{const el=$(eid);if(el){el.classList.remove('scfl');void el.offsetWidth;el.classList.add('scfl')}})}
  [`lch-${id}`,`mdh-${id}`,`fcmh-${id}`,`rmh-${id}`].forEach(eid=>{const el=$(eid);if(el)el.textContent=m.homeScore??0});
  [`lca-${id}`,`mda-${id}`,`fcma-${id}`,`rma-${id}`].forEach(eid=>{const el=$(eid);if(el)el.textContent=m.awayScore??0});
  saveLater();broadcastUpdate();adminSync();
}
function saveTeam(){
  const name=$('t-name').value.trim();if(!name){toast('Ingresa un nombre');return}
  D.teams.push({id:Date.now().toString(),name,logo:pending.pendingTeamLogo||'',pj:0,pg:0,pp:0,pe:0,gf:0,gc:0,pts:0,adj:0});
  save();pending.pendingTeamLogo=null;$('t-name').value='';resetFup('t-logo-btn','t-logo-txt','Subir escudo desde galería');renderAll();toast('✅ Equipo guardado');broadcastUpdate();adminSync();
}
function delTeam(id){if(!confirm('¿Eliminar equipo?'))return;D.teams=D.teams.filter(t=>t.id!==id);D.matches=D.matches.filter(m=>m.homeTeam!==id&&m.awayTeam!==id);D.players=D.players.filter(p=>p.teamId!==id);save();renderAll();broadcastUpdate();adminSync();toast('🗑️ Eliminado')}
function savePlayer(){
  const name=$('pl-name').value.trim(),tid=$('pl-team').value;if(!name||!tid){toast('Nombre y equipo requeridos');return}
  D.players.push({id:Date.now().toString(),name,number:$('pl-num').value,position:$('pl-pos').value,teamId:tid,photo:pending.pendingPlayerPhoto||''});
  pending.pendingPlayerPhoto=null;save();$('pl-name').value='';$('pl-num').value='';resetFup('pl-photo-btn','pl-photo-txt','Foto (opcional)');renderAdmLists();toast('✅ Jugador agregado');adminSync();
}
function delPlayer(id){D.players=D.players.filter(p=>p.id!==id);save();renderAdmLists();toast('🗑️ Eliminado');adminSync();}
function saveNews(){
  const t=$('n-title').value.trim(),ex=$('n-excerpt').value.trim(),body=$('n-body').value.trim();
  if(!t||!ex||!body){toast('Completa todos los campos');return}
  D.news.unshift({id:Date.now().toString(),title:t,category:$('n-cat').value,excerpt:ex,content:body,image:pending.pendingNewsImg||'',date:new Date().toISOString()});
  pending.pendingNewsImg=null;save();
  ['n-title','n-excerpt','n-body'].forEach(id=>{const el=$(id);if(el)el.value=''});
  resetFup('n-img-btn','n-img-txt','Subir imagen desde galería');
  addNotif('Nueva noticia',t);renderAll();toast('✅ Noticia publicada');broadcastUpdate();adminSync();
}
function delNews(id){if(!confirm('¿Eliminar?'))return;D.news=D.news.filter(n=>n.id!==id);save();renderAll();broadcastUpdate();adminSync();toast('🗑️ Eliminada')}
function saveChannel(){
  const name=$('ch-name').value.trim();if(!name){toast('Ingresa un nombre');return}
  D.channels.push({id:Date.now().toString(),name,url:$('ch-url').value.trim(),logo:pending.pendingChLogo||''});
  pending.pendingChLogo=null;save();$('ch-name').value='';$('ch-url').value='';resetFup('ch-logo-btn','ch-logo-txt','Logo del canal');populateSels();renderAdmLists();toast('✅ Canal guardado');adminSync();
}
function delChannel(id){D.channels=D.channels.filter(c=>c.id!==id);save();populateSels();renderAdmLists();toast('🗑️ Eliminado');adminSync();}
function saveSanction(){
  const player=$('sa-player').value.trim(),tid=$('sa-team').value;if(!player||!tid){toast('Jugador y equipo requeridos');return}
  D.sanctions.push({id:Date.now().toString(),player,teamId:tid,type:$('sa-type').value,duration:$('sa-dur').value.trim(),notes:$('sa-notes').value.trim()});
  save();['sa-player','sa-dur','sa-notes'].forEach(id=>{const el=$(id);if(el)el.value=''});renderAll();toast('✅ Sanción registrada');adminSync();
}
function delSanction(id){D.sanctions=D.sanctions.filter(s=>s.id!==id);save();renderAll();toast('🗑️ Eliminada');adminSync();}
function saveSeason(){
  const name=$('sea-name').value.trim();if(!name){toast('Ingresa un nombre');return}
  if(D.cfg.season&&D.cfg.season!==name)D.seasons.push({name:D.cfg.season,date:new Date().toISOString()});
  D.cfg.season=name;D.cfg.status=$('sea-status').value;D.cfg.seasonDesc=$('sea-desc').value.trim();
  save();updateHdr();updateGreet();
  const sl=$('adm-sea-list');if(sl)sl.innerHTML=D.seasons.map(s=>`<div class="ali"><div class="alinf"><div class="aln">${s.name}</div><div class="als">${fmtND(s.date)}</div></div></div>`).join('')||'<div class="empty" style="padding:14px 0"><div class="etic">🏅</div><div class="etit">Sin historial</div></div>';
  toast('✅ Temporada actualizada');broadcastUpdate();adminSync();
}
function adjustPoints(){
  const tid=$('pts-team').value,delta=parseInt($('pts-delta').value);if(!tid||isNaN(delta)){toast('Selecciona equipo y puntos');return}
  const t=team(tid);if(!t)return;t.adj=(t.adj||0)+delta;save();renderStandings();toast(`${delta>0?'+':''}${delta} pts para ${t.name}`);adminSync();
}
function saveConfig(){
  D.cfg.name=$('cfg-name').value.trim()||D.cfg.name;
  D.cfg.short=$('cfg-short').value.trim()||D.cfg.short;
  D.cfg.rules=$('cfg-rules').value.trim();
  D.cfg.info=$('cfg-info')?$('cfg-info').value.trim():'';
  const newPass=$('cfg-pass').value;if(newPass&&newPass.length>=4)D.cfg.adminPass=newPass;
  if(pending.pendingCfgLogo)D.cfg.logo=pending.pendingCfgLogo;
  pending.pendingCfgLogo=null;save();
  updateHdr();renderRulesAndInfo();
  resetFup('cfg-logo-btn','cfg-logo-txt','Cambiar logo');
  if($('cfg-pass'))$('cfg-pass').value='';
  toast('✅ Config guardada');broadcastUpdate();adminSync();setupManifest();
}
function resetApp(){if(!confirm('¿Esto borrará TODOS los datos?'))return;localStorage.removeItem(STORE);location.reload()}
function exportJSON(){const blob=new Blob([JSON.stringify(D,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`lsl-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();toast('✅ Exportado')}
function importJSON(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{try{const imp=JSON.parse(ev.target.result);D=deepMerge(D,imp);save();renderAll();updateHdr();updateUser();adminSync();toast('✅ Datos importados');broadcastUpdate()}catch(err){toast('❌ Archivo inválido')}};r.readAsText(f);e.target.value=''}

/* ---- LIVE EDIT ---- */
function openLiveEdit(id){
  const m=D.matches.find(x=>x.id===id);if(!m)return;
  const h=team(m.homeTeam),a=team(m.awayTeam);
  $('le-content').innerHTML=`
    <div class="sect" style="margin-bottom:14px">${h?.name||'L'} vs ${a?.name||'V'}</div>
    <div class="frow">
      <div class="fgrp"><div class="fl">Competencia</div><select class="fsel" id="le-comp"><option value="liga" ${(m.competition||'liga')==='liga'?'selected':''}>Liga</option><option value="copa" ${m.competition==='copa'?'selected':''}>Copa</option><option value="amistoso" ${m.competition==='amistoso'?'selected':''}>Amistoso</option></select></div>
      <div class="fgrp"><div class="fl">Jornada / Fecha</div><input type="text" class="fi" id="le-jornada" value="${m.jornada||''}" placeholder="Ej: Fecha 5"/></div>
    </div>
    <div class="fl">Estado</div>
    <select class="fsel" id="le-st" onchange="setStatus('${id}',this.value)">
      <option value="proximo" ${m.status==='proximo'?'selected':''}>Próximo</option>
      <option value="en_vivo" ${m.status==='en_vivo'?'selected':''}>En Vivo</option>
      <option value="finalizado" ${m.status==='finalizado'?'selected':''}>Finalizado</option>
      <option value="pausado" ${m.status==='pausado'?'selected':''}>Pausado</option>
    </select>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1"><div class="fl">Goles ${h?.name||'L'}</div><input type="number" class="fi" id="le-hs" value="${m.homeScore??0}" min="0" style="margin-bottom:0"/></div>
      <div style="flex:1"><div class="fl">Goles ${a?.name||'V'}</div><input type="number" class="fi" id="le-as" value="${m.awayScore??0}" min="0" style="margin-bottom:0"/></div>
    </div>
    <div class="fl" style="margin-top:10px">Agregar evento</div>
    <div class="aform" style="padding:12px">
      <div class="fl">Tipo</div><select class="fsel" id="le-et"><option value="goal">Gol</option><option value="yellow">Amarilla</option><option value="red">Roja</option><option value="assist">Asistencia</option><option value="sub">Cambio</option></select>
      <div style="display:flex;gap:8px">
        <div style="flex:1"><div class="fl">Jugador</div><input type="text" class="fi" id="le-ep" placeholder="Nombre..." style="margin-bottom:0"/></div>
        <div style="flex:1"><div class="fl">Minuto</div><input type="number" class="fi" id="le-em" placeholder="45" min="1" max="120" style="margin-bottom:0"/></div>
      </div>
      <div class="fl" style="margin-top:8px">Equipo</div>
      <select class="fsel" id="le-eteam"><option value="home">${h?.name||'Local'}</option><option value="away">${a?.name||'Visita'}</option></select>
      <button class="abtn" onclick="addEvent('${id}')">AGREGAR EVENTO</button>
    </div>
    <div class="fl">Posesión ${h?.name||'L'} (%)</div>
    <input type="number" class="fi" id="le-poss" value="${m.stats?.possession??50}" min="0" max="100"/>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1"><div class="fl">Remates L</div><input type="number" class="fi" id="le-sh" value="${m.stats?.shots??0}" style="margin-bottom:0"/></div>
      <div style="flex:1"><div class="fl">Remates V</div><input type="number" class="fi" id="le-sha" value="${m.stats?.shotsAway??0}" style="margin-bottom:0"/></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1"><div class="fl">Faltas L</div><input type="number" class="fi" id="le-fo" value="${m.stats?.fouls??0}" style="margin-bottom:0"/></div>
      <div style="flex:1"><div class="fl">Faltas V</div><input type="number" class="fi" id="le-foa" value="${m.stats?.foulsAway??0}" style="margin-bottom:0"/></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1"><div class="fl">Pases L</div><input type="number" class="fi" id="le-pa" value="${m.stats?.passes??0}" style="margin-bottom:0"/></div>
      <div style="flex:1"><div class="fl">Pases V</div><input type="number" class="fi" id="le-paa" value="${m.stats?.passesAway??0}" style="margin-bottom:0"/></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1"><div class="fl">Fuera de juego L</div><input type="number" class="fi" id="le-off" value="${m.stats?.offsides??0}" style="margin-bottom:0"/></div>
      <div style="flex:1"><div class="fl">Fuera de juego V</div><input type="number" class="fi" id="le-offa" value="${m.stats?.offsidesAway??0}" style="margin-bottom:0"/></div>
    </div>
    <div class="fl" style="margin-top:14px">Jugador del partido</div>
    ${buildMvpFields('mvp',m.mvp,'General')}
    ${buildMvpFields('mvpH',m.mvpHome,h?.name||'Local')}
    ${buildMvpFields('mvpA',m.mvpAway,a?.name||'Visitante')}
    <button class="abtn" onclick="saveLiveEdit('${id}')">GUARDAR CAMBIOS</button>
    <div class="fl" style="margin-top:14px">Eventos</div>
    <div>${(m.events||[]).length?(m.events||[]).map((ev,i)=>{
      const ecolor={'goal':'#22c55e','yellow':'#facc15','red':'#f87171','assist':'#60a5fa','sub':'#a78bfa'}[ev.type]||'#888';
      return`<div class="ali"><div class="evico" style="width:22px;color:${ecolor}">${evIcon(ev.type)}</div><div class="alinf"><div class="aln">${ev.player} (${ev.minute}')</div><div class="als">${ev.team==='home'?(h?.name||'L'):(a?.name||'V')}</div></div><div class="alacts"><button class="albtn" onclick="delEv('${id}',${i})"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button></div></div>`;
    }).join(''):'<div class="empty" style="padding:10px 0"><div class="etit" style="font-size:12px">Sin eventos</div></div>'}</div>
  `;
  openOv('le-ov');
}
function buildMvpFields(prefix,mvp,teamLabel){
  mvp=mvp||{};
  return`
    <div class="aform" style="padding:12px;margin-bottom:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--t3);text-transform:uppercase;margin-bottom:8px">${teamLabel}</div>
      <div style="display:flex;gap:8px">
        <div style="flex:2"><div class="fl">Jugador</div><input type="text" class="fi" id="le-${prefix}-name" value="${mvp.name||''}" placeholder="Nombre..." style="margin-bottom:0"/></div>
        <div style="flex:1"><div class="fl">Puntaje</div><input type="number" class="fi" id="le-${prefix}-rating" value="${mvp.rating??''}" placeholder="9.1" min="0" max="10" step="0.1" style="margin-bottom:0"/></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <div style="flex:1"><div class="fl">Pases</div><input type="number" class="fi" id="le-${prefix}-passes" value="${mvp.passes??0}" min="0" style="margin-bottom:0"/></div>
        <div style="flex:1"><div class="fl">Goles</div><input type="number" class="fi" id="le-${prefix}-goals" value="${mvp.goals??0}" min="0" style="margin-bottom:0"/></div>
        <div style="flex:1"><div class="fl">Asist.</div><input type="number" class="fi" id="le-${prefix}-assists" value="${mvp.assists??0}" min="0" style="margin-bottom:0"/></div>
        <div style="flex:1"><div class="fl">Faltas</div><input type="number" class="fi" id="le-${prefix}-fouls" value="${mvp.fouls??0}" min="0" style="margin-bottom:0"/></div>
      </div>
    </div>
  `;
}
function readMvpFields(prefix){
  const name=$(`le-${prefix}-name`)?.value?.trim()||'';
  if(!name)return null;
  return{
    name,
    rating:parseFloat($(`le-${prefix}-rating`)?.value)||0,
    passes:+$(`le-${prefix}-passes`)?.value||0,
    goals:+$(`le-${prefix}-goals`)?.value||0,
    assists:+$(`le-${prefix}-assists`)?.value||0,
    fouls:+$(`le-${prefix}-fouls`)?.value||0,
  };
}
function addEvent(id){
  const m=D.matches.find(x=>x.id===id);if(!m)return;if(!m.events)m.events=[];
  const player=$('le-ep').value.trim(),min=parseInt($('le-em').value);
  if(!player||!min){toast('Completa jugador y minuto');return}
  m.events.push({type:$('le-et').value,player,minute:min,team:$('le-eteam').value});
  m.events.sort((a,b)=>a.minute-b.minute);save();renderAll();openLiveEdit(id);toast('✅ Evento agregado');broadcastUpdate();
}
function delEv(id,i){const m=D.matches.find(x=>x.id===id);if(m?.events){m.events.splice(i,1);save();renderAll();openLiveEdit(id);broadcastUpdate()}}
function saveLiveEdit(id){
  const m=D.matches.find(x=>x.id===id);if(!m)return;
  m.homeScore=parseInt($('le-hs').value)||0;m.awayScore=parseInt($('le-as').value)||0;
  m.competition=$('le-comp')?.value||'liga';m.jornada=$('le-jornada')?.value?.trim()||'';
  m.stats={
    possession:+$('le-poss').value||50,
    shots:+$('le-sh').value||0,shotsAway:+$('le-sha').value||0,
    fouls:+$('le-fo').value||0,foulsAway:+$('le-foa').value||0,
    passes:+$('le-pa').value||0,passesAway:+$('le-paa').value||0,
    offsides:+$('le-off').value||0,offsidesAway:+$('le-offa').value||0,
  };
  m.mvp=readMvpFields('mvp');
  m.mvpHome=readMvpFields('mvpH');
  m.mvpAway=readMvpFields('mvpA');
  save();renderAll();broadcastUpdate();adminSync();toast('✅ Partido actualizado');
}

/* ---- FILE HANDLING (con compresión automática) ---- */
const MAX_FILE=5*1024*1024;
const VALID_TYPES=['image/jpeg','image/png','image/webp'];

// Compress image to canvas blob
function compressImage(file,maxDim=1200,quality=0.82){
  return new Promise((resolve)=>{
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        let {width:w,height:h}=img;
        if(w>maxDim||h>maxDim){const r=maxDim/Math.max(w,h);w=Math.round(w*r);h=Math.round(h*r)}
        const cv=document.createElement('canvas');cv.width=w;cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        cv.toBlob(blob=>resolve(blob),'image/jpeg',quality);
      };
      img.onerror=()=>{
        // fallback: use file as-is
        resolve(file);
      };
      img.src=ev.target.result;
    };
    reader.onerror=()=>resolve(file);
    reader.readAsDataURL(file);
  });
}

// Main file handler: compress → upload to Supabase Storage → store URL
// Falls back to base64 if Storage upload fails
async function handleFile(e,key,btnId,txtId){
  const f=e.target.files?.[0];if(!f)return;
  if(!VALID_TYPES.includes(f.type)){toast('❌ Solo JPG, PNG o WebP');return}
  // Show loading state
  const btn=$(btnId),txt=$(txtId);
  if(btn)btn.classList.add('uploading');
  if(txt)txt.textContent='⏳ Subiendo...';
  try{
    // 1. Compress
    const blob=await compressImage(f);
    // 2. Try Supabase Storage upload
    let url=null;
    if(_sbReady){
      url=await uploadToStorage(blob,'shared');
    }
    // 3. Fallback to base64 if Storage not available
    if(!url){
      url=await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=ev=>res(ev.target.result);
        r.onerror=()=>rej(new Error('read error'));
        r.readAsDataURL(blob);
      });
    }
    pending[key]=url;
    if(btn){btn.classList.remove('uploading');btn.classList.add('has')}
    if(txt)txt.textContent=url.startsWith('http')?'✅ '+f.name:f.name;
    if(url.startsWith('http'))toast('☁️ Imagen en la nube');
    else if(url.startsWith('data:'))toast('💾 Imagen guardada localmente');
  }catch(err){
    if(btn)btn.classList.remove('uploading');
    if(txt)txt.textContent='❌ Error';
    toast('❌ Error al procesar imagen');
    console.error(err);
  }
}

function resetFup(btnId,txtId,label){
  $(btnId)?.classList.remove('has','uploading');
  if($(txtId))$(txtId).textContent=label;
}

// Avatar: upload to Storage under user-specific folder, store URL
async function handleAvatarUpload(e){
  const f=e.target.files?.[0];if(!f)return;
  toast('⏳ Subiendo avatar...');
  try{
    const blob=await compressImage(f,400,0.85);
    let url=null;
    if(_sbReady)url=await uploadToStorage(blob,'avatars');
    if(!url){
      url=await new Promise((res,rej)=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.onerror=rej;r.readAsDataURL(blob)});
      console.log('Avatar guardado como base64');
    }
    D.user.avatar=url;save();updateUser();
    toast('✅ Avatar actualizado');
  }catch(err){
    console.error('Avatar error:',err);
    toast('❌ Error al subir avatar');
  }
}

// Banner: same as avatar
async function handleBannerUpload(e){
  const f=e.target.files?.[0];if(!f)return;
  toast('⏳ Subiendo banner...');
  try{
    const blob=await compressImage(f,1400,0.85);
    let url=null;
    if(_sbReady)url=await uploadToStorage(blob,'banners');
    if(!url){
      url=await new Promise((res,rej)=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.onerror=rej;r.readAsDataURL(blob)});
      console.log('Banner guardado como base64');
    }
    D.user.banner=url;save();updateUser();
    toast('✅ Banner actualizado');
  }catch(err){
    console.error('Banner error:',err);
    toast('❌ Error al subir banner');
  }
}

function triggerAvatar(){$('avatar-fi').click()}
function triggerBanner(){$('banner-fi').click()}

/* ---- PROFILE ---- */
function openProfEdit(){$('pe-name').value=D.user.name||'';$('pe-bio').value=D.user.bio||'';openOv('pe-ov')}
function saveProfEdit(){const n=$('pe-name').value.trim();if(!n){toast('Nombre no puede estar vacío');return}D.user.name=n;D.user.bio=$('pe-bio').value.trim();save();updateUser();updateGreet();closeOv('pe-ov');toast('✅ Perfil actualizado')}
function openTeamPicker(){
  const c=$('tp-list');
  if(!D.teams.length){c.innerHTML='<div class="empty"><div class="etic">⚽</div><div class="etit">Sin equipos</div></div>';openOv('tp-ov');return}
  c.innerHTML=D.teams.map(t=>`<div class="tpit${D.user.favTeam===t.id?' sel':''}" onclick="pickTeam('${t.id}')"><div class="alcr" style="border-radius:9px">${crEl(t.logo,t.name.substring(0,3))}</div><div style="font-size:14px;font-weight:700;color:var(--text)">${t.name}</div><div class="tpck">${D.user.favTeam===t.id?'✓':''}</div></div>`).join('');
  openOv('tp-ov');
}
function pickTeam(id){D.user.favTeam=id;save();updateUser();closeOv('tp-ov');toast('✅ Equipo guardado')}

/* ---- NOTIFICATIONS ---- */
function addNotif(title,sub){
  D.notifications.unshift({id:Date.now().toString(),title,sub,read:false,date:new Date().toISOString()});
  if(D.notifications.length>50)D.notifications=D.notifications.slice(0,50);
  save();updateUser();
  if('Notification' in window&&Notification.permission==='granted')new Notification(title,{body:sub,icon:D.cfg.logo||'/icon.png'});
  if(typeof triggerIslandNotify==='function')triggerIslandNotify(title,sub);
}
function openNotifs(){
  const c=$('notif-list');
  const iconMap={'Nuevo partido':'⚽','Partido en vivo':'🔴','Recordatorio':'🔔','Resultado':'🏆','Cambio de horario':'⏰'};
  if(!D.notifications.length){
    c.innerHTML='<div class="empty"><div class="etic">🔔</div><div class="etit">Sin notificaciones</div><div class="esub">Aquí verás goles, cambios de horario y más</div></div>';
  } else {
    c.innerHTML=D.notifications.slice(0,30).map(n=>{
      const ico=Object.entries(iconMap).find(([k])=>n.title.includes(k))?.[1]||'📣';
      return`<div class="notif-item">
        <div class="notif-ico">${ico}</div>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          <div class="notif-sub">${n.sub}</div>
          <div class="notif-date">${fmtND(n.date)}</div>
        </div>
        ${!n.read?'<div class="notif-unread"></div>':''}
      </div>`;
    }).join('');
  }
  D.notifications.forEach(n=>n.read=true);save();updateUser();openOv('notif-ov');
}
function clearNotifs(){D.notifications=[]; save(); updateUser(); openNotifs(); toast('🗑️ Notificaciones borradas')}

/* ---- Stubs para nuevas funciones del menú ---- */
function openFriends(){toast('👥 Próximamente: Gestión de Amigos')}
function openBetHistory(){toast('📋 Próximamente: Historial de Apuestas')}
function openAccountSettings(){toast('⚙️ Próximamente: Configuración de Cuenta')}

/* ---- REFEREES ---- */
function saveReferee(){
  const name=$('ref-name').value.trim(),cat=$('ref-cat').value;
  if(!name){toast('Completa el nombre');return}
  if(!D.referees)D.referees=[];
  D.referees.push({id:Date.now().toString(),name,category:cat});
  save();renderAdmLists();
  $('ref-name').value='';toast('✅ Árbitro agregado');
}

/* ---- SPONSORS ---- */
function saveSponsor(){
  const name=$('sp-name').value.trim(),type=$('sp-type').value,logo=pending.pendingSponsorLogo||'';
  if(!name){toast('Completa el nombre');return}
  if(!D.sponsors)D.sponsors=[];
  D.sponsors.push({id:Date.now().toString(),name,type,logo});
  save();renderAdmLists();delete pending.pendingSponsorLogo;
  resetFup('sp-logo-btn','sp-logo-txt','Logo del sponsor');
  $('sp-name').value='';toast('✅ Sponsor agregado');
}

/* ---- STATS EXPORT ---- */
function exportStatsCSV(){
  const ts=sortedTeams();
  let csv='Posición,Equipo,PJ,PG,PE,PP,GF,GC,DG,Puntos\n';
  ts.forEach((t,i)=>{csv+=`${i+1},${t.name},${t.pj},${t.pg},${t.pe||0},${t.pp},${t.gf},${t.gc},${t.gf-t.gc},${t.pts+(t.adj||0)}\n`});
  downloadCSV(csv,'tabla_posiciones.csv');
  toast('📊 Tabla exportada');
}
function exportMatchesCSV(){
  let csv='Fecha,Local,Visitante,Resultado,Estado\n';
  D.matches.forEach(m=>{
    const h=team(m.homeTeam),a=team(m.awayTeam);
    if(!h||!a)return;
    csv+=`${fmtND(m.datetime)},${h.name},${a.name},${m.homeScore??'-'} - ${m.awayScore??'-'},${stLabel(m.status)}\n`;
  });
  downloadCSV(csv,'partidos.csv');
  toast('⚽ Partidos exportados');
}
function exportTopScorers(){
  const scorers={};
  D.matches.filter(m=>m.status==='finalizado'&&m.events).forEach(m=>{
    m.events.filter(e=>e.type==='goal').forEach(e=>{
      scorers[e.player]=(scorers[e.player]||0)+1;
    });
  });
  let csv='Jugador,Goles\n';
  Object.entries(scorers).sort((a,b)=>b[1]-a[1]).forEach(([p,g])=>{csv+=`${p},${g}\n`});
  downloadCSV(csv,'goleadores.csv');
  toast('🥇 Goleadores exportados');
}
function downloadCSV(content,filename){
  const blob=new Blob([content],{type:'text/csv;charset=utf-8;'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=filename;
  link.click();
}
function updateAdminCounts(){
  const setC=(id,n)=>{const el=$(id);if(el)el.textContent=n};
  setC('adm-match-count',D.matches.length);
  setC('adm-team-count',D.teams.length);
  setC('adm-news-count',D.news.length);
  setC('adm-player-count',D.players.length);
}

function updateStatsPanel(){
  if(!$('stat-matches'))return;
  const finished=D.matches.filter(m=>m.status==='finalizado');
  let goals=0;
  finished.forEach(m=>{goals+=(m.homeScore||0)+(m.awayScore||0)});
  $('stat-matches').textContent=finished.length;
  $('stat-goals').textContent=goals;
  $('stat-avg').textContent=finished.length?(goals/finished.length).toFixed(1):'0.0';
  $('stat-teams').textContent=D.teams.length;
}

/* ---- SEARCH ---- */
function openSearch(){$('srch-ov').classList.add('open');setTimeout(()=>$('srch-inp')?.focus(),200)}
function closeSearch(){$('srch-ov').classList.remove('open');$('srch-inp').value='';$('srch-res').innerHTML=''}
function doSearch(q){
  const c=$('srch-res');if(!q||q.length<2){c.innerHTML='';return}
  const ql=q.toLowerCase();
  const tRes=D.teams.filter(t=>t.name.toLowerCase().includes(ql));
  const nRes=D.news.filter(n=>n.title.toLowerCase().includes(ql)||n.excerpt?.toLowerCase().includes(ql));
  const pRes=D.players.filter(p=>p.name.toLowerCase().includes(ql));
  const mRes=D.matches.filter(m=>{const h=team(m.homeTeam),a=team(m.awayTeam);return h?.name.toLowerCase().includes(ql)||a?.name.toLowerCase().includes(ql)});
  if(!tRes.length&&!nRes.length&&!pRes.length&&!mRes.length){c.innerHTML='<div class="empty"><div class="etic">🔍</div><div class="etit">Sin resultados</div></div>';return}
  c.innerHTML=`
    ${tRes.length?`<div class="atit" style="padding:14px 14px 6px">Equipos</div>${tRes.map(t=>`<div class="mr" onclick="closeSearch();go('info')"><div class="mrcr">${crEl(t.logo,t.name.substring(0,3))}</div><div class="mrtn">${t.name}</div></div>`).join('')}`:''}
    ${pRes.length?`<div class="atit" style="padding:14px 14px 6px">Jugadores</div>${pRes.map(p=>`<div class="mr"><div style="font-size:20px;width:22px;text-align:center">#${p.number||'?'}</div><div class="mrts"><div class="mrtn">${p.name}</div><div style="font-size:11px;color:var(--t3)">${p.position} · ${team(p.teamId)?.name||'?'}</div></div></div>`).join('')}`:''}
    ${mRes.length?`<div class="atit" style="padding:14px 14px 6px">Partidos</div>${mRes.map(m=>{const h=team(m.homeTeam),a=team(m.awayTeam);if(!h||!a)return'';return`<div class="mr" onclick="closeSearch();openMatch('${m.id}')"><div class="mrts"><div class="mrtn">${h.name} vs ${a.name}</div><div style="font-size:11px;color:var(--t3)">${stLabel(m.status)} · ${fmtND(m.datetime)}</div></div></div>`}).join('')}`:''}
    ${nRes.length?`<div class="atit" style="padding:14px 14px 6px">Noticias</div>${nRes.map(n=>`<div class="mr" onclick="closeSearch();openNews('${n.id}')"><div class="mrts"><div class="mrtn">${n.title}</div><div style="font-size:11px;color:var(--t3)">${n.category||''}</div></div></div>`).join('')}`:''}
  `;
}

/* ---- MODALS ---- */
function openOv(id){
  const el=$(id);if(!el)return;
  if(id==='md-ov'){
    el.style.pointerEvents='all';
    el.style.opacity='1';
    el.style.backdropFilter='blur(8px)';
    el.style.webkitBackdropFilter='blur(8px)';
    const sh=$('md-sheet');
    if(sh){
      sh.style.opacity='0';
      sh.style.transform='translateY(100%) scale(.94)';
      sh.style.borderRadius='30px 30px 0 0';
      // Double rAF for reliable paint before transition
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        sh.style.opacity='1';
        sh.style.transform='translateY(0) scale(1)';
        sh.style.borderRadius='0';
      }));
    }
    document.body.style.overflow='hidden';
    return;
  }
  el.classList.add('open');document.body.style.overflow='hidden';
}
function closeOv(id){
  const el=$(id);if(!el)return;
  if(id==='md-ov'){closeMD();return;}
  el.classList.remove('open');document.body.style.overflow='';
}
function closeMD(){
  const ov=$('md-ov'),sh=$('md-sheet');
  if(sh){sh.style.transform='translateY(100%) scale(.96)';sh.style.borderRadius='28px 28px 0 0';}
  if(ov){
    ov.style.opacity='0';ov.style.pointerEvents='none';
    ov.style.backdropFilter='blur(0px)';ov.style.webkitBackdropFilter='blur(0px)';
  }
  document.body.style.overflow='';
  clearInterval(_cdTimer);
  resetAmbient();
}
function ovClick(e,id){if(id!=='md-ov'&&e.target.id===id)closeOv(id)}
function ovClick(e,id){if(e.target.id===id)closeOv(id)}
function openMenu(){$('smov').classList.add('open')}
function closeMenu(){$('smov').classList.remove('open')}
function closeSMOv(e){if(e.target.id==='smov')closeMenu()}

/* ---- TOAST ---- */
let toastT=null;
const TOAST_ICONS={
  '✅':'<path d="M20 6L9 17l-5-5"/>',
  '✓':'<path d="M20 6L9 17l-5-5"/>',
  '❌':'<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  '⚠':'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  '🗑':'<path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0l-1 14a1 1 0 01-1 1H6a1 1 0 01-1-1L4 6"/>',
  '🔔':'<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',
  '🔕':'<path d="M13.73 21a2 2 0 01-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0118 8"/><path d="M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 00-9.33-5"/><path d="M1 1l22 22"/>',
  '🎨':'<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 100 20 1.5 1.5 0 001-2.6 1.5 1.5 0 011-2.6h1.5a5 5 0 005-5A10 10 0 0012 2z"/>',
  '📤':'<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  '📥':'<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  '🔄':'<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>',
  '💾':'<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  '📋':'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>',
  '⚡':'<path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>',
  '📝':'<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>',
  '👋':'<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  '💡':'<path d="M9 18h6M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5.76.76 1.21 1.5 1.4 2.5"/>',
  '☁':'<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>',
  '👥':'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  '⚙':'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  '📊':'<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3"/>',
  '🥇':'<circle cx="12" cy="15" r="6"/><path d="M12 9v12M8 4l4 5 4-5"/>',
  '⬇':'<path d="M12 5v14M19 12l-7 7-7-7"/>',
  '✏':'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
  '📢':'<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/>',
  '🌈':'<path d="M22 17a10 10 0 00-20 0M6 17a6 6 0 0112 0"/>',
  '✨':'<path d="M12 3l1.9 4.9L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.1z"/><path d="M19 16l.7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8L16.5 18l1.8-.7z"/>',
  '🔲':'<rect x="3" y="3" width="18" height="18" rx="2"/>',
  '🔗':'<path d="M10 13a5 5 0 007.5.5l2-2a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 00-7.5-.5l-2 2a5 5 0 007 7l1.5-1.5"/>',
  '🎛':'<circle cx="6" cy="12" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="16" r="2"/><path d="M6 4v6M6 14v6M12 2v2M12 8v14M18 2v12M18 20v2"/>',
  '🎬':'<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6l3 4M13 6l3 4"/>',
  '🎯':'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  '↩':'<path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 010 8h-1"/>',
  '📣':'<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/>',
  '🚀':'<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.3-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
};
function toast(msg){
  const el=$('toast');
  const m=String(msg).match(/^([\u2190-\u2BFF\u{1F000}-\u{1FFFF}\uFE0F]+)\s*(.*)$/u);
  if(m&&TOAST_ICONS[m[1].replace('\uFE0F','')]){
    const path=TOAST_ICONS[m[1].replace('\uFE0F','')];
    el.innerHTML=`<svg class="toast-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg><span>${m[2]}</span>`;
  }else{
    el.innerHTML=`<span>${msg}</span>`;
  }
  el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2800);
}

/* ---- AMBIENT SCROLL LISTENER ---- */
document.addEventListener('DOMContentLoaded',()=>{
  init();
  initHeaderShrink();
  // Ambient: solo al cargar, no en cada scroll
  setTimeout(updateAmbient, 600);
  loadCustomCode();
});

/* ---- HEADER SCROLL — Solo blur intensifica, NO shrink ---- */
function initHeaderShrink(){
  const scr=document.getElementById('scroll');
  const hdr=document.getElementById('hdr');
  if(!scr||!hdr)return;
  let ticking=false;
  scr.addEventListener('scroll',function(){
    if(!ticking){
      requestAnimationFrame(function(){
        const y=scr.scrollTop;
        hdr.classList.toggle('hdr-scrolled', y>30);
        ticking=false;
      });
      ticking=true;
    }
  },{passive:true});
}


/* ============================================================
   SUPABASE — REST API DIRECTO (sin SDK, ultra liviano)
   ============================================================ */
let _sbReady=false;
let _sbRT=false;

// Lightweight REST wrapper — reemplaza todo el SDK (~200KB ahorrados)
const SB={
  _h(){return{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Prefer':'resolution=merge-duplicates'}},
  async get(table,query=''){
    const r=await fetch(`${SB_URL}/rest/v1/${table}?${query}`,{headers:this._h()});
    if(!r.ok)throw new Error(await r.text());
    return r.json();
  },
  async upsert(table,body){
    const r=await fetch(`${SB_URL}/rest/v1/${table}`,{
      method:'POST',
      headers:{...this._h(),'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(body)
    });
    if(!r.ok)throw new Error(await r.text());
    return r.status;
  },
  async uploadFile(bucket,path,blob){
    const r=await fetch(`${SB_URL}/storage/v1/object/${bucket}/${path}`,{
      method:'POST',
      headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':blob.type||'image/jpeg','x-upsert':'true'},
      body:blob
    });
    if(!r.ok)throw new Error(await r.text());
    return `${SB_URL}/storage/v1/object/public/${bucket}/${path}`;
  }
};

function initSupabase(){
  _sbReady=true;
  console.log('✅ Supabase REST listo (sin SDK)');
}

// Pull silently — todos los usuarios ven los datos del admin
async function syncOnLoad(){
  if(!_sbReady)return;
  try{
    const rows=await SB.get('lsl_data','id=eq.main&select=*');
    const data=rows?.[0];
    if(!data){
      console.log('Supabase: sin datos en la nube — usando local');
      return;
    }
    let changed=false;
    const tryParse=(str,fallback)=>{try{return JSON.parse(str)}catch{return fallback}};
    if(data.teams){D.teams=tryParse(data.teams,D.teams);changed=true}
    if(data.matches){D.matches=tryParse(data.matches,D.matches);changed=true}
    if(data.news){D.news=tryParse(data.news,D.news);changed=true}
    if(data.players){D.players=tryParse(data.players,D.players);changed=true}
    if(data.channels){D.channels=tryParse(data.channels,D.channels);changed=true}
    if(data.sanctions){D.sanctions=tryParse(data.sanctions,D.sanctions);changed=true}
    if(data.cfg){D.cfg={...D.cfg,...tryParse(data.cfg,{})};changed=true}
    // ── Editar UI (redondeo, tamaños, etc.) — antes solo se guardaba local
    if(data.eui_settings){
      const parsedEui=tryParse(data.eui_settings,null);
      if(parsedEui&&JSON.stringify(parsedEui)!==JSON.stringify(D.euiSettings||{})){
        D.euiSettings=parsedEui;changed=true;
        try{Object.assign(_euiSettings,D.euiSettings);euiLoadSettings();euiApply();}
        catch(e){console.warn('No se pudo aplicar Editar UI sincronizado:',e.message)}
      }
    }
    // ── CSS personalizado — antes solo se guardaba local
    if(data.custom_css!==undefined && data.custom_css!==(localStorage.getItem('lsl_custom_css')||'')){
      localStorage.setItem('lsl_custom_css',data.custom_css||'');
      injectCSS(data.custom_css||'','lsl-custom-css');
      updateCSSStatusBar(data.custom_css||'');
      changed=true;
    }
    // ── JS personalizado — antes solo se guardaba local
    if(data.custom_js!==undefined && data.custom_js!==(localStorage.getItem('lsl_custom_js')||'')){
      localStorage.setItem('lsl_custom_js',data.custom_js||'');
      if(data.custom_js&&data.custom_js.trim()){
        try{const fn=new Function(data.custom_js);fn();}
        catch(e){console.warn('Error al ejecutar JS sincronizado:',e.message)}
      }
      changed=true;
    }
    if(changed){
      localStorage.setItem(STORE,JSON.stringify(D));
      renderAll();updateHdr();updateUser();populateSels();
      console.log('✅ Sync OK —',new Date().toLocaleTimeString());
    }
  }catch(e){
    // Sin conexión — OK, se usa localStorage
    console.log('Supabase no disponible, usando datos locales');
  }
}

// Admin: push data to cloud
async function pushToSupabase(){
  if(!_sbReady)return;
  const indicator=document.getElementById('sync-indicator');
  if(indicator){indicator.style.opacity='1';indicator.textContent='☁️'}
  try{
    await SB.upsert('lsl_data',{
      id:'main',
      teams:JSON.stringify(D.teams),
      matches:JSON.stringify(D.matches),
      news:JSON.stringify(D.news),
      players:JSON.stringify(D.players),
      channels:JSON.stringify(D.channels),
      sanctions:JSON.stringify(D.sanctions),
      cfg:JSON.stringify(D.cfg),
      // ── Antes faltaban estos 3 campos: por eso los cambios de "Editar UI"
      // y el editor de código solo se veían en el dispositivo que los guardaba.
      eui_settings:JSON.stringify(D.euiSettings||{}),
      custom_css:localStorage.getItem('lsl_custom_css')||'',
      custom_js:localStorage.getItem('lsl_custom_js')||'',
      updated_at:new Date().toISOString()
    });
    if(indicator){indicator.textContent='✓';setTimeout(()=>{indicator.style.opacity='0'},2000)}
    console.log('☁️ Supabase sync OK',new Date().toLocaleTimeString());
  }catch(e){
    console.warn('Supabase push error:',e.message);
    if(indicator){indicator.textContent='!';indicator.style.color='#f87171';setTimeout(()=>{indicator.style.opacity='0';indicator.style.color=''},3000)}
    toast('⚠️ Sin conexión — guardado local ✓');
  }
}

async function pullFromSupabase(){
  toast('⬇️ Actualizando...');
  await syncOnLoad();
  toast('✅ Datos actualizados');
}

function adminSync(){
  if(_sbReady&&D.user.isAdmin){
    clearTimeout(window._syncTimer);
    window._syncTimer=setTimeout(()=>pushToSupabase(),600);
  }
}

// Upload Blob to Supabase Storage → returns public URL
async function uploadToStorage(blob,folder){
  if(!_sbReady||!blob)return null;
  try{
    const ext=(blob.type||'image/jpeg').split('/')[1]||'jpg';
    const path=`${folder}/${Date.now()}.${ext}`;
    // Intentar con los buckets posibles
    const buckets=['lsl-images','images','media','uploads','storage'];
    let url=null;
    for(const bucket of buckets){
      try{
        url=await SB.uploadFile(bucket,path,blob);
        console.log(`✅ Upload exitoso en bucket: ${bucket}`);
        return url;
      }catch(e){
        console.log(`❌ Bucket ${bucket} no disponible, intentando siguiente...`);
        continue;
      }
    }
    // Si ningún bucket funcionó, retornar null para usar fallback base64
    if(!url)console.warn('Ningún bucket disponible, usando base64 local');
    return null;
  }catch(e){
    console.warn('Storage upload:',e.message);
    return null;
  }
}

function b64toBlob(b64){
  const arr=b64.split(',');
  const mime=arr[0].match(/:(.*?);/)[1];
  const bstr=atob(arr[1]);let n=bstr.length;const u8=new Uint8Array(n);
  while(n--)u8[n]=bstr.charCodeAt(n);
  return new Blob([u8],{type:mime});
}

function getSupabaseConfig(){return{url:SB_URL,key:SB_KEY,enabled:true}}
function updateAdmSupabase(){
  const u=$('sb-url'),k=$('sb-key');
  if(u)u.value=SB_URL;
  if(k)k.value='(auto)';
  const st=$('sb-status');
  if(st){st.textContent='✅ REST API activo (ultra liviano)';st.style.color='#4ade80'}
  const tgl=$('tgl-sb');if(tgl)tgl.classList.add('on');
}
async function saveSupabaseConfig(){toast('✅ Supabase configurado automáticamente')}
async function testSupabaseConn(){
  const st=$('sb-status');if(!st)return;
  st.textContent='⏳ Probando...';st.style.color='var(--t2)';
  try{
    await SB.get('lsl_data','id=eq.main&select=id');
    st.textContent='✅ Conexión perfecta!';st.style.color='#4ade80';
  }catch(e){st.textContent='❌ '+e.message;st.style.color='#f87171'}
}
function toggleSupabaseSync(){toast('✅ Siempre activo')}
function toggleSupabaseRT(){
  _sbRT=!_sbRT;
  const tgl=$('tgl-sb-rt');if(tgl)tgl.classList.toggle('on',_sbRT);
  toast(_sbRT?'⚡ Polling activo':'Polling OFF');
  if(_sbRT)startNotifPolling();
}
function setupSupabaseRealtime(){startNotifPolling()}
function copySupabaseSQL(){
  const sql=`-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS lsl_data (
  id TEXT PRIMARY KEY,
  teams TEXT, matches TEXT, news TEXT, players TEXT,
  channels TEXT, sanctions TEXT, cfg TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 2. Políticas RLS
ALTER TABLE lsl_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sel" ON lsl_data FOR SELECT USING (true);
CREATE POLICY "ins" ON lsl_data FOR INSERT WITH CHECK (true);
CREATE POLICY "upd" ON lsl_data FOR UPDATE USING (true);
-- 3. Bucket Storage: Storage > New Bucket > nombre: lsl-images > Public: SI

-- 4. Notificaciones (polling con app abierta)
CREATE TABLE IF NOT EXISTS lsl_notifications (
  id TEXT PRIMARY KEY,
  title TEXT, body TEXT, icon TEXT, url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lsl_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sel_notif" ON lsl_notifications FOR SELECT USING (true);
CREATE POLICY "ins_notif" ON lsl_notifications FOR INSERT WITH CHECK (true);

-- 5. Suscripciones push (notificaciones con la app cerrada)
-- Esta tabla la usan SOLO las Vercel Functions /api/save-subscription
-- y /api/send-push con la SERVICE ROLE KEY, por eso NO necesita
-- políticas públicas de lectura/escritura.
CREATE TABLE IF NOT EXISTS lsl_push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  endpoint TEXT UNIQUE NOT NULL,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lsl_push_subscriptions ENABLE ROW LEVEL SECURITY;`;
  navigator.clipboard?.writeText(sql).then(()=>toast('📋 SQL copiado')).catch(()=>{});
}
let _notifPollTimer=null;
function startNotifPolling(){
  clearInterval(_notifPollTimer);
  _notifPollTimer=setInterval(async()=>{
    try{
      const last=localStorage.getItem('lsl_last_notif')||'2000-01-01';
      const rows=await SB.get('lsl_notifications',`created_at=gt.${last}&select=*&limit=5`);
      if(rows?.length){
        rows.forEach(n=>addNotif(n.title,n.body));
        localStorage.setItem('lsl_last_notif',rows[0].created_at);
      }
    }catch(e){}
  },30000);
}



/* ============================================================
   AUTO-GUARDADO — CSS / JS / HTML completo
   Guarda automáticamente mientras se escribe (debounce 600ms)
   para que nada se pierda al salir de la app.
   ============================================================ */
let _autoSaveTimers={};
function autoSaveCode(type,value){
  clearTimeout(_autoSaveTimers[type]);
  _autoSaveTimers[type]=setTimeout(()=>{
    if(type==='css'){
      localStorage.setItem('lsl_custom_css',value);
      injectCSS(value,'lsl-custom-css');
      updateCSSStatusBar(value);
      adminSync(); // antes solo guardaba local — nunca llegaba a otros dispositivos
    }else if(type==='js'){
      localStorage.setItem('lsl_custom_js',value);
      adminSync();
    }else if(type==='html'){
      localStorage.setItem('_lsl_custom_full_html',value);
    }
    flashAutoSaveIndicator(type);
  },600);
}
function flashAutoSaveIndicator(type){
  const ind=$(type+'-autosave-ind');
  if(!ind)return;
  ind.style.opacity='1';
  clearTimeout(ind._hideT);
  ind._hideT=setTimeout(()=>{ind.style.opacity='0'},1800);
}
// Guardar inmediatamente al salir/ocultar la app (por si el debounce no llegó a disparar)
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    const cssEd=$('custom-css-editor');if(cssEd)localStorage.setItem('lsl_custom_css',cssEd.value);
    const jsEd=$('custom-js-editor');if(jsEd)localStorage.setItem('lsl_custom_js',jsEd.value);
    const htmlEd=$('full-html-editor');if(htmlEd)localStorage.setItem('_lsl_custom_full_html',htmlEd.value);
  }
});

/* ============================================================
   CODE EDITOR — EDITOR DE CÓDIGO EN VIVO
   ============================================================ */
function loadCustomCode(){
  const css=localStorage.getItem('lsl_custom_css')||'';
  const js=localStorage.getItem('lsl_custom_js')||'';
  const cssEd=$('custom-css-editor');
  const jsEd=$('custom-js-editor');
  if(cssEd)cssEd.value=css;
  if(jsEd)jsEd.value=js;
  // Auto-apply saved CSS on load (id dedicado para no chocar con otros injectCSS)
  injectCSS(css,'lsl-custom-css');
  updateCSSStatusBar(css);
  // Auto-ejecutar JS guardado (persistencia de efectos al recargar)
  if(js&&js.trim()){
    try{
      const fn=new Function(js);
      fn();
      logConsole('✅ JS guardado ejecutado automáticamente');
    }catch(e){
      logConsole('❌ Error al ejecutar JS guardado: '+e.message);
    }
  }
  // Cargar HTML completo guardado en el editor (si existe)
  const fullHtml=localStorage.getItem('_lsl_custom_full_html')||'';
  const fullEd=$('full-html-editor');
  if(fullEd&&fullHtml)fullEd.value=fullHtml;
}

function updateCSSStatusBar(css){
  const dot=$('css-status-dot');
  const txt=$('css-status-txt');
  const btn=$('css-remove-btn');
  if(!dot)return;
  if(css&&css.trim()!==''){
    dot.style.background='#4ade80';
    txt.textContent=`CSS activo · ${css.split('\n').length} líneas`;
    if(btn)btn.style.display='block';
  }else{
    dot.style.background='var(--t3)';
    txt.textContent='Sin CSS guardado';
    if(btn)btn.style.display='none';
  }
}

function applyCustomCode(){
  const css=$('custom-css-editor')?.value||'';
  try{
    injectCSS(css,'lsl-custom-css');
    logConsole('✅ CSS aplicado correctamente');
    toast('🎨 CSS aplicado');
  }catch(e){
    logConsole('❌ Error en CSS: '+e.message);
    toast('❌ Error en CSS');
  }
}

function runCustomJS(){
  const js=$('custom-js-editor')?.value||'';
  if(!js.trim()){toast('⚠️ No hay código JS');return}
  try{
    // Redirect console.log to our console panel
    const origLog=console.log;
    const origErr=console.error;
    console.log=(...a)=>{origLog(...a);logConsole(a.map(String).join(' '))};
    console.error=(...a)=>{origErr(...a);logConsole('❌ '+a.map(String).join(' '))};
    // Execute user code
    const fn=new Function(js);
    fn();
    console.log=origLog;console.error=origErr;
    logConsole('✅ JS ejecutado');
    toast('⚡ JS ejecutado');
  }catch(e){
    logConsole('❌ Error: '+e.message);
    toast('❌ Error en JS: '+e.message);
  }
}

function logConsole(msg){
  const el=$('code-console');
  if(!el)return;
  const time=new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  el.textContent+=`[${time}] ${msg}\n`;
  el.scrollTop=el.scrollHeight;
}

function saveCustomCode(){
  const css=$('custom-css-editor')?.value||'';
  const js=$('custom-js-editor')?.value||'';
  localStorage.setItem('lsl_custom_css',css);
  localStorage.setItem('lsl_custom_js',js);
  applyCustomCode();
  updateCSSStatusBar(css);
  adminSync(); // antes solo guardaba local — nunca llegaba a otros dispositivos
  toast('💾 Código guardado');
  logConsole('💾 Código guardado y sincronizado a la nube');
}

function clearCustomCSS(){
  // "Limpiar" solo borra el textarea, NO toca el CSS aplicado ni localStorage
  // Para remover el CSS aplicado se debe borrar el texto y luego guardar
  const el=$('custom-css-editor');
  if(!el)return;
  if(el.value.trim()===''){
    toast('ℹ️ El editor ya está vacío');
    return;
  }
  if(!confirm('¿Limpiar el editor? El CSS guardado seguirá aplicado hasta que guardes el cambio.')){return;}
  el.value='';
  logConsole('✏️ Editor CSS limpiado. El CSS aplicado sigue activo. Guardá vacío para removerlo.');
  toast('✏️ Editor limpiado (CSS activo intacto)');
}

function removeAppliedCSS(){
  // Remueve el CSS aplicado Y lo borra de localStorage
  const el=$('custom-css-editor');if(el)el.value='';
  injectCSS('','lsl-custom-css');
  localStorage.removeItem('lsl_custom_css');
  adminSync();
  logConsole('🗑️ CSS removido completamente');
  toast('🗑️ CSS removido');
}

function clearCustomJS(){
  const el=$('custom-js-editor');if(el)el.value='';
  localStorage.removeItem('lsl_custom_js');
  adminSync();
  toast('🗑️ JS limpiado');
}

function exportCustomCode(){
  const css=localStorage.getItem('lsl_custom_css')||'';
  const js=localStorage.getItem('lsl_custom_js')||'';
  const content=`/* === LSL Custom CSS ===\n${css}\n*/\n\n/* === LSL Custom JS ===\n${js}\n*/`;
  const blob=new Blob([content],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='lsl-custom-code.txt';
  a.click();
  toast('📤 Código exportado');
}

const SNIPPETS={
  accent:`:root {
  --accent: #ff6b6b;
  --accent2: #ff8e53;
  --amb-color: 255,107,107;
}`,
  font:`@import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&display=swap');
.hn, .sect { font-family: 'Rajdhani', sans-serif; }`,
  roundedCards:`.mc { border-radius: 40px !important; }
.mr { border-radius: 18px !important; margin: 4px 14px !important; }`,
  customBg:`:root {
  --bg: #0a1628;
  --grad: radial-gradient(ellipse at 50% 0%, rgba(56,189,248,.15) 0%, transparent 60%), #0a1628;
}`,
  announce:`/* Banner anuncio — pegar en inicio-top desde HTML tab */`,
  hideSection:`.greet { display: none !important; }
/* Cambiá .greet por: .sec, .chips, etc. */`,
  bigTitle:`.hn { font-size: 42px !important; letter-spacing: 1px; }
.gnm { font-size: 38px !important; }`,
  liveEffect:`.mr.live { box-shadow: 0 0 0 1.5px #ef4444, 0 4px 20px rgba(239,68,68,.2); }
.ldot { animation: pulse 0.8s infinite !important; }`
};

const JS_SNIPPETS={
  announce:`setTimeout(()=>{toast('📢 ¡Bienvenidos a la nueva temporada!');},800);`,
  hideSection:`// Ocultar elemento por clase o id
document.querySelector('.greet').style.display='none';`,
  bigTitle:`document.querySelectorAll('.sect').forEach(el=>{el.style.fontSize='22px';});`,
  liveEffect:`document.querySelectorAll('.mr').forEach(el=>{
  if(el.classList.contains('live'))el.style.boxShadow='0 0 0 2px #ef4444';
});`
};

function insertSnippet(type){
  const activeTab=document.querySelector('.code-tab.on')?.id||'ctab-css';
  const isJS=activeTab==='ctab-js';
  const cssEd=$('custom-css-editor');
  const jsEd=$('custom-js-editor');
  if(isJS||type==='announce'){
    const snip=JS_SNIPPETS[type]||JS_SNIPPETS.announce;
    if(jsEd)jsEd.value=(jsEd.value+'\n\n'+snip).trim();
    if(!isJS)switchCodeTab('js');
    toast('📝 Snippet JS insertado');
  }else{
    const snip=SNIPPETS[type]||'';
    if(cssEd&&snip)cssEd.value=(cssEd.value+'\n\n'+snip).trim();
    toast('📝 Snippet CSS insertado');
  }
}

/* ════════════════════════════════════════════════
   SETTINGS — Funciones completas
   ════════════════════════════════════════════════ */

function openSettings(){
  openOv('cfg-ov');
  // Sincronizar estado de toggles con D.settings
  const s=D.settings||{};
  const setTgl=(id,val)=>{const t=$(id);if(t)t.classList.toggle('on',val!==false)}
  setTgl('tgl-ambient',s.ambient!==false);
  setTgl('tgl-anims', s.anims!==false);
  setTgl('tgl-glass', s.glass!==false);
  // Estado de notificaciones
  const ns=$('cfg-notif-state');
  if(ns){
    if(!('Notification' in window))ns.textContent='🚫 No disponible en esta app';
    else if(Notification.permission==='granted')ns.textContent='✅ Activas';
    else if(Notification.permission==='denied')ns.textContent='🚫 Bloqueadas por el sistema';
    else ns.textContent='Toca para activar';
  }
  // Marcar el acento activo
  document.querySelectorAll('.accent-dot').forEach(d=>{
    const matches=d.style.background===getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    d.classList.toggle('active',matches);
  });
}

function toggleCfg(key){
  if(!D.settings)D.settings={};
  D.settings[key]=!( D.settings[key]!==false );
  const tgl=$('tgl-'+key);
  if(tgl)tgl.classList.toggle('on', D.settings[key]);
  save();
  // Aplicar cambio inmediato
  if(key==='ambient'){
    if(D.settings.ambient!==false)updateAmbient();
    else{resetAmbient();}
    toast(D.settings.ambient!==false?'🌈 Ambient activado':'Ambient desactivado');
  }
  if(key==='anims'){
    const root=document.documentElement;
    if(D.settings.anims===false){
      root.style.setProperty('--spd','0s');
      root.style.setProperty('--slow','0s');
      root.style.setProperty('--spring','linear');
    }else{
      root.style.removeProperty('--spd');
      root.style.removeProperty('--slow');
      root.style.removeProperty('--spring');
    }
    toast(D.settings.anims!==false?'✨ Animaciones ON':'Animaciones OFF');
  }
  if(key==='glass'){
    const hdr=$('hdr'),nav=$('nav');
    const bf=D.settings.glass===false?'none':'blur(20px) saturate(180%)';
    if(hdr)hdr.style.backdropFilter=bf;
    if(nav)nav.style.backdropFilter=bf;
    toast(D.settings.glass!==false?'🔲 Vidrio ON':'Vidrio OFF');
  }
}

function setAccent(hex,rgb){
  const root=document.documentElement;
  root.style.setProperty('--accent',hex);
  // accent2 = versión más clara
  root.style.setProperty('--accent2',hex+'cc');
  root.style.setProperty('--amb-color',rgb);
  root.style.setProperty('--amb-tint-hdr',`rgba(${rgb},.10)`);
  root.style.setProperty('--amb-tint-nav',`rgba(${rgb},.06)`);
  document.querySelectorAll('.accent-dot').forEach(d=>d.classList.remove('active'));
  event.currentTarget.classList.add('active');
  if(!D.settings)D.settings={};
  D.settings.accentHex=hex;D.settings.accentRgb=rgb;
  save();toast('🎨 Color aplicado');
}

function requestNotifPerm(){
  if(!('Notification' in window)){toast('❌ Este browser no soporta notificaciones');return}
  Notification.requestPermission().then(p=>{
    const ns=$('cfg-notif-state');
    if(p==='granted'){
      if(ns)ns.textContent='✅ Activas';toast('🔔 Notificaciones activadas');
      if(window._swReg)subscribeToPush(window._swReg);
      else if('serviceWorker' in navigator)navigator.serviceWorker.ready.then(reg=>{window._swReg=reg;subscribeToPush(reg)});
    }
    else{if(ns)ns.textContent='🚫 Bloqueadas';toast('❌ Notificaciones bloqueadas');}
  });
}

function exportJSON(){
  const blob=new Blob([JSON.stringify(D,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`lsl-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();toast('📤 Backup descargado');
}

function shareApp(){
  const url=window.location.href;
  if(navigator.share){
    navigator.share({title:'La Súper Liga',text:'Seguí todos los partidos en tiempo real 🏟️',url});
  }else{
    navigator.clipboard?.writeText(url).then(()=>toast('🔗 Link copiado'));
  }
}

/* ════════════════════════════════════════════════
   CODE EDITOR — Funciones nuevas
   ════════════════════════════════════════════════ */

function switchCodeTab(tab){
  document.querySelectorAll('.code-tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.code-panel').forEach(p=>p.classList.remove('on'));
  const bt=$('ctab-'+tab), bp=$('cpanel-'+tab);
  if(bt)bt.classList.add('on');
  if(bp)bp.classList.add('on');
  if(tab==='vars')buildVarsEditor();
  logConsole(`📂 Tab: ${tab}`);
}

function buildVarsEditor(){
  const el=$('vars-editor-list');if(!el)return;
  const vars=[
    {key:'--bg',label:'Fondo principal',type:'color'},
    {key:'--bg2',label:'Fondo modales',type:'color'},
    {key:'--accent',label:'Color acento',type:'color'},
    {key:'--text',label:'Texto',type:'color'},
    {key:'--t2',label:'Texto secundario',type:'color'},
    {key:'--bdr2',label:'Bordes',type:'color'},
    {key:'--spd',label:'Velocidad animaciones',type:'text'},
  ];
  const root=getComputedStyle(document.documentElement);
  el.innerHTML=vars.map(v=>{
    const cur=root.getPropertyValue(v.key).trim();
    return v.type==='color'
      ?`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <input type="color" id="var-${v.key.slice(2)}" value="${cur||'#000000'}"
            style="width:36px;height:36px;border:none;border-radius:8px;cursor:pointer;background:none"
            onchange="document.documentElement.style.setProperty('${v.key}',this.value)"/>
          <div><div style="font-size:12px;font-weight:600;color:var(--text)">${v.label}</div>
          <div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--t2)">${v.key}</div></div>
        </div>`
      :`<div style="margin-bottom:10px">
          <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px">${v.label} <span style="color:var(--t3);font-size:10px">${v.key}</span></div>
          <input class="fi" id="var-${v.key.slice(2)}" value="${cur}"
            style="font-family:'DM Mono',monospace;font-size:12px;padding:8px 12px"
            oninput="document.documentElement.style.setProperty('${v.key}',this.value)"/>
        </div>`;
  }).join('');
}

function applyVarsEditor(){
  const vars=['--bg','--bg2','--accent','--text','--t2','--bdr2','--spd'];
  const root=document.documentElement;
  vars.forEach(v=>{
    const el=document.getElementById('var-'+v.slice(2));
    if(el&&el.value)root.style.setProperty(v,el.value);
  });
  // Guardar como CSS custom
  const css=vars.map(v=>{
    const el=document.getElementById('var-'+v.slice(2));
    return el?`  ${v}: ${el.value};`:'';
  }).filter(Boolean).join('\n');
  const cssEd=$('custom-css-editor');
  if(cssEd)cssEd.value=(cssEd.value+'\n\n:root {\n'+css+'\n}').trim();
  injectCSS(`:root{${vars.map(v=>{const el=document.getElementById('var-'+v.slice(2));return el?`${v}:${el.value}`:'';}).filter(Boolean).join(';')}}`,'lsl-vars-css');
  logConsole('✅ Variables aplicadas');
  toast('🎛️ Variables aplicadas');
}

const _injectedHTML={};
function injectHTML(){
  const target=$('html-target')?.value||'inicio-top';
  const html=$('custom-html-editor')?.value||'';
  if(!html.trim()){toast('⚠️ Escribí algo de HTML');return}
  try{
    const targetMap={
      'inicio-top':'pg-inicio','inicio-bottom':'pg-inicio',
      'partidos-top':'pg-partidos','info-top':'pg-info'
    };
    if(target==='custom-widget'){
      let w=document.getElementById('custom-widget');
      if(!w){w=document.createElement('div');w.id='custom-widget';
        w.style.cssText='position:fixed;bottom:112px;right:14px;z-index:500;max-width:200px';
        document.getElementById('app').appendChild(w);}
      w.innerHTML=html;
      _injectedHTML['widget']=html;
      toast('✅ Widget inyectado');
    }else{
      const pg=document.getElementById(targetMap[target]);
      if(!pg){toast('❌ Sección no encontrada');return}
      let wrapper=pg.querySelector('.custom-inject-'+target);
      if(!wrapper){
        wrapper=document.createElement('div');
        wrapper.className='custom-inject-'+target;
        if(target.endsWith('-top'))pg.prepend(wrapper);
        else pg.appendChild(wrapper);
      }
      wrapper.innerHTML=html;
      _injectedHTML[target]=html;
      toast('✅ HTML inyectado en '+target);
    }
    logConsole(`✅ HTML inyectado en: ${target}`);
  }catch(e){logConsole('❌ Error: '+e.message);toast('❌ Error en HTML: '+e.message)}
}

function removeInjectedHTML(){
  const target=$('html-target')?.value||'inicio-top';
  if(target==='custom-widget'){
    const w=document.getElementById('custom-widget');if(w)w.remove();
  }else{
    document.querySelectorAll('.custom-inject-'+target).forEach(el=>el.remove());
  }
  delete _injectedHTML[target];
  toast('🗑️ HTML quitado');
  logConsole('🗑️ HTML removido de: '+target);
}

/* ════════════════════════════════════════════════
   EDITOR HTML COMPLETO — Nuevo sistema
   ════════════════════════════════════════════════ */

function switchHTMLMode(mode){
  document.querySelectorAll('[id^="html-mode-"]').forEach(b=>b.classList.remove('on'));
  document.getElementById('html-mode-'+mode)?.classList.add('on');
  
  document.getElementById('html-inject-panel').style.display=mode==='inject'?'block':'none';
  document.getElementById('html-full-panel').style.display=mode==='full'?'block':'none';
  
  logConsole(`📂 Modo HTML: ${mode==='inject'?'Inyecciones':'Código completo'}`);
}

function loadFullPageHTML(){
  const html=document.documentElement.outerHTML;
  const ed=$('full-html-editor');
  if(ed){
    ed.value=html;
    ed.scrollTop=0;
    toast('📥 HTML cargado en editor');
    logConsole('✅ HTML completo cargado - '+html.length+' caracteres');
  }
}

function applyFullPageHTML(){
  const html=$('full-html-editor')?.value;
  if(!html||html.length<100){
    toast('⚠️ Código HTML inválido o vacío');
    return;
  }
  localStorage.setItem('_lsl_custom_full_html',html);
  toast('✅ HTML guardado. Recargá la página para aplicar cambios.');
  logConsole('💾 HTML guardado en localStorage');
  
  // Mostrar notificación de cambios detectados
  showChangeNotification('🖊️ Cambios guardados','El código será aplicado al recargar');
}

function downloadFullPageHTML(){
  const html=$('full-html-editor')?.value||document.documentElement.outerHTML;
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=`lsl-backup-${new Date().toISOString().slice(0,10)}.html`;
  link.click();
  toast('📤 HTML descargado');
}

/* ════════════════════════════════════════════════
   NOTIFICACIÓN DE CAMBIOS DETECTADOS
   Sistema bonito y fluido para mostrar cambios
   ════════════════════════════════════════════════ */

function showChangeNotification(title,message){
  // Eliminar notificación anterior si existe
  const existing=$('change-notif');
  if(existing)existing.remove();
  
  const notif=document.createElement('div');
  notif.id='change-notif';
  notif.innerHTML=`
    <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:16px;background:rgba(34,211,238,.12);border:1.5px solid rgba(34,211,238,.25);box-shadow:0 8px 32px rgba(34,211,238,.15);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);max-width:320px;animation:slideIn .32s cubic-bezier(.2,.55,.45,1) forwards">
      <div style="font-size:18px;flex-shrink:0;margin-top:2px">${title.split(' ')[0]}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--text);font-size:13px;margin-bottom:2px">${title.split(' ').slice(1).join(' ')}</div>
        <div style="font-size:11px;color:var(--t2);line-height:1.4">${message}</div>
      </div>
    </div>
  `;
  notif.style.cssText='position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:1000;pointer-events:none';
  
  // Agregar keyframe si no existe
  if(!document.getElementById('change-notif-style')){
    const style=document.createElement('style');
    style.id='change-notif-style';
    style.textContent=`
      @keyframes slideIn{
        from{opacity:0;transform:translateX(-50%) translateY(-20px)}
        to{opacity:1;transform:translateX(-50%) translateY(0)}
      }
      @keyframes slideOut{
        from{opacity:1;transform:translateX(-50%) translateY(0)}
        to{opacity:0;transform:translateX(-50%) translateY(-20px)}
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notif);
  
  // Auto-remover después de 4 segundos
  setTimeout(()=>{
    notif.style.animation='slideOut .28s cubic-bezier(.2,.55,.45,1) forwards';
    setTimeout(()=>notif.remove(),280);
  },4000);
}

/* Detectar cambios en localStorage y mostrar notificación */
window.addEventListener('storage',(e)=>{
  if(e.key==='_lsl_custom_full_html'){
    showChangeNotification('🔄 Cambios detectados','Actualización disponible. Recargá la página.');
  }
});

/* Aplicar HTML personalizado al cargar la página */
function applyCustomFullHTML(){
  const custom=localStorage.getItem('_lsl_custom_full_html');
  if(custom&&custom.length>100){
    try{
      // No reemplazamos el documento completo, solo inyectamos cambios
      logConsole('✅ HTML personalizado detectado');
      showChangeNotification('✨ Página personalizada','Se han aplicado cambios guardados');
    }catch(e){
      logConsole('❌ Error aplicando HTML personalizado: '+e.message);
    }
  }
}

// Llamar al cargar
applyCustomFullHTML();

function sendAdminPush(){
  const title=$('push-title')?.value.trim()||D.cfg.name;
  const body=$('push-body')?.value.trim();
  if(!body){toast('⚠️ Escribí un mensaje');return}
  sendPushToAll(title,body);
  $('push-title').value='';$('push-body').value='';
}

/* Actualizar panel de supabase cuando se abre */
function admTab(name,el){
  document.querySelectorAll('.atab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.apane').forEach(p=>p.classList.remove('on'));
  el.classList.add('on');
  $('adm-'+name).classList.add('on');
  if(name==='supabase')updateAdmSupabase();
  if(name==='codeeditor'){loadCustomCode();switchCodeTab('css');}
  if(name==='stats')updateStatsPanel();
  if(name==='appupdate')initUpdatesTab();
  updateAdminCounts();
  if(name==='matches'){populateSels();prefillMatchDate();}
}

/* ════════════════════════════════════════════════
   WELCOME MODAL — Reglas al entrar
   ════════════════════════════════════════════════ */
function checkWelcome(){
  const noShow=localStorage.getItem('lsl_no_welcome');
  if(noShow)return;
  const modal=$('welcome-modal');
  if(!modal)return;
  // Populate with current rules/config
  const title=$('welcome-title');if(title)title.textContent='Bienvenido a '+(D.cfg.name||'La Liga');
  const sub=$('welcome-sub');if(sub)sub.textContent='Antes de comenzar, leé las reglas de la liga.';
  const art=$('welcome-art');
  if(art&&D.cfg.logo){art.innerHTML=`<img src="${D.cfg.logo}" style="width:100%;height:100%;object-fit:cover"/>`}
  // Render rules from cfg
  renderWelcomeRules();
  setTimeout(()=>{modal.classList.add('open')},600);
}
function renderWelcomeRules(){
  const el=$('welcome-rules-content');if(!el)return;
  const rules=D.cfg.rules||'';
  const lines=rules.split('\n').map(l=>l.trim()).filter(l=>l);
  if(!lines.length)return;
  el.innerHTML=lines.slice(0,6).map((line,i)=>{
    const clean=line.replace(/^[\d]+[\.\-\)]\s*/,'');
    return`<div class="welcome-rule"><span class="welcome-rule-n">${i+1}</span><span class="welcome-rule-t">${clean}</span></div>`;
  }).join('');
}
function closeWelcome(){
  const modal=$('welcome-modal');
  if(modal){modal.classList.remove('open');}
}
function closeWelcomeForever(){
  localStorage.setItem('lsl_no_welcome','1');
  closeWelcome();
  toast('✅ No se volverá a mostrar');
}

/* ════════════════════════════════════════════════
   ASISTENCIA DE PARTIDOS
   ════════════════════════════════════════════════ */
let _asistMsgs=JSON.parse(localStorage.getItem('lsl_asist_msgs')||'[]');

function openAsist(){
  const ov=$('asist-ov');if(!ov)return;
  ov.classList.add('open');
  renderAsistMsgs();
  document.body.style.overflow='hidden';
}
function closeAsist(){
  const ov=$('asist-ov');if(!ov)return;
  ov.classList.remove('open');
  document.body.style.overflow='';
}
function renderAsistMsgs(){
  const el=$('asist-msgs');if(!el)return;
  if(!_asistMsgs.length){
    el.innerHTML='<div class="empty" style="padding:20px 0"><div class="etic">💬</div><div class="etit">Sin mensajes</div><div class="esub">Confirmá tu asistencia</div></div>';
    return;
  }
  el.innerHTML=_asistMsgs.map(m=>{
    const isOwn=m.userId===D.user.id;
    return`<div class="chat-msg${isOwn?' own':''}">
      <div class="chat-av">${m.avatar?`<img src="${m.avatar}"/>`:`<span>${(m.username||'?')[0]}</span>`}</div>
      <div class="chat-bubble${isOwn?' own':''}">
        ${!isOwn?`<div class="chat-user">${m.username||'Anónimo'}</div>`:''}
        <div class="chat-text">${m.text}</div>
        <div class="chat-time">${m.time}</div>
      </div>
    </div>`;
  }).join('');
  // Scroll to bottom
  setTimeout(()=>{el.scrollTop=el.scrollHeight},50);
}
function confirmAsistencia(){
  const msg={
    id:Date.now()+'',userId:D.user.id,username:D.user.name||'Jugador',
    avatar:D.user.photo||null,
    text:`✅ ${D.user.name||'Jugador'} se presentó al partido`,
    time:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}),
    type:'asistencia'
  };
  _asistMsgs.push(msg);
  localStorage.setItem('lsl_asist_msgs',JSON.stringify(_asistMsgs));
  renderAsistMsgs();
  // Notif push para todos
  addNotif('Asistencia confirmada',`${D.user.name||'Un jugador'} se presentó al partido`);
  sendPushToAll('Asistencia confirmada',`${D.user.name||'Un jugador'} confirmó su presencia`);
  toast('✅ ¡Asistencia confirmada!');
}
function sendAsistMsg(){
  const inp=$('asist-inp');if(!inp||!inp.value.trim())return;
  const msg={
    id:Date.now()+'',userId:D.user.id,username:D.user.name||'Jugador',
    avatar:D.user.photo||null,text:inp.value.trim(),
    time:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})
  };
  _asistMsgs.push(msg);
  localStorage.setItem('lsl_asist_msgs',JSON.stringify(_asistMsgs));
  inp.value='';
  renderAsistMsgs();
}

/* ════════════════════════════════════════════════
   PUSH NOTIFICATIONS — Envío a todos
   ════════════════════════════════════════════════ */
const VAPID_PUBLIC_KEY='BNa9vWWRXLfy64OlSyp7lO1kW1D_Mzqle2fG80iCOl26r_TaR3MfYeagCa15pCjA7nraFx5g6tn3j7E1dQVnJiA';
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=atob(base64);
  const outputArray=new Uint8Array(rawData.length);
  for(let i=0;i<rawData.length;++i)outputArray[i]=rawData.charCodeAt(i);
  return outputArray;
}
async function subscribeToPush(reg){
  try{
    if(!reg)reg=window._swReg||await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    await fetch('/api/save-subscription',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({subscription:sub})
    }).catch(()=>{});
    return sub;
  }catch(e){console.warn('Push subscribe error:',e);return null}
}
async function requestPushPermission(){
  if(!('Notification' in window))return false;
  if(Notification.permission==='granted'){
    if(window._swReg)subscribeToPush(window._swReg);
    return true;
  }
  const perm=await Notification.requestPermission();
  if(perm==='granted'&&window._swReg)subscribeToPush(window._swReg);
  return perm==='granted';
}

async function sendPushToAll(title,body,url){
  // Notificación local inmediata para el usuario actual
  if(Notification.permission==='granted'){
    try{
      if(window._swReg){
        await window._swReg.showNotification(title,{
          body,icon:D.cfg.logo||'',badge:D.cfg.logo||'',
          data:{url:url||location.href}
        });
      }else{
        new Notification(title,{body,icon:D.cfg.logo||''});
      }
    }catch(e){console.log('Notif local:',e)}
  }
  // Guardar en Supabase para que otros usuarios la reciban via polling (fallback con app abierta)
  if(_sbReady){
    try{
      await SB.upsert('lsl_notifications',{
        id:Date.now()+'',title,body,
        icon:D.cfg.logo||'',
        url:url||location.href,
        created_at:new Date().toISOString()
      });
    }catch(e){console.log('Push store:',e)}
  }
  // Push real a todos los dispositivos suscriptos, aunque la app esté cerrada
  try{
    await fetch('/api/send-push',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({title,body,icon:D.cfg.logo||'/logo.png',url:url||location.href})
    });
  }catch(e){console.log('Push backend:',e)}
}

/* ════════════════════════════════════════════════
   BANNER VIDEO — Subir .mp4 al perfil
   ════════════════════════════════════════════════ */
function triggerBanner(){
  // Mostrar opciones: imagen o video
  const choose=confirm('¿Querés subir un VIDEO (.mp4)? \n\nOK = Video\nCancelar = Imagen');
  if(choose){
    $('banner-video-fi').click();
  }else{
    $('banner-fi').click();
  }
}
function handleBannerVideoUpload(e){
  const f=e.target.files[0];if(!f)return;
  if(f.size>50*1024*1024){toast('⚠️ Video máx 50MB');return}
  const url=URL.createObjectURL(f);
  const vid=$('pban-video');
  const img=$('pban-img');
  const ph=$('pbanph');
  if(vid){vid.src=url;vid.style.display='block'}
  if(img)img.style.display='none';
  if(ph)ph.style.display='none';
  // Guardar referencia
  D.user.bannerVideo=url;
  save();toast('🎬 Video de banner aplicado');
}

/* ════════════════════════════════════════════════
   RENDERIZAR renderRules + info-list
   ════════════════════════════════════════════════ */
function renderRulesAndInfo(){
  // Reglamento
  const el=$('rules-list');
  if(el){
    const txt=D.cfg.rules||'';
    if(!txt.trim()){el.innerHTML='<li style="color:var(--t2);font-size:13px;list-style:none">El reglamento será publicado pronto.</li>';}
    else{
      const lines=txt.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
      el.innerHTML=lines.map((line,i)=>{
        const clean=line.replace(/^[\d]+[\.\-\)]\s*/,'');
        return`<li><span class="rules-num">${i+1}</span><span>${clean}</span></li>`;
      }).join('');
    }
  }
  // Información
  const el2=$('info-list');
  if(el2){
    const txt=D.cfg.info||'';
    if(!txt.trim()){el2.innerHTML='<li style="color:var(--t2);font-size:13px;list-style:none">La información será publicada pronto.</li>';}
    else{
      const lines=txt.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
      el2.innerHTML=lines.map((line,i)=>{
        const clean=line.replace(/^[\d]+[\.\-\)]\s*/,'');
        return`<li><span class="rules-num">${i+1}</span><span>${clean}</span></li>`;
      }).join('');
    }
  }
}
// Compatibilidad con llamadas antiguas
function renderRules(){renderRulesAndInfo()}

/* ════════════════════════════════════════════════
   M11: EVENTOS — renderizado mejorado (timeline)
   ════════════════════════════════════════════════ */
function buildEventsHTML(events,h,a){
  if(!events||!events.length)return`<div class="empty" style="padding:28px 0"><div class="etic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="width:28px;height:28px"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/></svg></div><div class="etit">Sin eventos registrados</div><div class="esub">Los eventos aparecerán en vivo</div></div>`;
  return events.map(ev=>{
    const eico=evIcon(ev.type);const ecolor={'goal':'#22c55e','yellow':'#facc15','red':'#f87171','assist':'#60a5fa','sub':'#a78bfa'}[ev.type]||'#888';
    const isHome=ev.team==='home';
    const isGoal=ev.type==='goal';
    const tn=isHome?h.name:a.name;
    if(isHome){
      return`<div class="evit${isGoal?' ev-goal':''}"><div class="evit-left"><div class="evico" style="color:${ecolor}">${eico}</div><div><div class="evnm">${ev.player}</div><div class="evtm">${tn}</div></div></div><div class="evit-center"><div class="ev-min-pill">${ev.minute}'</div><div class="ev-vert-line"></div></div><div class="evit-right" style="flex:1"></div></div>`;
    }else{
      return`<div class="evit${isGoal?' ev-goal':''}"><div class="evit-left" style="flex:1"></div><div class="evit-center"><div class="ev-vert-line"></div><div class="ev-min-pill">${ev.minute}'</div></div><div class="evit-right"><div style="text-align:right"><div class="evnm">${ev.player}</div><div class="evtm">${tn}</div></div><div class="evico" style="color:${ecolor}">${eico}</div></div></div>`;
    }
  }).join('');
}

/* ════════════════════════════════════════════════
   ADMIN HUB — Navegación con cards
   ════════════════════════════════════════════════ */
function admGo(section){
  // Ocultar hub
  const hub=document.getElementById('adm-hub');
  if(hub)hub.style.display='none';
  // Actualizar título
  const titles={matches:'⚽ Partidos',teams:'🏆 Equipos',players:'👤 Jugadores',referees:'👨‍⚖️ Árbitros',news:'📰 Noticias',channels:'📺 Canales',sanctions:'🟨 Sanciones',sponsors:'💼 Sponsors',season:'🏅 Temporada',stats:'📊 Stats',config:'⚙️ Config',supabase:'☁️ Base de Datos',codeeditor:'💻 Código',appupdate:'🚀 Actualización'};
  const titleEl=document.getElementById('adm-hdr-title');if(titleEl)titleEl.textContent=titles[section]||'Panel Admin';
  // Mostrar botón volver si no existe
  let backBtn=document.getElementById('adm-back-btn');
  if(!backBtn){
    backBtn=document.createElement('button');backBtn.id='adm-back-btn';backBtn.className='adm-back-btn';
    backBtn.innerHTML=`<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.2" stroke-linecap="round"><path d="M19 12H5m7-7-7 7 7 7"/></svg> Panel Admin`;
    backBtn.onclick=admBackToHub;
    const hub2=document.getElementById('adm-hub');if(hub2&&hub2.parentNode)hub2.parentNode.insertBefore(backBtn,hub2);
  }
  backBtn.style.display='flex';
  // Usar el admTab original
  const tab=document.getElementById('atab-'+section);
  admTab(section,tab);
}
function admBackToHub(){
  // Ocultar todos los paneles
  document.querySelectorAll('.apane').forEach(p=>p.classList.remove('on'));
  // Mostrar hub
  const hub=document.getElementById('adm-hub');if(hub)hub.style.display='grid';
  // Ocultar botón volver
  const backBtn=document.getElementById('adm-back-btn');if(backBtn)backBtn.style.display='none';
  // Resetear título
  const titleEl=document.getElementById('adm-hdr-title');if(titleEl)titleEl.textContent='Panel Admin';
}
/* ════════════════════════════════════════════════
   EUI SETTINGS — versión mejorada con editor por elemento
   ════════════════════════════════════════════════ */
let _euiSettings={logoSize:54,logoRadius:16,titleSize:22,hdrBlur:36,hdrPadTop:18,cardRadius:20,cardWidth:278,cardScale:100,cardRotate:0,borderWidth:1,fontSize:13,navBlur:32,navPad:4,navIcoSize:22,hdrShrink:true};
let _euiSelectedEl=null,_euiPicking=false;

function openEditUI(){$('edit-ui-panel').classList.add('open');euiLoadSettings()}
function closeEditUI(){
  $('edit-ui-panel').classList.remove('open');
  if(_euiPicking)euiStopPick();
  if(_euiSelectedEl){_euiSelectedEl.classList.remove('eui-selected');_euiSelectedEl=null;}
}

function euiSwitchTab(id,el){
  document.querySelectorAll('.eui-tab').forEach(t=>t.classList.remove('on'));
  document.querySelectorAll('.eui-subpanel').forEach(p=>p.classList.remove('on'));
  if(el)el.classList.add('on');
  const panel=$('eui-sub-'+id);if(panel)panel.classList.add('on');
}

function euiLoadSettings(){
  const s=D.euiSettings||_euiSettings;Object.assign(_euiSettings,s);
  const set=(id,val,suf)=>{const el=$(id);if(el){el.value=val;const v=$(id+'-val');if(v)v.textContent=val+(suf||'px');}};
  set('eui-font-size',_euiSettings.fontSize);
  set('eui-logo-size',_euiSettings.logoSize);
  set('eui-logo-radius',_euiSettings.logoRadius||16);
  set('eui-title-size',_euiSettings.titleSize);
  set('eui-hdr-blur',_euiSettings.hdrBlur);
  set('eui-hdr-pad-top',_euiSettings.hdrPadTop||18);
  set('eui-card-radius',_euiSettings.cardRadius);
  set('eui-card-width',_euiSettings.cardWidth||278);
  set('eui-card-scale',_euiSettings.cardScale||100,'%');
  set('eui-card-rotate',_euiSettings.cardRotate||0,'°');
  set('eui-border-width',_euiSettings.borderWidth);
  set('eui-nav-blur',_euiSettings.navBlur);
  set('eui-nav-pad',_euiSettings.navPad||4);
  set('eui-nav-ico-size',_euiSettings.navIcoSize||22);
}

function euiApply(){
  const r=(id)=>{const el=$(id);return el?parseFloat(el.value):null};
  const lbl=(id,val,suf)=>{const el=$(id+'-val');if(el)el.textContent=val+(suf||'px');};
  const logoSz=r('eui-logo-size'),logoRad=r('eui-logo-radius')||16,titleSz=r('eui-title-size'),hdrBlur=r('eui-hdr-blur'),hdrPad=r('eui-hdr-pad-top')||18;
  const cardR=r('eui-card-radius'),cardW=r('eui-card-width')||278,cardSc=r('eui-card-scale')||100,cardRot=r('eui-card-rotate')||0;
  const bw=r('eui-border-width'),fs=r('eui-font-size'),navBlur=r('eui-nav-blur'),navPad=r('eui-nav-pad')||4,navIco=r('eui-nav-ico-size')||22;
  if(logoSz!==null)lbl('eui-logo-size',logoSz);if(logoRad!==null)lbl('eui-logo-radius',logoRad);
  if(titleSz!==null)lbl('eui-title-size',titleSz);if(hdrBlur!==null)lbl('eui-hdr-blur',hdrBlur);if(hdrPad!==null)lbl('eui-hdr-pad-top',hdrPad);
  if(cardR!==null)lbl('eui-card-radius',cardR);if(cardW!==null)lbl('eui-card-width',cardW);
  if(cardSc!==null)lbl('eui-card-scale',cardSc,'%');if(cardRot!==null)lbl('eui-card-rotate',cardRot,'°');
  if(bw!==null)lbl('eui-border-width',bw);if(fs!==null)lbl('eui-font-size',fs);
  if(navBlur!==null)lbl('eui-nav-blur',navBlur);if(navPad!==null)lbl('eui-nav-pad',navPad);if(navIco!==null)lbl('eui-nav-ico-size',navIco);
  const root=document.documentElement;
  if(logoSz!==null)root.style.setProperty('--hdr-logo-sz',logoSz+'px');
  if(logoRad!==null)root.style.setProperty('--hdr-logo-r',logoRad+'px');
  if(titleSz!==null)root.style.setProperty('--hdr-title',titleSz+'px');
  if(hdrBlur!==null)root.style.setProperty('--hdr-blur',hdrBlur+'px');
  if(hdrPad!==null)root.style.setProperty('--hdr-pad-top',`calc(${hdrPad}px + env(safe-area-inset-top,0px))`);
  const nav=$('nav');
  // El blur del nav ahora se resuelve con fondo sólido en el CSS (optimización de rendimiento),
  // así que el slider ya no aplica backdrop-filter por JS — solo controla el padding.
  if(nav&&navPad!==null){nav.style.padding=`${navPad}px 7px calc(${navPad}px + env(safe-area-inset-bottom,0px))`;}
  if(navIco!==null)injectCSS(`.niico svg{width:${navIco}px!important;height:${navIco}px!important}`,'eui-nav-ico');
  if(cardR!==null||cardW!==null||cardSc!==null||cardRot!==null||bw!==null||fs!==null){
    const tr=`scale(${(cardSc||100)/100}) rotate(${cardRot||0}deg)`;
    injectCSS(`.mc{border-radius:${cardR}px!important;width:${cardW}px!important;transform:${tr}!important;border-width:${bw}px!important}.mr{border-radius:${Math.min(cardR,14)}px!important}.aform{border-radius:${cardR}px!important}.ibox{border-radius:${cardR}px!important}body{font-size:${fs}px!important}`,'eui-main');
  }
}

function euiApplyHdrColor(hex){const h=$('hdr');if(h)h.style.background=`${hex}cc`;}
function euiApplyCardColor(hex){injectCSS(`.mc{background:${hex}!important}`,'eui-card-color');}

/* ── Element picker ── */
function euiStartPick(){
  _euiPicking=true;
  document.body.classList.add('eui-picking');
  const btn=$('eui-pick-btn');if(btn){btn.textContent='🔴 Tocando... (toca un elemento)';btn.style.background='rgba(248,113,113,.15)';}
  document.addEventListener('click',euiPickClick,{capture:true,once:true});
}
function euiStopPick(){
  _euiPicking=false;document.body.classList.remove('eui-picking');
  const btn=$('eui-pick-btn');if(btn){btn.textContent='🎯 Tocar elemento';btn.style.background='';}
  document.removeEventListener('click',euiPickClick,{capture:true});
}
function euiPickClick(e){
  e.preventDefault();e.stopPropagation();
  euiStopPick();
  if(e.target.closest('#edit-ui-panel'))return;
  if(_euiSelectedEl)_euiSelectedEl.classList.remove('eui-selected');
  _euiSelectedEl=e.target;
  _euiSelectedEl.classList.add('eui-selected');
  const info=$('eui-sel-info');
  if(info){
    const tag=e.target.tagName.toLowerCase();
    const cls=e.target.className.toString().split(' ').filter(c=>c&&!c.startsWith('eui')).slice(0,2).join('.');
    info.textContent=`<${tag}${cls?'.'+cls:''}> — "${e.target.textContent.trim().slice(0,35)||'(sin texto)'}"`;
    info.style.color='var(--accent2)';
  }
  const ctrl=$('eui-el-controls');if(ctrl)ctrl.style.display='block';
  const cs=getComputedStyle(_euiSelectedEl);
  const fs=parseFloat(cs.fontSize)||13;
  const fsEl=$('eui-el-fontsize');if(fsEl){fsEl.value=fs;const v=$('eui-el-fontsize-val');if(v)v.textContent=fs+'px';}
  ['eui-el-scale','eui-el-rotate','eui-el-x','eui-el-y'].forEach(id=>{const i=$(id);if(i)i.value=id.includes('scale')?100:0;});
  const labs={scale:'100%',rotate:'0°',x:'0px',y:'0px',opacity:'100%',radius:'0px'};
  Object.entries(labs).forEach(([k,v])=>{const el=$('eui-el-'+k+'-val');if(el)el.textContent=v;});
}
function euiApplyEl(){
  if(!_euiSelectedEl)return;
  const scale=parseFloat($('eui-el-scale')?.value||100)/100;
  const rotate=parseFloat($('eui-el-rotate')?.value||0);
  const tx=parseFloat($('eui-el-x')?.value||0);
  const ty=parseFloat($('eui-el-y')?.value||0);
  const op=parseFloat($('eui-el-opacity')?.value||100)/100;
  const fs=parseFloat($('eui-el-fontsize')?.value||13);
  const rad=parseFloat($('eui-el-radius')?.value||0);
  const color=$('eui-el-color')?.value;
  const bg=$('eui-el-bg')?.value;
  _euiSelectedEl.style.transform=`translate(${tx}px,${ty}px) scale(${scale}) rotate(${rotate}deg)`;
  _euiSelectedEl.style.opacity=op;
  _euiSelectedEl.style.fontSize=fs+'px';
  if(rad>0)_euiSelectedEl.style.borderRadius=rad+'px';
  if(color)_euiSelectedEl.style.color=color;
  if(bg&&bg!=='#141828')_euiSelectedEl.style.background=bg;
  $('eui-el-scale-val')&&($('eui-el-scale-val').textContent=Math.round(scale*100)+'%');
  $('eui-el-rotate-val')&&($('eui-el-rotate-val').textContent=rotate+'°');
  $('eui-el-x-val')&&($('eui-el-x-val').textContent=tx+'px');
  $('eui-el-y-val')&&($('eui-el-y-val').textContent=ty+'px');
  $('eui-el-opacity-val')&&($('eui-el-opacity-val').textContent=Math.round(op*100)+'%');
  $('eui-el-radius-val')&&($('eui-el-radius-val').textContent=rad+'px');
  $('eui-el-fontsize-val')&&($('eui-el-fontsize-val').textContent=fs+'px');
}
function euiToggleHide(){
  if(!_euiSelectedEl)return;
  const tgl=$('eui-el-hide-tgl');if(!tgl)return;
  tgl.classList.toggle('on');
  _euiSelectedEl.style.display=tgl.classList.contains('on')?'none':'';
}
function euiClearSelected(){
  if(_euiSelectedEl){_euiSelectedEl.classList.remove('eui-selected');_euiSelectedEl=null;}
  const ctrl=$('eui-el-controls');if(ctrl)ctrl.style.display='none';
  const info=$('eui-sel-info');if(info){info.textContent='Sin elemento seleccionado — tocá un elemento en la página';info.style.color='var(--t3)';}
  if(_euiPicking)euiStopPick();
}

function injectCSS(css,id){
  id=id||'eui-inject';let s=document.getElementById(id);
  if(!s){s=document.createElement('style');s.id=id;document.head.appendChild(s);}
  s.textContent=css;
}

function euiToggle(key,tglEl){tglEl.classList.toggle('on');_euiSettings[key]=tglEl.classList.contains('on');}
function euiSave(){
  const r=(id,def)=>parseFloat($(id)?.value||def);
  _euiSettings.logoSize=r('eui-logo-size',54);_euiSettings.logoRadius=r('eui-logo-radius',16);
  _euiSettings.titleSize=r('eui-title-size',22);_euiSettings.hdrBlur=r('eui-hdr-blur',36);_euiSettings.hdrPadTop=r('eui-hdr-pad-top',18);
  _euiSettings.cardRadius=r('eui-card-radius',20);_euiSettings.cardWidth=r('eui-card-width',278);
  _euiSettings.cardScale=r('eui-card-scale',100);_euiSettings.cardRotate=r('eui-card-rotate',0);
  _euiSettings.borderWidth=r('eui-border-width',1);_euiSettings.fontSize=r('eui-font-size',13);
  _euiSettings.navBlur=r('eui-nav-blur',32);_euiSettings.navPad=r('eui-nav-pad',4);_euiSettings.navIcoSize=r('eui-nav-ico-size',22);
  D.euiSettings=Object.assign({},_euiSettings);save();euiApply();closeEditUI();toast('✅ UI guardada');
}
function euiReset(){
  _euiSettings={logoSize:54,logoRadius:16,titleSize:22,hdrBlur:36,hdrPadTop:18,cardRadius:20,cardWidth:278,cardScale:100,cardRotate:0,borderWidth:1,fontSize:13,navBlur:32,navPad:4,navIcoSize:22,hdrShrink:true};
  D.euiSettings=null;save();euiLoadSettings();euiApply();
  ['eui-main','eui-card-color','eui-nav-ico'].forEach(id=>{const s=document.getElementById(id);if(s)s.remove();});
  const hdr=$('hdr');if(hdr)hdr.style.background='';
  toast('🔄 UI reseteada');
}
function loadEuiSettings(){if(!D.euiSettings)return;Object.assign(_euiSettings,D.euiSettings);euiLoadSettings();euiApply();}

/* ════════════════════════════════════════════════
   LAYOUT EDITOR — Mover, redimensionar, eliminar
   ════════════════════════════════════════════════ */
let _leActive=false;
let _leSelected=null;
let _leDragStart=null;
let _leHistory=[];
let _leOverlay=null;

function euiEnterLayoutMode(){
  closeEditUI();
  const ov=$('layout-editor-ov');
  if(!ov)return;
  ov.style.display='block';
  _leActive=true;
  // Añadir capa transparente de captura sobre toda la app
  _leOverlay=document.createElement('div');
  _leOverlay.id='le-capture-layer';
  Object.assign(_leOverlay.style,{
    position:'fixed',inset:'0',zIndex:'8999',
    cursor:'crosshair',background:'transparent',
    pointerEvents:'all',
  });
  _leOverlay.addEventListener('click',lePickElement);
  document.body.appendChild(_leOverlay);
  toast('🎯 Tocá cualquier elemento para editarlo');
}

function euiExitLayoutMode(){
  _leActive=false;
  const ov=$('layout-editor-ov');if(ov)ov.style.display='none';
  const el=document.getElementById('le-capture-layer');if(el)el.remove();
  _leOverlay=null;
  leDeselectAll();
  toast('✅ Editor de layout cerrado');
}

function lePickElement(e){
  e.preventDefault();e.stopPropagation();
  // Ocultar capa temporalmente para encontrar el elemento debajo
  if(_leOverlay)_leOverlay.style.pointerEvents='none';
  const target=document.elementFromPoint(e.clientX,e.clientY);
  if(_leOverlay)_leOverlay.style.pointerEvents='all';
  if(!target||target===document.body||target.closest('#layout-editor-ov')||target.closest('#le-capture-layer'))return;
  leSelectElement(target);
}

function leSelectElement(el){
  leDeselectAll();
  _leSelected=el;
  // Resaltar selección
  const oldOutline=el.style.outline;
  const oldCursor=el.style.cursor;
  el.style.outline='2px solid rgba(99,102,241,.9)';
  el.style.outlineOffset='2px';
  el.style.cursor='grab';
  el._leOldOutline=oldOutline;
  el._leOldCursor=oldCursor;
  // Mostrar nombre del elemento
  const nameEl=$('le-el-name');
  if(nameEl)nameEl.textContent=(el.id?'#'+el.id:el.className?'.'+el.className.trim().split(' ')[0]:el.tagName.toLowerCase());
  // Mostrar panel de propiedades
  const propsEl=$('le-el-props');if(propsEl)propsEl.style.display='block';
  const rect=el.getBoundingClientRect();
  const px=$('le-prop-x'),py=$('le-prop-y'),pw=$('le-prop-w'),ph=$('le-prop-h');
  if(px)px.value=Math.round(rect.left);
  if(py)py.value=Math.round(rect.top);
  if(pw)pw.value=Math.round(rect.width);
  if(ph)ph.value=Math.round(rect.height);
  // Hacer arrastrable
  leMakeDraggable(el);
}

function leDeselectAll(){
  if(_leSelected){
    _leSelected.style.outline=_leSelected._leOldOutline||'';
    _leSelected.style.outlineOffset='';
    _leSelected.style.cursor=_leSelected._leOldCursor||'';
    _leSelected.classList.remove('le-dragging');
    _leSelected=null;
  }
  const propsEl=$('le-el-props');if(propsEl)propsEl.style.display='none';
}

function leMakeDraggable(el){
  el.addEventListener('mousedown',leDragStart,{passive:false});
  el.addEventListener('touchstart',leDragStart,{passive:false});
}

function leDragStart(e){
  if(!_leActive||!_leSelected)return;
  // Evitar arrastrar si el toque empezó sobre un input/botón de las propiedades
  if(e.target.closest('#le-el-props')||e.target.closest('#le-floating-bar'))return;
  e.preventDefault();e.stopPropagation();
  const touch=e.touches?e.touches[0]:e;
  const rect=_leSelected.getBoundingClientRect();
  // Pasar a position:fixed con coordenadas absolutas de viewport (consistente con leApplyProps)
  if(_leSelected.style.position!=='fixed'){
    _leSelected.style.position='fixed';
    _leSelected.style.left=rect.left+'px';
    _leSelected.style.top=rect.top+'px';
    _leSelected.style.margin='0';
  }
  _leDragStart={
    mouseX:touch.clientX,mouseY:touch.clientY,
    origLeft:parseFloat(_leSelected.style.left)||rect.left,
    origTop:parseFloat(_leSelected.style.top)||rect.top,
  };
  _leSelected.classList.add('le-dragging');
  document.addEventListener('mousemove',leDragMove,{passive:false});
  document.addEventListener('touchmove',leDragMove,{passive:false});
  document.addEventListener('mouseup',leDragEnd);
  document.addEventListener('touchend',leDragEnd);
}

function leDragMove(e){
  if(!_leDragStart||!_leSelected)return;
  e.preventDefault();
  const touch=e.touches?e.touches[0]:e;
  const dx=touch.clientX-_leDragStart.mouseX;
  const dy=touch.clientY-_leDragStart.mouseY;
  const newLeft=_leDragStart.origLeft+dx;
  const newTop=_leDragStart.origTop+dy;
  _leSelected.style.left=newLeft+'px';
  _leSelected.style.top=newTop+'px';
  // Sincronizar inputs de propiedades en vivo
  const px=$('le-prop-x'),py=$('le-prop-y');
  if(px)px.value=Math.round(newLeft);
  if(py)py.value=Math.round(newTop);
}

function leDragEnd(){
  if(_leSelected)_leSelected.classList.remove('le-dragging');
  _leDragStart=null;
  document.removeEventListener('mousemove',leDragMove);
  document.removeEventListener('touchmove',leDragMove);
  document.removeEventListener('mouseup',leDragEnd);
  document.removeEventListener('touchend',leDragEnd);
}

function leApplyProps(){
  if(!_leSelected)return;
  const x=parseFloat($('le-prop-x')?.value)||0;
  const y=parseFloat($('le-prop-y')?.value)||0;
  const w=parseFloat($('le-prop-w')?.value)||0;
  const h=parseFloat($('le-prop-h')?.value)||0;
  if(_leSelected.style.position!=='fixed'){_leSelected.style.position='fixed';_leSelected.style.margin='0'}
  _leSelected.style.left=x+'px';
  _leSelected.style.top=y+'px';
  if(w>0)_leSelected.style.width=w+'px';
  if(h>0)_leSelected.style.height=h+'px';
}

function leDeleteEl(){
  if(!_leSelected)return;
  if(!confirm('¿Eliminar este elemento? (se puede resetear con Editar UI → Resetear)'))return;
  _leHistory.push({type:'delete',el:_leSelected,parent:_leSelected.parentNode,next:_leSelected.nextSibling});
  _leSelected.remove();
  _leSelected=null;
  const propsEl=$('le-el-props');if(propsEl)propsEl.style.display='none';
  toast('🗑 Elemento eliminado');
}

function leDuplicateEl(){
  if(!_leSelected)return;
  const clone=_leSelected.cloneNode(true);
  clone.style.opacity='0.85';
  clone.style.outline='none';
  _leSelected.parentNode.insertBefore(clone,_leSelected.nextSibling);
  leSelectElement(clone);
  toast('⧉ Elemento duplicado');
}

function euiLayoutUndo(){
  const last=_leHistory.pop();
  if(!last){toast('Nada que deshacer');return}
  if(last.type==='delete'){
    last.parent.insertBefore(last.el,last.next);
    toast('↩ Elemento restaurado');
  }
}

function euiLayoutSave(){
  // Guardar las transformaciones aplicadas en D.euiSettings.layoutMods
  if(!D.euiSettings)D.euiSettings={};
  toast('✅ Layout guardado');
  euiExitLayoutMode();
}
const COLOR_THEMES={
  default:{bg:'#080c14',bg2:'#0e1220',bg3:'#141828',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(99,102,241,.14) 0%,transparent 70%),#080c14',accent:'#818cf8',accentRgb:'129,140,248',dark:true},
  purple:{bg:'#0d0118',bg2:'#180328',bg3:'#200535',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(139,92,246,.20) 0%,transparent 70%),#0d0118',accent:'#a78bfa',accentRgb:'167,139,250',dark:true},
  teal:{bg:'#001212',bg2:'#001e1e',bg3:'#002828',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(20,184,166,.18) 0%,transparent 70%),#001212',accent:'#2dd4bf',accentRgb:'45,212,191',dark:true},
  blue:{bg:'#020c20',bg2:'#061428',bg3:'#0a1c36',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(59,130,246,.20) 0%,transparent 70%),#020c20',accent:'#60a5fa',accentRgb:'96,165,250',dark:true},
  darkblue:{bg:'#06090f',bg2:'#0d1322',bg3:'#141c30',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(30,58,138,.22) 0%,transparent 70%),#06090f',accent:'#818cf8',accentRgb:'129,140,248',dark:true},
  charcoal:{bg:'#111111',bg2:'#1a1a1a',bg3:'#222222',grad:'linear-gradient(#111111,#1a1a1a)',accent:'#e2e8f0',accentRgb:'226,232,240',dark:true},
  green:{bg:'#010f05',bg2:'#011a0a',bg3:'#022210',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(22,163,74,.18) 0%,transparent 70%),#010f05',accent:'#4ade80',accentRgb:'74,222,128',dark:true},
  brown:{bg:'#120800',bg2:'#1e0f00',bg3:'#291500',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(180,83,9,.18) 0%,transparent 70%),#120800',accent:'#fb923c',accentRgb:'251,146,60',dark:true},
  lilac:{bg:'#100a22',bg2:'#1a1230',bg3:'#22183e',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(192,132,252,.18) 0%,transparent 70%),#100a22',accent:'#e879f9',accentRgb:'232,121,249',dark:true},
  // Modo claro
  light:{bg:'#f0f2f8',bg2:'#e4e8f4',bg3:'#d8ddf0',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(99,102,241,.08) 0%,transparent 70%),#f0f2f8',accent:'#4f46e5',accentRgb:'79,70,229',dark:false},
  lightblue:{bg:'#eef2ff',bg2:'#e0e7ff',bg3:'#c7d2fe',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(99,102,241,.10) 0%,transparent 70%),#eef2ff',accent:'#4338ca',accentRgb:'67,56,202',dark:false},
  lightgreen:{bg:'#f0fdf4',bg2:'#dcfce7',bg3:'#bbf7d0',grad:'radial-gradient(ellipse 80% 40% at 50% -10%,rgba(22,163,74,.08) 0%,transparent 70%),#f0fdf4',accent:'#16a34a',accentRgb:'22,163,74',dark:false},
};

/* ── Bases genéricas para combinar Modo (oscuro/claro) con cualquier color de acento ── */
function darkBaseFor(accentRgb){
  return{bg:'#080c14',bg2:'#0e1220',bg3:'#141828',grad:`radial-gradient(ellipse 80% 40% at 50% -10%,rgba(${accentRgb},.14) 0%,transparent 70%),#080c14`};
}
function lightBaseFor(accentRgb){
  return{bg:'#f0f2f8',bg2:'#e4e8f4',bg3:'#d8ddf0',grad:`radial-gradient(ellipse 80% 40% at 50% -10%,rgba(${accentRgb},.08) 0%,transparent 70%),#f0f2f8`};
}
function applyColorTheme(name,el){
  const t=COLOR_THEMES[name];if(!t)return;
  const root=document.documentElement;
  if(!D.settings)D.settings={};
  // Modo (oscuro/claro): preferencia guardada, o el modo nativo del tema si nunca se eligió
  const mode=D.settings.themeMode||(t.dark!==false?'dark':'light');
  const isDark=mode==='dark';
  root.setAttribute('data-theme',isDark?'dark':'light');
  // Si el tema elegido es nativo de este modo, usar su paleta de fondo. Si no, generar una.
  const native=(t.dark!==false)===isDark;
  const base=native?{bg:t.bg,bg2:t.bg2,bg3:t.bg3,grad:t.grad}:(isDark?darkBaseFor(t.accentRgb):lightBaseFor(t.accentRgb));
  // BG vars
  root.style.setProperty('--bg',base.bg);
  root.style.setProperty('--bg2',base.bg2);
  root.style.setProperty('--bg3',base.bg3);
  // Surface y border — siempre explícito para evitar herencia residual
  if(isDark){
    root.style.setProperty('--surf',`rgba(${parseInt(base.bg2.slice(1,3),16)},${parseInt(base.bg2.slice(3,5),16)},${parseInt(base.bg2.slice(5,7),16)},.92)`);
    root.style.setProperty('--surf2',base.bg2);
    root.style.setProperty('--surf3',base.bg3);
    root.style.setProperty('--text','#eef0ff');
    root.style.setProperty('--t2','#7880a0');
    root.style.setProperty('--t3','#3a4060');
    root.style.setProperty('--bdr','rgba(255,255,255,.07)');
    root.style.setProperty('--bdr2',`rgba(${t.accentRgb},.20)`);
    root.style.setProperty('--over','rgba(4,6,14,.92)');
  }else{
    root.style.setProperty('--surf','rgba(255,255,255,.92)');
    root.style.setProperty('--surf2','#ffffff');
    root.style.setProperty('--surf3','#eef0fa');
    root.style.setProperty('--text','#12163a');
    root.style.setProperty('--t2','#4a5080');
    root.style.setProperty('--t3','#8890b8');
    root.style.setProperty('--bdr','rgba(0,0,30,.08)');
    root.style.setProperty('--bdr2',`rgba(${t.accentRgb},.22)`);
    root.style.setProperty('--over','rgba(220,225,245,.85)');
  }
  // Accent + ambient
  root.style.setProperty('--accent',t.accent);
  root.style.setProperty('--accent2',t.accent);
  root.style.setProperty('--amb-color',t.accentRgb);
  root.style.setProperty('--amb-tint-hdr',`rgba(${t.accentRgb},.10)`);
  root.style.setProperty('--amb-tint-nav',`rgba(${t.accentRgb},.06)`);
  // Body background
  document.body.style.background=base.bg;
  document.body.style.backgroundImage=base.grad;
  // theme-color meta
  const tm=document.getElementById('theme-color-meta');
  if(tm)tm.content=isDark?base.bg:'#f0f2f8';
  // Active marker
  document.querySelectorAll('.theme-item').forEach(i=>i.classList.remove('active'));
  if(el)el.classList.add('active');
  // Guardar
  D.settings.colorTheme=name;
  D.settings.accentHex=t.accent;
  D.settings.accentRgb=t.accentRgb;
  D.settings.themeDark=isDark;
  D.settings.themeMode=mode;
  D._activeThemeName=name;
  save();toast('🎨 Tema aplicado');
}
/* ── Modo Oscuro/Claro — toggle maestro, independiente del color de acento ── */
function setThemeMode(mode){
  if(!D.settings)D.settings={};
  if(D.settings.themeMode===mode)return;
  D.settings.themeMode=mode;
  const name=D._activeThemeName||D.settings.colorTheme||'default';
  applyColorTheme(name,document.getElementById('theme-'+name));
  updateThemeModeUI();
}
function updateThemeModeUI(){
  const mode=D.settings?.themeMode||(COLOR_THEMES[D.settings?.colorTheme||'default']?.dark!==false?'dark':'light');
  const dB=$('mode-dark-btn'),lB=$('mode-light-btn');
  if(dB)dB.classList.toggle('active',mode==='dark');
  if(lB)lB.classList.toggle('active',mode==='light');
}
function loadColorTheme(){
  const name=D.settings?.colorTheme||'default';
  applyColorTheme(name,document.getElementById('theme-'+name));
  updateThemeModeUI();
}

/* ════════════════════════════════════════════════
   CODE SEARCH
   ════════════════════════════════════════════════ */
let _codeSearchMatches=[];let _codeSearchIdx=0;
function codeSearch(q){const ed=$('full-html-editor'),cnt=$('code-search-count');if(!q||q.length<2){if(cnt)cnt.textContent='';return}const text=ed?ed.value:'';const regex=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');const matches=[...text.matchAll(regex)];_codeSearchMatches=matches;_codeSearchIdx=0;if(cnt)cnt.textContent=matches.length>0?`1/${matches.length}`:'0';if(matches.length>0)codeScrollToMatch(0);}
function codeSearchNav(dir){if(!_codeSearchMatches.length)return;_codeSearchIdx=(_codeSearchIdx+dir+_codeSearchMatches.length)%_codeSearchMatches.length;codeScrollToMatch(_codeSearchIdx);const cnt=$('code-search-count');if(cnt)cnt.textContent=`${_codeSearchIdx+1}/${_codeSearchMatches.length}`;}
function codeScrollToMatch(idx){const ed=$('full-html-editor');if(!ed||!_codeSearchMatches[idx])return;const m=_codeSearchMatches[idx];ed.focus();ed.setSelectionRange(m.index,m.index+m[0].length);const lines=ed.value.substring(0,m.index).split('\n').length;const lineH=parseInt(getComputedStyle(ed).lineHeight)||18;ed.scrollTop=Math.max(0,(lines-3)*lineH);}
function clearCodeSearch(){const inp=$('code-search-input');if(inp)inp.value='';_codeSearchMatches=[];const cnt=$('code-search-count');if(cnt)cnt.textContent='';}

/* ════════════════════════════════════════════════
   PERFORMANCE
   ════════════════════════════════════════════════ */
function applyPerformanceMode(){
  const slow=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||(navigator.deviceMemory&&navigator.deviceMemory<=2);
  if(slow||D.settings?.perf==='eco'){const root=document.documentElement;root.style.setProperty('--spd','.12s');root.style.setProperty('--slow','.22s');document.querySelectorAll('.amb').forEach(el=>el.style.display='none');console.log('⚡ Modo rendimiento');}
}

/* ════════════════════════════════════════════════
   ACTUALIZACIONES DE LA APP
   ════════════════════════════════════════════════ */
function previewAppName(v){
  // Preview en tiempo real en el header
  const hn=$('hname');if(hn&&v)hn.textContent=v;
}
function applyAppName(){
  const n=$('upd-name')?.value.trim();
  const s=$('upd-short')?.value.trim();
  if(!n){toast('⚠️ Ingresá un nombre');return}
  D.cfg.name=n;
  if(s)D.cfg.short=s;
  save();updateHdr();setupManifest();
  toast('✅ Nombre aplicado: '+n);
  broadcastUpdate();
}
function previewUpdLogo(e){
  const f=e.target.files[0];if(!f)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const src=ev.target.result;
    const prev=$('upd-logo-preview');
    if(prev)prev.innerHTML=`<img src="${src}" style="width:100%;height:100%;object-fit:contain;border-radius:14px"/>`;
    window._pendingUpdLogo=src;
  };
  reader.readAsDataURL(f);
}
function applyAppLogo(){
  const src=window._pendingUpdLogo;
  if(!src){toast('⚠️ Primero subí una imagen');return}
  D.cfg.logo=src;
  save();updateHdr();setupManifest();
  window._pendingUpdLogo=null;
  toast('✅ Logo actualizado');
  broadcastUpdate();
}
function applyAppVersion(){
  const v=$('upd-version')?.value.trim();
  if(!v){toast('⚠️ Ingresá una versión');return}
  D.cfg.version=v;
  save();
  const sp=$('cfg-ver-span');if(sp)sp.textContent=v;
  const badge=$('upd-ver-badge');if(badge)badge.textContent='v'+v;
  toast('✅ Versión guardada: v'+v);
}
function sendUpdateNotice(){
  const title=$('upd-title')?.value.trim()||'Nueva actualización';
  const body=$('upd-body')?.value.trim()||'Hay novedades en la app.';
  if(!title&&!body){toast('⚠️ Completá el aviso');return}
  // Guardar el aviso
  D.cfg.updateNotice={title,body,date:new Date().toISOString(),version:D.cfg.version||'1.0'};
  save();
  // Push notification
  try{sendPushToAll('🚀 '+title,body);}catch(e){}
  // BroadcastChannel para pedirles que recarguen si están en la app
  try{
    const bc2=new BroadcastChannel('lsl_live');
    bc2.postMessage({type:'update_notice',title,body,version:D.cfg.version||'1.0'});
    bc2.close();
  }catch(e){}
  toast('📣 Aviso enviado a todos los usuarios');
  broadcastUpdate();
}
// Escuchar avisos de actualización
try{
  const _updBC=new BroadcastChannel('lsl_live');
  const _origMsg=_updBC.onmessage;
  _updBC.onmessage=(e)=>{
    if(e.data?.type==='update_notice'){
      const {title,body}=e.data;
      // Mostrar toast y pedir recarga
      toast('🚀 '+title+': '+body.substring(0,60));
      setTimeout(()=>{
        if(confirm(`🚀 Actualización disponible\n\n${title}\n\n${body}\n\n¿Recargar ahora?`)){
          location.reload();
        }
      },1500);
    }else{
      load();renderAll();updateHdr();
    }
  };
}catch(e){}
// Poblar campos al abrir el tab de actualizaciones
function initUpdatesTab(){
  const n=$('upd-name');if(n)n.value=D.cfg.name||'';
  const s=$('upd-short');if(s)s.value=D.cfg.short||'';
  const v=$('upd-version');if(v)v.value=D.cfg.version||'1.0';
  const sp=$('cfg-ver-span');if(sp)sp.textContent=D.cfg.version||'—';
  const badge=$('upd-ver-badge');if(badge)badge.textContent='v'+(D.cfg.version||'1.0');
  const prev=$('upd-logo-preview');
  if(prev&&D.cfg.logo)prev.innerHTML=`<img src="${D.cfg.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:14px"/>`;
  if(D.cfg.updateNotice){
    const tb=$('upd-title');if(tb)tb.value=D.cfg.updateNotice.title||'';
    const bb=$('upd-body');if(bb)bb.value=D.cfg.updateNotice.body||'';
  }
}
/* ════════════════════════════════════════════════
   ISLA DINÁMICA — Reproductor + Notificaciones (iOS 26 style)
   ════════════════════════════════════════════════ */
let _diVisible=true,_diExpanded=false,_diNotifying=false,_diNotifyTimeout=null,_diHasTrack=false;
function initDynamicIsland(){
  const audioEl=$('native-audio');
  const islandEl=$('dynamic-island');
  if(!islandEl||!audioEl)return;
  const miniCover=$('mini-cover');
  const coverImg=$('island-cover');
  const songTitle=$('island-song-title');
  const songArtist=$('island-song-artist');
  const btnPlayPause=$('island-btn-play-pause');
  const iconPlay=$('island-icon-play');
  const iconPause=$('island-icon-pause');
  const btnNext=$('island-btn-next');
  const btnPrev=$('island-btn-prev');
  const progressContainer=$('island-progress-container');
  const progressFill=$('island-progress-fill');
  const timeCurrentEl=$('island-time-current');
  const timeTotalEl=$('island-time-total');
  const volumeContainer=$('island-volume-container');
  const volumeFill=$('island-volume-fill');
  const btnMute=$('island-btn-mute');

  function formatTime(seconds){
    if(!seconds||isNaN(seconds))return"0:00";
    const mins=Math.floor(seconds/60);const secs=Math.floor(seconds%60);
    return`${mins}:${secs<10?'0':''}${secs}`;
  }
  function togglePlay(e){
    if(e)e.stopPropagation();
    if(!_diHasTrack)return;
    if(audioEl.paused)audioEl.play().catch(()=>{});else audioEl.pause();
  }
  window.diNextTrack=function(e){
    if(e)e.stopPropagation();
    if(!_diPlaylist.length)return;
    _diIndex=(_diIndex+1)%_diPlaylist.length;
    diLoadTrack(_diIndex,!audioEl.paused);
  };
  window.diPrevTrack=function(e){
    if(e)e.stopPropagation();
    if(!_diPlaylist.length)return;
    _diIndex=(_diIndex-1+_diPlaylist.length)%_diPlaylist.length;
    diLoadTrack(_diIndex,!audioEl.paused);
  };

  audioEl.addEventListener('play',()=>{islandEl.classList.add('playing');iconPlay.style.display='none';iconPause.style.display='block'});
  audioEl.addEventListener('pause',()=>{islandEl.classList.remove('playing');iconPause.style.display='none';iconPlay.style.display='block'});
  audioEl.addEventListener('timeupdate',()=>{
    if(audioEl.duration){
      progressFill.style.width=`${(audioEl.currentTime/audioEl.duration)*100}%`;
      timeCurrentEl.textContent=formatTime(audioEl.currentTime);
      timeTotalEl.textContent=formatTime(audioEl.duration);
    }
  });
  audioEl.addEventListener('ended',()=>window.diNextTrack(null));

  progressContainer.addEventListener('click',e=>{
    e.stopPropagation();
    if(!audioEl.duration)return;
    const rect=progressContainer.getBoundingClientRect();
    audioEl.currentTime=((e.clientX-rect.left)/rect.width)*audioEl.duration;
  });

  // ── Control de volumen ──
  let lastVolume=audioEl.volume||0.7;
  audioEl.volume=lastVolume;
  function updateVolumeUI(){
    const pct=Math.round(audioEl.volume*100);
    volumeFill.style.width=pct+'%';
    btnMute.classList.toggle('muted',audioEl.muted||audioEl.volume===0);
    btnMute.innerHTML=(audioEl.muted||audioEl.volume===0)
      ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'
      :(pct<50
        ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>'
        :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>');
  }
  function setVolumeFromEvent(e){
    const rect=volumeContainer.getBoundingClientRect();
    let pct=(e.clientX-rect.left)/rect.width;
    pct=Math.max(0,Math.min(1,pct));
    audioEl.volume=pct;audioEl.muted=false;
    if(pct>0)lastVolume=pct;
    updateVolumeUI();
  }
  volumeContainer.addEventListener('click',e=>{e.stopPropagation();setVolumeFromEvent(e)});
  let _diDraggingVol=false;
  volumeContainer.addEventListener('mousedown',e=>{e.stopPropagation();_diDraggingVol=true;setVolumeFromEvent(e)});
  volumeContainer.addEventListener('touchstart',e=>{e.stopPropagation();_diDraggingVol=true;setVolumeFromEvent(e.touches[0])},{passive:true});
  document.addEventListener('mousemove',e=>{if(_diDraggingVol)setVolumeFromEvent(e)});
  document.addEventListener('touchmove',e=>{if(_diDraggingVol)setVolumeFromEvent(e.touches[0])},{passive:true});
  document.addEventListener('mouseup',()=>_diDraggingVol=false);
  document.addEventListener('touchend',()=>_diDraggingVol=false);
  btnMute.addEventListener('click',e=>{
    e.stopPropagation();
    if(audioEl.muted||audioEl.volume===0){audioEl.muted=false;audioEl.volume=lastVolume||0.7}
    else{lastVolume=audioEl.volume;audioEl.muted=true}
    updateVolumeUI();
  });
  updateVolumeUI();

  // ── Interacciones isla ──
  islandEl.addEventListener('click',()=>{
    if(!_diExpanded&&!_diNotifying){islandEl.classList.add('expanded');_diExpanded=true}
  });
  document.addEventListener('click',e=>{
    if(_diExpanded&&!islandEl.contains(e.target)){islandEl.classList.remove('expanded');_diExpanded=false}
  });
  btnPlayPause.addEventListener('click',togglePlay);
  btnNext.addEventListener('click',window.diNextTrack);
  btnPrev.addEventListener('click',window.diPrevTrack);

  // ── Notificaciones en la isla ──
  window.triggerIslandNotify=function(title,body){
    if(!_diVisible)return;
    if(_diExpanded){islandEl.classList.remove('expanded');_diExpanded=false}
    $('island-notif-title').textContent=title;
    $('island-notif-body').textContent=body;
    islandEl.classList.add('notify');
    _diNotifying=true;
    clearTimeout(_diNotifyTimeout);
    _diNotifyTimeout=setTimeout(()=>{islandEl.classList.remove('notify');_diNotifying=false},4500);
  };

  updateDIVisibility();
}

/* ── Playlist y carga de pistas ── */
let _diPlaylist=[],_diIndex=0;
function diLoadTrack(index,autoplay){
  const audioEl=$('native-audio');
  const track=_diPlaylist[index];
  if(!track){_diHasTrack=false;return}
  _diHasTrack=true;
  $('island-song-title').textContent=track.title||'Sin título';
  $('island-song-artist').textContent=track.artist||'';
  const cover=$('island-cover'),mini=$('mini-cover');
  if(track.cover){
    cover.classList.remove('empty');cover.innerHTML=`<img src="${track.cover}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>`;
    mini.classList.remove('empty');mini.innerHTML=`<img src="${track.cover}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit"/>`;
  }
  audioEl.src=track.audioSrc;
  $('island-progress-fill').style.width='0%';
  $('island-time-current').textContent='0:00';
  $('island-time-total').textContent='0:00';
  if(autoplay)audioEl.play().catch(()=>{});
}
function diSetPlaylist(tracks){
  _diPlaylist=tracks||[];_diIndex=0;
  if(_diPlaylist.length)diLoadTrack(0,false);
}

/* ── Visibilidad / configuración ── */
function toggleDIVisible(el){
  _diVisible=!_diVisible;
  el.classList.toggle('on',_diVisible);
  if(!D.settings)D.settings={};
  D.settings.diVisible=_diVisible;save();
  updateDIVisibility();
}
function updateDIVisibility(){
  const islandEl=$('dynamic-island');if(!islandEl)return;
  const allSections=D.settings?.diAllSections!==false;
  const onHome=curPage==='inicio';
  const shouldShow=_diVisible&&(allSections||onHome);
  islandEl.classList.toggle('di-hidden',!shouldShow);
}
function euiApplyDI(){
  const top=$('eui-di-top')?.value,radius=$('eui-di-radius')?.value;
  const root=document.documentElement;
  if(top!==undefined){root.style.setProperty('--di-top',top+'px');const v=$('eui-di-top-val');if(v)v.textContent=top+'px'}
  if(radius!==undefined){root.style.setProperty('--di-radius',radius+'px');const v=$('eui-di-radius-val');if(v)v.textContent=radius+'px'}
  if(!D.euiSettings)D.euiSettings={};
  D.euiSettings.diTop=top!==undefined?+top:D.euiSettings.diTop;
  D.euiSettings.diRadius=radius!==undefined?+radius:D.euiSettings.diRadius;
  save();
}

(function initAll(){
  setTimeout(()=>{try{loadEuiSettings();}catch(e){}},300);
  setTimeout(()=>{try{loadColorTheme();}catch(e){}},200);
  setTimeout(()=>{try{applyPerformanceMode();}catch(e){}},500);
  setTimeout(()=>{try{renderRulesAndInfo();}catch(e){}},800);
  setTimeout(()=>{try{checkWelcome();}catch(e){}},900);
  // Isla dinámica
  try{
    _diVisible=D.settings?.diVisible!==false;
    const root=document.documentElement;
    root.style.setProperty('--di-top',(D.euiSettings?.diTop??8)+'px');
    root.style.setProperty('--di-radius',(D.euiSettings?.diRadius??40)+'px');
    const diTgl=$('tgl-di');if(diTgl)diTgl.classList.toggle('on',_diVisible);
    const diAllTgl=$('tgl-di-all');if(diAllTgl)diAllTgl.classList.toggle('on',D.settings?.diAllSections!==false);
    const diTopS=$('eui-di-top');if(diTopS)diTopS.value=D.euiSettings?.diTop??8;
    const diTopV=$('eui-di-top-val');if(diTopV)diTopV.textContent=(D.euiSettings?.diTop??8)+'px';
    const diRadS=$('eui-di-radius');if(diRadS)diRadS.value=D.euiSettings?.diRadius??40;
    const diRadV=$('eui-di-radius-val');if(diRadV)diRadV.textContent=(D.euiSettings?.diRadius??40)+'px';
    initDynamicIsland();
    updateDIVisibility();
  }catch(e){console.warn('Dynamic Island init error:',e)}
})();
// Función para activar y escuchar las notificaciones en el celu
async function activarNotificacionesPush() {
  // Verificamos si estamos adentro de la App (Capacitor) y si existe el plugin
  if (typeof Capacitor !== 'undefined' && Capacitor.isPluginAvailable('PushNotifications')) {
    const { PushNotifications } = Capacitor.Plugins;

    // 1. Pedir permiso nativo en la pantalla del celular
    let permisos = await PushNotifications.checkPermissions();
    if (permisos.receive !== 'granted') {
      permisos = await PushNotifications.requestPermissions();
    }

    // 2. Si el usuario aceptó, registramos el dispositivo en Google
    if (permisos.receive === 'granted') {
      await PushNotifications.register();

      // 3. Obtener el Token único del celular por si querés ver que se registró bien
      PushNotifications.addListener('registration', (token) => {
        console.log('Celu registrado con éxito. Token:', token.value);
      });

      // 4. Qué hace la app si le llega una notificación mientras el usuario la tiene ABIERTA
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        // Podés mostrar una alerta nativa o usar tu propio sistema de cartelitos flotantes
        alert(`🔔 ${notification.title}\n${notification.body}`);
      });
      
      // 5. Qué hace si el usuario toca la notificación con la app CERRADA
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('El usuario tocó la notificación:', notification.actionId);
      });
    }
  } else {
    console.log('Las notificaciones push nativas solo funcionan adentro del APK.');
  }
}

// Ejecutar la función apenas cargue la página
document.addEventListener('DOMContentLoaded', () => {
  // Le damos 2 segundos de tiempo para que cargue bien Capacitor antes de pedir el permiso
  setTimeout(activarNotificacionesPush, 2000);
});
