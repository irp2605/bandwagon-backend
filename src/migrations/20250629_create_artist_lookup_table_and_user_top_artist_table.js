import db from '../config/db.js';

export async function up() {
    try {
        await db.query(`
      CREATE TABLE artists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  spotify_id TEXT UNIQUE NOT NULL,
  genre1 VARCHAR(100),
  genre2 VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_spotify_id ON artists(spotify_id);

CREATE TABLE user_top_artists (
user_id VARCHAR(255) NOT NULL REFERENCES users(clerk_id),
rank INT NOT NULL,
term VARCHAR(15) CHECK (term IN ('short_term', 'medium_term', 'long_term')),
artist_id TEXT NOT NULL REFERENCES artists(spotify_id),
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW(),
PRIMARY KEY (user_id, rank, term)
);


    `);
    } catch (error) {
        console.log(error)
    }
}

export async function down() {
    try {
        await db.query(`
      DROP TABLE IF EXISTS user_top_artists;
      DROP INDEX IF EXISTS idx_spotify_id;
      DROP TABLE IF EXISTS artists;
      
      
    `);
    } catch (error) {
        console.log(error)
    }
}

up();
