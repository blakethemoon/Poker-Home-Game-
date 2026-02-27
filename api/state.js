// Persists game state across devices/sessions via Upstash REST API.
// Works with either:
//   - Vercel KV:    KV_REST_API_URL + KV_REST_API_TOKEN  (explicit)
//   - Upstash Redis: REDIS_URL  (parsed — host becomes REST url, password becomes token)

const KEY = 'moonsGameState';

function getKVCreds() {
  // Option 1: explicit Vercel KV vars
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  }
  // Option 2: parse REDIS_URL (Upstash format: redis(s)://default:TOKEN@HOST:PORT)
  const raw = process.env.REDIS_URL;
  if (raw) {
    try {
      const u = new URL(raw);
      const host  = u.hostname;
      const token = u.password;
      if (host && token) return { url: `https://${host}`, token };
    } catch (_) {}
  }
  return null;
}

async function kvGet(creds) {
  const r = await fetch(`${creds.url}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${creds.token}` }
  });
  if (!r.ok) return null;
  const { result } = await r.json();
  return result ? JSON.parse(result) : null;
}

async function kvSet(creds, data) {
  await fetch(`${creds.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['SET', KEY, JSON.stringify(data)]])
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const creds = getKVCreds();
  if (!creds) {
    res.status(503).json({ error: 'No KV configured — add REDIS_URL or KV_REST_API_URL + KV_REST_API_TOKEN in Vercel env vars' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const data = await kvGet(creds);
      res.status(200).json({ data });

    } else if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {
          res.status(400).json({ error: 'Invalid JSON' }); return;
        }
      }
      await kvSet(creds, body);
      res.status(200).json({ ok: true });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('state error', err);
    res.status(500).json({ error: (err && err.message) || 'Unknown error' });
  }
};
