import db from '../config/db.js';

export async function up() {
  try {
    await db.query(`
      CREATE TABLE spotify_oauth_states (
    id SERIAL PRIMARY KEY,
    state VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    used BOOLEAN DEFAULT FALSE
);
    `);
  } catch (error) {
    console.log(error)
  }
}

export async function down() {
  try {
    await db.query(`
      DROP TABLE IF EXISTS spotify_oauth_states
    `);
  } catch (error) {
    console.log(error)
  }
}

