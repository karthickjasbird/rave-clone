import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import YouTube from 'react-youtube';
import { database, auth } from '../firebase';
import { ref, onValue, set, update, push, onDisconnect, remove, get } from 'firebase/database';
import { ArrowLeft, MessageSquare, List, Users, Mic, MicOff, Send, PhoneOff, Headphones, XCircle } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import RoomQueue from '../components/RoomQueue';
import RoomUsers from '../components/RoomUsers';

import { searchVideos } from '../services/youtubeService';

import { useWebRTC } from '../hooks/useWebRTC';

const RoomView = () => {
    const { id } = useParams(); // Room ID
    const navigate = useNavigate();
    const [room, setRoom] = useState(null);
    const [activeTab, setActiveTab] = useState('chat'); // chat | queue | users
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    // Removed local isMuted state, using hook instead

    // WebRTC Hook
    const {
        joinVoice,
        leaveVoice,
        toggleMute,
        connectToPeer,
        isMuted,
        isConnected,
        remoteStreams
    } = useWebRTC(id, currentUser);

    // Auto-Join Voice - REMOVED for Opt-In Logic
    /*
    useEffect(() => {
        if (currentUser) {
            joinVoice();
        }
    }, [currentUser, joinVoice]);
    */

    // MESH LOGIC: When I connect OR when new users appear, I check if I need to call them
    // Note: To avoid double-calling or calling myself, connectToPeer handles safeguards.
    useEffect(() => {
        if (isConnected && room?.users && currentUser) {
            console.log("📡 Mesh Check: Reviewing peers...", Object.keys(room.users));
            Object.keys(room.users).forEach(uid => {
                if (uid !== currentUser.uid) {
                    // We only initiate if we don't have a stream? 
                    // Actually, connectToPeer checks `peersRef.current.has(uid)`.
                    // So it's safe to call idempotently.
                    connectToPeer(uid);
                }
            });
        }
    }, [isConnected, currentUser, JSON.stringify(room?.users || {})]);

    // Sync Mute State to DB


    useEffect(() => {
        if (currentUser) {
            update(ref(database, `rooms/${id}/users/${currentUser.uid}`), {
                isMuted: isMuted
            });
        }
    }, [isMuted, currentUser, id]);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);

    const [initialLoad, setInitialLoad] = useState(true);

    const [isKicked, setIsKicked] = useState(false);

    // Derived state
    const isHost = room?.hostId === currentUser?.uid;

    // Sync state
    const playerRef = useRef(null);
    const intervalRef = useRef(null);
    const isSyncing = useRef(false);
    const lastKnownIsPlaying = useRef(false);

    useEffect(() => {
        let activeUserRef = null;

        // 1. Auth & Presence
        const unsubscribeAuth = auth.onAuthStateChanged(user => {
            if (user) {
                setCurrentUser(user);

                // Check if user is kicked FIRST (Sequential logic)
                get(ref(database, `rooms/${id}/kicked/${user.uid}`)).then((snapshot) => {
                    if (snapshot.val() === true) {
                        setIsKicked(true);
                    } else {
                        // NOT KICKED - Now start the active listener and join
                        const kickRef = ref(database, `rooms/${id}/kicked/${user.uid}`);
                        const unsubscribeKick = onValue(kickRef, (s) => {
                            if (s.val() === true) {
                                setIsKicked(true);
                                // If they were successfully joined, remove them now
                                if (activeUserRef) {
                                    remove(activeUserRef).catch(console.error);
                                }
                            }
                        });

                        // Proceed to Join
                        if (!activeUserRef) {
                            const userRef = ref(database, `rooms/${id}/users/${user.uid}`);
                            activeUserRef = userRef;

                            const userData = {
                                displayName: user.displayName || 'Guest',
                                photoURL: user.photoURL || null,
                                isMuted: true,
                                isSpeaking: false,
                                lastSeen: Date.now()
                            };
                            update(userRef, userData);
                            onDisconnect(userRef).remove();

                            // RICH PRESENCE BROADCAST
                            const globalStatusRef = ref(database, `users/${user.uid}/status`);
                            update(globalStatusRef, {
                                state: 'online',
                                lastChanged: Date.now(),
                                currentActivity: {
                                    type: 'watching',
                                    roomId: id,
                                    roomName: room?.name || 'Rave Room',
                                    videoTitle: room?.queue?.[0]?.title || 'Just hanging out'
                                }
                            });
                            onDisconnect(globalStatusRef).update({
                                state: 'offline',
                                lastChanged: Date.now(),
                                currentActivity: null
                            });
                        }
                    }
                });

                return () => {
                    // Logic to unsubscribe from kick listener if it was created
                };
            }
        });

        // 2. Room Data Sync
        const roomRef = ref(database, `rooms/${id}`);
        const unsubscribeRoom = onValue(roomRef, (snapshot) => {
            const data = snapshot.val();

            // Critical: If data is null, it means room was deleted
            // OR if status is 'terminated', it means host ended it
            if (!data || data.status === 'terminated') {
                setRoom(null); // This triggers the Termination UI
                setInitialLoad(false);
                return;
            }

            setRoom(data);
            setInitialLoad(false);

            if (data) {
                if (data.chat) setMessages(Object.values(data.chat));
                // Sync logic is now handled in the player effect/callbacks
            }
        }, (error) => {
            console.warn("Room listener error (likely deleted):", error);
            // Treat error (like permission denied when room is deleted) as termination
            setRoom(null);
            setInitialLoad(false);
        });

        return () => {
            unsubscribeAuth();
            unsubscribeRoom();
            if (intervalRef.current) clearInterval(intervalRef.current);

            // CLEANUP: Remove user from room when component unmounts (Navigating back)
            if (activeUserRef) {
                remove(activeUserRef).catch(err => console.error("Cleanup error:", err));
            }

            // Clear Rich Presence
            if (auth.currentUser) {
                const globalStatusRef = ref(database, `users/${auth.currentUser.uid}/status`);
                update(globalStatusRef, { currentActivity: null }).catch(console.error);
            }
        };
    }, [id]);

    // 3. HOST-SIDE SECURITY PRUNING
    // Automatically remove anyone from the room who is in the 'kicked' list
    useEffect(() => {
        if (isHost && room?.users && room?.kicked) {
            Object.keys(room.users).forEach(uid => {
                if (room.kicked[uid]) {
                    console.log("👮 Host Pruning banned user:", uid);
                    remove(ref(database, `rooms/${id}/users/${uid}`)).catch(console.error);
                }
            });
        }
    }, [isHost, room?.users, room?.kicked, id]);

    // RICH PRESENCE UPDATER
    // Keep global status in sync with current room activity
    useEffect(() => {
        if (!currentUser || !room) return;

        // MATCHING APP.JSX: Write to 'status/{uid}' (not users/...)
        const globalStatusRef = ref(database, `status/${currentUser.uid}`);

        // Use update to merge with 'state: online' managed by App.jsx
        update(globalStatusRef, {
            currentActivity: {
                type: 'watching',
                roomId: id,
                roomName: room.name || 'Rave Room',
                videoTitle: room.queue?.[0]?.title || 'Just hanging out'
            }
        });

    }, [currentUser, room?.name, room?.queue?.[0]?.title, id]);

    // --- STRICT SYNC LOGIC ---
    const lastServerTime = useRef(0);
    const lastServerUpdate = useRef(Date.now());

    // Effect to sync participant player state with Realtime DB
    useEffect(() => {
        const player = playerRef.current;
        if (!player || !room || isHost) return;

        // Metadata Update & Stall Tracking
        const serverTime = room.currentTime || 0;
        if (serverTime !== lastServerTime.current) {
            lastServerTime.current = serverTime;
            lastServerUpdate.current = Date.now();
        }

        // STALL DETECTION (Ghost Captain II):
        // If room is playing but server time hasn't updated in > 1.5s (missed heartbeat), assume Host is stalled.
        // We set this LOWER than the sync tolerance (2s) to prevent the "yank back" effect.
        const timeSinceLastUpdate = Date.now() - lastServerUpdate.current;
        if (room.status === 'playing' && timeSinceLastUpdate > 1500) {
            // console.warn("⚠️ Host Stalled. Disabling Strict Sync.");
            return;
        }

        // Set a flag to prevent onStateChange from firing and creating a loop
        isSyncing.current = true;

        try {
            const playerState = player.getPlayerState();
            // Sync isPlaying state
            if (room.status === 'playing' && playerState !== 1) { // 1 is PS.PLAYING
                player.playVideo();
            } else if (room.status !== 'playing' && playerState !== 2 && playerState !== -1) { // 2 is PAUSED
                player.pauseVideo();
            }

            lastKnownIsPlaying.current = (room.status === 'playing');

            // Sync currentTime state (with tolerance)
            const currentTime = player.getCurrentTime();
            const serverTime = room.currentTime || 0;
            const timeDifference = Math.abs(currentTime - serverTime);

            if (timeDifference > 2) {
                player.seekTo(serverTime, true);
            }
        } catch (e) {
            console.error("Error during player sync:", e);
        } finally {
            // Release the sync lock after a short delay
            setTimeout(() => {
                isSyncing.current = false;
            }, 500);
        }
    }, [room, isHost]);


    // Chat Logic
    const sendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser) return;
        const chatRef = ref(database, `rooms/${id}/chat`);
        await push(chatRef, {
            text: newMessage,
            uid: currentUser.uid,
            displayName: currentUser.displayName || 'Guest',
            photoURL: currentUser.photoURL,
            timestamp: Date.now()
        });
        setNewMessage('');
    };

    // Search Logic (Official API)
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsLoading(true);
        setSearchError(null);
        setSearchResults([]);

        try {
            const results = await searchVideos(searchQuery);
            setSearchResults(results);
        } catch (error) {
            console.error("Search Error", error);
            setSearchError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const playNow = async (video) => {
        await update(ref(database, `rooms/${id}`), {
            videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
            status: 'playing',
            currentTime: 0
        });
        setIsSearching(false);
        setSearchQuery('');
    };

    const addToQueue = async (video) => {
        await push(ref(database, `rooms/${id}/queue`), {
            videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
            title: video.title,
            addedBy: currentUser?.displayName || 'Guest',
            thumb: video.thumb
        });
        setIsSearching(false);
        setSearchQuery('');
        setActiveTab('queue');
    };

    // --- SELF HEALING HOST LOGIC ---
    // REMOVED at User Request (Permanent Host)
    /*
    useEffect(() => {
        if (!room || !currentUser) return;
        const userCount = room.users ? Object.keys(room.users).length : 0;
        if (userCount === 1 && room.hostId !== currentUser.uid) {
            update(ref(database, `rooms/${id}`), { hostId: currentUser.uid });
        }
    }, [room, currentUser, id]);
    */

    // --- PLAYER CALLBACKS ---
    const isHostInitialSync = useRef(true); // New Ref to track if host has synced to room

    const onReady = (event) => {
        playerRef.current = event.target;

        // SMART RE-HOST LOGIC (Enhanced with Time-Drift Recovery):
        if (room) {
            const serverTime = room.currentTime || 0;
            const serverStatus = room.status || 'paused';

            // Time-Drift Calculation:
            // If the room was left 'playing', the time has moved forward while Host was gone.
            // We calculate this drift to prevent "Rolling Back" the room to the frozen server time.
            let targetTime = serverTime;
            const lastUpdated = room.lastUpdated || Date.now();
            const timePassedMs = Date.now() - lastUpdated;
            const timePassedSec = timePassedMs / 1000;

            if (serverStatus === 'playing' && timePassedSec > 1 && timePassedSec < 7200) {
                // Cap at 2 hours to prevent crazy jumps if room was abandoned for days
                console.log(`🕰️ Time-Drift Detected: +${timePassedSec.toFixed(1)}s`);
                targetTime += timePassedSec;
            }

            // Only seek if there is meaningful time (> 1s) to recover
            if (targetTime > 1) {
                console.log("⚓ Host Rejoin: Syncing to adjusted room time:", targetTime);
                event.target.seekTo(targetTime, true);
                if (serverStatus === 'playing') {
                    event.target.playVideo();
                } else {
                    event.target.pauseVideo();
                }
            } else {
                // Fresh room or start -> No need to block updates
                isHostInitialSync.current = false;
            }
        }

        // Disable sync block after short delay to allow seek to finish
        setTimeout(() => {
            isHostInitialSync.current = false;
        }, 2000);
    };

    const updateFirestoreTime = (currentTime) => {
        // Block updates during initial sync to prevent overwriting room time with 0:00
        if (isHost && !isHostInitialSync.current) {
            update(ref(database, `rooms/${id}`), {
                currentTime: currentTime,
                lastUpdated: Date.now() // Timestmap for Drift Recovery
            });
        }
    };

    const onStateChange = (event) => {
        const player = playerRef.current;
        if (!player || isSyncing.current) return;

        // Prevent updates during host restore
        if (isHost && isHostInitialSync.current) return;

        if (isHost) {
            if (event.data === 1) { // PLAYING
                update(ref(database, `rooms/${id}`), { status: 'playing' });

                if (intervalRef.current) clearInterval(intervalRef.current);
                intervalRef.current = setInterval(() => {
                    if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
                        updateFirestoreTime(playerRef.current.getCurrentTime());
                    }
                }, 1000);

            } else if (event.data === 2) { // PAUSED
                update(ref(database, `rooms/${id}`), { status: 'paused' });
                if (intervalRef.current) clearInterval(intervalRef.current);
                updateFirestoreTime(player.getCurrentTime());

            } else if (event.data === 0) { // ENDED
                update(ref(database, `rooms/${id}`), { status: 'paused' });
                if (intervalRef.current) clearInterval(intervalRef.current);
            }
        } else {
            // Client: prevent rogue control
            // If they pause while room is playing, force play
            if (event.data === 2 && room.status === 'playing') {
                player.playVideo();
            } else if (event.data === 1 && room.status !== 'playing') {
                player.pauseVideo();
            }
        }
    };

    // Extract ID from URL
    const getYouTubeId = (url) => {
        if (!url) return 'dQw4w9WgXcQ';
        const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
        return match && match[2].length === 11 ? match[2] : 'dQw4w9WgXcQ';
    };

    if (initialLoad) return (
        <div style={{
            height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'black', color: 'rgba(255,255,255,0.5)'
        }}>
            Loading Room...
        </div>
    );

    // If kicked -> Show Kick Screen
    if (isKicked) {
        return (
            <div style={{
                height: '100dvh', width: '100%', background: 'black',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'fixed', top: 0, left: 0, zIndex: 9999
            }}>
                <GlassCard style={{ flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '24px', maxWidth: '320px' }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444'
                    }}>
                        <XCircle size={48} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '12px', color: 'white' }}>Kicked Out</h3>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                            You have been kicked out of the room by the host.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/home')}
                        style={{
                            background: 'var(--accent-primary)', color: 'white',
                            border: 'none', padding: '14px 24px', borderRadius: '12px',
                            fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer',
                            width: '100%', boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}>
                        Return Home
                    </button>
                </GlassCard>
            </div>
        );
    }

    // If not loading and no room -> Terminated
    if (!room) {
        return (
            <div style={{
                height: '100dvh', width: '100%', background: 'black',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'fixed', top: 0, left: 0, zIndex: 9999
            }}>
                <GlassCard style={{ flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '20px', maxWidth: '300px' }}>
                    <div style={{ fontSize: '3rem' }}>🚫</div>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '8px' }}>Rave Ended</h3>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                            The host has ended this session.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/home')}
                        style={{
                            background: 'var(--accent-primary)', color: 'white',
                            border: 'none', padding: '12px 24px', borderRadius: '12px',
                            fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer',
                            width: '100%'
                        }}>
                        Go Home
                    </button>
                </GlassCard>
            </div>
        );
    }

    return (
        <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'black' }}>
            {/* HIDDEN AUDIO ELEMENTS FOR PEERS */}
            {/* HIDDEN AUDIO ELEMENTS FOR PEERS */}
            {Array.from(remoteStreams).map(([uid, stream]) => (
                <audio
                    key={uid}
                    playsInline
                    ref={el => {
                        if (el && el.srcObject !== stream) {
                            console.log(`🎧 Attaching stream for ${uid}`, stream.getAudioTracks());
                            el.srcObject = stream;
                            el.play().catch(e => console.error("Audio Autoplay failed for", uid, e));
                        }
                    }}
                />
            ))}



            {/* 1. Header (Sticky Top, above video) */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px',
                paddingTop: 'calc(env(safe-area-inset-top) + 12px)',
                background: 'var(--bg-deep)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                zIndex: 50
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => navigate('/home')}
                        style={{
                            background: 'none', border: 'none', color: 'white',
                            padding: 0, cursor: 'pointer', display: 'flex'
                        }}>
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, lineHeight: 1 }}>
                            {room.name || 'Room'}
                        </h2>
                        {isHost && <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>HOST</span>}
                    </div>
                </div>

                {/* Host Avatar (Top Right) */}
                {room.users && room.users[room.hostId] && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'gray' }}>Host</span>
                        <img
                            src={room.users[room.hostId].photoURL || 'https://via.placeholder.com/40'}
                            style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--accent-primary)' }}
                            alt="Host"
                        />
                    </div>
                )}
            </div>

            {/* 2. Video Player Area */}
            <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', position: 'relative', flexShrink: 0 }}>
                {/* Back Button REMOVED from here */}

                <YouTube
                    videoId={getYouTubeId(room.videoUrl)}
                    onReady={onReady}
                    onStateChange={onStateChange}
                    opts={{
                        height: '100%',
                        width: '100%',
                        playerVars: {
                            autoplay: 1,
                            controls: isHost ? 1 : 0, // Hide controls for clients
                            rel: 0,
                            showinfo: 0,
                            modestbranding: 1,
                            disablekb: isHost ? 0 : 1,
                            fs: 0,
                            playsinline: 1,
                            origin: window.location.origin
                        },
                    }}
                    style={{ width: '100%', height: '100%' }}
                    iframeClassName="w-full h-full"
                />
            </div>



            {/* 2. Search Bar (New Feature) */}
            <div style={{ padding: '12px', background: 'var(--bg-deep)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
                    <div style={{
                        flex: 1, background: 'rgba(255,255,255,0.1)', borderRadius: '12px',
                        display: 'flex', alignItems: 'center', padding: '0 12px'
                    }}>
                        {/* Search Icon */}
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onFocus={() => setIsSearching(true)}
                            placeholder="Search YouTube..."
                            enterKeyHint="search"
                            style={{
                                background: 'none', border: 'none', color: 'white',
                                padding: '12px', flex: 1, outline: 'none', fontSize: '1rem'
                            }}
                        />
                    </div>
                    {/* Search / Cancel Button Logic */}
                    {searchQuery.trim().length > 0 ? (
                        <button
                            type="submit"
                            disabled={isLoading}
                            style={{
                                background: 'var(--accent-primary)', border: 'none',
                                color: 'white', fontWeight: 'bold', borderRadius: '12px',
                                padding: '0 16px', cursor: 'pointer',
                                opacity: isLoading ? 0.7 : 1
                            }}>
                            {isLoading ? '...' : 'Search'}
                        </button>
                    ) : isSearching ? (
                        <button
                            type="button"
                            onClick={() => { setIsSearching(false); setSearchQuery(''); }}
                            style={{ background: 'none', border: 'none', color: 'white', fontWeight: 'bold', padding: '0 12px' }}>
                            Cancel
                        </button>
                    ) : null}
                </form>
            </div>



            {/* 3. Main Content Area */}
            <div style={{ flex: 1, overflowY: 'hidden', position: 'relative', background: 'var(--bg-deep)' }}>

                {isSearching ? (
                    // SEARCH RESULTS OVERLAY
                    <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
                        {isLoading && (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--accent-primary)' }}>
                                <div style={{ marginBottom: 10 }}>Searching YouTube...</div>
                                {/* Simple CSS Spinner could go here */}
                            </div>
                        )}

                        {!isLoading && searchError && (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#ff6b6b' }}>
                                <div style={{ marginBottom: 8, fontWeight: 'bold' }}>No Results Found</div>
                                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                    (Error: {searchError})
                                </div>
                            </div>
                        )}

                        {!isLoading && !searchError && searchResults.length > 0 && (
                            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '12px' }}>Search Results</h3>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {searchResults.map((vid) => (
                                <GlassCard key={vid.id} noPadding style={{ display: 'flex', gap: '12px', padding: '8px', alignItems: 'center' }}>
                                    <img src={vid.thumb} style={{ width: 100, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '4px' }}>{vid.title}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'gray' }}>{vid.channel}</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {isHost && (
                                            <button
                                                onClick={() => playNow(vid)}
                                                style={{
                                                    padding: '6px 12px', background: 'var(--accent-primary)',
                                                    border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.7rem'
                                                }}>
                                                Play
                                            </button>
                                        )}
                                        <button
                                            onClick={() => addToQueue(vid)}
                                            style={{
                                                padding: '6px 12px', background: 'rgba(255,255,255,0.1)',
                                                border: 'none', borderRadius: '8px', color: 'white', fontSize: '0.7rem'
                                            }}>
                                            Queue
                                        </button>
                                    </div>
                                </GlassCard>
                            ))}

                            {!isLoading && !searchError && searchResults.length === 0 && searchQuery && (
                                <div style={{ textAlign: 'center', color: 'gray', padding: '20px' }}>
                                    No results found.
                                </div>
                            )}

                            {!isLoading && searchResults.length === 0 && !searchQuery && (
                                <div style={{ textAlign: 'center', color: 'gray', padding: '20px' }}>
                                    Type to search...
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // NORMAL TABS
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Tab Header */}
                        <div style={{
                            display: 'flex',
                            background: 'rgba(20,20,30,0.95)',
                            borderBottom: '1px solid var(--glass-border)',
                            flexShrink: 0
                        }}>
                            <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={MessageSquare} label="Chat" />
                            <TabButton active={activeTab === 'queue'} onClick={() => setActiveTab('queue')} icon={List} label="Queue" />
                            <TabButton active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={Users} label="Users" />
                        </div>

                        {/* Voice Bar (Opt-In Logic) */}
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(10,10,10,0.6)',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            flexShrink: 0
                        }}>
                            {!isConnected ? (
                                <button
                                    onClick={joinVoice}
                                    style={{
                                        width: '100%', padding: '10px',
                                        background: 'rgba(52, 211, 153, 0.1)', color: '#34d399',
                                        border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '12px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                        fontWeight: 'bold', cursor: 'pointer'
                                    }}>
                                    <Headphones size={18} />
                                    Tap to Join Voice Chat
                                </button>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF50', boxShadow: '0 0 8px #4CAF50' }} />
                                        <span style={{ color: '#4CAF50', fontSize: '0.85rem', fontWeight: 'bold' }}>Voice Connected</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button
                                            onClick={toggleMute}
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: isMuted ? 'rgba(255,255,255,0.1)' : 'white',
                                                color: isMuted ? 'white' : 'black',
                                                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}>
                                            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                                        </button>
                                        <button
                                            onClick={leaveVoice}
                                            style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'rgba(239, 68, 68, 0.2)',
                                                color: '#ef4444',
                                                border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}>
                                            <PhoneOff size={16} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Tab Content */}
                        <div style={{ flex: 1, overflowY: 'hidden', position: 'relative' }}>
                            {activeTab === 'chat' && (
                                <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

                                    {/* Chat Input (Moved to Top) */}
                                    <form onSubmit={sendMessage} style={{
                                        padding: '12px 16px', background: 'rgba(20,20,30,0.4)',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '12px',
                                        flexShrink: 0
                                    }}>
                                        <input
                                            value={newMessage}
                                            onChange={e => setNewMessage(e.target.value)}
                                            placeholder="Say something..."
                                            style={{
                                                flex: 1, background: 'rgba(255,255,255,0.1)', border: 'none',
                                                borderRadius: '20px', padding: '10px 16px', color: 'white', fontSize: '0.9rem'
                                            }}
                                        />
                                        <button type="submit" style={{
                                            background: 'var(--accent-primary)', border: 'none', width: 40, height: 40, borderRadius: '50%',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer'
                                        }}>
                                            <Send size={18} />
                                        </button>
                                    </form>

                                    {/* Messages List */}
                                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '112px' }}>
                                        {messages.map((msg, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                <img src={msg.photoURL || 'https://via.placeholder.com/32'} style={{ width: 32, height: 32, borderRadius: '50%' }} />
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 2 }}>{msg.displayName}</div>
                                                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 12px', borderRadius: '0 12px 12px 12px', fontSize: '0.95rem' }}>
                                                        {msg.text}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'queue' && <RoomQueue roomId={id} queue={room.queue} isHost={isHost} onPlay={(item) => playNow({ id: item.videoUrl.split('v=')[1] })} />}
                            {activeTab === 'users' && <RoomUsers roomId={id} users={room.users} currentUser={currentUser} isHost={isHost} />}
                        </div>
                    </div>
                )}

            </div>
        </div >
    );
};

// Helper for Tab Button
const TabButton = ({ active, onClick, icon: Icon, label }) => (
    <button
        onClick={onClick}
        style={{
            flex: 1, padding: '14px', background: 'none', border: 'none',
            borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
            color: active ? 'white' : 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontSize: '0.95rem', fontWeight: active ? '600' : '400',
            cursor: 'pointer'
        }}>
        <Icon size={18} />
        {label}
    </button>
);

export default RoomView;
