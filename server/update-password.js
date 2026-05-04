require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

async function main() {
  const email = String(process.env.UPDATE_USER_EMAIL || "").trim().toLowerCase();
  const newPassword = String(process.env.UPDATE_USER_PASSWORD || "");

  if (!email || !newPassword) {
    throw new Error("UPDATE_USER_EMAIL and UPDATE_USER_PASSWORD are required");
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const hash = await bcrypt.hash(newPassword, 10);

  const result = await mongoose.connection.db.collection("users").updateOne(
    { email },
    {
      $set: { password: hash, provider: "local" },
      $unset: { passwordResetToken: "", passwordResetExpires: "" }
    }
  );

  console.log({ matched: result.matchedCount, modified: result.modifiedCount });
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
