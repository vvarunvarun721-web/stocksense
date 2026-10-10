function isSameProduct(a, b) {

    return (

        a.brand === b.brand &&

        a.productName === b.title &&

        a.weight === b.weight &&

        a.storage === b.storage &&

        a.ram === b.ram

    );

}

module.exports = {

    isSameProduct

};