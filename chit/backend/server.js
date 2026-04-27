const express = require('express'); // FIXED: Lowercase 'const'
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// --- 1. EXPRESS SERVER INIT ---
const app = express();
const port = process.env.PORT || 7860; // 7860 is the default port for Hugging Face Spaces

app.use(express.json());

// --- 2. FIREBASE ADMIN SDK INIT ---
// In Hugging Face, go to Settings -> Secrets and add FIREBASE_SERVICE_ACCOUNT
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        // ADVANCED EDGE CASE FIX: Prevent Firebase from initializing multiple times if server re-routes
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
        console.log("✅ Firebase Admin initialized securely from Secrets.");
    } else {
        console.warn("⚠️ FIREBASE_SERVICE_ACCOUNT secret is missing in Hugging Face.");
    }
} catch (error) {
    console.error("❌ Firebase Admin init failed:", error);
}

// --- 3. WHATSAPP WEB INIT (RAM OPTIMIZED) ---
let waStatus = 'INITIALIZING'; // INITIALIZING, QR_READY, CONNECTED
let currentQRDataURL = '';
let isInitializing = false; // Flag to prevent multiple initializations simultaneously

// ADVANCED EDGE CASE FIX: Flags to prevent duplicate scheduler clones and memory leaks
let isCheckModuleLoaded = false; 
let isClientDestroying = false;

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa_session' }), // Saves session to prevent re-scanning
    authTimeoutMs: 120000, // INCREASED to 2 minutes to prevent HuggingFace timeout crashes
    puppeteer: {
        headless: true,
        // ADVANCED TIMEOUT GUARD: Prevents net::ERR_TIMED_OUT on slow server wakeups
        timeout: 60000,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // Critical for Docker/Hugging Face
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            /* '--no-zygote', */ // COMMENTED OUT: Causes instability on HF containers
            /* '--single-process', */ // COMMENTED OUT: Triggers HF RAM Quota kills during spikes
            '--disable-gpu',
            '--js-flags="--max-old-space-size=450"', // UPDATED: Limit JS Heap strictly to 450MB
            // EXTRA RAM SAVERS:
            '--disable-extensions',
            '--memory-pressure-off'
        ]
    }
});

// Event: Generate & Save QR Code
client.on('qr', async (qr) => {
    console.log('🔄 New QR Code Generated');
    waStatus = 'QR_READY';
    isInitializing = false; // THE DEADLOCK FIX: Unlock here so it can reboot if the QR times out!
    
    try {
        // Convert to Base64 for the frontend API
        currentQRDataURL = await qrcode.toDataURL(qr);
        
        // Write directly to file (overwrites the old one to save storage)
        const base64Data = currentQRDataURL.replace(/^data:image\/png;base64,/, "");
        const qrPath = path.join(__dirname, 'qr.png');
        fs.writeFileSync(qrPath, base64Data, 'base64');
        console.log(`🖼️ QR saved to ${qrPath}`);
    } catch (err) {
        console.error("Failed to generate QR file:", err);
    }
});

// Event: Successfully Connected
client.on('ready', () => {
    console.log('✅ WhatsApp Client is READY and ONLINE!');
    waStatus = 'CONNECTED';
    currentQRDataURL = ''; // Clear memory
    isInitializing = false; // Reset lock once safely connected
    
    // Delete the qr.png file since it's no longer needed
    const qrPath = path.join(__dirname, 'qr.png');
    if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);

    // --- EXECUTE CHECK.JS IF AVAILABLE ---
    // ADVANCED EDGE CASE FIX: Prevent check.js from being cloned every time WA reconnects
    if (!isCheckModuleLoaded) {
        const checkScriptPath = path.join(__dirname, 'check.js');
        if (fs.existsSync(checkScriptPath)) {
            console.log('🚀 check.js found! Initializing automated scheduled tasks...');
            const checkLogic = require('./check.js');
            // Pass the connected client and firebase admin to check.js
            if(typeof checkLogic === 'function') {
                // THE SUICIDE GUARD: Prevent check.js syntax errors from crashing the main connection
                try {
                    checkLogic(client, admin);
                    isCheckModuleLoaded = true; // Lock the module so it never runs twice!
                } catch (error) {
                    console.error("❌ check.js failed to start safely:", error);
                }
            }
        } else {
            console.log('ℹ️ check.js not found. Skipping automation startup.');
        }
    } else {
        console.log('⚡ WhatsApp Reconnected: check.js is already running safely in the background.');
    }
});

