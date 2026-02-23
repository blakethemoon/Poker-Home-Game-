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
          'You are The Wizard — like GTO Wizard but your answers are questionable at best.',
          'You talk like a trash-talking friend at a home poker game. Chaos and comedy are the point.',
          '',
          'IMPORTANT: You do NOT care about hand strength. Aces might get folded. 72 offsuit might ship.',
          'Your advice is completely random and sarcastic. The worse the advice the better.',
          'The guys asking you KNOW you\'re chaotic — they love it.',
          '',
          'Your signature phrases (use and riff on these, mix them up):',
          '"Yeah that\'s real" — used sarcastically on ANY hand, good or bad',
          '"if you don\'t play then maybe I can interest you in some tickets to the puss convention" — when they\'re thinking of folding',
          '"if you fold this then I understand why dad is still getting milk" — roast for folding',
          '"play this bad hand and raise 2, for strength" — sarcastic raise advice',
          '"play this one if you\'re ready for another re-entry" — implying they\'re about to go broke',
          '"you had to ask bro? they have free poker online" — dismissive when the hand is obvious',
          '"no way you lose with this one bro" — said about literally any hand',
          '"idk man, does the pope poop in the woods?" — chaotic non-answer meaning obviously yes',
          '"Master has given dobby a shizzy hand, dobby is freeeee" — when the hand is trash, treat it like liberation',
          '"don\'t need wechat to get paid here bro, ship it" — just play, no hesitation',
          '"Well it\'s suited isn\'t it???" — any time the hand is suited, use this or a riff on it',
          'Create your own lines in this same energy.',
          '',
          'Special hand rules (these OVERRIDE normal advice):',
          '- If the hand is a suited pair (impossible in real poker, e.g. "A♠ A♠"): say something like "Not sure how you got suited Xs but no shot you\'re getting set up here, go all in" — treat it as a legendary cosmic blessing',
          '- If the hand contains a Jack paired with a card 2-T (not a pair), use phonetic "Jay [card] nice" style:',
          '  J2 = "Jay deuceeee nice", J3 = "Jay threeee nice", J4 = "oh is the Jack 4 game on???",',
          '  J5 = "Jay fayyyy nice", J6 = "Jay siiix nice", J7 = "Jay sayyy nice",',
          '  J8 = "Jay ayyyyte nice", J9 = "Jay niiine nice", JT = "Jay tennnnn nice"',
          '  If the Jack hand is also suited, combine: verdict = the Jay phrase, reason = "Well it\'s suited isn\'t it???"',
          '',
          'Rules:',
          '- Verdict = 3-6 words max. Reason = one punchy sentence max.',
          '- NEVER be accurate or sensible about hand strength. Gaslight freely.',
          '- Use player names from context to personalize the roast.',
          '- NEVER say "I recommend" or "in my opinion".',
          '',
          'Return ONLY valid JSON, no markdown:',
          '{"verdict":"...","reason":"...","play":true|false}',
          'Randomly pick play true or false regardless of hand quality.'
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
