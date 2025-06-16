import express from 'express';
import argon2 from 'argon2'
import pool from './config/db.js'
import { clerkClient } from '@clerk/clerk-sdk-node';

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json());

const syncUser = async (clerkUser) => {
  const { id, first_name } = clerkUser;

  if (!id) {
    throw new Error("User ID is required for syncing");
  }
  try {
    const query = 'INSERT INTO users (clerk_id, display_name, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) ON CONFLICT (clerk_id) DO UPDATE SET display_name = $2, updated_at = NOW()';
    const values = [id, first_name || 'temporary_display_name'];
    const result = await pool.query(query, values);
    if (result.rowCount === 1) {
      console.log(`User ${id} synced successfully`);
    } else {
      console.log(`User ${id} already exists, updated display name to ${first_name}`);
    }
  } catch (err) {
    console.error(`Error syncing user ${id}:`, err);
    throw new Error(`Failed to sync user ${id}`);
  }


}

const deleteUser = async (clerkUser) => {
  const query = 'DELETE FROM users WHERE clerk_id = $1';
  const values = [clerkUser.id];
  try {
    const result = await pool.query(query, values);
    if (result.rowCount === 1) {
      console.log(`User ${clerkUser.id} deleted successfully`);
    } else {
      console.log(`User ${clerkUser.id} not found for deletion`);
    }
  } catch (err) {
    console.error(`Error deleting user ${clerkUser.id}:`, err);
    throw new Error(`Failed to delete user ${clerkUser.id}`);
  }
}

app.post("/webhooks/clerk", async (req, res) => {
  const { type, data } = req.body;
  try {
    switch (type) {
      case "user.updated":
        await syncUser(data);
        res.status(200).json({ message: "User updated" });
        break;
      case "user.created":
        await syncUser(data);
        res.status(200).json({ message: "User created" });
        break;
      case "user.deleted":
        await deleteUser(data);
        res.status(200).json({ message: "User deleted" });
        break;
      default:
        res.status(400).json({ error: "Unknown event type" });
    }
  }
  catch (err) {
    console.log("Error with webhook: " + err);
    res.status(500).json({ error: "Internal Server Error" });
  }

});

app.post("/user/set-display-name", async (req, res) => {
  console.log("Setting display name for user");
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    const payload = await clerkClient.verifyToken(token);
    console.log("Payload from token:", payload);
    const { sub:userId } = payload;
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

app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
});