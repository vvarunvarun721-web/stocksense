const { getPage, closePage } = require("../../../utils/browserPool");
const BaseAdapter = require("./baseAdapter");

class FlipkartAdapter extends BaseAdapter {
    constructor() {
        super("Flipkart");

        this.searchCache = new Map();
        this.inFlightSearches = new Map();

        this.cacheTtl = 60 * 1000;
        this.maxResults = 20;
    }

    cleanText(value) {
        return String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();
    }

    normalizeSearchQuery(query) {
        let value = String(query ?? "").trim();

        value = value.replace(/(\d)([a-zA-Z])/g, "$1 $2");
        value = value.replace(/([a-zA-Z])(\d)/g, "$1 $2");

        return value
            .replace(/\s+/g, " ")
            .trim();
    }

    buildSearchQuery(query, originalProduct = {}) {
        const parts = [];

        if (originalProduct.brand) {
            parts.push(String(originalProduct.brand).trim());
        }

        if (originalProduct.productName) {
            parts.push(String(originalProduct.productName).trim());
        }

        if (originalProduct.weight) {
            parts.push(String(originalProduct.weight).trim());
        }

        if (originalProduct.flavour) {
            parts.push(String(originalProduct.flavour).trim());
        }

        const intelligentQuery = this.normalizeSearchQuery(
            parts.join(" ")
        );

        return intelligentQuery || this.normalizeSearchQuery(query);
    }

    buildSearchQueries(query, originalProduct = {}) {
        const cleanMarketplaceBrand = value =>
            this.cleanText(value)
                .replace(
                    /\s+by\s+(flipkart|amazon|myntra|ajio|meesho|reliance|tatacliq|croma|vijay\s*sales)\s*$/i,
                    ""
                )
                .trim();

        const brand = cleanMarketplaceBrand(originalProduct.brand);
        const productName = this.cleanText(originalProduct.productName);
        const model = this.cleanText(originalProduct.model);
        const variant = this.cleanText(originalProduct.variant);
        const storage = this.cleanText(originalProduct.storage);
        const ram = this.cleanText(originalProduct.ram);
        const weight = this.cleanText(originalProduct.weight);
        const flavour = this.cleanText(originalProduct.flavour);
        const color = this.cleanText(originalProduct.color);

        const queries = [];

        // Q1: Full identity query
        const q1 = this.normalizeSearchQuery(
            [
                brand,
                productName,
                model,
                variant,
                storage,
                ram,
                weight,
                flavour,
                color
            ]
                .filter(Boolean)
                .join(" ")
        );

        if (q1) {
            queries.push(q1);
        }

        // Q2: Product + visible identifying attributes
        const q2 = this.normalizeSearchQuery(
            [
                brand,
                productName,
                color,
                variant,
                storage,
                ram
            ]
                .filter(Boolean)
                .join(" ")
        );

        if (q2 && !queries.includes(q2)) {
            queries.push(q2);
        }

        // Q3: Core brand + product
        const q3 = this.normalizeSearchQuery(
            [
                brand,
                productName
            ]
                .filter(Boolean)
                .join(" ")
        );

        if (q3 && !queries.includes(q3)) {
            queries.push(q3);
        }

        if (queries.length === 0 && query) {
            queries.push(
                this.normalizeSearchQuery(query)
            );
        }

        return [
            ...new Set(
                queries.filter(Boolean)
            )
        ].slice(0, 3);
    }

    getSearchCacheKey(query, originalProduct) {
        const product = originalProduct || {};

        const identity = [
            product.brand || "",
            product.productName || "",
            product.model || "",
            product.variant || "",
            product.weight || "",
            product.flavour || "",
            product.color || ""
        ]
            .map(value =>
                String(value)
                    .toLowerCase()
                    .trim()
            )
            .join("|");

        if (
            identity.replace(/\|/g, "").length > 0
        ) {
            return "specific|" + identity;
        }

        return (
            "generic|" +
            this.normalizeSearchQuery(query).toLowerCase()
        );
    }

    getCached(key) {
        const entry = this.searchCache.get(key);

        if (!entry) {
            return null;
        }

        if (
            Date.now() - entry.timestamp >
            this.cacheTtl
        ) {
            this.searchCache.delete(key);
            return null;
        }

        return entry.products.map(product => ({
            ...product
        }));
    }

