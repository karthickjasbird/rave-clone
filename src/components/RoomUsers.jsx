import React from 'react';
import GlassCard from '../components/ui/GlassCard';
import { Mic, MicOff, User, MoreVertical, XCircle } from 'lucide-react';
import { ref, update, remove } from 'firebase/database';
import { database } from '../firebase';

const RoomUsers = ({ roomId, users, currentUser, isHost }) => {

    const toggleMuteUser = async (uid, currentMuteState) => {
        if (!isHost) return;
        const userRef = ref(database, `rooms/${roomId}/users/${uid}`);
        await update(userRef, { isMuted: !currentMuteState });
    };

    const handleKick = async (uid, name) => {
        if (!isHost) return;
        if (window.confirm(`Are you sure you want to kick ${name}?`)) {
            try {
                // 1. Remove from users list
                await remove(ref(database, `rooms/${roomId}/users/${uid}`));
                // 2. Mark as kicked so they get the popup
                await update(ref(database, `rooms/${roomId}/kicked`), { [uid]: true });
            } catch (err) {
                console.error("Kick error:", err);
            }
        }
    };

    const userList = users ? Object.entries(users) : [];

    return (
        <div style={{ height: '100%', overflowY: 'auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Online ({userList.length})
            </h3>

            {userList.map(([uid, user]) => {
                const isMe = uid === currentUser?.uid;

                return (
                    <GlassCard key={uid} noPadding style={{
                        padding: '12px 16px', borderRadius: '16px', flexShrink: 0,
                        border: isMe ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)'
                    }}>
                        {/* Wrapper for Horizontal Layout */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                            {/* Avatar */}
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                {user.photoURL ? (
                                    <img src={user.photoURL} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <User size={22} />
                                    </div>
                                )}
                                {user.isSpeaking && (
                                    <div style={{
                                        position: 'absolute', bottom: -2, right: -2, width: 14, height: 14,
                                        background: '#4ade80', borderRadius: '50%', border: '2px solid black'
                                    }} />
                                )}
                            </div>

                            {/* Info & Controls (Horizontal) */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minWidth: 0 }}>
                                {/* Name */}
                                <div style={{
                                    fontWeight: '600', fontSize: '1rem', color: 'white',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    display: 'flex', alignItems: 'center', gap: '8px'
                                }}>
                                    {user.displayName || 'Guest'}
                                    {isMe && (
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 'bold',
                                            color: 'white', background: 'var(--accent-primary)',
                                            borderRadius: '100px', padding: '1px 6px',
                                            flexShrink: 0
                                        }}>
                                            YOU
                                        </span>
                                    )}
                                </div>

                                {/* Controls Group */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                    {/* Mic Status */}
                                    <div style={{
                                        color: user.isMuted ? '#ef4444' : '#4ade80',
                                        fontSize: '0.75rem', fontWeight: 'bold',
                                        background: 'rgba(255,255,255,0.05)',
                                        padding: '4px 8px', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center', gap: '4px'
                                    }}>
                                        {user.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                                        {user.isMuted ? 'Muted' : 'Speaking'}
                                    </div>

                                    {/* Host Actions */}
                                    {isHost && !isMe && (
                                        <>
                                            <button
                                                onClick={() => toggleMuteUser(uid, user.isMuted)}
                                                style={{
                                                    background: 'rgba(255,255,255,0.1)',
                                                    border: 'none', padding: '8px', borderRadius: '8px',
                                                    color: 'white', cursor: 'pointer', display: 'flex'
                                                }}>
                                                {user.isMuted ? <Mic size={16} /> : <MicOff size={16} />}
                                            </button>
                                            <button
                                                onClick={() => handleKick(uid, user.displayName)}
                                                style={{
                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    padding: '8px', borderRadius: '8px',
                                                    color: '#ef4444', cursor: 'pointer', display: 'flex'
                                                }}>
                                                <XCircle size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                );
            })}

            {/* Spacer for Dock */}
            <div style={{ height: 160, flexShrink: 0 }} />
        </div>
    );
};

export default RoomUsers;
