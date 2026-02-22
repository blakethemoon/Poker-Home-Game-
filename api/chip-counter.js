import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const imageBase64 = body.imageBase64;
    const chipValues = body.chipValues || "";

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You count poker chips for a live home poker game. " +
            "You MUST respond with ONLY JSON, no explanations."
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Chip values: " +
                chipValues +
                ". Count all visible poker chips. " +
                "Return ONLY JSON exactly in this shape: " +
                '{"counts":{"red":0,"blue":0,"black":0,"green":0},"total":0.00,"description":"short summary"}'
            },
            {
              type: "input_image",
              image_url: {
                url: "data:image/jpeg;base64," + imageBase64
              }
            }
          ]
        }
      ],
      max_tokens: 400
    });

    const content = (completion.choices &&
                     completion.choices[0] &&
                     completion.choices[0].message &&
                     completion.choices[0].message.content) || [];

    let text = "";
    if (Array.isArray(content)) {
      text = content.map(p => (p && p.text) ? p.text : "").join("");
    } else if (typeof content === "string") {
      text = content;
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({
        error: "Model did not return JSON",
        raw: text
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (parseErr) {
      return res.status(500).json({
        error: "Model output was not valid JSON",
        raw: text
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("chip-counter error", err);
    const msg = (err && err.message) ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
}
