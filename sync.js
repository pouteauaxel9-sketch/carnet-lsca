/**
 * sync.js — Synchronisation multi-coach via Supabase
 *
 * Synchronise des "blobs" JSON localStorage entre les éducateurs d'un
 * même club via la table app_state de Supabase.
 *
 * Clés synchronisées (déclarées dans SYNC_KEYS) :
 *   - cfb6_weekly_focus_v1  → storage_key 'weekly_focus'
 *   - cfb6_injury           → storage_key 'injury'
 *   - cfb6_attendance       → storage_key 'attendance'
 *
 * Stratégie :
 *   1. Au boot, pull chaque clé depuis Supabase. Si remote.updated_at > local
 *      saveTime, on remplace localStorage. Sinon on push local vers remote.
 *   2. À chaque save local (interception de setItem), on push après debounce.
 *   3. Polling toutes les 30s pour pull les changements des autres coachs.
 *
 * Configuration : nécessite window.SUPABASE_CONFIG.url + anonKey + clubCode.
 *   La config peut aussi être surchargée dans localStorage 'cfb6_sync_config'
 *   (utile pour l'utilisateur sans toucher au code).
 *
 * Expose : window.SyncModule.{ pull, push, status, setConfig, isEnabled }
 */
(function () {
  'use strict';

  /* ── Clés synchronisées ────────────────────────────── */

  const SYNC_KEYS = [
    { local: 'cfb6_weekly_focus_v1', remote: 'weekly_focus' },
    { local: 'cfb6_injury',          remote: 'injury' },
    { local: 'cfb6_attendance',      remote: 'attendance' },
  ];

  const POLL_INTERVAL_MS = 30000;
  const PUSH_DEBOUNCE_MS = 1500;
  const LOCAL_META_KEY = 'cfb6_sync_meta';        // { [storage_key]: { updated_at } }
  const CONFIG_OVERRIDE_KEY = 'cfb6_sync_config'; // { url, anonKey, clubCode }

  /* ── État courant ──────────────────────────────────── */

  let syncStatus = 'off';   // 'off' | 'on' | 'pending' | 'error'
  let lastError = '';
  let pollTimer = null;
  let pushTimers = {};      // debounce par clé
  let originalSetItem = null;
  let pulledOnce = false;

  /* ── Helpers ───────────────────────────────────────── */

  function getConfig() {
    let config = window.SUPABASE_CONFIG || {};
    try {
      const override = JSON.parse(localStorage.getItem(CONFIG_OVERRIDE_KEY) || 'null');
      if (override && typeof override === 'object') config = { ...config, ...override };
    } catch {}
    return config;
  }

  function isEnabled() {
    const c = getConfig();
    return Boolean(c.url && c.anonKey && c.clubCode);
  }

  function getMeta() {
    try { return JSON.parse(localStorage.getItem(LOCAL_META_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function setMeta(meta) {
    try { localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta)); } catch {}
  }
  function bumpMeta(remoteKey, ts) {
    const m = getMeta();
    m[remoteKey] = { updated_at: ts || new Date().toISOString() };
    setMeta(m);
  }

  function coachName() {
    return window.EducatorModule?.getEducatorName?.() || 'Coach inconnu';
  }

  function setStatus(s, err) {
    syncStatus = s;
    lastError = err || '';
    notifyListeners();
  }

  /* ── Listeners status ──────────────────────────────── */

  const listeners = [];
  function onStatusChange(cb) { listeners.push(cb); }
  function notifyListeners() {
    listeners.forEach(cb => { try { cb({ status: syncStatus, error: lastError }); } catch {} });
  }

  /* ── HTTP wrappers ─────────────────────────────────── */

  async function supaRequest(method, path, body) {
    const config = getConfig();
    if (!config.url || !config.anonKey) throw new Error('Supabase non configuré');
    const url = config.url.replace(/\/$/, '') + '/rest/v1/' + path;
    const headers = {
      apikey: config.anonKey,
      Authorization: 'Bearer ' + config.anonKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    };
    const opts = { method, headers };
    if (body != null) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
    }
    if (r.status === 204) return null;
    return r.json().catch(() => null);
  }

  /* ── Pull / Push d'une clé ─────────────────────────── */

  async function pullOne(entry) {
    const config = getConfig();
    const rows = await supaRequest(
      'GET',
      `app_state?select=payload,updated_at,updated_by&club_code=eq.${encodeURIComponent(config.clubCode)}&storage_key=eq.${encodeURIComponent(entry.remote)}&limit=1`
    );
    if (!rows || !rows.length) return null;
    return rows[0]; // { payload, updated_at, updated_by }
  }

  async function pushOne(entry) {
    const config = getConfig();
    let local = null;
    try { local = JSON.parse(localStorage.getItem(entry.local) || 'null'); } catch {}
    if (local == null) return;
    const ts = new Date().toISOString();
    await supaRequest('POST', 'app_state?on_conflict=club_code,storage_key', [{
      club_code: config.clubCode,
      storage_key: entry.remote,
      payload: local,
      updated_by: coachName(),
      updated_at: ts,
    }]);
    bumpMeta(entry.remote, ts);
  }

  /* ── Pull global ───────────────────────────────────── */

  async function pull() {
    if (!isEnabled()) { setStatus('off'); return; }
    setStatus('pending');
    try {
      for (const entry of SYNC_KEYS) {
        const remote = await pullOne(entry);
        if (!remote) continue;
        const meta = getMeta();
        const localTs = meta[entry.remote]?.updated_at;
        // Si pas de meta locale, ou si remote plus récent → on écrase local
        if (!localTs || new Date(remote.updated_at) > new Date(localTs)) {
          const payloadStr = JSON.stringify(remote.payload || {});
          // Bypass our interceptor pour ne pas re-push
          if (originalSetItem) originalSetItem.call(localStorage, entry.local, payloadStr);
          else localStorage.setItem(entry.local, payloadStr);
          bumpMeta(entry.remote, remote.updated_at);
        }
      }
      pulledOnce = true;
      setStatus('on');
      // Forcer un re-render léger pour refléter les changements
      window.appUtils?.renderAll?.();
    } catch (err) {
      console.warn('[sync] pull failed', err);
      setStatus('error', err.message);
    }
  }

  /* ── Push global ───────────────────────────────────── */

  async function push() {
    if (!isEnabled()) { setStatus('off'); return; }
    setStatus('pending');
    try {
      for (const entry of SYNC_KEYS) {
        await pushOne(entry);
      }
      setStatus('on');
    } catch (err) {
      console.warn('[sync] push failed', err);
      setStatus('error', err.message);
    }
  }

  async function pushKey(localKey) {
    const entry = SYNC_KEYS.find(e => e.local === localKey);
    if (!entry || !isEnabled()) return;
    try {
      await pushOne(entry);
      setStatus('on');
    } catch (err) {
      console.warn('[sync] pushKey failed', err);
      setStatus('error', err.message);
    }
  }

  /* ── Interception localStorage.setItem ─────────────── */

  function installInterceptor() {
    if (originalSetItem) return;
    originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);
      const entry = SYNC_KEYS.find(e => e.local === key);
      if (entry && pulledOnce && isEnabled()) {
        // Debounce
        if (pushTimers[key]) clearTimeout(pushTimers[key]);
        pushTimers[key] = setTimeout(() => {
          pushKey(key);
          pushTimers[key] = null;
        }, PUSH_DEBOUNCE_MS);
      }
    };
  }

  /* ── Polling ───────────────────────────────────────── */

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => { pull(); }, POLL_INTERVAL_MS);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  /* ── Boot ──────────────────────────────────────────── */

  async function start() {
    if (!isEnabled()) { setStatus('off'); return; }
    installInterceptor();
    await pull();
    startPolling();
  }

  function setConfig(cfg) {
    const cur = (() => { try { return JSON.parse(localStorage.getItem(CONFIG_OVERRIDE_KEY) || '{}'); } catch { return {}; } })();
    const next = { ...cur, ...cfg };
    localStorage.setItem(CONFIG_OVERRIDE_KEY, JSON.stringify(next));
    // Restart
    stopPolling();
    pulledOnce = false;
    setStatus('off');
    setTimeout(() => start(), 100);
  }

  function getCurrentConfig() {
    const c = getConfig();
    return {
      url: c.url || '',
      anonKey: c.anonKey ? (c.anonKey.slice(0, 8) + '...' + c.anonKey.slice(-4)) : '',
      anonKeyFull: c.anonKey || '',
      clubCode: c.clubCode || '',
      enabled: isEnabled(),
    };
  }

  function status() {
    return { status: syncStatus, error: lastError, enabled: isEnabled(), config: getCurrentConfig() };
  }

  /* ── Boot auto ─────────────────────────────────────── */

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(start, 800));
    } else {
      setTimeout(start, 800);
    }
  }

  window.SyncModule = {
    pull, push, pushKey, status, setConfig, getCurrentConfig,
    isEnabled, onStatusChange, start,
    SYNC_KEYS,
  };
})();
