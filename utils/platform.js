function detectPlatform(url) {

    if (!url) return "unknown";

    url = url.toLowerCase();

    if (url.includes("amazon")) return "amazon";

    if (url.includes("flipkart")) return "flipkart";

    if (url.includes("myntra")) return "myntra";

    if (url.includes("ajio")) return "ajio";

    if (url.includes("meesho")) return "meesho";

    if (url.includes("croma")) return "croma";

    return "unknown";
}

module.exports = {
    detectPlatform
};