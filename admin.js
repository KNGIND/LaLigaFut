/* La Súper Liga · admin.js
   Panel de administración. Se descarga SOLO cuando alguien entra al acceso secreto,
   así los visitantes no pagan ni un byte de este código. */
(function (w) {
  'use strict';
  var LSL = w.LSL, S = LSL.store, U = LSL.u, T = LSL.t, esc = U.esc, UI = LSL.ui, ic = UI.ic;
  var doc = document, html = doc.documentElement, root = doc.getElementById('admin-root');
  var A = LSL.admin = {};
  var tab = 'matches', mounted = false, mf = 'all', skip = false, imgs = {}, inT = 0, lastTab = '';
  var TABS = [['matches', 'Partidos', 'ball'], ['teams', 'Equipos', 'users'], ['news', 'Noticias', 'news'], ['channels', 'Canales', 'tv'], ['league', 'Liga', 'trophy'], ['design', 'Diseño', 'sliders'], ['data', 'Datos', 'db']];
  var COMP = [['liga', 'Liga'], ['copa', 'Copa'], ['amistoso', 'Amistoso']];
  var STAT = [['upcoming', 'Próximo'], ['live', 'En vivo'], ['paused', 'Descanso'], ['finished', 'Finalizado']];
  var FORMS = ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1', '4-5-1', '5-4-1', '4-1-2-3'].map(function (f) { return [f, f]; });
  var POS = [['POR', 'POR'], ['DEF', 'DEF'], ['MED', 'MED'], ['DEL', 'DEL']];
  var NAVS = [['minimal', 'Minimal'], ['glass', 'Cristal'], ['floating', 'Flotante'], ['neumorph', 'Neumórfico'], ['pill', 'Píldora'], ['fab', 'Botón central'], ['gradient', 'Degradado'], ['outline', 'Contorno'], ['indicator', 'Indicador'], ['curved', 'Curvo'], ['dock', 'Dock']];
  var BGN = { navy: 'Marino', carbon: 'Carbón', violet: 'Violeta', forest: 'Bosque', wine: 'Vino' };

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || root).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || root).querySelectorAll(s)); }
  function isLive(m) { return m.status === 'live' || m.status === 'paused'; }
  function toast(m) { LSL.toast(m); }
  function teamOpts() { return S.state.teams.map(function (t) { return [t.id, t.name]; }); }
  function isAuthed() { if (S.mode === 'cloud') return !!S.cloud.sess(); try { return sessionStorage.getItem('lsl:adm') === '1'; } catch (e) { return false; } }
  function defDate() { var d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return T.key(d.getTime()) + 'T' + U.pad(d.getHours()) + ':00'; }
  function download(name, text) {
    var b = new Blob([text], { type: 'text/javascript' }), a = doc.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; root.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function resizeImg(file, max, cb) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var r = Math.min(1, max / Math.max(img.width, img.height)), cw = Math.max(1, Math.round(img.width * r)), ch = Math.max(1, Math.round(img.height * r));
      var c = doc.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      var out; try { out = c.toDataURL('image/webp', 0.82); if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/png'); } catch (e) { out = c.toDataURL('image/png'); }
      cb(out);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }
  function ask(msg, ok, danger) {
    return new Promise(function (res) {
      var d = doc.createElement('div'); d.className = 'adm-modal';
      d.innerHTML = '<div class="am-c"><p>' + esc(msg) + '</p><div class="am-b"><button class="btn ghost" data-m="0">Cancelar</button><button class="btn' + (danger ? ' danger' : '') + '" data-m="1">' + esc(ok || 'Aceptar') + '</button></div></div>';
      d.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (!b && e.target !== d) return; d.remove(); res(!!b && b.getAttribute('data-m') === '1'); });
      root.appendChild(d);
    });
  }
  function design(fn) { skip = true; try { S.commit(function (st) { fn(st.design, st); }); } finally { skip = false; } }

  /* ---------- constructor de campos ---------- */
  function fld(f, v) {
    var k = f.k, id = 'ff_' + k, h;
    if (f.t === 'check') return '<label class="chk" data-w="' + k + '"><input type="checkbox" data-k="' + k + '"' + (v ? ' checked' : '') + '><span>' + esc(f.l) + '</span></label>';
    h = '<label class="fl' + (f.w === 'h' ? ' half' : '') + '" data-w="' + k + '"><span class="fl-t">' + esc(f.l) + '</span>';
    if (f.t === 'select') {
      h += '<select class="fld" data-k="' + k + '">' + f.o.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(v) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
    } else if (f.t === 'textarea') {
      h += '<textarea class="fld ta" rows="' + (f.rows || 3) + '" data-k="' + k + '" placeholder="' + esc(f.ph || '') + '">' + esc(v) + '</textarea>';
    } else if (f.t === 'color') {
      h += '<input class="fld clr" type="color" data-k="' + k + '" value="' + esc(v || '#000000') + '">';
    } else if (f.t === 'image') {
      imgs[k] = v || '';
      h += '<div class="imgf" data-imgk="' + k + '">' + (v ? '<img class="imgf-p" src="' + esc(v) + '" alt="">' : '<span class="imgf-e">Sin imagen</span>') +
        '<div class="imgf-b"><label class="btn sm ghost">Elegir<input type="file" accept="image/*" hidden data-file="' + k + '" data-max="' + (f.max || 200) + '"></label>' +
        (v ? '<button class="btn sm ghost" data-a="img-clear" data-v="' + k + '">Quitar</button>' : '') + '</div></div>';
    } else {
      var num = f.t === 'number';
      h += '<input class="fld" type="' + (f.t || 'text') + '"' + (num ? ' inputmode="numeric" step="1"' : '') + (f.list ? ' list="' + f.list + '"' : '') + (f.max ? ' maxlength="' + f.max + '"' : '') + ' data-k="' + k + '" placeholder="' + esc(f.ph || '') + '" value="' + esc(v == null ? '' : v) + '">';
    }
    return h + '</label>';
  }
  function fields(list, vals) { return list.map(function (f) { return fld(f, vals[f.k]); }).join(''); }
  function read(scope, list, out) {
    list.forEach(function (f) {
      var el = $('[data-k="' + f.k + '"]', scope), v;
      if (f.t === 'image') { out[f.k] = imgs[f.k] || ''; return; }
      if (!el) return;
      if (f.t === 'check') v = el.checked;
      else if (f.t === 'number') v = el.value === '' ? 0 : (+el.value || 0);
      else v = String(el.value).trim();
      out[f.k] = v;
    });
    return out;
  }

  /* ---------- acceso ---------- */
  A.open = function () {
    if (mounted) return;
    mounted = true; LSL.adminOpen = true; html.classList.add('lock');
    LSL.pushLayer(hide);
    if (isAuthed()) panel(); else login();
  };
  function hide() { mounted = false; LSL.adminOpen = false; root.innerHTML = ''; html.classList.remove('lock'); LSL.refreshView(); }
  function close() { LSL.popLayer(); }

  function login() {
    var cloud = S.mode === 'cloud';
    root.innerHTML = '<div class="adm"><header class="adm-h"><button class="ib" data-a="close" aria-label="Cerrar">' + ic('close') + '</button><h2>Acceso</h2></header>' +
      '<div class="adm-login"><div class="lg-i">' + ic('lock') + '</div><h3>Panel de administración</h3><p class="mut">' + (cloud ? 'Entrá con el email y la contraseña de administrador.' : 'Ingresá la contraseña de administrador.') + '</p>' +
      (cloud ? '<input class="fld" id="lg-mail" type="email" inputmode="email" autocomplete="username" placeholder="Email">' : '') +
      '<input class="fld" id="lg-pass" type="password" autocomplete="current-password" placeholder="Contraseña"><p class="err" id="lg-err"></p><button class="btn" data-a="login">Entrar</button></div></div>';
    setTimeout(function () { var f = $('#lg-mail') || $('#lg-pass'); if (f) f.focus(); }, 60);
  }
  function doLogin() {
    var pass = $('#lg-pass').value, err = $('#lg-err'), btn = $('[data-a=login]'); err.textContent = ''; btn.disabled = true;
    var p = S.mode === 'cloud'
      ? S.cloud.login($('#lg-mail').value.trim(), pass)
      : S.checkPass(pass).then(function (ok) { if (!ok) throw new Error('Contraseña incorrecta.'); try { sessionStorage.setItem('lsl:adm', '1'); } catch (e) { } return true; });
    p.then(panel).catch(function (e) { err.textContent = e.message || 'No se pudo entrar.'; btn.disabled = false; });
  }

  /* ---------- estructura del panel ---------- */
  function panel() {
    root.innerHTML = '<div class="adm" id="adm"><header class="adm-h"><button class="ib" data-a="close" aria-label="Cerrar panel">' + ic('close') + '</button><h2>Administración</h2><span class="sp"></span><button class="adm-st" id="adm-st" data-a="tab" data-v="data"></button></header>' +
      '<nav class="adm-tabs" id="adm-tabs"></nav><div class="adm-b" id="adm-b"></div></div>';
    status(); render();
  }
  function status() {
    var el = $('#adm-st'); if (!el) return;
    var s = S.status, t, c;
    if (S.mode === 'cloud') { t = s === 'saving' ? 'Guardando…' : s === 'ok' ? 'Publicado' : s === 'error' ? 'Error' : 'Conectado'; c = s === 'error' ? 'error' : s === 'saving' ? 'draft' : 'ok'; }
    else { t = S.hasDraft ? 'Borrador' : 'Sin cambios'; c = S.hasDraft ? 'draft' : 'ok'; if (s === 'error') { t = 'Sin espacio'; c = 'error'; } }
    el.className = 'adm-st ' + c; el.innerHTML = '<i></i>' + esc(t); el.title = S.statusMsg || '';
  }
  S.on('sync', status);
  S.on('change', function () { if (!mounted || skip) return; requestAnimationFrame(function () { if ($('#adm-b') && !$('#adm-form')) render(); }); });

  function render() {
    var b = $('#adm-b'); if (!b) return;
    var st = lastTab === tab ? b.scrollTop : 0; lastTab = tab;
    imgs = {};
    $('#adm-tabs').innerHTML = TABS.map(function (t) { return '<button class="' + (t[0] === tab ? 'on' : '') + '" data-a="tab" data-v="' + t[0] + '">' + ic(t[2]) + t[1] + '</button>'; }).join('');
    b.innerHTML = ({ matches: tMatches, teams: tTeams, news: tNews, channels: tChannels, league: tLeague, design: tDesign, data: tData })[tab]();
    b.scrollTop = st;
    var on = $('#adm-tabs .on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function bar(label, act) { return '<div class="adm-bar"><button class="btn" data-a="' + act + '">' + ic('plus') + label + '</button></div>'; }
  function none(t, s) { return '<div class="empty"><b>' + esc(t) + '</b><span>' + esc(s || '') + '</span></div>'; }
  function warn(t) { return '<div class="adm-warn">' + esc(t) + '</div>'; }

  /* ---------- PARTIDOS ---------- */
  function tMatches() {
    var mm = S.sorted(), live = mm.filter(isLive), up = mm.filter(function (m) { return m.status === 'upcoming'; }), fin = mm.filter(function (m) { return m.status === 'finished'; }).reverse();
    var list = mf === 'live' ? live : mf === 'up' ? up : mf === 'fin' ? fin : live.concat(up, fin);
    var h = bar('Nuevo partido', 'new-match');
    if (S.state.teams.length < 2) h += warn('Primero cargá al menos 2 equipos en la pestaña Equipos.');
    h += '<div class="chips">' + [['all', 'Todos'], ['live', 'En vivo'], ['up', 'Próximos'], ['fin', 'Finalizados']].map(function (c) { return '<button class="' + (c[0] === mf ? 'on' : '') + '" data-a="mf" data-v="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
    h += list.length ? '<div class="stack">' + list.slice(0, 80).map(mrow).join('') + '</div>' + (list.length > 80 ? '<p class="note">Mostrando 80 de ' + list.length + '. Usá los filtros para ver el resto.</p>' : '') : none('No hay partidos', 'Tocá “Nuevo partido” para crear el primero.');
    return h;
  }
  function mrow(m) {
    var h = S.team(m.home), a = S.team(m.away), ts = T.ts(m.date), live = isLive(m);
    var stl = { upcoming: 'Próximo', live: 'En vivo', paused: 'Descanso', finished: 'Final' }[m.status] || m.status;
    var sc = m.status === 'upcoming' ? '' : ' · ' + (+m.hs || 0) + '–' + (+m.as || 0);
    return '<div class="ar' + (live ? ' is-live' : '') + '"><div class="ar-m"><div class="ar-t wrap"><b>' + esc(h ? h.name : '?') + '</b><span>vs</span><b>' + esc(a ? a.name : '?') + '</b></div>' +
      '<div class="ar-s"><span class="pill st-' + esc(m.status) + '">' + esc(stl) + '</span>' + esc(T.short(ts)) + ' · ' + T.time(ts) + ' · ' + esc(UI.compLabel(m)) + sc + '</div></div>' +
      '<div class="ar-b"><button class="ib" data-a="edit-match" data-id="' + esc(m.id) + '" aria-label="Editar">' + ic('edit') + '</button><button class="ib" data-a="del-match" data-id="' + esc(m.id) + '" aria-label="Eliminar">' + ic('trash') + '</button></div>' +
      (live ? liveCtl(m, h, a) : m.status === 'upcoming' ? '<div class="lc"><button class="btn sm" data-a="go-live" data-id="' + esc(m.id) + '">Poner en vivo</button></div>' : '') + '</div>';
  }
  function liveCtl(m, h, a) {
    var id = esc(m.id);
    function pm(side, d, l) { return '<button class="ib sm" data-a="gol" data-id="' + id + '" data-side="' + side + '" data-d="' + d + '" aria-label="' + (d > 0 ? 'Sumar' : 'Restar') + ' gol">' + l + '</button>'; }
    return '<div class="lc"><div class="lc-sc"><span class="lc-n">' + esc(h ? h.short : 'L') + '</span>' + pm('h', -1, '−') + '<b>' + (+m.hs || 0) + '</b>' + pm('h', 1, '+') + '<i>–</i>' + pm('a', -1, '−') + '<b>' + (+m.as || 0) + '</b>' + pm('a', 1, '+') + '<span class="lc-n">' + esc(a ? a.short : 'V') + '</span></div>' +
      '<div class="lc-r"><input class="fld sm" inputmode="numeric" placeholder="Min" aria-label="Minuto" value="' + esc(m.minute || '') + '" data-min="' + id + '">' +
      (m.status === 'live' ? '<button class="btn sm ghost" data-a="status" data-id="' + id + '" data-v="paused">Descanso</button>' : '<button class="btn sm ghost" data-a="status" data-id="' + id + '" data-v="live">Reanudar</button>') +
      '<button class="btn sm" data-a="status" data-id="' + id + '" data-v="finished">Finalizar</button></div></div>';
  }

  /* Formularios */
  var openF = null;
  function openForm(cfg) {
    imgs = {};
    var host = doc.createElement('div'); host.id = 'adm-form'; host.className = 'adm-layer';
    host.innerHTML = '<div class="adm"><header class="adm-h"><button class="ib" data-a="f-cancel" aria-label="Cancelar">' + ic('close') + '</button><h2>' + esc(cfg.title) + '</h2><span class="sp"></span><button class="btn sm" data-a="f-save">Guardar</button></header>' +
      '<div class="af-b">' + fields(cfg.fields, cfg.values) + (cfg.extra || '') +
      (cfg.onDelete ? '<button class="btn danger wide" data-a="f-del">' + ic('trash') + 'Eliminar</button>' : '') + '</div></div>';
    root.appendChild(host); openF = cfg; cfg.host = host;
    LSL.pushLayer(function () { host.remove(); openF = null; render(); });
    if (cfg.bind) cfg.bind(host);
    $('.af-b', host).scrollTop = 0;
  }
  function closeForm() { LSL.popLayer(); }
  function saveForm() {
    var cfg = openF; if (!cfg) return;
    var out = {}; read(cfg.host, cfg.readFields || cfg.fields, out);
    var res = cfg.onSave(out, cfg.host);
    if (res === false) return;
    closeForm(); toast('Guardado');
  }

  var MFIELDS = function () {
    return [
      { k: 'home', l: 'Local', t: 'select', o: teamOpts(), w: 'h' }, { k: 'away', l: 'Visitante', t: 'select', o: teamOpts(), w: 'h' },
      { k: 'date', l: 'Fecha y hora', t: 'datetime-local' },
      { k: 'comp', l: 'Competición', t: 'select', o: COMP, w: 'h' }, { k: 'status', l: 'Estado', t: 'select', o: STAT, w: 'h' },
      { k: 'round', l: 'Jornada / fase', t: 'text', ph: 'Jornada 7, Semifinal…' },
      { k: 'cup', l: 'Nombre de la copa', t: 'text', ph: 'Copa Súper' },
      { k: 'leg2', l: 'Es partido de vuelta', t: 'check' },
      { k: 'firstLeg', l: 'Resultado de la ida', t: 'text', ph: '2-1' },
      { k: 'hs', l: 'Goles local', t: 'number', w: 'h' }, { k: 'as', l: 'Goles visitante', t: 'number', w: 'h' },
      { k: 'minute', l: 'Minuto (solo en vivo)', t: 'text', ph: '67' },
      { k: 'channel', l: 'Canal de TV', t: 'select', o: [['', 'Sin canal']].concat(S.state.channels.map(function (c) { return [c.id, c.name]; })) },
      { k: 'stadium', l: 'Estadio', t: 'text' },
      { k: 'room', l: 'Código de sala', t: 'text' },
      { k: 'notes', l: 'Notas', t: 'textarea', rows: 2 }
    ];
  };
  var XFIELDS = [{ k: 'hf', l: 'Formación local', t: 'select', o: FORMS, w: 'h' }, { k: 'af', l: 'Formación visitante', t: 'select', o: FORMS, w: 'h' }];

  function roles(f) {
    var rows = String(f || '4-4-2').split('-').map(Number).filter(Boolean), out = ['POR'];
    rows.forEach(function (n, i) { for (var j = 0; j < n; j++) out.push(i === 0 ? 'DEF' : i === rows.length - 1 ? 'DEL' : 'MED'); });
    return out.slice(0, 11);
  }
  function luRows(side, m) {
    var lu = m[side === 'h' ? 'hl' : 'al'] || [], rl = roles(m[side === 'h' ? 'hf' : 'af']), h = '';
    for (var i = 0; i < 11; i++) {
      var p = lu[i] || {};
      h += '<div class="lr" data-side="' + side + '"><span class="lr-r">' + rl[i] + '</span><input class="fld n" inputmode="numeric" placeholder="N°" data-f="n" value="' + esc(p.n == null ? '' : p.n) + '"><input class="fld" list="dl-' + side + '" placeholder="Jugador" data-f="name" value="' + esc(p.name || '') + '"></div>';
    }
    return h;
  }
  function evRow(e) {
    e = e || { min: '', type: 'goal', side: 'h', player: '' };
    function so(list, cur) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); }
    return '<div class="er"><input class="fld" inputmode="numeric" placeholder="Min" data-e="min" value="' + esc(e.min) + '"><select class="fld" data-e="type">' + so([['goal', 'Gol'], ['own', 'Gol en contra'], ['yellow', 'Amarilla'], ['red', 'Roja']], e.type) + '</select>' +
      '<select class="fld" data-e="side">' + so([['h', 'Local'], ['a', 'Visita']], e.side) + '</select><input class="fld" list="dl-ev" placeholder="Jugador" data-e="player" value="' + esc(e.player || '') + '"><button class="ib" data-a="ev-del" aria-label="Quitar evento">' + ic('trash') + '</button></div>';
  }
  function matchExtra(m) {
    return '<section class="af-sec"><h3>Alineaciones</h3><div class="seg"><button class="on" data-a="lu-tab" data-v="h">Local</button><button data-a="lu-tab" data-v="a">Visitante</button></div>' +
      ['h', 'a'].map(function (s) {
        return '<div class="lu" data-lu="' + s + '"' + (s === 'a' ? ' hidden' : '') + '>' + fld(XFIELDS[s === 'h' ? 0 : 1], m[s === 'h' ? 'hf' : 'af']) +
          '<button class="btn sm ghost" data-a="lu-auto" data-v="' + s + '">Autocompletar con la plantilla</button><div class="lrs">' + luRows(s, m) + '</div></div>';
      }).join('') + '<datalist id="dl-h"></datalist><datalist id="dl-a"></datalist><datalist id="dl-ev"></datalist></section>' +
      '<section class="af-sec"><h3>Eventos del partido</h3><div id="evs">' + (m.events || []).map(evRow).join('') + '</div><div class="btns"><button class="btn sm ghost" data-a="ev-add">' + ic('plus') + 'Agregar evento</button><button class="btn sm ghost" data-a="ev-sync">Calcular marcador con los goles</button></div></section>';
  }
  function squadOf(host, side) {
    var sel = $('[data-k="' + (side === 'h' ? 'home' : 'away') + '"]', host), t = sel && S.team(sel.value);
    return t ? (t.squad || []) : [];
  }
  function fillLists(host) {
    ['h', 'a'].forEach(function (s) {
      $('#dl-' + s, host).innerHTML = squadOf(host, s).map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('');
    });
    $('#dl-ev', host).innerHTML = squadOf(host, 'h').concat(squadOf(host, 'a')).map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join('');
  }
  function visibility(host) {
    var comp = $('[data-k=comp]', host).value, l2 = $('[data-k=leg2]', host).checked;
    $('[data-w=cup]', host).hidden = comp !== 'copa';
    $('[data-w=leg2]', host).hidden = comp === 'liga';
    $('[data-w=firstLeg]', host).hidden = !(l2 && comp !== 'liga');
  }
  function matchBind(host) {
    fillLists(host); visibility(host);
    host.addEventListener('change', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-k');
      if (k === 'home' || k === 'away') fillLists(host);
      if (k === 'comp' || k === 'leg2') visibility(host);
      if (k === 'hf' || k === 'af') {
        var s = k === 'hf' ? 'h' : 'a', rl = roles(e.target.value);
        $$('.lr[data-side="' + s + '"] .lr-r', host).forEach(function (el, i) { el.textContent = rl[i]; });
      }
    });
    host.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-f') !== 'name') return;
      var row = e.target.closest('.lr'), side = row.getAttribute('data-side'), n = $('[data-f=n]', row), v = e.target.value.toLowerCase();
      squadOf(host, side).some(function (p) { if (String(p.name).toLowerCase() === v) { if (!n.value) n.value = p.n; return true; } });
    });
  }
  function readLineup(host, side) {
    var rows = $$('.lr[data-side="' + side + '"]', host).map(function (r) {
      var n = $('[data-f=n]', r).value.trim(), nm = $('[data-f=name]', r).value.trim();
      return { n: n === '' ? '' : (isNaN(+n) ? n : +n), name: nm };
    });
    return rows.some(function (p) { return p.name || p.n !== ''; }) ? rows : [];
  }
  function readEvents(host) {
    return $$('.er', host).map(function (r) {
      return { min: $('[data-e=min]', r).value.trim(), type: $('[data-e=type]', r).value, side: $('[data-e=side]', r).value, player: $('[data-e=player]', r).value.trim() };
    }).filter(function (e) { return e.min || e.player; });
  }
  function autoLineup(host, side) {
    var sq = squadOf(host, side); if (!sq.length) return toast('Ese equipo todavía no tiene plantilla.');
    var f = $('[data-k="' + (side === 'h' ? 'hf' : 'af') + '"]', host).value, rl = roles(f), used = {}, slots = [];
    rl.forEach(function (r) { var p = null; sq.some(function (x, i) { if (!used[i] && x.pos === r) { used[i] = 1; p = x; return true; } }); slots.push(p); });
    slots = slots.map(function (p) { if (p) return p; var q = null; sq.some(function (x, i) { if (!used[i]) { used[i] = 1; q = x; return true; } }); return q; });
    $$('.lr[data-side="' + side + '"]', host).forEach(function (r, i) { var p = slots[i]; $('[data-f=n]', r).value = p ? p.n : ''; $('[data-f=name]', r).value = p ? p.name : ''; });
  }

  function matchForm(id) {
    var ex = id ? S.match(id) : null, ts = S.state.teams;
    var m = ex ? U.clone(ex) : { id: U.uid('m'), home: ts[0] ? ts[0].id : '', away: ts[1] ? ts[1].id : '', date: defDate(), comp: 'liga', round: '', cup: '', leg2: false, firstLeg: '', stadium: '', channel: '', status: 'upcoming', minute: '', hs: 0, as: 0, room: '', hf: '4-3-3', af: '4-3-3', hl: [], al: [], events: [], notes: '' };
    if (ts.length < 2) return toast('Cargá al menos 2 equipos primero.');
    var fl = MFIELDS();
    openForm({
      title: ex ? 'Editar partido' : 'Nuevo partido', fields: fl, readFields: fl.concat(XFIELDS), values: m, extra: matchExtra(m), bind: matchBind,
      onSave: function (v, host) {
        if (!v.home || !v.away || v.home === v.away) { toast('Elegí dos equipos distintos.'); return false; }
        if (!v.date) { toast('Falta la fecha y hora.'); return false; }
        var n = Object.assign({}, m, v); n.hl = readLineup(host, 'h'); n.al = readLineup(host, 'a'); n.events = readEvents(host);
        if (n.status === 'upcoming') n.minute = '';
        S.commit(function (st) { var i = st.matches.findIndex(function (x) { return x.id === n.id; }); if (i < 0) st.matches.push(n); else st.matches[i] = n; });
      },
      onDelete: ex ? function () { return delMatch(ex.id, true); } : null
    });
  }
  function delMatch(id, fromForm) {
    return ask('¿Eliminar este partido? No se puede deshacer.', 'Eliminar', true).then(function (ok) {
      if (!ok) return; S.commit(function (st) { st.matches = st.matches.filter(function (m) { return m.id !== id; }); });
      if (fromForm) closeForm(); else render(); toast('Partido eliminado');
    });
  }

  /* ---------- EQUIPOS ---------- */
  function tTeams() {
    var ts = S.state.teams.slice().sort(function (a, b) { return (a.name || '') < (b.name || '') ? -1 : 1; });
    return bar('Nuevo equipo', 'new-team') + (ts.length ? '<div class="stack">' + ts.map(function (t) {
      return '<div class="ar"><div class="ar-m"><div class="ar-t">' + UI.crest(t, 'm') + '<b>' + esc(t.name) + '</b></div><div class="ar-s">' + esc(t.short) + ' · ' + (t.squad || []).length + ' jugadores' + (+t.adj ? ' · ajuste ' + (t.adj > 0 ? '+' : '') + t.adj + ' pts' : '') + '</div></div>' +
        '<div class="ar-b"><button class="ib" data-a="edit-team" data-id="' + esc(t.id) + '" aria-label="Editar">' + ic('edit') + '</button><button class="ib" data-a="del-team" data-id="' + esc(t.id) + '" aria-label="Eliminar">' + ic('trash') + '</button></div></div>';
    }).join('') + '</div>' : none('Todavía no hay equipos', 'Creá los equipos de tu liga para poder armar partidos.'));
  }
  function sqRow(p) {
    p = p || { n: '', name: '', pos: 'MED' };
    return '<div class="sr"><input class="fld n" inputmode="numeric" placeholder="N°" data-s="n" value="' + esc(p.n) + '"><input class="fld" placeholder="Jugador" data-s="name" value="' + esc(p.name) + '"><select class="fld" data-s="pos">' + POS.map(function (o) { return '<option' + (o[0] === p.pos ? ' selected' : '') + '>' + o[0] + '</option>'; }).join('') + '</select><button class="ib" data-a="sq-del" aria-label="Quitar jugador">' + ic('trash') + '</button></div>';
  }
  function teamForm(id) {
    var ex = id ? S.team(id) : null;
    var t = ex ? U.clone(ex) : { id: U.uid('t'), name: '', short: '', color: '#27C4C9', color2: '#FFFFFF', logo: '', adj: 0, squad: [] };
    var fl = [{ k: 'name', l: 'Nombre', t: 'text' }, { k: 'short', l: 'Sigla (3 letras)', t: 'text', max: 4, w: 'h' }, { k: 'adj', l: 'Ajuste de puntos', t: 'number', w: 'h' },
      { k: 'color', l: 'Color principal', t: 'color', w: 'h' }, { k: 'color2', l: 'Color secundario', t: 'color', w: 'h' }, { k: 'logo', l: 'Escudo (opcional)', t: 'image', max: 160 }];
    openForm({
      title: ex ? 'Editar equipo' : 'Nuevo equipo', fields: fl, values: t,
      extra: '<section class="af-sec"><h3>Plantilla</h3><p class="mut sm">Sirve para autocompletar alineaciones.</p><div id="sq">' + (t.squad || []).map(sqRow).join('') + '</div><button class="btn sm ghost" data-a="sq-add">' + ic('plus') + 'Agregar jugador</button></section>',
      onSave: function (v, host) {
        if (!v.name) { toast('Poné un nombre.'); return false; }
        v.short = (v.short || v.name).toUpperCase().slice(0, 4);
        var n = Object.assign({}, t, v);
        n.squad = $$('.sr', host).map(function (r) { var nn = $('[data-s=n]', r).value.trim(); return { n: nn === '' ? '' : (isNaN(+nn) ? nn : +nn), name: $('[data-s=name]', r).value.trim(), pos: $('[data-s=pos]', r).value }; }).filter(function (p) { return p.name; });
        S.commit(function (st) { var i = st.teams.findIndex(function (x) { return x.id === n.id; }); if (i < 0) st.teams.push(n); else st.teams[i] = n; });
      },
      onDelete: ex ? function () { return delTeam(ex.id, true); } : null
    });
  }
  function delTeam(id, fromForm) {
    if (S.isTeamUsed(id)) { toast('Ese equipo tiene partidos. Borrá o cambiá esos partidos primero.'); return; }
    return ask('¿Eliminar este equipo?', 'Eliminar', true).then(function (ok) {
      if (!ok) return; S.commit(function (st) { st.teams = st.teams.filter(function (t) { return t.id !== id; }); st.sanctions = st.sanctions.filter(function (s) { return s.team !== id; }); });
      if (fromForm) closeForm(); else render(); toast('Equipo eliminado');
    });
  }

  /* ---------- NOTICIAS ---------- */
  function tNews() {
    var ns = S.state.news.slice().sort(function (a, b) { return T.ts(b.date) - T.ts(a.date); });
    return bar('Nueva noticia', 'new-news') + (ns.length ? '<div class="stack">' + ns.map(function (n) {
      return '<div class="ar"><div class="ar-m"><div class="ar-t"><b>' + esc(n.title) + '</b></div><div class="ar-s">' + esc(n.cat) + ' · ' + esc(T.short(T.ts(n.date))) + '</div></div><div class="ar-b"><button class="ib" data-a="edit-news" data-id="' + esc(n.id) + '" aria-label="Editar">' + ic('edit') + '</button><button class="ib" data-a="del-news" data-id="' + esc(n.id) + '" aria-label="Eliminar">' + ic('trash') + '</button></div></div>';
    }).join('') + '</div>' : none('No hay noticias', 'Publicá la primera novedad de la liga.'));
  }
  function newsForm(id) {
    var ex = id ? S.news(id) : null;
    var n = ex ? U.clone(ex) : { id: U.uid('n'), title: '', cat: 'Noticias', summary: '', body: '', img: '', date: defDate() };
    var cats = {}; S.state.news.forEach(function (x) { if (x.cat) cats[x.cat] = 1; });
    var fl = [{ k: 'title', l: 'Título', t: 'text' }, { k: 'cat', l: 'Categoría', t: 'text', list: 'dl-cat', ph: 'Resultados, Fichajes…' }, { k: 'date', l: 'Fecha', t: 'datetime-local' },
      { k: 'summary', l: 'Resumen (se ve en la lista)', t: 'textarea', rows: 2 }, { k: 'body', l: 'Texto completo', t: 'textarea', rows: 7, ph: 'Separá los párrafos con una línea en blanco.' }, { k: 'img', l: 'Imagen de portada', t: 'image', max: 720 }];
    openForm({
      title: ex ? 'Editar noticia' : 'Nueva noticia', fields: fl, values: n,
      extra: '<datalist id="dl-cat">' + Object.keys(cats).map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>',
      onSave: function (v) {
        if (!v.title) { toast('Falta el título.'); return false; }
        var o = Object.assign({}, n, v);
        S.commit(function (st) { var i = st.news.findIndex(function (x) { return x.id === o.id; }); if (i < 0) st.news.push(o); else st.news[i] = o; });
      },
      onDelete: ex ? function () { return ask('¿Eliminar esta noticia?', 'Eliminar', true).then(function (ok) { if (!ok) return; S.commit(function (st) { st.news = st.news.filter(function (x) { return x.id !== ex.id; }); }); closeForm(); toast('Noticia eliminada'); }); } : null
    });
  }

  /* ---------- CANALES ---------- */
  function tChannels() {
    var cs = S.state.channels;
    return bar('Nuevo canal', 'new-chan') + '<p class="mut sm pad">Los canales aparecen en cada partido con su logo.</p>' + (cs.length ? '<div class="stack">' + cs.map(function (c) {
      return '<div class="ar"><div class="ar-m"><div class="ar-t">' + (c.logo ? '<img class="ch-l" src="' + esc(c.logo) + '" alt="">' : ic('tv')) + '<b>' + esc(c.name) + '</b></div><div class="ar-s">' + esc(c.url || 'Sin enlace') + '</div></div><div class="ar-b"><button class="ib" data-a="edit-chan" data-id="' + esc(c.id) + '" aria-label="Editar">' + ic('edit') + '</button><button class="ib" data-a="del-chan" data-id="' + esc(c.id) + '" aria-label="Eliminar">' + ic('trash') + '</button></div></div>';
    }).join('') + '</div>' : none('No hay canales', 'Creá un canal y subile el logo.'));
  }
  function chanForm(id) {
    var ex = id ? S.channel(id) : null, c = ex ? U.clone(ex) : { id: U.uid('c'), name: '', logo: '', url: '' };
    openForm({
      title: ex ? 'Editar canal' : 'Nuevo canal', values: c,
      fields: [{ k: 'name', l: 'Nombre del canal', t: 'text' }, { k: 'url', l: 'Enlace para ver (opcional)', t: 'url', ph: 'https://…' }, { k: 'logo', l: 'Logo del canal', t: 'image', max: 160 }],
      onSave: function (v) {
        if (!v.name) { toast('Poné un nombre.'); return false; }
        var o = Object.assign({}, c, v);
        S.commit(function (st) { var i = st.channels.findIndex(function (x) { return x.id === o.id; }); if (i < 0) st.channels.push(o); else st.channels[i] = o; });
      },
      onDelete: ex ? function () { return ask('¿Eliminar este canal? Los partidos quedan sin canal.', 'Eliminar', true).then(function (ok) { if (!ok) return; S.commit(function (st) { st.channels = st.channels.filter(function (x) { return x.id !== ex.id; }); st.matches.forEach(function (m) { if (m.channel === ex.id) m.channel = ''; }); }); closeForm(); toast('Canal eliminado'); }); } : null
    });
  }

  /* ---------- LIGA (datos generales, puntos, sanciones) ---------- */
  var LFIELDS = [
    { k: 'name', l: 'Nombre de la liga', t: 'text' }, { k: 'short', l: 'Sigla', t: 'text', max: 4, w: 'h' }, { k: 'season', l: 'Temporada', t: 'text', w: 'h' },
    { k: 'seasonStatus', l: 'Estado', t: 'select', o: [['Pretemporada', 'Pretemporada'], ['En curso', 'En curso'], ['En pausa', 'En pausa'], ['Finalizada', 'Finalizada']] },
    { k: 'logo', l: 'Logo (opcional)', t: 'image', max: 160 },
    { k: 'info', l: 'Sobre la liga', t: 'textarea', rows: 4 }, { k: 'rules', l: 'Reglamento', t: 'textarea', rows: 8 },
    { k: 'pointsWin', l: 'Puntos por victoria', t: 'number', w: 'h' }, { k: 'pointsDraw', l: 'Puntos por empate', t: 'number', w: 'h' },
    { k: 'pointsLoss', l: 'Puntos por derrota', t: 'number', w: 'h' }, { k: 'zoneTop', l: 'Lugares que clasifican', t: 'number', w: 'h' }, { k: 'zoneBottom', l: 'Lugares de descenso', t: 'number' }
  ];
  function tLeague() {
    var L = S.state.league;
    var h = '<div class="af-sec flat" id="lg-form">' + fields(LFIELDS, L) + '<button class="btn wide" data-a="league-save">Guardar datos de la liga</button></div>';
    h += '<h3 class="adm-h3">Sanciones</h3>' + bar('Nueva sanción', 'new-sanc');
    var ss = S.state.sanctions;
    h += ss.length ? '<div class="stack">' + ss.map(function (s) {
      var t = S.team(s.team);
      return '<div class="ar"><div class="ar-m"><div class="ar-t">' + (t ? UI.crest(t, 's') : '') + '<b>' + esc(s.player) + '</b></div><div class="ar-s">' + esc({ yellow: 'Amarillas', red: 'Expulsión', injury: 'Lesión', other: 'Otro' }[s.type] || '') + (s.duration ? ' · ' + esc(s.duration) : '') + '</div></div><div class="ar-b"><button class="ib" data-a="edit-sanc" data-id="' + esc(s.id) + '" aria-label="Editar">' + ic('edit') + '</button><button class="ib" data-a="del-sanc" data-id="' + esc(s.id) + '" aria-label="Eliminar">' + ic('trash') + '</button></div></div>';
    }).join('') + '</div>' : none('Sin sanciones', 'Registrá tarjetas, suspensiones o lesiones.');
    return h;
  }
  function sancForm(id) {
    var ex = S.state.sanctions.filter(function (s) { return s.id === id; })[0], s = ex ? U.clone(ex) : { id: U.uid('s'), player: '', team: (S.state.teams[0] || {}).id || '', type: 'yellow', duration: '', notes: '' };
    openForm({
      title: ex ? 'Editar sanción' : 'Nueva sanción', values: s,
      fields: [{ k: 'player', l: 'Jugador', t: 'text' }, { k: 'team', l: 'Equipo', t: 'select', o: teamOpts() }, { k: 'type', l: 'Tipo', t: 'select', o: [['yellow', 'Amarillas'], ['red', 'Expulsión'], ['injury', 'Lesión'], ['other', 'Otro']] }, { k: 'duration', l: 'Duración', t: 'text', ph: '2 partidos' }, { k: 'notes', l: 'Notas', t: 'text' }],
      onSave: function (v) {
        if (!v.player) { toast('Falta el jugador.'); return false; }
        var o = Object.assign({}, s, v);
        S.commit(function (st) { var i = st.sanctions.findIndex(function (x) { return x.id === o.id; }); if (i < 0) st.sanctions.push(o); else st.sanctions[i] = o; });
      },
      onDelete: ex ? function () { S.commit(function (st) { st.sanctions = st.sanctions.filter(function (x) { return x.id !== ex.id; }); }); closeForm(); toast('Sanción eliminada'); } : null
    });
  }

  /* ---------- DISEÑO (se aplica en vivo) ---------- */
  function navPreview(style, i) {
    var items = [['home', 'Inicio'], ['trophy', 'Liga'], ['ball', 'Partidos'], ['news', 'Noticias'], ['more', 'Más']];
    return '<div class="navp" id="navp" data-nav="' + style + '"><div class="nav-bar" style="--n:5;--i:' + (i || 0) + '"><span class="nav-ind"></span>' + items.map(function (t, k) {
      return '<button class="nav-i' + (k === 2 ? ' c' : '') + (k === (i || 0) ? ' on' : '') + '" data-a="navp" data-v="' + k + '"><span class="ico">' + ic(t[0]) + '</span><span class="lb">' + t[1] + '</span></button>';
    }).join('') + '</div></div>';
  }
  function seg(k, list, cur) { return '<div class="seg">' + list.map(function (o) { return '<button class="' + (o[0] === cur ? 'on' : '') + '" data-a="dset" data-k="' + k + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
  function tDesign() {
    var d = S.state.design, f = S.state.features, b = S.state.banner;
    var h = '<section class="af-sec flat"><h3>Colores</h3><div class="row2"><label class="fl half"><span class="fl-t">Color principal</span><input class="fld clr" type="color" data-d="accent" value="' + esc(d.accent) + '"></label><label class="fl half"><span class="fl-t">Color de destaque</span><input class="fld clr" type="color" data-d="accent2" value="' + esc(d.accent2) + '"></label></div>' +
      '<span class="fl-t">Fondo (modo oscuro)</span><div class="swatches">' + Object.keys(BGN).map(function (k) { var c = LSL.BGS[k]; return '<button class="sw' + (d.bg === k ? ' on' : '') + '" data-a="dset" data-k="bg" data-v="' + k + '" style="--sw:' + c.bg + ';--sw2:' + c.card + '"><i></i>' + BGN[k] + '</button>'; }).join('') + '</div>' +
      '<span class="fl-t">Modo por defecto</span>' + seg('mode', [['dark', 'Oscuro'], ['light', 'Claro']], d.mode) + '</section>';
    h += '<section class="af-sec flat"><h3>Navegación inferior</h3><p class="mut sm">Tocá un estilo y probalo abajo (tocá los íconos de la vista previa).</p>' + navPreview(d.nav, 0) +
      '<div class="chips wrapc">' + NAVS.map(function (n) { return '<button class="' + (d.nav === n[0] ? 'on' : '') + '" data-a="dset" data-k="nav" data-v="' + n[0] + '">' + n[1] + '</button>'; }).join('') + '</div>' +
      '<p class="mut sm">Cristal y Dock usan desenfoque solo en modo Completo. En modo Ligero se ven sólidos.</p></section>';
    h += '<section class="af-sec flat"><h3>Estilo</h3><label class="fl"><span class="fl-t">Redondeo de tarjetas: <b id="rad-v">' + (+d.radius || 16) + '</b> px</span><input type="range" min="6" max="26" step="1" data-d="radius" value="' + (+d.radius || 16) + '"></label>' +
      '<span class="fl-t">Efectos por defecto</span>' + seg('perf', [['auto', 'Automático'], ['full', 'Completo'], ['lite', 'Ligero']], d.perf || 'auto') + '<p class="mut sm">Cada persona puede cambiarlo en su celular desde Más &gt; Rendimiento.</p></section>';
    h += '<section class="af-sec flat"><h3>Funciones</h3>' + [['calendar', 'Calendario mensual'], ['news', 'Noticias'], ['lineups', 'Alineaciones en cada partido'], ['sanctions', 'Sanciones'], ['channels', 'Canales de TV']].map(function (x) {
      return '<label class="chk"><input type="checkbox" data-feat="' + x[0] + '"' + (f[x[0]] ? ' checked' : '') + '><span>' + x[1] + '</span></label>';
    }).join('') + '</section>';
    h += '<section class="af-sec flat"><h3>Aviso destacado</h3><label class="chk"><input type="checkbox" data-ban="active"' + (b.active ? ' checked' : '') + '><span>Mostrar aviso arriba de todo</span></label><input class="fld" data-ban="text" placeholder="Texto del aviso" value="' + esc(b.text) + '"></section>';
    return h;
  }

  /* ---------- DATOS ---------- */
  function tData() {
    var cloud = S.mode === 'cloud', h = '';
    if (!cloud && S.usingDefaultPass()) h += warn('Estás usando la contraseña por defecto. Cambiala acá abajo antes de publicar.');
    h += '<section class="af-sec flat"><h3>' + (cloud ? 'Modo nube' : 'Modo local') + '</h3>' + (cloud
      ? '<p class="mut">Cada cambio se publica solo en Supabase y todos lo ven al instante. Estado: <b>' + esc({ saving: 'guardando…', ok: 'publicado', error: 'error: ' + S.statusMsg, idle: 'conectado' }[S.status] || 'conectado') + '</b>.</p><div class="btns"><button class="btn ghost" data-a="push">Volver a subir todo</button><button class="btn ghost" data-a="logout">' + ic('logout') + 'Cerrar sesión</button></div>'
      : '<p class="mut">Tus cambios quedan como <b>borrador en este celular</b>. Para que los vea todo el mundo: exportá <b>data.js</b> y reemplazá el archivo <b>data/data.js</b> del proyecto (después subilo a Vercel).</p>' +
      '<div class="btns"><button class="btn" data-a="export">' + ic('download') + 'Exportar data.js</button><label class="btn ghost">' + ic('upload') + 'Importar<input type="file" accept=".js,.json,.txt" hidden data-a-import></label></div>' +
      (S.hasDraft ? '<div class="btns"><button class="btn ghost danger-t" data-a="discard">Descartar mi borrador</button></div>' : '')) + '</section>';
    if (cloud) h += '<section class="af-sec flat"><h3>Copia de seguridad</h3><div class="btns"><button class="btn ghost" data-a="export">' + ic('download') + 'Exportar data.js</button><label class="btn ghost">' + ic('upload') + 'Importar<input type="file" accept=".js,.json,.txt" hidden data-a-import></label></div></section>';
    if (!cloud) h += '<section class="af-sec flat"><h3>Contraseña del panel</h3><input class="fld" id="np1" type="password" autocomplete="new-password" placeholder="Nueva contraseña (mín. 6)"><input class="fld" id="np2" type="password" autocomplete="new-password" placeholder="Repetila"><button class="btn wide" data-a="setpass">Cambiar contraseña</button>' +
      '<p class="mut sm">Ojo: en modo local la contraseña es un candado suave (cualquiera con conocimientos puede leer los archivos de la página). Para seguridad real, usá el modo nube.</p></section>';
    if (!cloud) h += '<section class="af-sec flat"><button class="btn ghost wide" data-a="logout">' + ic('logout') + 'Cerrar sesión del panel</button></section>';
    return h;
  }

  /* ---------- eventos ---------- */
  root.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.target.id === 'lg-pass' || e.target.id === 'lg-mail')) doLogin(); });
  root.addEventListener('change', function (e) {
    var el = e.target, f;
    if ((f = el.getAttribute('data-file'))) {               // subir imagen
      var file = el.files && el.files[0]; if (!file) return;
      resizeImg(file, +el.getAttribute('data-max') || 200, function (out) {
        if (!out) return toast('No se pudo leer esa imagen.');
        imgs[f] = out; var box = el.closest('.imgf');
        box.innerHTML = '<img class="imgf-p" src="' + esc(out) + '" alt=""><div class="imgf-b"><label class="btn sm ghost">Cambiar<input type="file" accept="image/*" hidden data-file="' + f + '" data-max="' + el.getAttribute('data-max') + '"></label><button class="btn sm ghost" data-a="img-clear" data-v="' + f + '">Quitar</button></div>';
      });
      return;
    }
    if (el.hasAttribute('data-min')) { var id = el.getAttribute('data-min'); S.commit(function () { var m = S.match(id); if (m) m.minute = el.value.trim(); }); return; }
    if (el.hasAttribute('data-feat')) { design(function (d, st) { st.features[el.getAttribute('data-feat')] = el.checked; }); return; }
    if (el.hasAttribute('data-ban')) { design(function (d, st) { st.banner[el.getAttribute('data-ban')] = el.type === 'checkbox' ? el.checked : el.value.trim(); }); return; }
    if (el.hasAttribute('data-a-import')) {
      var fl = el.files && el.files[0]; if (!fl) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var o = S.parseImport(String(rd.result));
          ask('¿Reemplazar todos los datos actuales por los del archivo? (' + o.teams.length + ' equipos, ' + o.matches.length + ' partidos)', 'Importar').then(function (ok) { if (ok) { S.replace(o); render(); toast('Datos importados'); } });
        } catch (x) { toast(x.message || 'Archivo inválido'); }
        el.value = '';
      };
      rd.readAsText(fl);
    }
  });
  root.addEventListener('input', function (e) {
    var el = e.target, k = el.getAttribute('data-d');
    if (!k) return;
    if (k === 'radius') { $('#rad-v').textContent = el.value; }
    clearTimeout(inT); inT = setTimeout(function () { design(function (d) { d[k] = k === 'radius' ? +el.value : el.value; }); }, 120);
  });

  root.addEventListener('click', function (e) {
    var el = e.target.closest('[data-a]'); if (!el) return;
    var a = el.getAttribute('data-a'), id = el.getAttribute('data-id'), v = el.getAttribute('data-v');
    switch (a) {
      case 'close': return close();
      case 'login': return doLogin();
      case 'tab': tab = v; return render();
      case 'mf': mf = v; return render();
      case 'new-match': return matchForm();
      case 'edit-match': return matchForm(id);
      case 'del-match': return delMatch(id);
      case 'go-live': S.commit(function () { var m = S.match(id); m.status = 'live'; m.minute = '1'; }); return toast('Partido en vivo');
      case 'gol': { var side = el.getAttribute('data-side'), d = +el.getAttribute('data-d'); S.commit(function () { var m = S.match(id), k = side === 'h' ? 'hs' : 'as'; m[k] = Math.max(0, (+m[k] || 0) + d); }); return; }
      case 'status': S.commit(function () { var m = S.match(id); m.status = v; if (v === 'finished') m.minute = ''; }); return toast(v === 'finished' ? 'Partido finalizado' : v === 'paused' ? 'Descanso' : 'En vivo');
      case 'new-team': return teamForm();
      case 'edit-team': return teamForm(id);
      case 'del-team': return delTeam(id);
      case 'new-news': return newsForm();
      case 'edit-news': return newsForm(id);
      case 'del-news': return ask('¿Eliminar esta noticia?', 'Eliminar', true).then(function (ok) { if (ok) { S.commit(function (st) { st.news = st.news.filter(function (n) { return n.id !== id; }); }); toast('Noticia eliminada'); } });
      case 'new-chan': return chanForm();
      case 'edit-chan': return chanForm(id);
      case 'del-chan': return ask('¿Eliminar este canal? Los partidos quedan sin canal.', 'Eliminar', true).then(function (ok) { if (ok) { S.commit(function (st) { st.channels = st.channels.filter(function (c) { return c.id !== id; }); st.matches.forEach(function (m) { if (m.channel === id) m.channel = ''; }); }); toast('Canal eliminado'); } });
      case 'new-sanc': return sancForm();
      case 'edit-sanc': return sancForm(id);
      case 'del-sanc': S.commit(function (st) { st.sanctions = st.sanctions.filter(function (s) { return s.id !== id; }); }); return toast('Sanción eliminada');
      case 'league-save': { var out = {}; read($('#lg-form'), LFIELDS, out); if (!out.name) return toast('Poné el nombre de la liga.'); S.commit(function (st) { Object.assign(st.league, out); }); return toast('Datos de la liga guardados'); }
      case 'f-cancel': return closeForm();
      case 'f-save': return saveForm();
      case 'f-del': { var r = openF && openF.onDelete && openF.onDelete(); return r; }
      case 'img-clear': { imgs[v] = ''; var box = el.closest('.imgf'); box.innerHTML = '<span class="imgf-e">Sin imagen</span><div class="imgf-b"><label class="btn sm ghost">Elegir<input type="file" accept="image/*" hidden data-file="' + v + '" data-max="200"></label></div>'; return; }
      case 'lu-tab': $$('.lu', openF.host).forEach(function (x) { x.hidden = x.getAttribute('data-lu') !== v; }); $$('[data-a="lu-tab"]', openF.host).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); }); return;
      case 'lu-auto': return autoLineup(openF.host, v);
      case 'ev-add': $('#evs', openF.host).insertAdjacentHTML('beforeend', evRow()); return;
      case 'ev-del': return el.closest('.er').remove();
      case 'ev-sync': {
        var hs = 0, as = 0; readEvents(openF.host).forEach(function (x) { if (x.type === 'goal') { if (x.side === 'h') hs++; else as++; } else if (x.type === 'own') { if (x.side === 'h') as++; else hs++; } });
        $('[data-k=hs]', openF.host).value = hs; $('[data-k=as]', openF.host).value = as; return toast('Marcador: ' + hs + ' – ' + as);
      }
      case 'sq-add': $('#sq', openF.host).insertAdjacentHTML('beforeend', sqRow()); return;
      case 'sq-del': return el.closest('.sr').remove();
      case 'dset': {
        var k = el.getAttribute('data-k');
        design(function (d) { d[k] = v; });
        if (k === 'nav') { $('#navp').outerHTML = navPreview(v, +($('#navp .nav-bar').style.getPropertyValue('--i')) || 0); }
        $$('[data-a="dset"][data-k="' + k + '"]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
        return;
      }
      case 'navp': { var bar = $('#navp .nav-bar'); bar.style.setProperty('--i', v); $$('#navp .nav-i').forEach(function (b, i) { b.classList.toggle('on', i === +v); }); return; }
      case 'export': download('data.js', S.exportJS()); return toast('Descargando data.js');
      case 'discard': return ask('¿Descartar tus cambios y volver a los datos publicados?', 'Descartar', true).then(function (ok) { if (ok) { S.discardDraft(); location.reload(); } });
      case 'push': S.setStatus('saving'); return S.cloud.push(S.state).then(function () { S.setStatus('ok'); toast('Datos subidos'); }).catch(function (x) { S.setStatus('error', x.message); toast(x.message); });
      case 'logout': if (S.mode === 'cloud') S.cloud.logout(); else { try { sessionStorage.removeItem('lsl:adm'); } catch (x) { } } return close();
      case 'setpass': {
        var p1 = $('#np1').value, p2 = $('#np2').value;
        if (p1.length < 6) return toast('Mínimo 6 caracteres.');
        if (p1 !== p2) return toast('Las contraseñas no coinciden.');
        return S.setPass(p1).then(function () { toast('Contraseña actualizada. Exportá data.js para publicarla.'); render(); }).catch(function (x) { toast(x.message); });
      }
    }
  });
})(window);
