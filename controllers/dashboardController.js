const Product = require("../models/Product");
const Watchlist = require("../models/Watchlist");
const Notification = require("../models/Notification");
const SearchHistory = require("../models/searchHistory");

async function getDashboard(req, res) {

    try {

        const userId = req.user.id;

        const [

            products,

            watchlist,

            notifications,

            recentSearches

        ] = await Promise.all([

            Product.countDocuments(),

            Watchlist.countDocuments({

                userId

            }),

            Notification.countDocuments({

                userId,

                isRead: false

            }),

            SearchHistory

                .find({

                    userId

                })

                .sort({

                    createdAt: -1

                })

                .limit(5)

        ]);

        res.json({

            success: true,

            dashboard: {

                totalProducts: products,

                watchlist,

                unreadNotifications: notifications,

                recentSearches

            }

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

module.exports = {

    getDashboard

};