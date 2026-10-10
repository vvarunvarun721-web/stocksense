function calculateSavings(originalPrice, bestPrice) {

    if (

        originalPrice == null ||

        bestPrice == null

    ) {

        return null;

    }

    const saved = originalPrice - bestPrice;

    const percentage =

        Number(

            (

                saved / originalPrice

            ) * 100

        ).toFixed(2);

    return {

        saved,

        percentage: Number(percentage)

    };

}

module.exports = {

    calculateSavings

};