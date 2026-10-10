const {
    normalizeWeight,
    normalizeStorage,
    normalizeRAM
} = require("../../utils/attributeNormalizer");


/*
=====================================================
TEXT NORMALIZATION
=====================================================
*/

function normalizeText(value) {

    return String(
        value ?? ""
    )
        .toLowerCase()
        .replace(
            /[^a-z0-9]+/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();

}


/*
=====================================================
MODEL NORMALIZATION
=====================================================

Examples:

A-006
A 006
a006
A/006
heater_11

All become compact alphanumeric values:

a006
heater11

This allows comparison even when marketplaces format
the same model differently.
=====================================================
*/

function normalizeModel(value) {

    const text =
        normalizeText(
            value
        );

    if (
        !text
    ) {

        return null;

    }


    return text
        .replace(
            /[^a-z0-9]/g,
            ""
        )
        .trim() || null;

}


/*
=====================================================
MODEL PRESENCE CHECK
=====================================================

Important:

The old generic model extractor could see:

    HOT10 500w_red heater_11

and incorrectly choose:

    HOT10

as the candidate model.

That is wrong.

We first check whether the REQUESTED model itself
appears in the candidate title.

Examples:

requested:
    heater_11

candidate:
    HOT10 500w_red heater_11 Electric Cooking Heater

=> requested model is explicitly present
=> valid model relationship

Also supports:

A-006
A 006
A006
A/006
heater_11
heater-11
heater 11
=====================================================
*/

function modelAppearsInText(
    model,
    text
) {

    const normalizedModel =
        normalizeModel(
            model
        );


    if (
        !normalizedModel
    ) {

        return false;

    }


    const rawText =
        String(
            text ?? ""
        );


    if (
        !rawText.trim()
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    SIMPLE LETTER + NUMBER MODEL
    -------------------------------------------------

    Examples:

        a006
        heater11

    Allow separators between the letter portion
    and number portion.

    -------------------------------------------------
    */

    const simpleModelMatch =
        normalizedModel.match(
            /^([a-z]+)([0-9]+)$/i
        );


    if (
        simpleModelMatch
    ) {

        const letters =
            simpleModelMatch[1];


        const numbers =
            simpleModelMatch[2];


        const escapedLetters =
            letters.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );


        const escapedNumbers =
            numbers.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );


        const pattern =
            new RegExp(
                `(?:^|[^a-z0-9])${escapedLetters}[\\s_\\-\\/]*${escapedNumbers}(?:$|[^a-z0-9])`,
                "i"
            );


        if (
            pattern.test(
                rawText
            )
        ) {

            return true;

        }

    }


    /*
    -------------------------------------------------
    FALLBACK COMPACT CHECK
    -------------------------------------------------

    Useful for models containing letters on both sides
    of numbers.

    Example:

        SM-A556E

    normalizeModel()
        -> sma556e

    -------------------------------------------------
    */

    const compactText =
        normalizeText(
            rawText
        )
            .replace(
                /[^a-z0-9]/g,
                ""
            );


    if (
        normalizedModel.length >= 4 &&
        compactText.includes(
            normalizedModel
        )
    ) {

        return true;

    }


    return false;

}


/*
=====================================================
MODEL EXTRACTION
=====================================================

The candidate may provide its model inside the
listing title.

Examples:

"Aarav Boss Model A-006"
"Aarav Boss Electric Heater A006"
"Model A 006"

All should resolve to:

a006

IMPORTANT:

This function is only used AFTER the explicit
requested-model presence check.

That prevents a brand such as HOT10 from being
mistaken for the requested model heater_11.
=====================================================
*/

