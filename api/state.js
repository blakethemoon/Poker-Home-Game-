// Vercel KV — persists game state across devices/sessions
// Requires KV_REST_API_URL and KV_REST_API_TOKEN env vars (set in Vercel dashboard)

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KEY      = 'moonsGameState';

async function kvGet() {
  if (!KV_URL || !KV_TOKEN) return null;
  const r = await fetch(`${KV_URL}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  if (!r.ok) return null;
  const { result } = await r.json();
  return result ? JSON.parse(result) : null;
}

async function kvSet(data) {
  if (!KV_URL || !KV_TOKEN) return;
  await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([['SET', KEY, JSON.stringify(data)]])
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!KV_URL || !KV_TOKEN) {
    res.status(503).json({ error: 'KV not configured — add KV_REST_API_URL and KV_REST_API_TOKEN to Vercel env vars' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const data = await kvGet();
      res.status(200).json({ data });

    } else if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {
          res.status(400).json({ error: 'Invalid JSON' }); return;
        }
      }
      await kvSet(body);
      res.status(200).json({ ok: true });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('state error', err);
    res.status(500).json({ error: (err && err.message) || 'Unknown error' });
  }
};
