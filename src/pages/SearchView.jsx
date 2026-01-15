import React from 'react';
import GlassCard from '../components/ui/GlassCard';
import { Search } from 'lucide-react';

const SearchView = () => {
    return (
        <div style={{ padding: 'var(--spacing-page)', height: '100%' }}>
            <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '24px' }}>Find Content</h1>

            <GlassCard className="flex items-center gap-3" style={{ padding: '12px 20px' }}>
                <Search color="var(--text-secondary)" />
                <input
                    type="text"
                    placeholder="Paste URL or search YouTube..."
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        fontSize: '1rem',
                        flex: 1,
                        outline: 'none'
                    }}
                    autoFocus
                />
            </GlassCard>

            <div style={{ marginTop: '32px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '16px' }}>Browse Services</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    {['YouTube', 'Netflix', 'Prime', 'Disney+'].map(name => (
                        <GlassCard key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', cursor: 'pointer' }}>
                            <span style={{ fontWeight: 'bold' }}>{name}</span>
                        </GlassCard>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SearchView;
