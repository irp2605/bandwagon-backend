import pool from '../config/db.js';

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
