import React, { useEffect, useState } from 'react';
import { Home, Search, Users, Plus, MessageCircle, LogOut, Power, UserPlus, X } from 'lucide-react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { auth, database } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, remove, push, serverTimestamp, update } from 'firebase/database';
import GlassCard from './ui/GlassCard';

const BottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [currentUser, setCurrentUser] = useState(null);
    const [requestCount, setRequestCount] = useState(0);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

    // Room Mode State
    const [isRoomMode, setIsRoomMode] = useState(false);
    const [currentRoomId, setCurrentRoomId] = useState(null);
    const [isHost, setIsHost] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [friends, setFriends] = useState([]); // For invite list
    const [isTerminating, setIsTerminating] = useState(false);
    const [sentInvites, setSentInvites] = useState(new Set()); // Track sent invites

    // 1. Global Auth & Requests
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (user) {
                // Friend Requests
                const requestsRef = ref(database, `friend_requests/${user.uid}`);
                onValue(requestsRef, (snapshot) => {
                    setRequestCount(snapshot.exists() ? Object.keys(snapshot.val()).length : 0);
                });

                // Unread Messages Count
                const friendsRef = ref(database, `friends/${user.uid}`);
                onValue(friendsRef, (snapshot) => {
                    if (snapshot.exists()) {
                        let totalUnread = 0;
                        snapshot.forEach((child) => {
                            const val = child.val();
                            if (val.unreadCount) {
                                totalUnread += val.unreadCount;
                            }
                        });
                        setUnreadMessagesCount(totalUnread);
                    } else {
                        setUnreadMessagesCount(0);
                    }
                });
                // Fetch Friends for Invite-Modal (Mock or Real)
                // For now, let's just listen to all users to simulate "Friends" to invite
                // In real app, this would be `users/{uid}/friends`
                const usersRef = ref(database, 'users');
                onValue(usersRef, (snap) => {
                    if (snap.exists()) {
                        const allUsers = [];
                        snap.forEach(child => {
                            if (child.key !== user.uid) {
                                allUsers.push({ uid: child.key, ...child.val() });
                            }
                        });
                        setFriends(allUsers);
                    }
                });
            } else {
                setRequestCount(0);
                setFriends([]);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    // 2. Room Detection & Host Check
    useEffect(() => {
        if (location.pathname.startsWith('/room/')) {
            const roomId = location.pathname.split('/')[2];
            setIsRoomMode(true);
            setCurrentRoomId(roomId);

            if (currentUser && roomId) {
                const roomHostRef = ref(database, `rooms/${roomId}/hostId`);
                const unsub = onValue(roomHostRef, (snap) => {
                    setIsHost(snap.val() === currentUser.uid);
                });
                return () => unsub();
            }
        } else {
            setIsRoomMode(false);
            setCurrentRoomId(null);
            setIsHost(false);
        }
    }, [location.pathname, currentUser]);


    // Actions
    const [showTerminateModal, setShowTerminateModal] = useState(false);

    // Actions
    const handleTerminateClick = () => {
        if (!currentRoomId || !isHost || isTerminating) return;
        setShowTerminateModal(true);
    };

    const confirmTerminate = async () => {
        try {
            setIsTerminating(true);
            // Step 1: soft close (signal everyone)
            const roomRef = ref(database, `rooms/${currentRoomId}`);
            await update(roomRef, { status: 'terminated' });

            // Step 2: wait for propagation then hard delete
            setTimeout(async () => {
                try {
                    await remove(roomRef);
                    navigate('/home');
                    setIsTerminating(false);
                    setShowTerminateModal(false);
                } catch (e) {
                    alert("Deletion failed: " + e.message);
                    setIsTerminating(false);
                }
            }, 2000);
        } catch (error) {
            alert("Error ending rave: " + error.message);
            setIsTerminating(false);
        }
    };

    // Invite Handler
    const handleInvite = async (friendUid) => {
        if (!currentUser || !currentRoomId) return;

        // Optimistic UI update
        setSentInvites(prev => new Set(prev).add(friendUid));

        try {
            // 1. Send Notification
            const notifRef = ref(database, `users/${friendUid}/notifications`);
            const invitePromise = push(notifRef, {
                type: 'invite',
                roomId: currentRoomId,
                roomName: 'Join my Rave!',
                senderId: currentUser.uid, // Authority check
                senderName: currentUser.displayName || currentUser.email?.split('@')[0] || 'A Friend',
                timestamp: serverTimestamp(),
                read: false
            });

            // 2. PRE-EMPTIVE UNBAN (Host Only)
            // If I am the host, I have permission to clear the ban immediately.
            // This ensures the user is unbanned BEFORE they try to join.
            let unbanPromise = Promise.resolve();
            if (isHost) {
                console.log("👑 Host sending invite: Pre-emptively unbanning", friendUid);
                unbanPromise = remove(ref(database, `rooms/${currentRoomId}/kicked/${friendUid}`));
            }

            await Promise.all([invitePromise, unbanPromise]);

            // AUTO-REACTIVATE after 10 seconds
            setTimeout(() => {
                setSentInvites(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(friendUid);
                    return newSet;
                });
            }, 10000);

        } catch (error) {
            console.error("Invite failed:", error);
            // Revert on failure
            setSentInvites(prev => {
                const newSet = new Set(prev);
                newSet.delete(friendUid);
                return newSet;
            });
            alert("Failed to send invite");
        }
    };

    // Define Nav Items dynamically
    let navItems = [];

    if (isRoomMode) {
        // --- ROOM DOCK ---
        navItems = [
            {
                icon: LogOut,
                label: 'Exit',
                action: () => navigate('/home'),
                color: 'var(--text-secondary)'
            },
            {
                icon: UserPlus,
                label: 'Invite',
                action: () => setShowInviteModal(true),
                highlight: true
            }
        ];

        if (isHost) {
            navItems.push({
                icon: Power,
                label: isTerminating ? 'Ending...' : 'End Rave',
                action: handleTerminateClick,
                color: isTerminating ? 'var(--text-secondary)' : '#FF3B30', // Red for danger
                badge: false
            });
        }

    } else {
        // --- GLOBAL DOCK ---
        navItems = [
            { icon: Home, label: 'Home', path: '/home' },
            { icon: UserPlus, label: 'Add Friend', path: '/find-friends' },
            { icon: Plus, label: 'Host', path: '/create', highlight: true },
            { icon: MessageCircle, label: 'Messages', path: '/messages', badge: unreadMessagesCount > 0 },
            { icon: Users, label: 'Friends', path: '/profile', badge: requestCount > 0 },
        ];
    }

    return (
        <>
            <div style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 100,
                width: 'calc(100% - 48px)',
                maxWidth: '500px',
            }}>
                <div style={{
                    background: 'rgba(20, 20, 30, 0.8)',
                    backdropFilter: 'blur(30px)',
                    WebkitBackdropFilter: 'blur(30px)',
                    borderRadius: '32px',
                    border: '1px solid var(--glass-border)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    padding: '12px 24px',
                    height: '72px'
                }}>
                    {navItems.map((item, index) => {
                        // Standard Nav Logic vs Action Logic
                        const isActive = !item.action && location.pathname === item.path;
                        const Icon = item.icon;

                        if (item.highlight) {
                            return (
                                <button
                                    key={index}
                                    onClick={item.action || (() => navigate(item.path))}
                                    style={{
                                        width: 48, height: 48,
                                        borderRadius: '50%',
                                        background: 'var(--accent-primary)',
                                        border: 'none',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white',
                                        boxShadow: '0 0 20px var(--accent-glow)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Icon size={24} strokeWidth={3} />
                                </button>
                            )
                        }

                        return (
                            <button
                                key={index}
                                onClick={item.action || (() => navigate(item.path))}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                    color: item.color || (isActive ? 'white' : 'var(--text-secondary)'),
                                    transition: 'all 0.3s ease',
                                    cursor: 'pointer',
                                    position: 'relative'
                                }}
                            >
                                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} color={item.color && item.color !== 'var(--text-secondary)' ? item.color : (isActive ? "var(--accent-primary)" : "currentColor")} />
                                {/* Notification Dot */}
                                {item.badge && (
                                    <div style={{
                                        position: 'absolute',
                                        top: -2,
                                        right: -2,
                                        width: '10px',
                                        height: '10px',
                                        backgroundColor: '#ff3b30',
                                        borderRadius: '50%',
                                        border: '2px solid rgba(20, 20, 30, 0.8)'
                                    }} />
                                )}
                                {isActive && <div style={{ width: 4, height: 4, background: 'var(--accent-primary)', borderRadius: '50%' }} />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Confirmation Modal */}
            {showTerminateModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => !isTerminating && setShowTerminateModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '320px' }}>
                        <GlassCard style={{ padding: '24px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
                                <div style={{
                                    width: 60, height: 60, borderRadius: '50%',
                                    background: 'rgba(255, 59, 48, 0.1)', color: '#FF3B30',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    marginBottom: 16
                                }}>
                                    <Power size={32} />
                                </div>

                                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '8px' }}>End this Rave?</h3>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '24px' }}>
                                    This will disconnect everyone and remove the room permanently.
                                </p>

                                <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                                    <button
                                        onClick={() => setShowTerminateModal(false)}
                                        disabled={isTerminating}
                                        style={{
                                            flex: 1, padding: '12px', borderRadius: '12px',
                                            background: 'rgba(255,255,255,0.1)', color: 'white',
                                            border: 'none', fontWeight: '600', cursor: 'pointer',
                                            opacity: isTerminating ? 0.5 : 1
                                        }}>
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmTerminate}
                                        disabled={isTerminating}
                                        style={{
                                            flex: 1, padding: '12px', borderRadius: '12px',
                                            background: '#FF3B30', color: 'white',
                                            border: 'none', fontWeight: 'bold', cursor: 'pointer',
                                            opacity: isTerminating ? 0.5 : 1,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}>
                                        {isTerminating ? 'Ending...' : 'End Rave'}
                                    </button>
                                </div>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
                }} onClick={() => setShowInviteModal(false)}>

                    <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px' }}>
                        <GlassCard>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                <h3>Invite Friends</h3>
                                <button onClick={() => setShowInviteModal(false)} style={{ background: 'none', border: 'none', color: 'white' }}>
                                    <X size={24} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '50vh', overflowY: 'auto' }}>
                                {friends.map(friend => {
                                    const isSent = sentInvites.has(friend.uid);
                                    return (
                                        <div key={friend.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                                            <img src={friend.photoURL || 'https://via.placeholder.com/40'} style={{ width: 40, height: 40, borderRadius: '50%' }} />
                                            <div style={{ flex: 1 }}>{friend.username || friend.displayName || 'Unknown'}</div>
                                            <button
                                                onClick={() => !isSent && handleInvite(friend.uid)}
                                                disabled={isSent}
                                                style={{
                                                    background: isSent ? 'rgba(255,255,255,0.1)' : 'var(--accent-primary)',
                                                    border: 'none', padding: '6px 12px',
                                                    borderRadius: 16,
                                                    color: isSent ? 'var(--text-secondary)' : 'white',
                                                    fontSize: '0.8rem',
                                                    cursor: isSent ? 'default' : 'pointer',
                                                    transition: 'all 0.2s ease'
                                                }}>
                                                {isSent ? 'Sent ✓' : 'Invite'}
                                            </button>
                                        </div>
                                    );
                                })}
                                {friends.length === 0 && <div style={{ color: 'gray', textAlign: 'center' }}>No friends found</div>}
                            </div>
                        </GlassCard>
                    </div>
                </div>
            )}
        </>
    );
};

export default BottomNav;
