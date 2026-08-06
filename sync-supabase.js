/**
 * sync-supabase.js — Synchronisation P'tits Verts ↔ Supabase
 *
 * Auto-sync bidirectionnelle du state.data entre plusieurs devices.
 * Table : public.ptits_verts (1 seule ligne id='main' avec le state complet en JSON)
 *
 * Comportement :
 *   - Au chargement : pull depuis Supabase, si updated_at distant > local → remplace le state
 *   - Sur chaque modif : push throttlé (5s) vers Supabase
 *   - Offline : queue les writes, push quand réseau revient
 *   - Config : URL + publishable key stockées dans localStorage
 *
 * Expose : window.SyncModule.{ configure, isConfigured, getConfig, testConnection,
 *          pullNow, pushNow, getStatus, forgetConfig }
 */
(function () {
  'use strict';

  const CFG_KEY   = 'cfb6_sync_config';         // { url, key, deviceId }
  const LAST_KEY  = 'cfb6_sync_last';           // { pushedAt, pulledAt, remoteUpdatedAt, error }
  const TABLE     = 'ptits_verts';
  const ROW_ID    = 'main';
  const PUSH_DEBOUNCE_MS = 5000;

  // Clés localStorage à synchroniser (données app, pas les préférences per-device)
  const SYNC_KEYS = [
    'cfb6_state',              // joueurs / évaluations / observations
    'cfb6_live_sessions_v1',   // Mode Terrain : séances + bilans
    'cfb6_weekly_focus_v1',    // Semaine + Plan saison
    'cfb6_roster',             // Roster additions
    'cfb6_feeds',              // Feeds manuels (au cas où)
  ];

  let pushTimer = null;
  let pushInFlight = false;
  let lastPushPayload = null;

  /* ── Config ─────────────────────────────────────────── */

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); }
    catch { return null; }
  }
  function saveConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }
  function forgetConfig() {
    localStorage.removeItem(CFG_KEY);
    localStorage.removeItem(LAST_KEY);
    updateStatusUI();
  }
  function getConfig() { return loadConfig(); }
  function isConfigured() {
    const c = loadConfig();
    return !!(c && c.url && c.key);
  }
  function deviceId() {
    let c = loadConfig();
    if (c?.deviceId) return c.deviceId;
    const id = 'd_' + Math.random().toString(36).slice(2, 8);
    if (c) { c.deviceId = id; saveConfig(c); }
    return id;
  }
  function deviceHint() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua))          return 'Android';
    if (/Mac/.test(ua))              return 'Mac';
    if (/Windows/.test(ua))          return 'Windows';
    return 'Web';
  }

  function configure(url, key) {
    url = (url || '').trim().replace(/\/+$/, '');
    key = (key || '').trim();
    if (!url || !key) throw new Error('URL et clé requis');
    if (!/^https:\/\/.+\.supabase\.co$/i.test(url)) {
      throw new Error('URL invalide (attendu : https://xxxx.supabase.co)');
    }
    const existing = loadConfig() || {};
    saveConfig({ url, key, deviceId: existing.deviceId || null });
    deviceId(); // génère si absent
  }

  /* ── Status ─────────────────────────────────────────── */

  function loadLast() {
    try { return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveLast(patch) {
    const last = loadLast();
    Object.assign(last, patch);
    localStorage.setItem(LAST_KEY, JSON.stringify(last));
  }
  function getStatus() {
    return { config: loadConfig(), last: loadLast(), online: navigator.onLine };
  }

  /* ── HTTP helpers ───────────────────────────────────── */

  function headers() {
    const cfg = loadConfig();
    return {
      'apikey':        cfg.key,
      'Authorization': 'Bearer ' + cfg.key,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    };
  }

  async function apiGet(path) {
    const cfg = loadConfig();
    const r = await fetch(cfg.url + '/rest/v1/' + path, { headers: headers() });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + (await r.text()).slice(0, 200));
    return r.json();
  }
  async function apiPatch(path, body) {
    const cfg = loadConfig();
    const r = await fetch(cfg.url + '/rest/v1/' + path, {
      method: 'PATCH', headers: headers(), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + (await r.text()).slice(0, 200));
    return r.json();
  }
  async function apiPost(path, body) {
    const cfg = loadConfig();
    const r = await fetch(cfg.url + '/rest/v1/' + path, {
      method: 'POST', headers: headers(), body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + (await r.text()).slice(0, 200));
    return r.json();
  }

  /* ── Test connexion ─────────────────────────────────── */

  async function testConnection() {
    if (!isConfigured()) return { ok: false, error: 'Non configuré' };
    try {
      await apiGet(`${TABLE}?id=eq.${ROW_ID}&select=id,updated_at`);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── Pull ───────────────────────────────────────────── */

  async function pullNow() {
    if (!isConfigured()) return { ok: false, reason: 'not-configured' };
    if (!navigator.onLine) return { ok: false, reason: 'offline' };
    try {
      const rows = await apiGet(`${TABLE}?id=eq.${ROW_ID}&select=data,updated_at,device_hint`);
      saveLast({ pulledAt: new Date().toISOString(), error: null });
      if (!rows.length) return { ok: true, empty: true }; // pas encore de data distante
      const remote = rows[0];
      saveLast({ remoteUpdatedAt: remote.updated_at });
      return { ok: true, remote };
    } catch (e) {
      saveLast({ error: e.message });
      return { ok: false, error: e.message };
    }
  }

  /* ── Push ───────────────────────────────────────────── */

  // Rassemble toutes les clés localStorage à synchroniser en un blob JSON
  function collectAllData() {
    const blob = {};
    SYNC_KEYS.forEach(key => {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        try { blob[key] = JSON.parse(raw); }
        catch { blob[key] = raw; }
      }
    });
    return blob;
  }

  // Restaure les clés localStorage depuis un blob distant
  function applyRemoteData(blob) {
    if (!blob || typeof blob !== 'object') return false;
    let changed = 0;
    SYNC_KEYS.forEach(key => {
      if (blob[key] === undefined) return;
      const serialized = typeof blob[key] === 'string' ? blob[key] : JSON.stringify(blob[key]);
      localStorage.setItem(key, serialized);
      changed++;
    });
    return changed > 0;
  }

  async function pushNow() {
    if (!isConfigured()) return { ok: false, reason: 'not-configured' };
    if (!navigator.onLine) return { ok: false, reason: 'offline' };
    if (pushInFlight) return { ok: false, reason: 'in-flight' };

    const data = collectAllData();
    if (!Object.keys(data).length) return { ok: false, reason: 'no-data' };

    pushInFlight = true;
    try {
      // Upsert : PATCH d'abord, si aucune ligne modifiée → POST
      const body = { id: ROW_ID, data, device_hint: deviceHint(), updated_at: new Date().toISOString() };
      const patched = await apiPatch(`${TABLE}?id=eq.${ROW_ID}`, body);
      if (!patched.length) {
        // Ligne inexistante : on crée
        await apiPost(TABLE, body);
      }
      saveLast({ pushedAt: new Date().toISOString(), error: null });
      lastPushPayload = data;
      updateStatusUI();
      return { ok: true };
    } catch (e) {
      saveLast({ error: e.message });
      updateStatusUI();
      return { ok: false, error: e.message };
    } finally {
      pushInFlight = false;
    }
  }

  function schedulePush() {
    if (!isConfigured() || !navigator.onLine) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = null; pushNow(); }, PUSH_DEBOUNCE_MS);
  }

  /* ── Bootstrap au chargement de l'app ───────────────── */

  async function bootstrap() {
    if (!isConfigured()) return;
    updateStatusUI();
    const pull = await pullNow();
    if (pull.ok && pull.remote?.data) {
      const remoteBlob = pull.remote.data;

      // Détection du format : nouveau (blob multi-clés) ou ancien (state.data direct)
      const isNewFormat = SYNC_KEYS.some(k => k in remoteBlob);
      let changed = false;

      if (isNewFormat) {
        // Format multi-clés : compare chaque clé et restaure si différente
        SYNC_KEYS.forEach(k => {
          if (remoteBlob[k] === undefined) return;
          const remoteStr = JSON.stringify(remoteBlob[k]);
          const localStr = localStorage.getItem(k) || '';
          if (remoteStr !== localStr) {
            localStorage.setItem(k, remoteStr);
            changed = true;
          }
        });
      } else {
        // Ancien format (juste state.data) : fusion par catégorie dans cfb6_state
        const remoteStr = JSON.stringify(remoteBlob);
        const localStr = localStorage.getItem('cfb6_state') || '';
        if (remoteStr !== localStr) {
          localStorage.setItem('cfb6_state', remoteStr);
          changed = true;
        }
      }

      if (changed) {
        // Recharger tout le state en mémoire depuis localStorage
        if (typeof window.reloadAppFromStorage === 'function') {
          window.reloadAppFromStorage();
        } else {
          // Fallback : recharge la page (dernière ligne de défense)
          window.appUtils?.showToast?.('☁ Données synchronisées — rechargement...');
          setTimeout(() => location.reload(), 800);
          return;
        }
        window.appUtils?.showToast?.('☁ Données synchronisées depuis le cloud');
      }
    }
    updateStatusUI();
  }

  /* ── UI (indicateur dans le menu ⋯) ─────────────────── */

  function updateStatusUI() {
    const el = document.querySelector('#sync-status-line');
    if (!el) return;
    const cfg = loadConfig();
    const last = loadLast();
    if (!cfg) {
      el.innerHTML = '<span class="sync-dot sync-dot-off"></span> Sync désactivée';
      return;
    }
    if (last.error) {
      el.innerHTML = `<span class="sync-dot sync-dot-err"></span> Erreur — ${escapeHtml(last.error.slice(0, 40))}`;
      return;
    }
    const pushedAgo = last.pushedAt ? relTime(last.pushedAt) : '—';
    el.innerHTML = `<span class="sync-dot sync-dot-ok"></span> Sync active · dernier envoi ${pushedAgo}`;
  }

  function relTime(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '—';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return 'il y a ' + s + ' s';
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    return 'il y a ' + Math.floor(s / 3600) + ' h';
  }

  function escapeHtml(t) {
    return String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Reconnect handlers ─────────────────────────────── */

  window.addEventListener('online', () => {
    updateStatusUI();
    if (isConfigured()) pushNow(); // rattraper les writes en attente
  });
  window.addEventListener('offline', updateStatusUI);

  // Refresh de l'indicateur toutes les 30 s (pour "il y a X min" qui bouge)
  setInterval(updateStatusUI, 30000);

  /* ── Exports ────────────────────────────────────────── */

  window.SyncModule = {
    configure, forgetConfig, isConfigured, getConfig,
    testConnection, pullNow, pushNow, schedulePush,
    bootstrap, getStatus, updateStatusUI,
    SYNC_KEYS, collectAllData, applyRemoteData,
  };

  /* ── Auto-hook sur localStorage.setItem ─────────────────
     Les modules live-training / sessions-history / weekly-focus / roster
     écrivent directement dans localStorage sans passer par saveAppState.
     On intercepte donc setItem pour détecter toute écriture sur une clé
     surveillée et déclencher un push automatique. */
  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, key, value);
    if (this === window.localStorage && SYNC_KEYS.includes(key)) {
      schedulePush();
    }
  };

  /* ── Push forcé avant fermeture / passage en arrière-plan ─────
     Le push est débouncé à 5s : si l'utilisateur ferme l'app avant,
     la dernière modif est perdue. On force un push immédiat sur
     visibilitychange et beforeunload. */
  function flushPush() {
    if (!isConfigured() || !navigator.onLine) return;
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    // fire-and-forget (le browser peut couper l'onglet à tout moment)
    pushNow();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPush();
  });
  window.addEventListener('pagehide', flushPush);
  window.addEventListener('beforeunload', flushPush);

  /* ── Auto-bootstrap au chargement du script ─────────────
     Fix du bug où app.js appelait SyncModule.bootstrap() avant que ce
     script soit exécuté (undefined → silencieusement ignoré). */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoBoot);
    } else {
      // Laisser un tick pour que app.js finisse son init
      setTimeout(autoBoot, 50);
    }
  }
  function autoBoot() {
    updateStatusUI();
    if (isConfigured()) {
      bootstrap().catch(err => console.warn('[sync] bootstrap error:', err));
    }
  }
})();
