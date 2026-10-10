const jwt = require("jsonwebtoken");

function verifyToken(req, res, next) {

    const authHeader = req.headers.authorization;

    if (!authHeader) {

        return res.status(401).json({

            success: false,

            message: "Access denied. No token provided."

        });

    }

    const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

    try {

        const decoded = jwt.verify(

            token,

            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    }

    catch (err) {

        return res.status(401).json({

            success: false,

            message: "Invalid token."

        });

    }

}

module.exports = verifyToken;