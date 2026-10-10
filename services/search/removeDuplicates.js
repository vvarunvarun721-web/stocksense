function removeDuplicates(products) {

    const seen = new Set();

    return products.filter(product => {

        const key =
            (product.title || "").toLowerCase().trim();

        if (seen.has(key)) {

            return false;

        }

        seen.add(key);

        return true;

    });

}

module.exports = {
    removeDuplicates
};