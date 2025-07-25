import { up, down } from '../migrations/20250720_create_group_formation_tables.js';
import pool from '../config/db.js';

async function runMigration() {
    try {
        console.log('Running group formation migration...');
        await up();
        console.log('Migration completed successfully!');
        
        const result = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('user_artists', 'concert_groups', 'concert_group_members')
            ORDER BY table_name;
        `);
        
        console.log('Created tables:', result.rows.map(row => row.table_name));
        
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

runMigration();