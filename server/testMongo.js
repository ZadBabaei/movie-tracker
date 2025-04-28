const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config();


const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String
});

const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


async function connectAndRetrieveUser() {
  try {
    console.log("🔹 Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGODB_URI, {
      writeConcern: { w: "majority" }
    });

    console.log(' Connected to MongoDB:', mongoose.connection.db.databaseName);

 
    rl.question("Enter email: ", async (email) => {
      rl.question("Enter password: ", async (password) => {
        console.log("🔹 Searching for user in the database...");

        const user = await User.findOne({ email });
        if (!user) {
          console.log(" User not found.");
        } else {
          console.log("\n User Found:");
          console.log(" ID:", user._id);
          console.log(" Name:", user.name);
          console.log(" Email:", user.email);
          console.log("Stored Password:", user.password);

          if (password === user.password) {
            console.log(" Passwords Match! Login Successful.");
          } else {
            console.log(" Passwords Do Not Match! Login Failed.");
          }
        }

        rl.close();
        mongoose.disconnect();
      });
    });

  } catch (error) {
    console.error(" Error:", error);
    mongoose.disconnect();
  }
}


connectAndRetrieveUser();
