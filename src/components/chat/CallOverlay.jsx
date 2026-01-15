import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Camera, Maximize2, Minimize2 } from 'lucide-react';
import GlassCard from '../ui/GlassCard';

const CallOverlay = ({
    isVisible,
    status = 'idle', // idle, incoming, outgoing, connected
    type = 'voice', // voice, video
    friend, // { username, photoURL, ... }
    localStream, // MediaStream
    remoteStream, // MediaStream
    onAccept,
    onDecline,
    onEnd,
    onToggleMic,
    onToggleCamera
}) => {
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(false);
    const [duration, setDuration] = useState(0);

    // Refs for stable stream attachment
    const remoteVideoRef = React.useRef(null);
    const localVideoRef = React.useRef(null);
    const voiceAudioRef = React.useRef(null);

    // Attach Streams (Only when stream changes, not on every render)
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, status, type]);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream, status, type]);

    useEffect(() => {
        if (voiceAudioRef.current && remoteStream) {
            voiceAudioRef.current.srcObject = remoteStream;
        }
    }, [remoteStream, status, type]);

    // Reset timer on new call
    useEffect(() => {
        if (status === 'connected') {
            const timer = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
            return () => clearInterval(timer);
        } else {
            setDuration(0);
        }
    }, [status]);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Internal toggles that notify parent
    const handleToggleMic = () => {
        setIsMuted(!isMuted);
        onToggleMic && onToggleMic(!isMuted);
    };

    const handleToggleCamera = () => {
        setIsCameraOff(!isCameraOff);
        onToggleCamera && onToggleCamera(!isCameraOff);
    };

    if (!isVisible || status === 'idle') return null;

    // --- RENDER HELPERS ---

    const renderAvatar = (size = 120) => (
        <div style={{
            position: 'relative',
            width: size, height: size,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '4px solid rgba(255,255,255,0.2)',
            boxShadow: '0 0 30px rgba(0,0,0,0.5)'
        }}>
            {friend?.photoURL ? (
                <img src={friend.photoURL} alt={friend.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <div style={{ width: '100%', height: '100%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4 }}>
                    👤
                </div>
            )}
        </div>
    );

    const renderControls = () => (
        <div style={{
            display: 'flex', gap: '24px',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(20px)',
            padding: '20px 40px', borderRadius: '40px',
            marginBottom: '40px'
        }}>
            {/* Mute */}
            <button onClick={handleToggleMic} style={controlBtnStyle(isMuted)}>
                {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
            </button>

            {/* End Call (Always Red) */}
            <button onClick={onEnd} style={{ ...controlBtnStyle(false), background: '#ff3b30' }}>
                <PhoneOff size={32} />
            </button>

            {/* Camera (Only if Video) */}
            {type === 'video' && (
                <button onClick={handleToggleCamera} style={controlBtnStyle(isCameraOff)}>
                    {isCameraOff ? <VideoOff size={28} /> : <Video size={28} />}
                </button>
            )}
        </div>
    );

    // --- STATES ---

    // 1. INCOMING CALL
    if (status === 'incoming') {
        return (
            <div style={overlayStyle}>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    {renderAvatar(150)}
                    <h2 style={{ fontSize: '2rem', marginTop: '24px', marginBottom: '8px' }}>{friend?.username}</h2>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem' }}>Incoming {type} call...</p>
                </div>

                <div style={{ display: 'flex', gap: '40px' }}>
                    <button onClick={onDecline} style={{ ...actionBtnStyle, background: '#ff3b30' }}>
                        <PhoneOff size={32} />
                        <span style={{ fontSize: '0.9rem', marginTop: '8px' }}>Decline</span>
                    </button>
                    <button onClick={onAccept} style={{ ...actionBtnStyle, background: '#4ade80' }}>
                        <Phone size={32} />
                        <span style={{ fontSize: '0.9rem', marginTop: '8px' }}>Accept</span>
                    </button>
                </div>
            </div>
        );
    }

    // 2. OUTGOING CALL
    if (status === 'outgoing') {
        return (
            <div style={overlayStyle}>
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="pulse-ring">
                        {renderAvatar(150)}
                    </div>
                    <h2 style={{ fontSize: '2rem', marginTop: '40px' }}>{friend?.username}</h2>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.2rem' }}>Calling...</p>
                </div>

                <div style={{ position: 'absolute', bottom: '60px' }}>
                    <button onClick={onEnd} style={{ ...controlBtnStyle(false), background: '#ff3b30', width: '72px', height: '72px' }}>
                        <PhoneOff size={32} />
                    </button>
                </div>
                <style>{`
                    .pulse-ring { animation: pulse 2s infinite; borderRadius: 50%; }
                    @keyframes pulse {
                        0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4); }
                        70% { box-shadow: 0 0 0 30px rgba(255, 255, 255, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
                    }
                `}</style>
            </div>
        );
    }

    // 3. CONNECTED (VOICE)
    if (status === 'connected' && type === 'voice') {
        return (
            <div style={overlayStyle}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    {renderAvatar(180)}
                    <h2 style={{ fontSize: '2rem', marginTop: '32px' }}>{friend?.username}</h2>
                    <p style={{ color: '#4ade80', fontSize: '1.5rem', fontFamily: 'monospace' }}>{formatDuration(duration)}</p>
                    {/* Audio Player for Voice Call */}
                    <audio
                        ref={voiceAudioRef}
                        autoPlay
                        playsInline
                    />
                </div>
                {renderControls()}
            </div>
        );
    }

    // 4. CONNECTED (VIDEO)
    if (status === 'connected' && type === 'video') {
        return (
            <div style={{ ...overlayStyle, background: 'black', padding: 0 }}>
                {/* REMOTE VIDEO (Background) */}
                <video
                    ref={remoteVideoRef}
                    autoPlay playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />

                {/* Call Timer (Video Overlay) */}
                <div style={{
                    position: 'absolute', top: '50px', left: 0, right: 0,
                    textAlign: 'center', zIndex: 10
                }}>
                    <div style={{
                        display: 'inline-block',
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                        padding: '8px 16px', borderRadius: '20px',
                        color: '#4ade80', fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 'bold'
                    }}>
                        {formatDuration(duration)}
                    </div>
                </div>

                {/* LOCAL VIDEO (PiP) */}
                <div style={{
                    position: 'absolute', top: '100px', right: '20px',
                    width: '100px', height: '150px',
                    borderRadius: '16px', overflow: 'hidden',
                    border: '2px solid rgba(255,255,255,0.3)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    background: '#1a1a1a'
                }}>
                    <video
                        ref={localVideoRef}
                        autoPlay playsInline muted // Muted so we don't hear ourselves
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}  // Mirror local video
                    />
                </div>

                <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
                    {renderControls()}
                </div>
            </div>
        );
    }

    return null;
};

// --- STYLES ---

const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(10, 10, 20, 0.95)',
    backdropFilter: 'blur(20px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: 'white'
};

const controlBtnStyle = (active) => ({
    width: '60px', height: '60px', borderRadius: '50%',
    border: 'none', cursor: 'pointer',
    background: active ? 'white' : 'rgba(255,255,255,0.2)',
    color: active ? 'black' : 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s ease'
});

const actionBtnStyle = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    width: '80px', height: '80px', borderRadius: '50%',
    border: 'none', cursor: 'pointer',
    color: 'white', justifyContent: 'center',
    boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
};

export default CallOverlay;
