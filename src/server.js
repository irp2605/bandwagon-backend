import express from 'express';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import spotifyRoutes from './routes/spotify.js';
import { clerkMiddleware, requireAuth } from '@clerk/express';
import session from 'express-session';


const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json());

app.use(clerkMiddleware());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 24 * 60 * 60 * 1000 
  }
}));


// Routes

// Auth routes
app.use('/api/auth', authRoutes);

// Protected user routes
app.use('api/spotify', requireAuth(), spotifyRoutes);
app.use('/api/user', requireAuth(), userRoutes);



app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
});