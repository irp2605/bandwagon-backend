// user-relations.js
import express from 'express';
import {
    sendFriendRequest,
    alterFriendRequestStatus,
    getRelationsByStatus,
    blockUser
} from './user-relations-service.js';

const router = express.Router();

router.post("/send-friend-request", async (req, res) => {
    try {
        await sendFriendRequest(req.auth.userId, req.body.receiverId);
        return res.status(200).json({ message: "Friend request sent successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    }
});

router.post("/alter-friend-request-status", async (req, res) => {
    try {
        await alterFriendRequestStatus(req.auth.userId, req.body.changeeId, req.body.newStatus);
        return res.status(200).json({ message: "Friend request status updated successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    }
});

router.get("/get-relations-certain-status", async (req, res) => {
    try {
        const data = await getRelationsByStatus(req.auth.userId, req.query.status);
        return res.status(200).json(data);
    } catch (err) {
        console.error(err);
        return res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    }
});

router.post("/block-user", async (req, res) => {
    try {
        await blockUser(req.auth.userId, req.body.blockeeId);
        return res.status(200).json({ message: "User blocked successfully" });
    } catch (err) {
        console.error(err);
        return res.status(err.status || 500).json({ error: err.message || "Internal Server Error" });
    }
});

export default router;
