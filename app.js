/* La Súper Liga · app.js
   Arranque, navegación, tema/diseño, modo de rendimiento y eventos (delegados: un solo listener). */
(function (w) {
  'use strict';
  var LSL = w.LSL, S = LSL.store, U = LSL.u, T = LSL.t, UI = LSL.ui, P = LSL.prefs, esc = U.esc;
  var doc = document, root = doc.documentElement;
  var $ = function (s) { return doc.querySelector(s); };
  var view, nav, styleEl, cur = 'home', scrolls = {};
  var TABS = [['home', 'Inicio', 'home'], ['league', 'Liga', 'trophy'], ['matches', 'Partidos', 'ball'], ['news', 'Noticias', 'news'], ['more', 'Más', 'more']];

  /* ---------- fondos de la página (los elige el admin) ---------- */
  var BGS = {
    navy: { bg: '#04101F', bg2: '#071A2E', card: '#0B1E33', card2: '#10283F', line: '#173653' },
    carbon: { bg: '#0B0C0F', bg2: '#121419', card: '#171A20', card2: '#1E222A', line: '#2A2F39' },
    violet: { bg: '#0D0A1F', bg2: '#140F2E', card: '#1A1440', card2: '#241C55', line: '#33296F' },
    forest: { bg: '#04140F', bg2: '#082018', card: '#0D2B21', card2: '#13382B', line: '#1C4A39' },
    wine: { bg: '#160609', bg2: '#210A10', card: '#2C1017', card2: '#3A1620', line: '#54202E' }
  };
  LSL.BGS = BGS;

  /* ---------- diseño / tema / rendimiento ---------- */
  function applyDesign() {
    var d = S.state.design, ac = d.accent || '#27C4C9', ac2 = d.accent2 || '#FFD226', b = BGS[d.bg] || BGS.navy;
    var css = ':root{--ac:' + ac + ';--ac2:' + ac2 + ';--on-ac:' + U.ink(ac) + ';--ac-soft:' + U.alpha(ac, 0.16) +
      ';--acg1:' + U.mix(ac, '#000000', 0.4) + ';--acg2:' + U.mix(U.hue(ac, 48), '#000000', 0.32) + ';--r:' + (+d.radius || 16) + 'px}' +
      ':root[data-theme=dark]{--bg:' + b.bg + ';--bg2:' + b.bg2 + ';--card:' + b.card + ';--card2:' + b.card2 + ';--line:' + b.line + ';--act:' + ac + ';--pts:' + ac2 + '}' +
      ':root[data-theme=light]{--act:' + U.mix(ac, '#000000', 0.42) + ';--pts:' + U.mix(ac2, '#000000', 0.55) + '}';
    styleEl.textContent = css;
    applyTheme(); applyPerf();
  }
  function applyTheme() {
    var m = (P.mode && P.mode !== 'auto') ? P.mode : (S.state.design.mode === 'light' ? 'light' : 'dark');
    root.setAttribute('data-theme', m);
    var mt = $('meta[name=theme-color]');
    if (mt) mt.setAttribute('content', m === 'light' ? '#EEF3F7' : (BGS[S.state.design.bg] || BGS.navy).bg);
  }
  function autoPerf() {
    if (LSL.probeLite) return 'lite';
    var n = navigator, mem = n.deviceMemory, cpu = n.hardwareConcurrency, con = n.connection;
    var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ((mem && mem <= 4) || (cpu && cpu <= 4) || reduce || (con && con.saveData)) return 'lite';
    return 'full';
  }
  function applyPerf() {
    var d = S.state.design.perf, p = (P.perf && P.perf !== 'auto') ? P.perf : (d && d !== 'auto' ? d : autoPerf());
    root.setAttribute('data-perf', p);
  }
  LSL.applyDesign = applyDesign;

  /* ---------- cabecera, banner y navegación ---------- */
  function renderHeader() {
    var L = S.state.league, top = $('#top');
    doc.title = L.name || 'La Súper Liga';
    top.innerHTML = '<button class="logo" id="logo" data-secret aria-label="' + esc(L.name) + '">' +
      (L.logo ? '<img class="mark img" src="' + esc(L.logo) + '" alt="">' : '<span class="mark">' + esc((L.short || 'LSL').slice(0, 4)) + '</span>') +
      '<span class="brand">' + esc(L.name) + '</span></button><span class="sp"></span><span class="season"><i></i>' + esc(String(L.season || '').replace(/^Temporada\s*/i, 'T')) + '</span>';
  }
  function renderBanner() {
    var b = S.state.banner, el = $('#banner');
    var seen = false; try { seen = sessionStorage.getItem('lsl:bn') === b.text; } catch (e) { }
    if (!b.active || !b.text || seen) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<span>' + esc(b.text) + '</span><button class="ib" data-act="bn-x" aria-label="Cerrar aviso">' + UI.ic('close') + '</button>';
  }
  function visibleTabs() { var f = S.state.features; return TABS.filter(function (t) { return t[0] !== 'news' || f.news; }); }
  function buildNav() {
    var tabs = visibleTabs(), i = 0;
    tabs.forEach(function (t, k) { if (t[0] === cur) i = k; });
    nav.setAttribute('data-nav', S.state.design.nav || 'floating');
    nav.innerHTML = '<div class="nav-bar" style="--n:' + tabs.length + ';--i:' + i + '"><span class="nav-ind"></span>' + tabs.map(function (t) {
      return '<button class="nav-i' + (t[0] === 'matches' ? ' c' : '') + (t[0] === cur ? ' on' : '') + '" data-go="' + t[0] + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '><span class="ico">' + UI.ic(t[2]) + '</span><span class="lb">' + t[1] + '</span></button>';
    }).join('') + '</div>';
  }
  function setActive() {
    var tabs = visibleTabs(), bar = nav.firstChild, i = 0;
    tabs.forEach(function (t, k) { if (t[0] === cur) i = k; });
    bar.style.setProperty('--i', i);
    [].forEach.call(nav.querySelectorAll('.nav-i'), function (b) {
      var on = b.getAttribute('data-go') === cur; b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- render de pantallas ---------- */
  function render(anim) {
    var html = UI.views[cur]();
    view.innerHTML = html;
    if (anim) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
  }
  function go(tab, keepScroll) {
    if (tab === 'news' && !S.state.features.news) tab = 'home';
    if (tab !== cur) { scrolls[cur] = w.pageYOffset; cur = tab; setActive(); render(true); w.scrollTo(0, scrolls[tab] || 0); }
    else if (!keepScroll) { render(false); w.scrollTo({ top: 0 }); }
    try { history.replaceState(history.state, '', '#/' + tab); } catch (e) { }
  }
  function rerender() { var y = w.pageYOffset; render(false); w.scrollTo(0, y); }

  /* ---------- capas (el botón "atrás" de Android cierra ventanas) ---------- */
  var layers = [];
  LSL.pushLayer = function (close) { layers.push(close); try { history.pushState({ l: layers.length }, ''); } catch (e) { } };
  LSL.popLayer = function () { if (layers.length) history.back(); };
  w.addEventListener('popstate', function () { var c = layers.pop(); if (c) c(); });

  /* ---------- panel admin (se descarga solo cuando hace falta) ---------- */
  LSL.openAdmin = function () {
    if (LSL.admin) return LSL.admin.open();
    UI.toast('Abriendo panel…', 1200);
    var l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/admin.css'; doc.head.appendChild(l);
    var s = doc.createElement('script'); s.src = 'js/admin.js';
    s.onload = function () { LSL.admin.open(); };
    s.onerror = function () { UI.toast('No se pudo cargar el panel. Revisá tu conexión.'); };
    doc.head.appendChild(s);
  };

  /* ---------- eventos ---------- */
  var taps = 0, tapT = 0;
  function onClick(e) {
    var t = e.target;
    if (t.closest('#admin-root')) return;
    var el;
    if ((el = t.closest('[data-copy]'))) {
      var v = el.getAttribute('data-copy');
      if (navigator.clipboard) navigator.clipboard.writeText(v).then(function () { UI.toast('Código copiado'); }, function () { UI.toast(v); });
      else UI.toast(v);
      return;
    }
    if (t.closest('#sheet')) return;
    if ((el = t.closest('[data-secret]'))) {          // 7 toques seguidos al logo = acceso admin
      var now = Date.now(); taps = (now - tapT < 2500) ? taps + 1 : 1; tapT = now;
      if (taps >= 7) { taps = 0; LSL.openAdmin(); return; }
      if (el.id === 'logo' && cur !== 'home') go('home');
      else if (el.id === 'logo') w.scrollTo({ top: 0 });
      return;
    }
    if ((el = t.closest('[data-match]'))) return UI.openSheet('match', el.getAttribute('data-match'));
    if ((el = t.closest('[data-news]'))) return UI.openSheet('news', el.getAttribute('data-news'));
    if ((el = t.closest('[data-go]'))) {
      var f = el.getAttribute('data-f');
      if (f) { UI.vs.filter = f; UI.vs.seg = 'list'; UI.vs.lim = 20; }
      return go(el.getAttribute('data-go'));
    }
    if ((el = t.closest('[data-filter]'))) { UI.vs.filter = el.getAttribute('data-filter'); UI.vs.lim = 20; return rerender(); }
    if ((el = t.closest('[data-ncat]'))) { UI.vs.ncat = el.getAttribute('data-ncat'); return rerender(); }
    if ((el = t.closest('[data-seg]'))) {
      var k = el.getAttribute('data-seg'), val = el.getAttribute('data-v');
      if (k === 'pmode') { P.mode = val; LSL.savePrefs(); applyTheme(); }
      else if (k === 'pperf') { P.perf = val; LSL.savePrefs(); LSL.probeLite = false; applyPerf(); }
      else UI.vs[k] = val;
      return rerender();
    }
    if ((el = t.closest('[data-cal]'))) {
      var vs = UI.vs, d = new Date(vs.month), n = new Date(d.getFullYear(), d.getMonth() + (+el.getAttribute('data-cal')), 1), today = new Date();
      vs.month = n.getTime();
      vs.day = (n.getFullYear() === today.getFullYear() && n.getMonth() === today.getMonth()) ? T.key(today.getTime()) : T.key(n.getTime());
      return rerender();
    }
    if ((el = t.closest('[data-day]'))) { UI.vs.day = el.getAttribute('data-day'); return rerender(); }
    if ((el = t.closest('[data-act]'))) {
      var a = el.getAttribute('data-act');
      if (a === 'full') { UI.vs.full = !UI.vs.full; rerender(); }
      else if (a === 'more') { UI.vs.lim += 20; rerender(); }
      else if (a === 'bn-x') { try { sessionStorage.setItem('lsl:bn', S.state.banner.text); } catch (x) { } renderBanner(); }
      else if (a === 'install' && LSL.installEvt) { LSL.installEvt.prompt(); LSL.installEvt = null; rerender(); }
      else if (a === 'share') {
        var data = { title: S.state.league.name, url: location.href.split('#')[0] };
        if (navigator.share) navigator.share(data).catch(function () { });
        else if (navigator.clipboard) navigator.clipboard.writeText(data.url).then(function () { UI.toast('Link copiado'); });
      }
    }
  }
  function onChange(e) {
    if (e.target.id === 'favsel') { P.fav = e.target.value; LSL.savePrefs(); rerender(); }
  }

  /* ---------- cuenta regresiva del partido destacado ---------- */
  function tickCountdown() {
    if (doc.hidden || cur !== 'home') return;
    [].forEach.call(doc.querySelectorAll('[data-cd]'), function (el) { el.textContent = T.inLabel(+el.getAttribute('data-cd')); });
  }

  /* ---------- sondeo de rendimiento: si va trabado, pasa a modo ligero ---------- */
  function probe() {
    if (doc.hidden || root.getAttribute('data-perf') === 'lite') return;
    if ((P.perf && P.perf !== 'auto') || (S.state.design.perf && S.state.design.perf !== 'auto')) return;
    var n = 0, slow = 0, last = 0;
    function f(t) {
      if (last) { n++; if (t - last > 50) slow++; }
      last = t;
      if (n < 45) return requestAnimationFrame(f);
      if (slow / n > 0.3) { LSL.probeLite = true; applyPerf(); UI.toast('Modo ligero activado para que todo vaya más fluido.', 3200); }
    }
    requestAnimationFrame(f);
  }

  /* ---------- arranque ---------- */
  function onData() {
    applyDesign(); renderHeader(); renderBanner(); buildNav();
    if (!S.state.features.news && cur === 'news') cur = 'home';
    if (!LSL.adminOpen) { rerender(); if (UI.sh.open) UI.renderSheet(); }
  }
  LSL.refreshView = onData;

  function boot() {
    view = $('#view'); nav = $('#nav');
    styleEl = doc.createElement('style'); doc.head.appendChild(styleEl);
    S.init();
    var h = (location.hash || '').replace(/^#\/?/, '');
    if (TABS.some(function (t) { return t[0] === h; })) cur = h;
    applyDesign(); renderHeader(); renderBanner(); buildNav(); UI.initSheet(); render(true);
    doc.addEventListener('click', onClick);
    doc.addEventListener('change', onChange);
    S.on('change', function () { requestAnimationFrame(onData); });
    if (h === 'admin') LSL.openAdmin();
    w.addEventListener('hashchange', function () {
      var x = (location.hash || '').replace(/^#\/?/, '');
      if (x === 'admin') LSL.openAdmin(); else if (x !== cur && TABS.some(function (t) { return t[0] === x; })) go(x);
    });
    w.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); LSL.installEvt = e; if (cur === 'more') rerender(); });
    setInterval(tickCountdown, 30000);
    S.startPolling();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      w.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { }); });
    }
    w.addEventListener('load', function () { setTimeout(probe, 600); });
  }
  boot();
})(window);
