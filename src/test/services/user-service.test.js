import { describe, test, expect } from 'vitest';
import { syncUser, deleteUser } from '../../services/user-service.js';
import pool from '../../config/db.js';

describe('User Service', () => {
  test('should sync a new user', async () => {
    const clerkUser = {
      id: 'test_user_123',
      first_name: 'Test User'
    };

    await syncUser(clerkUser);

    const result = await pool.query('SELECT * FROM users WHERE clerk_id = $1', [clerkUser.id]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].display_name).toBe('Test User');
    expect(result.rows[0].clerk_id).toBe('test_user_123');
  });

  test('should update existing user', async () => {
    const clerkUser = {
      id: 'test_user_123',
      first_name: 'Initial Name'
    };

    // First sync
    await syncUser(clerkUser);
    
    // Update
    clerkUser.first_name = 'Updated Name';
    await syncUser(clerkUser);

    const result = await pool.query('SELECT * FROM users WHERE clerk_id = $1', [clerkUser.id]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].display_name).toBe('Updated Name');
  });

  test('should delete user', async () => {
    const clerkUser = {
      id: 'test_user_123',
      first_name: 'Test User'
    };

    await syncUser(clerkUser);
    
    // Verify user exists
    let result = await pool.query('SELECT * FROM users WHERE clerk_id = $1', [clerkUser.id]);
    expect(result.rows).toHaveLength(1);

    await deleteUser(clerkUser);

    // Verify user is deleted
    result = await pool.query('SELECT * FROM users WHERE clerk_id = $1', [clerkUser.id]);
    expect(result.rows).toHaveLength(0);
  });

  test('should handle missing user ID', async () => {
    const clerkUser = {
      first_name: 'Test User'
      // Missing id
    };

    await expect(syncUser(clerkUser)).rejects.toThrow('User ID is required for syncing');
  });
});