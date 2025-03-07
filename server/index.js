const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Correct API Route Registration
app.use("/api/user", require("./routes/authRoutes"));
app.use("/api/groups", require("./routes/groupRoutes"));
app.use("/api/inbox", require("./routes/inboxRoutes")); // ✅ Added inboxRoutes
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ 
    msg: "Server error", 
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});




mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(async () => {
    console.log('✅ MongoDB Connected to:', mongoose.connection.db.databaseName);

    // ✅ Log existing collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log("📌 Collections in database:", collections.map(col => col.name));
    console.log("🔹 Using MongoDB URI:", process.env.MONGODB_URI);
  })
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

app.get('/', (req, res) => {
  res.send('Hello from Movie Tracker Backend!');
});


app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    console.log(`✅ Registered Route: ${middleware.route.path}`);
  } else if (middleware.name === "router") {
    middleware.handle.stack.forEach((sub) => {
      if (sub.route) {
        console.log(`✅ Registered Route: ${sub.route.path}`);
      }
    });
  }
});




app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
