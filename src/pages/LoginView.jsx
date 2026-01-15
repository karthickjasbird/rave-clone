import React, { useState, useEffect } from 'react';
import GlassCard from '../components/ui/GlassCard';
import { Play, Mail, ArrowRight, Loader, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signInWithGoogle, auth, database } from '../firebase';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { ref, get, set, remove, update } from 'firebase/database';

const LoginView = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentLoginMethod, setCurrentLoginMethod] = useState(null);

    // Onboarding State
    const [showNameModal, setShowNameModal] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [savingName, setSavingName] = useState(false);
    const [pendingUser, setPendingUser] = useState(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isReturningUser, setIsReturningUser] = useState(false);

    // AUTH LISTENER & ONBOARDING CHECK
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // OPTIMIZATION: Redirect immediately to Home.
                // HomeView handles the profile check and onboarding modal.
                console.log("User authenticated, redirecting to home...");
                navigate('/home', { replace: true });
            }
        });
        return () => unsubscribe();
    }, [navigate]);

    const handleLogin = async (method) => {
        setLoading(true);
        setCurrentLoginMethod(method);
        setError(null);
        try {
            if (method === 'google') {
                await signInWithGoogle();
                // Listener will handle logic
            } else if (method === 'email') {
                console.log("Email login not impl yet");
                navigate('/home');
            }
        } catch (err) {
            console.error(err);
            setError("Error: " + (err.message || JSON.stringify(err)));
        } finally {
            setLoading(false);
            setCurrentLoginMethod(null);
        }
    };

    const handleSaveUsername = async () => {
        if (!newUsername.trim() || !pendingUser) return;
        setSavingName(true);
        try {
            // 1. Update Auth Profile
            await updateProfile(pendingUser, {
                displayName: newUsername.trim()
            });

            // 2. Create User Record in DB
            await set(ref(database, `users/${pendingUser.uid}`), {
                username: newUsername.trim(),
                email: pendingUser.email,
                photoURL: pendingUser.photoURL,
                joinedAt: Date.now()
            });

            // 3. Redirect
            navigate('/home', { replace: true });
        } catch (error) {
            console.error("Error saving profile:", error);
            setError("Failed to save username. Please try again.");
            setSavingName(false);
        }
    };

    const handleHardReset = async () => {
        if (!pendingUser) return;
        if (window.confirm("RESET PROFILE: This will delete your database record to simulate a NEW USER. Continue?")) {
            try {
                await remove(ref(database, `users/${pendingUser.uid}`));
                setIsReturningUser(false);
                setNewUsername(pendingUser.displayName || '');
                alert("Profile Cleared! You are now seeing the 'New User' flow.");
            } catch (e) {
                alert("Reset failed: " + e.message);
            }
        }
    };

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-page)',
            position: 'relative',
            zIndex: 10
        }}>

            {/* CHECKING STATE OVERLAY */}
            {isChecking && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 200,
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}>
                    <Loader className="animate-spin" size={48} color="var(--accent-primary)" />
                    <p style={{ marginTop: '16px', color: 'white', fontWeight: '600' }}>Checking Account...</p>
                </div>
            )}

            {/* ONBOARDING MODAL */}
            {showNameModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    backgroundColor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{ width: '90%', maxWidth: '320px' }}>
                        <GlassCard style={{ flexDirection: 'column', padding: '32px', alignItems: 'center', textAlign: 'center' }}>
                            <div style={{
                                width: 60, height: 60, borderRadius: '50%', background: 'var(--accent-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
                                boxShadow: '0 0 20px var(--accent-glow)'
                            }}>
                                <User size={32} color="white" />
                            </div>

                            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '8px' }}>
                                {isReturningUser ? 'Welcome Back!' : 'Welcome!'}
                            </h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px' }}>
                                {isReturningUser ? 'Confirm your username to join the party.' : 'Pick a username so friends can recognize you.'}
                            </p>

                            <input
                                autoFocus
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                placeholder="Your Username"
                                style={{
                                    width: '100%', padding: '16px', borderRadius: '12px',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(0,0,0,0.3)', color: 'white',
                                    fontSize: '1.1rem', marginBottom: '24px', outline: 'none',
                                    textAlign: 'center',
                                    boxSizing: 'border-box'
                                }}
                            />

                            <button
                                onClick={handleSaveUsername}
                                disabled={!newUsername.trim() || savingName}
                                style={{
                                    width: '100%', padding: '14px', borderRadius: '12px',
                                    background: 'white', color: 'black',
                                    fontWeight: 'bold', fontSize: '1rem', border: 'none',
                                    opacity: (!newUsername.trim() || savingName) ? 0.5 : 1,
                                    cursor: 'pointer',
                                    marginBottom: '16px',
                                    boxSizing: 'border-box'
                                }}>
                                {savingName ? 'Saving...' : (isReturningUser ? 'Continue' : "Let's Go")}
                            </button>

                            {/* HARD RESET BUTTON (TESTING ONLY) */}
                            {isReturningUser && (
                                <button
                                    onClick={handleHardReset}
                                    style={{
                                        background: 'none', border: 'none',
                                        color: '#ff6b6b', fontSize: '0.8rem',
                                        textDecoration: 'underline', cursor: 'pointer',
                                        opacity: 0.8
                                    }}
                                >
                                    Reset Profile (Test Only)
                                </button>
                            )}
                        </GlassCard>
                    </div>
                </div>
            )}

            {/* 1. Logo / Branding */}
            <div style={{
                marginBottom: '48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '24px'
            }}>
                <div style={{
                    width: 100, height: 100,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 60px var(--accent-glow)'
                }}>
                    <Play size={40} fill="white" color="white" style={{ marginLeft: '6px' }} />
                </div>
                <h1 className="text-gradient" style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-1px' }}>RaveClone</h1>
                <p style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '300px' }}>
                    Watch together. Connect anywhere.
                </p>
            </div>

            {/* Error Message */}
            {error && (
                <div style={{ color: '#ff6b6b', marginBottom: '16px', background: 'rgba(255,100,100,0.1)', padding: '8px 12px', borderRadius: '8px' }}>
                    {error}
                </div>
            )}

            {/* 2. Login Options */}
            <div style={{ width: '100%', maxWidth: '350px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Google Login */}
                <GlassCard
                    variant="solid"
                    onClick={() => handleLogin('google')}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                        padding: '16px', cursor: 'pointer',
                        background: 'white', color: 'black',
                        opacity: loading && currentLoginMethod !== 'google' ? 0.7 : 1 // Dim other buttons if one is loading
                    }}
                    disabled={loading} // Disable button while loading
                >
                    {loading && currentLoginMethod === 'google' ? <Loader className="animate-spin" size={20} color="black" /> : (
                        <>
                            <svg width="20" height="20" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            <span style={{ fontWeight: '600' }}>Continue with Google</span>
                        </>
                    )}
                </GlassCard>

                {/* Email Login */}
                <GlassCard
                    onClick={() => handleLogin('email')}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                        padding: '16px', cursor: 'pointer'
                    }}
                >
                    <Mail size={20} />
                    <span style={{ fontWeight: '600' }}>Continue with Email</span>
                </GlassCard>

            </div>


        </div>
    );
};

export default LoginView;
