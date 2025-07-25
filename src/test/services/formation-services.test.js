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
                                            SET (latitude, longitude) = (39.9526, -74.0060)
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
                                            SET (latitude, longitude) = (39.9500, -74.0060)
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


});

