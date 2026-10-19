// ============================================================
// STOCKSENSE - COMMON PRODUCT INPUT SCHEMA
// ============================================================
// Purpose:
//   Provides one standard product structure for every input type.
//
// Supported inputs:
//   1. Clean product URL
//   2. Product image URL
//
// Both are converted into the same structure before entering
// the rest of the StockSense pipeline.
// ============================================================

// ------------------------------------------------------------
// CLEAN VALUE
// ------------------------------------------------------------

function clean(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    if (typeof value === "string") {
        const result = value.trim();

        return result || null;
    }

    return value;
}

// ------------------------------------------------------------
// CONFIDENCE
// ------------------------------------------------------------

function normalizeConfidence(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.max(
        0,
        Math.min(
            1,
            Number(number.toFixed(3))
        )
    );
}

// ------------------------------------------------------------
// EVIDENCE
// ------------------------------------------------------------

function normalizeEvidence(evidence = {}) {
    return {
        visibleBrand:
            Boolean(evidence.visibleBrand),

        visibleProductName:
            Boolean(evidence.visibleProductName),

        visibleModel:
            Boolean(evidence.visibleModel),

        visibleVariant:
            Boolean(evidence.visibleVariant),

        visibleWeight:
            Boolean(evidence.visibleWeight),

        visibleFlavour:
            Boolean(evidence.visibleFlavour),

        visibleColor:
            Boolean(evidence.visibleColor),

        visibleStorage:
            Boolean(evidence.visibleStorage),

        visibleRAM:
            Boolean(evidence.visibleRAM),

        visibleCategory:
            Boolean(evidence.visibleCategory)
    };
}

// ------------------------------------------------------------
// PRODUCT IDENTITY
// ------------------------------------------------------------

function normalizeIdentity(identity = {}) {
    return {
        brand: clean(identity.brand),

        productName:
            clean(identity.productName),

        category:
            clean(identity.category),

        model:
            clean(identity.model),

        variant:
            clean(identity.variant),

        weight:
            clean(identity.weight),

        flavour:
            clean(identity.flavour),

        color:
            clean(identity.color),

        storage:
            clean(identity.storage),

        ram:
            clean(identity.ram)
    };
}

// ------------------------------------------------------------
// TITLE GENERATOR
// ------------------------------------------------------------
// Used mainly for image input.
//
// We preserve important searchable attributes in the generated
// title so the existing StockSense search pipeline can use them.
// ------------------------------------------------------------

function buildTitle(identity) {
    const parts = [];

    const fields = [
        identity.brand,
        identity.productName,
        identity.model,
        identity.variant,
        identity.weight,
        identity.flavour,
        identity.color,
        identity.storage,
        identity.ram
    ];

    for (const value of fields) {
        if (
            typeof value === "string" &&
            value.trim()
        ) {
            parts.push(value.trim());
        }
    }

    if (parts.length === 0) {
        return null;
    }

    return parts.join(" ");
}

// ------------------------------------------------------------
// COMMON PRODUCT INPUT
// ------------------------------------------------------------

function buildProductInput({
    platform = null,
    url = null,
    title = null,
    currentPrice = null,
    image = null,
    rating = null,
    reviewCount = null,
    availability = null,
    inputType = "url",
    identity = {},
    confidence = 0,
    evidence = {},
    visibleText = []
} = {}) {

    const normalizedIdentity =
        normalizeIdentity(identity);

    const generatedTitle =
        clean(title) ||
        buildTitle(normalizedIdentity);

    return {
        // ----------------------------------------------------
        // SOURCE INFORMATION
        // ----------------------------------------------------

        platform:
            clean(platform),

        url:
            clean(url),

        inputType:
            clean(inputType) || "url",

        // ----------------------------------------------------
        // BASIC PRODUCT INFORMATION
        // ----------------------------------------------------

        title:
            generatedTitle,

        image:
            clean(image),

        currentPrice:
            currentPrice !== null &&
                currentPrice !== undefined &&
                currentPrice !== "" &&
                Number.isFinite(Number(currentPrice))
                ? Number(currentPrice)
                : null,

        rating:
            rating !== null &&
                rating !== undefined &&
                rating !== "" &&
                Number.isFinite(Number(rating))
                ? Number(rating)
                : null,

        reviewCount:
            reviewCount !== null &&
                reviewCount !== undefined &&
                reviewCount !== "" &&
                Number.isFinite(Number(reviewCount))
                ? Number(reviewCount)
                : null,

        availability:
            clean(availability),

        // ----------------------------------------------------
        // NORMALIZED PRODUCT IDENTITY
        // ----------------------------------------------------

        identity:
            normalizedIdentity,

        // ----------------------------------------------------
        // IMAGE / IDENTIFICATION CONFIDENCE
        // ----------------------------------------------------

        confidence:
            normalizeConfidence(confidence),

        // ----------------------------------------------------
        // EVIDENCE
        // ----------------------------------------------------

        evidence:
            normalizeEvidence(evidence),

        // ----------------------------------------------------
        // OCR / VISIBLE TEXT
        // ----------------------------------------------------

        visibleText:
            Array.isArray(visibleText)
                ? visibleText
                    .map(clean)
                    .filter(Boolean)
                : []
    };
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
    clean,
    normalizeConfidence,
    normalizeEvidence,
    normalizeIdentity,
    buildTitle,
    buildProductInput
};