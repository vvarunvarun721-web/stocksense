const groq = require("./groq");

const { cleanJSON } = require("../../utils/jsonCleaner");

async function matchProducts(productA, productB) {

    const prompt = `
You are an expert product matching AI.

Compare the following two products.

Product A

${JSON.stringify(productA)}

Product B

${JSON.stringify(productB)}

Return ONLY JSON.

{
    "sameProduct": true,
    "confidence": 98,
    "reason":"..."
}
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

    const output = cleanJSON(
        response.choices[0].message.content
    );

    return JSON.parse(output);
}

module.exports = {
    matchProducts
};