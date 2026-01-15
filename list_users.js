import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get } from 'firebase/database';

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

console.log("Fetching users...");
get(ref(db, 'users')).then((snap) => {
    if (snap.exists()) {
        const users = snap.val();
        Object.keys(users).forEach(uid => {
            const u = users[uid];
            console.log(`UID: ${uid} | Name: ${u.username || 'Unknown'} | Email: ${u.email}`);
        });
    } else {
        console.log("No users found.");
    }
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
