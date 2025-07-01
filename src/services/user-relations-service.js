// user-relations-service.js
import pool from '../config/db.js';

export async function sendFriendRequest(senderId, receiverId) {
    if (!senderId || !receiverId || senderId === receiverId) {
        throw { status: 400, message: "Sender ID and receiver ID must be present and distinct" };
    }

    const checkReceiverQuery = 'SELECT id FROM users WHERE clerk_id = $1';
    const receiverResult = await pool.query(checkReceiverQuery, [receiverId]);
    if (receiverResult.rowCount === 0) {
        throw { status: 404, message: "Receiver not found" };
    }

    const [lowerId, higherId] = senderId < receiverId ? [senderId, receiverId] : [receiverId, senderId];
    const checkRequestQuery = 'SELECT * FROM user_relations WHERE user1_id = $1 AND user2_id = $2';
    const requestResult = await pool.query(checkRequestQuery, [lowerId, higherId]);

    if (requestResult.rowCount > 0) {
        const rel = requestResult.rows[0];
        if (rel.status !== 'declined') {
            throw { status: 400, message: "Friend request already exists or was already accepted" };
        }
        if (rel.user1_blocked_user2 || rel.user2_blocked_user1) {
            throw { status: 400, message: "One user has blocked the other" };
        }
    }

    const insertQuery = `INSERT INTO user_relations (user1_id, user2_id, status, initiated_by) VALUES ($1, $2, 'pending', $3)`;
    await pool.query(insertQuery, [lowerId, higherId, senderId]);
}

export async function alterFriendRequestStatus(changerId, changeeId, newStatus) {
    if (!changerId || !changeeId || changerId === changeeId) {
        throw { status: 400, message: "Changer ID and changee ID must be present and distinct" };
    }

    const [lowerId, higherId] = changerId < changeeId ? [changerId, changeeId] : [changeeId, changerId];
    const checkQuery = 'SELECT * FROM user_relations WHERE user1_id = $1 AND user2_id = $2';
    const result = await pool.query(checkQuery, [lowerId, higherId]);

    if (result.rowCount === 0 || result.rows[0].status !== 'pending') {
        throw { status: 404, message: "Friend request not found or is invalid for alteration." };
    }

    const updateQuery = `UPDATE user_relations SET status = $1, updated_at = NOW() WHERE user1_id = $2 AND user2_id = $3`;
    await pool.query(updateQuery, [newStatus, lowerId, higherId]);
}

export async function getRelationsByStatus(userId, status) {
    const validStatuses = ['pending', 'accepted', 'declined'];
    if (!userId || !status || !validStatuses.includes(status)) {
        throw { status: 400, message: "Invalid user ID or status" };
    }

    const query = `SELECT * FROM user_relations WHERE (user1_id = $1 OR user2_id = $1) AND status = $2`;
    const result = await pool.query(query, [userId, status]);

    if (result.rowCount === 0) {
        throw { status: 404, message: "No relations found for the given status" };
    }

    return result.rows;
}

export async function blockUser(blockerId, blockeeId) {
    if (!blockerId || !blockeeId || blockerId === blockeeId) {
        throw { status: 400, message: "Blocker ID and blockee ID must be present and distinct" };
    }

    const checkQuery = 'SELECT id FROM users WHERE clerk_id = $1';
    const result = await pool.query(checkQuery, [blockeeId]);
    if (result.rowCount === 0) {
        throw { status: 404, message: "Blockee not found" };
    }

    const [lowerId, higherId] = blockerId < blockeeId ? [blockerId, blockeeId] : [blockeeId, blockerId];
    const checkRelQuery = 'SELECT * FROM user_relations WHERE user1_id = $1 AND user2_id = $2';
    const existingRel = await pool.query(checkRelQuery, [lowerId, higherId]);

    if (existingRel.rowCount > 0) {
        const isUser1 = blockerId < blockeeId;
        const updateQuery = `UPDATE user_relations 
                             SET ${isUser1 ? "user1_blocked_user2" : "user2_blocked_user1"} = true, 
                                 status = 'declined', 
                                 updated_at = NOW()
                             WHERE user1_id = $1 AND user2_id = $2`;
        await pool.query(updateQuery, [lowerId, higherId]);
    } else {
        const insertQuery = `INSERT INTO user_relations 
                             (user1_id, user2_id, status, initiated_by, user1_blocked_user2, user2_blocked_user1)
                             VALUES ($1, $2, 'declined', $3, $4, $5)`;
        const [block1, block2] = blockerId < blockeeId ? [true, false] : [false, true];
        await pool.query(insertQuery, [lowerId, higherId, blockerId, block1, block2]);
    }
}
