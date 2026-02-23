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
          '════ WHAT DEFINES ONE CHIP ════',
          'A poker chip is a single physical disc. When stacked, each chip appears as one horizontal',
          'layer/band in the side profile of the stack.',
          '',
          'CRITICAL FACT — white inserts are NOT a counting unit:',
          'Poker chips often have decorative white rectangular inlays (inserts) embedded around their rim.',
          'A SINGLE chip may have 1, 2, or even 3 white rectangular patches visible on its edge.',
          'DO NOT count white patches. Counting white patches will give you a multiple of the real count.',
          'The white inserts are decoration inside one chip — they do not mark chip boundaries.',
          '',
          '════ HOW TO COUNT ════',
          'Count the physical disc LAYERS, not the white spots.',
          '',
          'Method — count the seam lines:',
          '1. Look at the stack from the side.',
          '2. Find the thin horizontal SEAM LINES (the hairline gaps or shadows) where one chip disc',
          '   ends and the next begins. These seams run the full width of the stack.',
          '3. Count those seam lines. Number of chips = seam lines + 1.',
          '4. Recount top-to-bottom, then bottom-to-top to verify the same number.',
          '',
          'Sanity check — look at the white insert GROUPS:',
          'If chips have 2 white inserts each, you will see the white patches appear in PAIRS.',
          'Each PAIR belongs to one single chip. So if you see 20 white patches, that is 10 chips.',
          'Use this only as a cross-check, not your primary method.',
          '',
          'Do NOT count:',
          '- Individual white rectangular patches as separate chips',
          '- Obscured or hidden chips you cannot see',
          '',
          '════ COLOR IDENTIFICATION ════',
          'To identify chip color, look at the colored body BETWEEN and BEHIND the white inserts.',
          'The dominant background color of the chip body is the chip color.',
          'Examples: BLACK body = black chip. BLUE body = blue chip. RED body = red chip.',
          'Never call a chip "white" — the white inserts are on every chip color.',
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
                  'Count all poker chips in the image by color.\n' +
                  'For each stack:\n' +
                  '  1. Count the SEAM LINES between disc layers (number of chips = seams + 1).\n' +
                  '  2. Do NOT count white rectangular patches — a single chip may show 2 or more white patches on its rim.\n' +
                  '  3. Recount bottom-to-top to verify.\n' +
                  '  4. Cross-check: if white patches appear in pairs, divide patch count by 2.\n' +
                  'Add any loose chips visible beside the stack(s). Do not guess obscured chips.\n\n' +
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
      // Extract JSON object — grab from first '{' to last '}'
      // This handles markdown fences, leading/trailing explanation text, etc.
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no JSON object found');
      result = JSON.parse(jsonMatch[0]);
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
