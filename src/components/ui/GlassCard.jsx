import React from 'react';

const GlassCard = ({
  children,
  className = '',
  variant = 'default', // default | glow | solid
  noPadding = false,
  style = {}, // Accept custom style
  ...props // Accept onClick and other props
}) => {

  const baseStyles = {
    backdropFilter: 'blur(40px)',
    WebkitBackdropFilter: 'blur(40px)',
    backgroundColor: variant === 'solid' ? 'rgba(20, 20, 30, 0.6)' : 'var(--glass-surface)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--glass-shadow)',
    position: 'relative',
    overflow: 'hidden',
  };

  const glowStyles = variant === 'glow' ? {
    boxShadow: '0 0 40px rgba(59, 130, 246, 0.15), inset 0 0 20px rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.2)'
  } : {};

  return (
    <div
      className={`${className}`}
      {...props} // Spread onClick, etc.
      style={{
        ...baseStyles,
        ...glowStyles,
        padding: noPadding ? '0' : '1.5rem',
        ...style, // Merge custom style LAST to allow overrides
      }}
    >
      {/* Noise Texture Overlay (Optional high-end touch) */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03, pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
      }} />

      {/* Inner Content - Z-index to sit above noise */}
      <div style={{ position: 'relative', zIndex: 2, height: '100%' }}>
        {children}
      </div>
    </div>
  );
};

export default GlassCard;
