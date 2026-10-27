/**
 * Netlify Function : proxy vers l'API DOFA de la FFF
 *
 * Appelée depuis l'app : /.netlify/functions/fff-proxy?compet=450413&phase=1&poule=3
 *
 * Fetche https://api-dofa.fff.fr/api/compets/{compet}/phases/{phase}/poules/{poule}/classement_journees
 * et renvoie le JSON tel quel avec les bons headers CORS (depuis le serveur Netlify,
 * donc pas de blocage navigateur).
 *
 * Deploy automatique : Netlify détecte le dossier netlify/functions/ au prochain push.
 */

exports.handler = async function (event) {
  const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control':                'public, max-age=300', // cache côté navigateur 5 min
  };

  // Préflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const compet = (event.queryStringParameters?.compet || '').replace(/[^\d]/g, '');
  const phase  = (event.queryStringParameters?.phase  || '').replace(/[^\d]/g, '');
  const poule  = (event.queryStringParameters?.poule  || '').replace(/[^\d]/g, '');

  if (!compet || !phase || !poule) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Paramètres manquants : compet, phase, poule requis' }),
    };
  }

  const apiUrl = `https://api-dofa.fff.fr/api/compets/${compet}/phases/${phase}/poules/${poule}/classement_journees`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Carnet-LSCA/1.0 (+netlify-fff-proxy)',
      },
    });

    const text = await resp.text();
    const contentType = resp.headers.get('content-type') || 'application/json';

    return {
      statusCode: resp.status,
      headers: { ...CORS, 'Content-Type': contentType },
      body: text,
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Fetch FFF failed', detail: String(e && e.message || e) }),
    };
  }
};
