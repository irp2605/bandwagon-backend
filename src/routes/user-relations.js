import express from 'express';
import pool from '../config/db.js';
import { Webhook } from 'svix';
import { request } from 'http';

const router = express.Router();

router.post("/send-friend-request", async (req, res) => {
    try {
        const senderId = req.auth.userId;
        const { receiverId } = req.body;

        if (!senderId || !receiverId || senderId === receiverId) {
            return res.status(400).json({ error: "Sender ID and receiver ID must be present and distinct" });
        }

        // Check if the receiever exists
        const checkReceiverQuery = 'SELECT id FROM users WHERE clerk_id = $1';
        const receiverResult = await pool.query(checkReceiverQuery, [receiverId]);
        if (receiverResult.rowCount === 0) {
            return res.status(404).json({ error: "Receiver not found" });
        }

        // Check if the relationship already exists and the status indicates inelegibility for a new request
        const [lowerId, higherId] = senderId < receiverId ? [senderId, receiverId] : [receiverId, senderId];
        const checkRequestQuery = 'SELECT * FROM user_relations WHERE user1_id = $1 AND user2_id = $2';
        const requestResult = await pool.query(checkRequestQuery, [lowerId, higherId]);

        if (requestResult.rowCount > 0 && requestResult.rows[0].status !== 'declined') {
            return res.status(400).json({ error: "Friend request already exists or was already accepted" });
        }

        if ( requestResult.rowCount > 0 && (requestResult.rows[0].user1_blocked_user2 === true || requestResult.rows[0].user2_blocked_user1 === true)) {
            return res.status(400).json({ error: "One user has blocked the other" });
        }

        // Insert the friend request
        const insertQuery = `INSERT INTO user_relations (user1_id, user2_id, status, initiated_by) VALUES ($1, $2, 'pending', $3)`;
        await pool.query(insertQuery, [lowerId, higherId, senderId]);

        console.log(`Friend request sent from ${senderId} to ${receiverId}`);
        return res.status(200).json({ message: "Friend request sent successfully" });


    } catch (err) {
        console.error("Error sending friend request:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }


});

export default router;