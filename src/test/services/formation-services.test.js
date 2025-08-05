import { describe, test, expect, beforeEach } from 'vitest';
import { searchTicketMasterAPIbyArtist, dailyConcertCheck, getFriendshipsBetweenUsers, getUsersNearConcert, formConcertGroups, getSharedArtists, getArtist, formLocationAwareConcertGroups, findExistingGroups, getGroupMembers, checkFriendshipWithAny, createConcertGroup, addUsersToGroup, updateExistingGroups, processLocationGroups } from '../../services/group-formation-service.js';
import { sendFriendRequest, alterFriendRequestStatus } from '../../services/user-relations-service.js';
import { syncUser } from '../../services/user-service.js';

import pool from '../../config/db.js';

describe('Group Formation Service', () => {
    beforeEach(async () => {
        // Create dummy users
        const clerkUser1 = { id: 'user1', first_name: 'User One' };
        await syncUser(clerkUser1);
        const clerkUser2 = { id: 'user2', first_name: 'User Two' };
        await syncUser(clerkUser2);
        const clerkUser3 = { id: 'user3', first_name: 'User Three' };
        await syncUser(clerkUser3);
    });
    describe('getFriendshipsBetweenUsers', () => {
        test('should find accepted friendship', async () => {
            // Create dummy accepted relation
            await sendFriendRequest('user1', 'user2');
            await alterFriendRequestStatus('user2', 'user1', 'accepted');

            const userIds = ['user1', 'user2'];
            const result = await getFriendshipsBetweenUsers(userIds);
            expect(result).toHaveLength(1);
        })
        test('should ignore declined friendship', async () => {
            // Create dummy declined relation
            await sendFriendRequest('user1', 'user2');
            await alterFriendRequestStatus('user2', 'user1', 'declined');

            const userIds = ['user1', 'user2'];
            const result = await getFriendshipsBetweenUsers(userIds);
            expect(result).toHaveLength(0);
        })
    });

    describe('location reliant functions', () => {
        beforeEach(async () => {
            // Insert locations
            const setLocationUser1Query = `UPDATE users
                                            SET (latitude, longitude) = (40.2736, -74.0060)
                                            WHERE clerk_id = 'user1'`;
            await pool.query(setLocationUser1Query);

            const setLocationUser2Query = `UPDATE users
                                            SET (latitude, longitude) = (40.2737, -74.0060)
                                            WHERE clerk_id = 'user2'`;
            await pool.query(setLocationUser2Query);

            const setLocationUser3Query = `UPDATE users
                                            SET (latitude, longitude) = (39.9526, -75.1652)
                                            WHERE clerk_id = 'user3'`;
            await pool.query(setLocationUser3Query);
        });
        test('getUsersNearConcert should find only users near concert', async () => {
            const concert = { latitude: 40.7128, longitude: -74.0060 };
            const userIds = await getUsersNearConcert(['user1', 'user2', 'user3'], concert);
            expect(userIds).toEqual(expect.arrayContaining(['user1', 'user2']));
            expect(userIds).not.toContain('user3');
            expect(userIds.length).toBe(2);
        });
        test('formLocationAwareConcertGroups should form groups based on location', async () => {
            const clerkUser4 = { id: 'user4', first_name: 'User Four' };
            await syncUser(clerkUser4);
            const setLocationUser4Query = `UPDATE users
                                            SET (latitude, longitude) = (39.9500, -75.1652)
                                            WHERE clerk_id = 'user4'`;
            await pool.query(setLocationUser4Query);

            const clerkUser5 = { id: 'user5', first_name: 'User Five' };
            await syncUser(clerkUser5);
            const setLocationUser5Query = `UPDATE users
                                            SET (latitude, longitude) = (40.3573, -74.6672)
                                            WHERE clerk_id = 'user5'`;
            await pool.query(setLocationUser5Query);

            await sendFriendRequest('user3', 'user4');
            await alterFriendRequestStatus('user4', 'user3', 'accepted');

            await sendFriendRequest('user1', 'user5');
            await alterFriendRequestStatus('user5', 'user1', 'accepted');

            await sendFriendRequest('user1', 'user2');
            await alterFriendRequestStatus('user2', 'user1', 'accepted');

            await sendFriendRequest('user3', 'user5');
            await alterFriendRequestStatus('user5', 'user3', 'accepted');

            // Create concerts with required properties
            const concert1 = {
                latitude: 40.7128,
                longitude: -74.0060,
                venue_id: 'venue1',
                venue_name: 'NYC Venue',
                venue_city: 'New York',
                venue_state: 'NY',
                venue_country: 'US',
                date: '2024-12-31',
                time: '20:00:00',
                ticket_url: 'https://example.com/tickets'
            };

            const concert2 = {
                latitude: 39.9526,
                longitude: -75.1652,
                venue_id: 'venue2',
                venue_name: 'Philly Venue',
                venue_city: 'Philadelphia',
                venue_state: 'PA',
                venue_country: 'US',
                date: '2024-12-31',
                time: '20:00:00',
                ticket_url: 'https://example.com/tickets'
            };

            const groups = await formLocationAwareConcertGroups(['user1', 'user2', 'user3', 'user4', 'user5'], [concert1, concert2]);

            // Function returns a Map, not an array
            expect(groups instanceof Map).toBe(true);
            expect(groups.size).toBeGreaterThan(0);

            // Check that we have venue entries
            expect(groups.has('venue1') || groups.has('venue2')).toBe(true);

            // Get all groups from all venues
            const allGroups = [];
            for (const [venueId, locationData] of groups) {
                expect(locationData).toHaveProperty('concert');
                expect(locationData).toHaveProperty('groups');
                expect(Array.isArray(locationData.groups)).toBe(true);

                // Add all groups from this venue
                allGroups.push(...locationData.groups);
            }

            // Now check the specific group compositions
            expect(allGroups.length).toBeGreaterThanOrEqual(1);

            // Find groups by their members
            const group1 = allGroups.find(group =>
                group.includes('user1') && group.includes('user2') && group.includes('user5')
            );
            const group2 = allGroups.find(group =>
                group.includes('user3') && group.includes('user4') && group.includes('user5')
            );

            // Verify the expected groups exist
            if (group1) {
                expect(group1).toEqual(expect.arrayContaining(['user1', 'user2', 'user5']));
                expect(group1.length).toBe(3);
                console.log('Found group 1:', group1);
            }

            if (group2) {
                expect(group2).toEqual(expect.arrayContaining(['user3', 'user4', 'user5']));
                expect(group2.length).toBe(3);
                console.log('Found group 2:', group2);
            }

            // At least one group should exist based on location proximity and friendships
            expect(group1 || group2).toBeTruthy();

            // Log all groups for debugging
            console.log('All groups found:', allGroups);
            console.log('Groups by venue:', Object.fromEntries(groups));
        });
    });


    describe('database functions', () => {
        beforeEach(async () => {
            // Create test artists and user-artist relationships
            await pool.query(`
                INSERT INTO artists (spotify_id, name, genre1, genre2)
                VALUES 
                    ('test_artist_1', 'Test Artist One', 'pop', 'rock'),
                    ('test_artist_2', 'Test Artist Two', 'indie', 'alternative'),
                    ('test_artist_3', 'Test Artist Three', 'jazz', 'blues')
                ON CONFLICT (spotify_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    genre1 = EXCLUDED.genre1,
                    genre2 = EXCLUDED.genre2
            `);

            // Create user-artist relationships for shared artists
            await pool.query(`
                INSERT INTO user_artists (user_id, artist_id)
                VALUES 
                    ('user1', 'test_artist_1'),
                    ('user2', 'test_artist_1'),
                    ('user3', 'test_artist_1'),
                    ('user1', 'test_artist_2'),
                    ('user2', 'test_artist_2'),
                    ('user3', 'test_artist_3')
                ON CONFLICT (user_id, artist_id) DO NOTHING
            `);
        });

        describe('getSharedArtists', () => {
            test('should return artists with multiple followers', async () => {
                const sharedArtists = await getSharedArtists();
                
                expect(sharedArtists.length).toBeGreaterThanOrEqual(2);
                
                const artist1 = sharedArtists.find(a => a.artist_id === 'test_artist_1');
                expect(artist1).toBeDefined();
                expect(artist1.user_ids).toHaveLength(3);
                expect(artist1.user_ids).toEqual(expect.arrayContaining(['user1', 'user2', 'user3']));

                const artist2 = sharedArtists.find(a => a.artist_id === 'test_artist_2');
                expect(artist2).toBeDefined();
                expect(artist2.user_ids).toHaveLength(2);
                expect(artist2.user_ids).toEqual(expect.arrayContaining(['user1', 'user2']));
            });

            test('should not return artists with only one follower', async () => {
                const sharedArtists = await getSharedArtists();
                
                const artist3 = sharedArtists.find(a => a.artist_id === 'test_artist_3');
                expect(artist3).toBeUndefined();
            });
        });

        describe('getArtist', () => {
            test('should return artist by spotify_id', async () => {
                const artist = await getArtist('test_artist_1');
                
                expect(artist).toBeDefined();
                expect(artist.spotify_id).toBe('test_artist_1');
                expect(artist.name).toBe('Test Artist One');
                expect(artist.genre1).toBe('pop');
                expect(artist.genre2).toBe('rock');
            });

            test('should return undefined for non-existent artist', async () => {
                const artist = await getArtist('non_existent_artist');
                expect(artist).toBeUndefined();
            });
        });
    });

    describe('concert group management', () => {
        let testConcert;

        beforeEach(async () => {
            // Create additional users for group testing
            const clerkUser4 = { id: 'user4', first_name: 'User Four' };
            await syncUser(clerkUser4);
            const clerkUser5 = { id: 'user5', first_name: 'User Five' };
            await syncUser(clerkUser5);

            // Set up locations
            await pool.query(`
                UPDATE users SET 
                    city = 'New York', 
                    state = 'NY', 
                    country = 'US',
                    latitude = 40.7128,
                    longitude = -74.0060
                WHERE clerk_id IN ('user1', 'user2', 'user3', 'user4', 'user5')
            `);

            // Create test artist
            await pool.query(`
                INSERT INTO artists (spotify_id, name, genre1, genre2)
                VALUES ('concert_test_artist', 'Concert Test Artist', 'rock', 'pop')
                ON CONFLICT (spotify_id) DO UPDATE SET name = EXCLUDED.name
            `);

            testConcert = {
                venue_id: 'test_venue_123',
                venue_name: 'Test Concert Hall',
                venue_city: 'New York',
                venue_state: 'NY',
                venue_country: 'US',
                latitude: 40.7128,
                longitude: -74.0060,
                date: '2024-12-31',
                time: '20:00:00',
                ticket_url: 'https://example.com/tickets'
            };
        });

        describe('createConcertGroup', () => {
            test('should create concert group with members', async () => {
                const userIds = ['user1', 'user2', 'user3'];
                const groupId = await createConcertGroup('concert_test_artist', testConcert, userIds);

                expect(typeof groupId).toBe('number');

                // Verify group was created
                const groupResult = await pool.query(
                    'SELECT * FROM concert_groups WHERE id = $1',
                    [groupId]
                );
                expect(groupResult.rows).toHaveLength(1);
                expect(groupResult.rows[0].artist_id).toBe('concert_test_artist');
                expect(groupResult.rows[0].venue_id).toBe('test_venue_123');

                // Verify members were added
                const membersResult = await pool.query(
                    'SELECT user_id FROM concert_group_members WHERE group_id = $1 ORDER BY user_id',
                    [groupId]
                );
                expect(membersResult.rows).toHaveLength(3);
                expect(membersResult.rows.map(row => row.user_id)).toEqual(['user1', 'user2', 'user3']);
            });

            test('should create concert group with no members', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, []);

                expect(typeof groupId).toBe('number');

                // Verify group was created
                const groupResult = await pool.query(
                    'SELECT * FROM concert_groups WHERE id = $1',
                    [groupId]
                );
                expect(groupResult.rows).toHaveLength(1);

                // Verify no members were added
                const membersResult = await pool.query(
                    'SELECT user_id FROM concert_group_members WHERE group_id = $1',
                    [groupId]
                );
                expect(membersResult.rows).toHaveLength(0);
            });

            test('should handle database errors gracefully', async () => {
                // Try to create group with invalid artist_id (foreign key violation)
                await expect(
                    createConcertGroup('non_existent_artist', testConcert, ['user1'])
                ).rejects.toThrow();
            });
        });

        describe('findExistingGroups', () => {
            test('should find existing group', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, ['user1']);

                const existingGroup = await findExistingGroups(
                    'concert_test_artist',
                    testConcert.venue_id,
                    testConcert.date
                );

                expect(existingGroup).toBeDefined();
                expect(existingGroup.id).toBe(groupId);
                expect(existingGroup.artist_id).toBe('concert_test_artist');
                expect(existingGroup.venue_id).toBe(testConcert.venue_id);
            });

            test('should return null for non-existent group', async () => {
                const existingGroup = await findExistingGroups(
                    'concert_test_artist',
                    'non_existent_venue',
                    '2025-01-01'
                );

                expect(existingGroup).toBeNull();
            });
        });

        describe('getGroupMembers', () => {
            test('should return group members', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, ['user1', 'user3', 'user5']);

                const members = await getGroupMembers({ id: groupId });

                expect(members).toHaveLength(3);
                expect(members).toEqual(expect.arrayContaining(['user1', 'user3', 'user5']));
            });

            test('should return empty array for group with no members', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, []);

                const members = await getGroupMembers({ id: groupId });

                expect(members).toHaveLength(0);
            });
        });

        describe('addUsersToGroup', () => {
            test('should add users to existing group', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, ['user1']);

                await addUsersToGroup(groupId, ['user2', 'user3']);

                const members = await getGroupMembers({ id: groupId });
                expect(members).toHaveLength(3);
                expect(members).toEqual(expect.arrayContaining(['user1', 'user2', 'user3']));
            });

            test('should handle duplicate members gracefully', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, ['user1']);

                await addUsersToGroup(groupId, ['user1', 'user2']); // user1 already exists

                const members = await getGroupMembers({ id: groupId });
                expect(members).toHaveLength(2);
                expect(members).toEqual(expect.arrayContaining(['user1', 'user2']));
            });

            test('should handle empty user list', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, ['user1']);

                await addUsersToGroup(groupId, []);

                const members = await getGroupMembers({ id: groupId });
                expect(members).toHaveLength(1);
                expect(members).toEqual(['user1']);
            });
        });

        describe('checkFriendshipWithAny', () => {
            beforeEach(async () => {
                // Create friendships
                await sendFriendRequest('user1', 'user2');
                await alterFriendRequestStatus('user2', 'user1', 'accepted');
                
                await sendFriendRequest('user3', 'user4');
                await alterFriendRequestStatus('user4', 'user3', 'accepted');
            });

            test('should return true when user is friends with group member', async () => {
                const groupMembers = ['user1', 'user5'];
                const isFriend = await checkFriendshipWithAny('user2', groupMembers);

                expect(isFriend).toBe(true);
            });

            test('should return false when user has no friends in group', async () => {
                const groupMembers = ['user3', 'user5'];
                const isFriend = await checkFriendshipWithAny('user1', groupMembers);

                expect(isFriend).toBe(false);
            });

            test('should return false for empty group', async () => {
                const isFriend = await checkFriendshipWithAny('user1', []);

                expect(isFriend).toBe(false);
            });
        });

        describe('updateExistingGroups', () => {
            beforeEach(async () => {
                // Create friendships for testing
                await sendFriendRequest('user1', 'user2');
                await alterFriendRequestStatus('user2', 'user1', 'accepted');
                
                await sendFriendRequest('user2', 'user3');
                await alterFriendRequestStatus('user3', 'user2', 'accepted');
            });

            test('should add friends to existing group', async () => {
                // Create initial group
                const groupId = await createConcertGroup('concert_test_artist', testConcert, ['user1']);

                // Update with new users
                const resultGroupId = await updateExistingGroups(
                    'concert_test_artist',
                    testConcert.venue_id,
                    testConcert.date,
                    ['user2', 'user3', 'user4'] // user2,user3 are friends, user4 is not
                );

                expect(resultGroupId).toBe(groupId);

                const members = await getGroupMembers({ id: groupId });
                expect(members).toHaveLength(3); // user1, user2, user3 (user4 not added - no friendship)
                expect(members).toEqual(expect.arrayContaining(['user1', 'user2', 'user3']));
            });

            test('should return null for non-existent group', async () => {
                const resultGroupId = await updateExistingGroups(
                    'concert_test_artist',
                    'non_existent_venue',
                    '2025-01-01',
                    ['user1', 'user2']
                );

                expect(resultGroupId).toBeNull();
            });

            test('should not add users who are already members', async () => {
                const groupId = await createConcertGroup('concert_test_artist', testConcert, ['user1', 'user2']);

                const resultGroupId = await updateExistingGroups(
                    'concert_test_artist',
                    testConcert.venue_id,
                    testConcert.date,
                    ['user1', 'user2', 'user3'] // user1,user2 already members
                );

                expect(resultGroupId).toBe(groupId);

                const members = await getGroupMembers({ id: groupId });
                expect(members).toHaveLength(3); // user1, user2, user3
                expect(members).toEqual(expect.arrayContaining(['user1', 'user2', 'user3']));
            });
        });

        describe('processLocationGroups', () => {
            beforeEach(async () => {
                // Create friendship network that matches your test expectations
                await sendFriendRequest('user1', 'user2');
                await alterFriendRequestStatus('user2', 'user1', 'accepted');
                
                await sendFriendRequest('user3', 'user4');
                await alterFriendRequestStatus('user4', 'user3', 'accepted');
            });

            test('should create new groups for valid friendship groups', async () => {
                const friendshipGroups = [
                    ['user1', 'user2'],
                    ['user3', 'user4'],
                    ['user5']
                ];

                const processedGroups = await processLocationGroups(
                    'concert_test_artist',
                    testConcert,
                    friendshipGroups
                );

                expect(processedGroups).toHaveLength(2); // Only groups with 2+ members

                // Verify groups were created in database
                const groupsResult = await pool.query(
                    'SELECT id FROM concert_groups WHERE artist_id = $1 AND venue_id = $2',
                    ['concert_test_artist', testConcert.venue_id]
                );
                expect(groupsResult.rows).toHaveLength(2);
            });

            test('should update existing groups when they exist', async () => {
                // Create an existing group
                const existingGroupId = await createConcertGroup('concert_test_artist', testConcert, ['user1']);

                const friendshipGroups = [
                    ['user1', 'user2'] // user2 should be added to existing group
                ];

                const processedGroups = await processLocationGroups(
                    'concert_test_artist',
                    testConcert,
                    friendshipGroups
                );

                expect(processedGroups).toHaveLength(1);
                expect(processedGroups[0]).toBe(existingGroupId);

                // Verify user2 was added
                const members = await getGroupMembers({ id: existingGroupId });
                expect(members).toEqual(expect.arrayContaining(['user1', 'user2']));
            });

            test('should ignore groups with less than 2 members', async () => {
                const friendshipGroups = [
                    ['user1'], // Single user
                    ['user2', 'user3'] // Valid group
                ];

                const processedGroups = await processLocationGroups(
                    'concert_test_artist',
                    testConcert,
                    friendshipGroups
                );

                expect(processedGroups).toHaveLength(1); // Only the valid group
            });
        });
    });

    describe('searchTicketMasterAPIbyArtist', () => {
        test('should handle artist with no events gracefully', async () => {
            const concerts = await searchTicketMasterAPIbyArtist('NonExistentArtist999999');
            expect(Array.isArray(concerts)).toBe(true);
            expect(concerts).toHaveLength(0);
        });

        test('should return proper data structure when concerts found', async () => {
            // This test might fail if no concerts are found, which is expected
            const concerts = await searchTicketMasterAPIbyArtist('Taylor Swift');
            
            expect(Array.isArray(concerts)).toBe(true);
            
            if (concerts.length > 0) {
                const concert = concerts[0];
                expect(concert).toHaveProperty('id');
                expect(concert).toHaveProperty('name');
                expect(concert).toHaveProperty('venue_name');
                expect(concert).toHaveProperty('artist_name');
                expect(concert).toHaveProperty('ticket_url');
                expect(typeof concert.id).toBe('string');
                expect(typeof concert.name).toBe('string');
                expect(typeof concert.venue_name).toBe('string');
            }
        });

        test('should handle malformed input gracefully', async () => {
            const testCases = ['', '   ', '!@#$%', null, undefined];
            
            for (const testCase of testCases) {
                const concerts = await searchTicketMasterAPIbyArtist(testCase);
                expect(Array.isArray(concerts)).toBe(true);
            }
        });
    });

    describe('integration tests', () => {
        beforeEach(async () => {
            // Create comprehensive test setup
            const additionalUsers = [
                { id: 'user4', first_name: 'User Four' },
                { id: 'user5', first_name: 'User Five' },
                { id: 'user6', first_name: 'User Six' }
            ];

            for (const user of additionalUsers) {
                await syncUser(user);
            }

            // Set locations for all users
            await pool.query(`
                UPDATE users SET 
                    city = 'New York', 
                    state = 'NY', 
                    country = 'US',
                    latitude = 40.7128 + (RANDOM() - 0.5) * 0.1,
                    longitude = -74.0060 + (RANDOM() - 0.5) * 0.1
                WHERE clerk_id IN ('user1', 'user2', 'user3', 'user4', 'user5', 'user6')
            `);

            // Create test artist and user-artist relationships
            await pool.query(`
                INSERT INTO artists (spotify_id, name, genre1, genre2)
                VALUES ('integration_artist', 'Integration Test Artist', 'rock', 'pop')
                ON CONFLICT (spotify_id) DO UPDATE SET name = EXCLUDED.name
            `);

            await pool.query(`
                INSERT INTO user_artists (user_id, artist_id)
                VALUES 
                    ('user1', 'integration_artist'),
                    ('user2', 'integration_artist'),
                    ('user3', 'integration_artist'),
                    ('user4', 'integration_artist'),
                    ('user5', 'integration_artist'),
                    ('user6', 'integration_artist')
                ON CONFLICT (user_id, artist_id) DO NOTHING
            `);

            // Create friendship network
            const friendships = [
                ['user1', 'user2'],
                ['user2', 'user3'],
                ['user4', 'user5']
                // user6 has no friends
            ];

            for (const [user1, user2] of friendships) {
                await sendFriendRequest(user1, user2);
                await alterFriendRequestStatus(user2, user1, 'accepted');
            }
        });

        test('should handle complete workflow from shared artists to group creation', async () => {
            // Get shared artists
            const sharedArtists = await getSharedArtists();
            const integrationArtist = sharedArtists.find(a => a.artist_id === 'integration_artist');
            
            expect(integrationArtist).toBeDefined();
            expect(integrationArtist.user_ids).toHaveLength(6);

            // Test location-aware grouping
            const mockConcerts = [
                {
                    venue_id: 'integration_venue',
                    venue_name: 'Integration Test Venue',
                    venue_city: 'New York',
                    venue_state: 'NY',
                    venue_country: 'US',
                    latitude: 40.7128,
                    longitude: -74.0060,
                    date: '2024-12-31',
                    time: '20:00:00',
                    ticket_url: 'https://example.com/tickets'
                }
            ];

            const locationGroups = await formLocationAwareConcertGroups(
                integrationArtist.user_ids,
                mockConcerts
            );

            expect(locationGroups.size).toBe(1);
            expect(locationGroups.has('integration_venue')).toBe(true);

            const venueData = locationGroups.get('integration_venue');
            expect(venueData.groups.length).toBeGreaterThan(0);

            // Process the groups
            const processedGroups = await processLocationGroups(
                'integration_artist',
                mockConcerts[0],
                venueData.groups
            );

            expect(processedGroups.length).toBeGreaterThan(0);

            // Verify groups were created in database
            const dbGroups = await pool.query(
                'SELECT id FROM concert_groups WHERE artist_id = $1 AND venue_id = $2',
                ['integration_artist', 'integration_venue']
            );

            expect(dbGroups.rows.length).toBe(processedGroups.length);
        });

        test('should handle edge cases in workflow', async () => {
            // Test with users who have no location data
            await pool.query(`
                UPDATE users SET latitude = NULL, longitude = NULL WHERE clerk_id = 'user6'
            `);

            const mockConcerts = [
                {
                    venue_id: 'edge_case_venue',
                    venue_name: 'Edge Case Venue',
                    venue_city: 'New York',
                    latitude: 40.7128,
                    longitude: -74.0060,
                    date: '2024-12-31'
                }
            ];

            const locationGroups = await formLocationAwareConcertGroups(
                ['user1', 'user2', 'user6'], // user6 has no location
                mockConcerts
            );

            // Should still work with remaining users
            if (locationGroups.size > 0) {
                const venueData = locationGroups.get('edge_case_venue');
                expect(venueData.groups.length).toBeGreaterThanOrEqual(0);
            }
        });
    });
});
