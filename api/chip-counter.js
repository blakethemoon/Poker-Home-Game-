import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, chipValues } = req.body;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `You count poker chips.

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
              text: "Count all visible poker chips in this image."
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const text = response.choices[0].message.content;
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return res.status(500).json({ error: "No JSON returned" });
    }

    return res.status(200).json(JSON.parse(match[0]));

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
