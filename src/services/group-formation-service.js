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

    const res = await pool.query(query, [userIds]);
    return res.rows;
}

async function getUsersNearConcert(userIds, concert) {
    const MAX_DISTANCE_MILES = 50;
    const query = `
        SELECT clerk_id, latitude, longitude,
        ST_Distance(
            ST_Point(longitude, latitude)::geography, 
            ST_Point($2, $3)::geography
        ) / 1609.34 as distance_miles
        FROM users 
        WHERE clerk_id = ANY($1) 
        AND latitude IS NOT NULL 
        AND longitude IS NOT NULL
        AND ST_Distance(
            ST_Point(longitude, latitude)::geography, 
            ST_Point($2, $3)::geography
        ) / 1609.34 <= $4
        ORDER BY distance_miles
    `;
    
    const result = await pool.query(query, [userIds, concert.longitude, concert.latitude, MAX_DISTANCE_MILES]);
    return result.rows.map(row => row.clerk_id);
}

async function formConcertGroups(userIds) {
    const uf = new UnionFind();

    userIds.forEach(uid => {
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
        SELECT artist_id, array_agg(user_id) AS user_ids
        FROM user_artists
        GROUP BY artist_id
        HAVING COUNT(user_id) >= 2
    `;
    
    const result = await pool.query(query);
    return result.rows;
}

async function getArtist(artist_id) {
    const query = `
        SELECT * FROM artists WHERE spotify_id = $1
    `;
    
    const result = await pool.query(query, [artist_id]);
    return result.rows[0];
}

async function formLocationAwareConcertGroups(allUserIds, concerts) {
    console.log(`Forming location-aware concert groups for ${concerts.length} concerts...`);
    const groupsByLocation = new Map();

    for (const concert of concerts) {
        const nearbyUsers = await getUsersNearConcert(allUserIds, concert);
        console.log(`Found ${nearbyUsers.length} users near concert at ${concert.venue_name}`);
        console.log('Nearby users:', nearbyUsers);
        if (nearbyUsers.length >= 2) {
            const friendshipGroups = await formConcertGroups(nearbyUsers);

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
    if (!groupMembers || groupMembers.length === 0) {
        return false;
    }

    const query = `
        SELECT EXISTS (
            SELECT 1 FROM user_relations
            WHERE ((user1_id = $1 AND user2_id = ANY($2)) OR (user2_id = $1 AND user1_id = ANY($2)))
            AND status = 'accepted'
        ) as friendship_exists
    `;

    const result = await pool.query(query, [userId, groupMembers]);
    return result.rows[0].friendship_exists;
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
        await pool.query(query, [groupId, userId]);
    }

    console.log(`Added ${userIds.length} users to group ${groupId}`);
}

async function updateExistingGroups(artistId, venueId, concertDate, newUserIds) {
    const existingGroup = await findExistingGroups(artistId, venueId, concertDate);

    if (!existingGroup) return null;

    let currentMembers = await getGroupMembers(existingGroup);
    const candidateUsers = newUserIds.filter(id => !currentMembers.includes(id));

    if (candidateUsers.length === 0) return existingGroup.id;

    // Iteratively add users who are friends with anyone already in the group
    let addedSomeone = true;
    const remainingCandidates = [...candidateUsers];

    while (addedSomeone && remainingCandidates.length > 0) {
        addedSomeone = false;
        
        for (let i = remainingCandidates.length - 1; i >= 0; i--) {
            const candidateId = remainingCandidates[i];
            const isFriend = await checkFriendshipWithAny(candidateId, currentMembers);
            
            if (isFriend) {
                await addUsersToGroup(existingGroup.id, [candidateId]);
                currentMembers.push(candidateId); // Add to current members immediately
                remainingCandidates.splice(i, 1); // Remove from candidates
                addedSomeone = true;
            }
        }
    }

    return existingGroup.id;
}

async function processLocationGroups(artistId, concert, friendshipGroups) {
    const processedGroups = [];

    for (const group of friendshipGroups) {
        if (group.length >= 2) {
            // Check if there's an existing group that this new group can merge with
            const existingGroup = await findExistingGroups(artistId, concert.venue_id, concert.date);
            
            if (existingGroup) {
                const existingMembers = await getGroupMembers(existingGroup);
                
                let canMerge = false;
                for (const newUserId of group) {
                    if (!existingMembers.includes(newUserId)) {
                        const isFriend = await checkFriendshipWithAny(newUserId, existingMembers);
                        if (isFriend) {
                            canMerge = true;
                            break;
                        }
                    }
                }

                if (canMerge) {
                    // Merge this group with existing group
                    const usersToAdd = group.filter(userId => !existingMembers.includes(userId));
                    if (usersToAdd.length > 0) {
                        await addUsersToGroup(existingGroup.id, usersToAdd);
                    }
                    processedGroups.push(existingGroup.id);
                } else {
                    // No friendship connection - create separate group
                    const newGroupId = await createConcertGroup(artistId, concert, group);
                    processedGroups.push(newGroupId);
                }
            } else {
                // No existing group - create new one
                const newGroupId = await createConcertGroup(artistId, concert, group);
                processedGroups.push(newGroupId);
            }
        }
    }

    return processedGroups;
}

async function searchTicketMasterAPIbyArtist(artistName) {
    try {
        console.log(`Searching for artist: ${artistName}`);

        const attractionsUrl = `https://app.ticketmaster.com/discovery/v2/attractions.json?keyword=${encodeURIComponent(artistName)}&size=10&apikey=${process.env.TICKETMASTER_API_KEY}`;
        console.log('Attractions URL:', attractionsUrl.replace(process.env.TICKETMASTER_API_KEY, 'API_KEY_HIDDEN'));

        const attractionsResponse = await fetch(attractionsUrl);

        if (!attractionsResponse.ok) {
            const errorText = await attractionsResponse.text();
            console.error(`Attractions API error: ${attractionsResponse.status} - ${errorText}`);
            throw new Error(`Attractions API error: ${attractionsResponse.status} - ${errorText}`);
        }

        const attractionsData = await attractionsResponse.json();
        console.log(`Found ${attractionsData._embedded?.attractions?.length || 0} attractions`);

        if (!attractionsData._embedded || !attractionsData._embedded.attractions || attractionsData._embedded.attractions.length === 0) {
            console.log(`No attractions found for ${artistName}`);
            return [];
        }

        const attractions = attractionsData._embedded.attractions;
        let bestMatch = attractions[0];

        const exactMatch = attractions.find(attraction =>
            attraction.name.toLowerCase() === artistName.toLowerCase()
        );

        if (exactMatch) {
            bestMatch = exactMatch;
            console.log(`Found exact match: ${bestMatch.name}`);
        } else {
            console.log(`Using best match: ${bestMatch.name}`);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        const now = new Date();
        const currentDate = now.toISOString().split('T')[0] + 'T00:00:00Z';

        const eventsUrl = `https://app.ticketmaster.com/discovery/v2/events.json?attractionId=${bestMatch.id}&startDateTime=${currentDate}&sort=date,asc&size=50&apikey=${process.env.TICKETMASTER_API_KEY}`;
        console.log('Events URL:', eventsUrl.replace(process.env.TICKETMASTER_API_KEY, 'API_KEY_HIDDEN'));

        const eventsResponse = await fetch(eventsUrl);

        if (!eventsResponse.ok) {
            const errorText = await eventsResponse.text();
            console.error(`Events API error: ${eventsResponse.status} - ${errorText}`);

            if (eventsResponse.status === 400) {
                console.log('Retrying without startDateTime parameter...');
                const fallbackUrl = `https://app.ticketmaster.com/discovery/v2/events.json?attractionId=${bestMatch.id}&sort=date,asc&size=50&apikey=${process.env.TICKETMASTER_API_KEY}`;

                const fallbackResponse = await fetch(fallbackUrl);
                if (!fallbackResponse.ok) {
                    throw new Error(`Events API error: ${fallbackResponse.status}`);
                }
                const fallbackData = await fallbackResponse.json();
                const events = fallbackData._embedded?.events || [];
                console.log(`Found ${events.length} events (fallback method)`);

                return events
                    .filter(event => {
                        const eventDate = new Date(event.dates?.start?.localDate || event.dates?.start?.dateTime);
                        return eventDate >= now;
                    })
                    .map(event => ({
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
            }

            throw new Error(`Events API error: ${eventsResponse.status} - ${errorText}`);
        }

        const eventsData = await eventsResponse.json();
        const events = eventsData._embedded?.events || [];
        console.log(`Found ${events.length} upcoming events for ${bestMatch.name}`);

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
        console.error(`Error in searchTicketMasterAPIbyArtist for ${artistName}:`, error.message);
        return [];
    }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function dailyConcertCheck() {
    const startTime = Date.now();
    console.log("Starting daily concert check.")

    try {
        const sharedArtists = await getSharedArtists();
        console.log(`Processing ${sharedArtists.length} artists with shared followers`);

        let processedArtists = 0;
        let totalGroupsCreated = 0;

        for (const { artist_id, user_ids } of sharedArtists) {
            const artistStart = Date.now()

            try {
                const artist = await getArtist(artist_id);
                const concerts = await searchTicketMasterAPIbyArtist(artist.name);

                if (concerts.length > 0) {
                    console.log(`Found ${concerts.length} concerts for ${artist.name}`);

                    // Group by location first, then by friendships
                    const locationGroups = await formLocationAwareConcertGroups(
                        user_ids,
                        concerts
                    );

                    // Process each location's groups
                    for (const [venueId, { concert, groups }] of locationGroups) {
                        const processedGroups = await processLocationGroups(artist_id, concert, groups);
                        totalGroupsCreated += processedGroups.length;

                        console.log(`Created/updated ${processedGroups.length} groups for ${artist.name} at ${concert.venue_name} (venue: ${venueId})`);
                    }
                }

                processedArtists++;
                const artistTime = Date.now() - artistStart;

                if (artistTime > 5000) {
                    console.log(`Slow artist ${artist.name}: ${artistTime}ms for ${user_ids.length} users`);
                }

                await delay(1000);
            } catch (error) {

                console.error(`Error processing artist ${artist.name}:`, error.message);
            }
        }


    } catch (error) {
        console.log("Problem with daily concert check. Incomplete!")
    }
}

export { searchTicketMasterAPIbyArtist, dailyConcertCheck, getFriendshipsBetweenUsers, getUsersNearConcert, formConcertGroups, getSharedArtists, getArtist, formLocationAwareConcertGroups, findExistingGroups, getGroupMembers, checkFriendshipWithAny, createConcertGroup, addUsersToGroup, updateExistingGroups, processLocationGroups };