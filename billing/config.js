// config.js

// Import the core Firebase App and Firestore database modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
// ADVANCED FIX: Import the offline persistence modules without removing the original import above
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Import Firebase Auth module
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Your Meena Marketing Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqkxHdOnfAKv7ia6nI0j1L8spRBFM-g5I",
  authDomain: "meena-marketing.firebaseapp.com",
  projectId: "meena-marketing",
  storageBucket: "meena-marketing.firebasestorage.app",
  messagingSenderId: "910067535855",
  appId: "1:910067535855:web:579d22f6cf267dfc3b701a",
  measurementId: "G-2M3E0H9X3P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore to handle your company and balance data
// (Original line commented out to preserve your code exactly without causing a crash)
// const db = getFirestore(app);

// --- ADVANCED SMART ROUTER LOGIC ---
let db;
if (window.location.pathname.includes('dailyCheck')) {
    // Enable Offline Persistence ONLY for Employee and Admin Audit pages
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
    console.log("Database Mode: Offline Persistence ENABLED (Audit Route)");
} else {
    // Standard real-time database (NO local storage) for inventory.html and all other pages
    db = getFirestore(app);
    console.log("Database Mode: Standard Live (NO Local Storage)");
}

// Initialize Firebase Authentication
const auth = getAuth(app);

// Export the instances so they can be imported into your other HTML/JS files
export { app, db, auth };