    setCached(key, products) {
        this.searchCache.set(key, {
            timestamp: Date.now(),

            products: products.map(product => ({
                ...product
            }))
        });

        while (this.searchCache.size > 100) {
            const firstKey =
                this.searchCache
                    .keys()
                    .next()
                    .value;

            if (firstKey === undefined) {
                break;
            }

            this.searchCache.delete(firstKey);
        }
    }

    async dismissBlockingOverlays(page) {
        try {
            await page.keyboard.press("Escape");
        } catch (_) { }

        const buttonPatterns =
            /^(not now|maybe later|close|cancel|×|no thanks)$/i;

        const dialogButtons = page
            .locator("[role='dialog']")
            .getByRole("button", {
                name: buttonPatterns
            });

        const dialogCount =
            await dialogButtons
                .count()
                .catch(() => 0);

        for (
            let i = 0;
            i < dialogCount;
            i++
        ) {
            const button =
                dialogButtons.nth(i);

            const visible =
                await button
                    .isVisible()
                    .catch(() => false);

            if (!visible) {
                continue;
            }

            try {
                await button.click({
                    timeout: 500
                });

                return;
            } catch (_) { }
        }

        const closeButton = page
            .locator(
                "button[aria-label='Close'], " +
                "button[aria-label='close']"
            )
            .first();

        const closeVisible =
            await closeButton
                .isVisible()
                .catch(() => false);

        if (closeVisible) {
            try {
                await closeButton.click({
                    timeout: 500
                });
            } catch (_) { }
        }
    }

    async waitForProductCards(page, options = {}) {
        const selector = "div[data-id]";

        const timeout =
            Number.isFinite(options.deadline)
                ? Math.max(
                    200,
                    Math.min(
                        5000,
                        options.deadline -
                        Date.now() -
                        50
                    )
                )
                : 5000;

        try {
            await page.waitForSelector(
                selector,
                {
                    state: "attached",
                    timeout
                }
            );
        } catch (_) { }

        return page.locator(selector);
    }

