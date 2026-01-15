import React, { useEffect, useState } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { Play, Headphones, TrendingUp, Radio, User, X, Plus, Hash, Youtube, Music, Folder, Tv, ShoppingBag, ChevronDown, ChevronUp, Search, UserPlus, Check, Clock, Users, Camera as CameraIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, database } from '../firebase';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { ref, get, child, query, orderByChild, equalTo, onValue, remove, set, startAt, endAt, limitToFirst } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const HomeView = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [dbUser, setDbUser] = useState(null);
    const [showProfile, setShowProfile] = useState(false);
    const [showImageSourceModal, setShowImageSourceModal] = useState(false);

    // Username Onboarding State
    const [showNameModal, setShowNameModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    // Section State
    const [sections, setSections] = useState({
        myRooms: true,
        active: true,
        services: true,
        suggested: true
    });

    // My Rooms State
    const [myRooms, setMyRooms] = useState([]);
    const [publicRooms, setPublicRooms] = useState([]);

    // Join Room State
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [joinLoading, setJoinLoading] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Fetch DB User for Profile display AND Enforcement
                get(ref(database, `users/${currentUser.uid}`)).then(snapshot => {
                    if (snapshot.exists()) {
                        const val = snapshot.val();
                        setDbUser(val);
                        // Strict Check: If DB record exists but username is missing/empty
                        if (!val.username) {
                            setShowNameModal(true);
                        }
                    } else {
                        // Strict Check: If NO DB record exists at all
                        setDbUser(null);
                        setShowNameModal(true);
                    }
                });
            } else {
                setDbUser(null);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleSaveUsername = async () => {
        if (!newUsername.trim()) return;
        setSavingName(true);
        try {
            // 1. Update Auth Profile
            await updateProfile(auth.currentUser, {
                displayName: newUsername.trim()
            });

            // 2. CRITICAL: Save to Realtime Database
            const userRef = ref(database, `users/${auth.currentUser.uid}`);
            await set(userRef, {
                username: newUsername.trim(),
                email: auth.currentUser.email,
                uid: auth.currentUser.uid,
                photoURL: auth.currentUser.photoURL || '',
                createdAt: new Date().toISOString()
            });

            // Force update local user state
            setUser({ ...auth.currentUser, displayName: newUsername.trim() });
            setDbUser({ username: newUsername.trim() }); // Update local DB state
            setShowNameModal(false);
        } catch (error) {
            console.error("Error updating profile:", error);
            alert("Failed to save username. Please try again.");
        } finally {
            setSavingName(false);
        }
    };



    // Fetch My Rooms
    useEffect(() => {
        if (!user) {
            setMyRooms([]);
            return;
        }

        const roomsRef = ref(database, 'rooms');
        const myRoomsQuery = query(roomsRef, orderByChild('hostId'), equalTo(user.uid));

        const unsubscribe = onValue(myRoomsQuery, (snapshot) => {
            if (snapshot.exists()) {
                const roomsData = snapshot.val();
                const roomsList = Object.keys(roomsData).map(key => ({
                    id: key,
                    ...roomsData[key]
                }));
                // Sort by creation time if available, or just reverse to show newest first
                setMyRooms(roomsList.reverse());
            } else {
                setMyRooms([]);
            }
        });

        return () => unsubscribe();
    }, [user]);

    // Fetch Public Rooms (Active Now)
    useEffect(() => {
        const roomsRef = ref(database, 'rooms');
        const publicRoomsQuery = query(roomsRef, orderByChild('isPublic'), equalTo(true));

        const unsubscribe = onValue(publicRoomsQuery, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                let roomsList = Object.entries(data).map(([key, room]) => ({
                    id: key,
                    ...room
                }));

                // Filter out my own rooms
                if (user) {
                    roomsList = roomsList.filter(r => r.hostId !== user.uid);
                }

                // Sort by createdAt (newest first)
                roomsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                setPublicRooms(roomsList);
            } else {
                setPublicRooms([]);
            }
        });

        return () => unsubscribe();
    }, [user]);

    // Fetch Friends & Statuses (Rich Presence)
    const [friends, setFriends] = useState([]);
    const [statuses, setStatuses] = useState({});

    useEffect(() => {
        if (!user) {
            setFriends([]);
            return;
        }

        const friendsRef = ref(database, `friends/${user.uid}`);
        const unsubscribe = onValue(friendsRef, (snapshot) => {
            if (snapshot.exists()) {
                const friendsList = Object.values(snapshot.val());
                setFriends(friendsList);
            } else {
                setFriends([]);
            }
        });
        return () => unsubscribe();
    }, [user]);

    // Fetch Live Statuses for Friends
    useEffect(() => {
        if (friends.length > 0) {
            const unsubs = [];
            friends.forEach(friend => {
                const statusRef = ref(database, `status/${friend.uid}`);
                const unsub = onValue(statusRef, (snapshot) => {
                    const val = snapshot.val();
                    setStatuses(prev => ({
                        ...prev,
                        [friend.uid]: val // Store full object
                    }));
                });
                unsubs.push(unsub);
            });
            return () => unsubs.forEach(fn => fn());
        }
    }, [friends]);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            navigate('/');
        } catch (error) {
            console.error("Error signing out", error);
        }
    };

    const handleSelectImageSource = async (source) => {
        setShowImageSourceModal(false);
        try {
            const image = await Camera.getPhoto({
                quality: 90,
                allowEditing: true,
                resultType: CameraResultType.Uri,
                source: source
            });
            await handleUploadPhoto(image);
        } catch (error) {
            console.log("User cancelled photo selection");
        }
    };

    const handleUploadPhoto = async (image) => {
        if (!image.webPath) return;

        try {
            setUploadingPhoto(true);

            // Convert webPath to Blob
            const response = await fetch(image.webPath);
            const blob = await response.blob();

            // Upload to Firebase Storage
            const fileRef = storageRef(storage, `profile_images/${user.uid}/${Date.now()}.jpg`);
            await uploadBytes(fileRef, blob);
            const photoURL = await getDownloadURL(fileRef);

            // Update Auth Profile
            await updateProfile(auth.currentUser, { photoURL });

            // Update Realtime Database
            const userRef = ref(database, `users/${user.uid}`);
            const snapshot = await get(userRef);
            const currentData = snapshot.exists() ? snapshot.val() : {};

            await set(userRef, {
                ...currentData,
                photoURL: photoURL
            });

            // Force update local state
            setUser({ ...auth.currentUser, photoURL });
            setDbUser(prev => ({ ...prev, photoURL }));
        } catch (error) {
            console.error("Error updating profile picture:", error);
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleDeleteProfile = async () => {
        if (!confirm("Start Fresh? \nThis will delete your username and profile data. You will be signed out.")) return;

        try {
            if (user) {
                await remove(ref(database, `users/${user.uid}`));
                await signOut(auth);
                navigate('/');
            }
        } catch (error) {
            console.error("Error deleting profile:", error);
            alert("Failed to delete profile.");
        }
    };

    const handleJoinRoom = async () => {
        if (!joinCode.trim()) return;
        setJoinLoading(true);
        let code = joinCode.trim();

        try {
            // 1. Direct Check
            let snapshot = await get(child(ref(database), `rooms/${code}`));

            // 2. Smart Fix: If failed and missing dash, try prepending it
            if (!snapshot.exists() && !code.startsWith('-')) {
                const fixedCode = `-${code}`;
                const retrySnapshot = await get(child(ref(database), `rooms/${fixedCode}`));
                if (retrySnapshot.exists()) {
                    code = fixedCode; // Update code for navigation
                    snapshot = retrySnapshot; // Use valid snapshot
                }
            }

            if (snapshot.exists()) {
                setShowJoinModal(false);
                setJoinCode('');
                navigate(`/room/${code}`);
            } else {
                alert("Room not found. Please check the code.");
            }
        } catch (error) {
            console.error("Error joining room:", error);
            alert("Error joining room. Please try again.");
        } finally {
            setJoinLoading(false);
        }
    };

    const services = [
        { name: 'Netflix', color: '#E50914', icon: Tv },
        { name: 'YouTube', color: '#FF0000', icon: Youtube },
        { name: 'Disney+', color: '#113CCF', icon: Tv },
        { name: 'Prime', color: '#00A8E1', icon: ShoppingBag },
        { name: 'Spotify', color: '#1DB954', icon: Music },
        { name: 'Files', color: '#FFF', icon: Folder },
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflowY: 'auto',
            paddingBottom: '24px', // Reduced padding, handled by Spacer below
            gap: '24px'
        }}>

            {/* Header */}
            <div style={{
                padding: 'calc(env(safe-area-inset-top) + var(--spacing-page)) var(--spacing-page) 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: '800' }}>Your Raves</h1>

                    {/* Search Button Removed from Header */}
                    {/* Just Join Button Left */}
                    <button
                        onClick={() => setShowJoinModal(true)}
                        style={{
                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '50px', padding: '6px 14px',
                            color: 'white', fontSize: '0.9rem', fontWeight: '600',
                            display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer'
                        }}>
                        <Hash size={14} /> Join
                    </button>
                </div>

                {/* Profile Pic */}
                <div onClick={() => setShowProfile(true)} style={{ cursor: 'pointer' }}>
                    {user?.photoURL ? (
                        <img
                            src={user.photoURL}
                            alt="Profile"
                            style={{
                                width: '40px', height: '40px', borderRadius: '50%',
                                border: '2px solid rgba(255,255,255,0.2)',
                                objectFit: 'cover'
                            }}
                        />
                    ) : (
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '50%',
                            background: 'rgba(255,255,255,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '2px solid rgba(255,255,255,0.2)'
                        }}>
                            <User size={20} color="white" />
                        </div>
                    )}
                </div>
            </div>



            {/* Join Room Modal */}
            {showJoinModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowJoinModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '320px' }}>
                        <GlassCard style={{ flexDirection: 'column', padding: '24px', position: 'relative' }}>
                            <h3 style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '8px' }}>Join a Party</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>
                                Enter the invite code to hop in.
                            </p>

                            <input
                                value={joinCode}
                                onChange={(e) => setJoinCode(e.target.value)}
                                placeholder="e.g. -OD..."
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(0,0,0,0.3)',
                                    color: 'white',
                                    fontSize: '1.1rem',
                                    marginBottom: '20px',
                                    outline: 'none',
                                    textAlign: 'center',
                                    letterSpacing: '1px'
                                }}
                            />

                            <button
                                onClick={handleJoinRoom}
                                disabled={joinLoading || !joinCode.trim()}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    borderRadius: '12px',
                                    background: 'var(--accent-primary)',
                                    border: 'none',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                    opacity: (joinLoading || !joinCode.trim()) ? 0.7 : 1
                                }}>
                                {joinLoading ? 'Checking...' : 'Join Room'}
                            </button>
                        </GlassCard>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            {showProfile && user && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 50,
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowProfile(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '320px' }}>
                        <GlassCard style={{ flexDirection: 'column', alignItems: 'center', padding: '32px', position: 'relative' }}>
                            <button
                                onClick={() => setShowProfile(false)}
                                style={{
                                    position: 'absolute', top: 16, right: 16, zIndex: 50,
                                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer'
                                }}>
                                <X size={24} />
                            </button>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>

                                <div
                                    onClick={!uploadingPhoto ? () => setShowImageSourceModal(true) : undefined}
                                    style={{ position: 'relative', cursor: uploadingPhoto ? 'wait' : 'pointer', marginBottom: '16px' }}
                                >
                                    {user.photoURL ? (
                                        <img
                                            src={user.photoURL}
                                            alt="Profile Large"
                                            style={{
                                                width: '80px', height: '80px', borderRadius: '50%',
                                                border: '4px solid rgba(255,255,255,0.1)',
                                                objectFit: 'cover',
                                                opacity: uploadingPhoto ? 0.5 : 1
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: '80px', height: '80px', borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '4px solid rgba(255,255,255,0.1)',
                                            opacity: uploadingPhoto ? 0.5 : 1
                                        }}>
                                            <User size={40} color="white" />
                                        </div>
                                    )}

                                    {/* Loading Overlay */}
                                    {uploadingPhoto && (
                                        <div style={{
                                            position: 'absolute', inset: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <div style={{
                                                width: '20px', height: '20px',
                                                border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%',
                                                animation: 'spin 1s linear infinite'
                                            }} />
                                            <style>{`
                                            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                                        `}</style>
                                        </div>
                                    )}

                                </div>

                                <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '4px', textAlign: 'center' }}>
                                    {user.displayName || 'Guest User'}
                                </h3>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', marginBottom: '8px', textAlign: 'center', wordBreak: 'break-all' }}>
                                    {user.email}
                                </p>

                                {/* Username Display */}
                                <p style={{
                                    color: 'var(--accent-primary)', fontSize: '1rem', fontWeight: '700',
                                    marginBottom: '24px', textAlign: 'center',
                                    background: 'rgba(var(--accent-primary-rgb), 0.1)', padding: '6px 16px', borderRadius: '20px',
                                    border: '1px solid rgba(var(--accent-primary-rgb), 0.2)'
                                }}>
                                    @{dbUser?.username || user.displayName?.replace(/\s+/g, '').toLowerCase() || 'username'}
                                </p>

                                <button
                                    onClick={handleSignOut}
                                    style={{
                                        padding: '12px 24px', borderRadius: '12px',
                                        background: 'rgba(255, 255, 255, 0.1)', color: 'white',
                                        border: 'none', fontWeight: '600', width: '100%', cursor: 'pointer',
                                        marginBottom: '12px'
                                    }}>
                                    Sign Out
                                </button>

                                <button
                                    onClick={handleDeleteProfile}
                                    style={{
                                        padding: '12px 24px', borderRadius: '12px',
                                        background: 'rgba(255, 59, 48, 0.1)', color: '#ff3b30',
                                        border: '1px solid rgba(255, 59, 48, 0.3)',
                                        fontWeight: '600', width: '100%', cursor: 'pointer'
                                    }}>
                                    Delete Profile
                                </button>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            )}

            {/* Custom Image Source Selector Modal */}
            {showImageSourceModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowImageSourceModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '300px' }}>
                        <GlassCard style={{ flexDirection: 'column', gap: '12px', padding: '24px' }}>
                            <h3 style={{ margin: '0 0 16px 0', textAlign: 'center' }}>Change Profile Picture</h3>

                            <button onClick={() => handleSelectImageSource(CameraSource.Camera)} style={{
                                padding: '16px', borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.1)', color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '1rem'
                            }}>
                                <CameraIcon size={20} />
                                Take Photo
                            </button>

                            <button onClick={() => handleSelectImageSource(CameraSource.Photos)} style={{
                                padding: '16px', borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.1)', color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '1rem'
                            }}>
                                <Folder size={20} />
                                Choose from Photos
                            </button>

                            <button onClick={() => setShowImageSourceModal(false)} style={{
                                padding: '12px', marginTop: '8px',
                                background: 'transparent', border: 'none',
                                color: 'rgba(255, 255, 255, 0.5)', cursor: 'pointer'
                            }}>
                                Cancel
                            </button>
                        </GlassCard>
                    </div>
                </div>
            )}


            {/* Custom Image Source Selector Modal */}
            {showImageSourceModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 60,
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} onClick={() => setShowImageSourceModal(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '300px' }}>
                        <GlassCard style={{ flexDirection: 'column', gap: '12px', padding: '24px' }}>
                            <h3 style={{ margin: '0 0 16px 0', textAlign: 'center' }}>Change Profile Picture</h3>

                            <button onClick={() => handleSelectImageSource(CameraSource.Camera)} style={{
                                padding: '16px', borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.1)', color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '1rem'
                            }}>
                                <CameraIcon size={20} />
                                Take Photo
                            </button>

                            <button onClick={() => handleSelectImageSource(CameraSource.Photos)} style={{
                                padding: '16px', borderRadius: '12px',
                                background: 'rgba(255, 255, 255, 0.1)', color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '1rem'
                            }}>
                                <Folder size={20} />
                                Choose from Photos
                            </button>

                            <button onClick={() => setShowImageSourceModal(false)} style={{
                                padding: '12px', marginTop: '8px',
                                background: 'transparent', border: 'none',
                                color: 'rgba(255, 255, 255, 0.5)', cursor: 'pointer'
                            }}>
                                Cancel
                            </button>
                        </GlassCard>
                    </div>
                </div>
            )}


            {/* Friends Online Rail (Rich Presence) */}
            {friends.length > 0 && (
                <div style={{ padding: '0 var(--spacing-page)', overflowX: 'auto', display: 'flex', gap: '16px', paddingBottom: '8px', flexShrink: 0 }}>


                    {friends
                        .sort((a, b) => {
                            // Sort online/watching first
                            const aActive = statuses[a.uid]?.state === 'online';
                            const bActive = statuses[b.uid]?.state === 'online';
                            return bActive - aActive;
                        })
                        .map(friend => {
                            const status = statuses[friend.uid];
                            const isOnline = status?.state === 'online';
                            const isWatching = isOnline && status?.currentActivity;

                            return (
                                <div
                                    key={friend.uid}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0, cursor: 'pointer', position: 'relative' }}
                                    onClick={() => {
                                        if (isWatching) {
                                            navigate(`/room/${status.currentActivity.roomId}`);
                                        } else {
                                            navigate(`/chat/${friend.uid}`);
                                        }
                                    }}
                                >
                                    <div style={{ position: 'relative' }}>
                                        <img
                                            src={friend.photoURL}
                                            alt={friend.username}
                                            style={{
                                                width: 56, height: 56, borderRadius: '50%', objectFit: 'cover',
                                                border: isWatching ? '3px solid var(--accent-primary)' : '3px solid transparent',
                                                padding: '2px'
                                            }}
                                            onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${friend.username}&background=random` }}
                                        />
                                        {isOnline && (
                                            <div style={{
                                                position: 'absolute', bottom: 2, right: 2,
                                                width: 14, height: 14, borderRadius: '50%',
                                                background: '#4ade80', border: '2px solid black'
                                            }} />
                                        )}
                                        {isWatching && (
                                            <div style={{
                                                position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
                                                background: 'var(--accent-primary)', fontSize: '0.6rem', fontWeight: 'bold',
                                                padding: '2px 6px', borderRadius: '10px', whiteSpace: 'nowrap',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                                            }}>
                                                JOIN
                                            </div>
                                        )}
                                    </div>
                                    <span style={{ fontSize: '0.75rem', maxWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {friend.username}
                                    </span>
                                </div>
                            );
                        })}
                </div>
            )}

            {/* 0. My Rooms (Collapsible) */}
            {myRooms.length > 0 && (
                <div style={{ padding: '24px 0 0', flexShrink: 0 }}>
                    <div
                        onClick={() => setSections(prev => ({ ...prev, myRooms: !prev.myRooms }))}
                        style={{
                            padding: '0 var(--spacing-page)',
                            marginBottom: sections.myRooms ? '16px' : '0',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', margin: 0 }}>My Rooms</h3>
                            {sections.myRooms ? <ChevronUp size={20} color="var(--text-secondary)" /> : <ChevronDown size={20} color="var(--text-secondary)" />}
                        </div>
                        <span style={{ fontSize: '0.9rem', color: 'var(--accent-primary)' }}>{myRooms.length}</span>
                    </div>

                    {sections.myRooms && (
                        <div style={{
                            display: 'flex',
                            gap: '16px',
                            overflowX: 'auto',
                            padding: '0 var(--spacing-page)',
                            scrollSnapType: 'x mandatory',
                            animation: 'fadeIn 0.3s ease'
                        }}>
                            {myRooms.map(room => {
                                const videoId = room.queue?.[0]?.videoId;
                                const userCount = room.users ? Object.keys(room.users).length : 0;
                                const bgImage = videoId
                                    ? `url(https://img.youtube.com/vi/${videoId}/mqdefault.jpg)`
                                    : 'linear-gradient(45deg, #1a1a2e, #16213e)';

                                return (
                                    <div key={room.id} onClick={() => navigate(`/room/${room.id}`)} style={{ scrollSnapAlign: 'start', cursor: 'pointer', flexShrink: 0 }}>
                                        <GlassCard noPadding style={{
                                            width: '260px', height: '140px', position: 'relative', overflow: 'hidden',
                                            backgroundImage: bgImage, backgroundSize: 'cover', backgroundPosition: 'center'
                                        }}>
                                            {/* Gradient Overlay */}
                                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%)' }} />

                                            {/* Top Row: Badges */}
                                            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
                                                <div style={{
                                                    background: 'var(--accent-primary)', padding: '4px 8px', borderRadius: 8,
                                                    fontSize: '0.7rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                                }}>HOST</div>

                                                <div style={{
                                                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                                                    padding: '4px 8px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 'bold',
                                                    display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <Users size={12} fill="white" /> {userCount}
                                                </div>
                                            </div>

                                            {/* Bottom Content */}
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px' }}>
                                                <h4 style={{ fontWeight: 'bold', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                                    {room.name || 'Untitled Room'}
                                                </h4>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: room.queue?.[0] ? '#4ade80' : 'gray' }} />
                                                    <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                                        {room.queue?.[0]?.title || room.service || 'Chilling'}
                                                    </p>
                                                </div>
                                            </div>
                                        </GlassCard>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* 1. Active Raves (Horizontal Scroll) */}
            <div style={{ padding: '0', flexShrink: 0 }}>
                <div
                    onClick={() => setSections(prev => ({ ...prev, active: !prev.active }))}
                    style={{
                        padding: '0 var(--spacing-page)',
                        marginBottom: sections.active ? '16px' : '0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        cursor: 'pointer'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: '600', margin: 0 }}>Active Now</h3>
                        {sections.active ? <ChevronUp size={20} color="var(--text-secondary)" /> : <ChevronDown size={20} color="var(--text-secondary)" />}
                    </div>
                    <span style={{ fontSize: '0.9rem', color: 'var(--accent-primary)' }}>See all</span>
                </div>

                {sections.active && (
                    <div style={{
                        display: 'flex',
                        gap: '16px',
                        overflowX: 'auto',
                        padding: '0 var(--spacing-page) 24px',
                        scrollSnapType: 'x mandatory',
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        {publicRooms.length === 0 ? (
                            <div style={{ padding: '20px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', width: '100%' }}>
                                No public rooms active. Start your own!
                            </div>
                        ) : (
                            publicRooms.map(room => {
                                const videoId = room.queue?.[0]?.videoId;
                                const userCount = room.users ? Object.keys(room.users).length : 0;
                                const isPlaying = !!room.queue?.[0];
                                const bgImage = videoId
                                    ? `url(https://img.youtube.com/vi/${videoId}/mqdefault.jpg)`
                                    : 'linear-gradient(45deg, #2c3e50, #000000)';

                                return (
                                    <div key={room.id} onClick={() => navigate(`/room/${room.id}`)} style={{ scrollSnapAlign: 'start', cursor: 'pointer', flexShrink: 0 }}>
                                        <GlassCard noPadding style={{
                                            width: '280px', height: '180px', position: 'relative', overflow: 'hidden',
                                            backgroundImage: bgImage, backgroundSize: 'cover', backgroundPosition: 'center'
                                        }}>
                                            {/* Gradient Overlay */}
                                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.3) 60%, rgba(0,0,0,0.1) 100%)' }} />

                                            {/* Top Row */}
                                            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
                                                {isPlaying ? (
                                                    <div style={{ background: '#ef4444', padding: '4px 8px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>LIVE</div>
                                                ) : (
                                                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 'bold' }}>OPEN</div>
                                                )}

                                                <div style={{
                                                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                                                    padding: '4px 8px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 'bold',
                                                    display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    <Users size={12} fill="white" /> {userCount}
                                                </div>
                                            </div>

                                            {/* Bottom Content */}
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px' }}>
                                                <h4 style={{ fontWeight: 'bold', fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
                                                    {room.name || 'Untitled Room'}
                                                </h4>
                                                <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                    {room.queue?.[0]?.title || `Hanging out in ${room.service || 'Lobby'}`}
                                                </p>
                                            </div>
                                        </GlassCard>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* 2. Services Grid */}
            <div style={{ padding: '0 var(--spacing-page)', flexShrink: 0 }}>
                <div
                    onClick={() => setSections(prev => ({ ...prev, services: !prev.services }))}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        marginBottom: sections.services ? '16px' : '0',
                        cursor: 'pointer'
                    }}
                >
                    <h3 style={{ fontSize: '1.2rem', fontWeight: '600', margin: 0 }}>Services</h3>
                    {sections.services ? <ChevronUp size={20} color="var(--text-secondary)" /> : <ChevronDown size={20} color="var(--text-secondary)" />}
                </div>

                {sections.services && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', paddingBottom: '12px', animation: 'fadeIn 0.3s ease' }}>
                        {services.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => navigate('/create')}
                                style={{
                                    background: 'var(--glass-surface)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    borderRadius: '16px',
                                    padding: '16px',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '50%',
                                    background: `${s.color}20`, // 20% opacity of brand color
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <s.icon size={20} color={s.color} fill={s.color} strokeWidth={0} />
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)' }}>{s.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* 3. Suggested Section */}
            <div style={{ padding: '0 var(--spacing-page)', flexShrink: 0 }}>
                <div
                    onClick={() => setSections(prev => ({ ...prev, suggested: !prev.suggested }))}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        marginBottom: sections.suggested ? '16px' : '0',
                        cursor: 'pointer'
                    }}
                >
                    <h3 style={{ fontSize: '1.2rem', fontWeight: '600', margin: 0 }}>Suggested for You</h3>
                    {sections.suggested ? <ChevronUp size={20} color="var(--text-secondary)" /> : <ChevronDown size={20} color="var(--text-secondary)" />}
                </div>

                {sections.suggested && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', animation: 'fadeIn 0.3s ease' }}>
                        {publicRooms
                            .sort((a, b) => {
                                // Trending Algo: Sort by User Count (Desc), then Newest
                                const countA = a.users ? Object.keys(a.users).length : 0;
                                const countB = b.users ? Object.keys(b.users).length : 0;
                                if (countB !== countA) return countB - countA;
                                return (b.createdAt || 0) - (a.createdAt || 0);
                            })
                            .slice(0, 4) // Top 4
                            .map(room => {
                                const userCount = room.users ? Object.keys(room.users).length : 0;
                                return (
                                    <div key={`trend-${room.id}`} onClick={() => navigate(`/room/${room.id}`)} style={{ cursor: 'pointer' }}>
                                        <GlassCard noPadding style={{ height: '140px', position: 'relative' }}>
                                            {/* Trending Badge */}
                                            <div style={{
                                                position: 'absolute', top: 12, left: 12,
                                                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                                                padding: '4px 8px', borderRadius: 8,
                                                fontSize: '0.7rem', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.1)',
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                <User size={12} fill="white" /> {userCount}
                                            </div>

                                            <div style={{
                                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                                padding: '12px',
                                                background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)'
                                            }}>
                                                <h4 style={{ fontWeight: 'bold', fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {room.name || 'Untitled'}
                                                </h4>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    Watching {room.service || 'Video'}
                                                </p>
                                            </div>
                                        </GlassCard>
                                    </div>
                                );
                            })}

                        {/* Empty State Fallback */}
                        {publicRooms.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', padding: '20px', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                                Not enough data for trends yet.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Spacer for Floating Dock */}
            <div style={{ height: '200px', flexShrink: 0, width: '100%' }} />
        </div>
    );
};

export default HomeView;
