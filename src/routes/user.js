import express from 'express';
import pool from '../config/db.js';

const router = express.Router();

router.post("/set-display-name", async (req, res) => {
  console.log("Setting display name for user");
  try {
    const userId = req.auth.userId;
    const { displayName } = req.body;
    console.log("Request body:", req.body); // Add this
    console.log("Extracted userId:", userId);
    console.log("Extracted displayName:", displayName);
    if (!userId || !displayName) {
      return res.status(400).json({ error: "User ID and display name are required" });
    }
    const query = 'UPDATE users SET display_name = $1, updated_at = NOW() WHERE clerk_id = $2';
    const values = [displayName, userId];
    const result = await pool.query(query, values);
    if (result.rowCount === 1) {
      console.log(`Display name for user ${userId} updated to ${displayName}`);
      res.status(200).json({ message: "Display name updated successfully" });
    } else {
      console.log(`User ${userId} not found or display name unchanged`);
      res.status(404).json({ error: "User not found or display name unchanged" });
    }
  } catch (err) {
    console.log("Error setting display name: " + err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;