    async extractProducts(page, cards = null) {
        const activeCards =
            cards ||
            await this.waitForProductCards(page);

        return activeCards.evaluateAll(
            cardNodes => {
                const LIMIT =
                    Math.min(
                        cardNodes.length,
                        20
                    );

                const products = [];

                function cleanText(value) {
                    return String(value || "")
                        .replace(/\s+/g, " ")
                        .trim();
                }

                function firstText(
                    root,
                    selectors
                ) {
                    for (
                        const selector
                        of selectors
                    ) {
                        const nodes =
                            root.querySelectorAll(
                                selector
                            );

                        for (
                            const node
                            of nodes
                        ) {
                            const text =
                                cleanText(
                                    node.textContent
                                );

                            if (
                                text.length >= 3
                            ) {
                                return text;
                            }
                        }
                    }

                    return null;
                }

                function firstAttribute(
                    root,
                    selectors,
                    attribute
                ) {
                    for (
                        const selector
                        of selectors
                    ) {
                        const nodes =
                            root.querySelectorAll(
                                selector
                            );

                        for (
                            const node
                            of nodes
                        ) {
                            const value =
                                node.getAttribute(
                                    attribute
                                );

                            if (value) {
                                return value;
                            }
                        }
                    }

                    return null;
                }

                function findProductTitle(card) {
                    const preferred =
                        firstText(
                            card,
                            [
                                "div.KzDlHZ",
                                "a.wjcEIp",
                                "a.pIpigb",
                                "div._4rR01T",
                                "div[class*='KzDl']",
                                "a[href*='/p/']",
                                "h1",
                                "h2",
                                "h3"
                            ]
                        );

                    if (preferred) {
                        return preferred;
                    }

                    const anchors =
                        card.querySelectorAll(
                            "a[href*='/p/']"
                        );

                    let best = null;

                    for (
                        const anchor
                        of anchors
                    ) {
                        const text =
                            cleanText(
                                anchor.textContent
                            );

                        if (text.length < 5) {
                            continue;
                        }

                        if (
                            !best ||
                            text.length > best.length
                        ) {
                            best = text;
                        }
                    }

                    if (best) {
                        return best;
                    }

                    const image =
                        card.querySelector(
                            "img[alt], img[title]"
                        );

                    if (image) {
                        const alt =
                            cleanText(
                                image.getAttribute(
                                    "alt"
                                ) ||
                                image.getAttribute(
                                    "title"
                                )
                            );

                        if (alt.length >= 5) {
                            return alt;
                        }
                    }

                    return null;
                }

                function findPrice(
                    card,
                    cardText
                ) {
                    const priceText =
                        firstText(
                            card,
                            [
                                "div.Nx9bqj",
                                "div._30jeq3",
                                "div._1_WHN1",
                                "[class*='Nx9bqj']",
                                "[class*='price']"
                            ]
                        );

                    const pricePatterns = [
                        /₹\s*([\d,]+(?:\.\d+)?)/i,
                        /Rs\.?\s*([\d,]+(?:\.\d+)?)/i,
                        /INR\s*([\d,]+(?:\.\d+)?)/i
                    ];

                    for (
                        const source
                        of [
                            priceText,
                            cardText
                        ].filter(Boolean)
                    ) {
                        for (
                            const pattern
                            of pricePatterns
                        ) {
                            const match =
                                source.match(
                                    pattern
                                );

                            if (!match) {
                                continue;
                            }

                            const value =
                                Number(
                                    match[1]
                                        .replace(
                                            /,/g,
                                            ""
                                        )
                                );

                            if (
                                Number.isFinite(
                                    value
                                ) &&
                                value > 0
                            ) {
                                return value;
                            }
                        }
                    }

                    const priceElements =
                        card.querySelectorAll(
                            "[class*='price'], [class*='Price']"
                        );

                    for (
                        const element
                        of priceElements
                    ) {
                        const text =
                            cleanText(
                                element.textContent
                            );

                        const numeric =
                            text.match(
                                /\b([\d,]{2,9}(?:\.\d+)?)\b/
                            );

                        if (!numeric) {
                            continue;
                        }

                        const value =
                            Number(
                                numeric[1]
                                    .replace(
                                        /,/g,
                                        ""
                                    )
                            );

                        if (
                            Number.isFinite(
                                value
                            ) &&
                            value > 0
                        ) {
                            return value;
                        }
                    }

                    return null;
                }

                for (
                    let i = 0;
                    i < LIMIT;
                    i++
                ) {
                    const card =
                        cardNodes[i];

                    if (!card) {
                        continue;
                    }

                    const cardText =
                        cleanText(
                            card.textContent
                        );

                    if (!cardText) {
                        continue;
                    }

                    const title =
                        findProductTitle(card);

                    if (!title) {
                        continue;
                    }

                    const price =
                        findPrice(
                            card,
                            cardText
                        );

                    if (
                        !Number.isFinite(price) ||
                        price <= 0
                    ) {
                        continue;
                    }

                    let href =
                        firstAttribute(
                            card,
                            ["a[href*='/p/']"],
                            "href"
                        );

                    if (href) {
                        try {
                            href =
                                new URL(
                                    href,
                                    "https://www.flipkart.com"
                                ).href;
                        } catch (_) {
                            href = null;
                        }
                    }

                    if (
                        href &&
                        (
                            href.includes(
                                "/account/"
                            ) ||
                            href.includes(
                                "/login"
                            )
                        )
                    ) {
                        href = null;
                    }

                    const image =
                        firstAttribute(
                            card,
                            ["img[src]"],
                            "src"
                        ) ||
                        firstAttribute(
                            card,
                            ["img[data-src]"],
                            "data-src"
                        );

                    const rating =
                        firstText(
                            card,
                            [
                                "div.XQDdHH",
                                "div.MKiFS6",
                                "[class*='rating']"
                            ]
                        );

                    const reviews =
                        firstText(
                            card,
                            [
                                "span.Wphh3N",
                                "span.PvbNMB",
                                "[class*='review']"
                            ]
                        );

                    const unavailable =
                        /out of stock|currently unavailable|sold out/i
                            .test(cardText);

                    products.push({
                        title,
                        price,
                        image:
                            image || null,
                        url:
                            href || null,
                        rating:
                            rating || null,
                        reviews:
                            reviews || null,
                        availability:
                            !unavailable
                    });
                }

                return products;
            }
        );
    }

    normalizeProducts(rawProducts) {
        const products = [];
        const seen = new Set();

        for (
            const product
            of rawProducts
        ) {
            if (!product) {
                continue;
            }

            const title =
                this.cleanText(
                    product.title
                );

            if (!title) {
                continue;
            }

            const price =
                Number(
                    product.price
                );

            if (
                !Number.isFinite(price)
            ) {
                continue;
            }

            const normalizedTitle =
                title
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

            const key =
                product.url
                    ? product.url
                        .toLowerCase()
                        .trim()
                    : `${normalizedTitle}|${price}`;

            if (seen.has(key)) {
                continue;
            }

            seen.add(key);

            products.push(
                this.normalize({
                    ...product,
                    title,
                    price
                })
            );
        }

        return products;
    }

