const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body || {};
    const imageBase64 = body.imageBase64;
    const chipValues = body.chipValues || "";

    if (!imageBase64) {
      res.status(400).json({ error: "Missing imageBase64" });
      return;
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You count poker chips from an image for a live home cash game. " +
            "You MUST respond with ONLY a single JSON object."
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

    const content = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      res.status(500).json({
        error: "Model output was not valid JSON",
        raw: content
      });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error("chip-counter error", err);
    const msg = (err && err.message) ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
};
