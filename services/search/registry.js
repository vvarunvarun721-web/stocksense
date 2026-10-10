const amazon =
    require("./platforms/amazon");

const flipkart =
    require("./platforms/flipkart");

const myntra =
    require("./platforms/myntra");

const ajio =
    require("./platforms/ajio");

const meesho =
    require("./platforms/meesho");

const reliance =
    require("./platforms/reliance");

const tatacliq =
    require("./platforms/tatacliq");

const nykaa =
    require("./platforms/nykaa");

console.log("\n==========================================");
console.log("🔍 STOCKSENSE ADAPTER RUNTIME CHECK");
console.log("==========================================");

for (const adapter of [
    amazon,
    flipkart,
    myntra,
    ajio,
    meesho,
    reliance,
    tatacliq
]) {
    console.log(
        `${adapter.platform}:`,
        "searchFast =",
        typeof adapter.searchFast,
        "| search =",
        typeof adapter.search
    );
}

console.log("==========================================\n");

module.exports = [

    amazon,
    flipkart,
    myntra,
    ajio,
    meesho,
    reliance,
    tatacliq,
    nykaa


];