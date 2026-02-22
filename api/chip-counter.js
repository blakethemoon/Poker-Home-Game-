// Node.js Serverless Function for Vercel
// Path: /api/chip-counter.js

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY not set on server' });
    return;
  }

  try {
    let body = {};
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        res.status(400).json({ error: 'Invalid JSON body' });
        return;
      }
    } else {
      body = req.body || {};
    }

    const imageBase64 = body.imageBase64;
    const chipValues = body.chipValues || '';

    if (!imageBase64) {
      res.status(400).json({ error: 'Missing imageBase64' });
      return;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You count poker chips from an image for a live home cash game. Respond ONLY with a single JSON object.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Chip values: ' +
                  chipValues +
                  '. Count all visible poker chips. Return ONLY JSON exactly in this shape: ' +
                  '{"counts":{"red":0,"blue":0,"black":0,"green":0},"total":0.00,"description":"short summary"}'
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/jpeg;base64,' + imageBase64
                }
              }
            ]
          }
        ]
      })
    });

    const txt = await response.text();

    if (!response.ok) {
      res.status(response.status).json({ error: 'OpenAI error', status: response.status, body: txt });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch (e) {
      res.status(500).json({ error: 'OpenAI did not return valid JSON', body: txt });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('chip-counter error', err);
    const msg = (err && err.message) ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
};
