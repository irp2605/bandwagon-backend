import { pool } from '../db/postgres.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { URLSearchParams } from 'url';


dotenv.config();

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

function querystringify(params) {
    return new URLSearchParams(params).toString();
}

export const getSpotifyAuthUrl = async (user_id) => {
    const state = generateRandomString(16);
    const scope = 'user-top-read';

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
    return authUrl;
}

export const validateAndConsumeState = async (state) => {
    if (!state) {
        throw new Error('State parameter is required');
    }

    const stateResult = await pool.query(
        'SELECT * FROM spotify_oauth_states WHERE state = $1 AND used = FALSE',
        [state]
    );

    if (stateResult.rows.length === 0) {
        throw new Error('Invalid or expired state');
    }

    const user_id = stateResult.rows[0].user_id;

    // Mark state as used
    await pool.query(
        'UPDATE spotify_oauth_states SET used = TRUE WHERE state = $1',
        [state]
    );

    return user_id;
};

export const exchangeCodeForTokens = async (code) => {
    if (!code) {
        throw new Error('Authorization code is required');
    }

    const formData = new URLSearchParams({
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
    });

    const authHeader = 'Basic ' + Buffer.from(`${client_id}:${client_secret}`).toString('base64');

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
        throw new Error(`Token request failed with status ${response.status}: ${errorText}`);
    }

    return await response.json();
};

export const storeUserTokens = async (user_id, tokenData) => {
    const { access_token, refresh_token, expires_in } = tokenData;

    const query = `
    UPDATE users 
    SET spotify_access_token = $1, 
        spotify_refresh_token = $2, 
        spotify_expires_at = $3, 
        updated_at = NOW() 
    WHERE clerk_id = $4
  `;

    const expiryTime = new Date(Date.now() + expires_in * 1000);
    const values = [access_token, refresh_token, expiryTime, user_id];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
        throw new Error('User not found');
    }

    return {
        user_id,
        expiresAt: expiryTime,
        success: true
    };
};

export const generateRedirectUrl = (params) => {
    const baseUrl = 'irp2605-bandwagon://spotify-auth';
    const queryString = new URLSearchParams(params).toString();
    return `${baseUrl}?${queryString}`;
};

export const refreshSpotifyTokenIfExpired = async (user_id) => {
    if (!user_id) {
        throw new Error('User ID is required to refresh Spotify token');
    }
    const query = 'SELECT spotify_refresh_token, spotify_expires_at FROM users WHERE clerk_id = $1';
    const result = await pool.query(query, [user_id]);
    if (result.rows.length === 0) {
        throw new Error('User not found');
    }
    const { spotify_access_token, spotify_refresh_token, spotify_expires_at } = result.rows[0];
    if (!spotify_refresh_token) {
        throw new Error('No Spotify refresh token found for user');
    }
    if (new Date() < new Date(spotify_expires_at)) {
        console.log('Spotify token is still valid, no refresh needed');
        return spotify_access_token;
    }

    const url = 'https://accounts.spotify.com/api/token';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: spotify_refresh_token,
            client_id: client_id,
        })

    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to refresh access token:', response.status, errorText);
        throw new Error(`Token refresh failed with status ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    
    const updateQuery = `
        UPDATE users 
        SET spotify_access_token = $1, 
            spotify_expires_at = $2, 
            updated_at = NOW() 
        WHERE clerk_id = $2
    `;
    const expiryTime = new Date(Date.now() + responseData.expires_in * 1000);
    const updateValues = [responseData.access_token, expiryTime, user_id];
    const updateResult = await pool.query(updateQuery, updateValues);
    if (updateResult.rowCount === 0) {
        throw new Error('Failed to update Spotify tokens for user');
    }
    console.log(`Spotify token refreshed successfully for user ${user_id}`);
    return responseData.access_token;
}