    async searchSingleQuery(
        query,
        options = {}
    ) {

        const normalizedQuery =
            this.normalizeSearchQuery(
                query
            );


        const started =
            Date.now();


        const deadline =
            Number.isFinite(
                options.deadline
            )
                ? Number(
                    options.deadline
                )
                : null;


        if (
            deadline !== null &&
            deadline <= Date.now()
        ) {

            return [];

        }


        const page =
            await getPage();


        let deadlineTimer =
            null;


        try {

            /*
            =================================================
            DEADLINE WATCHER
            =================================================
            */

            if (
                deadline !== null
            ) {

                const remaining =
                    Math.max(
                        1,
                        deadline -
                        Date.now()
                    );


                deadlineTimer =
                    setTimeout(
                        async () => {

                            try {

                                await page.close();

                            }
                            catch (_) { }

                        },
                        remaining
                    );

            }


            /*
            =================================================
            BLOCK HEAVY RESOURCES
            =================================================
            */

            await page.setExtraHTTPHeaders({
                "Accept-Language":
                    "en-IN,en;q=0.9"
            });


            await page.route(
                "**/*",
                route => {

                    const resourceType =
                        route
                            .request()
                            .resourceType();


                    if (
                        resourceType ===
                        "image" ||
                        resourceType ===
                        "font" ||
                        resourceType ===
                        "media"
                    ) {

                        return route.abort();

                    }


                    return route.continue();

                }
            );


            console.log(
                `Flipkart: Query "${normalizedQuery}"`
            );


            /*
            =================================================
            SEARCH URL
            =================================================
            */

            const searchUrl =
                `https://www.flipkart.com/search?q=${encodeURIComponent(
                    normalizedQuery
                )}`;


            /*
            =================================================
            START NAVIGATION AND CARD WAIT TOGETHER
            =================================================
    
            IMPORTANT:
    
            We do NOT wait for navigation to finish before
            checking whether product cards are already present.
    
            This is the critical performance fix.
            =================================================
            */

            const navigationStarted =
                Date.now();


            const navigationRemaining =
                deadline !== null
                    ? Math.max(
                        500,
                        deadline -
                        Date.now() -
                        50
                    )
                    : 15000;


            const navigationPromise =
                page.goto(
                    searchUrl,
                    {
                        waitUntil:
                            "commit",
                        timeout:
                            Math.min(
                                15000,
                                navigationRemaining
                            )
                    }
                )
                    .catch(
                        error => {

                            console.log(
                                `Flipkart navigation warning "${normalizedQuery}": ${error.message}`
                            );

                            return null;

                        }
                    );


            /*
            =================================================
            PRODUCT CARD WAIT
            =================================================
    
            This starts immediately.
    
            If Flipkart creates the cards before navigation
            promise resolves, we can continue immediately.
            =================================================
            */

            const cardsPromise =
                this.waitForProductCards(
                    page,
                    {
                        deadline
                    }
                )
                    .catch(
                        () => null
                    );


            /*
            =================================================
            WAIT FOR THE FIRST USEFUL SIGNAL
            =================================================
    
            We prefer PRODUCT CARDS over navigation.
    
            Navigation completion alone does not mean the
            products are ready.
            =================================================
            */

            const firstSignal =
                await Promise.race([

                    cardsPromise.then(
                        cards => ({
                            type:
                                "cards",
                            cards
                        })
                    ),

                    navigationPromise.then(
                        () => ({
                            type:
                                "navigation"
                        })
                    )

                ]);


            /*
            =================================================
            IF NAVIGATION FINISHED FIRST
            =================================================
    
            The page may still be rendering products.
    
            Give the card locator the remaining time instead
            of returning immediately.
            =================================================
            */

            let cards =
                firstSignal?.cards ||
                null;


            if (
                !cards
            ) {

                const remainingForCards =
                    deadline !== null
                        ? Math.max(
                            100,
                            deadline -
                            Date.now()
                        )
                        : 5000;


                try {

                    cards =
                        await Promise.race([

                            cardsPromise,

                            new Promise(
                                resolve =>
                                    setTimeout(
                                        () =>
                                            resolve(
                                                null
                                            ),
                                        remainingForCards
                                    )
                            )

                        ]);

                }
                catch (_) {

                    cards =
                        null;

                }

            }


            /*
            =================================================
            FALLBACK LOCATOR
            =================================================
            */

            if (
                !cards
            ) {

                cards =
                    page.locator(
                        "div[data-id]"
                    );

            }


            const count =
                await cards
                    .count()
                    .catch(
                        () => 0
                    );


            console.log(
                `⏱ Flipkart navigation "${normalizedQuery}": ${Date.now() -
                navigationStarted
                } ms`
            );


            console.log(
                `Flipkart: ${normalizedQuery} → ${count} product cards`
            );


            /*
            =================================================
            NO CARDS
            =================================================
            */

            if (
                count === 0
            ) {

                /*
                One very small final check.
    
                This handles cases where the card was attached
                just after the first count.
                */

                if (
                    deadline === null ||
                    Date.now() < deadline
                ) {

                    try {

                        await page.waitForSelector(
                            "div[data-id]",
                            {
                                state:
                                    "attached",
                                timeout:
                                    Math.min(
                                        250,
                                        Math.max(
                                            1,
                                            deadline !== null
                                                ? deadline -
                                                Date.now()
                                                : 250
                                        )
                                    )
                            }
                        );

                    }
                    catch (_) { }

                }


                const retryCount =
                    await page
                        .locator(
                            "div[data-id]"
                        )
                        .count()
                        .catch(
                            () => 0
                        );


                console.log(
                    `Flipkart: ${normalizedQuery} → ${retryCount} product cards after final check`
                );


                if (
                    retryCount === 0
                ) {

                    return [];

                }


                cards =
                    page.locator(
                        "div[data-id]"
                    );

            }


            /*
            =================================================
            EXTRACT PRODUCTS
            =================================================
            */

            const rawProducts =
                await this.extractProducts(
                    page,
                    cards
                );


            /*
            IMPORTANT:
    
            Do NOT throw away already extracted products just
            because the deadline has just been crossed.
    
            SearchManager can still decide whether the result
            arrived inside its grace window.
            */

            const products =
                this.normalizeProducts(
                    rawProducts
                );


            console.log(
                `Flipkart: ${normalizedQuery} → ${products.length} normalized`
            );


            console.log(
                `⏱ Flipkart query "${normalizedQuery}": ${Date.now() -
                started
                } ms`
            );


            /*
            =================================================
            RETURN PARTIAL SUCCESS
            =================================================
            */

            if (
                products.length > 0
            ) {

                return products;

            }


            return [];

        }

        catch (
        err
        ) {

            console.error(
                `Flipkart query failed "${normalizedQuery}":`,
                err.message
            );


            return [];

        }

        finally {

            if (
                deadlineTimer
            ) {

                clearTimeout(
                    deadlineTimer
                );

            }


            await closePage(
                page
            );

        }

    }

