/*
=====================================================
STOCKSENSE ATTRIBUTE NORMALIZER
=====================================================

Single shared normalization layer.

Responsibilities:
- Structural text normalization
- Tokenization
- Canonical tokens
- Weight normalization
- Storage normalization
- RAM normalization
- Generic attribute signal extraction

This module does NOT contain product-specific matching
logic.
=====================================================
*/


/*
=====================================================
TEXT NORMALIZATION
=====================================================
*/

function normalizeProductText(text) {

    text = String(text ?? "")
        .replace(/\bneck\s+less\b/gi, "neckless")
        .replace(/\bsleeve\s+less\b/gi, "sleeveless")
        .replace(/\bcollar\s+less\b/gi, "collarless");
    if (
        text === null ||
        text === undefined
    ) {
        return "";
    }

    let value =
        String(text)
            .normalize("NFKC")
            .trim();


    /*
    CamelCase
    */

    value =
        value.replace(
            /([a-z])([A-Z])/g,
            "$1 $2"
        );


    /*
    Letter -> uppercase sequence

    iPhone -> i Phone
    MacBook -> Mac Book
    */

    value =
        value.replace(
            /([a-z])([A-Z][a-z])/g,
            "$1 $2"
        );


    /*
    Letter / number boundaries

    iPhone15 -> iPhone 15
    800g -> 800 g
    */

    value =
        value
            .replace(
                /([A-Za-z])(\d)/g,
                "$1 $2"
            )
            .replace(
                /(\d)([A-Za-z])/g,
                "$1 $2"
            );


    value =
        value.toLowerCase();


    /*
    Common separators
    */

    value =
        value.replace(
            /[-_\/\\]+/g,
            " "
        );


    /*
    Remove punctuation
    */

    value =
        value.replace(
            /[^\w\s]+/g,
            " "
        );


    return value
        .replace(
            /\s+/g,
            " "
        )
        .trim();

}


/*
=====================================================
TOKENIZATION
=====================================================
*/

function tokenizeProductText(text) {

    const normalized =
        normalizeProductText(text);


    if (!normalized) {
        return [];
    }


    return normalized
        .split(/\s+/)
        .filter(Boolean);

}


/*
=====================================================
TOKEN CANONICALIZATION
=====================================================
*/

function canonicalizeToken(token) {

    if (!token) {
        return "";
    }


    let word =
        String(token)
            .toLowerCase()
            .trim();


    if (
        word.length <= 3
    ) {
        return word;
    }


    /*
    batteries -> battery
    */

    if (
        word.endsWith("ies") &&
        word.length > 4
    ) {

        return (
            word.slice(0, -3) +
            "y"
        );

    }


    /*
    boxes -> box
    watches -> watch
    */

    if (
        word.endsWith("es") &&
        word.length > 4
    ) {

        const base =
            word.slice(
                0,
                -2
            );


        if (
            base.endsWith("s") ||
            base.endsWith("x") ||
            base.endsWith("z") ||
            base.endsWith("ch") ||
            base.endsWith("sh")
        ) {

            return base;

        }

    }


    /*
    shirts -> shirt
    phones -> phone

    Avoid:
    glass
    wireless
    analysis
    */

    if (
        word.endsWith("s") &&
        !word.endsWith("ss") &&
        !word.endsWith("us") &&
        !word.endsWith("is") &&
        word.length > 3
    ) {

        return word.slice(
            0,
            -1
        );

    }


    return word;

}


/*
=====================================================
CANONICAL TOKENS
=====================================================
*/

function getCanonicalTokens(text) {

    return tokenizeProductText(text)
        .map(
            canonicalizeToken
        )
        .filter(Boolean);

}


/*
=====================================================
CANONICAL TEXT
=====================================================
*/

function canonicalizeProductText(text) {

    return getCanonicalTokens(text)
        .join(" ");

}


/*
=====================================================
TOKEN SET
=====================================================
*/

function getTokenSet(text) {

    return new Set(
        getCanonicalTokens(text)
    );

}


/*
=====================================================
WEIGHT NORMALIZER
=====================================================

Returns grams.

800g  -> 800
0.8kg -> 800
1kg   -> 1000

Numeric values are treated as grams.
=====================================================
*/

function normalizeWeight(text) {

    if (
        text === null ||
        text === undefined ||
        text === ""
    ) {
        return null;
    }


    if (
        typeof text === "number" &&
        Number.isFinite(text)
    ) {

        return Math.round(text);

    }


    const value =
        String(text)
            .toLowerCase();


    const match =
        value.match(
            /(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|g|gm|gram|grams)\b/
        );


    if (!match) {
        return null;
    }


    const amount =
        Number(match[1]);


    if (
        !Number.isFinite(amount)
    ) {
        return null;
    }


    const unit =
        match[2]
            .toLowerCase();


    if (
        [
            "kg",
            "kgs",
            "kilogram",
            "kilograms"
        ].includes(unit)
    ) {

        return Math.round(
            amount * 1000
        );

    }


    return Math.round(
        amount
    );

}


