import React, { useEffect, useState } from 'react';
import GlassCard from './GlassCard';
import { Check, Info, AlertTriangle, X } from 'lucide-react';

const Toast = ({ message, type = 'success', isVisible, onClose }) => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (isVisible) {
            setShow(true);
            const timer = setTimeout(() => {
                setShow(false);
                setTimeout(onClose, 300); // Wait for exit animation
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);

    if (!isVisible && !show) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <Check size={20} color="#4ade80" />;
            case 'error': return <AlertTriangle size={20} color="#ef4444" />;
            default: return <Info size={20} color="#60a5fa" />;
        }
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: '100px', // Above text input
            left: '50%',
            transform: `translateX(-50%) translateY(${show ? '0' : '20px'})`,
            opacity: show ? 1 : 0,
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 2000,
            width: 'auto',
            minWidth: '200px',
            maxWidth: '90%'
        }}>
            <GlassCard variant="solid" style={{
                padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '12px',
                borderRadius: '50px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)'
            }}>
                {getIcon()}
                <span style={{ fontSize: '0.9rem', fontWeight: '500', color: 'white' }}>{message}</span>
            </GlassCard>
        </div>
    );
};

export default Toast;
