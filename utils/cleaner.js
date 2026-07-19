function cleanPrice(price) {
    return price
        ? Number(String(price).replace(/[^\d]/g, ""))
        : null;
}

function cleanRating(rating) {
    return rating
        ? parseFloat(rating)
        : null;
}

function cleanReviewCount(reviews) {
    return reviews
        ? Number(reviews.replace(/[^\d]/g, ""))
        : null;
}

function cleanAvailability(status) {
    return status
        ? status.trim()
        : "Unknown";
}

function cleanTitle(title) {
    return title
        ? title.replace(/\|\|/g, " ").trim()
        : null;
}

module.exports = {
    cleanPrice,
    cleanRating,
    cleanReviewCount,
    cleanAvailability,
    cleanTitle
};