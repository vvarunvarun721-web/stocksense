// ============================================================
// STOCKSENSE - IMAGE PRODUCT RESOLVER
// ============================================================
// Purpose:
//   Convert a product image URL into a structured product
//   identity that the normal StockSense pipeline can use.
//
// Input:
//   Product image URL
//
// Output:
//   Standard StockSense product object
//
// Important:
//   - Does NOT search marketplaces.
//   - Does NOT invent price.
//   - Does NOT invent specifications.
//   - Only extracts information visible/reasonably identifiable
//     from the supplied image.
// ============================================================

const Groq = require("groq-sdk");

const {
    buildProductInput
} = require("./productInputSchema");

// ------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------

const VISION_MODEL =
    process.env.STOCKSENSE_VISION_MODEL ||
    "qwen/qwen3.8-27b";

const REQUEST_TIMEOUT_MS = Number(
    process.env.STOCKSENSE_VISION_TIMEOUT_MS || 30000
);

// ------------------------------------------------------------
// GROQ CLIENT
// ------------------------------------------------------------

function getGroqClient() {
    if (!process.env.GROQ_API_KEY) {
        throw new Error(
            "GROQ_API_KEY is not configured in environment variables"
        );
    }

    return new Groq({
        apiKey: process.env.GROQ_API_KEY
    });
}

// ------------------------------------------------------------
// VISION PROMPT
// ------------------------------------------------------------

function buildVisionPrompt() {
    return `
You are the product-identification vision system for StockSense,
an e-commerce price comparison application.

Your task is to identify the product shown in the supplied image.

The image may contain:
- Product packaging
- Clothing
- Electronics
- Mobile phones
- Laptops
- Appliances
- Beauty products
- Grocery products
- Beverages
- Accessories
- Other consumer products

Your job is to extract ONLY information supported by the image.

IMPORTANT RULES:

1. DO NOT invent information.
2. If a field cannot be determined from the image, return null.
3. Do not guess an exact model number.
4. Do not guess storage, RAM, weight, quantity, flavour, colour,
   or variant unless the image provides evidence.
5. Read visible text, labels, logos, model numbers, capacities,
   package information and product markings carefully.
6. Preserve important product attributes because StockSense will
   use them later to find matching products.
7. Brand should only be returned when visible or strongly supported
   by visible branding.
8. productName should describe the actual product.
9. category should be a broad marketplace-search category.
10. model should contain a real visible/identifiable model number
    or model name when available.
11. Do not include price unless a price is clearly visible in the
    supplied image.
12. StockSense will obtain current marketplace prices separately.
13. Return valid JSON only.
14. Do not include markdown.
15. Do not include explanations outside the JSON object.

Return exactly this JSON structure:

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
  "ram": null,

  "confidence": 0,

  "evidence": {
    "visibleBrand": false,
    "visibleProductName": false,
    "visibleModel": false,
    "visibleVariant": false,
    "visibleWeight": false,
    "visibleFlavour": false,
    "visibleColor": false,
    "visibleStorage": false,
    "visibleRAM": false,
    "visibleCategory": false
  },

  "visibleText": [],
  "visualDescription": ""
}

CONFIDENCE:

Return a number between 0 and 1.

Use:
- 0.90 - 1.00 when product identity is very clear
- 0.75 - 0.89 when identity is reasonably clear
- 0.50 - 0.74 when only partial identity is available
- below 0.50 when identification is uncertain

VISIBLE TEXT:

Return important readable text from the image as an array.

Do not return every decorative word.
Prioritize:
- Brand
- Product name
- Model
- Variant
- Capacity
- Weight
- Flavour
- Storage
- RAM
- Important product markings

VISUAL DESCRIPTION:

Give a short description of what the product looks like.

Again:
DO NOT invent specifications.
DO NOT invent model numbers.
DO NOT invent attributes.
`;
}

// ------------------------------------------------------------
// JSON EXTRACTION
// ------------------------------------------------------------

function extractJsonObject(content) {
    if (!content || typeof content !== "string") {
        throw new Error(
            "Vision model returned an empty response"
        );
    }

    let text = content.trim();

    // Remove markdown code fences if the model accidentally
    // returns them.
    text = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    // First attempt: complete response is already JSON.
    try {
        return JSON.parse(text);
    } catch {
        // Continue with defensive extraction.
    }

    // Find first JSON object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
        throw new Error(
            "Vision model response did not contain a valid JSON object"
        );
    }

    const jsonText = text.slice(start, end + 1);

    try {
        return JSON.parse(jsonText);
    } catch (error) {
        throw new Error(
            `Unable to parse vision JSON response: ${error.message}`
        );
    }
}

// ------------------------------------------------------------
// CLEAN STRING
// ------------------------------------------------------------

function cleanString(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    if (typeof value !== "string") {
        return String(value).trim() || null;
    }

    const cleaned = value.trim();

    if (!cleaned) {
        return null;
    }

    const invalidValues = [
        "unknown",
        "n/a",
        "na",
        "not available",
        "not visible",
        "cannot determine",
        "cannot identify",
        "unclear",
        "none"
    ];

    if (invalidValues.includes(cleaned.toLowerCase())) {
        return null;
    }

    return cleaned;
}

// ------------------------------------------------------------
// CONFIDENCE
// ------------------------------------------------------------

