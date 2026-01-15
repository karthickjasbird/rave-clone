import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Phone, Video } from 'lucide-react';
import GlassCard from '../components/ui/GlassCard';
import { auth, database } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, push, onValue, serverTimestamp, query, orderByChild, set, get, remove, update, increment } from 'firebase/database';
import { storage } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Plus, X } from 'lucide-react';
import { Camera, CameraResultType } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { CapacitorHttp } from '@capacitor/core';
import MessageActionMenu from '../components/chat/MessageActionMenu';
import Toast from '../components/ui/Toast';
import CallOverlay from '../components/chat/CallOverlay';
import SimplePeer from 'simple-peer';

const ChatView = () => {
    const { id: friendUid } = useParams(); // The URL param is the Friend's UID
    const navigate = useNavigate();
    const location = useLocation();
    const scrollRef = useRef(null);

    const [user, setUser] = useState(null);
    const [friend, setFriend] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [chatId, setChatId] = useState(null);
    const [friendStatus, setFriendStatus] = useState('offline');
    const [isUploading, setIsUploading] = useState(false);

    // Call State
    const [callStatus, setCallStatus] = useState('idle'); // idle, incoming, outgoing, connected
    const [callType, setCallType] = useState('voice');
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [callerSignal, setCallerSignal] = useState(null);
    const connectionRef = useRef(null);
    const answerListenerRef = useRef(null);

    // Actions State
    const [selectedMessage, setSelectedMessage] = useState(null);
    const longPressTimer = useRef(null);
    const [toast, setToast] = useState({ message: '', type: 'success', visible: false });

    const showToast = (message, type = 'success') => {
        setToast({ message, type, visible: true });
    };

    const hideToast = () => {
        setToast(prev => ({ ...prev, visible: false }));
    };

    // Listen for Friend Status
    useEffect(() => {
        if (friendUid) {
            const statusRef = ref(database, `status/${friendUid}`);
            const unsubscribe = onValue(statusRef, (snapshot) => {
                const val = snapshot.val();
                setFriendStatus(val?.state || 'offline');
            });
            return () => unsubscribe();
        }
    }, [friendUid]);

    // 1. Auth & Chat Initialization
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser) {
                navigate('/');
                return;
            }
            setUser(currentUser);

            // Generate consistent Chat ID
            // Sort UIDs to ensure A->B and B->A open the same room
            const participants = [currentUser.uid, friendUid].sort();
            const generatedChatId = participants.join('_');
            setChatId(generatedChatId);

            // Fetch Friend Details (Name/Photo)
            // We try 'friends' first, then fallback to 'users' if needed
            const friendRef = ref(database, `friends/${currentUser.uid}/${friendUid}`);
            get(friendRef).then((snapshot) => {
                if (snapshot.exists()) {
                    setFriend(snapshot.val());
                } else {
                    // Fallback to fetching public user profile if not in friends list (optional)
                    get(ref(database, `users/${friendUid}`)).then(userSnap => {
                        if (userSnap.exists()) {
                            setFriend(userSnap.val());
                        }
                    });
                }
            });
        });
        return () => unsubscribeAuth();
    }, [friendUid, navigate]);

    // 2. Listen for Messages
    useEffect(() => {
        if (!chatId) return;

        const messagesRef = ref(database, `messages/${chatId}`);
        // Simple query: get all (or limit if needed)
        // For a production app, you'd want limitToLast(50)
        const unsubscribe = onValue(messagesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                // Convert object to array and sort by timestamp
                const loadedMessages = Object.entries(data).map(([key, msg]) => ({
                    id: key,
                    ...msg
                })).sort((a, b) => a.timestamp - b.timestamp);
                setMessages(loadedMessages);
            } else {
                setMessages([]);
            }
        });

        return () => unsubscribe();
    }, [chatId]);

    // 3. Auto-scroll to bottom on new message
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // 4. Mark Read (Clear Unread Count)
    useEffect(() => {
        if (!user || !friendUid) return;

        // Reset MY unread count for THIS friend to 0
        const resetUnread = async () => {
            const myFriendRef = ref(database, `friends/${user.uid}/${friendUid}`);
            await update(myFriendRef, { unreadCount: 0 });
        };
        resetUnread();

        // Also listen for new messages to keep clearing it while open? 
        // Or just clear on mount/focus. For now, clear on mount/id change is good.
    }, [user, friendUid]);

    // 5. Listen for Incoming Calls
    useEffect(() => {
        if (!user) return;

        // Listen to `calls/{myUid}` to see if anyone is calling ME
        const callRef = ref(database, `calls/${user.uid}`);
        const unsubscribe = onValue(callRef, (snapshot) => {
            const data = snapshot.val();
            // Expected data format: { from: 'callerUid', signal: {...}, type: 'voice'|'video' }
            if (data && data.signal && !connectionRef.current) {
                // If we are already in a call (!connectionRef.current), ignore? Or show busy? 
                // For simplified logic, if we are idle, show incoming.
                if (callStatus === 'idle') {
                    try {
                        const signalData = typeof data.signal === 'string' ? JSON.parse(data.signal) : data.signal;
                        setCallerSignal(signalData);
                        setCallType(data.type || 'voice');
                        if (data.from === friendUid) {
                            setCallStatus('incoming');
                        }
                    } catch (e) {
                        console.error("Incoming Signal Parse Error", e);
                    }
                }
            } else if (!data) {
                // Call cancelled or ended remotely
                if (callStatus === 'incoming') {
                    setCallStatus('idle');
                    setCallerSignal(null);
                }
            }
        });

        return () => unsubscribe();
    }, [user, friendUid, callStatus]);

    // 6. Auto-Answer Logic (Bridging Global Notification to Local Call)
    useEffect(() => {
        if (callStatus === 'incoming' && location.state?.autoAnswer) {
            console.log("Auto-answering call via Global Notification...");
            // Slight delay to ensure Peer/State is ready (optional but safer)
            const timer = setTimeout(() => {
                answerCall();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [callStatus, location.state]);

    // --- CALL FUNCTIONS ---

    const startCall = (type) => {
        setCallStatus('outgoing');
        setCallType(type);

        navigator.mediaDevices.getUserMedia({ video: type === 'video', audio: true }).then((stream) => {
            setLocalStream(stream);

            // Create Peer (Initiator)
            const peer = new SimplePeer({
                initiator: true,
                trickle: false,
                stream: stream
            });

            peer.on('signal', (data) => {
                // Send signal to Friend
                const callRef = ref(database, `calls/${friendUid}`);
                set(callRef, {
                    from: user.uid,
                    signal: JSON.stringify(data), // Stringify for safety
                    type: type
                });

                // --- NEW: Trigger Global Notification ---
                const notificationRef = ref(database, `users/${friendUid}/incoming_call`);
                set(notificationRef, {
                    callerId: user.uid,
                    callerName: user.displayName || 'Unknown',
                    callerPhoto: user.photoURL || '',
                    callType: type,
                    roomId: chatId, // Although we navigate to /chat/:id, passing roomId is good context
                    timestamp: Date.now()
                });
            });

            peer.on('stream', (remoteStream) => {
                setRemoteStream(remoteStream);
            });

            peer.on('close', () => {
                endCall();
            });

            peer.on('error', (err) => {
                console.error("Peer connection error:", err);
                endCall();
            });

            // Listen for Answer
            // P2P Handshake: Caller listens for ANSWER at `calls/${myUid}`
            // Receiver writes to `calls/${callerUid}` (which is `calls/${myUid}`)
            const myCallRef = ref(database, `calls/${user.uid}`);
            onValue(myCallRef, (snapshot) => {
                const data = snapshot.val();
                if (data && data.answer) {
                    console.log("Receiver Answered!", data.answer);
                    // showToast("Answer Received!", "success"); // Debug Toast
                    try {
                        const signalData = JSON.parse(data.answer);
                        peer.signal(signalData);
                        setCallStatus('connected');
                    } catch (e) {
                        console.error("Signal Parse Error", e);
                    }
                }
            });

            connectionRef.current = peer;
        }).catch(err => {
            console.error("Media Error:", err);
            showToast(`Camera Error: ${err.name} - ${err.message}`, "error");
            setCallStatus('idle');
        });
    };

    const answerCall = () => {
        setCallStatus('connected');

        navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true }).then((stream) => {
            setLocalStream(stream);

            const peer = new SimplePeer({
                initiator: false,
                trickle: false,
                stream: stream
            });

            peer.on('signal', (data) => {
                // Send Answer back to Caller
                // The caller ID is in `friendUid` (since we filtered incoming by friendUid)
                const callRef = ref(database, `calls/${friendUid}`);
                // Wait, if I write to `calls/{friendUid}`, I overwrite HIS listener?
                // He is listening to `calls/{hisUid}` for the Answer? 
                // Let's adjust logic:
                // Caller wrote to `calls/{me}`.
                // I write answer to `calls/{caller}` with { answer: data }.

                update(callRef, { answer: JSON.stringify(data) });
            });

            peer.on('stream', (remoteStream) => {
                setRemoteStream(remoteStream);
            });

            peer.on('close', () => {
                endCall();
            });

            peer.on('error', (err) => {
                console.error("Peer connection error (Receiver):", err);
                endCall();
            });

            peer.signal(callerSignal);
            connectionRef.current = peer;
        });
    };

    const endCall = () => {
        // 1. Destroy Peer
        if (connectionRef.current) {
            connectionRef.current.destroy();
        }
        connectionRef.current = null;

        // Cleanup Answer Listener
        if (answerListenerRef.current) {
            answerListenerRef.current();
            answerListenerRef.current = null;
        }

        // 2. Stop Streams & Release Float
        if (localStream) {
            console.log("Stopping local stream tracks...");
            localStream.getTracks().forEach(track => {
                track.stop();
                console.log(`Stopped track: ${track.kind}`);
            });
        }
        setLocalStream(null);
        setRemoteStream(null);

        // 3. Cleanup Firebase
        // Remove direct call nodes
        if (user && friendUid) {
            remove(ref(database, `calls/${friendUid}`)); // Remove my offer to him
            remove(ref(database, `calls/${user.uid}`));  // Remove his answer/offer to me
        }

        setCallStatus('idle');
    };

    const toggleMic = (muted) => {
        if (localStream) {
            localStream.getAudioTracks()[0].enabled = !muted;
        }
    };

    const toggleCamera = (off) => {
        if (localStream) {
            localStream.getVideoTracks()[0].enabled = !off;
        }
    };

    const handleSend = async () => {
        if (!input.trim() || !user || !chatId) return;

        const text = input.trim();
        setInput(''); // Clear immediately for better UX

        try {
            const messagesRef = ref(database, `messages/${chatId}`);
            await push(messagesRef, {
                text: text,
                senderId: user.uid,
                timestamp: serverTimestamp(),
                type: 'text'
            });

            // Optional: Update 'lastMessage' in friends list for both users
            // This keeps the "Recent Messages" view updated
            const updates = {};
            const timestamp = Date.now();

            // Update for Me (My view of Friend) - Reset unreadCount because I sent it
            updates[`friends/${user.uid}/${friendUid}/lastMessage`] = `You: ${text}`;
            updates[`friends/${user.uid}/${friendUid}/timestamp`] = timestamp;

            // Update for Friend (Friend's view of Me) - INCREMENT unreadCount
            updates[`friends/${friendUid}/${user.uid}/lastMessage`] = text;
            updates[`friends/${friendUid}/${user.uid}/timestamp`] = timestamp;
            updates[`friends/${friendUid}/${user.uid}/unreadCount`] = increment(1);

            await update(ref(database), updates);
        } catch (error) {
            console.error("Error sending message:", error);
            showToast("Failed to send message", 'error');
        }
    };

    const handleFileUpload = async () => {
        if (!user || !chatId) {
            showToast("No user or chat ID", 'error');
            return;
        }

        try {
            console.log("Starting camera/gallery selection...");
            const image = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Uri
            });

            console.log("Image selected:", image.webPath);

            if (!image.webPath) {
                showToast("No image path returned", 'error');
                return;
            }

            setIsUploading(true);

            // Fetch Blob from local webPath
            const response = await fetch(image.webPath);
            const blob = await response.blob();
            const fileName = `${Date.now()}.${image.format}`;

            // 1. Upload to Firebase Storage
            const fileRef = storageRef(storage, `chat_media/${chatId}/${fileName}`);
            const snapshot = await uploadBytes(fileRef, blob);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // 2. Determine Type (Default to image for now as Camera plugin is photo-focused, 
            // but user can pick video from gallery if authorized. 
            // We can check mimeType but Camera plugin mostly returns images unless configured for all)
            // For now, assume Image. If future needs video, we need to check mimeType from blob.
            const type = blob.type.startsWith('image/') ? 'image' : 'video';

            // 3. Send Message
            const messagesRef = ref(database, `messages/${chatId}`);
            await push(messagesRef, {
                text: '',
                mediaUrl: downloadURL,
                type: type,
                senderId: user.uid,
                timestamp: serverTimestamp()
            });

            // Update Last Message for Media
            const updates = {};
            const timestamp = Date.now();
            const msgText = type === 'image' ? '📷 Image' : '🎥 Video';

            updates[`friends/${user.uid}/${friendUid}/lastMessage`] = `You sent a ${type}`;
            updates[`friends/${user.uid}/${friendUid}/timestamp`] = timestamp;

            updates[`friends/${friendUid}/${user.uid}/lastMessage`] = `${user.displayName || 'Friend'} sent a ${type}`;
            updates[`friends/${friendUid}/${user.uid}/timestamp`] = timestamp;
            updates[`friends/${friendUid}/${user.uid}/unreadCount`] = increment(1);

            await update(ref(database), updates);

        } catch (error) {
            console.error("Camera/Upload error:", error);
            // Don't alert if user cancelled
            if (error.message !== 'User cancelled photos app') {
                showToast("Failed to upload: " + error.message, 'error');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // --- Action Handlers ---

    const handleLongPress = (msg) => {
        longPressTimer.current = setTimeout(() => {
            setSelectedMessage(msg);
        }, 500); // 500ms long press
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleReaction = async (emoji) => {
        if (!selectedMessage || !chatId || !user) return;

        // Toggle: if same reaction exists from me, remove it. Else set it.
        const currentReaction = selectedMessage.reactions?.[user.uid];
        const newReaction = currentReaction === emoji ? null : emoji;

        const reactionRef = ref(database, `messages/${chatId}/${selectedMessage.id}/reactions/${user.uid}`);
        await set(reactionRef, newReaction);
    };

    const handleAction = async (action) => {
        if (!selectedMessage) return;

        if (action === 'copy') {
            await navigator.clipboard.writeText(selectedMessage.text);
            showToast('Copied to clipboard', 'info');
        }
        else if (action === 'save') {
            try {
                // Use CapacitorHttp to bypass CORS
                const options = {
                    url: selectedMessage.mediaUrl,
                    responseType: 'blob'
                };

                const response = await CapacitorHttp.get(options);

                // CapacitorHttp returns data as base64 string when responseType is blob
                const base64Data = response.data;
                const fileName = `RaveClone_${Date.now()}.jpg`;

                await Filesystem.writeFile({
                    path: fileName,
                    data: base64Data,
                    directory: Directory.Documents
                });

                showToast('Image saved to Documents!', 'success');
            } catch (e) {
                console.error("Save error", e);
                showToast("Failed to save image", 'error');
            }
        }
        else if (action === 'delete') {
            const messageRef = ref(database, `messages/${chatId}/${selectedMessage.id}`);
            await remove(messageRef);
            // Note: File in storage is orphan, but we can clean it up later or via Cloud Functions
        }
    };

    // Helper to render reactions
    const renderReactions = (reactions) => {
        if (!reactions) return null;
        const counts = Object.values(reactions).reduce((acc, emoji) => {
            acc[emoji] = (acc[emoji] || 0) + 1;
            return acc;
        }, {});

        const topEmojis = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);

        return (
            <div style={{
                position: 'absolute', bottom: -12, right: 0,
                background: '#1f2937', borderRadius: '12px', padding: '2px 6px',
                border: '2px solid #000', fontSize: '0.7rem', display: 'flex', gap: '2px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
                {topEmojis.map(([emoji, count]) => (
                    <span key={emoji}>{emoji} {count > 1 ? count : ''}</span>
                ))}
            </div>
        );
    };

    if (!user) return null;

    return (
        <div style={{
            height: '100vh',
            display: 'flex', flexDirection: 'column',
            background: 'black', color: 'white'
        }}>

            {selectedMessage && (
                <MessageActionMenu
                    message={selectedMessage}
                    onClose={() => setSelectedMessage(null)}
                    onReact={handleReaction}
                    onAction={handleAction}
                    isMe={selectedMessage.senderId === user.uid}
                />
            )}
            {/* Header */}
            <GlassCard variant="solid" noPadding style={{
                borderRadius: 0,
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                padding: '16px',
                paddingTop: 'calc(env(safe-area-inset-top) + 16px)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
                        <ArrowLeft size={24} />
                    </button>

                    <div style={{
                        width: 40, height: 40, borderRadius: '50%', overflow: 'hidden',
                        background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {friend?.photoURL ? (
                            <img
                                src={friend.photoURL}
                                alt="Avatar"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => { e.currentTarget.src = `https://ui-avatars.com/api/?name=${friend.username}&background=random` }}
                            />
                        ) : (
                            <span style={{ fontSize: '1.2rem' }}>👤</span>
                        )}
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {friend?.username || 'Loading...'}
                            </h3>
                            {friendStatus === 'online' && (
                                <div style={{
                                    width: 8, height: 8, minWidth: 8,
                                    background: '#4ade80',
                                    borderRadius: '50%',
                                    boxShadow: '0 0 8px #4ade80'
                                }} />
                            )}
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {friendStatus === 'online' ? 'Online' : 'Offline'}
                        </span>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', color: 'var(--accent-primary)', flexShrink: 0, marginRight: '16px' }}>
                        <button
                            onClick={() => startCall('voice')}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                            <Phone size={24} />
                        </button>
                        <button
                            onClick={() => startCall('video')}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                            <Video size={24} />
                        </button>
                    </div>
                </div>
            </GlassCard>

            {/* Messages Area */}
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px',
                    display: 'flex', flexDirection: 'column', gap: '12px'
                }}
            >
                {
                    messages.length === 0 && (
                        <div style={{ textAlign: 'center', color: 'gray', marginTop: '40px' }}>
                            No messages yet. Say hi! 👋
                        </div>
                    )
                }

                {
                    messages.map((msg) => {
                        const isMe = msg.senderId === user.uid;
                        return (
                            <div key={msg.id} style={{
                                alignSelf: isMe ? 'flex-end' : 'flex-start',
                                maxWidth: '70%',
                                display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start'
                            }}>
                                <div
                                    onContextMenu={(e) => e.preventDefault()}
                                    onTouchStart={() => handleLongPress(msg)}
                                    onTouchEnd={handleTouchEnd}
                                    onMouseDown={() => handleLongPress(msg)} // Desktop testing
                                    onMouseUp={handleTouchEnd}
                                    onMouseLeave={handleTouchEnd}
                                    className="message-bubble"
                                    style={{
                                        position: 'relative',
                                        padding: '12px 16px',
                                        borderRadius: '20px',
                                        borderBottomRightRadius: isMe ? '4px' : '20px',
                                        borderBottomLeftRadius: isMe ? '20px' : '4px',
                                        background: isMe
                                            ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))'
                                            : 'rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        boxShadow: isMe ? '0 4px 15px var(--accent-glow)' : 'none',
                                        border: isMe ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                        userSelect: 'none', // Prevent text selection on long press
                                        marginBottom: msg.reactions ? '10px' : '0' // Space for pills
                                    }}
                                >
                                    {msg.type === 'image' ? (
                                        <img src={msg.mediaUrl} alt="Sent attachment" style={{ maxWidth: '100%', borderRadius: '12px' }} />
                                    ) : (
                                        msg.type === 'video' ? (
                                            <video src={msg.mediaUrl} controls style={{ maxWidth: '100%', borderRadius: '12px' }} />
                                        ) : (
                                            msg.text
                                        )
                                    )}

                                    {/* Render Reactions */}
                                    {renderReactions(msg.reactions)}

                                </div>
                                <span style={{ fontSize: '0.7rem', color: 'gray', marginTop: '4px', margin: '0 4px' }}>
                                    {formatTime(msg.timestamp)}
                                </span>
                            </div>
                        );
                    })
                }
            </div >

            {/* Input Area */}
            <GlassCard style={{
                borderRadius: 0,
                borderBottom: 'none', borderLeft: 'none', borderRight: 'none',
                padding: '12px 0 12px 8px',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
                display: 'flex', gap: '8px', alignItems: 'center'
            }}>
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}
                >


                    <button
                        type="button"
                        onClick={handleFileUpload}
                        disabled={isUploading}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            width: 44, height: 44, flexShrink: 0,
                            borderRadius: '50%',
                            border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white',
                            cursor: 'pointer',
                        }}
                    >
                        {isUploading ? <div className="loader" style={{ width: 20, height: 20, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <Plus size={24} />}
                    </button>

                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Type a message..."
                        style={{
                            flex: 1,
                            minWidth: 0,
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '24px',
                            padding: '12px 16px',
                            color: 'white',
                            outline: 'none'
                        }}
                    />

                    <button
                        type="submit"
                        disabled={!input.trim()}
                        style={{
                            background: input.trim() ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                            width: 44, height: 44, flexShrink: 0,
                            borderRadius: '50%',
                            border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white',
                            cursor: input.trim() ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            opacity: input.trim() ? 1 : 0.5
                        }}
                    >
                        <Send size={20} />
                    </button>
                </form>

            </GlassCard >

            <Toast
                message={toast.message}
                type={toast.type}
                isVisible={toast.visible}
                onClose={hideToast}
            />

            <CallOverlay
                isVisible={callStatus !== 'idle'}
                status={callStatus}
                type={callType}
                friend={friend}
                localStream={localStream}
                remoteStream={remoteStream}
                onAccept={answerCall}
                onDecline={endCall}
                onEnd={endCall}
                onToggleMic={toggleMic}
                onToggleCamera={toggleCamera}
            />
        </div >
    );
};

export default ChatView;
