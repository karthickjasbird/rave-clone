import { Phone, PhoneOff, Video } from 'lucide-react';
import GlassCard from './ui/GlassCard';

/*
  Props: 
  - callData: { callerName, callerPhoto, callType, roomId }
  - onAccept: () => void
  - onDecline: () => void
*/
const IncomingCallOverlay = ({ callData, onAccept, onDecline }) => {
    if (!callData) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
            <GlassCard style={{
                padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px',
                width: '90%', maxWidth: '360px', border: '1px solid rgba(255,255,255,0.1)'
            }}>

                {/* Caller Info */}
                <div style={{ textAlign: 'center' }}>
                    <div className="avatar-pulse" style={{ position: 'relative', marginBottom: '24px', display: 'inline-block' }}>
                        <img
                            src={callData.callerPhoto || `https://ui-avatars.com/api/?name=${callData.callerName}&background=random`}
                            alt={callData.callerName}
                            style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid rgba(255,255,255,0.2)' }}
                        />
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{callData.callerName}</h2>
                    <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {callData.callType === 'video' ? <Video size={16} /> : <Phone size={16} />}
                        Incoming {callData.callType} call...
                    </p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '48px', alignItems: 'center' }}>

                    {/* Decline */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <button onClick={onDecline} style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: '#ef4444', border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
                        }}>
                            <PhoneOff size={32} color="white" />
                        </button>
                        <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Decline</span>
                    </div>

                    {/* Accept */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <button onClick={onAccept} style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: '#22c55e', border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)'
                        }}>
                            <Phone size={32} color="white" />
                        </button>
                        <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>Accept</span>
                    </div>

                </div>

            </GlassCard>
            <style>{`
                @keyframes pulse-ring {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.3); }
                    70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(255, 255, 255, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
                }
                .avatar-pulse {
                    animation: pulse-ring 2s infinite;
                }
            `}</style>
        </div>
    );
};

export default IncomingCallOverlay;
