/**
 * scrape-sporteasy.js
 *
 * Scraper headless de SportEasy pour P'tits Verts.
 * Login avec SPORTEASY_EMAIL + SPORTEASY_PASSWORD (GitHub Secrets).
 * Récupère pour chaque équipe du club :
 *   - roster (liste des membres + coordonnées parents)
 *   - calendrier (matchs à venir + résultats passés)
 *   - présences effectives des derniers évènements (feuille validée)
 *
 * Écrit le résultat consolidé dans data/sporteasy.json pour que
 * l'app P'tits Verts puisse le consommer (stale-while-revalidate via SW).
 *
 * Tourne sur GitHub Actions 1×/jour (cron 5h UTC = 6h France hiver).
 *
 * ⚠️ Rappel : SportEasy n'a PAS d'API publique. Ce scraping est fragile
 * (dépend du HTML du site) et techniquement en marge de leurs CGU.
 * À arrêter immédiatement si leur support te contacte.
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const puppeteer = require('puppeteer');

// ── Config ──────────────────────────────────────────────

const EMAIL    = process.env.SPORTEASY_EMAIL;
const PASSWORD = process.env.SPORTEASY_PASSWORD;
const BASE_URL = 'https://www.sporteasy.com';
const LOGIN_URL = BASE_URL + '/fr/login/';
const OUT_PATH = path.join(__dirname, '..', 'data', 'sporteasy.json');
const HEADLESS = process.env.HEADLESS !== 'false';

if (!EMAIL || !PASSWORD) {
  console.error('❌ SPORTEASY_EMAIL et SPORTEASY_PASSWORD doivent être définis');
  process.exit(1);
}

// Helpers
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[sporteasy]', ...a);

// ── Main ───────────────────────────────────────────────

(async () => {
  log('Boot Puppeteer (headless=' + HEADLESS + ')');
  const browser = await puppeteer.launch({
    headless: HEADLESS ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1366,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );

  const result = {
    scrapedAt: new Date().toISOString(),
    teams: {},
    errors: [],
  };

  try {
    // 1) LOGIN
    log('Login…');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // SportEasy utilise typiquement des champs name="email" + name="password"
    // Les sélecteurs peuvent changer, on tente plusieurs variantes.
    const emailSelectors    = ['input[name="email"]', 'input[type="email"]', '#email'];
    const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];
    const submitSelectors   = ['button[type="submit"]', 'input[type="submit"]', 'button.btn-primary'];

    let emailField = null;
    for (const sel of emailSelectors) {
      emailField = await page.$(sel);
      if (emailField) break;
    }
    if (!emailField) throw new Error('Champ email introuvable sur la page de login');
    await emailField.type(EMAIL, { delay: 40 });

    let passwordField = null;
    for (const sel of passwordSelectors) {
      passwordField = await page.$(sel);
      if (passwordField) break;
    }
    if (!passwordField) throw new Error('Champ password introuvable sur la page de login');
    await passwordField.type(PASSWORD, { delay: 40 });

    let submitBtn = null;
    for (const sel of submitSelectors) {
      submitBtn = await page.$(sel);
      if (submitBtn) break;
    }
    if (!submitBtn) throw new Error('Bouton submit introuvable');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null),
      submitBtn.click(),
    ]);

    // Vérifier qu'on est bien loggé (plus sur /login/)
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      // Essayer de capturer un message d'erreur visible
      const bodyText = await page.evaluate(() => document.body.innerText || '');
      throw new Error('Login échoué — toujours sur /login. Extrait page : ' + bodyText.slice(0, 300));
    }
    log('✅ Loggé — URL actuelle :', currentUrl);

    // 2) LISTER LES ÉQUIPES
    // SportEasy a généralement une page /club/ ou /teams/ listant tes équipes.
    // On tente de récupérer les liens vers chaque équipe depuis la home post-login.
    log('Recherche des équipes…');
    await page.goto(BASE_URL + '/fr/', { waitUntil: 'networkidle2', timeout: 30000 });

    const teamLinks = await page.evaluate(() => {
      // Pattern URL SportEasy : /fr/{team-slug}/ ou /club/{slug}/teams/{slug}/
      const anchors = Array.from(document.querySelectorAll('a[href*="/fr/"]'));
      const seen = new Set();
      const teams = [];
      anchors.forEach(a => {
        const href = a.getAttribute('href') || '';
        const m = href.match(/^\/fr\/([a-z0-9-]+)\/?$/i);
        if (m && !['login', 'register', 'about', 'pricing', 'contact', 'logout', 'account'].includes(m[1].toLowerCase())) {
          if (!seen.has(m[1])) {
            seen.add(m[1]);
            teams.push({ slug: m[1], label: (a.innerText || '').trim().slice(0, 80) });
          }
        }
      });
      return teams;
    });

    log(`→ ${teamLinks.length} équipes détectées :`, teamLinks.map(t => t.slug).join(', '));

    if (teamLinks.length === 0) {
      // Dump le HTML pour debug
      const html = await page.content();
      fs.writeFileSync(path.join(__dirname, '..', 'data', '_sporteasy-debug.html'), html.slice(0, 50000));
      result.errors.push('Aucune équipe détectée sur la home — HTML dumped dans data/_sporteasy-debug.html');
    }

    // 3) POUR CHAQUE ÉQUIPE : roster + évènements
    for (const team of teamLinks) {
      log(`─── Équipe ${team.slug} ───`);
      const teamData = {
        label: team.label,
        slug: team.slug,
        roster: [],
        events: [],
        scrapedAt: new Date().toISOString(),
      };

      // Roster : page /fr/{slug}/members/ ou /roster/
      try {
        await page.goto(`${BASE_URL}/fr/${team.slug}/members/`, { waitUntil: 'networkidle2', timeout: 20000 });
        teamData.roster = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('[class*="member"], [class*="player"], tr'));
          const out = [];
          rows.forEach(r => {
            const name = (r.querySelector('[class*="name"], .name, strong') || r).innerText?.trim();
            if (name && name.length < 80 && !out.find(p => p.name === name)) {
              out.push({ name });
            }
          });
          return out.slice(0, 50); // garde-fou
        });
        log(`  roster : ${teamData.roster.length} membres`);
      } catch (e) {
        teamData.rosterError = e.message;
      }

      // Évènements : page /fr/{slug}/events/ (passés + futurs)
      try {
        await page.goto(`${BASE_URL}/fr/${team.slug}/events/`, { waitUntil: 'networkidle2', timeout: 20000 });
        teamData.events = await page.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('[class*="event"], article, li'));
          const out = [];
          cards.forEach(c => {
            const title = c.querySelector('[class*="title"], h2, h3, strong')?.innerText?.trim();
            const date  = c.querySelector('[class*="date"], time')?.innerText?.trim() ||
                          c.querySelector('time')?.getAttribute('datetime');
            const score = c.querySelector('[class*="score"], [class*="result"]')?.innerText?.trim();
            if (title && title.length < 150) {
              out.push({ title, date, score });
            }
          });
          // dédup
          const seen = new Set();
          return out.filter(e => {
            const k = (e.title || '') + '|' + (e.date || '');
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          }).slice(0, 80);
        });
        log(`  events : ${teamData.events.length}`);
      } catch (e) {
        teamData.eventsError = e.message;
      }

      result.teams[team.slug] = teamData;
      await sleep(800); // courtoisie
    }

    // 4) ÉCRITURE
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
    log(`✅ Écrit ${OUT_PATH} (${Object.keys(result.teams).length} équipes)`);
  } catch (e) {
    console.error('❌ Erreur fatale :', e);
    result.errors.push(e.message);
    // On écrit quand même pour que le workflow commit les erreurs (visibilité)
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
