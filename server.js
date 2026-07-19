require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);

const analyzeRoutes = require("./routes/analyze");
app.use("/api/analyze", analyzeRoutes);

app.get('/', (req, res) => {
  res.send('StockSense server is alive 🚀');
});

require('./cron');
const checkRoutes = require('./routes/check');
app.use('/api', checkRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
