const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cron = require('node-cron');
const fs = require('fs'); 
const path = require('path'); 
require('dotenv').config();

const app = express();

// ==========================================
// 🚀 ADVANCED ADDITION: Basic API Security
// ==========================================
app.disable('x-powered-by'); // Hides the Express framework signature from response headers

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
// EXTERNAL BOT REFERENCE INITIALIZATION
// ==========================================
let waBot = null; // Defined here so Express routes can use it for manual restarts
let isGeneratingNewCode = false; // Tracks if a manual code refresh was just triggered

// ==========================================
// 2. EXPRESS API ENDPOINTS
// ==========================================

// --- NEW API ENDPOINT: Force WA Client Restart for Fresh Code ---
app.post('/api/refresh-code', async (req, res) => {
    try {
        isGeneratingNewCode = true; // Tell the poller we are actively destroying the session to get a code
        if (waBot && waBot.restartClient) {
            await waBot.restartClient();
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to refresh code:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ROOT WEBPAGE TO VIEW PAIRING CODE (DARK THEME REAL-TIME UI) ---
app.get('/', (req, res) => {
  const htmlTemplate = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>WhatsApp Device Link</title>
      <style>
          body {
              margin: 0; padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background-color: #111b21;
              color: #e9edef;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              min-height: 100vh;
          }
          .container {
              background-color: #202c33; padding: 40px 25px;
              border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              text-align: center; max-width: 400px; width: 85%;
              box-sizing: border-box;
          }
          h2 { 
              color: #00a884;
              margin-top: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;
          }
          p { color: #8696a0; font-size: 15px; line-height: 1.5; margin-bottom: 30px; }
          .code-container {
              background: #111b21; padding: 20px; border-radius: 12px;
              display: inline-block; margin-bottom: 25px; border: 1px solid #2a3942;
              width: 100%;
              box-sizing: border-box;
          }
          .code-container h1 {
              color: #00a884; font-size: 40px; letter-spacing: 8px; 
              margin: 0; user-select: all; cursor: pointer;
              word-break: break-all;
          }
          .btn {
              background-color: #00a884; color: #111b21;
              border: none; padding: 14px 24px; border-radius: 24px;
              font-weight: 700; font-size: 15px; cursor: pointer;
              transition: background 0.2s; width: 100%; margin-bottom: 12px;
              box-sizing: border-box;
          }
          .btn:active { background-color: #008f6f; }
          .btn-secondary {
              background-color: transparent; color: #00a884;
              border: 1px solid #00a884; padding: 14px 24px; border-radius: 24px;
              font-weight: 700; font-size: 15px; cursor: pointer;
              transition: all 0.2s; width: 100%; margin-bottom: 12px; box-sizing: border-box;
          }
          .btn-secondary:active { background-color: rgba(0, 168, 132, 0.1); }
          .btn:disabled, .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
          .loader {
              border: 4px solid #2a3942; border-top: 4px solid #00a884;
              border-radius: 50%; width: 45px; height: 45px;
              animation: spin 1s linear infinite; margin: 0 auto 25px;
          }
          .footer { margin-top: 25px; font-size: 12px; color: #54656f; font-weight: 500;}
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          
          /* Success Animation */
          .success-icon {
              font-size: 60px; margin-bottom: 15px; display: inline-block;
              animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          }
          @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
      </style>
  </head>
  <body>
      <div class="container">
          <h2>Pairing Code</h2>
          <div id="dynamic-content">
              <div class="loader"></div>
              <p>Checking system status...</p>
          </div>
      </div>
      <div class="footer">Securely managed by Goorac Systems</div>

      <script>
          let currentState = "INIT";
          let currentCode = "";
          
          function renderCode(code) {
              document.getElementById('dynamic-content').innerHTML = \`
                  <p>Open WhatsApp on your primary phone <b>(+91 89257 30217)</b>. Tap the notification and enter the code below to link the system.</p>
                  <div class="code-container">
                    <h1 id="wa-code">\` + code + \`</h1>
                  </div>
                  <button class="btn" onclick="navigator.clipboard.writeText('\` + code + \`').then(() => { this.innerText='✅ Copied!'; setTimeout(() => this.innerText='📋 Copy Code', 2000); })">📋 Copy Code</button>
                  <button class="btn-secondary" id="refresh-btn" onclick="forceNewCode()">🔄 Get Another Code</button>
              \`;
          }

          function forceNewCode() {
              const btn = document.getElementById('refresh-btn');
              if (btn) { btn.innerText = '⏳ Generating...'; btn.disabled = true; }
              
              // Tell backend to restart client
              fetch('/api/refresh-code', { method: 'POST' }).catch(err => console.error(err));
              
              // Immediately switch to waiting state visually
              currentState = 'WAITING';
              currentCode = '';
              document.getElementById('dynamic-content').innerHTML = \`
                  <div class="loader"></div>
                  <p>Requesting fresh code from WhatsApp...<br><br>Please wait a few seconds.</p>
              \`
          }
          
          function checkStatus() {
              fetch('/api/pairing-status')
                  .then(res => res.json())
                  .then(data => {
                      const container = document.getElementById('dynamic-content');
                      if (!container) return;

                      if (data.ready && data.code) {
                          // Detected a pairing code
                          if (currentState !== 'CODE' || currentCode !== data.code) {
                              currentState = 'CODE';
                              currentCode = data.code;
                              renderCode(data.code);
                          }
                      } else if (data.linked) {
                          // No pairing code exists, but the session folder exists (Server is Connected)
                          if (currentState !== 'LINKED') {
                              currentState = 'LINKED';
                              container.innerHTML = \`
                                  <div class="success-icon">✅</div>
                                  <p style="color: #00a884; font-weight: bold; font-size: 20px; margin-bottom: 10px;">Linked Successfully!</p>
                                  <p>WhatsApp is now connected to the server. You can safely close this page.</p>
                                  <button class="btn-secondary" style="margin-top: 15px;" onclick="forceNewCode()">🔄 Re-Link Device</button>
                              \`;
                          }
                      } else {
                          // No code, no session -> Booting up or generating new code
                          if (currentState !== 'WAITING') {
                              currentState = 'WAITING';
                              container.innerHTML = \`
                                  <div class="loader"></div>
                                  <p>The system is generating the code.<br><br>Waiting for WhatsApp Engine...</p>
                              \`;
                          }
                      }
                  })
                  .catch(err => console.error('Polling Error:', err))
                  .finally(() => {
                      // Keep polling continuously in the background so it auto-recovers if disconnected
                      setTimeout(checkStatus, 2500); 
                  });
          }
          
          // Start the background polling loop immediately
          checkStatus();
      </script>
  </body>
  </html>
  `;
  res.send(htmlTemplate);
});

// --- NEW API ENDPOINT: Smart status checking (Solves the endless loader bug) ---
app.get('/api/pairing-status', (req, res) => {
  const codePath = path.join(__dirname, 'pairing-code.txt');
  const sessionPath = path.join(__dirname, 'whatsapp-session');

  if (fs.existsSync(codePath)) {
    // If we have a code file, we definitely need the user to scan it. Reset generation flag.
    isGeneratingNewCode = false; 
    res.json({ ready: true, code: fs.readFileSync(codePath, 'utf8'), linked: false });
  } else {
    // If we deliberately asked for a new code, ignore the old session until the code arrives
    if (isGeneratingNewCode) {
        res.json({ ready: false, linked: false });
    } 
    // If the session folder exists and no new code was asked for, it means we are connected
    else if (fs.existsSync(sessionPath)) {
        res.json({ ready: false, linked: true });
    } 
    // Absolute fresh start (no session, no code)
    else {
        res.json({ ready: false, linked: false });
    }
  }
});

// GET: Fetch all Auth Users
app.get('/api/users', async (req, res) => {
  try {
    const listUsersResult = await admin.auth().listUsers(1000);
    
    const users = listUsersResult.users.map(user => ({
      uid: user.uid,
      email: user.email,
      phoneNumber: user.phoneNumber || 'No Phone', 
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
// 🚀 ADVANCED ADDITION: Global Error Handler
// ==========================================
// Catches rogue API errors so they don't crash the Node process
app.use((err, req, res, next) => {
  console.error('❌ [API ROUTE ERROR] Unhandled Exception:', err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// ==========================================
// 3. SERVER INITIALIZATION
// ==========================================
const PORT = process.env.PORT || 7860;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ==========================================
// 4. EXTERNAL SERVER INITIALIZATION
// ==========================================
try {
  waBot = require('./msg.js');
  console.log("📨 msg.js external server initialized successfully.");
} catch (error) {
  console.error("❌ Failed to load msg.js:", error.message);
}

// ==========================================
// 5. ADVANCED MEMORY MANAGEMENT (Zero-Downtime)
// ==========================================
// Replaced the 3:00 AM 'process.exit(0)' kill-switch with a smart memory monitor.
// This keeps the server running 24/7 without wiping your Hugging Face storage!
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  
  if (heapUsedMB > 450) {
    console.log(`⚠️ [MEMORY GUARD] High Memory Detected (${heapUsedMB}MB). Triggering soft garbage collection...`);
    // Soft clean without dropping the container connection
    if (global.gc) {
      global.gc();
      console.log('🧹 V8 Garbage Collector successfully cleared RAM without rebooting.');
    } else {
      // 🚀 ADVANCED ADDITION: Warning if Dockerfile is missing --expose-gc
      console.warn('⚠️ [WARNING] Garbage Collection skipped! You must add "--expose-gc" to your Dockerfile CMD.');
    }
  }
}, 15 * 60 * 1000); // Checks seamlessly in the background every 15 minutes

// ==========================================
// 🚀 ADVANCED ADDITION: Graceful Shutdown System
// ==========================================
// Hugging Face sends SIGTERM when rebuilding or restarting spaces.
// This ensures Firebase and Express close safely instead of corrupting data.
process.on('SIGTERM', () => {
  console.log('🛑 [SYSTEM] SIGTERM received from Hugging Face. Shutting down gracefully...');
  server.close(() => {
    console.log('🔌 [SYSTEM] Express server closed.');
    process.exit(0);
  });
});
process.on('SIGINT', () => {
  console.log('🛑 [SYSTEM] SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('🔌 [SYSTEM] Express server closed.');
    process.exit(0);
  });
});
