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
        max_tokens: 1024,
        system: [
          'You are counting stacked poker chips in an image.',
          '',
          'Follow these steps exactly:',
          '1. Focus on the main vertical stack of chips.',
          '2. Start at the very top chip (the flat circular face).',
          '3. Move downward one horizontal layer at a time.',
          '4. Each visible horizontal rim edge represents exactly ONE chip.',
          '5. A chip counts if: a curved rim edge is visible AND at least part of the white edge inserts are visible.',
          '6. Do NOT merge tightly compressed layers.',
          '7. Do NOT guess hidden chips.',
          '8. After counting the stack, add any loose chips visible beside it.',
          '',
          'Important rules:',
          '- Count full horizontal chip layers, not individual white blocks.',
          '- Ignore shadows and lighting variations.',
          '- Trace the stack carefully from top to bottom before answering.',
          '- After finishing, recount once from bottom to top to confirm the same number.',
          '- Identify each chip by its primary/dominant color, not accent markings or white insets.',
          '',
          'Respond ONLY with a single JSON object, no markdown, no extra text.'
        ].join('\n'),
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
                  'Chip values: ' + chipValues + '.\n\n' +
                  'Count all poker chips in the image by color. ' +
                  'For each stack: trace top-to-bottom counting every rim edge as one chip, then recount bottom-to-top to verify. ' +
                  'Add any loose chips beside the stack(s). ' +
                  'Do not guess obscured chips.\n\n' +
                  'Return ONLY a JSON object in this exact shape:\n' +
                  '{"counts":{"red":0,"blue":0,"black":0,"green":0},"total":0.00,"description":"stack count X + side count Y = total Z chips"}'
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
