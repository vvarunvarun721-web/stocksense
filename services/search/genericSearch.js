const { getPage, closePage } = require("../../utils/browserPool");

async function genericSearch(config, query) {

    const page = await getPage();

    try {

        console.log(`Searching ${config.platform}: ${query}`);

        // ============================================
        // 1. OPEN PLATFORM
        // ============================================

        await page.goto(config.baseUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        // ============================================
        // 2. FIND SEARCH BOX
        // ============================================

        const searchBox = page.locator(config.searchBox);

        await searchBox.waitFor({
            state: "visible",
            timeout: 15000
        });

        // ============================================
        // 3. ENTER SEARCH QUERY
        // ============================================

        await searchBox.fill(query);

        // ============================================
        // 4. SUBMIT SEARCH
        // ============================================

        await page.locator(config.searchButton).click();

        // ============================================
        // 5. WAIT FOR RESULTS
        // ============================================

        await page.locator(
            config.productCards
        ).first().waitFor({
            state: "visible",
            timeout: 15000
        });

        // ============================================
        // 6. GET PRODUCT CARDS
        // ============================================

        const cards = await page.locator(
            config.productCards
        ).all();

        console.log(
            `${config.platform}: Found ${cards.length} product cards`
        );

        const products = [];

        // ============================================
        // 7. PROCESS PRODUCTS
        // ============================================

        for (const card of cards.slice(0, 10)) {

            try {

                // ========================================
                // TITLE EXTRACTION
                // ========================================

                let title = null;

                /*
                 * First try the configured selector.
                 */
                if (config.title) {

                    const titleElement =
                        card.locator(config.title).first();

                    if (await titleElement.count()) {

                        title =
                            await titleElement.textContent();

                    }

                }

                /*
                 * Amazon often provides several versions
                 * of the product title inside the card.
                 *
                 * We collect multiple possible sources
                 * instead of trusting only one selector.
                 */

                const titleCandidates = [];

                if (title) {

                    titleCandidates.push(title);

                }

                // Amazon h2 -> a -> span
                const h2Span =
                    card.locator("h2 a span").first();

                if (await h2Span.count()) {

                    const text =
                        await h2Span.textContent();

                    if (text) {

                        titleCandidates.push(text);

                    }

                }

                // Amazon h2 -> span
                const h2SpanDirect =
                    card.locator("h2 span").first();

                if (await h2SpanDirect.count()) {

                    const text =
                        await h2SpanDirect.textContent();

                    if (text) {

                        titleCandidates.push(text);

                    }

                }

                // Amazon h2 -> a
                const h2Link =
                    card.locator("h2 a").first();

                if (await h2Link.count()) {

                    const text =
                        await h2Link.textContent();

                    if (text) {

                        titleCandidates.push(text);

                    }

                }

                // Generic h2
                const h2 =
                    card.locator("h2").first();

                if (await h2.count()) {

                    const text =
                        await h2.textContent();

                    if (text) {

                        titleCandidates.push(text);

                    }

                }

                /*
                 * Amazon product image ALT often contains
                 * the complete product title.
                 */
                const imageWithAlt =
                    card.locator("img[alt]").first();

                if (await imageWithAlt.count()) {

                    const alt =
                        await imageWithAlt.getAttribute("alt");

                    if (alt) {

                        titleCandidates.push(alt);

                    }

                }

                /*
                 * Clean all title candidates.
                 */
                const cleanedTitles =
                    titleCandidates
                        .filter(Boolean)
                        .map(text =>
                            text
                                .replace(
                                    /^Sponsored Ad\s*-\s*/i,
                                    ""
                                )
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim()
                        )
                        .filter(
                            text =>
                                text.length >= 3
                        );

                /*
                 * Choose the longest meaningful title.
                 *
                 * Example:
                 *
                 * Motorola
                 *
                 * Motorola Edge 50 Fusion
                 *
                 * We choose the second one.
                 */
                if (cleanedTitles.length > 0) {

                    title =
                        cleanedTitles.reduce(
                            (longest, current) =>
                                current.length >
                                    longest.length
                                    ? current
                                    : longest
                        );

                }

                console.log(
                    `${config.platform} EXTRACTED TITLE:`,
                    title
                );

                // ========================================
                // PRICE EXTRACTION
                // ========================================

                let priceText = null;

                const priceElement =
                    card.locator(config.price).first();

                if (await priceElement.count()) {

                    priceText =
                        await priceElement.textContent();

                }

                // ========================================
                // IMAGE EXTRACTION
                // ========================================

                let image = null;

                const imageElement =
                    card.locator(config.image).first();

                if (await imageElement.count()) {

                    image =
                        await imageElement.getAttribute("src");

                }

                /*
                 * Sometimes lazy-loaded images use data-src.
                 */
                if (!image && await imageElement.count()) {

                    image =
                        await imageElement.getAttribute(
                            "data-src"
                        );

                }

                // ========================================
                // URL EXTRACTION
                // ========================================

                let url = null;

                /*
                 * Prefer the product title link.
                 *
                 * This is much safer on Amazon than
                 * simply selecting the first <a>.
                 */

                const productLink =
                    card.locator("h2 a").first();

                if (await productLink.count()) {

                    url =
                        await productLink.getAttribute(
                            "href"
                        );

                }

                /*
                 * Fallback to any normal product link.
                 */
                if (!url) {

                    const fallbackLink =
                        card.locator(
                            "a[href*='/dp/'], a[href*='/gp/product/']"
                        ).first();

                    if (await fallbackLink.count()) {

                        url =
                            await fallbackLink.getAttribute(
                                "href"
                            );

                    }

                }

                // ========================================
                // VALIDATION
                // ========================================

                if (!title || !priceText) {

                    console.log(
                        `${config.platform}: Skipping incomplete product`
                    );

                    continue;

                }

                // ========================================
                // PRICE NORMALIZATION
                // ========================================

                const price =
                    Number(
                        priceText
                            .replace(/[₹,\s]/g, "")
                            .trim()
                    );

                if (!Number.isFinite(price)) {

                    console.log(
                        `${config.platform}: Invalid price`
                    );

                    continue;

                }

                // ========================================
                // URL NORMALIZATION
                // ========================================

                let finalUrl = null;

                if (url) {

                    try {

                        finalUrl =
                            new URL(
                                url,
                                config.baseUrl
                            ).href;

                    } catch {

                        finalUrl = null;

                    }

                }

                // ========================================
                // FINAL PRODUCT OBJECT
                // ========================================

                const product = {

                    platform:
                        config.platform,

                    title,

                    price,

                    image,

                    url: finalUrl,

                    availability: true

                };

                console.log(
                    `${config.platform}: ${title} → ₹${price}`
                );

                products.push(product);

            } catch (err) {

                console.log(
                    `${config.platform}: Failed to parse product`
                );

                console.log(
                    "Reason:",
                    err.message
                );

            }

        }

        console.log(
            `${config.platform}: Returning ${products.length} products`
        );

        return products;

    } catch (err) {

        console.error(
            `${config.platform} search failed:`,
            err.message
        );

        console.log(
            `${config.platform} current URL:`,
            page.url()
        );

        console.log(
            `${config.platform} page title:`,
            await page.title()
        );

        // ============================================
        // DEBUG SCREENSHOT
        // ============================================

        try {

            await page.screenshot({

                path:
                    `debug-${config.platform}.png`,

                fullPage: true

            });

            console.log(
                `${config.platform} debug screenshot saved`
            );

        } catch (screenshotError) {

            console.log(
                "Could not save debug screenshot:",
                screenshotError.message
            );

        }

        return [];

    } finally {

        await closePage(page);

    }

}

module.exports = genericSearch;