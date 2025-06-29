import express from 'express';
import pool from '../config/db.js';
import dotEnv from 'dotenv';
import { requireAuth } from '@clerk/express';
import db from '../config/db.js';
dotEnv.config();

const router = express.Router();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = "https://subtle-mackerel-civil.ngrok-free.app/api/spotify/authorization-callback";

function generateRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Utility function to create query string
function querystringify(params) {
    return new URLSearchParams(params).toString();
}

router.post('/get-auth-url', requireAuth(), async (req, res) => {
    const state = generateRandomString(16);
    const scope = 'user-top-read user-read-recently-played';

    const auth = req.auth();
    const user_id = auth.userId; 
    if (!user_id) {
        res.status(400).json({ error: 'User ID is required for Spotify authorization.' });
        return;
    }

    // Store state in session for verification later
    const query = 'INSERT INTO spotify_oauth_states (state, created_at, used, user_id) VALUES ($1, NOW(), FALSE, $2)';
    console.log('Storing state in database:', state, user_id);
    await pool.query(query, [state, user_id]);

    const authUrl = 'https://accounts.spotify.com/authorize?' +
        querystringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        });

    res.json({ authUrl });
});

router.get('/authorization-callback', async (req, res) => {
    const storedState = req.query.state;
    res.set('ngrok-skip-browser-warning', 'true');
    console.log('Received state:', storedState);


    const stateResult = await db.query(
        'SELECT * FROM spotify_oauth_states WHERE state = $1 AND used = FALSE',
        [storedState]
    );

    if (stateResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired state' });
    }

    const userId = stateResult.rows[0].user_id;

    const query = 'UPDATE spotify_oauth_states SET used = TRUE WHERE state = $1';
    await pool.query(query, [storedState]);

    const error = req.query.error;
    if (error) {
        res.status(400).send(`Error: ${error}`);
        return;
        // TODO: Handle error, probably need to redirect back to the apps original spotify authorization page
    }

    const code = req.query.code || null;
    if (code === null) {
        res.status(400).send('Authorization code not provided.');
        return;
        // TODO: Handle error, probably need to redirect back to the apps original spotify authorization page
    }

    const formData = new URLSearchParams({
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
    });
        
    const authHeader = 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64');


    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': authHeader
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to retrieve access token:', response.status, errorText);
            res.redirect(`irp2605-bandwagon://spotify-auth?error=token_request_failed&status=${response.status}`);
            return;
        }
        
        const tokenData = await response.json();
        const { access_token, refresh_token, expires_in } = tokenData;

        const query = 'UPDATE users SET spotify_access_token = $1, spotify_refresh_token = $2, spotify_expires_at = $3, updated_at = NOW() WHERE clerk_id = $4';
        const expiryTime = new Date(Date.now() + expires_in * 1000);
        const values = [access_token, refresh_token, expiryTime, userId];
        const result = await pool.query(query, values);
        if (result.rowCount === 1) {
            res.redirect(`irp2605-bandwagon://spotify-auth?success=true`)
        } else {
            res.redirect(`irp2605-bandwagon://spotify-auth?error=user_not_found`);
        }

    } catch (error) {
        console.error('Error during Spotify authorization callback:', error);
        res.redirect(`irp2605-bandwagon://spotify-auth?error=token_exchange_failed`);
    }


});


export default router;