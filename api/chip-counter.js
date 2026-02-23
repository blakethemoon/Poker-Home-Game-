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
          'You are counting stacked poker chips in an image. Follow this exact algorithm.',
          '',
          '══ STEP 1 — COUNT SEAM LINES (primary method) ══',
          'Look at the side profile of each stack.',
          'Find the thin horizontal SEAM LINES — the hairline gaps or shadow lines where one chip disc',
          'ends and the next chip begins. These run the full width of the stack.',
          'Count all seam lines in the stack.',
          'chips_from_seams = seam_lines + 1',
          'Write down this number.',
          '',
          '══ STEP 2 — COUNT WHITE PATCHES (secondary method) ══',
          'Poker chips have decorative white rectangular inserts embedded in their rim.',
          'IMPORTANT: a single chip can have either 1 OR 2 white patches on its visible edge — this varies by chip set.',
          'Count every individual white patch you can see on the stack rim.',
          'Call this number total_patches.',
          '',
          'Now compute two estimates:',
          '  estimate_A = total_patches / 1   (assumes 1 insert per chip)',
          '  estimate_B = total_patches / 2   (assumes 2 inserts per chip)',
          '',
          '══ STEP 3 — CROSS-VALIDATE AND PICK ══',
          'Compare chips_from_seams to estimate_A and estimate_B.',
          'Pick the estimate that is closest to chips_from_seams. Call that chips_from_inserts.',
          'If chips_from_seams and chips_from_inserts agree (within 1) → you are confident.',
          'If they disagree, trust chips_from_seams over the insert estimate.',
          'Final chip count for the stack = chips_from_seams.',
          '',
          'Worked example:',
          '  You count 9 seam lines → chips_from_seams = 10.',
          '  You count 20 white patches → estimate_A = 20, estimate_B = 10.',
          '  estimate_B (10) matches chips_from_seams (10) → chips have 2 inserts each → final = 10.',
          '',
          'Another example:',
          '  You count 9 seam lines → chips_from_seams = 10.',
          '  You count 10 white patches → estimate_A = 10, estimate_B = 5.',
          '  estimate_A (10) matches chips_from_seams (10) → chips have 1 insert each → final = 10.',
          '',
          '══ STEP 4 — COLOR IDENTIFICATION ══',
          'To identify chip color, look at the colored body BETWEEN and BEHIND the white inserts.',
          'The dominant background color of the chip body is the chip color.',
          'NEVER call a chip white — white inserts appear on chips of every color.',
          'Examples: BLACK body = black chip. BLUE body = blue chip. RED body = red chip.',
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
                  'For each stack in the image, run the 3-step algorithm:\n' +
                  '  Step 1 — seam count: count seam lines between chip discs → chips = seams + 1.\n' +
                  '  Step 2 — patch count: count all white patches, compute patches÷1 and patches÷2.\n' +
                  '  Step 3 — pick: choose the estimate closest to the seam count; use seam count as final.\n' +
                  'Add any loose chips beside the stacks. Do not count hidden or obscured chips.\n\n' +
                  'Return ONLY a JSON object in this exact shape:\n' +
                  '{"counts":{"red":0,"blue":0,"black":0,"green":0},"total":0.00,"description":"seams gave X, patches gave Y (÷Z per chip), final=X"}'
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
