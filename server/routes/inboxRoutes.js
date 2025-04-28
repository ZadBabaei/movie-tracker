const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Group = require("../models/Groups");
const user = require("../models/user");
require("dotenv").config();

const router = express.Router();


router.get("/", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ msg: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = new mongoose.Types.ObjectId(decoded.id);

 
    const groups = await Group.find({
      pendingInvitations: { $elemMatch: { userId: userId } },
    })
      .select("name _id pendingInvitations")
      .lean();

   
    const formattedInvites = groups.map((group) => {
   const invitation = group.pendingInvitations.find(
     (inv) => inv.userId.toString() === userId.toString()
   );

      return {
        _id: group._id,
        type: "invitation",
        content: `${
          invitation?.inviterName || "Someone"
        } invited you to join '${group.name}'!`,
      };
    });

    return res.json(formattedInvites);
  } catch (error) {
    console.error("Error fetching inbox messages:", error);
    return res.status(500).json({ msg: "Server error", error: error.message });
  }
});

module.exports = router;
