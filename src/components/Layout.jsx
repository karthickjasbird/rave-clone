import React from 'react';

const Layout = ({ children }) => {
    return (
        <div style={{
            position: 'relative',
            width: '100vw',
            height: '100vh',
            background: 'var(--bg-deep)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
        }}>
            {/* Ambient Orbs */}
            <div style={{
                position: 'absolute',
                top: '10%',
                left: '20%',
                width: '40vw',
                height: '40vw',
                background: 'radial-gradient(circle, #4F46E5 0%, transparent 60%)',
                opacity: 0.2,
                filter: 'blur(120px)',
                zIndex: 0
            }} />

            <div style={{
                position: 'absolute',
                bottom: '10%',
                right: '20%',
                width: '35vw',
                height: '35vw',
                background: 'radial-gradient(circle, #C026D3 0%, transparent 60%)',
                opacity: 0.15,
                filter: 'blur(100px)',
                zIndex: 0
            }} />

            {/* Main App Shell / Container */}
            <div style={{
                position: 'relative',
                zIndex: 1,
                width: '100%',
                maxWidth: '1600px', // Restrict max width for ultrawide monitors
                height: '100%',
                maxHeight: '1000px', // On huge screens, don't stretch forever like an app
                display: 'flex',
                flexDirection: 'column'
            }}>
                {children}
            </div>
        </div>
    );
};

export default Layout;
