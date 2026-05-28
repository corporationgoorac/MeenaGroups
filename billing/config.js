// config.js

// Import the core Firebase App and Firestore database modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app-check.js";
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

// Initialize App Check with your reCAPTCHA Enterprise key
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider('6LcLh58sAAAAAGhYIzY25G8uk7EhrfcDaDoSqrvQ'),
  isTokenAutoRefreshEnabled: true
});

// Initialize Firestore to handle your company and balance data
const db = getFirestore(app);

// Initialize Firebase Authentication
const auth = getAuth(app);

// Export the instances so they can be imported into your other HTML/JS files
export { app, db, auth };
