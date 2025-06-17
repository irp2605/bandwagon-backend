import express from 'express';
import pool from '../config/db.js';
import { Webhook } from 'svix';

const router = express.Router();

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

router.post("/webhooks/clerk", async (req, res) => {
  const webhook = new Webhook(process.env.CLERK_WEBHOOK_SECRET);
  try {
    webhook.verify(JSON.stringify(req.body), req.headers);
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
  } catch (err) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }
  const { type, data } = req.body;
});

export default router;