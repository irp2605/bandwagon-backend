import express from 'express';
import * as userService from '../services/user-service.js';
import * as webhookService from '../services/webhook-service.js';
const router = express.Router();

router.post("/webhooks/clerk", async (req, res) => {
  console.log("Received Clerk webhook event");

  try {
    webhookService.verifyWebhook(req.body, req.headers, process.env.CLERK_WEBHOOK_SECRET);
    const { type, data } = req.body;
    try {
      switch (type) {
        case "user.updated":
          await userService.syncUser(data);
          res.status(200).json({ message: "User updated" });
          break;
        case "user.created":
          console.log("Creating user:", data);
          await userService.syncUser(data);
          res.status(200).json({ message: "User created" });
          break;
        case "user.deleted":
          await userService.deleteUser(data);
          res.status(200).json({ message: "User deleted" });
          break;
        default:
          console.log("Unknown event type:", type);
          res.status(400).json({ error: "Unknown event type" });
      }
    }
    catch (err) {
      console.log("Error with webhook: " + err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  } catch (err) {
    console.error("Invalid webhook signature:", err);
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

});

export default router;