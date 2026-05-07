// config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";

// Import Firestore and Offline Persistence tools
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// Import Authentication tools
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDzZUlasNdSISjQRVDsx9og987RQiUSNqQ",
  authDomain: "goorac-wallets.firebaseapp.com",
  projectId: "goorac-wallets",
  storageBucket: "goorac-wallets.firebasestorage.app",
  messagingSenderId: "67562594979",
  appId: "1:67562594979:web:db203c26eaf35144c31516",
  measurementId: "G-CEEYWJKVS0"
};

// 1. Initialize Firebase App
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// 2. Initialize Firestore with strict Offline Persistence
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager() // Allows offline cache to work across multiple browser tabs
  })
});

// 3. Initialize Authentication
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// 4. Authentication Helper Functions
const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("Logged in as:", result.user.displayName);
    return result.user;
  } catch (error) {
    console.error("Login Error:", error.message);
    throw error;
  }
};

const logoutUser = async () => {
  try {
    await signOut(auth);
    console.log("Successfully logged out.");
  } catch (error) {
    console.error("Logout Error:", error.message);
  }
};

// 5. Export everything needed for your index.html
export { 
  app, 
  analytics, 
  db, 
  auth, 
  loginWithGoogle, 
  logoutUser, 
  onAuthStateChanged 
};
