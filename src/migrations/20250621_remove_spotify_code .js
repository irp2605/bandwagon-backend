// using a session based approach makes the state storage unnecessary
import db from '../config/db.js';   

export async function up() {
  try {
    await db.query(`
      ALTER TABLE users
      DROP COLUMN IF EXISTS spotify_code
    `);
  } catch (error) {
    console.log(error)
  }
}

export async function down() {
  try {
    await db.query(`
      ALTER TABLE users
      ADD COLUMN spotify_state VARCHAR(16)
    `);
  } catch (error) {
    console.log(error)
  }
}

up()