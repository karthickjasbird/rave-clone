import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import BottomNav from './components/BottomNav';
import HomeView from './pages/HomeView';
import LoginView from './pages/LoginView';
import SearchView from './pages/SearchView';
import ProfileView from './pages/ProfileView';
import CreateRoomView from './pages/CreateRoomView';
import RoomView from './pages/RoomView';
import MessagesView from './pages/MessagesView';
import ChatView from './pages/ChatView';
import FindFriendsView from './pages/FindFriendsView';
import { auth, database } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, onDisconnect, set, serverTimestamp } from 'firebase/database';
import { useFCM } from './hooks/useFCM';
import IncomingCallOverlay from './components/IncomingCallOverlay';
import './App.css';

const AppContent = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);

  // Initialize FCM
  useFCM(user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => {
      unsubscribe();
    };
  }, [navigate, location.pathname]);

  // Real-Time Presence Logic
  useEffect(() => {
    if (user) {
      const connectedRef = ref(database, '.info/connected');
      const userStatusRef = ref(database, `status/${user.uid}`);

      const unsubscribe = onValue(connectedRef, (snapshot) => {
        if (snapshot.val() === true) {
          // We're connected (or reconnected)!

          // 1. Establish the "Do this when I disconnect" rule
          onDisconnect(userStatusRef).set({
            state: 'offline',
            last_changed: serverTimestamp()
          }).then(() => {
            // 2. Set my status to online
            set(userStatusRef, {
              state: 'online',
              last_changed: serverTimestamp()
            });
          });
        }
      });

      return () => unsubscribe();
    }
  }, [user]);

  // Incoming Call Logic
  const [incomingCall, setIncomingCall] = useState(null);

  useEffect(() => {
    if (!user) return;

    console.log("App: Listening for calls on", `users/${user.uid}/incoming_call`);
    const callRef = ref(database, `users/${user.uid}/incoming_call`);
    const unsubscribe = onValue(callRef, (snapshot) => {
      console.log("App: Call Snapshot:", snapshot.exists(), snapshot.val());
      if (snapshot.exists()) {
        setIncomingCall(snapshot.val());
      } else {
        setIncomingCall(null);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleAcceptCall = () => {
    if (!incomingCall) return;
    // Remove call node to stop ringing on other devices (if any)
    const callRef = ref(database, `users/${user.uid}/incoming_call`);
    set(callRef, null); // Or update status to 'accepted'

    // Navigate to Room/Chat
    navigate(`/chat/${incomingCall.callerId}`, { state: { autoAnswer: true } }); // Navigate to 1-on-1 Chat with Auto-Answer
  };

  const handleDeclineCall = () => {
    if (!incomingCall) return;
    const callRef = ref(database, `users/${user.uid}/incoming_call`);
    set(callRef, null); // Clear call
  };

  if (authLoading) {
    return (
      <div style={{
        height: '100vh', width: '100vw',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'black', color: 'white'
      }}>
        {/* Simple Loader */}
        <div className="spinner" style={{
          width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.3)',
          borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite'
        }}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const showBottomNav = location.pathname !== '/' && !location.pathname.startsWith('/chat');

  return (
    <>
      <Layout>
        <div style={{ flex: 1, width: '100%', position: 'relative', overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<LoginView />} />
            <Route path="/home" element={<HomeView />} />
            <Route path="/search" element={<SearchView />} />
            <Route path="/create" element={<CreateRoomView />} />
            <Route path="/messages" element={<MessagesView />} />
            <Route path="/chat/:id" element={<ChatView />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route path="/room/:id" element={<RoomView />} />
            <Route path="/find-friends" element={<FindFriendsView />} />
          </Routes>
        </div>
        {showBottomNav && <BottomNav />}
      </Layout>

      <IncomingCallOverlay
        callData={incomingCall}
        onAccept={handleAcceptCall}
        onDecline={handleDeclineCall}
      />
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
