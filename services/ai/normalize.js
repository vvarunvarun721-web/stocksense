const groq = require("./groq");

async function normalizeProduct(title) {

    const prompt = `
You are an expert product intelligence AI.

Your job is to extract structured information from an e-commerce product title.

IMPORTANT RULES:

- Return ONLY valid JSON.
- Do NOT use markdown.
- Do NOT use \`\`\`json.
- If a value doesn't exist, return null.
- Never invent information.

Return exactly this format:

{
  "brand": null,
  "productName": null,
  "category": null,
  "weight": null,
  "flavour": null,
  "color": null,
  "model": null,
  "storage": null,
  "ram": null
}

Product Title:

${title}
`;

    const response = await groq.chat.completions.create({

        model: "llama-3.3-70b-versatile",

        messages: [
            {
                role: "user",
                content: prompt
            }
        ],

        temperature: 0

    });

    const text = response.choices[0].message.content;

    return JSON.parse(
        text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim()
    );
}

module.exports = {
    normalizeProduct
};