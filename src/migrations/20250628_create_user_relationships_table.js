import db from '../config/db.js';

export async function up() {
    try {
        await db.query(`
      CREATE TABLE user_relations (
  user1_id VARCHAR(255) REFERENCES users(clerk_id),
  user2_id VARCHAR(255) REFERENCES users(clerk_id),
  status VARCHAR(10) CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  initiated_by VARCHAR(255) REFERENCES users(clerk_id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user1_id, user2_id),
  CONSTRAINT enforce_user_id_order CHECK (user1_id < user2_id)
);
CREATE INDEX idx_status ON user_relations(status);
    `);
    } catch (error) {
        console.log(error)
    }
}

export async function down() {
    try {
        await db.query(`
      DROP TABLE IF EXISTS user_relations;
    `);
    } catch (error) {
        console.log(error)
    }
}

