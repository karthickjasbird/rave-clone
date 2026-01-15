import { initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { getDatabase, ref, set, push, onValue } from "firebase/database";
import { getStorage } from "firebase/storage";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { Capacitor } from "@capacitor/core";

// CONFIGURE THIS: Replace with your actual Firebase project config
const firebaseConfig = {
    apiKey: "AIzaSyCOkDk2_K4k3hmxXU2rjeu57r_XO3RzEKM",
    authDomain: "raveclone-8688f.firebaseapp.com",
    projectId: "raveclone-8688f",
    storageBucket: "raveclone-8688f.firebasestorage.app", // standard pattern often used if not explicit 
    messagingSenderId: "685004091386",
    appId: "1:685004091386:web:e07eff439b7b678a84be43",
    databaseURL: "https://raveclone-8688f-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);

// Initialize Auth with Persistence
// Check if running on native platform to potentially use native persistence if needed, 
// strictly using indexedDB for now as it's most reliable for Capacitor+FirebaseJS
// const auth = initializeAuth(app, {
//     persistence: [indexedDBLocalPersistence, browserLocalPersistence]
// });

// DEBUG: Fallback to standard auth to test if persistence is blocking start
import { getAuth } from "firebase/auth";
const auth = getAuth(app);
console.log("Firebase Auth Initialized (Standard)");

const database = getDatabase(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

/**
 * Sign in with Google (Native Flow)
 */
export const signInWithGoogle = async () => {
    try {
        // 1. Native Sign-In using Capacitor Plugin
        const result = await FirebaseAuthentication.signInWithGoogle();

        // 2. Create a Firebase credential from the token
        const credential = GoogleAuthProvider.credential(result.credential?.idToken);

        // 3. Sign in to Firebase JS SDK with that credential
        const userCredential = await signInWithCredential(auth, credential);
        return userCredential.user;
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        throw error;
    }
};

export { auth, app, database, storage };
