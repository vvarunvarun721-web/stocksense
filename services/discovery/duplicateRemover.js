function removeDuplicates(products) {

    const seen = new Set();

    const unique = [];

    for (const product of products) {

        const key =
            (
                product.title || ""
            )
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim();

        if (seen.has(key)) {

            continue;

        }

        seen.add(key);

        unique.push(product);

    }

    return unique;

}

module.exports = {

    removeDuplicates

};