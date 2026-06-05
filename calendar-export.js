/**
 * calendar-export.js — Export iCalendar (.ics) des matchs FFF
 *
 * Génère un fichier .ics conforme RFC 5545 contenant tous les matchs FFF :
 *   - Matchs à venir : événements normaux avec rappels (1j avant, 1h avant)
 *   - Matchs passés : événements terminés (utile pour archivage)
 *
 * Importable dans :
 *   - Google Calendar (Paramètres → Importer)
 *   - Apple Calendar (Fichier → Importer)
 *   - Outlook (Fichier → Ouvrir → Importer iCalendar)
 *
 * Heuristique de date/heure :
 *   - date FFF format DD/MM/YYYY
 *   - time format "10h00" ou "13H30" ; à défaut 10h00
 *   - durée par défaut : 90 min (durée standard match jeunes)
 *
 * Expose : window.CalendarExportModule.{ exportAll, exportCategory, buildIcs }
 */
(function () {
  'use strict';

  function state() { return window.appState; }

  function loadFeeds() {
    try { return JSON.parse(localStorage.getItem('cfb6_feeds') || '{}') || {}; }
    catch { return {}; }
  }

  /* ── helpers date/heure ─────────────────────────────────── */

  function parseFrDate(s) {
    if (!s) return null;
    const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return { day: +m[1], month: +m[2], year: +m[3] };
  }

  function parseFrTime(s) {
    if (!s) return null;
    const m = String(s).match(/(\d{1,2})[hH](\d{2})?/);
    if (!m) return null;
    return { hour: +m[1], minute: m[2] ? +m[2] : 0 };
  }

  // Format YYYYMMDDTHHMMSS pour iCal (heure locale sans Z)
  function toIcsDateTime(d, h, m) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.year}${pad(d.month)}${pad(d.day)}T${pad(h)}${pad(m)}00`;
  }

  function escapeIcs(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g,  '\\;')
      .replace(/,/g,  '\\,')
      .replace(/\n/g, '\\n');
  }

  function uid(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9) + '@carnet-lsca';
  }

  function nowIcsUtc() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }

  /* ── conversion d'un match en VEVENT ───────────────────── */

  function matchToVevent(match, opts) {
    const date = parseFrDate(match.date);
    if (!date) return null;
    const time = parseFrTime(match.time) || { hour: 10, minute: 0 };

    const startStr = toIcsDateTime(date, time.hour, time.minute);
    // Fin = +90 min
    const startDate = new Date(date.year, date.month - 1, date.day, time.hour, time.minute);
    const endDate = new Date(startDate.getTime() + 90 * 60000);
    const endStr = toIcsDateTime(
      { year: endDate.getFullYear(), month: endDate.getMonth() + 1, day: endDate.getDate() },
      endDate.getHours(), endDate.getMinutes()
    );

    const home = match.home || match.team || '?';
    const away = match.away || match.opponent || '?';
    const lieu = match.isHome === true ? 'Domicile' : match.isHome === false ? 'Extérieur' : '';
    const score = match.score && match.score !== '-' ? ' — ' + match.score : '';

    // Construire titre court : équipe vs adversaire (lieu)
    const ourTeam = match.team || (match.isHome ? home : away);
    const opp = match.opponent || (match.isHome ? away : home);
    const summary = `⚽ ${ourTeam} vs ${opp}${score}`;

    const desc = [
      `Match : ${home} vs ${away}`,
      score ? `Score : ${match.score}` : '',
      lieu ? `Lieu : ${lieu}` : '',
      match.competition ? `Compétition : ${match.competition}` : '',
      opts.includeFooter !== false ? '\n— Généré par Carnet Formation LSCA' : '',
    ].filter(Boolean).join('\n');

    const isPast = score && match.score !== '-';
    const isFuture = !isPast;

    const lines = [
      'BEGIN:VEVENT',
      `UID:${uid(match.team || 'match')}`,
      `DTSTAMP:${nowIcsUtc()}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(desc)}`,
      `LOCATION:${escapeIcs(lieu)}`,
      `CATEGORIES:Football,${escapeIcs(match.competition || 'Match')}`,
      `STATUS:${isPast ? 'CONFIRMED' : 'TENTATIVE'}`,
    ];

    // Rappels uniquement pour les matchs à venir
    if (isFuture) {
      // 1 jour avant
      lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
                 `DESCRIPTION:${escapeIcs('Match demain : ' + summary)}`, 'END:VALARM');
      // 1 heure avant
      lines.push('BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY',
                 `DESCRIPTION:${escapeIcs('Match dans 1h : ' + summary)}`, 'END:VALARM');
    }

    lines.push('END:VEVENT');
    return lines.join('\r\n');
  }

  /* ── construction du calendrier ─────────────────────────── */

  function buildIcs(matches, opts = {}) {
    const calName = opts.calName || 'Carnet Formation — Matchs FFF';
    const events = matches.map(m => matchToVevent(m, opts)).filter(Boolean);

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GJ LSCA//Carnet Formation//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${escapeIcs(calName)}`,
      'X-WR-TIMEZONE:Europe/Paris',
      `X-WR-CALDESC:${escapeIcs('Calendrier des matchs FFF scrapés par le Carnet Formation LSCA')}`,
      ...events,
      'END:VCALENDAR',
    ];
    return lines.join('\r\n');
  }

  function collectMatches(cats) {
    const feeds = loadFeeds();
    const all = [];
    cats.forEach(cat => {
      const f = feeds[cat];
      if (!f) return;
      (f.past || []).forEach(m => all.push({ ...m, _origin: 'past' }));
      (f.upcoming || []).forEach(m => all.push({ ...m, _origin: 'upcoming' }));
    });
    return all;
  }

  function download(filename, content) {
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ── API publique ───────────────────────────────────────── */

  function exportAll() {
    const cats = Object.keys(window.CAT_LABELS || { u13: 'U13', u11: 'U11', u9: 'U9' });
    const matches = collectMatches(cats);
    if (!matches.length) {
      window.appUtils?.showToast?.('Aucun match dans les feeds (clique Actualiser d\'abord)');
      return;
    }
    const ics = buildIcs(matches, { calName: 'Carnet LSCA — Tous matchs' });
    download(`carnet-lsca-tous-matchs.ics`, ics);
    window.appUtils?.showToast?.(`${matches.length} matchs exportés (.ics)`);
  }

  function exportCategory(cat) {
    const matches = collectMatches([cat]);
    if (!matches.length) {
      window.appUtils?.showToast?.('Aucun match pour ' + (window.CAT_LABELS?.[cat] || cat));
      return;
    }
    const label = window.CAT_LABELS?.[cat] || cat.toUpperCase();
    const ics = buildIcs(matches, { calName: `Carnet LSCA — ${label}` });
    download(`carnet-lsca-${cat}.ics`, ics);
    window.appUtils?.showToast?.(`${matches.length} matchs ${label} exportés (.ics)`);
  }

  function exportTeam(cat, teamLabel) {
    const all = collectMatches([cat]);
    const matches = all.filter(m => m.team === teamLabel);
    if (!matches.length) {
      window.appUtils?.showToast?.('Aucun match pour ' + teamLabel);
      return;
    }
    const ics = buildIcs(matches, { calName: `Carnet LSCA — ${teamLabel}` });
    download(`carnet-lsca-${teamLabel.replace(/\s+/g, '-')}.ics`, ics);
    window.appUtils?.showToast?.(`${matches.length} matchs ${teamLabel} exportés (.ics)`);
  }

  window.CalendarExportModule = {
    exportAll,
    exportCategory,
    exportTeam,
    buildIcs,
    collectMatches,
  };
})();
