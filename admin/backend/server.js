const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cron = require('node-cron');
const fs = require('fs'); // NEW: Needed to read the QR image
const path = require('path'); // NEW: Needed to find the image path
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK using Hugging Face Secrets
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
cron.schedule('0 0 * * *', async () => {
  console.log(`[${new Date().toISOString()}] 🕒 Running Midnight Cron Job: Submitting Drafts...`);
  
  try {
    const snapshot = await db.collection('temp_entries').where('status', '==', 'draft').get();
    
    if (snapshot.empty) {
      console.log('✅ No drafts found to submit tonight.');
      return;
    }

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
    
    // --- OLD CODE (Commented out to prevent memory spike) ---
    // await Promise.all(batches.map(b => b.commit()));
    
    // --- NEW FIXED CODE: Sequential Commits ---
    for (const batch of batches) {
      await batch.commit();
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms buffer prevents network/CPU crash
    }

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

app.get('/', (req, res) => {
  res.send('Meena Groups Admin Backend is running.');
});

// --- NEW: WEBPAGE TO VIEW QR CODE ---
app.get('/qr', (req, res) => {
  const qrPath = path.join(__dirname, 'whatsapp-qr.png');
  // Check if the image exists inside the container
  if (fs.existsSync(qrPath)) {
    res.sendFile(qrPath); // Send the image directly to the browser
  } else {
    // If it's already scanned or still downloading, show a helpful message
    res.status(404).send(`
      <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
        <h2>QR Code Status</h2>
        <p>The QR Code is either already successfully scanned, or the system is currently generating a new one.</p>
        <p>Please wait 10 seconds and <button onclick="window.location.reload()" style="padding: 5px 10px; cursor: pointer;">Refresh Page</button></p>
      </div>
    `);
  }
});

// GET: Fetch all Auth Users (Now includes phoneNumber)
app.get('/api/users', async (req, res) => {
  try {
    const listUsersResult = await admin.auth().listUsers(1000);
    
    const users = listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      phoneNumber: user.phoneNumber || 'No Phone', // Added phone number retrieval
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
    console.error("Error updating user name:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Update Auth User Phone Number
app.post('/api/users/update-phone', async (req, res) => {
  const { uid, newPhone } = req.body;

  if (!uid || !newPhone) {
    return res.status(400).json({ success: false, error: "Missing uid or newPhone" });
  }

  // --- AUTOMATIC PHONE NUMBER FORMATTING ---
  // 1. Remove all spaces, dashes, and parentheses
  let formattedPhone = newPhone.replace(/[\s\-\(\)]/g, ''); 
  
  // 2. Remove leading '0' if an Indian user typed it out of habit
  if (formattedPhone.startsWith('0') && formattedPhone.length > 10) {
    formattedPhone = formattedPhone.substring(1);
  }
  
  // 3. Ensure it has the '+91' country code
  if (!formattedPhone.startsWith('+')) {
    if (formattedPhone.startsWith('91') && formattedPhone.length === 12) {
      formattedPhone = '+' + formattedPhone;
    } else {
      formattedPhone = '+91' + formattedPhone;
    }
  }

  try {
    const userRecord = await admin.auth().updateUser(uid, {
      // Must include country code, e.g., +91...
      phoneNumber: formattedPhone 
    });
    
    res.status(200).json({ 
      success: true, 
      message: "Phone number updated successfully", 
      user: {
        uid: userRecord.uid,
        phoneNumber: userRecord.phoneNumber
      }
    });
  } catch (error) {
    console.error("Error updating phone number:", error);
    // Firebase throws specific errors if the phone number format is invalid or already in use
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Delete Auth User
app.post('/api/users/delete', async (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ success: false, error: "Missing uid" });
  }

  try {
    await admin.auth().deleteUser(uid);
    
    res.status(200).json({ 
      success: true, 
      message: "User account deleted successfully from Firebase Auth" 
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 7860;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ==========================================
// 4. EXTERNAL SERVER INITIALIZATION
// ==========================================
try {
  require('./msg.js');
  console.log("📨 msg.js external server initialized successfully.");
} catch (error) {
  console.error("❌ Failed to load msg.js:", error.message);
}

// ==========================================
// 5. ANTI-CRASH: DAILY SAFE RESTART
// ==========================================
cron.schedule('0 3 * * *', () => {
  console.log("🧹 Performing daily safe restart at 3:00 AM to clear RAM...");
  process.exit(0); // Exits cleanly, Hugging Face/Docker will restart it fresh immediately
}, {
  scheduled: true,
  timezone: "Asia/Kolkata"
});
