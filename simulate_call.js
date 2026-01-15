import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';

const firebaseConfig = {
    apiKey: "AIzaSyCOkDk2_K4k3hmxXU2rjeu57r_XO3RzEKM",
    authDomain: "raveclone-8688f.firebaseapp.com",
    projectId: "raveclone-8688f",
    storageBucket: "raveclone-8688f.firebasestorage.app",
    messagingSenderId: "685004091386",
    appId: "1:685004091386:web:e07eff439b7b678a84be43",
    databaseURL: "https://raveclone-8688f-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const targetUid = process.argv[2];

if (!targetUid) {
    console.error("Usage: node simulate_call.js <TARGET_UID>");
    process.exit(1);
}

const callData = {
    callerId: 'test_caller_999',
    callerName: 'Simulated Incoming Call',
    callerPhoto: 'https://ui-avatars.com/api/?name=Incoming+Call&background=random',
    callType: 'video',
    roomId: 'room_simulation_123',
    timestamp: Date.now(),
    status: 'ringing'
};

console.log(`Simulating call for user: ${targetUid}`);
set(ref(db, `users/${targetUid}/incoming_call`), callData)
    .then(() => {
        console.log("Call signal sent! Check the app.");
        process.exit(0);
    })
    .catch((err) => {
        console.error("Error:", err);
        process.exit(1);
    });
