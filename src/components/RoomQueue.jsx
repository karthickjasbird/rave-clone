import React, { useState, useEffect } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { Search, Plus, Trash2, Play } from 'lucide-react';
import { ref, push, remove } from 'firebase/database';
import { database } from '../firebase';
import { searchVideos } from '../services/youtubeService';

const RoomQueue = ({ roomId, queue, isHost, onPlay }) => {
    const [searchMode, setSearchMode] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setLoading(true);
        try {
            const data = await searchVideos(query);
            setResults(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const addToQueue = async (video) => {
        const queueRef = ref(database, `rooms/${roomId}/queue`);
        await push(queueRef, {
            videoUrl: `https://www.youtube.com/watch?v=${video.id}`,
            title: video.title,
            addedBy: 'Guest',
            thumb: video.thumb
        });
        setSearchMode(false);
        setQuery('');
        setResults([]);
    };

    const removeFromQueue = async (key) => {
        const itemRef = ref(database, `rooms/${roomId}/queue/${key}`);
        await remove(itemRef);
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Toggle Search */}
            <div style={{ padding: '16px' }}>
                {!searchMode ? (
                    <button
                        onClick={() => setSearchMode(true)}
                        style={{
                            width: '100%', padding: '12px', borderRadius: '12px',
                            background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}>
                        <Search size={18} /> Add Video
                    </button>
                ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{
                            flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: '12px',
                            display: 'flex', alignItems: 'center', padding: '0 12px'
                        }}>
                            <Search size={16} color="gray" />
                            <input
                                autoFocus
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="Search YouTube..."
                                style={{
                                    background: 'none', border: 'none', color: 'white',
                                    padding: '12px', flex: 1, outline: 'none'
                                }}
                            />
                        </div>
                        <button onClick={() => setSearchMode(false)} style={{ background: 'none', border: 'none', color: 'white' }}>Cancel</button>
                    </div>
                )}
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 100px' }}>
                {searchMode ? (
                    // Search Results
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {loading && <div style={{ textAlign: 'center', padding: 20 }}>Searching...</div>}
                        {results.map(vid => (
                            <GlassCard key={vid.id} noPadding style={{ display: 'flex', gap: '12px', padding: '8px', alignItems: 'center' }}>
                                <img src={vid.thumb} style={{ width: 80, height: 45, borderRadius: 6, objectFit: 'cover' }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{vid.title}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'gray' }}>{vid.channel}</div>
                                </div>
                                <button
                                    onClick={() => addToQueue(vid)}
                                    style={{
                                        padding: '8px', background: 'var(--accent-primary)',
                                        border: 'none', borderRadius: '50%', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                    <Plus size={16} />
                                </button>
                            </GlassCard>
                        ))}
                    </div>
                ) : (
                    // Queue List
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {(!queue || Object.keys(queue).length === 0) && (
                            <div style={{ textAlign: 'center', color: 'gray', marginTop: 40 }}>
                                Queue is empty. Add a video!
                            </div>
                        )}
                        {queue && Object.entries(queue).map(([key, item]) => (
                            <GlassCard key={key} noPadding style={{ display: 'flex', gap: '12px', padding: '8px', alignItems: 'center' }}>
                                {/* Thumbnail (Placeholder if plain URL) */}
                                <div style={{ width: 80, height: 45, background: '#333', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                    {item.thumb ? <img src={item.thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Play size={20} color="white" />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {item.title || item.videoUrl}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'gray' }}>Added by {item.addedBy}</div>
                                </div>

                                {/* Buttons Container */}
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    {/* Play Queue Item Button */}
                                    {isHost && (
                                        <button
                                            onClick={() => onPlay && onPlay(item)}
                                            style={{
                                                width: 44, height: 44,
                                                background: 'var(--accent-primary)',
                                                border: 'none', borderRadius: '50%', color: 'white',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                                            }}>
                                            <Play size={20} fill="white" />
                                        </button>
                                    )}

                                    {isHost && (
                                        <button
                                            onClick={() => removeFromQueue(key)}
                                            style={{
                                                width: 44, height: 44,
                                                background: 'rgba(255, 59, 48, 0.15)',
                                                border: '1px solid rgba(255, 59, 48, 0.3)',
                                                borderRadius: '50%', color: '#FF3B30',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}>
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoomQueue;
