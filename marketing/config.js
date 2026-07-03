// config.js

// 1. Import ONLY the essential Firebase modules to reduce network overhead
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// 2. Your Meena Marketing Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqkxHdOnfAKv7ia6nI0j1L8spRBFM-g5I",
  authDomain: "meena-marketing.firebaseapp.com",
  projectId: "meena-marketing",
  storageBucket: "meena-marketing.firebasestorage.app",
  messagingSenderId: "910067535855",
  appId: "1:910067535855:web:579d22f6cf267dfc3b701a",
  measurementId: "G-2M3E0H9X3P"
};

// 3. Initialize Firebase
const app = initializeApp(firebaseConfig);

// 4. Initialize Firestore (Database)
const db = getFirestore(app);

// 5. Initialize Firebase Authentication
const auth = getAuth(app);

// 6. Export the instances
export { app, db, auth };
