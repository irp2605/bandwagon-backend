import db from '../config/db.js';

export async function up() {
    try {
        // Enable PostGIS extension for spatial queries
        await db.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
        
        // Add location columns to users table
        await db.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS city VARCHAR(255),
            ADD COLUMN IF NOT EXISTS state VARCHAR(255), 
            ADD COLUMN IF NOT EXISTS country VARCHAR(255) DEFAULT 'US',
            ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
            ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
        `);
        
        // Create spatial index on users location
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_users_location 
            ON users USING GIST (ST_Point(longitude, latitude)) 
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
        `);
        
        // Add TicketMaster artist ID to artists table
        await db.query(`
            ALTER TABLE artists 
            ADD COLUMN IF NOT EXISTS ticketmaster_id VARCHAR(255) UNIQUE;
        `);
        
        // Create user_artists many-to-many table (using clerk_id to match your schema)
        await db.query(`
            CREATE TABLE IF NOT EXISTS user_artists (
                user_id VARCHAR(255) REFERENCES users(clerk_id) ON DELETE CASCADE,
                artist_id TEXT REFERENCES artists(spotify_id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (user_id, artist_id)
            );
        `);
        
        // Index for efficient artist sharing queries
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_user_artists_artist_id ON user_artists (artist_id);
            CREATE INDEX IF NOT EXISTS idx_user_artists_user_id ON user_artists (user_id);
        `);
        
        // Create concert_groups table
        await db.query(`
            CREATE TABLE IF NOT EXISTS concert_groups (
                id SERIAL PRIMARY KEY,
                artist_id TEXT REFERENCES artists(spotify_id) ON DELETE CASCADE,
                venue_id VARCHAR(255) NOT NULL,
                venue_name VARCHAR(255) NOT NULL,
                venue_city VARCHAR(255) NOT NULL,
                venue_state VARCHAR(255),
                venue_country VARCHAR(255) DEFAULT 'US',
                venue_latitude DECIMAL(10, 8),
                venue_longitude DECIMAL(11, 8),
                concert_date DATE NOT NULL,
                concert_time TIME,
                ticket_url TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        
        // Indexes for concert groups
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_concert_groups_artist_venue 
            ON concert_groups (artist_id, venue_id);
            
            CREATE INDEX IF NOT EXISTS idx_concert_groups_date 
            ON concert_groups (concert_date);
            
            CREATE INDEX IF NOT EXISTS idx_concert_groups_location 
            ON concert_groups USING GIST (ST_Point(venue_longitude, venue_latitude))
            WHERE venue_latitude IS NOT NULL AND venue_longitude IS NOT NULL;
        `);
        
        // Create concert_group_members table
        await db.query(`
            CREATE TABLE IF NOT EXISTS concert_group_members (
                group_id INTEGER REFERENCES concert_groups(id) ON DELETE CASCADE,
                user_id VARCHAR(255) REFERENCES users(clerk_id) ON DELETE CASCADE,
                joined_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (group_id, user_id)
            );
        `);
        
        // Indexes for group members
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_concert_group_members_group_id 
            ON concert_group_members (group_id);
            
            CREATE INDEX IF NOT EXISTS idx_concert_group_members_user_id 
            ON concert_group_members (user_id);
        `);
        
        console.log('Group formation tables created successfully');
        
    } catch (error) {
        console.error('Error in migration:', error);
        throw error;
    }
}

export async function down() {
    try {
        // Drop tables in reverse order due to foreign key constraints
        await db.query(`DROP TABLE IF EXISTS concert_group_members;`);
        await db.query(`DROP TABLE IF EXISTS concert_groups;`);
        await db.query(`DROP TABLE IF EXISTS user_artists;`);
        
        // Remove columns from existing tables
        await db.query(`
            ALTER TABLE artists 
            DROP COLUMN IF EXISTS ticketmaster_id;
        `);
        
        await db.query(`
            ALTER TABLE users 
            DROP COLUMN IF EXISTS city,
            DROP COLUMN IF EXISTS state,
            DROP COLUMN IF EXISTS country,
            DROP COLUMN IF EXISTS latitude,
            DROP COLUMN IF EXISTS longitude;
        `);
        
        // Drop indexes
        await db.query(`DROP INDEX IF EXISTS idx_users_location;`);
        
        console.log('Group formation migration rolled back successfully');
        
    } catch (error) {
        console.error('Error in rollback:', error);
        throw error;
    }
}