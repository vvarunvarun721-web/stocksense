module.exports = {

    amazon: {

        platform: "Amazon",

        baseUrl: "https://www.amazon.in",

        searchBox: "#twotabsearchtextbox",

        searchButton: "#nav-search-submit-button",

        productCards: "[data-component-type='s-search-result']",

        title: "h2 span",

        price: ".a-price-whole",

        image: "img"

    },

    flipkart: {

        platform: "Flipkart",

        baseUrl: "https://www.flipkart.com",

        searchBox: "input[name='q']",

        productCards: "div[data-id]",

        title: "div.KzDlHZ",

        price: "div.Nx9bqj",

        image: "img"

    }

};