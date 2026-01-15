import React, { useState, useEffect } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { Search, UserPlus, User, Clock, Check, X } from 'lucide-react';
import { auth, database } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get, query, orderByChild, startAt, endAt, limitToFirst, child, set } from 'firebase/database';

const FindFriendsView = () => {
    const [user, setUser] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
        });
        return () => unsubscribe();
    }, []);

    // Debounced Search Effect
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim()) {
                performSearch(searchQuery);
            } else {
                setSearchResults([]);
                setSearching(false);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [searchQuery, user]);

    const performSearch = async (val) => {
        setSearching(true);
        // Timeout helper
        const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("Search timed out")), ms));

        try {
            const usersRef = ref(database, 'users');

            // MAGIC DEBUG MODE
            if (val.toLowerCase() === 'debug') {
                // ... (Debug logic kept simple or removed for brevity, assuming standard search is priority)
                // For safety, I'll keep a simplified version or just skip it to keep code clean.
                // Let's stick to the robust normal search.
            }

            // 1. Robust "Fuzzy" Search
            // Instead of relying on strict server-side filtering which fails on case/index,
            // we fetch a batch of users and filter them here. 
            // This is cleaner for small apps and guarantees checking case-insensitivity.

            const simpleQuery = query(usersRef, limitToFirst(50));
            const snapshot = await get(simpleQuery);

            if (snapshot.exists()) {
                const data = snapshot.val();
                let results = Object.entries(data)
                    .map(([key, u]) => ({
                        ...u,
                        uid: key,
                        // Ensure username exists for filtering
                        username: u.username || 'Unknown'
                    }))
                    .filter(u => {
                        // 1. Exclude self
                        if (u.uid === user?.uid) return false;

                        // 2. Case-Insensitive Check
                        const name = u.username.toLowerCase();
                        const search = val.toLowerCase();
                        return name.includes(search);
                    });

                // Check Status (Pending or Friends) logic continues below...

                // Check Status (Pending or Friends)

                // Check Status (Pending or Friends)
                if (user) {
                    try {
                        results = await Promise.all(results.map(async (r) => {
                            // Parallelize these checks
                            const [reqSnap, friendSnap] = await Promise.all([
                                get(child(ref(database), `friend_requests/${r.uid}/${user.uid}`)),
                                get(child(ref(database), `friends/${user.uid}/${r.uid}`))
                            ]);

                            return {
                                ...r,
                                requestSent: reqSnap.exists(),
                                isFriend: friendSnap.exists()
                            };
                        }));
                    } catch (err) {
                        console.warn("Error fetching relationship status", err);
                    }
                }

                setSearchResults(results);
            } else {
                setSearchResults([]);
            }
        } catch (error) {
            console.error("Search error:", error);
            // Optionally set an error state here to show in UI
        } finally {
            setSearching(false);
        }
    };

    // Simplified Handler
    const handleSearchInput = (val) => {
        setSearchQuery(val);
    };

    const handleSendRequest = async (targetUser) => {
        if (!user) return;
        try {
            const reqRef = ref(database, `friend_requests/${targetUser.uid}/${user.uid}`);
            await set(reqRef, {
                senderId: user.uid,
                senderName: user.displayName || 'Unknown',
                senderPhoto: user.photoURL || '',
                timestamp: Date.now(),
                status: 'pending'
            });
            // Optimistically update UI
            setSearchResults(prev => prev.map(u =>
                u.uid === targetUser.uid ? { ...u, requestSent: true } : u
            ));
        } catch (error) {
            console.error("Error sending request:", error);
            // showToast("Failed to send request", 'error'); 
        }
    };

    return (
        <div style={{ padding: 'var(--spacing-page)', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '24px' }}>Find Friends</h1>

            {/* Search Bar */}
            <div style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.05)', borderRadius: '16px',
                padding: '16px', border: '1px solid rgba(255,255,255,0.1)',
                marginBottom: '24px'
            }}>
                <Search size={20} color="var(--text-secondary)" style={{ marginRight: '12px' }} />
                <input
                    value={searchQuery}
                    onChange={(e) => handleSearchInput(e.target.value)}
                    placeholder="Search by username..."
                    autoFocus
                    style={{
                        width: '100%', background: 'transparent', border: 'none',
                        color: 'white', fontSize: '1.1rem', outline: 'none'
                    }}
                />
                {searchQuery && (
                    <button onClick={() => handleSearchInput('')} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Results List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '100px' }}>
                {searching && (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '40px' }}>
                        <div className="spinner" style={{
                            width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)',
                            borderTopColor: 'var(--accent-primary)', borderRadius: '50%', margin: '0 auto 12px',
                            animation: 'spin 1s linear infinite'
                        }} />
                        Searching...
                    </div>
                )}

                {!searching && searchQuery && searchResults.length === 0 && (
                    <div style={{ textAlign: 'center', opacity: 0.5, marginTop: '40px' }}>
                        <p>No users found matching "{searchQuery}"</p>
                    </div>
                )}

                {!searching && !searchQuery && (
                    <div style={{ textAlign: 'center', opacity: 0.3, marginTop: '40px' }}>
                        <UserPlus size={48} style={{ marginBottom: '16px' }} />
                        <p>Type a username to find friends</p>
                    </div>
                )}

                {searchResults.map(resultUser => (
                    <GlassCard key={resultUser.uid} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            {resultUser.photoURL ? (
                                <img src={resultUser.photoURL} alt={resultUser.username} style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <User size={24} color="white" />
                                </div>
                            )}
                            <div>
                                <p style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '2px' }}>{resultUser.username}</p>
                                {resultUser.email && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{resultUser.email}</p>}
                            </div>
                        </div>

                        {resultUser.isFriend ? (
                            <div style={{
                                background: 'rgba(var(--accent-primary-rgb), 0.1)',
                                color: 'var(--accent-primary)',
                                padding: '8px 16px', borderRadius: '20px',
                                fontWeight: 'bold', fontSize: '0.9rem',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}>
                                <Check size={16} /> Friends
                            </div>
                        ) : resultUser.requestSent ? (
                            <button disabled style={{
                                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
                                border: 'none', borderRadius: '20px', padding: '8px 16px',
                                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'default'
                            }}>
                                <Clock size={16} /> Sent
                            </button>
                        ) : (
                            <button onClick={() => handleSendRequest(resultUser)} style={{
                                background: 'var(--accent-primary)', color: 'white',
                                border: 'none', borderRadius: '50%', width: '40px', height: '40px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                            }}>
                                <UserPlus size={20} />
                            </button>
                        )}
                    </GlassCard>
                ))}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

export default FindFriendsView;