function extractModel(value) {

    /*
    ---------------------------------------------
    Already supplied as a structured model
    ---------------------------------------------
    */

    const directModel =
        normalizeModel(
            value
        );


    if (
        directModel &&
        /^[a-z]+\d+$/i.test(
            directModel
        )
    ) {

        return directModel;

    }


    /*
    ---------------------------------------------
    Search textual value for a model pattern
    ---------------------------------------------
    */

    const text =
        String(
            value ?? ""
        )
            .toLowerCase();


    /*
    ---------------------------------------------
    MODEL KEYWORD
    ---------------------------------------------

    Examples:

        model a-006
        model a006
        model a 006
        model heater_11

    ---------------------------------------------
    */

    const modelKeywordMatch =
        text.match(
            /\bmodel\s*[:#-]?\s*([a-z]{1,20})[\s_\-\/]*([0-9]{1,20})\b/i
        );


    if (
        modelKeywordMatch
    ) {

        return normalizeModel(
            `${modelKeywordMatch[1]}${modelKeywordMatch[2]}`
        );

    }


    /*
    ---------------------------------------------
    GENERIC ALPHANUMERIC MODEL PATTERN
    ---------------------------------------------

    Examples:

        A-006
        A006
        A 006
        L-088
        B0GS24Y7XB

    We avoid treating long pure numeric values
    as models.
    ---------------------------------------------
    */

    const matches =
        text.match(
            /\b[a-z]{1,20}[\s_\-\/]*\d{1,20}[a-z0-9]*\b/gi
        );


    if (
        !matches ||
        matches.length === 0
    ) {

        return null;

    }


    /*
    Prefer the first compact alphanumeric
    model-like token.

    IMPORTANT:

    This remains the fallback only.
    hasModelConflict() first checks whether the
    requested model explicitly appears in the title.
    */

    for (
        const match
        of matches
    ) {

        const normalized =
            normalizeModel(
                match
            );


        if (
            normalized &&
            /^[a-z]+\d+[a-z0-9]*$/i.test(
                normalized
            )
        ) {

            return normalized;

        }

    }


    return null;

}


/*
=====================================================
COLOR NORMALIZATION
=====================================================
*/

function normalizeColor(value) {

    let text =
        normalizeText(
            value
        );


    /*
    Remove generic colour words.

    Example:

        "Pantone Blue Surf"
        -> "blue surf"
    */

    text =
        text
            .replace(
                /\bpantone\b/g,
                " "
            )
            .replace(
                /\bcolor\b/g,
                " "
            )
            .replace(
                /\bcolour\b/g,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();


    /*
    Normalize common spelling variation.
    */

    text =
        text
            .replace(
                /\bgrey\b/g,
                "gray"
            );


    return text;

}


/*
=====================================================
COLOR TERMS
=====================================================
*/

const BASE_COLORS =
    new Set([

        "black",
        "white",
        "red",
        "blue",
        "green",
        "yellow",
        "orange",
        "pink",
        "purple",
        "brown",
        "gray",
        "grey",
        "maroon",
        "navy",
        "beige",
        "gold",
        "golden",
        "silver",
        "violet",
        "indigo",
        "teal",
        "cyan",
        "magenta"

    ]);


/*
=====================================================
COLOR MODIFIERS
=====================================================
*/

const COLOR_MODIFIERS =
    new Set([

        "surf",
        "orient",
        "ocean",
        "sky",
        "royal",
        "navy",
        "midnight",
        "aqua",
        "marine",
        "ice",
        "arctic",
        "mint",
        "lime",
        "forest",
        "olive",
        "emerald",
        "sage",
        "coral",
        "peach",
        "rose",
        "wine",
        "burgundy",
        "lavender",
        "plum",
        "cream",
        "ivory",
        "charcoal",
        "graphite",
        "space",
        "cosmic",
        "titanium",
        "phantom",
        "mist",
        "stone",
        "sand",
        "skyline",
        "turquoise",
        "electric",
        "deep",
        "light",
        "dark",
        "metallic"

    ]);


/*
=====================================================
COLOR CONFLICT DETECTION
=====================================================
*/

function hasColorConflict(
    originalColor,
    candidateTitle
) {

    const requestedColor =
        normalizeColor(
            originalColor
        );


    if (
        !requestedColor
    ) {

        return false;

    }


    const candidateText =
        normalizeText(
            candidateTitle
        );


    if (
        !candidateText
    ) {

        return false;

    }


    const requestedTokens =
        requestedColor
            .split(" ")
            .filter(
                token =>
                    token.length >= 2
            );


    if (
        requestedTokens.length === 0
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    EXACT / FULL COLOR PHRASE MATCH
    -------------------------------------------------

    Example:

        requested:
            blue surf

        candidate:
            pantone blue surf

        => valid
    -------------------------------------------------
    */

    const candidateTokens =
        candidateText.split(" ");


    const allRequestedTokensPresent =
        requestedTokens.every(
            token =>
                candidateTokens.includes(
                    token
                )
        );


    if (
        allRequestedTokensPresent
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    REQUESTED BASE COLOR
    -------------------------------------------------
    */

    const requestedBaseColor =
        requestedTokens.find(
            token =>
                BASE_COLORS.has(
                    token
                )
        );


    /*
    Unknown colour structure:
    do not reject.
    */

    if (
        !requestedBaseColor
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    REQUESTED MODIFIERS
    -------------------------------------------------
    */

    const requestedModifiers =
        requestedTokens.filter(
            token =>
                token !==
                requestedBaseColor
        );


    /*
    -------------------------------------------------
    CANDIDATE BASE COLOR
    -------------------------------------------------
    */

    if (
        !candidateTokens.includes(
            requestedBaseColor
        )
    ) {

        /*
        Missing colour evidence is not itself
        a deterministic conflict.
        */

        return false;

    }


    /*
    -------------------------------------------------
    CANDIDATE COLOR MODIFIERS
    -------------------------------------------------
    */

    const candidateModifiers =
        candidateTokens.filter(
            token =>
                COLOR_MODIFIERS.has(
                    token
                )
        );


    /*
    Requested specific shade:

        Blue Surf

    Candidate:

        Orient Blue

    Same base colour but different explicit
    modifier.

    => reject
    */

    if (
        requestedModifiers.length > 0 &&
        candidateModifiers.length > 0
    ) {

        const matchingModifier =
            requestedModifiers.some(
                modifier =>
                    candidateModifiers.includes(
                        modifier
                    )
            );


        if (
            matchingModifier
        ) {

            return false;

        }


        return true;

    }


    /*
    Candidate only exposes the base colour.

    Example:

        Requested:
            Blue Surf

        Candidate:
            Blue

    Not enough evidence for rejection.
    */

    return false;

}


/*
=====================================================
MODEL CONFLICT DETECTION
=====================================================
*/

function hasModelConflict(
    originalModel,
    candidate
) {

    const requestedModel =
        normalizeModel(
            originalModel
        );


    if (
        !requestedModel
    ) {

        return false;

    }


    const candidateTitle =
        String(
            candidate?.title ??
            ""
        ).trim();


    /*
    -------------------------------------------------
    STEP 1
    EXPLICIT REQUESTED MODEL PRESENCE
    -------------------------------------------------

    This must happen BEFORE generic extraction.

    Example:

        requested:
            heater_11

        candidate:
            HOT10 500w_red heater_11 Electric Cooking Heater

        The old extractor could incorrectly choose:
            HOT10

        The explicit requested-model check prevents
        that mistake.
    -------------------------------------------------
    */

    if (
        candidateTitle &&
        modelAppearsInText(
            requestedModel,
            candidateTitle
        )
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    STEP 2
    STRUCTURED CANDIDATE MODEL
    -------------------------------------------------

    Prefer a model supplied directly by the adapter
    or candidate normalizer.
    -------------------------------------------------
    */

    const candidateStructuredModel =
        candidate &&
            candidate.model
            ? normalizeModel(
                candidate.model
            )
            : null;


    if (
        candidateStructuredModel
    ) {

        return (
            requestedModel !==
            candidateStructuredModel
        );

    }


    /*
    -------------------------------------------------
    STEP 3
    FALLBACK MODEL EXTRACTION
    -------------------------------------------------

    Only used when the requested model was NOT
    explicitly found and there is no structured model.
    -------------------------------------------------
    */

    const candidateModel =
        extractModel(
            candidateTitle
        );


    /*
    Candidate does not expose a model.

    Missing evidence is not automatically a conflict.
    */

    if (
        !candidateModel
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    STEP 4
    EXPLICIT MODEL MISMATCH
    -------------------------------------------------
    */

    return (
        requestedModel !==
        candidateModel
    );

}


/*
=====================================================
VARIANT VALIDATION
=====================================================
*/

function validateVariant(
    original = {},
    candidate = {}
) {

    /*
    -------------------------------------------------
    MODEL
    -------------------------------------------------

    This is checked FIRST because an explicit model
    mismatch is a strong identity conflict.

    Examples:

        Original:
            A-006

        Candidate:
            A-097

        => reject

        Original:
            heater_11

        Candidate:
            HOT10 500w_red heater_11 Electric Cooking Heater

        => valid
    -------------------------------------------------
    */

    if (
        original.model &&
        hasModelConflict(
            original.model,
            candidate
        )
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    WEIGHT
    -------------------------------------------------
    */

    const originalWeight =
        normalizeWeight(
            original.weight
        );


    const candidateWeight =
        normalizeWeight(
            candidate.title
        );


    if (
        originalWeight &&
        candidateWeight &&
        originalWeight !==
        candidateWeight
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    STORAGE
    -------------------------------------------------
    */

    const originalStorage =
        normalizeStorage(
            original.storage
        );


    const candidateStorage =
        normalizeStorage(
            candidate.title
        );


    if (
        originalStorage &&
        candidateStorage &&
        originalStorage !==
        candidateStorage
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    RAM
    -------------------------------------------------
    */

    const originalRAM =
        normalizeRAM(
            original.ram
        );


    const candidateRAM =
        normalizeRAM(
            candidate.title
        );


    if (
        originalRAM &&
        candidateRAM &&
        originalRAM !==
        candidateRAM
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    COLOR
    -------------------------------------------------
    */

    if (
        original.color &&
        hasColorConflict(
            original.color,
            candidate.title
        )
    ) {

        return false;

    }


    /*
    -------------------------------------------------
    VALID
    -------------------------------------------------
    */

    return true;

}


/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {

    validateVariant,

    normalizeColor,

    hasColorConflict,

    normalizeModel,

    extractModel,

    hasModelConflict,

    modelAppearsInText

};