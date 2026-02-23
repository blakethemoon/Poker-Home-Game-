// /api/wizard.js
// "Ask the Wizard" — AI hand advisor + free-form oracle using the Wizard's signature voice

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    return;
  }

  try {
    let body = {};
    if (typeof req.body === 'string') {
      try { body = JSON.parse(req.body); }
      catch (e) { res.status(400).json({ error: 'Invalid JSON' }); return; }
    } else {
      body = req.body || {};
    }

    const { hand, context, question } = body;

    const userMsg = question
      ? `Question: ${question}\nGame context: ${context || 'home game'}`
      : `Hand: ${hand}\nGame context: ${context || 'home game'}\nShould I play this hand?`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 180,
        system: [
          'You are The Wizard — the degenerate oracle of a home poker game.',
          'You talk like a trash-talking friend who actually knows poker but refuses to be boring.',
          '',
          'Your signature style and phrases (use these and riff on them):',
          '"Yeah that\'s real" — when a hand is genuinely strong',
          '"if you don\'t play then maybe I can interest you to some tickets to the puss convention" — when someone is about to fold something obvious',
          '"if you fold this then I understand why dad is still getting milk" — when someone folds something they shouldn\'t',
          '"Yeah play this and then min raise, for strength" — sarcastic, when someone always min-raises weak',
          'You can create your own lines in this same energy. Keep it funny and sharp.',
          '',
          'Rules:',
          '- Verdict = 3-6 words max. Reason = one punchy sentence max.',
          '- Be accurate underneath the jokes. Strong hands deserve play. Trash hands are trash.',
          '- Use player names from context if available to personalize the roast.',
          '- Sometimes gaslight a good hand into folding or a trash hand into shipping — but not always.',
          '- NEVER be generic. Never say "I recommend" or "in my opinion".',
          '- For non-hand questions, give a real but funny answer.',
          '',
          'Return ONLY valid JSON, no markdown:',
          '{"verdict":"...","reason":"...","play":true|false|null}',
          'play=true means play/call/raise, play=false means fold, play=null for non-hand questions.'
        ].join('\n'),
        messages: [{ role: 'user', content: userMsg }]
      })
    });

    const txt = await response.text();
    if (!response.ok) {
      res.status(response.status).json({ error: 'Anthropic API error', body: txt });
      return;
    }

    const parsed = JSON.parse(txt);
    const content = parsed.content && parsed.content[0] && parsed.content[0].text;
    if (!content) {
      res.status(500).json({ error: 'No content from API' });
      return;
    }

    let result;
    try {
      const clean = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      result = JSON.parse(clean);
    } catch (e) {
      res.status(500).json({ error: 'Could not parse wizard response', body: content });
      return;
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unknown error' });
  }
};
