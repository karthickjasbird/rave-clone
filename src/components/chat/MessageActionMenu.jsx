import React, { useRef, useEffect, useState } from 'react';
import GlassCard from '../ui/GlassCard';
import { Copy, Download, Trash2, X } from 'lucide-react';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

const MessageActionMenu = ({ message, onClose, onReact, onAction, isMe }) => {
    const menuRef = useRef(null);
    const [showConfirm, setShowConfirm] = useState(false);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (!message) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={onClose}>
            <div
                ref={menuRef}
                onClick={(e) => e.stopPropagation()}
                style={{ width: '90%', maxWidth: '320px', animation: 'scaleUp 0.2s ease' }}
            >
                <GlassCard variant="glow" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>


                    {showConfirm ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', animation: 'fadeIn 0.2s' }}>
                            <div style={{ color: 'white', textAlign: 'center', fontWeight: '500' }}>
                                Delete this message?
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    style={{ ...buttonStyle, justifyContent: 'center', background: 'rgba(255,255,255,0.1)' }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => { onAction('delete'); onClose(); }}
                                    style={{ ...buttonStyle, justifyContent: 'center', background: '#ef4444' }}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Reactions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                {REACTIONS.map(emoji => (
                                    <button
                                        key={emoji}
                                        onClick={() => { onReact(emoji); onClose(); }}
                                        style={{
                                            background: 'rgba(255,255,255,0.1)',
                                            border: 'none', borderRadius: '50%',
                                            width: '36px', height: '36px',
                                            fontSize: '1.2rem',
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'transform 0.1s'
                                        }}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>

                            <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {message.type === 'image' && (
                                    isMe ? (
                                        <button
                                            onClick={() => setShowConfirm(true)}
                                            style={{ ...buttonStyle, color: '#ef4444' }}
                                        >
                                            <Trash2 size={18} /> Delete Image
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { onAction('save'); onClose(); }}
                                            style={buttonStyle}
                                        >
                                            <Download size={18} /> Save Image
                                        </button>
                                    )
                                )}

                                {message.text && (
                                    <button
                                        onClick={() => { onAction('copy'); onClose(); }}
                                        style={buttonStyle}
                                    >
                                        <Copy size={18} /> Copy Text
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </GlassCard>
                <style>{`
                    @keyframes scaleUp {
                        from { opacity: 0; transform: scale(0.9); }
                        to { opacity: 1; transform: scale(1); }
                    }
                `}</style>
            </div>
        </div>
    );
};

const buttonStyle = {
    background: 'none', border: 'none',
    color: 'white',
    padding: '12px',
    borderRadius: '12px',
    display: 'flex', alignItems: 'center', gap: '12px',
    fontSize: '1rem',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.2s',
    ':hover': { background: 'rgba(255,255,255,0.05)' }
};

export default MessageActionMenu;