// --- NEW EVENT: AUTHENTICATION FAILURE GUARD ---
client.on('auth_failure', msg => {
    console.error('❌ Authentication Failure (Corrupted Session):', msg);
    waStatus = 'DISCONNECTED';
    isInitializing = false; // Release lock so it can be destroyed and rebooted cleanly
});

// Event: Disconnected (Requires re-scan)
// ADVANCED EDGE CASE FIX: Added 'async' to allow for safe memory destruction
client.on('disconnected', async (reason) => {
    console.log('❌ Client was logged out or disconnected:', reason);
    waStatus = 'DISCONNECTED';
    
    // Safely reboot client, preventing multiple simultaneous calls
    if (!isInitializing && !isClientDestroying) {
        isInitializing = true;
        isClientDestroying = true;
        
        // ADVANCED EDGE CASE FIX: Purge the corrupted browser instance before rebooting
        console.log("🧹 Safe Reboot: Destroying corrupted WhatsApp instance from RAM...");
        
        // THE GUILLOTINE GUARD: If destroy() hangs forever, kill it after 5 seconds
        await Promise.race([
            client.destroy().catch(() => {}),
            new Promise(res => setTimeout(res, 5000))
        ]);
        
        isClientDestroying = false;

        // THE FILE LOCK GUARD: Wait 5 seconds to let the OS release session files before restarting
        console.log("⏳ Waiting 5 seconds to release OS file locks...");
        setTimeout(() => {
            client.initialize().catch(err => {
                console.error("❌ Reboot Initialization Error:", err);
                isInitializing = false;
            }); // Reboot client
        }, 5000);
    }
});

// --- 4. PREVENT MEMORY LEAKS (RAM CLEARING) ---
// Every 15 minutes, safely clear browser cache without logging out
setInterval(async () => {
    // ADVANCED CRASH GUARD: Added !client.pupPage.isClosed() to prevent querying a dead browser
    if (waStatus === 'CONNECTED' && client.pupPage && !client.pupPage.isClosed()) {
        try {
            await client.pupPage.evaluate(() => performance.clearResourceTimings());
            
            // Deep safe RAM clear via CDP (Chrome DevTools Protocol) without disrupting session
            const clientCDP = await client.pupPage.target().createCDPSession();
            await clientCDP.send('Network.clearBrowserCache');
            await clientCDP.send('HeapProfiler.collectGarbage');
            await clientCDP.detach();
            
            console.log("🧹 Headless Browser RAM & Cache optimized to stay under 450MB.");
        } catch (e) {
            // Simplified error output so it doesn't flood your logs if it fails once
            console.error("Failed to clear RAM:", e.message);
        }
    }
}, 15 * 60 * 1000);

// Initialize the engine
if (!isInitializing) {
    isInitializing = true;
    client.initialize().catch(err => {
        // PREVENTS UNHANDLED PROMISE REJECTION CRASH
        console.error("❌ Fatal WhatsApp Initialization Error Caught:", err);
        isInitializing = false; 
    });
}

// --- 5. API ROUTES & INLINE FRONTEND ---

app.get('/api/status', (req, res) => {
    res.json({
        status: waStatus,
        qrUrl: currentQRDataURL
    });
});