    mergeProducts(resultSets) {
        const merged = [];
        const seen = new Set();

        for (
            const results
            of resultSets
        ) {
            if (
                !Array.isArray(
                    results
                )
            ) {
                continue;
            }

            for (
                const product
                of results
            ) {
                if (!product) {
                    continue;
                }

                const normalizedTitle =
                    String(
                        product.title ||
                        ""
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

                const key =
                    product.url
                        ? product.url
                            .toLowerCase()
                            .trim()
                        : `${normalizedTitle}|${product.price}`;

                if (seen.has(key)) {
                    continue;
                }

                seen.add(key);
                merged.push(product);
            }
        }

        return merged;
    }

    calculateIdentityScore(
        product,
        originalProduct = {}
    ) {
        if (
            !product ||
            !product.title
        ) {
            return 0;
        }

        const title =
            product.title.toLowerCase();

        let score = 0;

        if (
            originalProduct.brand
        ) {
            const brand =
                String(
                    originalProduct.brand
                )
                    .toLowerCase()
                    .trim();

            if (
                brand &&
                title.includes(brand)
            ) {
                score += 50;
            }
        }

        if (
            originalProduct.productName
        ) {
            const tokens =
                this.tokenize(
                    originalProduct.productName
                );

            if (
                tokens.length > 0
            ) {
                let matched = 0;

                for (
                    const token
                    of tokens
                ) {
                    if (
                        title.includes(
                            token
                        )
                    ) {
                        matched++;
                    }
                }

                const ratio =
                    matched /
                    tokens.length;

                if (
                    ratio === 1
                ) {
                    score += 40;
                }
                else if (
                    ratio >= 0.5
                ) {
                    score += 10;
                }
            }
        }

        if (
            originalProduct.weight
        ) {
            const weight =
                this.normalizeAttribute(
                    originalProduct.weight
                );

            const titleWeight =
                this.normalizeAttribute(
                    title
                );

            if (
                weight &&
                titleWeight.includes(
                    weight
                )
            ) {
                score += 5;
            }
        }

        if (
            originalProduct.flavour
        ) {
            const flavour =
                String(
                    originalProduct.flavour
                )
                    .toLowerCase()
                    .trim();

            if (
                flavour &&
                title.includes(
                    flavour
                )
            ) {
                score += 5;
            }
        }

        return Math.min(
            score,
            100
        );
    }

    tokenize(value) {
        return String(value ?? "")
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                " "
            )
            .split(/\s+/)
            .filter(
                token =>
                    token.length >= 2
            );
    }

