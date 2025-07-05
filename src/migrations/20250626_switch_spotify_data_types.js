import db from '../config/db.js'

export async function up() {
  try {
    await db.query(`
      ALTER TABLE users
      ALTER COLUMN spotify_access_token TYPE TEXT,
      ALTER COLUMN spotify_refresh_token TYPE TEXT
    `);
  } catch (error) {
    console.log(error)
  }
}

export async function down() {
  try {
    await db.query(`
      ALTER TABLE users
      ALTER COLUMN spotify_access_token TYPE VARCHAR(255),
      ALTER COLUMN spotify_refresh_token TYPE VARCHAR(255)
    `);
  } catch (error) {
    console.log(error)
  }
}