/*
=====================================================

STORAGE NORMALIZER

=====================================================

Converts:

128 GB
128GB
128 GB Storage
128 GB ROM

to:

128

Also supports:

1 TB
1 TB Storage
1 TB ROM

IMPORTANT:

A product title can contain both RAM and storage.

Example:

8 GB RAM, 128 GB Storage

The old implementation returned:

8

which is RAM, not storage.

This implementation first looks for an explicit
STORAGE / ROM value before falling back to a
general GB/TB match.

=====================================================
*/

function normalizeStorage(text) {

    if (
        !text
    ) {

        return null;

    }


    text =
        text
            .toString()
            .toLowerCase();


    /*
    -------------------------------------------------
    STEP 1
    EXPLICIT STORAGE / ROM VALUE

    Examples:

        128 GB Storage
        256 GB ROM
        1 TB Storage
        512GB ROM
    -------------------------------------------------
    */

    let match =
        text.match(
            /(\d+(?:\.\d+)?)\s*(gb|tb)\s*(?:storage|rom)\b/i
        );


    if (
        match
    ) {

        let value =
            parseFloat(
                match[1]
            );


        if (
            match[2].toLowerCase() ===
            "tb"
        ) {

            value *= 1024;

        }


        return value;

    }


    /*
    -------------------------------------------------
    STEP 2
    VALUE AFTER STORAGE / ROM

    Examples:

        Storage: 128 GB
        Storage 128 GB
        ROM: 256 GB
    -------------------------------------------------
    */

    match =
        text.match(
            /\b(?:storage|rom)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(gb|tb)\b/i
        );


    if (
        match
    ) {

        let value =
            parseFloat(
                match[1]
            );


        if (
            match[2].toLowerCase() ===
            "tb"
        ) {

            value *= 1024;

        }


        return value;

    }


    /*
    -------------------------------------------------
    STEP 3
    GENERAL GB / TB FALLBACK

    We skip values explicitly followed by RAM.

    Example:

        8 GB RAM
        128 GB

    The function must return:

        128
    -------------------------------------------------
    */

    const matches =
        [
            ...text.matchAll(
                /(\d+(?:\.\d+)?)\s*(gb|tb)\b/gi
            )
        ];


    for (
        const item
        of matches
    ) {

        const fullMatch =
            item[0];

        const number =
            parseFloat(
                item[1]
            );

        const unit =
            item[2].toLowerCase();

        const afterText =
            text.slice(
                item.index +
                fullMatch.length,
                item.index +
                fullMatch.length +
                20
            );


        /*
        Skip:

            8 GB RAM

        because this is RAM, not storage.
        */

        if (
            /^\s*ram\b/i.test(
                afterText
            )
        ) {

            continue;

        }


        let value =
            number;


        if (
            unit ===
            "tb"
        ) {

            value *= 1024;

        }


        return value;

    }


    return null;

}


/*
=====================================================
RAM NORMALIZER
=====================================================
*/

function normalizeRAM(text) {

    if (
        text === null ||
        text === undefined ||
        text === ""
    ) {
        return null;
    }


    if (
        typeof text === "number" &&
        Number.isFinite(text)
    ) {

        return text;

    }


    const match =
        String(text)
            .toLowerCase()
            .match(
                /(\d+(?:\.\d+)?)\s*gb\s*ram\b/
            );


    if (!match) {
        return null;
    }


    return Number(
        match[1]
    );

}


/*
=====================================================
GENERIC ATTRIBUTE GROUPS
=====================================================

These are product attributes, not product-specific
synonyms.

They allow the verification layer to detect explicit
contradictions generically.

Example:

neckless t-shirt
vs
round neck t-shirt

=====================================================
*/

