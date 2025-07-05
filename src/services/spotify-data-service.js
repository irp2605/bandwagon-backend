import { pool } from '../config/db.js';
import fetch from 'node-fetch';
import * as spotifyAuthService from './spotify-auth-service.js';

export const updateUserTopArtists = async (userId) => {
    try {
        // Get the user's Spotify access token, refreshing it if necessary
        const accessToken = await spotifyAuthService.refreshSpotifyTokenIfExpired(userId);

        // Fetch all three time ranges
        const [shortTerm, mediumTerm, longTerm] = await Promise.all([
            fetchTopArtists(accessToken, 'short_term'),
            fetchTopArtists(accessToken, 'medium_term'),
            fetchTopArtists(accessToken, 'long_term')
        ]);

        // Process all artists in a single batch operation
        await batchUpsertArtistsAndRankings(userId, {
            short_term: shortTerm,
            medium_term: mediumTerm,
            long_term: longTerm
        });

        return { success: true, message: 'Top artists updated successfully' };
    } catch (error) {
        console.error('Error updating user top artists:', error);
        throw error;
    }
};

const batchUpsertArtistsAndRankings = async (userId, artistsByTerm) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const allArtists = collectUniqueArtists(artistsByTerm);
        
        await upsertArtists(client, allArtists);
        
        await clearUserTopArtists(client, userId);

        await insertUserRankings(client, userId, artistsByTerm);
        
        await client.query('COMMIT');
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Batch upsert failed: ${error.message}`);
    } finally {
        client.release();
    }
};

const fetchTopArtists = async (accessToken, timeRange) => {
    const response = await fetch(
        `https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=20`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch ${timeRange} top artists: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items;
};

const collectUniqueArtists = (artistsByTerm) => {
    const artistsMap = new Map();
    
    Object.values(artistsByTerm).forEach(artists => {
        artists.forEach(artist => {
            if (!artistsMap.has(artist.id)) {
                artistsMap.set(artist.id, {
                    spotify_id: artist.id,
                    name: artist.name,
                    genre1: artist.genres?.[0] || null,
                    genre2: artist.genres?.[1] || null
                });
            }
        });
    });
    
    return Array.from(artistsMap.values());
};

const upsertArtists = async (client, artists) => {
    if (artists.length === 0) return;
    
    const placeholders = artists.map((_, index) => {
        const base = index * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    }).join(', ');
    
    const values = artists.flatMap(artist => [
        artist.name,
        artist.spotify_id,
        artist.genre1,
        artist.genre2
    ]);
    
    const query = `
        INSERT INTO artists (name, spotify_id, genre1, genre2)
        VALUES ${placeholders}
        ON CONFLICT (spotify_id) DO UPDATE SET
            name = EXCLUDED.name,
            genre1 = EXCLUDED.genre1,
            genre2 = EXCLUDED.genre2,
            updated_at = NOW()
    `;
    
    await client.query(query, values);
};

const clearUserTopArtists = async (client, userId) => {
    const query = `
        DELETE FROM user_top_artists 
        WHERE user_id = $1
    `;
    
    await client.query(query, [userId]);
};

const insertUserRankings = async (client, userId, artistsByTerm) => {
    const allRankings = [];
    
    // Collect all rankings
    Object.entries(artistsByTerm).forEach(([term, artists]) => {
        artists.forEach((artist, index) => {
            allRankings.push({
                user_id: userId,
                rank: index + 1,
                term: term,
                artist_id: artist.id
            });
        });
    });
    
    if (allRankings.length === 0) return;
    
    // Build batch insert
    const placeholders = allRankings.map((_, index) => {
        const base = index * 4;
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    }).join(', ');
    
    const values = allRankings.flatMap(ranking => [
        ranking.user_id,
        ranking.rank,
        ranking.term,
        ranking.artist_id
    ]);
    
    const query = `
        INSERT INTO user_top_artists (user_id, rank, term, artist_id)
        VALUES ${placeholders}
    `;
    
    await client.query(query, values);
};
