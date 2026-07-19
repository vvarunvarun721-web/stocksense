require("dotenv").config();

console.log("Groq Key Loaded:", process.env.GROQ_API_KEY ? "YES ✅" : "NO ❌");

const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

module.exports = groq;