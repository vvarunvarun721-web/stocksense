const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function normalizeProduct(title) {

    const prompt = `
You are an e-commerce product parser.

Convert this product title into JSON.

Return ONLY JSON.

Product:

${title}

Format:

{
 "brand":"",
 "model":"",
 "storage":"",
 "ram":"",
 "color":"",
 "category":""
}
`;

    const response = await groq.chat.completions.create({

        model: "llama-3.3-70b-versatile",

        messages: [
            {
                role: "user",
                content: prompt
            }
        ]

    });

    return response.choices[0].message.content;

}

module.exports = {
    normalizeProduct
};