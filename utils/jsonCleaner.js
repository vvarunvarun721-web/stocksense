function cleanJSON(text) {

    return text
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

}

module.exports = {
    cleanJSON
};