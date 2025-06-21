import express, { query, request } from 'express';
import pool from '../config/db.js';
import dotEnv from 'dotenv';
import session from 'express-session';
import { redirect } from '@clerk/clerk-sdk-node';
dotEnv.config();

const router = express.Router();

const client_id = process.env.SPOTIFY_CLIENT_ID;

router.post('/authorize', (req, res) => {
    const redirect_uri = process.env.API_BASE_URL + '/spotify/authorization-callback';
    const state = generateRandomString(16);
    const scope = 'user-top-read user-read-recently-played';

    const user_id = req.auth.userId;
    if (!user_id) {
        res.status(400).send('User ID is required for Spotify authorization.');
        return;
    }

    req.session.userId = user_id; // Store user ID in session
    req.session.spotifyState = state; // Store state in session

    res.redirect('https://accounts.spotify.com/authorize?' +
        querystringify({
            response_type: 'code',
            client_id: client_id,
            scope: scope,
            redirect_uri: redirect_uri,
            state: state
        })

    );

});


router.get('/authorization-callback', async (req, res) => {
    const storedState = req.session.spotifyState;
    redirect_uri = "TODO: APP DEEPLINK URL SUCCESS OR FAILURE";

    if (storedState === null || storedState !== req.query.state) {
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
            'Authorization': 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
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

        res.redirect("TODO: APP DEEPLINK URL SUCCESS OR FAILURE");

        const query = 'UPDATE users SET spotify_access_token = $1, spotify_refresh_token = $2, spotify_expires_at = $3, updated_at = NOW() WHERE clerk_id = $4';
        const expiryTime = new Date(Date.now() + expires_in * 1000);
        const values = [access_token, refresh_token, expiryTime, userId];
        const result = await pool.query(query, values);
        if (result.rowCount === 1) {
            console.log(`Updated spotify tokens for user ${userId}`);
            res.status(200).json({ message: "Spotify tokens updated successfully" });
        } else {
            console.log(`User ${userId} not found or spotify tokens`);
            res.status(404).json({ error: "User not found or spotify tokens not updated" });
        }

    } catch (error) {
        console.error('Error during Spotify authorization callback:', error);
        res.status(500).send('Internal Server Error');
        return;
    }


});


export default router;