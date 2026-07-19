async function safeText(locator) {
    try {
        return await locator.first().innerText();
    } catch {
        return null;
    }
}

async function safeAttribute(locator, attribute) {
    try {
        return await locator.first().getAttribute(attribute);
    } catch {
        return null;
    }
}

module.exports = {
    safeText,
    safeAttribute
};