const Notification = require("../../models/Notification");

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,

  port: Number(process.env.SMTP_PORT || 587),

  secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",

  auth: {
    user: process.env.SMTP_USER,

    pass: process.env.SMTP_PASS,
  },
});

async function createNotification(
  userId,

  productId,

  title,

  message,
) {
  return await Notification.create({
    userId,

    productId,

    title,

    message,
  });
}

async function sendRestockEmail(
  email,

  userName,

  productTitle,

  currentPrice,

  productUrl,
) {
  if (!email) {
    return null;
  }

  const priceText = Number.isFinite(Number(currentPrice))
    ? `₹${Number(currentPrice).toLocaleString("en-IN")}`
    : "Price currently unavailable";

  return await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,

    to: email,

    subject: `🔔 StockSense: ${productTitle} is back in stock`,

    text:
      `Hi ${userName || "there"},\n\n` +
      `${productTitle} is back in stock.\n\n` +
      `Current price: ${priceText}\n\n` +
      `View product:\n${productUrl || "Open StockSense"}\n\n` +
      `StockSense Restock Alert`,
  });
}

async function getNotifications(userId) {
  return await Notification.find({
    userId,
  })

    .sort({
      createdAt: -1,
    });
}

async function markAsRead(notificationId) {
  return await Notification.findByIdAndUpdate(
    notificationId,

    {
      isRead: true,
    },

    {
      new: true,
    },
  );
}

module.exports = {
  createNotification,

  getNotifications,

  markAsRead,

  sendRestockEmail,
};
