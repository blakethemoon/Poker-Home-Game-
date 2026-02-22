// Node.js Serverless Function for Vercel
// Path: /api/chip-counter.js
// Uses Anthropic Claude claude-sonnet-4-6 vision to count poker chips

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server' });
    return;
  }

  try {
    let body = {};
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch (e) {
        res.status(400).json({ error: 'Invalid JSON body', body: req.body });
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: 'You are an expert poker chip counter for a live home cash game. Chips are often photographed in vertical stacks/towers — count every chip by examining visible edges and shadows. Dark chips (black) on dark surfaces have low contrast so pay extra attention to subtle edge lines. Chips of any color may have a white center ring, stripe, or decorative inset — always identify a chip by its primary/dominant color, not its accent markings. Aim for accuracy: do not undercount OR overcount. Respond ONLY with a single JSON object, no markdown, no extra text.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64
                }
              },
              {
                type: 'text',
                text:
                  'Chip values: ' +
                  chipValues +
                  '. Count ALL poker chips in the image. If chips are stacked in a tower, count every chip in the stack by looking at the edges — chips in a tower are stacked directly on top of each other so count each visible edge as one chip. Be precise and do not undercount stacks. Return ONLY a JSON object exactly in this shape: ' +
                  '{"counts":{"red":0,"blue":0,"black":0,"green":0},"total":0.00,"description":"short summary"}'
              }
            ]
          }
        ]
      })
    });

    const txt = await response.text();

    if (!response.ok) {
      res.status(response.status).json({ error: 'Anthropic API error', status: response.status, body: txt });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch (e) {
      res.status(500).json({ error: 'Anthropic did not return valid JSON', body: txt });
      return;
    }

    // Extract the text content from Claude's response
    const content = parsed.content && parsed.content[0] && parsed.content[0].text;
    if (!content) {
      res.status(500).json({ error: 'No content in Anthropic response', body: txt });
      return;
    }

    let result;
    try {
      // Strip any accidental markdown fences
      const clean = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      result = JSON.parse(clean);
    } catch (e) {
      res.status(500).json({ error: 'Could not parse chip count JSON from Claude', body: content });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    console.error('chip-counter error', err);
    const msg = (err && err.message) ? err.message : 'Unknown error';
    res.status(500).json({ error: msg });
  }
};