    normalizeAttribute(value) {
        return String(value ?? "")
            .toLowerCase()
            .replace(/\s+/g, "")
            .trim();
    }

    sortProducts(
        products,
        originalProduct = {}
    ) {
        return [...products]
            .map(
                product => ({
                    ...product,

                    _identityScore:
                        this.calculateIdentityScore(
                            product,
                            originalProduct
                        )
                })
            )
            .sort(
                (a, b) => {
                    if (
                        b._identityScore !==
                        a._identityScore
                    ) {
                        return (
                            b._identityScore -
                            a._identityScore
                        );
                    }

                    return (
                        a.price -
                        b.price
                    );
                }
            );
    }

    cleanFinalProducts(
        products
    ) {
        return products.map(
            product => {
                const {
                    _identityScore,
                    ...cleanProduct
                } = product;

                return cleanProduct;
            }
        );
    }

    hasStrongCandidate(
        products,
        originalProduct = {}
    ) {
        if (
            !Array.isArray(
                products
            )
        ) {
            return false;
        }

        return products.some(
            product => {
                if (
                    !product ||
                    !product.title
                ) {
                    return false;
                }

                const title =
                    String(
                        product.title
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

                const brand =
                    String(
                        originalProduct.brand ||
                        ""
                    )
                        .toLowerCase()
                        .trim();

                const productName =
                    String(
                        originalProduct.productName ||
                        ""
                    )
                        .toLowerCase()
                        .trim();

                const weight =
                    String(
                        originalProduct.weight ||
                        ""
                    )
                        .toLowerCase()
                        .trim();

                const flavour =
                    String(
                        originalProduct.flavour ||
                        ""
                    )
                        .toLowerCase()
                        .trim();

                const brandMatch =
                    !brand ||
                    title.includes(
                        brand
                    );

                const productNameTokens =
                    this.tokenize(
                        productName
                    );

                const matchedNameTokens =
                    productNameTokens.filter(
                        token =>
                            title.includes(
                                token
                            )
                    );

                const nameMatch =
                    !productName ||
                    (
                        productNameTokens.length > 0 &&
                        matchedNameTokens.length ===
                        productNameTokens.length
                    );

                const normalizedTitleWeight =
                    this.normalizeAttribute(
                        title
                    );

                const normalizedWeight =
                    this.normalizeAttribute(
                        weight
                    );

                const weightMatch =
                    !weight ||
                    normalizedTitleWeight.includes(
                        normalizedWeight
                    );

                const flavourMatch =
                    !flavour ||
                    title.includes(
                        flavour
                    );

                const calculatedScore =
                    this.calculateIdentityScore(
                        product,
                        originalProduct
                    );

                const score =
                    Math.max(
                        calculatedScore,
                        Number(
                            product._identityScore ??
                            product.identityScore ??
                            0
                        )
                    );

                if (
                    score >= 90
                ) {
                    return true;
                }

                return (
                    brandMatch &&
                    nameMatch &&
                    weightMatch &&
                    flavourMatch
                );
            }
        );
    }

    async searchFast(
        query,
        originalProduct = {},
        options = {}
    ) {
        const started =
            Date.now();

        const managerDeadline =
            Number.isFinite(
                options.deadline
            )
                ? Number(
                    options.deadline
                )
                : Date.now() + 3200;

        const safetyMargin = 20;

        const deadline =
            Math.max(
                Date.now() + 250,
                managerDeadline -
                safetyMargin
            );

        console.log(
            `⚡ Flipkart: FAST SEARCH starting with ${Math.max(
                0,
                deadline -
                Date.now()
            )}ms budget`
        );

        const cacheKey =
            this.getSearchCacheKey(
                query,
                originalProduct
            );

        const cached =
            this.getCached(
                cacheKey
            );

        if (
            cached !== null
        ) {
            console.log(
                `Flipkart: FAST SEARCH cache hit → ${cached.length} products`
            );

            return cached;
        }

        const queries =
            this.buildSearchQueries(
                query,
                originalProduct
            );

        if (
            queries.length === 0
        ) {
            return [];
        }

        const specificSearch =
            Boolean(
                originalProduct &&
                (
                    originalProduct.brand ||
                    originalProduct.productName ||
                    originalProduct.model ||
                    originalProduct.variant ||
                    originalProduct.weight ||
                    originalProduct.flavour ||
                    originalProduct.color
                )
            );

        const fastQueries =
            specificSearch
                ? queries.slice(0, 2)
                : queries.slice(0, 1);

        console.log(
            "⚡ Flipkart FAST SEARCH queries:",
            fastQueries
        );

        const completedResults =
            [];

        const queryPromises =
            fastQueries.map(
                (
                    searchQuery,
                    index
                ) =>
                    this.searchSingleQuery(
                        searchQuery,
                        {
                            deadline
                        }
                    )
                        .then(
                            products => {
                                const safeProducts =
                                    Array.isArray(
                                        products
                                    )
                                        ? products
                                        : [];

                                completedResults[index] = {
                                    query:
                                        searchQuery,

                                    products:
                                        safeProducts
                                };

                                console.log(
                                    `📥 Flipkart FAST QUERY ${index + 1} completed: ${safeProducts.length} products`
                                );

                                return completedResults[
                                    index
                                ];
                            }
                        )
                        .catch(
                            error => {
                                completedResults[index] = {
                                    query:
                                        searchQuery,

                                    products:
                                        [],

                                    error
                                };

                                console.log(
                                    `⚠️ Flipkart FAST QUERY ${index + 1} failed: ${error.message}`
                                );

                                return completedResults[
                                    index
                                ];
                            }
                        )
            );

        try {
            const allQueriesPromise =
                Promise.all(
                    queryPromises
                );

            const remaining =
                Math.max(
                    1,
                    deadline -
                    Date.now()
                );

            const timeoutPromise =
                new Promise(
                    resolve =>
                        setTimeout(
                            () =>
                                resolve({
                                    deadline:
                                        true
                                }),
                            remaining
                        )
                );

            const raceResult =
                await Promise.race([
                    allQueriesPromise,
                    timeoutPromise
                ]);

            if (
                raceResult?.deadline
            ) {
                console.log(
                    `⏱ Flipkart: FAST SEARCH deadline reached after ${Date.now() -
                    started
                    }ms`
                );
            }

            const availableResults =
                completedResults.filter(
                    entry =>
                        entry &&
                        Array.isArray(
                            entry.products
                        )
                );

            if (
                availableResults.length === 0
            ) {
                console.log(
                    "⚠️ Flipkart FAST SEARCH: no completed query results available"
                );

                return [];
            }

            const resultSets =
                availableResults.map(
                    entry =>
                        entry.products
                );

            const mergedProducts =
                this.mergeProducts(
                    resultSets
                );

            console.log(
                `📦 Flipkart FAST SEARCH merged ${mergedProducts.length} unique products from ${availableResults.length}/${fastQueries.length} completed queries`
            );

            if (
                mergedProducts.length === 0
            ) {
                return [];
            }

            const sortedProducts =
                this.sortProducts(
                    mergedProducts,
                    originalProduct
                );

            const finalProducts =
                this.cleanFinalProducts(
                    sortedProducts.slice(
                        0,
                        this.maxResults
                    )
                );

            this.setCached(
                cacheKey,
                finalProducts
            );

            console.log(
                `✅ Flipkart: FAST SEARCH returning ${finalProducts.length} ranked products in ${Date.now() -
                started
                }ms`
            );

            for (
                const product
                of finalProducts.slice(
                    0,
                    5
                )
            ) {
                const identityScore =
                    this.calculateIdentityScore(
                        product,
                        originalProduct
                    );

                console.log(
                    `   ⭐ ${product.title} → identity score ${identityScore}`
                );
            }

            return finalProducts;
        }

        catch (error) {
            console.error(
                "Flipkart FAST SEARCH failed:",
                error.message
            );

            return [];
        }
    }

    async search(
        query,
        originalProduct = {}
    ) {
        const started =
            Date.now();

        console.log(
            `Flipkart: Searching "${query}"`
        );

        const cacheKey =
            this.getSearchCacheKey(
                query,
                originalProduct
            );

        const cached =
            this.getCached(
                cacheKey
            );

        if (
            cached !== null
        ) {
            console.log(
                "Flipkart: Using cached search session."
            );

            console.log(
                `Flipkart: Returning ${cached.length} cached products`
            );

            return cached;
        }

        let queries =
            this.buildSearchQueries(
                query,
                originalProduct
            );

        queries =
            [
                ...new Set(
                    queries
                        .map(
                            item =>
                                this.normalizeSearchQuery(
                                    item
                                )
                        )
                        .filter(Boolean)
                )
            ]
                .slice(
                    0,
                    3
                );

        if (
            queries.length === 0
        ) {
            this.setCached(
                cacheKey,
                []
            );

            return [];
        }

        const specificSearch =
            Boolean(
                originalProduct &&
                (
                    originalProduct.brand ||
                    originalProduct.productName ||
                    originalProduct.model ||
                    originalProduct.variant ||
                    originalProduct.weight ||
                    originalProduct.flavour ||
                    originalProduct.color
                )
            );

        let allProducts =
            [];

        const mergeResults =
            results => {
                if (
                    !Array.isArray(
                        results
                    )
                ) {
                    return;
                }

                allProducts.push(
                    ...results
                );

                const seen =
                    new Set();

                allProducts =
                    allProducts.filter(
                        product => {
                            if (!product) {
                                return false;
                            }

                            const title =
                                String(
                                    product.title ||
                                    ""
                                )
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim()
                                    .toLowerCase();

                            const url =
                                String(
                                    product.url ||
                                    ""
                                )
                                    .trim()
                                    .toLowerCase();

                            const key =
                                url
                                    ? `url::${url}`
                                    : `title::${title}::${product.price}`;

                            if (
                                seen.has(
                                    key
                                )
                            ) {
                                return false;
                            }

                            seen.add(
                                key
                            );

                            return true;
                        }
                    );
            };

        try {
            if (
                specificSearch &&
                queries.length > 0
            ) {
                const wave1Queries =
                    queries.slice(
                        0,
                        Math.min(
                            2,
                            queries.length
                        )
                    );

                console.log(
                    "⚡ Flipkart: Wave 1 queries in parallel:",
                    wave1Queries
                );

                const wave1Started =
                    Date.now();

                const wave1Results =
                    await Promise.all(
                        wave1Queries.map(
                            searchQuery =>
                                this.searchSingleQuery(
                                    searchQuery
                                )
                        )
                    );

                console.log(
                    `⏱ Flipkart Wave 1: ${Date.now() -
                    wave1Started
                    } ms`
                );

                for (
                    const results
                    of wave1Results
                ) {
                    mergeResults(
                        results
                    );
                }

                const wave1HasStrongCandidate =
                    wave1Results.some(
                        results =>
                            this.hasStrongCandidate(
                                results,
                                originalProduct
                            )
                    );

                if (
                    !wave1HasStrongCandidate &&
                    queries.length > 2
                ) {
                    const q3 =
                        queries[2];

                    console.log(
                        `🔄 Flipkart: Wave 1 insufficient. Running Q3: "${q3}"`
                    );

                    const q3Results =
                        await this.searchSingleQuery(
                            q3
                        );

                    mergeResults(
                        q3Results
                    );
                }
            }
            else {
                const q1 =
                    queries[0];

                const results =
                    await this.searchSingleQuery(
                        q1
                    );

                mergeResults(
                    results
                );
            }

            let finalProducts =
                this.sortProducts(
                    allProducts,
                    originalProduct
                )
                    .slice(
                        0,
                        this.maxResults
                    );

            finalProducts =
                this.cleanFinalProducts(
                    finalProducts
                );

            this.setCached(
                cacheKey,
                finalProducts
            );

            console.log(
                `Flipkart: Total unique products after merge: ${allProducts.length}`
            );

            console.log(
                `Flipkart: Returning ${finalProducts.length} products`
            );

            console.log(
                `⏱ Flipkart: TOTAL ${Date.now() -
                started
                } ms`
            );

            return finalProducts;
        }

        catch (err) {
            console.error(
                "Flipkart search failed:",
                err.message
            );

            return [];
        }
    }
}

module.exports =
    new FlipkartAdapter();