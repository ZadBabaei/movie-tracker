const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  writeConcern: { w: "majority" }
})
  .then(async () => {
    console.log('✅ MongoDB Connected to:', mongoose.connection.db.databaseName);

    // ✅ Log existing collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("📌 Collections in database:", collections.map(col => col.name));
    console.log("🔹 Using MongoDB URI:", process.env.MONGODB_URI);
  })
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.send('Hello from Movie Tracker Backend!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
