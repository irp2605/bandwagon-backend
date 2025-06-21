import db from '../config/db.js'

export async function up() {
  try {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN spotify_state VARCHAR(16),
      ADD COLUMN spotify_code VARCHAR(255),
      ADD COLUMN spotify_access_token VARCHAR(255),
      ADD COLUMN spotify_refresh_token VARCHAR(255),
      ADD COLUMN spotify_expires_at TIMESTAMP
    `);
  } catch (error) {
    console.log(error)
  }
}

export async function down() {
  try {
    await db.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS spotify_state,
      DROP COLUMN IF EXISTS spotify_code,
      DROP COLUMN IF EXISTS spotify_access_token,
      DROP COLUMN IF EXISTS spotify_refresh_token,
      DROP COLUMN IF EXISTS spotify_expires_at`);
  } catch (error) {
    console.log(error)
  }
}

up()