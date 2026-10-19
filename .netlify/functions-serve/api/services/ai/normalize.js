const groq = require("./groq");

/*
======================================================
NULL-LIKE VALUE CLEANER

AI sometimes returns:

    "null"
    "undefined"
    ""

instead of real JavaScript null.

These values must NOT become product attributes.
======================================================
*/

function cleanNullableValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return null;
  }

  if (/^(null|undefined)$/i.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/*
======================================================
REPAIR WEAK VERSION-ONLY MODEL

Example:

    productName:
        Hustle V2 Men's Shoes

    model:
        V2

becomes:

    model:
        Hustle V2

A bare "V2" is not a sufficient product identity
when a meaningful product family is present.
======================================================
*/

function repairWeakModel(model, productName) {
  const cleanModel = cleanNullableValue(model);

  const cleanProductName = cleanNullableValue(productName);

  if (!cleanProductName) {
    return cleanModel;
  }

  /*
    Version-only values are NOT strong product models.
    */

  const versionOnly = /^(?:v|ver|version)\s*\.?\s*\d+(?:\.\d+)?$/i;

  /*
    Already a meaningful model.

    Example:

        Galaxy S24
        WH-1000XM5
        LLPCM17
    */

  if (cleanModel && !versionOnly.test(cleanModel)) {
    return cleanModel;
  }

  /*
    Repair weak or missing model.

    Example:

        model = "V2"
        productName = "Hustle V2 Men's Shoes"

        result = "Hustle V2"
    */

  if (!cleanModel || versionOnly.test(cleanModel)) {
    const repaired = cleanProductName

      /*
                Remove apostrophes used in:
                    Men's
                    Women's
                */
      .replace(/['’]/g, "")

      /*
                Handle normalized:
                    men s
                    women s
                */
      .replace(/\b(?:men|women)\s+s\b/gi, " ")

      /*
                Remove common product-category suffixes
                that are not part of the core model.
                */
      .replace(
        /\b(?:men|women|unisex|boys|girls|adult|shoe|shoes|sneaker|sneakers|footwear)\b/gi,
        " ",
      )

      /*
                Clean extra spaces.
                */
      .replace(/\s+/g, " ")

      .trim();

    if (repaired) {
      return repaired;
    }
  }

  return cleanModel;
}

/*
======================================================
SAFE JSON PARSER

AI models can occasionally return small JSON
formatting errors even when instructed to return
valid JSON.

Example:

"ram": null"

This helper first tries normal JSON parsing.
If that fails, it performs a conservative cleanup
and tries again.
======================================================
*/

function parseAIJson(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  /*
    ==================================================
    EXTRACT JSON OBJECT

    Ignore accidental text before or after the JSON.
    ==================================================
    */

  const start = cleaned.indexOf("{");

  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI response does not contain a JSON object");
  }

  const jsonText = cleaned.slice(start, end + 1);

  /*
    ==================================================
    FIRST ATTEMPT

    Parse the response normally.
    ==================================================
    */

  try {
    return JSON.parse(jsonText);
  } catch (firstError) {
    console.log("⚠️ Normal JSON parsing failed. Attempting safe repair...");

    /*
        ==================================================
        SAFE REPAIR

        Fix accidental quote after:

        null"
        true"
        false"

        Example:

        "ram":null"

        becomes:

        "ram":null
        ==================================================
        */

    const repaired = jsonText

      .replace(/\bnull"\s*(?=[,}])/g, "null")

      .replace(/\btrue"\s*(?=[,}])/g, "true")

      .replace(/\bfalse"\s*(?=[,}])/g, "false");

    try {
      const parsed = JSON.parse(repaired);

      console.log("✅ AI JSON repaired successfully");

      return parsed;
    } catch (secondError) {
      console.log("❌ Repaired JSON:", repaired);

      throw new Error(`AI returned invalid JSON: ${secondError.message}`);
    }
  }
}

/*
======================================================
PRODUCT NORMALIZATION
======================================================
*/

async function normalizeProduct(title) {
  const prompt = `
Normalize this e-commerce product title.

Return ONLY valid JSON with exactly these fields:

{
  "brand": null,
  "productName": null,
  "category": null,
  "model": null,
  "variant": null,
  "weight": null,
  "flavour": null,
  "color": null,
  "storage": null,
  "ram": null
}

======================================================
IMPORTANT CORE IDENTITY RULE
======================================================

When the title clearly contains a named product
family/model, productName must represent the CORE
PRODUCT IDENTITY.

Do NOT keep unnecessary category/gender suffixes.

Example:

"Puma Hustle V2 Men's Shoes"
→ productName: "Hustle V2"

"Puma Men Hustle V2 Sneakers"
→ productName: "Hustle V2"

"Puma Hustle V2 Casual Shoes"
→ productName: "Hustle V2"

Do NOT reduce the product identity to only:

"V2"

The meaningful family name must remain part of the identity.

======================================================
IMPORTANT MODEL RULE
======================================================

The model must represent the meaningful product
identity.

Never return only a generation/version token when
the product family is also present.

INVALID:

"Puma Hustle V2 Men's Shoes"
→ model: "V2"

"Puma Hustle V 2 Men's Shoes"
→ model: "V 2"

CORRECT:

"Puma Hustle V2 Men's Shoes"
→ model: "Hustle V2"

"Puma Hustle V 2 Men's Shoes"
→ model: "Hustle V2"

A value such as:

V2
V 2
Version 2
2.0

by itself is NOT a complete model identity when a
meaningful product family is present.

======================================================
NORMALIZATION RULES
======================================================

- Never invent information.
- Preserve real model numbers exactly.
- Separate model and variant.
- Do not treat Pro, Ultra, Max, Plus, FE, SE etc.
  as a new model.
- Generic products may have model=null and
  variant=null.
- Weight must preserve the actual value and unit.
- Extract flavour/color/storage/RAM only when
  explicitly present.
- Remove promotional text, price and seller
  information.
- category should be a broad product category.
- Do not output the literal strings "null" or
  "undefined". Use JSON null.

======================================================
MODEL AND VARIANT EXAMPLES
======================================================

"Samsung Galaxy S24"
→ model: "Galaxy S24"
→ variant: null

"Samsung Galaxy S24 Ultra"
→ model: "Galaxy S24"
→ variant: "Ultra"

"Apple iPhone 16 Pro"
→ model: "iPhone 16"
→ variant: "Pro"

"Apple iPhone 16 Pro Max"
→ model: "iPhone 16"
→ variant: "Pro Max"

"Sony WH-1000XM5 Headphones"
→ model: "WH-1000XM5"
→ variant: null

"Puma Hustle V2 Men's Shoes"
→ model: "Hustle V2"
→ variant: null

======================================================
FIELD DEFINITIONS
======================================================

brand
------------------------------------------------------
Manufacturer or primary brand.

productName
------------------------------------------------------
Core product identity.

Remove:

- price
- discount
- seller information
- promotional text
- gender/category suffixes when unnecessary
- color
- storage
- RAM

model
------------------------------------------------------
Core model identity.

Keep meaningful product family names together
with their version/model identifier.

variant
------------------------------------------------------
Meaningful version such as:

Pro
Ultra
Max
Plus
FE
SE

Do NOT use storage, RAM, color or price as variant.

category
------------------------------------------------------
Broad product category.

Examples:

smartphone
laptop
headphones
shoes
smartwatch
beverages
hair care

weight
------------------------------------------------------
Only when explicitly present.

flavour
------------------------------------------------------
Only when meaningful for the product.

color
------------------------------------------------------
Only when explicitly present.

storage
------------------------------------------------------
Storage capacity only.

Examples:

128GB
256GB
1TB

ram
------------------------------------------------------
RAM capacity only.

Examples:

8GB
16GB

Do NOT treat ordinary storage as RAM.

======================================================
PRODUCT TITLE
======================================================

${title}
`;

  try {
    const aiStarted = Date.now();

    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",

      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0,

      max_completion_tokens: 500,

      reasoning_effort: "low",

      include_reasoning: false,

      response_format: {
        type: "json_schema",

        json_schema: {
          name: "product_normalization",

          strict: true,

          schema: {
            type: "object",

            properties: {
              brand: {
                type: ["string", "null"],
              },

              productName: {
                type: ["string", "null"],
              },

              category: {
                type: ["string", "null"],
              },

              model: {
                type: ["string", "null"],
              },

              variant: {
                type: ["string", "null"],
              },

              weight: {
                type: ["string", "null"],
              },

              flavour: {
                type: ["string", "null"],
              },

              color: {
                type: ["string", "null"],
              },

              storage: {
                type: ["string", "null"],
              },

              ram: {
                type: ["string", "null"],
              },
            },

            required: [
              "brand",

              "productName",

              "category",

              "model",

              "variant",

              "weight",

              "flavour",

              "color",

              "storage",

              "ram",
            ],

            additionalProperties: false,
          },
        },
      },
    });

    console.log(`⏱ Groq API request: ${Date.now() - aiStarted} ms`);

    const message = response?.choices?.[0]?.message;

    const text = message?.content;

    console.log("🤖 NORMALIZATION RAW:", text);

    console.log(
      "🤖 NORMALIZATION FINISH REASON:",
      response?.choices?.[0]?.finish_reason,
    );

    console.log("🤖 NORMALIZATION REASONING:", message?.reasoning || "");

    if (!text || typeof text !== "string") {
      throw new Error("AI normalization returned empty content");
    }

    /*
        Keep the existing debug output.
        */

    console.log("🤖 NORMALIZATION RAW:", text);

    const parseStarted = Date.now();

    const result = parseAIJson(text);

    /*
        ==================================================
        CATEGORY ALIAS NORMALIZATION

        Convert AI-specific category names into the
        fixed StockSense routing categories.
        ==================================================
        */

    const categoryAliases = {
      "nutrition drink": "beverages",

      "health drink": "beverages",

      "protein drink": "beverages",

      "health drinks": "beverages",

      "nutrition drinks": "beverages",

      beverage: "beverages",

      drinks: "beverages",
    };

    const rawCategory = cleanNullableValue(result.category);

    const normalizedCategory = rawCategory
      ? categoryAliases[rawCategory.toLowerCase().trim()] ||
        rawCategory.toLowerCase().trim()
      : null;

    console.log(`⏱ AI JSON parsing: ${Date.now() - parseStarted} ms`);

    /*
        ==================================================
        SAFETY NORMALIZATION
        ==================================================
        */

    const normalized = {
      brand: cleanNullableValue(result.brand),

      productName: cleanNullableValue(result.productName),

      category: normalizedCategory,

      model: repairWeakModel(result.model, result.productName),

      variant: cleanNullableValue(result.variant),

      weight: cleanNullableValue(result.weight),

      flavour: cleanNullableValue(result.flavour),

      color: cleanNullableValue(result.color),

      storage: cleanNullableValue(result.storage),

      ram: cleanNullableValue(result.ram),
    };

    console.log("🧠 NORMALIZED PRODUCT:", normalized);

    return normalized;
  } catch (err) {
    console.error("❌ Product normalization failed:", err.message);

    throw err;
  }
}

/*
======================================================
EXPORT
======================================================
*/

module.exports = {
  normalizeProduct,
};
