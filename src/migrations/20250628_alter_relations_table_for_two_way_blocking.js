import db from '../config/db.js'

export async function up() {
    try {
        await db.query(`
      ALTER TABLE user_relations
      ADD COLUMN user1_blocked_user2 BOOLEAN DEFAULT FALSE,
      ADD COLUMN user2_blocked_user1 BOOLEAN DEFAULT FALSE;

      ALTER TABLE user_relations
      DROP CONSTRAINT IF EXISTS user_relations_status_check;

      ALTER TABLE user_relations
      ADD CONSTRAINT user_relations_status_check CHECK (status IN ('pending', 'accepted', 'declined'));
    `);
    } catch (error) {
        console.log(error)
    }
}

export async function down() {
    try {
        await db.query(`
      ALTER TABLE user_relations
      DROP COLUMN IF EXISTS user1_blocked_user2,
      DROP COLUMN IF EXISTS user2_blocked_user1;

      ALTER TABLE user_relations
      DROP CONSTRAINT IF EXISTS user_relations_status_check;

      ALTER TABLE user_relations
      ADD CONSTRAINT user_relations_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'blocked'));
    `);
    } catch (error) {
        console.log(error)
    }
}

