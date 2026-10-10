const {

    getNotifications,

    markAsRead

} = require("../services/notification/notificationService");

async function list(req, res) {

    try {

        const {

            userId

        } = req.params;

        const notifications =

            await getNotifications(userId);

        res.json({

            success: true,

            notifications

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

async function read(req, res) {

    try {

        const {

            id

        } = req.params;

        const notification =

            await markAsRead(id);

        res.json({

            success: true,

            notification

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

    list,

    read

};