import express from 'express';
import dotEnv from 'dotenv';
import { requireAuth } from '@clerk/express';
import * as spotifyAuthService from '../services/spotify-auth-service.js';
dotEnv.config();

const router = express.Router();

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const redirect_uri = "https://subtle-mackerel-civil.ngrok-free.app/api/spotify-auth/authorization-callback";

router.post('/get-auth-url', requireAuth(), async (req, res) => {
    try {
        const auth = req.auth();
        const user_id = auth.userId;
        if (!user_id) {
            res.status(400).json({ error: 'User ID is required for Spotify authorization.' });
            return;
        }

        const authUrl = await spotifyAuthService.getSpotifyAuthUrl(user_id);
        res.json({ authUrl });
    } catch (error) {
        console.error('Error generating Spotify authorization URL:', error);
        res.status(500).json({ error: 'Failed to generate Spotify authorization URL.' });
    }
});

router.get('/authorization-callback', async (req, res) => {
    res.set('ngrok-skip-browser-warning', 'true');

    try {
        if (req.query.error) {
            console.error('Spotify authorization error:', req.query.error);
            return res.redirect(
                spotifyAuthService.generateRedirectUrl({ error: req.query.error })
            );
        }

        const userId = await spotifyAuthService.validateAndConsumeState(req.query.state);
        console.log('Validated state for user:', userId);

        const tokenData = await spotifyAuthService.exchangeCodeForTokens(req.query.code);

        const result = await spotifyAuthService.storeUserTokens(userId, tokenData);

        console.log(`Spotify tokens stored successfully for user ${result.userId}`);
        res.redirect(spotifyAuthService.generateRedirectUrl({ success: 'true' }));

    } catch (error) {
        console.error('Error during Spotify authorization callback:', error);

        if (error.message.includes('Invalid or expired state')) {
            return res.redirect(
                spotifyAuthService.generateRedirectUrl({ error: 'invalid_state' })
            );
        }

        if (error.message.includes('User not found')) {
            return res.redirect(
                spotifyAuthService.generateRedirectUrl({ error: 'user_not_found' })
            );
        }

        if (error.message.includes('Token request failed')) {
            return res.redirect(
                spotifyAuthService.generateRedirectUrl({ error: 'token_request_failed' })
            );
        }

        res.redirect(
            spotifyAuthService.generateRedirectUrl({ error: 'callback_failed' })
        );
    }
});


export default router;