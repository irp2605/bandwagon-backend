import { searchTicketMasterAPIbyArtist } from '../../services/group-formation-service.js';
import dotenv from 'dotenv';

dotenv.config();

async function testTicketMasterAPI() {
    try {
        console.log('Testing TicketMaster API...');
        console.log('API Key available:', !!process.env.TICKETMASTER_API_KEY);
        
        // Test with different artist names
        const testArtists = [
            'The Weekend'
        ];

        for (const artistName of testArtists) {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`Testing artist: ${artistName}`);
            console.log(`${'='.repeat(50)}`);
            
            try {
                const concerts = await searchTicketMasterAPIbyArtist(artistName);
                
                console.log(`Found ${concerts.length} upcoming concerts for ${artistName}`);
                
                if (concerts.length > 0) {
                    concerts.forEach((concert, index) => {
                        console.log(`\n--- Concert ${index + 1} ---`);
                        console.log(`Event Name: ${concert.name}`);
                        console.log(`Date: ${concert.date}`);
                        console.log(`Time: ${concert.time || 'TBD'}`);
                        console.log(`Venue: ${concert.venue_name}`);
                        console.log(`Location: ${concert.city}, ${concert.state}, ${concert.country}`);
                        console.log(`Coordinates: ${concert.latitude}, ${concert.longitude}`);
                        console.log(`Ticket URL: ${concert.ticket_url}`);
                        console.log(`Artist ID: ${concert.artist_id}`);
                        console.log(`Event ID: ${concert.id}`);
                    });
                } else {
                    console.log(`No upcoming concerts found for ${artistName}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error testing ${artistName}:`, error.message);
                console.error('Full error:', error);
            }
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('TicketMaster API testing completed!');
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('Test setup error:', error.message);
        console.error('Full error:', error);
    } finally {
        process.exit(0);
    }
}

// Additional test for a specific artist with detailed output
async function testSpecificArtist(artistName) {
    try {
        console.log(`\nDetailed test for: ${artistName}`);
        const concerts = await searchTicketMasterAPIbyArtist(artistName);
        
        // Pretty print the raw data
        console.log('\nRaw concert data:');
        console.log(JSON.stringify(concerts, null, 2));
        
        return concerts;
    } catch (error) {
        console.error(`Detailed test error for ${artistName}:`, error);
        return [];
    }
}

// Run the tests
console.log('Starting TicketMaster API tests...');
console.log('Make sure you have TICKETMASTER_API_KEY in your .env file');

testTicketMasterAPI();
