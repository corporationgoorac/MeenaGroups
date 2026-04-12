const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cron = require('node-cron');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK using Hugging Face Secrets
// You must paste your entire Firebase service account JSON into a Hugging Face secret named FIREBASE_SERVICE_ACCOUNT
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("🔥 Firebase Admin Initialized Successfully");
} catch (error) {
  console.error("❌ Firebase Admin Initialization Error:", error.message);
}

const db = admin.firestore();

// ==========================================
// 1. AUTOMATED CRON JOB (12:00 AM IST)
// ==========================================
// This runs every day at Midnight (00:00) Indian Standard Time
cron.schedule('0 0 * * *', async () => {
  console.log(`[${new Date().toISOString()}] 🕒 Running Midnight Cron Job: Submitting Drafts...`);
  
  try {
    const snapshot = await db.collection('temp_entries').where('status', '==', 'draft').get();
    
    if (snapshot.empty) {
      console.log('✅ No drafts found to submit tonight.');
      return;
    }

    // Firestore allows a maximum of 500 writes per batch. 
    // This safely chunks the updates if you have a lot of agents/drafts.
    const batches = [];
    let currentBatch = db.batch();
    let count = 0;
    let totalUpdated = 0;

    snapshot.docs.forEach((doc) => {
      currentBatch.update(doc.ref, { 
        status: 'pending',
        forceSubmittedAt: admin.firestore.FieldValue.serverTimestamp(),
        submittedBySystem: true
      });
      count++;
      totalUpdated++;

      if (count === 490) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        count = 0;
      }
    });

    if (count > 0) batches.push(currentBatch);
    await Promise.all(batches.map(b => b.commit()));

    console.log(`✅ Successfully force-submitted ${totalUpdated} drafts to pending.`);
  } catch (error) {
    console.error('❌ Error in Midnight Cron Job:', error);
  }
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});

// ==========================================
// 2. EXPRESS API ENDPOINTS
// ==========================================

// Health Check Endpoint for Hugging Face
app.get('/', (req, res) => {
  res.send('Meena Groups Admin Backend is running.');
});

// GET: Fetch all Auth Users
app.get('/api/users', async (req, res) => {
  try {
    // Fetches up to 1000 users. If you have more, you would implement pagination with pageTokens.
    const listUsersResult = await admin.auth().listUsers(1000);
    
    const users = listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || 'No Name Set',
      lastSignInTime: user.metadata.lastSignInTime || 'Never',
      creationTime: user.metadata.creationTime
    }));

    res.status(200).json({ success: true, users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Update Auth User Display Name
app.post('/api/users/update-name', async (req, res) => {
  const { uid, newName } = req.body;

  if (!uid || !newName) {
    return res.status(400).json({ success: false, error: "Missing uid or newName" });
  }

  try {
    const userRecord = await admin.auth().updateUser(uid, {
      displayName: newName
    });
    
    res.status(200).json({ 
      success: true, 
      message: "Name updated successfully", 
      user: {
        uid: userRecord.uid,
        displayName: userRecord.displayName
      }
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. SERVER INITIALIZATION
// ==========================================
// Hugging Face Spaces specifically route external traffic to port 7860
const PORT = process.env.PORT || 7860;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
