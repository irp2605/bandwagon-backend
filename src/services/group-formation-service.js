import pool from '../config/db.js';
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

class UnionFind {
    constructor() {
        this.parent = new Map();
        this.rank = new Map();
    }

    find(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.rank.set(x, 0);
        }

        if (this.parent.get(x) !== x) {
            this.parent.set(x, this.find(this.parent.get(x))); // Path compression
        }
        return this.parent.get(x);
    }

    union(x, y) {
        const rootX = this.find(x);
        const rootY = this.find(y);

        if (rootX !== rootY) {
            // Union by rank
            if (this.rank.get(rootX) < this.rank.get(rootY)) {
                this.parent.set(rootX, rootY);
            } else if (this.rank.get(rootX) > this.rank.get(rootY)) {
                this.parent.set(rootY, rootX);
            } else {
                this.parent.set(rootY, rootX);
                this.rank.set(rootX, this.rank.get(rootX) + 1);
            }
        }
    }

    getGroups() {
        const groups = new Map();
        for (const [node] of this.parent) {
            const root = this.find(node);
            if (!groups.has(root)) {
                groups.set(root, []);
            }
            groups.get(root).push(node);
        }
        return Array.from(groups.values());
    }
}

async function getFriendshipsBetweenUsers(userIds) {
    const query = `
        SELECT user1_id, user2_id 
        FROM user_relations 
        WHERE (user1_id = ANY($1) AND user2_id = ANY($1)) AND status = 'accepted'
    `;

    return await pool.query(query, [userIds]);
}

async function getUsersNearConcert(userIds, concert) {
    const MAX_DISTANCE_MILES = 50
    const query = `SELECT u.id, u.latitude, u.longitude,
       ST_Distance(
         ST_Point(u.longitude, u.latitude)::geography, 
         ST_Point($2, $3)::geography
       ) / 1609.34 as distance_miles
        FROM users u 
        WHERE u.id = ANY($1) 
        AND ST_Distance(
        ST_Point(u.longitude, u.latitude)::geography, 
        ST_Point($2, $3)::geography
        ) / 1609.34 <= $4
        ORDER BY distance_miles`
}

async function formConcertGroups(artistId, userIds) {
    const uf = new UnionFind();

    userIds.array.forEach(uid => {
        uf.find(uid);
    });

    const friendships = await getFriendshipsBetweenUsers(userIds);

    friendships.forEach(friendship => {
        uf.union(friendship.user1_id, friendship.user2_id);
    });

    const groups = uf.getGroups();
    return groups.filter(group => group.length >= 2);
}

async function getSharedArtists() {
    const query = `
        SELECT user_id, array_agg(artist_id) AS artists
        FROM user_artists
        GROUP BY user_id
    `;

    const result = await pool.query(query);
    return result.rows;
}

async function getArtist(artist_id) {
    const query = `
        SELECT * FROM artists WHERE id = $1
    `;

    const result = await pool.query(query, [artist_id]);
    return result.rows[0];
}

async function formLocationAwareConcertGroups(artistId, allUserIds, concerts) {
  const groupsByLocation = new Map();
  
  for (const concert of concerts) {
    const nearbyUsers = await getUsersNearConcert(allUserIds, concert);
    
    if (nearbyUsers.length >= 2) {
      const friendshipGroups = await formConcertGroups(artistId, nearbyUsers);
      
      groupsByLocation.set(concert.venue_id, {
        concert: concert,
        groups: friendshipGroups
      });
    }
  }
  
  return groupsByLocation;
}

async function findExistingGroups(artistId, venueId, concertDate) {
  const query = `
      SELECT * FROM concert_groups
      WHERE artist_id = $1 AND venue_id = $2 AND concert_date = $3
  `;

  const result = await pool.query(query, [artistId, venueId, concertDate]);
  return result.rows[0] || null;
}

async function getGroupMembers(group) {
    const query = `
        SELECT user_id FROM concert_group_members
        WHERE group_id = $1
    `

    const result = await pool.query(query, [group.id]);
    return result.rows.map(row => row.user_id);
}

async function checkFriendshipWithAny(userId, groupMembers) {
    const query = `
        SELECT EXISTS (
            SELECT 1 FROM user_relations
            WHERE (user1_id = $1 AND user2_id = ANY($2)) OR (user2_id = $1 AND user1_id = ANY($2))
            AND status = 'accepted'
            LIMIT 1
        )
    `;

    const result = await pool.query(query, [userId, groupMembers]);
    return result.rows.length > 0;
}

