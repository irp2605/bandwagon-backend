import pool from '../config/db.js';

export const syncUser = async (clerkUser) => {
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

export const deleteUser = async (clerkUser) => {
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
