import db from '../config/db.js'

export async function up() {
  try {
    await db.query(`
      ALTER TABLE spotify_oauth_states
      ADD COLUMN user_id VARCHAR(255)
    `);
  } catch (error) {
    console.log(error)
  }
}

export async function down() {
  try {
    await db.query(`
      ALTER TABLE spotify_oauth_states
      DROP COLUMN IF EXISTS user_id`);
  } catch (error) {
    console.log(error)
  }
}

up()