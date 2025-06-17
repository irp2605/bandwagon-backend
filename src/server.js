import express from 'express';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import { clerkMiddleware, requireAuth } from '@clerk/express';


const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json());

app.use(clerkMiddleware());


// Routes

// Auth routes
app.use('/api/auth', authRoutes);

// Protected user routes
app.use('/api/user', requireAuth(), userRoutes);



app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`)
});