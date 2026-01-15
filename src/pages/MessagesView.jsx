import React, { useEffect, useState, useRef } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { MessageCircle, Search, User, Trash2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, database } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, remove, update } from 'firebase/database';

const MessagesView = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [friends, setFriends] = useState([]);
    const [invites, setInvites] = useState([]); // Invites State
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [targetFriend, setTargetFriend] = useState(null);

    // Invite Handlers
    const handleAcceptInvite = async (invite) => {
        if (!user) return;
        try {
            // 1. Delete notification
            await remove(ref(database, `users/${user.uid}/notifications/${invite.id}`));

            // 2. Amnesty Logic: Check if the sender is actually the HOST
            const roomHostSnap = await get(ref(database, `rooms/${invite.roomId}/hostId`));
            const hostId = roomHostSnap.val();

            if (invite.senderId === hostId) {
                console.log("👑 Amnesty: Host pardoned user.");
                await remove(ref(database, `rooms/${invite.roomId}/kicked/${user.uid}`));
            } else {
                console.log("👥 Guest Invitation: No amnesty granted.");
            }

            // 3. Navigate to room
            navigate(`/room/${invite.roomId}`);
        } catch (err) {
            console.error("Accept invite error:", err);
            // Fallback: Just navigate
            navigate(`/room/${invite.roomId}`);
        }
    };

    const handleDeclineInvite = async (inviteId) => {
        if (!user) return;
        await remove(ref(database, `users/${user.uid}/notifications/${inviteId}`));
    };

    // Long Press Logic
    const timerRef = useRef(null);
    const isLongPress = useRef(false);

    const startPress = (friend) => {
        isLongPress.current = false;
        timerRef.current = setTimeout(() => {
            isLongPress.current = true;
            setTargetFriend(friend);
            setDeleteModalOpen(true);
        }, 600); // 600ms long press
    };

    const endPress = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
        }
    };

    const handleCardClick = (friend) => {
        if (!isLongPress.current) {
            navigate(`/chat/${friend.uid}`);
        }
    };

    const handleDeleteConversation = async () => {
        if (!targetFriend || !user) return;

        const chatId = [user.uid, targetFriend.uid].sort().join('_');

        try {
            // 1. Delete Messages (Nuclear)
            await remove(ref(database, `messages/${chatId}`));

            // 2. Clear Last Message for ME
            await update(ref(database, `friends/${user.uid}/${targetFriend.uid}`), {
                lastMessage: null,
                timestamp: Date.now()
            });

            // 3. Clear Last Message for THEM
            await update(ref(database, `friends/${targetFriend.uid}/${user.uid}`), {
                lastMessage: null,
                timestamp: Date.now()
            });

            setDeleteModalOpen(false);
            setTargetFriend(null);
        } catch (error) {
            console.error("Delete failed:", error);
            alert("Failed to delete conversation.");
        }
    };

    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Listen for Friends List
                const friendsRef = ref(database, `friends/${currentUser.uid}`);
                const unsubscribeFriends = onValue(friendsRef, (snapshot) => {
                    if (snapshot.exists()) {
                        setFriends(Object.values(snapshot.val()));
                    } else {
                        setFriends([]);
                    }
                });

                // Listen for Notifications (Invites)
                const notifRef = ref(database, `users/${currentUser.uid}/notifications`);
                const unsubscribeNotifs = onValue(notifRef, (snapshot) => {
                    if (snapshot.exists()) {
                        const data = snapshot.val();
                        const list = Object.entries(data).map(([key, val]) => ({
                            id: key,
                            ...val
                        })).filter(n => n.type === 'invite');
                        setInvites(list);
                    } else {
                        setInvites([]);
                    }
                });

                return () => {
                    unsubscribeFriends();
                    unsubscribeNotifs();
                };
            } else {
                setFriends([]);
                setInvites([]);
            }
        });
        return () => unsubscribeAuth();
    }, []);

    // Fetch Statuses
    const [statuses, setStatuses] = useState({});
    useEffect(() => {
        if (friends.length > 0) {
            const unsubs = [];
            friends.forEach(friend => {
                const statusRef = ref(database, `status/${friend.uid}`);
                const unsub = onValue(statusRef, (snapshot) => {
                    const val = snapshot.val();
                    setStatuses(prev => ({
                        ...prev,
                        [friend.uid]: val // Store entire status object (state, currentActivity)
                    }));
                });
                unsubs.push(unsub);
            });
            return () => unsubs.forEach(fn => fn());
        }
    }, [friends]);

    return (
        <div style={{
            padding: 'var(--spacing-page)',
            paddingTop: 'calc(env(safe-area-inset-top) + var(--spacing-page))',
            height: '100%',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
            paddingBottom: '100px',
            position: 'relative' // For modal
        }}>
            <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '24px' }}>Messages</h1>

            {/* Search Bar Placeholder */}
            <div style={{
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '12px',
                marginBottom: '24px',
                border: '1px solid rgba(255,255,255,0.1)'
            }}>
                <Search size={20} color="var(--text-secondary)" />
                <input
                    placeholder="Search friends..."
                    style={{
                        background: 'none', border: 'none', outline: 'none',
                        color: 'white', fontSize: '1rem', width: '100%'
                    }}
                />
            </div>

            {/* PENDING INVITES SECTION */}
            {invites.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '12px', paddingLeft: '4px' }}>
                        Pending Invites <span style={{ color: 'var(--accent-primary)', fontSize: '0.9rem' }}>({invites.length})</span>
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {invites.map(invite => (
                            <GlassCard key={invite.id} style={{ padding: '16px', border: '1px solid var(--accent-primary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{invite.roomName || 'Rave Room'}</div>
                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Invited by {invite.senderName || 'Unknown'}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={() => handleDeclineInvite(invite.id)}
                                            style={{
                                                padding: '8px 16px', borderRadius: '20px',
                                                background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', fontWeight: 'bold'
                                            }}>
                                            Ignore
                                        </button>
                                        <button
                                            onClick={() => handleAcceptInvite(invite)}
                                            style={{
                                                padding: '8px 16px', borderRadius: '20px',
                                                background: 'var(--accent-primary)', color: 'white', border: 'none', fontWeight: 'bold'
                                            }}>
                                            Join
                                        </button>
                                    </div>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {friends.length === 0 && (
                    <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '40px' }}>
                        <p>No friends yet. Search for people to add!</p>
                    </div>
                )}

                {friends.map(friend => (
                    <GlassCard
                        key={friend.uid}
                        // Long Press Handlers
                        onMouseDown={() => startPress(friend)}
                        onMouseUp={endPress}
                        onMouseLeave={endPress}
                        onTouchStart={() => startPress(friend)}
                        onTouchEnd={endPress}
                        onClick={() => handleCardClick(friend)}
                        style={{ padding: '16px', cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                            {/* Avatar */}
                            <div style={{ position: 'relative' }}>
                                {friend.photoURL ? (
                                    <img
                                        src={friend.photoURL}
                                        alt={friend.username}
                                        style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                                        onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${friend.username}&background=random` }}
                                    />
                                ) : (
                                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <User size={24} color="white" />
                                    </div>
                                )}
                            </div>

                            {/* Message Info */}
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{friend.username}</span>
                                        {statuses[friend.uid]?.state === 'online' && (
                                            <div style={{
                                                width: 8, height: 8,
                                                background: '#4ade80',
                                                borderRadius: '50%',
                                                boxShadow: '0 0 8px #4ade80'
                                            }} />
                                        )}
                                    </div>
                                    {/* Unread Badge or Timestamp */}
                                    {friend.unreadCount > 0 ? (
                                        <div style={{
                                            background: '#ff3b30',
                                            color: 'white',
                                            borderRadius: '50%',
                                            minWidth: '20px',
                                            height: '20px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            padding: '0 6px'
                                        }}>
                                            {friend.unreadCount > 9 ? '9+' : friend.unreadCount}
                                        </div>
                                    ) : (
                                        statuses[friend.uid]?.currentActivity ? (
                                            <div onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/room/${statuses[friend.uid].currentActivity.roomId}`);
                                            }} style={{
                                                background: 'rgba(var(--accent-primary-rgb), 0.2)',
                                                color: 'var(--accent-primary)',
                                                padding: '4px 10px', borderRadius: '12px',
                                                fontWeight: 'bold', fontSize: '0.75rem',
                                                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <span>▶ Join {statuses[friend.uid].currentActivity.videoTitle.slice(0, 15)}...</span>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Just now</span>
                                        )
                                    )}
                                </div>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                                }}>
                                    <div style={{
                                        color: friend.unreadCount > 0 ? 'white' : 'var(--text-secondary)',
                                        fontSize: '0.9rem',
                                        fontWeight: friend.unreadCount > 0 ? '600' : '400',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        flex: 1
                                    }}>
                                        {friend.lastMessage || 'Start a conversation'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                ))}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteModalOpen && targetFriend && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setDeleteModalOpen(false)}>
                    <GlassCard style={{ padding: '24px', width: '85%', maxWidth: '320px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{
                            width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,59,48,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto'
                        }}>
                            <Trash2 size={24} color="#ff3b30" />
                        </div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '8px' }}>Delete Conversation?</h3>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.95rem' }}>
                            This will permanently delete all messages with <b>{targetFriend.username}</b> for BOTH of you. This cannot be undone.
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setDeleteModalOpen(false)} style={{
                                flex: 1, padding: '12px', borderRadius: '12px',
                                background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', fontWeight: 'bold'
                            }}>Cancel</button>
                            <button onClick={handleDeleteConversation} style={{
                                flex: 1, padding: '12px', borderRadius: '12px',
                                background: '#ff3b30', color: 'white', border: 'none', fontWeight: 'bold'
                            }}>Delete</button>
                        </div>
                    </GlassCard>
                </div>
            )}
        </div>
    );
};

export default MessagesView;