const ATTRIBUTE_GROUPS = {

    neckStyle: [

        ["neckless", "neckless"],

        ["collarless", "collarless"],

        ["no collar", "collarless"],

        ["round neck", "round_neck"],

        ["roundneck", "round_neck"],

        ["crew neck", "crew_neck"],

        ["crewneck", "crew_neck"],

        ["v neck", "v_neck"],

        ["vneck", "v_neck"],

        ["polo neck", "polo"],

        ["polo", "polo"],

        ["mandarin neck", "mandarin"],

        ["mandarin", "mandarin"],

        ["turtle neck", "turtleneck"],

        ["turtleneck", "turtleneck"],

        ["mock neck", "mock_neck"],

        ["mockneck", "mock_neck"],

        ["high neck", "high_neck"],

        ["highneck", "high_neck"],

        ["zip neck", "zip_neck"],

        ["zipneck", "zip_neck"],

        ["quarter zip neck", "quarter_zip_neck"],

        ["quarter zip", "quarter_zip_neck"],

        ["henley neck", "henley"],

        ["henley", "henley"]

    ],


    fit: [

        ["oversized", "oversized"],

        ["oversize", "oversized"],

        ["loose fit", "loose"],

        ["loose", "loose"],

        ["regular fit", "regular"],

        ["regular", "regular"],

        ["slim fit", "slim"],

        ["slim", "slim"],

        ["relaxed fit", "relaxed"],

        ["relaxed", "relaxed"],

        ["baggy", "baggy"],

        ["straight fit", "straight"],

        ["straight", "straight"],

        ["skinny fit", "skinny"],

        ["skinny", "skinny"]

    ],


    sleeve: [

        ["sleeveless", "sleeveless"],

        ["full sleeve", "full_sleeve"],

        ["full sleeves", "full_sleeve"],

        ["full-sleeve", "full_sleeve"],

        ["half sleeve", "half_sleeve"],

        ["half sleeves", "half_sleeve"],

        ["half-sleeve", "half_sleeve"],

        ["short sleeve", "short_sleeve"],

        ["short sleeves", "short_sleeve"],

        ["short-sleeve", "short_sleeve"],

        ["three quarter sleeve", "three_quarter_sleeve"],

        ["3 4 sleeve", "three_quarter_sleeve"]

    ],


    gender: [

        ["men", "men"],
        ["man", "men"],
        ["mens", "men"],

        ["women", "women"],
        ["woman", "women"],
        ["womens", "women"],

        ["boys", "boys"],
        ["boy", "boys"],

        ["girls", "girls"],
        ["girl", "girls"],

        ["unisex", "unisex"]

    ],


    ageGroup: [

        ["adult", "adult"],
        ["adults", "adult"],

        ["kids", "kids"],
        ["kid", "kids"],
        ["children", "kids"],
        ["child", "kids"],

        ["baby", "baby"],
        ["babies", "baby"],
        ["infant", "baby"],
        ["infants", "baby"]

    ],


    material: [

        ["cotton", "cotton"],
        ["polyester", "polyester"],
        ["linen", "linen"],
        ["wool", "wool"],
        ["denim", "denim"],
        ["leather", "leather"],
        ["nylon", "nylon"],
        ["silk", "silk"]

    ],


    color: [

        ["black", "black"],
        ["white", "white"],
        ["red", "red"],
        ["blue", "blue"],
        ["green", "green"],
        ["yellow", "yellow"],
        ["orange", "orange"],
        ["pink", "pink"],
        ["purple", "purple"],
        ["brown", "brown"],
        ["grey", "grey"],
        ["gray", "grey"],
        ["maroon", "maroon"],
        ["navy", "navy"],
        ["beige", "beige"]

    ]

};


/*
=====================================================
PHRASE MATCH
=====================================================
*/

function phraseExists(
    normalizedText,
    phrase
) {

    const escaped =
        phrase
            .split(/\s+/)
            .map(
                part =>
                    part.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    )
            )
            .join("\\s+");


    return new RegExp(
        `(?:^|\\s)${escaped}(?=\\s|$)`,
        "i"
    ).test(
        normalizedText
    );

}


/*
=====================================================
EXTRACT ATTRIBUTE SIGNALS
=====================================================
*/

function extractAttributeSignals(text) {

    const normalized =
        normalizeProductText(text);


    const result = {};


    if (!normalized) {
        return result;
    }


    for (
        const [
            group,
            definitions
        ]
        of Object.entries(
            ATTRIBUTE_GROUPS
        )
    ) {

        const values =
            new Set();


        for (
            const [
                phrase,
                canonical
            ]
            of definitions
        ) {

            if (
                phraseExists(
                    normalized,
                    phrase
                )
            ) {

                values.add(
                    canonical
                );

            }

        }


        if (
            values.size > 0
        ) {

            result[group] =
                [...values];

        }

    }


    return result;

}


/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {

    normalizeWeight,

    normalizeStorage,

    normalizeRAM,

    normalizeProductText,

    tokenizeProductText,

    canonicalizeToken,

    getCanonicalTokens,

    canonicalizeProductText,

    getTokenSet,

    ATTRIBUTE_GROUPS,

    extractAttributeSignals

};