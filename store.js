/* La Súper Liga · store.js
   Estado de la liga, cálculos (tabla), persistencia y sincronización. Sin dependencias. */
(function (w) {
  'use strict';
  var LSL = w.LSL = w.LSL || {};
  var CFG = w.LSL_CONFIG || {};
  var K_DRAFT = 'lsl:draft', K_CACHE = 'lsl:cache', K_PREFS = 'lsl:prefs', K_AUTH = 'lsl:auth';

  /* ---------- almacenamiento seguro ---------- */
  var LS = LSL.ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  /* ---------- utilidades ---------- */
  var U = LSL.u = {
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    uid: function (p) { return (p || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    clone: function (o) { return JSON.parse(JSON.stringify(o)); },
    pad: function (n) { return n < 10 ? '0' + n : '' + n; },
    debounce: function (fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; },
    rgb: function (hex) {
      hex = String(hex || '#000').replace('#', '');
      if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
      var n = parseInt(hex, 16) || 0;
      return [n >> 16 & 255, n >> 8 & 255, n & 255];
    },
    hex: function (r, g, b) {
      return '#' + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    },
    lum: function (hex) { var c = U.rgb(hex); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; },
    mix: function (a, b, t) {
      var x = U.rgb(a), y = U.rgb(b);
      return U.hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
    },
    ink: function (hex) { return U.lum(hex) > 0.6 ? '#04101F' : '#FFFFFF'; },
    alpha: function (hex, a) { var c = U.rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; },
    hue: function (hex, deg) {
      var c = U.rgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), h = 0, s = 0, l = (mx + mn) / 2, d = mx - mn;
      if (d) {
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h /= 6;
      }
      h = (h + deg / 360 + 1) % 1;
      function f(p, q, t) { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
      if (!s) return U.hex(l * 255, l * 255, l * 255);
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      return U.hex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
    }
  };

  /* ---------- fechas (sin Intl: más rápido en celulares modestos) ---------- */
  var DS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var DL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var ML = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var tsCache = {};
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var T = LSL.t = {
    DS: DS, DL: DL, ML: ML, cap: cap,
    ts: function (s) { var v = tsCache[s]; if (v === undefined) { v = new Date(s).getTime(); if (isNaN(v)) v = 0; tsCache[s] = v; } return v; },
    time: function (ts) { var d = new Date(ts); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); },
    key: function (ts) { var d = new Date(ts); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); },
    day0: function (ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); },
    short: function (ts) { var d = new Date(ts); return cap(DS[d.getDay()]) + ' ' + d.getDate() + ' ' + MS[d.getMonth()]; },
    dm: function (ts) { var d = new Date(ts); return d.getDate() + ' ' + MS[d.getMonth()]; },
    long: function (ts) { var d = new Date(ts); return cap(DL[d.getDay()]) + ' ' + d.getDate() + ' de ' + ML[d.getMonth()]; },
    rel: function (ts) {
      var diff = Math.round((T.day0(ts) - T.day0(Date.now())) / 864e5);
      return diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : T.short(ts);
    },
    inLabel: function (ts) {
      var ms = ts - Date.now();
      if (ms <= 0) return '';
      var m = Math.round(ms / 6e4);
      if (m < 60) return 'Empieza en ' + m + ' min';
      var h = Math.floor(m / 60);
      if (h < 24) return 'Empieza en ' + h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
      var d = Math.round(ms / 864e5);
      return 'Faltan ' + d + (d === 1 ? ' día' : ' días');
    }
  };

  /* ---------- preferencias del dispositivo ---------- */
  LSL.prefs = LS.get(K_PREFS, {}) || {};
  LSL.savePrefs = function () { LS.set(K_PREFS, LSL.prefs); };

  /* ---------- estado por defecto ---------- */
  function defaults() {
    return {
      meta: { rev: 0, updatedAt: '', schema: 1 },
      league: { name: 'La Súper Liga', short: 'LSL', season: 'Temporada 1', seasonStatus: 'En curso', tagline: '', info: '', rules: '', pointsWin: 3, pointsDraw: 1, pointsLoss: 0, zoneTop: 0, zoneBottom: 0, logo: '' },
      design: { accent: '#27C4C9', accent2: '#FFD226', bg: 'navy', mode: 'dark', nav: 'floating', radius: 16, perf: 'auto' },
      features: { calendar: true, news: true, lineups: true, sanctions: true, channels: true },
      banner: { active: false, text: '' },
      teams: [], channels: [], matches: [], news: [], sanctions: []
    };
  }
  function normalize(s) {
    var d = defaults(); s = s || {};
    ['meta', 'league', 'design', 'features', 'banner'].forEach(function (k) { s[k] = Object.assign({}, d[k], s[k] || {}); });
    ['teams', 'channels', 'matches', 'news', 'sanctions'].forEach(function (k) { if (!Array.isArray(s[k])) s[k] = []; });
    return s;
  }
  LSL.normalize = normalize;

  /* ---------- SHA-256 para la contraseña local ---------- */
  LSL.sha = function (str) {
    if (!(w.crypto && w.crypto.subtle)) return Promise.reject(new Error('Abrí el sitio con https para usar la contraseña.'));
    return w.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    });
  };

  /* ---------- Store ---------- */
  var S = LSL.store = {
    state: null,
    mode: (CFG.supabaseUrl && CFG.supabaseAnonKey) ? 'cloud' : 'local',
    status: 'idle', statusMsg: '', hasDraft: false, dirty: false,
    _l: {}, _ix: null, _st: null, _sorted: null, _byDay: null, _remote: 0, _last: 0, _tm: null, _busy: false,

    on: function (ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); },
    emit: function (ev, a) { (this._l[ev] || []).forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); },

    init: function () {
      var seed = w.LSL_DATA || null, s;
      var stamp = function (o) { return (o && o.meta && o.meta.updatedAt) || ''; };
      if (this.mode === 'cloud') {
        var cache = LS.get(K_CACHE);
        s = cache && (!seed || stamp(cache) >= stamp(seed)) ? cache : seed;
      } else {
        var draft = LS.get(K_DRAFT);
        if (draft && (!seed || stamp(draft) > stamp(seed))) { s = draft; this.hasDraft = true; }
        else { s = seed; if (draft) LS.del(K_DRAFT); }
      }
      this.state = normalize(s ? U.clone(s) : null);
      this._reindex();
      return this;
    },

    _reindex: function () {
      var s = this.state, T = {}, C = {}, M = {};
      s.teams.forEach(function (t) { T[t.id] = t; });
      s.channels.forEach(function (c) { C[c.id] = c; });
      s.matches.forEach(function (m) { M[m.id] = m; });
      this._ix = { T: T, C: C, M: M };
      this._st = this._sorted = this._byDay = null;
    },
    team: function (id) { return this._ix.T[id] || null; },
    channel: function (id) { return this._ix.C[id] || null; },
    match: function (id) { return this._ix.M[id] || null; },
    news: function (id) { for (var i = 0; i < this.state.news.length; i++) if (this.state.news[i].id === id) return this.state.news[i]; return null; },

    sorted: function () {
      if (!this._sorted) this._sorted = this.state.matches.slice().sort(function (a, b) { return T.ts(a.date) - T.ts(b.date); });
      return this._sorted;
    },
    byDay: function () {
      if (!this._byDay) {
        var map = {};
        this.sorted().forEach(function (m) { var k = T.key(T.ts(m.date)); (map[k] = map[k] || []).push(m); });
        this._byDay = map;
      }
      return this._byDay;
    },
    isTeamUsed: function (id) { return this.state.matches.some(function (m) { return m.home === id || m.away === id; }); },

    /* Tabla de posiciones: se calcula sola con los partidos de Liga finalizados. */
    standings: function () {
      if (this._st) return this._st;
      var st = this.state, L = st.league, rows = {}, W = +L.pointsWin, D = +L.pointsDraw, Ls = +L.pointsLoss;
      if (isNaN(W)) W = 3; if (isNaN(D)) D = 1; if (isNaN(Ls)) Ls = 0;
      st.teams.forEach(function (t) { rows[t.id] = { id: t.id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: +t.adj || 0, form: [] }; });
      this.sorted().forEach(function (m) {
        if (m.status !== 'finished' || m.comp !== 'liga') return;
        var h = rows[m.home], a = rows[m.away]; if (!h || !a) return;
        var hs = +m.hs || 0, as = +m.as || 0;
        h.pj++; a.pj++; h.gf += hs; h.gc += as; a.gf += as; a.gc += hs;
        if (hs > as) { h.g++; a.p++; h.pts += W; a.pts += Ls; h.form.push('w'); a.form.push('l'); }
        else if (hs < as) { a.g++; h.p++; a.pts += W; h.pts += Ls; a.form.push('w'); h.form.push('l'); }
        else { h.e++; a.e++; h.pts += D; a.pts += D; h.form.push('d'); a.form.push('d'); }
      });
      var names = {}; st.teams.forEach(function (t) { names[t.id] = t.name || ''; });
      var arr = Object.keys(rows).map(function (k) { var r = rows[k]; r.dg = r.gf - r.gc; r.form = r.form.slice(-5); return r; });
      arr.sort(function (a, b) { return b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || (names[a.id] < names[b.id] ? -1 : 1); });
      return (this._st = arr);
    },

    /* ---------- cambios ---------- */
    commit: function (fn) {
      fn(this.state);
      var m = this.state.meta; m.rev = (m.rev || 0) + 1; m.updatedAt = new Date().toISOString();
      this._reindex();
      this._persist();
      this.emit('change', { local: true });
    },
    replace: function (ns) {
      this.state = normalize(ns);
      var m = this.state.meta; m.rev = (m.rev || 0) + 1; m.updatedAt = new Date().toISOString();
      this._reindex(); this._persist(); this.emit('change', { local: true });
    },
    setStatus: function (st, msg) { this.status = st; this.statusMsg = msg || ''; this.emit('sync'); },

    _persist: function () {
      var self = this;
      if (this.mode === 'cloud') {
        LS.set(K_CACHE, this.state);
        if (!C.sess()) return;
        this.dirty = true; this.setStatus('saving');
        clearTimeout(this._tm);
        this._tm = setTimeout(function () {
          C.push(self.state).then(function () { self.dirty = false; self.setStatus('ok'); })
            .catch(function (e) { self.setStatus('error', e.message); });
        }, 700);
      } else {
        var ok = LS.set(K_DRAFT, this.state);
        this.hasDraft = ok;
        this.setStatus(ok ? 'draft' : 'error', ok ? '' : 'No hay espacio en el dispositivo. Exportá y achicá las imágenes.');
      }
    },
    discardDraft: function () { LS.del(K_DRAFT); LS.del(K_CACHE); },

    /* Exportar / importar */
    exportJS: function () { return 'window.LSL_DATA = ' + JSON.stringify(this.state) + ';\n'; },
    parseImport: function (text) {
      var i = text.indexOf('{'), j = text.lastIndexOf('}');
      if (i < 0 || j < i) throw new Error('El archivo no tiene datos válidos.');
      var o = JSON.parse(text.slice(i, j + 1));
      if (!Array.isArray(o.teams) || !Array.isArray(o.matches)) throw new Error('Faltan equipos o partidos en el archivo.');
      return o;
    },

    /* Contraseña local del panel (modo local) */
    checkPass: function (p) {
      var a = this.state.admin;
      if (!a || !a.hash) return Promise.resolve(p === 'superliga');
      return LSL.sha((a.salt || '') + p).then(function (h) { return h === a.hash; });
    },
    usingDefaultPass: function () { var a = this.state.admin; return !a || !a.hash; },
    setPass: function (p) {
      var salt = U.uid('s');
      return LSL.sha(salt + p).then(function (h) { S.commit(function (st) { st.admin = { salt: salt, hash: h }; }); });
    },

    /* Sincronización periódica (solo modo nube) */
    refresh: function (force) {
      if (this.mode !== 'cloud' || this.dirty || this._busy) return Promise.resolve(false);
      var self = this; this._busy = true;
      return C.fetchState().then(function (row) {
        self._busy = false; self._last = Date.now();
        if (!row || !row.data || !Array.isArray(row.data.teams)) return false;
        var stamp = Date.parse(row.updated_at) || 0;
        if (!force && stamp === self._remote) return false;
        self._remote = stamp;
        self.state = normalize(row.data); self._reindex();
        LS.set(K_CACHE, self.state);
        self.emit('change', { remote: true });
        return true;
      }).catch(function () { self._busy = false; return false; });
    },
    startPolling: function () {
      if (this.mode !== 'cloud') return;
      var self = this, sec = (CFG.pollSeconds || 30) * 1000;
      setInterval(function () {
        if (document.hidden) return;
        var live = self.state.matches.some(function (m) { return m.status === 'live' || m.status === 'paused'; });
        if (Date.now() - self._last >= (live ? sec : sec * 4)) self.refresh();
      }, 10000);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden && Date.now() - self._last > 20000) self.refresh();
      });
      this.refresh();
    }
  };

  /* ---------- Supabase (REST directo, sin librería: menos peso) ---------- */
  var base = (CFG.supabaseUrl || '').replace(/\/+$/, ''), key = CFG.supabaseAnonKey || '';
  var C = S.cloud = {
    sess: function () { return LS.get(K_AUTH); },
    fetchState: function () {
      return fetch(base + '/rest/v1/lsl_state?id=eq.1&select=data,updated_at', { headers: { apikey: key } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (rows) { return rows && rows[0] || null; });
    },
    login: function (email, pass) {
      return fetch(base + '/auth/v1/token?grant_type=password', {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: pass })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) throw new Error(j.error_description || j.msg || 'Email o contraseña incorrectos.');
          LS.set(K_AUTH, { a: j.access_token, r: j.refresh_token, e: Date.now() + (j.expires_in || 3600) * 1000 });
          return true;
        });
      });
    },
    token: function () {
      var s = C.sess();
      if (!s) return Promise.reject(new Error('Sesión vencida. Volvé a entrar al panel.'));
      if (s.e - Date.now() > 60000) return Promise.resolve(s.a);
      return fetch(base + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.r })
      }).then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok) { LS.del(K_AUTH); throw new Error('Sesión vencida. Volvé a entrar al panel.'); }
          LS.set(K_AUTH, { a: j.access_token, r: j.refresh_token, e: Date.now() + (j.expires_in || 3600) * 1000 });
          return j.access_token;
        });
      });
    },
    logout: function () { LS.del(K_AUTH); },
    push: function (state) {
      return C.token().then(function (tok) {
        var stamp = new Date();
        return fetch(base + '/rest/v1/lsl_state?on_conflict=id', {
          method: 'POST',
          headers: { apikey: key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ id: 1, data: state, updated_at: stamp.toISOString() })
        }).then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('No se pudo publicar (' + r.status + '). ' + t.slice(0, 100)); });
          S._remote = stamp.getTime();
        });
      });
    }
  };
})(window);
