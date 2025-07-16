import { updateUserTopArtists } from "../../services/spotify-data-service.js";
import dotenv from 'dotenv'

dotenv.config();

async function testSpotifyDataService() {
    try {
        console.log('Testing updateUserTopArtists...');
        
        const userId = 'user_2zZRz4JiyDn7qzS05JByA5t1HDH';
        
        const result = await updateUserTopArtists(userId);
        console.log('Success:', result);
        
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Full error:', error);
    } finally {
        process.exit(0);
    }
}

testSpotifyDataService();