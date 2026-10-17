const SearchHistory = require("../../models/SearchHistory");

async function saveSearch(userId, query) {

    await SearchHistory.create({

        userId,

        query

    });

}

async function getSearchHistory(userId) {

    return await SearchHistory
        .find({ userId })
        .sort({ searchedAt: -1 })
        .limit(20);

}

module.exports = {

    saveSearch,

    getSearchHistory

};
