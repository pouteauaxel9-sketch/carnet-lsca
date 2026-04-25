(function () {
  const config = window.SUPABASE_CONFIG || {};

  function isConfigured() {
    return Boolean(config.url && config.anonKey);
  }

  function getHeaders() {
    return {
      apikey: config.anonKey,
      Authorization: 'Bearer ' + config.anonKey,
      'Content-Type': 'application/json'
    };
  }

  async function request(path, searchParams) {
    if (!isConfigured()) {
      throw new Error('Supabase non configure');
    }

    const url = new URL(config.url.replace(/\/$/, '') + '/rest/v1/' + path);
    Object.entries(searchParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) url.searchParams.set(key, value);
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error('Erreur Supabase: ' + response.status);
    }

    return response.json();
  }

  async function fetchDashboardData(clubCode, season) {
    const clubRows = await request('clubs', {
      select: '*',
      code: 'eq.' + clubCode,
      limit: '1'
    });

    const club = clubRows[0];
    if (!club) throw new Error('Club introuvable dans Supabase');

    const [identities, categories, teams, teamSources, standings, fixtures, results] = await Promise.all([
      request('club_identities', {
        select: '*',
        club_id: 'eq.' + club.id,
        order: 'label.asc'
      }),
      request('categories', {
        select: '*',
        club_id: 'eq.' + club.id,
        order: 'display_order.asc'
      }),
      request('teams', {
        select: '*',
        club_id: 'eq.' + club.id,
        order: 'team_order.asc'
      }),
      request('team_sources', {
        select: '*'
      }),
      request('standings', {
        select: '*',
        season: 'eq.' + season,
        order: 'source_snapshot_at.desc'
      }),
      request('fixtures', {
        select: '*',
        season: 'eq.' + season,
        order: 'match_date.asc'
      }),
      request('results', {
        select: '*',
        season: 'eq.' + season,
        order: 'match_date.desc'
      })
    ]);

    return { club, identities, categories, teams, teamSources, standings, fixtures, results };
  }

  async function triggerSync() {
    if (!config.syncFunctionUrl) {
      return { ok: false, message: 'Aucune fonction de synchro configuree' };
    }

    const response = await fetch(config.syncFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clubCode: config.clubCode,
        season: config.season
      })
    });

    if (!response.ok) {
      return { ok: false, message: 'Fonction de synchro indisponible' };
    }

    return { ok: true, data: await response.json() };
  }

  window.supabaseService = {
    isConfigured,
    getConfig() {
      return {
        configured: isConfigured(),
        clubCode: config.clubCode || '',
        season: config.season || '',
        hasSyncFunction: Boolean(config.syncFunctionUrl)
      };
    },
    fetchDashboardData,
    triggerSync
  };
})();
