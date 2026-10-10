function cleanJSON(text) {

    if (!text) {
        throw new Error("AI returned empty response");
    }


    let cleaned =
        String(text)
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();


    /*
     * Find the first JSON object.
     */

    const start =
        cleaned.indexOf("{");


    const end =
        cleaned.lastIndexOf("}");


    if (
        start === -1 ||
        end === -1 ||
        end <= start
    ) {

        throw new Error(
            "No valid JSON object found in AI response"
        );

    }


    cleaned =
        cleaned.substring(
            start,
            end + 1
        );


    return cleaned;

}


module.exports = {
    cleanJSON
};