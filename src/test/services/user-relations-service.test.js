import { describe, test, expect, beforeEach } from 'vitest';
import { 
  sendFriendRequest, 
  alterFriendRequestStatus, 
  getRelationsByStatus, 
  blockUser 
} from '../../services/user-relations-service.js';
import { syncUser } from '../../services/user-service.js';
import pool from '../../config/db.js';

describe('User Relations Service', () => {
  beforeEach(async () => {
    // Create test users before each test
    await syncUser({ id: 'user1', first_name: 'User One' });
    await syncUser({ id: 'user2', first_name: 'User Two' });
    await syncUser({ id: 'user3', first_name: 'User Three' });
  });

  describe('sendFriendRequest', () => {
    test('should send friend request successfully', async () => {
      await sendFriendRequest('user1', 'user2');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('pending');
      expect(result.rows[0].initiated_by).toBe('user1');
      // Check that user IDs are ordered correctly (lower ID first)
      expect(result.rows[0].user1_id).toBe('user1');
      expect(result.rows[0].user2_id).toBe('user2');
    });

    test('should send friend request with correct ordering when sender ID is higher', async () => {
      await sendFriendRequest('user2', 'user1');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('pending');
      expect(result.rows[0].initiated_by).toBe('user2');
      // Check that user IDs are still ordered correctly (lower ID first)
      expect(result.rows[0].user1_id).toBe('user1');
      expect(result.rows[0].user2_id).toBe('user2');
    });

    test('should throw error when sender ID is missing', async () => {
      await expect(sendFriendRequest('', 'user2')).rejects.toThrow(
        'Sender ID and receiver ID must be present and distinct'
      );
    });

    test('should throw error when receiver ID is missing', async () => {
      await expect(sendFriendRequest('user1', '')).rejects.toThrow(
        'Sender ID and receiver ID must be present and distinct'
      );
    });

    test('should throw error when sender and receiver are the same', async () => {
      await expect(sendFriendRequest('user1', 'user1')).rejects.toThrow(
        'Sender ID and receiver ID must be present and distinct'
      );
    });

    test('should throw error when receiver does not exist', async () => {
      await expect(sendFriendRequest('user1', 'nonexistent')).rejects.toThrow(
        'Receiver not found'
      );
    });

    test('should throw error when friend request already exists', async () => {
      await sendFriendRequest('user1', 'user2');
      
      await expect(sendFriendRequest('user1', 'user2')).rejects.toThrow(
        'Friend request already exists or was already accepted'
      );
    });

    test('should throw error when users are already friends', async () => {
      await sendFriendRequest('user1', 'user2');
      await alterFriendRequestStatus('user2', 'user1', 'accepted');
      
      await expect(sendFriendRequest('user1', 'user2')).rejects.toThrow(
        'Friend request already exists or was already accepted'
      );
    });

    test('should throw error when one user has blocked the other', async () => {
      await blockUser('user1', 'user2');
      
      await expect(sendFriendRequest('user1', 'user2')).rejects.toThrow(
        'One user has blocked the other'
      );
    });
  });

  describe('alterFriendRequestStatus', () => {
    test('should accept friend request successfully', async () => {
      await sendFriendRequest('user1', 'user2');
      await alterFriendRequestStatus('user2', 'user1', 'accepted');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows[0].status).toBe('accepted');
    });

    test('should decline friend request successfully', async () => {
      await sendFriendRequest('user1', 'user2');
      await alterFriendRequestStatus('user2', 'user1', 'declined');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows[0].status).toBe('declined');
    });

    test('should throw error when changer ID is missing', async () => {
      await expect(alterFriendRequestStatus('', 'user1', 'accepted')).rejects.toThrow(
        'Changer ID and changee ID must be present and distinct'
      );
    });

    test('should throw error when changee ID is missing', async () => {
      await expect(alterFriendRequestStatus('user1', '', 'accepted')).rejects.toThrow(
        'Changer ID and changee ID must be present and distinct'
      );
    });

    test('should throw error when changer and changee are the same', async () => {
      await expect(alterFriendRequestStatus('user1', 'user1', 'accepted')).rejects.toThrow(
        'Changer ID and changee ID must be present and distinct'
      );
    });

    test('should throw error when friend request does not exist', async () => {
      await expect(alterFriendRequestStatus('user1', 'user2', 'accepted')).rejects.toThrow(
        'Friend request not found or is invalid for alteration.'
      );
    });

    test('should throw error when trying to alter non-pending request', async () => {
      await sendFriendRequest('user1', 'user2');
      await alterFriendRequestStatus('user2', 'user1', 'accepted');
      
      await expect(alterFriendRequestStatus('user1', 'user2', 'declined')).rejects.toThrow(
        'Friend request not found or is invalid for alteration.'
      );
    });
  });

  describe('getRelationsByStatus', () => {
    test('should get pending relations successfully', async () => {
      await sendFriendRequest('user1', 'user2');
      await sendFriendRequest('user1', 'user3');

      const relations = await getRelationsByStatus('user1', 'pending');
      expect(relations).toHaveLength(2);
      expect(relations.every(rel => rel.status === 'pending')).toBe(true);
    });

    test('should get accepted relations successfully', async () => {
      await sendFriendRequest('user1', 'user2');
      await alterFriendRequestStatus('user2', 'user1', 'accepted');
      
      await sendFriendRequest('user1', 'user3');
      await alterFriendRequestStatus('user3', 'user1', 'accepted');

      const relations = await getRelationsByStatus('user1', 'accepted');
      expect(relations).toHaveLength(2);
      expect(relations.every(rel => rel.status === 'accepted')).toBe(true);
    });

    test('should get declined relations successfully', async () => {
      await sendFriendRequest('user1', 'user2');
      await alterFriendRequestStatus('user2', 'user1', 'declined');

      const relations = await getRelationsByStatus('user1', 'declined');
      expect(relations).toHaveLength(1);
      expect(relations[0].status).toBe('declined');
    });

    test('should work regardless of user ID position in relation', async () => {
      await sendFriendRequest('user2', 'user1'); // user2 sends to user1
      
      const relations = await getRelationsByStatus('user1', 'pending');
      expect(relations).toHaveLength(1);
      expect(relations[0].status).toBe('pending');
    });

    test('should throw error when user ID is missing', async () => {
      await expect(getRelationsByStatus('', 'pending')).rejects.toThrow(
        'Invalid user ID or status'
      );
    });

    test('should throw error when status is missing', async () => {
      await expect(getRelationsByStatus('user1', '')).rejects.toThrow(
        'Invalid user ID or status'
      );
    });

    test('should throw error when status is invalid', async () => {
      await expect(getRelationsByStatus('user1', 'invalid')).rejects.toThrow(
        'Invalid user ID or status'
      );
    });

    test('should throw error when no relations found', async () => {
      await expect(getRelationsByStatus('user1', 'pending')).rejects.toThrow(
        'No relations found for the given status'
      );
    });
  });

  describe('blockUser', () => {
    test('should block user successfully when no previous relation exists', async () => {
      await blockUser('user1', 'user2');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('declined');
      expect(result.rows[0].initiated_by).toBe('user1');
      expect(result.rows[0].user1_blocked_user2).toBe(true);
      expect(result.rows[0].user2_blocked_user1).toBe(false);
    });

    test('should block user successfully when blocking user has higher ID', async () => {
      await blockUser('user2', 'user1');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('declined');
      expect(result.rows[0].initiated_by).toBe('user2');
      expect(result.rows[0].user1_blocked_user2).toBe(false);
      expect(result.rows[0].user2_blocked_user1).toBe(true);
    });

    test('should update existing relation when blocking', async () => {
      await sendFriendRequest('user1', 'user2');
      await blockUser('user1', 'user2');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('declined');
      expect(result.rows[0].user1_blocked_user2).toBe(true);
      expect(result.rows[0].user2_blocked_user1).toBe(false);
    });

    test('should update existing accepted friendship when blocking', async () => {
      await sendFriendRequest('user1', 'user2');
      await alterFriendRequestStatus('user2', 'user1', 'accepted');
      await blockUser('user2', 'user1');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('declined');
      expect(result.rows[0].user1_blocked_user2).toBe(false);
      expect(result.rows[0].user2_blocked_user1).toBe(true);
    });

    test('should throw error when blocker ID is missing', async () => {
      await expect(blockUser('', 'user2')).rejects.toThrow(
        'Blocker ID and blockee ID must be present and distinct'
      );
    });

    test('should throw error when blockee ID is missing', async () => {
      await expect(blockUser('user1', '')).rejects.toThrow(
        'Blocker ID and blockee ID must be present and distinct'
      );
    });

    test('should throw error when blocker and blockee are the same', async () => {
      await expect(blockUser('user1', 'user1')).rejects.toThrow(
        'Blocker ID and blockee ID must be present and distinct'
      );
    });

    test('should throw error when blockee does not exist', async () => {
      await expect(blockUser('user1', 'nonexistent')).rejects.toThrow(
        'Blockee not found'
      );
    });
  });

  describe('Integration scenarios', () => {
    test('should handle complete friend request lifecycle', async () => {
      // Send request
      await sendFriendRequest('user1', 'user2');
      let relations = await getRelationsByStatus('user1', 'pending');
      expect(relations).toHaveLength(1);

      // Accept request
      await alterFriendRequestStatus('user2', 'user1', 'accepted');
      relations = await getRelationsByStatus('user1', 'accepted');
      expect(relations).toHaveLength(1);

      // Block user (should change status to declined)
      await blockUser('user1', 'user2');
      relations = await getRelationsByStatus('user1', 'declined');
      expect(relations).toHaveLength(1);
      expect(relations[0].user1_blocked_user2).toBe(true);
    });

    test('should prevent friend requests after blocking', async () => {
      await blockUser('user1', 'user2');
      
      await expect(sendFriendRequest('user2', 'user1')).rejects.toThrow(
        'One user has blocked the other'
      );
      
      await expect(sendFriendRequest('user1', 'user2')).rejects.toThrow(
        'One user has blocked the other'
      );
    });

    test('should handle mutual blocking scenario', async () => {
      await blockUser('user1', 'user2');
      
      // The second block should update the existing relation
      await blockUser('user2', 'user1');

      const result = await pool.query(
        'SELECT * FROM user_relations WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)',
        ['user1', 'user2']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('declined');
      expect(result.rows[0].user1_blocked_user2).toBe(true);
      expect(result.rows[0].user2_blocked_user1).toBe(true);
    });
  });
});