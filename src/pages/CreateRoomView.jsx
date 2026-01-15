import React, { useState, useEffect } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, ChevronDown, Globe, Lock, Copy, X } from 'lucide-react';
import { database, auth } from '../firebase';
import { ref, push, set, serverTimestamp } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';

const CreateRoomView = () => {
    const navigate = useNavigate();

    // State
    const [roomId, setRoomId] = useState('');
    const [roomName, setRoomName] = useState('');
    const [selectedService, setSelectedService] = useState(null);
    const [isPublic, setIsPublic] = useState(true);
    const [showPlatformMenu, setShowPlatformMenu] = useState(false);
    const [loading, setLoading] = useState(false);

    const services = [
        { id: 'youtube', name: 'YouTube', color: '#FF0000', icon: Play },
        { id: 'netflix', name: 'Netflix', color: '#E50914', icon: Play, disabled: true },
        { id: 'prime', name: 'Prime', color: '#00A8E1', icon: Play, disabled: true },
        { id: 'disney', name: 'Disney+', color: '#113CCF', icon: Play, disabled: true },
    ];

    const [user, setUser] = useState(null);

    // Generate Room ID and Check Auth
    useEffect(() => {
        const roomsRef = ref(database, 'rooms');
        const newRef = push(roomsRef); // Generate key immediately
        if (newRef.key) setRoomId(newRef.key);

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                // If no user, technically they shouldn't be here, but just in case
                setUser(null);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleCreateRoom = async () => {
        if (!selectedService || !roomId || !roomName.trim()) return;
        setLoading(true);

        try {
            if (!user) {
                alert("You must be logged in to create a room.");
                setLoading(false);
                return;
            }

            // we already have the ID, just write to it
            const newRoomRef = ref(database, `rooms/${roomId}`);
            await set(newRoomRef, {
                service: selectedService.id,
                name: roomName.trim(),
                isPublic: isPublic,
                videoUrl: '',
                status: 'playing',
                currentTime: 0,
                createdAt: serverTimestamp(),
                hostId: user.uid
            });

            navigate(`/room/${roomId}`);
        } catch (error) {
            console.error("Error creating room:", error);
            alert(`Failed to create room: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(roomId);
        // Could show toast here
    };

    const isReady = selectedService && roomName.trim() && user;

    return (
        <div style={{
            padding: 'var(--spacing-page)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            paddingBottom: '120px',
            overflowY: 'auto',
            position: 'relative' // For modal
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px', flexShrink: 0 }}>
                <button
                    onClick={() => navigate(-1)}
                    style={{ background: 'none', border: 'none', color: 'white', padding: 0, cursor: 'pointer' }}
                >
                    <ArrowLeft size={28} />
                </button>
                <h1 style={{ fontSize: '1.8rem', fontWeight: '800', margin: 0 }}>Host a Rave</h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>

                {/* 1. Platform Selection (Pill) */}
                <div>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px', display: 'block' }}>Select Platform</label>
                    <button
                        onClick={() => setShowPlatformMenu(true)}
                        style={{
                            width: '100%',
                            height: '64px',
                            borderRadius: '100px',
                            background: selectedService ? 'rgba(255,255,255,0.1)' : 'var(--glass-surface)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0 20px',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            {selectedService ? (
                                <>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: selectedService.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <selectedService.icon fill="white" stroke="none" size={16} />
                                    </div>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>{selectedService.name}</span>
                                </>
                            ) : (
                                <span style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.5)' }}>Choose a service...</span>
                            )}
                        </div>
                        <ChevronDown color="rgba(255,255,255,0.5)" />
                    </button>
                </div>

                {/* 2. Room Name */}
                <div>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px', display: 'block' }}>Room Name</label>
                    <GlassCard noPadding style={{ borderRadius: '16px', height: '56px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 16px' }}>
                            <input
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                placeholder="Enter room name..."
                                style={{
                                    background: 'none', border: 'none', color: 'white',
                                    width: '100%', fontSize: '1rem', outline: 'none'
                                }}
                            />
                        </div>
                    </GlassCard>
                </div>

                {/* 3. Privacy Toggle */}
                <div>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px', display: 'block' }}>Privacy</label>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={() => setIsPublic(true)}
                            style={{
                                flex: 1, padding: '16px', borderRadius: '16px',
                                border: isPublic ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                                background: isPublic ? 'rgba(255,255,255,0.08)' : 'var(--glass-surface)',
                                color: isPublic ? 'white' : 'var(--text-secondary)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            <Globe size={24} />
                            <span style={{ fontWeight: '600' }}>Public</span>
                        </button>
                        <button
                            onClick={() => setIsPublic(false)}
                            style={{
                                flex: 1, padding: '16px', borderRadius: '16px',
                                border: !isPublic ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                                background: !isPublic ? 'rgba(255,255,255,0.08)' : 'var(--glass-surface)',
                                color: !isPublic ? 'white' : 'var(--text-secondary)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            <Lock size={24} />
                            <span style={{ fontWeight: '600' }}>Private</span>
                        </button>
                    </div>
                </div>

                {/* 4. Share Code */}
                <div>
                    <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px', display: 'block' }}>Shareable Code</label>
                    <div
                        onClick={copyCode}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px dashed rgba(255,255,255,0.2)',
                            borderRadius: '12px', padding: '16px',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            cursor: 'pointer'
                        }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', color: 'var(--accent-primary)', letterSpacing: '2px' }}>
                            {roomId || 'Generating...'}
                        </span>
                        <Copy size={18} color="rgba(255,255,255,0.5)" />
                    </div>
                </div>

                {/* Create Button */}
                <div>
                    <button
                        onClick={handleCreateRoom}
                        disabled={!isReady}
                        style={{
                            width: '100%',
                            padding: '16px',
                            borderRadius: '16px',
                            border: 'none',
                            background: isReady ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                            color: isReady ? 'white' : 'rgba(255,255,255,0.3)',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            cursor: isReady ? 'pointer' : 'not-allowed',
                            transition: 'all 0.3s ease',
                            boxShadow: isReady ? '0 0 20px var(--accent-glow)' : 'none'
                        }}
                    >
                        {loading ? 'Creating...' : 'Create Room'}
                    </button>
                </div>
            </div>

            {/* Platform Selection Modal */}
            {showPlatformMenu && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                }} onClick={() => setShowPlatformMenu(false)}>

                    <div
                        onClick={e => e.stopPropagation()} // Prevent close on content click
                        style={{
                            width: '90%', maxWidth: '400px', background: 'var(--bg-deep)',
                            borderRadius: '24px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            padding: '24px',
                            animation: 'scaleUp 0.3s ease',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Select Platform</h3>
                            <button onClick={() => setShowPlatformMenu(false)} style={{ background: 'none', border: 'none', color: 'white' }}>
                                <X />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                            {services.map(s => (
                                <button
                                    key={s.id}
                                    disabled={s.disabled}
                                    onClick={() => { setSelectedService(s); setShowPlatformMenu(false); }}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
                                        padding: '24px',
                                        borderRadius: '20px',
                                        background: 'var(--glass-surface)',
                                        border: selectedService?.id === s.id ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.05)',
                                        opacity: s.disabled ? 0.4 : 1
                                    }}
                                >
                                    <div style={{
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        background: s.color, boxShadow: `0 0 20px ${s.color}44`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <s.icon fill="white" stroke="none" size={24} />
                                    </div>
                                    <span style={{ color: 'white', fontWeight: 'bold' }}>{s.name}</span>
                                </button>
                            ))}
                        </div>
                        <style>{`
                            @keyframes scaleUp {
                                from { transform: scale(0.9); opacity: 0; }
                                to { transform: scale(1); opacity: 1; }
                            }
                        `}</style>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CreateRoomView;