async function createConcertGroup(artistId, concert, userIds) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        const groupQuery = `
            INSERT INTO concert_groups (artist_id, venue_id, venue_name, venue_city, venue_state, venue_country, venue_latitude, venue_longitude, concert_date, concert_time, ticket_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id
        `;

        const groupResult = await client.query(groupQuery, [
            artistId, 
            concert.venue_id, 
            concert.venue_name, 
            concert.venue_city, 
            concert.venue_state, 
            concert.venue_country, 
            concert.latitude, 
            concert.longitude, 
            concert.date, 
            concert.time, 
            concert.ticket_url
        ]);
        
        const groupId = groupResult.rows[0].id;

        if (userIds.length > 0) {
            const memberValues = userIds.map(userId => `(${groupId}, '${userId}')`).join(', ');
            const memberQuery = `
                INSERT INTO concert_group_members (group_id, user_id)
                VALUES ${memberValues}
            `;
            
            await client.query(memberQuery);
        }

        await client.query('COMMIT');

        console.log(`Created concert group ${groupId} with ${userIds.length} members`);
        return groupId;
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating concert group:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function addUsersToGroup(groupId, userIds) {
  if (userIds.length === 0) return;
  
  const query = `
    INSERT INTO concert_group_members (group_id, user_id)
    VALUES ($1, $2)
    ON CONFLICT (group_id, user_id) DO NOTHING
  `;
  
  for (const userId of userIds) {
    await db.query(query, [groupId, userId]);
  }
  
  console.log(`Added ${userIds.length} users to group ${groupId}`);
}

async function updateExistingGroups(artistId, venueId, concertDate, newUserIds) {
  const existingGroup = await findExistingGroup(artistId, venueId, concertDate);
  
  if (!existingGroup) return null;
  
  const currentMembers = await getGroupMembers(existingGroup.id);
  const candidateUsers = newUserIds.filter(id => !currentMembers.includes(id));
  
  if (candidateUsers.length === 0) return existingGroup.id;
  
  const newMembers = [];
  for (const candidateId of candidateUsers) {
    const isFriend = await checkFriendshipWithAny(candidateId, currentMembers);
    if (isFriend) {
      newMembers.push(candidateId);
    }
  }
  
  if (newMembers.length > 0) {
    await addUsersToGroup(existingGroup.id, newMembers);
  }
  
  return existingGroup.id;
}

async function processLocationGroups(artistId, concert, friendshipGroups) {
  const processedGroups = [];
  
  for (const group of friendshipGroups) {
    if (group.length >= 2) {
      // Check if group already exists for this artist + concert
      const existingGroupId = await updateExistingGroups(
        artistId, 
        concert.venue_id, 
        concert.date, 
        group
      );
      
      if (existingGroupId) {
        processedGroups.push(existingGroupId);
      } else {
        // Create new group
        const newGroupId = await createConcertGroup(artistId, concert, group);
        processedGroups.push(newGroupId);
      }
    }
  }
  
  return processedGroups;
}

async function searchTicketMasterAPIbyArtist(artistName) {
    try {
        // Step 1: Search for attractions
        const attractionsResponse = await fetch(
            `https://app.ticketmaster.com/discovery/v2/attractions.json?keyword=${encodeURIComponent(artistName)}&size=10&apikey=${process.env.TICKETMASTER_API_KEY}`
        );
        
        if (!attractionsResponse.ok) {
            throw new Error(`Attractions API error: ${attractionsResponse.status}`);
        }
        
        const attractionsData = await attractionsResponse.json();
        
        if (!attractionsData._embedded || !attractionsData._embedded.attractions || attractionsData._embedded.attractions.length === 0) {
            return []; // No attractions found, return empty array
        }
        
        // Find the best matching attraction (case-insensitive exact match preferred)
        const attractions = attractionsData._embedded.attractions;
        let bestMatch = attractions[0]; // Default to first result
        
        // Look for exact match first
        const exactMatch = attractions.find(attraction => 
            attraction.name.toLowerCase() === artistName.toLowerCase()
        );
        
        if (exactMatch) {
            bestMatch = exactMatch;
        }
        
        // Step 2: Search for events using the attraction ID
        const currentDate = new Date().toISOString();
        const eventsResponse = await fetch(
            `https://app.ticketmaster.com/discovery/v2/events.json?attractionId=${bestMatch.id}&startDateTime=${currentDate}&sort=date,asc&includeTBA=no&includeTBD=no&apikey=${process.env.TICKETMASTER_API_KEY}`
        );
        
        if (!eventsResponse.ok) {
            throw new Error(`Events API error: ${eventsResponse.status}`);
        }
        
        const eventsData = await eventsResponse.json();
        
        // Return array of concert objects formatted for your logic
        const events = eventsData._embedded && eventsData._embedded.events ? eventsData._embedded.events : [];
        
        return events.map(event => ({
            id: event.id,
            name: event.name,
            date: event.dates?.start?.localDate || event.dates?.start?.dateTime,
            time: event.dates?.start?.localTime,
            venue_name: event._embedded?.venues?.[0]?.name || 'Unknown Venue',
            venue_id: event._embedded?.venues?.[0]?.id,
            city: event._embedded?.venues?.[0]?.city?.name,
            state: event._embedded?.venues?.[0]?.state?.name,
            country: event._embedded?.venues?.[0]?.country?.name,
            latitude: event._embedded?.venues?.[0]?.location?.latitude,
            longitude: event._embedded?.venues?.[0]?.location?.longitude,
            ticket_url: event.url,
            artist_name: bestMatch.name,
            artist_id: bestMatch.id
        }));
        
    } catch (error) {
        console.error(`Error in checkConcertAPI for ${artistName}:`, error.message);
        return [];
    }
}