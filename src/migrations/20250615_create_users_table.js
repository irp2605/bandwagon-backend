import db from '../config/db.js'

export async function up() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        clerk_id VARCHAR(255) PRIMARY KEY,
        display_name VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.log(error)
  }
}

export async function down() {
  try {
    await db.query('DROP TABLE IF EXISTS users');
  } catch (error) {
    console.log(error)
  }
}

up()