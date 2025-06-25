import express from 'express';
import pool from '../config/db.js';
import dotEnv from 'dotenv';
import session from 'express-session';
import { requireAuth } from '@clerk/express';
import request from 'request-promise-native';
dotEnv.config();

const router = express.Router();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = "https://d5c7-57-132-165-78.ngrok-free.app/api/spotify/authorization-callback";

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

router.post('/get-auth-url', requireAuth(), (req, res) => {
    const state = generateRandomString(16);
    const scope = 'user-top-read user-read-recently-played';

    const user_id = req.auth();
    if (!user_id) {
        res.status(400).json({ error: 'User ID is required for Spotify authorization.' });
        return;
    }

    // Store state in session for verification later
    req.session.userId = user_id;
    req.session.spotifyState = state;

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
    const storedState = req.session.spotifyState;
    res.set('ngrok-skip-browser-warning', 'true');
    if (storedState === null || storedState !== req.query.state) {
        console.log('State mismatch:', storedState, req.query.state);
        res.status(400).send('State mismatch.');
        return;
    }

    const userId = req.session.userId;
    if (!userId) {
        res.status(400).send('User ID not found in session.');
        return;
    }

    delete req.session.spotifyState;
    delete req.session.userId;

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

    var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        form: {
            code: code,
            redirect_uri: redirect_uri,
            grant_type: 'authorization_code'
        },
        headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + ( Buffer.from(client_id + ':' + client_secret).toString('base64'))
        },
        json: true
    };

    try {
        const response = await request.post(authOptions);
        if (response.statusCode !== 200) {
            res.status(response.statusCode).send('Failed to retrieve access token.');
            return; // TODO: HANDLE ERROR, PROBABLY NEED TO REDIRECT BACK TO THE APPS ORIGINAL SPOTIFY AUTHORIZATION PAGE
        }
        const { access_token, refresh_token, expires_in } = response.body;

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