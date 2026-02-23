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
          'You are looking at this image for the first time.',
          'Ignore any previous answers or prior conversation. Do not rely on memory. Start from zero.',
          'Your task is to count all poker chips in the image.',
          'Chips may be red, blue, green, or black. Color does not change how you count them. All colors follow the same physical structure and counting rules.',
          'Follow these rules exactly:',
          '1. Identify each separate stack in the image.',
          '2. For each stack, count chips independently.',
          '3. Use only one edge of the stack (preferably the LEFT edge) for counting.',
          '4. Ignore white insert rectangles completely.',
          '5. Ignore shadows, glare, and color differences.',
          '6. Focus only on visible physical chip thickness layers.',
          'Definition of one chip:',
          'A chip is one distinct horizontal thickness band that:',
          '* Has a visible top and bottom edge',
          '* Is separated from the layer above and below',
          '* Represents a full physical chip body',
          'Each distinct visible thickness band equals exactly ONE chip.',
          'Important rules:',
          '* The top flat chip face counts as one chip.',
          '* Continue counting downward until you reach the final chip touching the table.',
          '* Include the bottom-most chip even if its separation line is faint.',
          '* Do not merge compressed layers.',
          '* Do not guess hidden chips.',
          '* Only count layers that are visibly distinguishable.',
          '* Do not estimate based on typical stack sizes.',
          'Procedure:',
          'For each stack:',
          '1. Count once from top to bottom.',
          '2. Count again from bottom to top.',
          '3. If the numbers do not match, repeat until consistent.',
          'After counting all stacks:',
          '* Sum the counts from each stack.',
          '* Report each stack count and the total number of chips.',
          '',
          'After completing the chip count, identify the dominant body color of each stack',
          '(red, blue, green, or black — never white) and compute the dollar total using the',
          'chip values provided in the user message.',
          'Then output a JSON object on its own line with NO markdown fences.',
          'Respond ONLY with the stack breakdown text followed by the JSON object, no other text.'
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
                  'Apply the counting procedure exactly as instructed. Write your stack-by-stack count, then output a JSON object in this exact shape (no markdown):\n' +
                  '{"counts":{"red":0,"blue":0,"black":0,"green":0},"total":0.00,"description":"Stack 1: X chips (color) ..."}\n' +
                  'where total is the dollar value of all chips using the chip values above.'
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
