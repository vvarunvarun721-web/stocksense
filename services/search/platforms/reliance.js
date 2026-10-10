const {
    getPage,
    closePage
} = require("../../../utils/browserPool");

const BaseAdapter =
    require("./baseAdapter");


class RelianceAdapter extends BaseAdapter {

    constructor() {
        super("Reliance");
    }


    cleanText(value) {

        return (
            value ||
            ""
        )
            .replace(/\s+/g, " ")
            .trim();

    }


    parsePrice(value) {

        if (
            value === null ||
            value === undefined
        ) {
            return null;
        }

        const match =
            String(value).match(
                /₹\s*([\d,]+(?:\.\d+)?)/
            );

        if (!match) {
            return null;
        }

        const price =
            Number(
                match[1].replace(/,/g, "")
            );

        return Number.isFinite(price)
            ? price
            : null;

    }


    normalizeProductUrl(value) {

        if (
            !value ||
            typeof value !== "string"
        ) {
            return null;
        }

        try {

            const parsed =
                new URL(
                    value,
                    "https://www.reliancedigital.in"
                );

            if (
                !parsed.pathname.includes(
                    "/product/"
                )
            ) {
                return null;
            }

            return (
                "https://www.reliancedigital.in" +
                parsed.pathname
            );

        }
        catch (_) {
            return null;
        }

    }


    getQueryTokens(query) {

        return String(query || "")
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


    calculateRelevance(
        title,
        queryTokens
    ) {

        if (
            !title ||
            !queryTokens.length
        ) {
            return 0;
        }

        const titleTokens =
            new Set(
                title
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9]+/g,
                        " "
                    )
                    .split(/\s+/)
                    .filter(Boolean)
            );

        const numericTokens =
            queryTokens.filter(
                token =>
                    /\d/.test(token)
            );

        const normalTokens =
            queryTokens.filter(
                token =>
                    !/\d/.test(token)
            );

        let matched = 0;


        /*
        Numeric/model tokens are mandatory.
        */

        for (
            const token
            of numericTokens
        ) {

            if (
                !titleTokens.has(token)
            ) {
                return 0;
            }

            matched++;

        }


        /*
        Normal tokens contribute to relevance.
        */

        for (
            const token
            of normalTokens
        ) {

            if (
                titleTokens.has(token)
            ) {
                matched++;
            }

        }