// Serve the Professional UI directly from the root URL
app.get('/', (req, res) => {
    const htmlUI = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>System Status - Meena Chitfunds</title>
      <style>
        :root {
          --bg-color: #f4f7f6;
          --surface-color: #ffffff;
          --text-main: #111111;
          --text-muted: #6b7280;
          --brand-accent: #065fd4;
          --success-color: #10b981;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --bg-color: #0a0a0a;
            --surface-color: #141414;
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
          }
        }
        body {
          background-color: var(--bg-color);
          color: var(--text-main);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          display: flex; justify-content: center; align-items: center;
          height: 100vh; margin: 0; padding: 20px; text-align: center;
        }
        .card {
          background: var(--surface-color); padding: 40px; border-radius: 24px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1); width: 100%; max-width: 400px;
          transition: 0.3s; border: 1px solid rgba(128,128,128,0.1);
        }
        .logo { font-size: 24px; font-weight: 800; color: var(--brand-accent); margin-bottom: 8px; letter-spacing: -0.5px;}
        .status-text { font-size: 15px; color: var(--text-muted); font-weight: 600; margin-bottom: 24px;}
        
        .qr-container { position: relative; min-height: 250px; display: flex; justify-content: center; align-items: center; }
        .qr-image { width: 250px; height: 250px; border-radius: 12px; display: none; border: 4px solid var(--brand-accent-light); }
        
        .loader { border: 4px solid rgba(128,128,128,0.2); border-top: 4px solid var(--brand-accent); border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .success-icon { width: 80px; height: 80px; background: rgba(16, 185, 129, 0.15); color: var(--success-color); border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 40px; margin: 0 auto 20px; }
        .success-ui { display: none; }
      </style>
    </head>
    <body>

      <div class="card" id="main-card">
        <div id="auth-ui">
            <div class="logo">Meena Chitfunds</div>
            <div class="status-text" id="status-label">Initializing Server Engine...</div>
            
            <div class="qr-container">
                <div class="loader" id="loader"></div>
                <img src="" alt="WhatsApp QR" class="qr-image" id="qr-img">
            </div>
            <p style="font-size:12px; color:var(--text-muted); margin-top:20px;">Open WhatsApp on your phone and link device.</p>
        </div>

        <div id="success-ui" class="success-ui">
            <div class="success-icon">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
            </div>
            <div class="logo" style="color: var(--success-color);">ChitFunds Online</div>
            <div class="status-text">Automation server is securely connected and actively monitoring schedules.</div>
        </div>
      </div>

      <script>
        async function checkStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                const loader = document.getElementById('loader');
                const qrImg = document.getElementById('qr-img');
                const statusLabel = document.getElementById('status-label');

                if (data.status === 'QR_READY' && data.qrUrl) {
                    loader.style.display = 'none';
                    qrImg.style.display = 'block';
                    qrImg.src = data.qrUrl; // Updates QR without reloading the page
                    statusLabel.innerText = "Scan QR to Authenticate Server";
                } 
                else if (data.status === 'CONNECTED') {
                    document.getElementById('auth-ui').style.display = 'none';
                    document.getElementById('success-ui').style.display = 'block';
                    return; // Stop polling once connected
                }
                else {
                    loader.style.display = 'block';
                    qrImg.style.display = 'none';
                    statusLabel.innerText = "Initializing WhatsApp Engine...";
                }
            } catch (e) {
                document.getElementById('status-label').innerText = "Reconnecting to server...";
            }
            
            // Poll every 3 seconds
            setTimeout(checkStatus, 3000);
        }

        // Start polling immediately
        checkStatus();
      </script>
    </body>
    </html>
    `;
    
    res.send(htmlUI);
});

// ADVANCED NETWORK BINDING FIX: Bind to 0.0.0.0 explicitly for Hugging Face Docker stability
app.listen(port, '0.0.0.0', () => {
    console.log(`🌐 Server running securely on port ${port}`);
});

// Export for other files to use
module.exports = { client, admin };
