import React, { useEffect, useState } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { User, MessageCircle, Users, Hash, X, UserMinus, Calendar, Check } from 'lucide-react';
import { auth, database } from '../firebase';
import { ref, remove, onValue, set } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

const ProfileView = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(auth.currentUser);
    const [selectedFriend, setSelectedFriend] = useState(null);

    // Friends Data
    const [friends, setFriends] = useState([]);
    const [requests, setRequests] = useState([]);
    const [statuses, setStatuses] = useState({});

    // 1. Listen for Friend Requests
    useEffect(() => {
        if (user) {
            const reqRef = ref(database, `friend_requests/${user.uid}`);
            const unsubscribe = onValue(reqRef, (snapshot) => {
                if (snapshot.exists()) {
                    setRequests(Object.values(snapshot.val()));
                } else {
                    setRequests([]);
                }
            });
            return () => unsubscribe();
        }
    }, [user]);

    // 1. Fetch Friends List
    useEffect(() => {
        if (user) {
            const friendsRef = ref(database, `friends/${user.uid}`);
            const unsubscribe = onValue(friendsRef, (snapshot) => {
                if (snapshot.exists()) {
                    setFriends(Object.values(snapshot.val()));
                } else {
                    setFriends([]);
                }
            });
            return () => unsubscribe();
        }
    }, [user]);

    // 2. Fetch Statuses for Friends
    useEffect(() => {
        if (friends.length > 0) {
            const unsubs = [];
            friends.forEach(friend => {
                const statusRef = ref(database, `status/${friend.uid}`);
                const unsub = onValue(statusRef, (snapshot) => {
                    const val = snapshot.val();
                    setStatuses(prev => ({
                        ...prev,
                        [friend.uid]: val?.state || 'offline'
                    }));
                });
                unsubs.push(unsub);
            });
            return () => unsubs.forEach(fn => fn());
        }
    }, [friends]);



    const handleAccept = async (req) => {
        if (!user) return;
        try {
            await set(ref(database, `friends/${user.uid}/${req.senderId}`), {
                username: req.senderName,
                photoURL: req.senderPhoto,
                uid: req.senderId,
                lastMessage: "New Friend!",
                timestamp: Date.now()
            });
            await set(ref(database, `friends/${req.senderId}/${user.uid}`), {
                username: user.displayName,
                photoURL: user.photoURL,
                uid: user.uid,
                lastMessage: "New Friend!",
                timestamp: Date.now()
            });
            await remove(ref(database, `friend_requests/${user.uid}/${req.senderId}`));
        } catch (error) {
            console.error("Error accepting:", error);
        }
    };

    const handleDecline = async (req) => {
        if (!user) return;
        try {
            await remove(ref(database, `friend_requests/${user.uid}/${req.senderId}`));
        } catch (error) {
            console.error("Error declining:", error);
        }
    };

    const handleUnfriend = async (friendId) => {
        if (window.confirm("Are you sure you want to remove this friend?")) {
            try {
                // Remove from My Friends
                await remove(ref(database, `friends/${user.uid}/${friendId}`));
                // Remove from Their Friends
                await remove(ref(database, `friends/${friendId}/${user.uid}`));
                setSelectedFriend(null);
            } catch (error) {
                console.error("Error unfriending:", error);
                alert("Failed to unfriend.");
            }
        }
    };

    return (
        <div style={{
            padding: 'var(--spacing-page)',
            paddingTop: 'calc(env(safe-area-inset-top) + var(--spacing-page))',
            height: '100%',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
            paddingBottom: '100px'
        }}>

            {/* Header Section */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{
                    position: 'relative',
                    marginBottom: '16px'
                }}>
                    <div style={{
                        width: 100, height: 100, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 40px var(--accent-glow)',
                        overflow: 'hidden', border: '4px solid rgba(255,255,255,0.1)'
                    }}>
                        {user?.photoURL ? (
                            <img src={user.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <User size={40} color="white" />
                        )}
                    </div>
                    {/* Online Indicator for Self */}
                    <div style={{
                        position: 'absolute', bottom: 4, right: 4,
                        width: 20, height: 20,
                        background: '#4ade80', borderRadius: '50%',
                        border: '3px solid black'
                    }} />
                </div>

                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: '0 0 4px 0' }}>
                    {user?.displayName || 'Guest User'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                    {user?.email || '@guest_123'}
                </p>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '32px' }}>
                <GlassCard style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>{friends.length}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={14} /> Friends
                    </div>
                </GlassCard>
                <GlassCard style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>12</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Hash size={14} /> Groups
                    </div>
                </GlassCard>
            </div>

            {/* Friends List Title */}
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '16px', color: 'var(--text-primary)' }}>
                Your Friends
            </h3>

            {/* Friend Requests Section */}
            {requests.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '12px', color: 'var(--accent-primary)' }}>Friend Requests ({requests.length})</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {requests.map(req => (
                            <GlassCard key={req.senderId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {req.senderPhoto ? (
                                        <img
                                            src={req.senderPhoto}
                                            alt={req.senderName}
                                            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                                            onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${req.senderName}&background=random` }}
                                        />
                                    ) : (
                                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <User size={20} color="white" />
                                        </div>
                                    )}
                                    <div>
                                        <p style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{req.senderName}</p>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleAccept(req)} style={{
                                        width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-primary)',
                                        border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white'
                                    }}>
                                        <Check size={16} />
                                    </button>
                                    <button onClick={() => handleDecline(req)} style={{
                                        width: 32, height: 32, borderRadius: '50%', background: 'rgba(255, 59, 48, 0.2)',
                                        border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#ff3b30'
                                    }}>
                                        <X size={16} />
                                    </button>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                </div>
            )}

            {/* Friends List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                {friends.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
                        No friends yet. Time to socialize!
                    </div>
                ) : (
                    friends.map(friend => (
                        <GlassCard key={friend.id} onClick={() => setSelectedFriend(friend)} style={{
                            padding: '16px', cursor: 'pointer'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                                {/* Avatar */}
                                <div style={{ position: 'relative' }}>
                                    {friend.photoURL ? (
                                        <img
                                            src={friend.photoURL}
                                            alt={friend.username}
                                            style={{
                                                width: 48, height: 48, borderRadius: '50%', objectFit: 'cover',
                                                border: '2px solid rgba(255,255,255,0.1)'
                                            }}
                                            onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${friend.username}&background=random` }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: 48, height: 48, borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '2px solid rgba(255,255,255,0.1)'
                                        }}>
                                            <User size={24} color="white" />
                                        </div>
                                    )}
                                    {/* Status Dot */}
                                    <div style={{
                                        position: 'absolute', bottom: 0, right: 0,
                                        width: 14, height: 14,
                                        background: statuses[friend.uid] === 'online' ? '#4ade80' : '#6b7280',
                                        borderRadius: '50%',
                                        border: '2px solid #1a1b26'
                                    }} />
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'white' }}>{friend.username}</div>
                                    <div style={{ fontSize: '0.85rem', color: statuses[friend.uid] === 'online' ? '#4ade80' : 'var(--text-secondary)' }}>
                                        {statuses[friend.uid] === 'online' ? 'Online' : 'Offline'}
                                    </div>
                                </div>
                            </div>
                        </GlassCard>
                    ))
                )}
            </div>

            {/* DEBUG: Call Simulation Button */}
            <button
                onClick={async () => {
                    if (!user) return;
                    const callData = {
                        callerId: 'test_uid_999',
                        callerName: 'Test Incoming Call',
                        callerPhoto: user.photoURL || 'https://ui-avatars.com/api/?name=Test+Call',
                        callType: Math.random() > 0.5 ? 'video' : 'voice',
                        roomId: 'debug_room_123',
                        timestamp: Date.now()
                    };

                    try {
                        const callRef = ref(database, `users/${user.uid}/incoming_call`);
                        await set(callRef, callData);
                        alert("Call sent! You should see the overlay.");
                    } catch (e) {
                        console.error(e);
                        alert("Error sending call: " + e.message);
                    }
                }}
                style={{
                    marginTop: '24px', padding: '16px', borderRadius: '16px',
                    background: '#2563eb', color: 'white', border: 'none',
                    fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer'
                }}
            >
                Simulate Incoming Call
            </button>



            {/* Friend Profile Modal */}
            {
                selectedFriend && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 100,
                        backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }} onClick={() => setSelectedFriend(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '340px' }}>
                            <GlassCard style={{ flexDirection: 'column', alignItems: 'center', padding: '32px', position: 'relative' }}>
                                <button
                                    onClick={() => setSelectedFriend(null)}
                                    style={{
                                        position: 'absolute', top: 12, right: 12,
                                        zIndex: 50,
                                        background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                                        padding: '8px', borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                    <X size={24} />
                                </button>

                                {/* Large Avatar */}
                                <div style={{ position: 'relative', marginBottom: '20px', width: 'max-content', margin: '0 auto' }}>
                                    <img
                                        src={selectedFriend.photoURL}
                                        alt={selectedFriend.username}
                                        style={{
                                            width: 100, height: 100, borderRadius: '50%',
                                            border: '4px solid rgba(255,255,255,0.1)',
                                            objectFit: 'cover'
                                        }}
                                        onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${selectedFriend.username}&background=random` }}
                                    />
                                    <div style={{
                                        position: 'absolute', bottom: 4, right: 4,
                                        width: 24, height: 24,
                                        background: statuses[selectedFriend.uid] === 'online' ? '#4ade80' : '#6b7280',
                                        borderRadius: '50%',
                                        border: '3px solid black'
                                    }} />
                                </div>

                                <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
                                    {selectedFriend.username}
                                </h3>


                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px',
                                    background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px'
                                }}>
                                    <Calendar size={14} /> Friends since {selectedFriend.timestamp ? new Date(selectedFriend.timestamp).toLocaleDateString() : 'Unknown'}
                                </div>

                                {/* Actions */}
                                <div style={{ width: '100%', display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={() => navigate(`/chat/${selectedFriend.uid}`)}
                                        style={{
                                            flex: 1,
                                            padding: '12px', borderRadius: '12px',
                                            background: 'var(--accent-primary)',
                                            border: 'none', color: 'white',
                                            fontWeight: '600', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}>
                                        <MessageCircle size={18} /> Message
                                    </button>
                                    <button
                                        onClick={() => handleUnfriend(selectedFriend.uid)}
                                        style={{
                                            flex: 1,
                                            padding: '12px', borderRadius: '12px',
                                            background: 'rgba(255, 59, 48, 0.2)',
                                            border: '1px solid rgba(255, 59, 48, 0.3)',
                                            color: '#ff3b30',
                                            fontWeight: '600', cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}>
                                        <UserMinus size={18} /> Unfriend
                                    </button>
                                </div>

                                {/* DEBUG: Call Simulation */}
                                <button onClick={async () => {
                                    const callData = {
                                        callerId: 'test_uid',
                                        callerName: 'Test Incoming',
                                        callerPhoto: user?.photoURL || '',
                                        callType: 'video',
                                        roomId: 'test_room',
                                        timestamp: Date.now()
                                    };
                                    // We need the imports. They are likely not in ProfileView.
                                    // Let's check imports first.
                                }}
                                    style={{ marginTop: '20px', padding: '10px', background: '#333', color: 'white', borderRadius: '8px' }}>
                                    Test Incoming Call
                                </button>

                            </GlassCard>
                        </div>
                    </div>
                )
            }

        </div >
    );
};

export default ProfileView;
