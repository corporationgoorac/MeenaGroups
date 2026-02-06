// config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-analytics.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD4swxPXGkuK4VaVvJKOBRkjAUIGfovZN8",
  authDomain: "meenagroupsgoorac.firebaseapp.com",
  projectId: "meenagroupsgoorac",
  storageBucket: "meenagroupsgoorac.firebasestorage.app",
  messagingSenderId: "589926126547",
  appId: "1:589926126547:web:ffa93c5877b3ce6d40d526",
  measurementId: "G-P6QM7T3NVB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// Export database and app for use in your HTML files
export { app, db, analytics };