        return (
            matched /
            queryTokens.length
        );

    }


    getRefinedQueries(query) {

        const original =
            String(
                query || ""
            )
                .trim();

        if (!original) {
            return [];
        }

        const tokens =
            original
                .split(/\s+/)
                .filter(Boolean);

        const queries = [];


        const add =
            value => {

                const clean =
                    String(value || "")
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();

                if (!clean) {
                    return;
                }

                const exists =
                    queries.some(
                        q =>
                            q.toLowerCase() ===
                            clean.toLowerCase()
                    );

                if (!exists) {
                    queries.push(clean);
                }

            };


        /*
        Original query first.
        */

        add(original);


        /*
        Model/number-aware refinement.
        */

        if (
            tokens.some(
                token =>
                    /\d/.test(token)
            )
        ) {

            add(
                tokens.join(" ")
            );

            add(
                `${tokens.join(" ")} 128 GB`
            );

        }


        return queries.slice(
            0,
            3
        );

    }


    async getSearchInput(page) {

        const selectors = [

            "input[placeholder='Search Products & Brands']",

            "input[placeholder*='Search Products' i]",

            "input[aria-label*='Search Products' i]",

            "input[placeholder*='Search' i]"

        ];


        for (
            const selector
            of selectors
        ) {

            try {

                const locator =
                    page.locator(
                        selector
                    );

                const count =
                    await locator
                        .count()
                        .catch(
                            () => 0
                        );

                for (
                    let i = 0;
                    i < count;
                    i++
                ) {

                    const input =
                        locator.nth(i);

                    const visible =
                        await input
                            .isVisible()
                            .catch(
                                () => false
                            );

                    if (visible) {
                        return input;
                    }

                }

            }
            catch (_) { }

        }

        return null;

    }


    async searchUsingUI(
        page,
        query
    ) {

        console.log(
            "Reliance: Opening search interface..."
        );


        await page.goto(
            "https://www.reliancedigital.in/",
            {
                waitUntil:
                    "domcontentloaded",
                timeout:
                    30000
            }
        );


        await page.waitForTimeout(
            1800
        );


        const searchInput =
            await this.getSearchInput(
                page
            );


        if (!searchInput) {

            console.log(
                "Reliance: Search input not found."
            );

            return false;

        }


        console.log(
            "Reliance: Search input found."
        );


        try {

            await searchInput.fill(
                query
            );

            await searchInput.press(
                "Enter"
            );

        }
        catch (err) {

            console.log(
                "Reliance: Search submission failed:",
                err.message
            );

            return false;

        }


        await page.waitForTimeout(
            2500
        );


        console.log(
            "Reliance search URL:",
            page.url()
        );


        console.log(
            "Reliance search title:",
            await page
                .title()
                .catch(
                    () => ""
                )
        );


        return true;

    }


    async extractProducts(page) {

        const links =
            page.locator(
                "a[href*='/product/']"
            );


        let linkCount =
            await links
                .count()
                .catch(
                    () => 0
                );


        console.log(
            `Reliance: Product links found: ${linkCount}`
        );


        if (
            linkCount === 0
        ) {

            try {

                await links
                    .first()
                    .waitFor(
                        {
                            state:
                                "attached",
                            timeout:
                                8000
                        }
                    );

            }
            catch (_) { }


            linkCount =
                await links
                    .count()
                    .catch(
                        () => 0
                    );

        }


        if (
            linkCount === 0
        ) {
            return [];
        }


        const raw =
            await links.evaluateAll(
                linkNodes => {

                    const results = [];
                    const seen = new Set();


                    const clean =
                        value =>
                            (
                                value ||
                                ""
                            )
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                    const parsePrice =
                        text => {

                            const match =
                                String(
                                    text || ""
                                ).match(
                                    /₹\s*([\d,]+(?:\.\d+)?)/
                                );

                            if (!match) {
                                return null;
                            }

                            const price =
                                Number(
                                    match[1]
                                        .replace(
                                            /,/g,
                                            ""
                                        )
                                );

                            return Number.isFinite(
                                price
                            )
                                ? price
                                : null;

                        };


                    for (
                        const link
                        of linkNodes
                    ) {

                        if (
                            results.length >= 80
                        ) {
                            break;
                        }


                        const href =
                            link.getAttribute(
                                "href"
                            );


                        if (!href) {
                            continue;
                        }


                        let url = null;


                        try {

                            const parsed =
                                new URL(
                                    href,
                                    "https://www.reliancedigital.in"
                                );


                            if (
                                !parsed.pathname.includes(
                                    "/product/"
                                )
                            ) {
                                continue;
                            }


                            url =
                                "https://www.reliancedigital.in" +
                                parsed.pathname;

                        }
                        catch (_) {
                            continue;
                        }


                        const urlKey =
                            url
                                .toLowerCase()
                                .trim();


                        if (
                            seen.has(
                                urlKey
                            )
                        ) {
                            continue;
                        }


                        /*
                        Find surrounding product card.
                        */

                        let container =
                            link;

                        let cardText = "";


                        for (
                            let level = 0;
                            level < 8 &&
                            container;
                            level++
                        ) {

                            cardText =
                                clean(
                                    container.textContent
                                );


                            if (
                                /₹\s*[\d,]+/.test(
                                    cardText
                                )
                            ) {
                                break;
                            }


                            container =
                                container.parentElement;

                        }


                        if (!container) {
                            continue;
                        }


                        /*
                        TITLE
                        */

                        let title = "";


                        const titleSelectors = [

                            "h2",
                            "h3",
                            "h4",
                            "[class*='title']",
                            "[class*='name']"

                        ];


                        for (
                            const selector
                            of titleSelectors
                        ) {

                            const element =
                                container.querySelector(
                                    selector
                                );


                            if (!element) {
                                continue;
                            }


                            const value =
                                clean(
                                    element.textContent
                                );


                            if (
                                value &&
                                value.length > 2
                            ) {

                                title =
                                    value;

                                break;

                            }

                        }


                        if (!title) {

                            title =
                                clean(
                                    link.textContent
                                );

                        }


                        if (!title) {

                            const image =
                                container.querySelector(
                                    "img"
                                );


                            if (image) {

                                title =
                                    clean(
                                        image.getAttribute(
                                            "alt"
                                        )
                                    );

                            }

                        }


                        if (!title) {
                            continue;
                        }


                        /*
                        PRICE
                        */

                        const price =
                            parsePrice(
                                cardText
                            );


                        if (
                            !Number.isFinite(
                                price
                            )
                        ) {
                            continue;
                        }


                        /*
                        =========================================================
                        IMAGE EXTRACTION
                        =========================================================

                        Reliance uses lazy-loaded product images.

                        We check:

                        1. data-src
                        2. data-lazy-src
                        3. data-original
                        4. data-original-src
                        5. data-lazy
                        6. data-image
                        7. data-image-url
                        8. data-fsrc
                        9. data-srcset
                        10. srcset
                        11. currentSrc
                        12. src

                        `src` is intentionally checked last because
                        it can still contain a lazy-loading placeholder.

                        =========================================================
                        */


                        const imageNodes =
                            Array.from(
                                container.querySelectorAll(
                                    "img"
                                )
                            );


                        const sourceNodes =
                            Array.from(
                                container.querySelectorAll(
                                    "source"
                                )
                            );


                        const imageCandidates = [];


                        /*
                        ---------------------------------------------------------
                        ADD IMAGE CANDIDATE
                        ---------------------------------------------------------
                        */

                        const addImageCandidate =
                            value => {

                                if (
                                    !value ||
                                    typeof value !== "string"
                                ) {
                                    return;
                                }


                                let clean =
                                    value.trim();


                                if (!clean) {
                                    return;
                                }


                                /*
                                Handle srcset.

                                Example:

                                image1.jpg 320w,
                                image2.jpg 640w

                                Prefer the largest descriptor.
                                */

                                if (
                                    clean.includes(",") ||
                                    /\s+\d+[wx]\b/i.test(
                                        clean
                                    )
                                ) {

                                    const candidates =
                                        clean
                                            .split(",")
                                            .map(
                                                item => {

                                                    const parts =
                                                        item
                                                            .trim()
                                                            .split(
                                                                /\s+/
                                                            );

                                                    return {
                                                        url:
                                                            parts[0] ||
                                                            "",

                                                        descriptor:
                                                            parts[1] ||
                                                            ""
                                                    };

                                                }
                                            )
                                            .filter(
                                                item =>
                                                    Boolean(
                                                        item.url
                                                    )
                                            );


                                    candidates.sort(
                                        (
                                            a,
                                            b
                                        ) => {

                                            const aMatch =
                                                a.descriptor.match(
                                                    /(\d+)(w|x)/i
                                                );

                                            const bMatch =
                                                b.descriptor.match(
                                                    /(\d+)(w|x)/i
                                                );


                                            return (
                                                Number(
                                                    bMatch
                                                        ? bMatch[1]
                                                        : 0
                                                ) -
                                                Number(
                                                    aMatch
                                                        ? aMatch[1]
                                                        : 0
                                                )
                                            );

                                        }
                                    );


                                    clean =
                                        candidates[0]?.url ||
                                        clean;

                                }


                                /*
                                Reject data/blob images.
                                */

                                const lower =
                                    clean.toLowerCase();


                                if (
                                    lower.startsWith(
                                        "data:"
                                    ) ||
                                    lower.startsWith(
                                        "blob:"
                                    )
                                ) {
                                    return;
                                }


                                /*
                                Reject obvious UI/placeholders.
                                */

                                const invalidPatterns = [

                                    "placeholder",
                                    "place-holder",

                                    "no-image",
                                    "no_image",
                                    "noimage",

                                    "default-image",
                                    "default_image",
                                    "defaultimage",

                                    "transparent.gif",
                                    "transparent.png",

                                    "1x1",

                                    "loader.gif",
                                    "loading.gif",
                                    "spinner",

                                    "favicon",
                                    "wishlist",
                                    "heart",
                                    "sprite",

                                    "logo",
                                    "icon"

                                ];


                                if (
                                    invalidPatterns.some(
                                        pattern =>
                                            lower.includes(
                                                pattern
                                            )
                                    )
                                ) {
                                    return;
                                }


                                /*
                                Convert relative URL to absolute.
                                */

                                try {

                                    clean =
                                        new URL(
                                            clean,
                                            location.origin
                                        ).href;

                                }
                                catch (_) {

                                    return;

                                }


                                /*
                                Only allow http/https.
                                */

                                if (
                                    !/^https?:\/\//i.test(
                                        clean
                                    )
                                ) {
                                    return;
                                }


                                /*
                                Reject obvious SVG/GIF UI assets.

                                We intentionally DO NOT require a
                                .jpg/.jpeg/.png extension because
                                Reliance CDN URLs can contain query
                                parameters or extension-less paths.
                                */

                                const finalLower =
                                    clean.toLowerCase();


                                if (
                                    /\.(svg|gif)(?:$|[?#])/i.test(
                                        finalLower
                                    )
                                ) {
                                    return;
                                }


                                if (
                                    !imageCandidates.includes(
                                        clean
                                    )
                                ) {

                                    imageCandidates.push(
                                        clean
                                    );

                                }

                            };


                        /*
                        ---------------------------------------------------------
                        IMG ATTRIBUTES
                        ---------------------------------------------------------
                        */

                        for (
                            const img
                            of imageNodes
                        ) {

                            /*
                            Lazy sources first.
                            */

                            addImageCandidate(
                                img.getAttribute(
                                    "data-src"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "data-lazy-src"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "data-original"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "data-original-src"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "data-lazy"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "data-image"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "data-image-url"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "data-fsrc"
                                )
                            );


                            /*
                            Responsive image sources.
                            */

                            addImageCandidate(
                                img.getAttribute(
                                    "data-srcset"
                                )
                            );


                            addImageCandidate(
                                img.getAttribute(
                                    "srcset"
                                )
                            );


                            /*
                            Browser-resolved image.

                            This becomes particularly useful after
                            we scroll the cards into view before
                            extraction.
                            */

                            addImageCandidate(
                                img.currentSrc
                            );


                            /*
                            src LAST.
                            */

                            addImageCandidate(
                                img.getAttribute(
                                    "src"
                                )
                            );

                        }


                        /*
                        ---------------------------------------------------------
                        PICTURE / SOURCE
                        ---------------------------------------------------------
                        */

                        for (
                            const source
                            of sourceNodes
                        ) {

                            addImageCandidate(
                                source.getAttribute(
                                    "data-srcset"
                                )
                            );


                            addImageCandidate(
                                source.getAttribute(
                                    "srcset"
                                )
                            );


                            addImageCandidate(
                                source.getAttribute(
                                    "data-src"
                                )
                            );

                        }


                        /*
                        ---------------------------------------------------------
                        BACKGROUND IMAGE FALLBACK
                        ---------------------------------------------------------

                        Some product cards can render images through
                        CSS background-image instead of <img>.
                        ---------------------------------------------------------
                        */

                        if (
                            imageCandidates.length === 0
                        ) {

                            const backgroundNodes =
                                Array.from(
                                    container.querySelectorAll(
                                        "[style*='background-image' i]"
                                    )
                                );


                            for (
                                const node
                                of backgroundNodes
                            ) {

                                const style =
                                    getComputedStyle(
                                        node
                                    ).backgroundImage;


                                if (
                                    !style ||
                                    style === "none"
                                ) {
                                    continue;
                                }


                                const matches =
                                    style.match(
                                        /url\((['"]?)(.*?)\1\)/i
                                    );


                                if (
                                    matches &&
                                    matches[2]
                                ) {

                                    addImageCandidate(
                                        matches[2]
                                    );

                                }

                            }

                        }


                        /*
                        ---------------------------------------------------------
                        FINAL IMAGE
                        ---------------------------------------------------------
                        */

                        const image =
                            imageCandidates[0] ||
                            null;


                        /*
                        AVAILABILITY
                        */

                        const availability =
                            !(
                                /currently unavailable/i.test(
                                    cardText
                                ) ||
                                /out of stock/i.test(
                                    cardText
                                )
                            );


                        seen.add(
                            urlKey
                        );


                        results.push({

                            platform:
                                "Reliance",

                            title,

                            price,

                            image,

                            url,

                            availability

                        });

                    }


                    return results;

                }
            );


        return raw;

    }


    rankProducts(
        products,
        originalQuery
    ) {

        const queryTokens =
            this.getQueryTokens(
                originalQuery
            );


        return products
            .map(
                product => ({

                    ...product,

                    relevance:
                        this.calculateRelevance(
                            product.title,
                            queryTokens
                        )

                })
            )
            .filter(
                product =>
                    product.relevance > 0
            )
            .sort(
                (
                    a,
                    b
                ) => {

                    if (
                        b.relevance !==
                        a.relevance
                    ) {

                        return (
                            b.relevance -
                            a.relevance
                        );

                    }


                    return (
                        a.price -
                        b.price
                    );

                }
            );

    }


    /*
    =====================================================
    FAST SEARCH
    =====================================================

    Uses Reliance's direct search URL.

    Before extraction we briefly scroll the first 12
    product cards into view. This wakes up lazy-loaded
    images so `currentSrc` / `src` can contain the
    actual product CDN image.

    =====================================================
    */

    async searchFast(
        query,
        originalProduct = {},
        options = {}
    ) {

        const started =
            Date.now();


        const requestedDeadline =
            Number.isFinite(
                options.deadline
            )
                ? options.deadline
                : Date.now() +
                (
                    Number(
                        options.timeout
                    ) || 3000
                );


        const remaining =
            Math.max(
                300,
                requestedDeadline -
                Date.now()
            );


        console.log(
            `⚡ Reliance FAST SEARCH starting with ${remaining}ms budget`
        );


        const page =
            await getPage();


        let abortHandler =
            null;


        try {

            /*
            ---------------------------------------------
            ABORT SUPPORT
            ---------------------------------------------
            */

            if (
                options.signal
            ) {

                abortHandler =
                    () => {

                        page
                            .close()
                            .catch(
                                () => { }
                            );

                    };


                options.signal.addEventListener(
                    "abort",
                    abortHandler,
                    {
                        once: true
                    }
                );

            }


            /*
            ---------------------------------------------
            DIRECT SEARCH URL
            ---------------------------------------------
            */

            const searchUrl =
                `https://www.reliancedigital.in/products?q=${encodeURIComponent(
                    String(
                        query || ""
                    ).trim()
                )}&page_no=1&page_size=12&page_type=number`;


            console.log(
                `Reliance FAST URL: ${searchUrl}`
            );


            /*
            ---------------------------------------------
            NAVIGATE
            ---------------------------------------------
            */

            await page.goto(
                searchUrl,
                {
                    waitUntil:
                        "commit",

                    timeout:
                        remaining
                }
            );


            /*
            ---------------------------------------------
            WAIT ONLY FOR PRODUCT LINKS
            ---------------------------------------------
            */

            const links =
                page.locator(
                    "a[href*='/product/']"
                );


            try {

                await links
                    .first()
                    .waitFor({
                        state:
                            "attached",

                        timeout:
                            Math.min(
                                1800,
                                Math.max(
                                    300,
                                    remaining - 100
                                )
                            )
                    });

            }
            catch (_) { }


            /*
            ---------------------------------------------
            WAKE UP LAZY-LOADED IMAGES
            ---------------------------------------------

            Reliance may not populate the actual image
            URL until the card approaches the viewport.

            We only process the first 12 product cards,
            matching the final result limit.

            50ms per card keeps this bounded while giving
            the browser enough time to trigger lazy loading.
            ---------------------------------------------
            */

            try {

                await page.evaluate(
                    async () => {

                        const productLinks =
                            Array.from(
                                document.querySelectorAll(
                                    "a[href*='/product/']"
                                )
                            )
                                .slice(
                                    0,
                                    12
                                );


                        for (
                            const link
                            of productLinks
                        ) {

                            try {

                                link.scrollIntoView({
                                    block:
                                        "center",

                                    inline:
                                        "nearest"
                                });


                                await new Promise(
                                    resolve =>
                                        setTimeout(
                                            resolve,
                                            50
                                        )
                                );

                            }
                            catch (_) { }

                        }


                        window.scrollTo(
                            0,
                            0
                        );

                    }
                );

            }
            catch (_) { }


            /*
            ---------------------------------------------
            EXTRACT
            ---------------------------------------------
            */

            const products =
                await this.extractProducts(
                    page
                );


            /*
            ---------------------------------------------
            FINAL LIMIT
            ---------------------------------------------
            */

            const finalProducts =
                Array.isArray(
                    products
                )
                    ? products.slice(
                        0,
                        12
                    )
                    : [];


            console.log(
                `✅ Reliance FAST SEARCH returning ${finalProducts.length} products in ${Date.now() - started}ms`
            );


            return finalProducts;

        }
        catch (error) {

            console.error(
                `Reliance FAST SEARCH failed: ${error.message}`
            );


            return [];

        }
        finally {

            if (
                options.signal &&
                abortHandler
            ) {

                options.signal.removeEventListener(
                    "abort",
                    abortHandler
                );

            }


            await closePage(
                page
            );

        }

    }


    async search(
        query,
        originalProduct
    ) {

        const started =
            Date.now();


        console.log(
            `Reliance: Searching "${query}"`
        );


        const page =
            await getPage();


        try {

            const queries =
                this.getRefinedQueries(
                    query
                );


            console.log(
                "Reliance: Candidate search queries:",
                queries
            );


            let ranked = [];


            /*
            =================================================
            TRY REFINED SEARCH QUERIES
            =================================================
            */

            for (
                const searchQuery
                of queries
            ) {

                console.log(
                    `Reliance: Trying "${searchQuery}"`
                );


                const success =
                    await this.searchUsingUI(
                        page,
                        searchQuery
                    );


                if (!success) {
                    continue;
                }


                /*
                Wake up the first few lazy images
                for the normal search path as well.
                */

                try {

                    await page.evaluate(
                        async () => {

                            const productLinks =
                                Array.from(
                                    document.querySelectorAll(
                                        "a[href*='/product/']"
                                    )
                                )
                                    .slice(
                                        0,
                                        12
                                    );


                            for (
                                const link
                                of productLinks
                            ) {

                                try {

                                    link.scrollIntoView({
                                        block:
                                            "center",

                                        inline:
                                            "nearest"
                                    });


                                    await new Promise(
                                        resolve =>
                                            setTimeout(
                                                resolve,
                                                40
                                            )
                                    );

                                }
                                catch (_) { }

                            }


                            window.scrollTo(
                                0,
                                0
                            );

                        }
                    );

                }
                catch (_) { }


                const products =
                    await this.extractProducts(
                        page
                    );


                console.log(
                    `Reliance: Extracted ${products.length} products`
                );


                ranked =
                    this.rankProducts(
                        products,
                        query
                    );


                if (
                    ranked.length > 0
                ) {

                    console.log(
                        `Reliance: Accepted matches from "${searchQuery}"`
                    );


                    break;

                }


                console.log(
                    `Reliance: No acceptable matches from "${searchQuery}"`
                );

            }


            /*
            =================================================
            FINAL NORMALIZATION
            =================================================
            */

            const finalProducts = [];
            const seen = new Set();


            for (
                const product
                of ranked
            ) {

                const url =
                    this.normalizeProductUrl(
                        product.url
                    );


                if (
                    !url ||
                    !product.title ||
                    !Number.isFinite(
                        Number(
                            product.price
                        )
                    )
                ) {
                    continue;
                }


                const key =
                    url
                        .toLowerCase()
                        .trim();


                if (
                    seen.has(key)
                ) {
                    continue;
                }


                seen.add(key);


                finalProducts.push({

                    platform:
                        "Reliance",

                    title:
                        this.cleanText(
                            product.title
                        ),

                    price:
                        Number(
                            product.price
                        ),

                    image:
                        product.image ||
                        null,

                    url,

                    availability:
                        product.availability !==
                        false,

                    relevance:
                        product.relevance

                });

            }


            finalProducts.sort(
                (
                    a,
                    b
                ) => {

                    if (
                        b.relevance !==
                        a.relevance
                    ) {

                        return (
                            b.relevance -
                            a.relevance
                        );

                    }


                    return (
                        a.price -
                        b.price
                    );

                }
            );


            const limited =
                finalProducts.slice(
                    0,
                    12
                );


            for (
                const product
                of limited
            ) {

                console.log(
                    `Reliance: ${product.title} → ₹${product.price}`
                );


                console.log(
                    `   🖼 Image: ${product.image || "NO IMAGE"}`
                );

            }


            console.log(
                `Reliance: Returning ${limited.length} products`
            );


            console.log(
                `⏱ Reliance: ${Date.now() -
                started
                } ms`
            );


            return limited;

        }
        catch (err) {

            console.error(
                "Reliance search failed:",
                err.message
            );


            try {

                await page.screenshot(
                    {
                        path:
                            "debug-Reliance.png",

                        fullPage:
                            true
                    }
                );


                console.log(
                    "Reliance debug screenshot saved"
                );

            }
            catch (_) { }


            return [];

        }
        finally {

            await closePage(
                page
            );

        }

    }

}


module.exports =
    new RelianceAdapter();