import { useState, useEffect, useRef, useCallback } from 'react';
import { database, auth } from '../firebase';
import { ref, onChildAdded, push, set, remove, onDisconnect } from 'firebase/database';

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export const useWebRTC = (roomId, user) => {
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState(new Map()); // Map<uid, MediaStream> (for rendering)
    const [isMuted, setIsMuted] = useState(true); // Start muted by default
    const [isConnected, setIsConnected] = useState(false);

    // Refs for mutable state in callbacks
    const peersRef = useRef(new Map()); // Map<uid, RTCPeerConnection>
    const localStreamRef = useRef(null);
    const remoteStreamsRef = useRef(new Map());
    const unsubscribesRef = useRef([]);

    // 1. Initialize as Listener (No Mic)
    const joinVoice = useCallback(async () => {
        if (!user || isConnected) return;

        try {
            console.log("👂 Joining Voice as Listener...");
            setIsConnected(true);
            setIsMuted(true);
            setupSignaling();
        } catch (err) {
            console.error("Join Error:", err);
        }
    }, [roomId, user, isConnected]);

    // 2. Signaling: Listen for incoming messages
    const setupSignaling = () => {
        if (!user || !roomId) return;

        const mySignalRef = ref(database, `rooms/${roomId}/signal/${user.uid}`);

        // Clear old signals on reconnect
        remove(mySignalRef);
        onDisconnect(mySignalRef).remove();

        const unsub = onChildAdded(mySignalRef, async (snapshot) => {
            const data = snapshot.val();
            const senderUid = data.sender;
            const key = snapshot.key;

            // Remove handled message
            remove(ref(database, `rooms/${roomId}/signal/${user.uid}/${key}`));

            if (data.type === 'offer') {
                await handleOffer(senderUid, data.sdp);
            } else if (data.type === 'answer') {
                await handleAnswer(senderUid, data.sdp);
            } else if (data.type === 'candidate') {
                await handleCandidate(senderUid, data.candidate);
            } else if (data.type === 'join-request') {
                // Someone joined and wants us to call them
                createPeerConnection(senderUid, true);
            }
        });

        unsubscribesRef.current.push(() => unsub()); // This is not a real unsub function for firebase, need checking firebase SDK
        // actually onChildAdded returns an Unsubscribe function in v9.

        // Broadcast "I'm here" so others call me
        // We send a 'join-request' to a special 'broadcast' node or iterate users?
        // Simpler: iterate known users from a separate "active-voice-users" list.
        // Let's implement a "announce" function.
    };

    // Helper to send signal
    const sendSignal = async (targetUid, data) => {
        await push(ref(database, `rooms/${roomId}/signal/${targetUid}`), {
            ...data,
            sender: user.uid
        });
    };

    // 3. WebRTC Core
    const createPeerConnection = async (targetUid, isInitiator) => {
        if (peersRef.current.has(targetUid)) return peersRef.current.get(targetUid);

        console.log(`🔗 Creating PeerConnection with ${targetUid} (Initiator: ${isInitiator})`);
        const pc = new RTCPeerConnection(rtcConfig);
        peersRef.current.set(targetUid, pc);

        // Add Local Tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        }

        // Handle Remote Tracks
        pc.ontrack = (event) => {
            const [remoteStream] = event.streams;
            const audioTracks = remoteStream.getAudioTracks();
            console.log(`🔊 Received Remote Stream from ${targetUid}`, {
                tracks: audioTracks.length,
                enabled: audioTracks[0]?.enabled,
                muted: audioTracks[0]?.muted,
                kind: audioTracks[0]?.kind
            });

            // Update State Map
            setRemoteStreams(prev => {
                const newMap = new Map(prev);
                newMap.set(targetUid, remoteStream);
                return newMap;
            });
            remoteStreamsRef.current.set(targetUid, remoteStream);
        };

        // Handle ICE Candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal(targetUid, { type: 'candidate', candidate: event.candidate.toJSON() });
            }
        };

        // Negotiation
        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(targetUid, { type: 'offer', sdp: offer });
        }

        return pc;
    };

    const handleOffer = async (senderUid, sdp) => {
        const pc = await createPeerConnection(senderUid, false);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(senderUid, { type: 'answer', sdp: answer });
    };

    const handleAnswer = async (senderUid, sdp) => {
        const pc = peersRef.current.get(senderUid);
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        }
    };

    const handleCandidate = async (senderUid, candidate) => {
        const pc = peersRef.current.get(senderUid);
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    };

    // 4. Mic Logic (Hardware Toggle)
    const toggleMute = async () => {
        // If currently muted (Listener Mode), we want to SPEAK.
        if (isMuted) {
            try {
                console.log("🎙️ Activating Microphone...");
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                localStreamRef.current = stream;
                setLocalStream(stream);
                setIsMuted(false);

                // Add Track to all existing peers & Renegotiate
                peersRef.current.forEach(async (pc, uid) => {
                    stream.getTracks().forEach(track => {
                        pc.addTrack(track, stream);
                    });
                    // Renegotiate
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    sendSignal(uid, { type: 'offer', sdp: offer });
                });

            } catch (err) {
                console.error("Mic activation failed:", err);
                alert("Could not access microphone.");
            }
        } else {
            // Mute = Kill Mic
            console.log("🔇 Deactivating Microphone...");
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
                setLocalStream(null);
            }
            setIsMuted(true);

            // Remove Tracks from peers & Renegotiate
            peersRef.current.forEach(async (pc, uid) => {
                const senders = pc.getSenders();
                senders.forEach(sender => pc.removeTrack(sender));

                // Renegotiate
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                sendSignal(uid, { type: 'offer', sdp: offer });
            });
        }
    };

    // 5. Cleanup
    const leaveVoice = useCallback(() => {
        // Stop Tracks
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Close Peers
        peersRef.current.forEach(pc => pc.close());
        peersRef.current.clear();
        setRemoteStreams(new Map());

        // Remove Signals
        if (roomId && user) {
            remove(ref(database, `rooms/${roomId}/signal/${user.uid}`));
        }

        setIsConnected(false);
    }, [roomId, user]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            leaveVoice();
        };
    }, []);

    // Expose "Call User" to the UI (so we can call people we see in the user list)
    const connectToPeer = (uid) => createPeerConnection(uid, true);

    return {
        joinVoice,
        leaveVoice,
        toggleMute,
        connectToPeer,
        isMuted,
        isConnected,
        localStream,
        remoteStreams
    };
};
