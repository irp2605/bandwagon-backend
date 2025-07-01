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

router.post("/alter-friend-request-status", async (req, res) => {
    try {
        const { changerId } = req.auth.userId;
        const { changeeId, newStatus } = req.body;

        if (!changerId || !changeeId || changerId === changeeId) {
            return res.status(400).json({ error: "Changer ID and changee ID must be present and distinct" });
        }

        // Check if the request exists
        const [lowerId, higherId] = changerId < changeeId ? [changerId, changeeId] : [changeeId, changerId];
        const checkRequestQuery = 'SELECT * FROM user_relations WHERE user1_id = $1 AND user2_id = $2';
        const requestResult = await pool.query(checkRequestQuery, [lowerId, higherId]);
        if (requestResult.rowCount === 0 || requestResult.rows[0].status !== 'pending') {
            return res.status(404).json({ error: "Friend request not found or is invalid for alteration." });
        }

        // Update the status
        const updateQuery = `UPDATE user_relations SET status = $1, updated_at = NOW() WHERE user1_id = $2 AND user2_id = $3`;
        await pool.query(updateQuery, [newStatus, lowerId, higherId]);
        console.log(`Friend request altered from user ${changerId} to user ${changeeId}. New status: ${newStatus}`);
        return res.status(200).json({ message: "Friend request status updated successfully" });

    } catch (err) {
        console.error("Error altering friend request status:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get("/get-relations-certain-status", async (req, res) => {
    try {
        const userId = req.auth.userId;
        const { status } = req.query;

        if (!userId || !status) {
            return res.status(400).json({ error: "User ID and status must be present" });
        }

        // Validate status
        const validStatuses = ['pending', 'accepted', 'declined'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: "Invalid status provided" });
        }

        // Get relations based on the status
        const query = `
            SELECT * FROM user_relations 
            WHERE (user1_id = $1 OR user2_id = $1) AND status = $2
        `;
        const result = await pool.query(query, [userId, status]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "No relations found for the given status" });
        }

        return res.status(200).json(result.rows);
    }
    catch (err) {
        console.error("Error getting relations by status:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});



router.post("/block-user", async (req, res) => {
    try {
        const blockerId = req.auth.userId;
        const { blockeeId } = req.body;

        if (!blockerId || !blockeeId || blockerId === blockeeId) {
            return res.status(400).json({ error: "Blocker ID and blockee ID must be present and distinct" });
        }

        // Check if the blockee exists
        const checkBlockeeQuery = 'SELECT id FROM users WHERE clerk_id = $1';
        const blockeeResult = await pool.query(checkBlockeeQuery, [blockeeId]);
        if (blockeeResult.rowCount === 0) {
            return res.status(404).json({ error: "Blockee not found" });
        }

        // Check if a relationship already exists
        const [lowerId, higherId] = blockerId < blockeeId ? [blockerId, blockeeId] : [blockeeId, blockerId];
        const checkRequestQuery = 'SELECT * FROM user_relations WHERE user1_id = $1 AND user2_id = $2';
        const requestResult = await pool.query(checkRequestQuery, [lowerId, higherId]);

        if (requestResult.rowCount > 0) {
            let updateQuery = '';
            if (blockerId < blockeeId) {
                updateQuery = `UPDATE user_relations set user1_blocked_user2 = true, status = 'declined', updated_at = NOW() WHERE user1_id = $1 AND user2_id = $2`;
            }
            else {
                updateQuery = `UPDATE user_relations set user2_blocked_user1 = true, status = 'declined', updated_at = NOW() WHERE user1_id = $1 AND user2_id = $2`;
            }
            await pool.query(updateQuery, [lowerId, higherId]);
            console.log(`User ${blockerId} blocked user ${blockeeId} on pre-existing relation`);
        }
        else {
            let insertQuery = '';
            if(blockerId < blockeeId) {
                insertQuery = `INSERT INTO user_relations (user1_id, user2_id, status, initiated_by, user1_blocked_user2, user2_blocked_user1) VALUES ($1, $2, 'declined', $3, true, false)`;
            }
            else {
                insertQuery = `INSERT INTO user_relations (user1_id, user2_id, status, initiated_by, user1_blocked_user2, user2_blocked_user1) VALUES ($1, $2, 'declined', $3, false, true)`;
            }
            await pool.query(insertQuery, [lowerId, higherId, blockerId]);
            console.log(`User ${blockerId} blocked user ${blockeeId} by creating a new relation`);
        }
        return res.status(200).json({ message: "User blocked successfully" });
    } catch (err) {
        console.error("Error blocking user:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;