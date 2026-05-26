/**
 * excel-export.js — Export Excel multi-feuilles via SheetJS.
 *
 * Génère un fichier .xlsx contenant :
 *   1) Effectif         — joueurs + profil + score global
 *   2) Évaluations      — notes par pilier et critère (saison sélectionnée)
 *   3) Séances          — 3 séances S1/S2/S3 et leurs ateliers (saison)
 *   4) Observations     — toutes les observations match (saison)
 *   5) Synthèse         — score, niveau, profil, progression, dernière obs
 *
 * Dépend de SheetJS chargé via CDN (window.XLSX) et de window.appState/JDATA/PILLARS.
 * Expose window.ExcelExportModule.{ exportAll, exportCategory }.
 */
(function () {
  'use strict';

  function state() { return window.appState; }
  function XLSX() { return window.XLSX; }

  const CAT_LABELS = window.CAT_LABELS || { u13: 'U13', u11: 'U11', u9: 'U9' };

  /* ── helpers calculs (réimplémentés pour découpage) ───── */

  function pAvg(cat, pid, key, season) {
    const PILLARS = window.PILLARS?.[cat] || [];
    const data = state()?.data?.[cat]?.[pid]?.[season];
    if (!data) return 0;
    const pillar = PILLARS.find(p => p.key === key);
    if (!pillar) return 0;
    let total = 0, count = 0;
    pillar.criteria.forEach((_, i) => {
      const v = data.ratings?.[key]?.[i] || 0;
      if (v > 0) { total += v; count++; }
    });
    return count ? total / count : 0;
  }

  function pScore(cat, pid, season) {
    const WEIGHTS = { technique: 0.35, tactique: 0.25, physique: 0.20, mental: 0.15, perso: 0.05 };
    const PILLARS = window.PILLARS?.[cat] || [];
    let total = 0, wsum = 0;
    PILLARS.forEach(p => {
      const avg = pAvg(cat, pid, p.key, season);
      if (avg > 0) {
        total += (avg / 4) * 100 * (WEIGHTS[p.key] || 0.1);
        wsum += WEIGHTS[p.key] || 0.1;
      }
    });
    return wsum ? Math.round(total / wsum) : 0;
  }

  function getLevel(s) {
    if (s >= 80) return 'Très avancé';
    if (s >= 60) return 'Bon niveau';
    if (s >= 40) return 'En progression';
    if (s > 0) return 'En difficulté';
    return 'Non évalué';
  }

  /* ── builders feuilles ─────────────────────────────────── */

  function buildEffectifSheet(cat, season) {
    const players = window.JDATA?.[cat]?.players || [];
    const rows = players.map(p => {
      const pid = p.name;
      const data = state()?.data?.[cat]?.[pid] || {};
      const prof = data.profil || {};
      return {
        'Nom complet': pid,
        'Prénom': prof.prenom || '',
        'Nom': prof.nom || '',
        'Date de naissance': prof.naissance || '',
        'N° licence': prof.licence || '',
        'Années au club': prof.annees_club || '',
        'Poste principal': prof.poste1 || '',
        'Poste secondaire': prof.poste2 || '',
        'Pied fort': prof.pied || '',
        'Taille (cm)': prof.taille || '',
        'Poids (kg)': prof.poids || '',
        'Contact parent': prof.contact_parent || '',
        'Score global (%)': pScore(cat, pid, season),
        'Niveau': getLevel(pScore(cat, pid, season)),
      };
    });
    return XLSX().utils.json_to_sheet(rows);
  }

  function buildPiliersSheet(cat, season) {
    const PILLARS = window.PILLARS?.[cat] || [];
    const players = window.JDATA?.[cat]?.players || [];
    const rows = players.map(p => {
      const pid = p.name;
      const row = { 'Joueur': pid, 'Score global': pScore(cat, pid, season) };
      PILLARS.forEach(pillar => {
        const avg = pAvg(cat, pid, pillar.key, season);
        row[pillar.label + ' (moy. 1-4)'] = avg ? +avg.toFixed(2) : '';
        row[pillar.label + ' (%)'] = avg ? Math.round((avg / 4) * 100) : '';
      });
      return row;
    });
    return XLSX().utils.json_to_sheet(rows);
  }

  function buildSeancesSheet(cat, season) {
    const ATELIERS = window.SeanceModule?.ATELIERS || [];
    const SLOT_LABELS = window.SeanceModule?.SLOT_LABELS || ['S1', 'S2', 'S3'];
    const scoreS = window.SeanceModule?.seanceScore;
    const players = window.JDATA?.[cat]?.players || [];

    const rows = [];
    players.forEach(p => {
      const pid = p.name;
      const seances = state()?.data?.[cat]?.[pid]?.seances?.[season] || [];
      seances.forEach((s, i) => {
        if (!s) return;
        const row = {
          'Joueur': pid,
          'Séance': SLOT_LABELS[i] || ('S' + (i + 1)),
          'Date': s.date || '',
          'Éducateur': s.educator_name || '',
          'Score séance (%)': scoreS ? scoreS(s, cat) : '',
        };
        ATELIERS.forEach(a => {
          row[a.label + ' (' + a.unit + ')'] = s.ateliers?.[a.key] ?? '';
        });
        rows.push(row);
      });
    });
    return XLSX().utils.json_to_sheet(rows.length ? rows : [{ 'Joueur': '(aucune séance)' }]);
  }

  function buildObservationsSheet(cat, season) {
    const DIMS = window.ObsModule?.DIMENSIONS || [];
    const STAT_FIELDS = window.ObsModule?.STAT_FIELDS || [];
    const players = window.JDATA?.[cat]?.players || [];

    const rows = [];
    players.forEach(p => {
      const pid = p.name;
      const obs = state()?.data?.[cat]?.[pid]?.observations?.[season] || [];
      obs.forEach(o => {
        const row = {
          'Joueur': pid,
          'Date': o.date_match || '',
          'Adversaire': o.adversaire || '',
          'Score': o.score_match || '',
          'Lieu': o.domicile === false ? 'Extérieur' : 'Domicile',
          'Temps de jeu': o.temps_jeu || '',
          'Note /10': o.note_match ?? '',
          'Position jouée': o.poste_joue || '',
          'Compétition': o.competition || '',
          'Éducateur': o.educator_name || '',
        };
        DIMS.forEach(d => {
          row[d.label] = o.dimensions?.[d.key] ?? '';
        });
        STAT_FIELDS.forEach(f => {
          row[f.label] = o.stats?.[f.key] ?? '';
        });
        row['Commentaire'] = o.commentaire || '';
        rows.push(row);
      });
    });
    rows.sort((a, b) => (b.Date || '').localeCompare(a.Date || ''));
    return XLSX().utils.json_to_sheet(rows.length ? rows : [{ 'Joueur': '(aucune observation)' }]);
  }

  /* Nouvelle feuille : stats cumulées par joueur sur la saison */
  function buildMatchStatsSheet(cat, season) {
    const players = window.JDATA?.[cat]?.players || [];
    const seasonStats = window.ObsModule?.seasonStats;
    if (!seasonStats) return XLSX().utils.json_to_sheet([{ Info: 'ObsModule indisponible' }]);

    const rows = players.map(p => {
      const obs = state()?.data?.[cat]?.[p.name]?.observations?.[season] || [];
      const s = seasonStats(obs);
      if (!s) {
        return { 'Joueur': p.name, 'Matchs': 0 };
      }
      return {
        'Joueur': p.name,
        'Matchs': s.matches,
        'Minutes': s.minutes,
        'Note ⌀': s.noteAvg ?? '',
        'Buts': s.buts,
        'Passes déc.': s.passes_d,
        'Implications': s.implications,
        'Buts/match': s.buts_par_match,
        'Tirs cadrés': s.tirs_cadres,
        'Tirs hors': s.tirs_non_cadres,
        'Précision tir %': s.precision_tir ?? '',
        'Fautes com.': s.fautes_commises,
        'Fautes sub.': s.fautes_subies,
        'Jaunes': s.jaune,
        'Rouges': s.rouge,
      };
    });
    rows.sort((a, b) => (b['Buts'] || 0) - (a['Buts'] || 0));
    return XLSX().utils.json_to_sheet(rows);
  }

  function buildSyntheseSheet(cat, season) {
    const players = window.JDATA?.[cat]?.players || [];
    const SEASONS = window.SEASONS || [];
    const rows = players.map(p => {
      const pid = p.name;
      const data = state()?.data?.[cat]?.[pid] || {};
      const prof = data.profil || {};
      const obs = (data.observations?.[season] || []);
      const last = obs.slice().sort((a, b) => new Date(b.date_match) - new Date(a.date_match))[0];

      // progression vs N-1
      const currentScore = pScore(cat, pid, season);
      const idx = SEASONS.indexOf(season);
      const prevSeason = idx >= 0 ? SEASONS[idx + 1] : null;
      const prevScore = prevSeason ? pScore(cat, pid, prevSeason) : 0;
      const diff = currentScore && prevScore ? (currentScore - prevScore) : '';

      return {
        'Joueur': pid,
        'Poste principal': prof.poste1 || '',
        'Score global (%)': currentScore,
        'Niveau': getLevel(currentScore),
        'Saison précédente (%)': prevScore || '',
        'Progression': diff === '' ? '' : (diff > 0 ? '+' : '') + diff,
        'Nb observations match': obs.length,
        'Dernière obs (date)': last?.date_match || '',
        'Dernière obs (adversaire)': last?.adversaire || '',
      };
    });
    return XLSX().utils.json_to_sheet(rows);
  }

  /* ── orchestration ─────────────────────────────────────── */

  function autoSizeColumns(ws) {
    if (!ws['!ref']) return;
    const range = XLSX().utils.decode_range(ws['!ref']);
    const cols = [];
    for (let C = range.s.c; C <= range.e.c; C++) {
      let maxLen = 10;
      for (let R = range.s.r; R <= range.e.r; R++) {
        const addr = XLSX().utils.encode_cell({ r: R, c: C });
        const v = ws[addr]?.v;
        if (v != null) maxLen = Math.max(maxLen, String(v).length);
      }
      cols.push({ wch: Math.min(maxLen + 2, 36) });
    }
    ws['!cols'] = cols;
  }

  function exportCategory(cat = state()?.cat, season = state()?.season) {
    if (!XLSX()) { window.appUtils?.showToast('Module Excel non chargé'); return; }
    if (!cat || !season) return;

    const wb = XLSX().utils.book_new();
    const sheets = [
      ['Synthèse', buildSyntheseSheet(cat, season)],
      ['Effectif', buildEffectifSheet(cat, season)],
      ['Piliers', buildPiliersSheet(cat, season)],
      ['Séances', buildSeancesSheet(cat, season)],
      ['Stats match', buildMatchStatsSheet(cat, season)],
      ['Observations', buildObservationsSheet(cat, season)],
    ];
    sheets.forEach(([name, ws]) => {
      autoSizeColumns(ws);
      XLSX().utils.book_append_sheet(wb, ws, name);
    });

    const filename = `carnet-${CAT_LABELS[cat] || cat}-${season}.xlsx`;
    XLSX().writeFile(wb, filename);
    window.appUtils?.showToast('Export Excel téléchargé');
  }

  function exportAll(season = state()?.season) {
    if (!XLSX()) { window.appUtils?.showToast('Module Excel non chargé'); return; }
    if (!season) return;

    const wb = XLSX().utils.book_new();
    Object.keys(window.JDATA || {}).forEach(cat => {
      const label = CAT_LABELS[cat] || cat.toUpperCase();
      const s1 = buildSyntheseSheet(cat, season);
      const s2 = buildEffectifSheet(cat, season);
      autoSizeColumns(s1); autoSizeColumns(s2);
      XLSX().utils.book_append_sheet(wb, s1, label + ' synthèse');
      XLSX().utils.book_append_sheet(wb, s2, label + ' effectif');
    });

    XLSX().writeFile(wb, `carnet-club-${season}.xlsx`);
    window.appUtils?.showToast('Export Excel club téléchargé');
  }

  window.ExcelExportModule = { exportAll, exportCategory };
})();
