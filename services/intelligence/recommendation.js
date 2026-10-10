function recommend(products) {

    if (!products.length) {

        return null;

    }

    const sorted =

        [...products].sort(

            (a, b) =>

                b.finalScore - a.finalScore

        );

    return {

        recommended: sorted[0],

        alternatives: sorted.slice(1)

    };

}

module.exports = {

    recommend

};