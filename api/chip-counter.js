import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, chipValues } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `You count poker chips for a home poker game.

Chip values:
${chipValues}

Return ONLY valid JSON in this exact format:

{
 "counts":{"red":0,"blue":0,"black":0,"green":0},
 "total":0.00,
 "description":"short summary"
}`
        },
        {
          role: "user",
          content: [
            {
              type: "input_image",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            },
            {
              type: "text",
              text: "Count all visible poker chips in this image and respect the chip values provided."
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const text = response.choices[0].message.content;
    const match = text && text.match(/\{[\s\S]*\}/);

    if (!match) {
      return res.status(500).json({ error: "No JSON returned by model" });
    }

    const parsed = JSON.parse(match[0]);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