function normalizeConfidence(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    if (number < 0) {
        return 0;
    }

    if (number > 1) {
        return 1;
    }

    return Number(number.toFixed(3));
}

// ------------------------------------------------------------
// EVIDENCE NORMALIZATION
// ------------------------------------------------------------

function normalizeEvidence(evidence) {
    const source =
        evidence && typeof evidence === "object"
            ? evidence
            : {};

    return {
        visibleBrand: Boolean(source.visibleBrand),
        visibleProductName: Boolean(
            source.visibleProductName
        ),
        visibleModel: Boolean(
            source.visibleModel
        ),
        visibleVariant: Boolean(
            source.visibleVariant
        ),
        visibleWeight: Boolean(
            source.visibleWeight
        ),
        visibleFlavour: Boolean(
            source.visibleFlavour
        ),
        visibleColor: Boolean(
            source.visibleColor
        ),
        visibleStorage: Boolean(
            source.visibleStorage
        ),
        visibleRAM: Boolean(
            source.visibleRAM
        ),
        visibleCategory: Boolean(
            source.visibleCategory
        )
    };
}

// ------------------------------------------------------------
// VISIBLE TEXT NORMALIZATION
// ------------------------------------------------------------

function normalizeVisibleText(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((item) => cleanString(item))
        .filter(Boolean)
        .slice(0, 30);
}

// ------------------------------------------------------------
// VALIDATE / NORMALIZE VISION RESULT
// ------------------------------------------------------------

function validateVisionResult(result) {
    if (!result || typeof result !== "object") {
        throw new Error(
            "Vision model returned an invalid product object"
        );
    }

    const identity = {
        brand: cleanString(result.brand),

        productName: cleanString(
            result.productName
        ),

        category: cleanString(
            result.category
        ),

        model: cleanString(
            result.model
        ),

        variant: cleanString(
            result.variant
        ),

        weight: cleanString(
            result.weight
        ),

        flavour: cleanString(
            result.flavour
        ),

        color: cleanString(
            result.color
        ),

        storage: cleanString(
            result.storage
        ),

        ram: cleanString(
            result.ram
        )
    };

    const evidence =
        normalizeEvidence(result.evidence);

    const confidence =
        normalizeConfidence(result.confidence);

    const visibleText =
        normalizeVisibleText(result.visibleText);

    const visualDescription =
        cleanString(result.visualDescription);

    return {
        identity,
        confidence,
        evidence,
        visibleText,
        visualDescription
    };
}

// ------------------------------------------------------------
// VISION REQUEST
// ------------------------------------------------------------

async function requestVisionAnalysis(imageUrl) {
    const groq = getGroqClient();

    console.log(
        `🖼️ Vision model: ${VISION_MODEL}`
    );

    console.log(
        "🖼️ Sending image URL to vision model..."
    );

    const controller =
        new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
        const completion =
            await groq.chat.completions.create(
                {
                    model: VISION_MODEL,

                    messages: [
                        {
                            role: "user",

                            content: [
                                {
                                    type: "text",
                                    text: buildVisionPrompt()
                                },
                                {
                                    type: "image_url",

                                    image_url: {
                                        url: imageUrl.trim()
                                    }
                                }
                            ]
                        }
                    ],

                    temperature: 0,

                    max_completion_tokens: 1200,

                    response_format: {
                        type: "json_object"
                    }
                },
                {
                    signal: controller.signal
                }
            );

        const content =
            completion?.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error(
                "Vision model returned no content"
            );
        }

        return content;
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(
                `Vision analysis timed out after ${REQUEST_TIMEOUT_MS} ms`
            );
        }

        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

// ------------------------------------------------------------
// MAIN IMAGE RESOLVER
// ------------------------------------------------------------

async function resolveImageProduct(imageUrl) {
    if (
        typeof imageUrl !== "string" ||
        !imageUrl.trim()
    ) {
        throw new Error(
            "Image URL is required"
        );
    }

    console.log(
        "🖼️ Image resolver: analyzing image"
    );

    console.log(
        "🖼️ Image URL:",
        imageUrl
    );

    const rawResponse =
        await requestVisionAnalysis(imageUrl);

    const analysis =
        validateVisionResult(
            extractJsonObject(rawResponse)
        );

    // --------------------------------------------------------
    // Build common StockSense product object.
    //
    // IMPORTANT:
    // No marketplace price is created here.
    // The image contains no authoritative current price.
    // --------------------------------------------------------

    const productInput =
        buildProductInput({
            platform: null,

            url: imageUrl,

            title: null,

            currentPrice: null,

            image: imageUrl,

            rating: null,

            reviewCount: null,

            availability: null,

            inputType: "image",

            identity: analysis.identity,

            confidence: analysis.confidence,

            evidence: analysis.evidence,

            visibleText: analysis.visibleText
        });

    // --------------------------------------------------------
    // Additional image-specific information
    // --------------------------------------------------------

    productInput.imageAnalysis = {
        confidence: analysis.confidence,

        evidence: analysis.evidence,

        visibleText: analysis.visibleText,

        visualDescription:
            analysis.visualDescription
    };

    console.log(
        "🖼️ Vision identity extracted:",
        JSON.stringify(
            productInput.identity,
            null,
            2
        )
    );

    console.log(
        "🖼️ Vision confidence:",
        analysis.confidence
    );

    return productInput;
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
    resolveImageProduct,
    requestVisionAnalysis,
    validateVisionResult
};