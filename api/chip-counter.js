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

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "You are counting poker chips from an image for a home cash game. Chip values: " +
                chipValues +
                ". Return ONLY JSON in this exact shape: " +
                '{"counts":{"red":0,"blue":0,"black":0,"green":0},"total":0.00,"description":"short summary"}' +
                " Do not include any extra text."
            },
            {
              type: "input_image",
              image_url: "data:image/jpeg;base64," + imageBase64
            }
          ]
        }
      ]
    });

    const text = response.output_text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(500).json({ error: "Model did not return JSON", raw: text });
    }

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("chip-counter error", err);
    const msg = (err && err.message) ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
}
