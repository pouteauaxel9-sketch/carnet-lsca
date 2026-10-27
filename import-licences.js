/**
 * import-licences.js — Import PDF licences FFF (FootClubs)
 *
 * Lit un PDF export "Liste licences matchs" du FootClubs et crée/enrichit
 * les joueurs dans le roster. Détection auto des doublons par nom normalisé.
 *
 * Expose : window.ImportLicencesModule.{ openModal, closeModal, handleAction }
 */
(function () {
  'use strict';

  const PDFJS_SRC    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function h(t) {
    return String(t ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const utils  = () => window.appUtils;
  const state  = () => window.appState;
  const roster = () => window.RosterModule;
  const JDATA  = () => window.JDATA || {};

  /* ── Chargement pdf.js on-demand ────────────────────────── */

  let pdfjsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDFJS_SRC;
      s.onload = () => {
        if (!window.pdfjsLib) return reject(new Error('pdf.js chargé mais pdfjsLib absent'));
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => reject(new Error('Impossible de charger pdf.js depuis le CDN'));
      document.head.appendChild(s);
    });
    return pdfjsPromise;
  }

  /* ── Parsing PDF ────────────────────────────────────────── */

  async function extractText(file) {
    const pdfjsLib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let full = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Reconstitue les lignes en groupant par Y approximatif
      const lines = {};
      content.items.forEach(it => {
        if (!it.transform) return;
        const y = Math.round(it.transform[5]);
        if (!lines[y]) lines[y] = [];
        lines[y].push({ x: it.transform[4], str: it.str });
      });
      const ys = Object.keys(lines).map(Number).sort((a, b) => b - a);
      ys.forEach(y => {
        const row = lines[y].sort((a, b) => a.x - b.x).map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
        if (row) full += row + '\n';
      });
      full += '\n';
    }
    return full;
  }

  // Détecte la catégorie app depuis le libellé FFF
  // U6/U7/U8/U9 → u9 ; U10/U11 → u11 ; U12/U13 → u13 ; sinon null
  function mapCategory(fffLabel) {
    const m = String(fffLabel || '').match(/U\s*(\d{1,2})/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (n <= 9)  return 'u9';
    if (n <= 11) return 'u11';
    if (n <= 13) return 'u13';
    return null;
  }

  // Convertit JJ/MM/AAAA → AAAA-MM-JJ (format <input type=date>)
  function toIsoDate(fr) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(fr || '').trim());
    if (!m) return '';
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  // Sépare "UGO TESSE Arthur" en { nom: "UGO TESSE", prenom: "Arthur" }
  // Règle : les mots en MAJUSCULES successifs = NOM, le reste = Prénom
  function splitName(full) {
    const parts = String(full || '').trim().split(/\s+/);
    const nom = [];
    const prenom = [];
    let inPrenom = false;
    for (const w of parts) {
      // Un mot est "majuscule" s'il est en caps et sans minuscules (hors accents)
      const isUpper = w === w.toUpperCase() && /[A-ZÀ-ÜŸ]/.test(w);
      if (!inPrenom && isUpper) nom.push(w);
      else { inPrenom = true; prenom.push(w); }
    }
    return {
      nom: nom.join(' '),
      prenom: prenom.join(' '),
    };
  }

  // Normalise pour comparaison (dédup) : minuscules, sans accents, sans espace
  function normalizeName(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Parse une ligne de licence FFF
  // Format : "NOM Prénom(s)   JJ/MM/AAAA  F|M  LICENCE_9+chiffres  LIBELLE_CAT  JJ/MM/AAAA  Validée|..."
  // Exemple : "BLAIN Eloan 18/03/2016 F 9603948655 Libre / U11 (- 11 ans) 01/07/2026 Validée"
  const LINE_RE = /^(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+([FM])\s+(\d{9,})\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s*$/;

  function parseLines(fullText) {
    const out = [];
    const seenLicences = new Set();
    fullText.split('\n').forEach(line => {
      const m = LINE_RE.exec(line.trim());
      if (!m) return;
      const [, rawName, naisFr, sexe, licence, catFff] = m;
      if (seenLicences.has(licence)) return;
      seenLicences.add(licence);
      const { nom, prenom } = splitName(rawName);
      const cat = mapCategory(catFff);
      if (!cat) return; // catégorie inconnue → on ignore
      out.push({
        rawName: (nom + ' ' + prenom).trim(),
        nom, prenom,
        naissance: toIsoDate(naisFr),
        licence,
        sexe,
        catFff: catFff.trim(),
        cat,
      });
    });
    return out;
  }

  /* ── Matching & import ─────────────────────────────────── */

  // Cherche un joueur existant dans TOUS les rosters, par nom normalisé
  function findExistingPlayer(parsed) {
    const target = normalizeName(parsed.nom + ' ' + parsed.prenom);
    const altTarget = normalizeName(parsed.prenom + ' ' + parsed.nom);
    const altLicence = parsed.licence;
    const jdata = JDATA();
    const data = state()?.data || {};

    // Priorité 1 : match par n° de licence (le plus fiable)
    if (altLicence) {
      for (const cat of Object.keys(jdata)) {
        const list = jdata[cat]?.players || [];
        for (const p of list) {
          const lic = data?.[cat]?.[p.name]?.profil?.licence;
          if (lic && lic.trim() === altLicence) return { cat, pid: p.name };
        }
      }
    }

    // Priorité 2 : match par nom normalisé
    for (const cat of Object.keys(jdata)) {
      const list = jdata[cat]?.players || [];
      for (const p of list) {
        const norm = normalizeName(p.name);
        if (norm === target || norm === altTarget) return { cat, pid: p.name };
      }
    }
    return null;
  }

  // Enrichit un joueur existant sans écraser les champs déjà remplis
  function enrichPlayer(cat, pid, parsed) {
    const s = state();
    if (!s?.data) return { enriched: 0 };
    if (!s.data[cat]) s.data[cat] = {};
    if (!s.data[cat][pid]) s.data[cat][pid] = {};
    if (!s.data[cat][pid].profil) {
      s.data[cat][pid].profil = window.defaultProfile
        ? window.defaultProfile()
        : { nom: '', prenom: '', licence: '', naissance: '' };
    }
    const prof = s.data[cat][pid].profil;
    let enriched = 0;
    const setIfEmpty = (key, val) => {
      if (!val) return;
      if (!prof[key] || String(prof[key]).trim() === '') {
        prof[key] = val;
        enriched++;
      }
    };
    setIfEmpty('nom', parsed.nom);
    setIfEmpty('prenom', parsed.prenom);
    setIfEmpty('naissance', parsed.naissance);
    setIfEmpty('licence', parsed.licence);
    return { enriched };
  }

  // Crée un joueur (via RosterModule) + remplit son profil
  function createPlayer(parsed) {
    const r = roster()?.addPlayer(parsed.cat, parsed.rawName);
    if (!r?.ok) return { created: false, msg: r?.msg || 'Création échouée' };
    enrichPlayer(parsed.cat, parsed.rawName, parsed);
    return { created: true };
  }

  // Lance l'import complet : pour chaque joueur parsé, créer ou enrichir
  function runImport(parsedList) {
    const result = {
      created: [],   // [{ cat, name }]
      enriched: [],  // [{ cat, name, nbFields }]
      skipped: [],   // [{ cat, name, reason }]
    };
    parsedList.forEach(p => {
      const existing = findExistingPlayer(p);
      if (existing) {
        const r = enrichPlayer(existing.cat, existing.pid, p);
        if (r.enriched > 0) {
          result.enriched.push({ cat: existing.cat, name: existing.pid, nbFields: r.enriched });
        } else {
          result.skipped.push({ cat: existing.cat, name: existing.pid, reason: 'déjà complet' });
        }
      } else {
        const r = createPlayer(p);
        if (r.created) result.created.push({ cat: p.cat, name: p.rawName });
        else result.skipped.push({ cat: p.cat, name: p.rawName, reason: r.msg });
      }
    });
    utils()?.saveAppState?.();
    return result;
  }

  /* ── UI ─────────────────────────────────────────────────── */

  let modal = null;
  // modal = { stage: 'pick' | 'preview' | 'done',
  //           file?: File, parsed?: [...], result?: {...}, error?: string }

  function render() {
    let el = document.querySelector('#import-licences-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'import-licences-root';
      document.body.appendChild(el);
    }
    el.innerHTML = modal ? renderOverlay() : '';
  }

  function renderOverlay() {
    const body = modal.stage === 'preview' ? renderPreview()
               : modal.stage === 'done'    ? renderDone()
               : renderPick();
    return `
      <div class="modal-overlay" data-import-overlay>
        <div class="modal-box" style="max-width:720px;max-height:85vh;display:flex;flex-direction:column">
          <div class="modal-head">
            <div>
              <div class="card-kicker">Effectif</div>
              <h3>📁 Importer un PDF de licences FFF</h3>
            </div>
            <button class="modal-close" type="button" data-import-action="close">×</button>
          </div>
          ${body}
        </div>
      </div>`;
  }

  function renderPick() {
    return `
      <div class="import-body" style="padding:20px;overflow-y:auto">
        <p style="margin:0 0 12px">
          Sélectionne le PDF <em>« Liste licences matchs »</em> exporté depuis FootClubs.
        </p>
        <ul style="font-size:13px;color:#64748b;margin:0 0 16px;padding-left:20px;line-height:1.6">
          <li>Les joueurs <strong>déjà présents sont détectés automatiquement</strong> (par n° de licence puis par nom)</li>
          <li>Les champs <strong>vides</strong> sont remplis (nom, prénom, date de naissance, licence)</li>
          <li>Les champs <strong>que tu as déjà saisis ne sont jamais écrasés</strong></li>
          <li>Catégorie auto depuis le libellé FFF (<em>U8/U9 → U9, U10/U11 → U11, U12/U13 → U13</em>)</li>
        </ul>
        <input type="file" accept="application/pdf" id="import-licences-file"
               style="display:block;width:100%;padding:12px;border:2px dashed #cbd5e1;border-radius:8px"
               data-import-action="file-picked">
        ${modal.error ? `<p class="danger" style="color:#dc2626;margin-top:12px">${h(modal.error)}</p>` : ''}
        ${modal.loading ? `<p style="margin-top:12px">⏳ Lecture du PDF en cours…</p>` : ''}
      </div>
      <div class="modal-footer">
        <span style="flex:1"></span>
        <button class="btn-ghost" type="button" data-import-action="close">Annuler</button>
      </div>`;
  }

  function renderPreview() {
    const list = modal.parsed || [];
    const byCat = { u9: [], u11: [], u13: [] };
    list.forEach(p => { (byCat[p.cat] || (byCat[p.cat] = [])).push(p); });
    const catOrder = ['u9', 'u11', 'u13'];
    const CAT_LABELS = window.CAT_LABELS || { u9: 'U9', u11: 'U11', u13: 'U13' };
    return `
      <div class="import-body" style="padding:16px 20px;overflow-y:auto;flex:1">
        <p style="margin:0 0 12px"><strong>${list.length} joueur${list.length > 1 ? 's' : ''}</strong> détecté${list.length > 1 ? 's' : ''} dans le PDF.</p>
        ${catOrder.map(cat => {
          const arr = byCat[cat];
          if (!arr || !arr.length) return '';
          return `
            <details ${arr.length <= 20 ? 'open' : ''} style="margin:12px 0">
              <summary style="cursor:pointer;font-weight:600;padding:8px 0">
                ${h(CAT_LABELS[cat] || cat.toUpperCase())} — ${arr.length} joueur${arr.length > 1 ? 's' : ''}
              </summary>
              <table class="import-table" style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
                <thead><tr>
                  <th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0">Nom Prénom</th>
                  <th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0">Naissance</th>
                  <th style="text-align:left;padding:6px;border-bottom:1px solid #e2e8f0">Licence</th>
                </tr></thead>
                <tbody>
                  ${arr.map(p => `
                    <tr>
                      <td style="padding:6px;border-bottom:1px solid #f1f5f9">${h(p.rawName)}</td>
                      <td style="padding:6px;border-bottom:1px solid #f1f5f9">${h(p.naissance || '—')}</td>
                      <td style="padding:6px;border-bottom:1px solid #f1f5f9;font-family:monospace">${h(p.licence)}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </details>`;
        }).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn-ghost" type="button" data-import-action="back">← Retour</button>
        <span style="flex:1"></span>
        <button class="btn-primary" type="button" data-import-action="run">✓ Importer ${list.length} joueur${list.length > 1 ? 's' : ''}</button>
      </div>`;
  }

  function renderDone() {
    const r = modal.result || { created: [], enriched: [], skipped: [] };
    const CAT_LABELS = window.CAT_LABELS || { u9: 'U9', u11: 'U11', u13: 'U13' };
    const groupByCat = (arr) => {
      const g = {};
      arr.forEach(x => { (g[x.cat] || (g[x.cat] = [])).push(x); });
      return g;
    };
    const createdByCat = groupByCat(r.created);
    const enrichedByCat = groupByCat(r.enriched);
    return `
      <div class="import-body" style="padding:16px 20px;overflow-y:auto;flex:1">
        <div style="display:flex;gap:12px;margin:0 0 16px;flex-wrap:wrap">
          <div style="flex:1;min-width:150px;padding:12px;background:#dcfce7;border-radius:8px">
            <div style="font-size:24px;font-weight:700;color:#166534">${r.created.length}</div>
            <div style="font-size:12px;color:#166534">créé${r.created.length > 1 ? 's' : ''}</div>
          </div>
          <div style="flex:1;min-width:150px;padding:12px;background:#dbeafe;border-radius:8px">
            <div style="font-size:24px;font-weight:700;color:#1e3a8a">${r.enriched.length}</div>
            <div style="font-size:12px;color:#1e3a8a">enrichi${r.enriched.length > 1 ? 's' : ''}</div>
          </div>
          <div style="flex:1;min-width:150px;padding:12px;background:#f1f5f9;border-radius:8px">
            <div style="font-size:24px;font-weight:700;color:#475569">${r.skipped.length}</div>
            <div style="font-size:12px;color:#475569">ignoré${r.skipped.length > 1 ? 's' : ''}</div>
          </div>
        </div>

        ${r.created.length ? `
          <h4 style="margin:16px 0 6px">✓ Nouveaux joueurs créés</h4>
          ${Object.keys(createdByCat).map(cat => `
            <div style="margin:4px 0 10px">
              <strong>${h(CAT_LABELS[cat] || cat.toUpperCase())}</strong> :
              ${createdByCat[cat].map(x => h(x.name)).join(', ')}
            </div>`).join('')}
        ` : ''}

        ${r.enriched.length ? `
          <h4 style="margin:16px 0 6px">🔄 Joueurs enrichis (champs vides remplis)</h4>
          ${Object.keys(enrichedByCat).map(cat => `
            <div style="margin:4px 0 10px">
              <strong>${h(CAT_LABELS[cat] || cat.toUpperCase())}</strong> :
              ${enrichedByCat[cat].map(x => `${h(x.name)} <span style="color:#64748b">(+${x.nbFields})</span>`).join(', ')}
            </div>`).join('')}
        ` : ''}

        ${r.skipped.length ? `
          <details style="margin:16px 0">
            <summary style="cursor:pointer">⏭ ${r.skipped.length} ignoré${r.skipped.length > 1 ? 's' : ''}</summary>
            <ul style="margin:8px 0 0 20px;font-size:13px;color:#64748b">
              ${r.skipped.map(x => `<li>${h(x.name)} — ${h(x.reason)}</li>`).join('')}
            </ul>
          </details>
        ` : ''}
      </div>
      <div class="modal-footer">
        <span style="flex:1"></span>
        <button class="btn-primary" type="button" data-import-action="close">Terminer</button>
      </div>`;
  }

  /* ── Actions ────────────────────────────────────────────── */

  function openModal() {
    modal = { stage: 'pick' };
    render();
  }

  function closeModal() {
    modal = null;
    render();
    utils()?.renderAll?.();
  }

  async function onFilePicked(input) {
    const file = input.files?.[0];
    if (!file) return;
    modal.loading = true;
    modal.error = null;
    render();
    try {
      const text = await extractText(file);
      const parsed = parseLines(text);
      if (!parsed.length) {
        modal.loading = false;
        modal.error = 'Aucune licence détectée. Vérifie que c\'est bien un export « Liste licences matchs » du FootClubs.';
        render();
        return;
      }
      modal.stage = 'preview';
      modal.parsed = parsed;
      modal.loading = false;
      render();
    } catch (e) {
      console.error(e);
      modal.loading = false;
      modal.error = 'Erreur de lecture du PDF : ' + (e.message || e);
      render();
    }
  }

  function handleAction(target) {
    const act = target.dataset.importAction;
    if (!act) return false;
    if (act === 'close') { closeModal(); return true; }
    if (act === 'back')  { modal.stage = 'pick'; modal.error = null; render(); return true; }
    if (act === 'file-picked') { onFilePicked(target); return true; }
    if (act === 'run') {
      const result = runImport(modal.parsed || []);
      modal.stage  = 'done';
      modal.result = result;
      render();
      utils()?.renderAll?.();
      return true;
    }
    return false;
  }

  // Hook click global
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-import-action]');
    if (!t) return;
    if (handleAction(t)) e.preventDefault();
  });

  // Hook change pour le file input
  document.addEventListener('change', e => {
    const t = e.target;
    if (t?.dataset?.importAction === 'file-picked') {
      onFilePicked(t);
    }
  });

  /* ── Exports ────────────────────────────────────────────── */

  window.ImportLicencesModule = {
    openModal, closeModal, handleAction,
    _parseLines: parseLines,   // exposé pour tests
    _splitName: splitName,
    _mapCategory: mapCategory,
  };
})();
