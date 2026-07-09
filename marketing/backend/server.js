const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js'); // 🛠️ FIX 1: Changed 'Const' to 'const'
const admin = require('firebase-admin');
const express = require('express');
const fs = require('fs');
const path = require('path');

// 🛠️ FIX 2: Gracefully handle dotenv for Hugging Face compatibility
try {
    require('dotenv').config(); // Ensure dotenv is loaded for process.env.PHONE locally
} catch (e) {
    console.log("ℹ️ 'dotenv' module not found. Relying on native environment variables (Hugging Face Secrets).");
}

// FORCE ENTIRE SERVER NATIVELY INTO INDIAN STANDARD TIME (IST)
process.env.TZ = "Asia/Kolkata";

// =========================================================
// 📱 CONFIGURE YOUR WHATSAPP NUMBER HERE 
// Securely pulling from environment variables / Hugging Face Secrets.
// =========================================================
const LINKING_PHONE_NUMBER = process.env.PHONE;

if (!LINKING_PHONE_NUMBER) {
    console.error("⚠️ [CRITICAL WARNING] 'PHONE' secret is missing! Pairing code will fail to generate. Please add the PHONE secret in your environment settings.");
}

// ---------------------------------------------------------
// PRODUCTION FIX: GLOBAL ERROR HANDLERS
// Prevents background library errors (like "auth timeout") from crashing the app
// ---------------------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [CRITICAL] Background Promise Rejection caught:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('⚠️ [CRITICAL] Background Exception caught:', error);
});

// ---------------------------------------------------------
// 1. FIREBASE & EXPRESS WEB SERVER SETUP
// ---------------------------------------------------------
// Initialize Firebase (Ensure you have your service account JSON in the root folder or as a Secret)
let serviceAccount;

if (process.env.FIREBASE_CREDENTIALS) {
    // Attempt 1: Load from Hugging Face Secrets (Production)
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        console.log("🔒 Firebase Credentials loaded securely from secrets.");
    } catch (err) {
        console.error("❌ ERROR: Your FIREBASE_CREDENTIALS secret is not valid JSON.");
        process.exit(1);
    }
} else {
    // Attempt 2: Load from local file (Local Testing)
    try {
        serviceAccount = require('./serviceAccountKey.json');
        console.log("⚠️ Firebase Credentials loaded from local file.");
    } catch (err) {
        console.error("❌ FATAL ERROR: No Firebase credentials found! Please add the FIREBASE_CREDENTIALS secret in Hugging Face Settings.");
        process.exit(1);
    }
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Initialize Express for the Web Dashboard
const app = express();
const PORT = process.env.PORT || 7860;

let isGeneratingNewCode = false; // Tracks if a manual code refresh was just triggered

// --- NEW API ENDPOINT: Force WA Client Restart for Fresh Code ---
app.post('/api/refresh-code', async (req, res) => {
    try {
        isGeneratingNewCode = true; 
        console.log("🔄 Manual client restart requested for a fresh pairing code...");
        try {
            await client.destroy();
        } catch(e) {
            // Ignore if already dead
        }
        
        if (fs.existsSync('pairing-code.txt')) {
            fs.unlinkSync('pairing-code.txt');
        }
        
        // Wait 2 seconds for clean destruction before booting up again
        setTimeout(startWhatsAppClient, 2000);
        res.json({ success: true });
    } catch (error) {
        console.error("Failed to refresh code:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- NEW API ENDPOINT: Smart status checking ---
app.get('/api/pairing-status', (req, res) => {
    const codePath = path.join(__dirname, 'pairing-code.txt');
    const sessionPath = path.join(__dirname, 'whatsapp-session');
  
    if (fs.existsSync(codePath)) {
        isGeneratingNewCode = false; 
        res.json({ ready: true, code: fs.readFileSync(codePath, 'utf8'), linked: false });
    } else {
        if (isGeneratingNewCode) {
            res.json({ ready: false, linked: false });
        } 
        else if (fs.existsSync(sessionPath)) {
            res.json({ ready: false, linked: true });
        } 
        else {
            res.json({ ready: false, linked: false });
        }
    }
});

// --- ROOT WEBPAGE TO VIEW PAIRING CODE (DARK THEME REAL-TIME UI) ---
app.get('/', (req, res) => {
    const displayPhone = LINKING_PHONE_NUMBER || '918925730217';
    const htmlTemplate = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>WhatsApp Device Link - Meena Marketing</title>
        <style>
            body {
                margin: 0; padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: #0b111a;
                color: #e9edef;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                min-height: 100vh;
            }
            .container {
                background-color: #131b26; padding: 40px 25px;
                border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                border: 1px solid #1e293b;
                text-align: center; max-width: 400px; width: 85%;
                box-sizing: border-box;
            }
            h2 { 
                color: #10b981;
                margin-top: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;
            }
            p { color: #94a3b8; font-size: 15px; line-height: 1.5; margin-bottom: 30px; }
            .code-container {
                background: #0b111a; padding: 20px; border-radius: 12px;
                display: inline-block; margin-bottom: 25px; border: 1px solid #1e293b;
                width: 100%;
                box-sizing: border-box;
            }
            .code-container h1 {
                color: #10b981; font-size: 40px; letter-spacing: 8px; 
                margin: 0; user-select: all; cursor: pointer;
                word-break: break-all;
            }
            .btn {
                background-color: #10b981; color: #0b111a;
                border: none; padding: 14px 24px; border-radius: 24px;
                font-weight: 700; font-size: 15px; cursor: pointer;
                transition: background 0.2s; width: 100%; margin-bottom: 12px;
                box-sizing: border-box;
            }
            .btn:active { background-color: #059669; }
            .btn-secondary {
                background-color: transparent; color: #10b981;
                border: 1px solid #10b981; padding: 14px 24px; border-radius: 24px;
                font-weight: 700; font-size: 15px; cursor: pointer;
                transition: all 0.2s; width: 100%; margin-bottom: 12px; box-sizing: border-box;
            }
            .btn-secondary:active { background-color: rgba(16, 185, 129, 0.1); }
            .btn:disabled, .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
            .loader {
                border: 4px solid #1e293b; border-top: 4px solid #10b981;
                border-radius: 50%; width: 45px; height: 45px;
                animation: spin 1s linear infinite; margin: 0 auto 25px;
            }
            .footer { margin-top: 25px; font-size: 12px; color: #64748b; font-weight: 500;}
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            
            /* Success Animation */
            .success-icon {
                font-size: 60px; margin-bottom: 15px; display: inline-block;
                animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            .pulse { display: inline-block; width: 18px; height: 18px; background-color: #10b981; border-radius: 50%; box-shadow: 0 0 0 rgba(16, 185, 129, 0.4); animation: pulse 2s infinite; vertical-align: middle; margin-right: 8px; }
            @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); } 70% { box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); } 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); } }
            @keyframes popIn { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>Meena Marketing Server</h2>
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
                    <p>Open WhatsApp on your primary phone <b>(+${displayPhone})</b>. Tap the notification and enter the code below to link the system.</p>
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
                            // Session connected
                            if (currentState !== 'LINKED') {
                                currentState = 'LINKED';
                                container.innerHTML = \`
                                    <div class="success-icon">✅</div>
                                    <p style="color: #10b981; font-weight: bold; font-size: 22px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center;"><span class="pulse"></span> Online</p>
                                    <p>Meena Marketing WhatsApp Server is securely connected and actively listening.</p>
                                    <button class="btn-secondary" style="margin-top: 15px;" onclick="forceNewCode()">🔄 Re-Link Device</button>
                                \`;
                            }
                        } else {
                            // Booting up
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
                        setTimeout(checkStatus, 2500); 
                    });
            }
            checkStatus();
        </script>
    </body>
    </html>
    `;
    res.send(htmlTemplate);
});

// PRODUCTION FIX: Catch Express binding errors
app.listen(PORT, () => {
    console.log(`🌐 Web Dashboard running on port ${PORT}`);
}).on('error', (err) => {
    console.error('⚠️ [CRITICAL] Express Server Error:', err);
});

// ---------------------------------------------------------
// 2. WHATSAPP CLIENT & MEMORY GUARD
// ---------------------------------------------------------
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
    authTimeoutMs: 0, 
    puppeteer: {
        timeout: 0,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--ignore-certificate-errors',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--proxy-server="direct://"', 
            '--proxy-bypass-list=*', 
            '--disable-features=NetworkService',
            '--js-flags="--max-old-space-size=512"',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    }
});

client.on('qr', async (qr) => {
    console.log('🔄 Authentication required. Requesting pairing code...');
    
    try {
        const sanitizedPhoneNumber = LINKING_PHONE_NUMBER ? LINKING_PHONE_NUMBER.replace(/\D/g, '') : '';
        
        if (!sanitizedPhoneNumber) {
            throw new Error("Phone number is undefined or empty after sanitization.");
        }

        const pairingCode = await client.requestPairingCode(sanitizedPhoneNumber);
        
        console.log('====================================================');
        console.log(`🔢 SUCCESS: Pairing code generated: ${pairingCode}`);
        console.log('====================================================');
        
        fs.writeFileSync('pairing-code.txt', pairingCode);
        
    } catch (err) {
        console.error('❌ Failed to request pairing code:', err.message);
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp is ready!');
    if (fs.existsSync('pairing-code.txt')) {
        fs.unlinkSync('pairing-code.txt');
    }
});

// Memory Guard: Prevents Hugging Face OOM Crashes
setInterval(async () => {
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memoryUsage > 450) {
        console.log(`⚠️ High Memory Detected (${Math.round(memoryUsage)}MB). Purging message cache...`);
        if (client.pupPage) {
            await client.pupPage.evaluate(() => {
                if (window.Store && window.Store.Msg) window.Store.Msg.clear();
            }).catch(() => {});
        }
    }
}, 300000); // 5 minutes

// ---------------------------------------------------------
// 3. CORE UTILITIES & DUAL ADMIN SETUP
// ---------------------------------------------------------
const serverStartTime = new Date();
const sleep = (ms) => new Promise(res => setTimeout(res, ms)); // ENTERPRISE FIX: Global sleep utility for WhatsApp DOM delays

let currentAdminPhone1 = null;
let currentAdminPhone2 = null;
let currentAdminPhone3 = null;
let currentShopPhone = null;
let admin1AlertsEnabled = true; // MEMORY CACHE GUARD: Keeps track of admin 1 sales alerts toggles with 0 continuous database reads

// Fetch admins on boot
async function fetchAdminPhone() {
    try { // PRODUCTION FIX: Added try/catch for database fetch
        const docSnap = await db.collection('system_folder').doc('config').get();
        if (docSnap.exists) {
            const data = docSnap.data();
            // Support legacy 'adminPhone' field for Admin 1 backward compatibility
            currentAdminPhone1 = data.adminPhone1 || data.adminPhone || null;
            currentAdminPhone2 = data.adminPhone2 || null;
            currentAdminPhone3 = data.adminPhone3 || null;
            currentShopPhone = data.shopPhone || null;
            
            // Sync active state from DB on boot up
            if (data.admin1AlertsEnabled !== undefined) {
                admin1AlertsEnabled = data.admin1AlertsEnabled;
            }
            
            console.log(`👑 Admin 1 Phone Loaded: ${currentAdminPhone1 || 'Not Set'} (Sales Alert State: ${admin1AlertsEnabled ? 'ACTIVE' : 'MUTED'})`);
            console.log(`👑 Admin 2 Phone Loaded: ${currentAdminPhone2 || 'Not Set'}`);
            console.log(`👑 Admin 3 Phone Loaded: ${currentAdminPhone3 || 'Not Set'}`);
            console.log(`🏪 Shop Phone Loaded: ${currentShopPhone || 'Not Set'}`);
        }
    } catch (err) {
        console.error("⚠️ Failed to fetch admin phones on boot:", err);
    }
}
fetchAdminPhone();

// Smart Phone Number Formatter
function formatPhone(num) {
    if (!num) return null;
    let cleaned = String(num).replace(/[^0-9+]/g, ''); // PRODUCTION FIX: Forced String() cast to prevent .replace crash
    
    if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.substring(1); // Remove leading 0
    if (cleaned.length === 10) cleaned = '+91' + cleaned; // Add +91 to 10 digit numbers
    if (cleaned.length === 12 && cleaned.startsWith('91')) cleaned = '+' + cleaned; // Fix 91... to +91...
    
    // Final check for WhatsApp format
    if (cleaned.length === 13 && cleaned.startsWith('+91')) return cleaned;
    return null;
}

// ---------------------------------------------------------
// 4. INTERACTIVE BOT LISTENER (Admin Updates & Marketing Total)
// ---------------------------------------------------------
const waitingForAdminUpdate = {};

client.on('message', async (msg) => {
    try { // PRODUCTION FIX: Wrapped interactive bot handler to prevent unexpected failures bubbling up
        const input = msg.body.trim();
        const normalizedInput = input.toLowerCase();

        // -- ADMIN 1 REALTIME SALES TOGGLE FLOWS (HIGHLY OPTIMIZED WRITES) --
        if (normalizedInput === 'admin 1 off') {
            try {
                admin1AlertsEnabled = false;
                await db.collection('system_folder').doc('config').set({ admin1AlertsEnabled: false }, { merge: true });
                return msg.reply("📴 *Admin 1 Sales Alerts Suspended.*\nYou will no longer receive messaging alerts when a sales transaction is completed.");
            } catch (err) {
                console.error("Failed turning off Admin 1 sales notification configuration:", err);
                return msg.reply("⚠️ Error connecting to database.");
            }
        }

        if (normalizedInput === 'admin 1 on') {
            try {
                admin1AlertsEnabled = true;
                await db.collection('system_folder').doc('config').set({ admin1AlertsEnabled: true }, { merge: true });
                return msg.reply("🔔 *Admin 1 Sales Alerts Restored.*\nYou will now seamlessly receive real-time updates for newly generated invoices.");
            } catch (err) {
                console.error("Failed turning on Admin 1 sales notification configuration:", err);
                return msg.reply("⚠️ Error connecting to database.");
            }
        }

        // -- A. Change Admin 1 Flow --
        if (normalizedInput === 'change admin 1 number' || normalizedInput === 'change admin 1 phone number') {
            waitingForAdminUpdate[msg.from] = 1;
            return msg.reply("🛡️ *Admin 1 Configuration*\nPlease enter the new Admin 1 Mobile Number.\n_(Example: 98765 43210 or +91 9876543210)_");
        }

        // -- B. Change Admin 2 Flow --
        if (normalizedInput === 'change admin 2 number' || normalizedInput === 'change admin 2 phone number') {
            waitingForAdminUpdate[msg.from] = 2;
            return msg.reply("🛡️ *Admin 2 Configuration*\nPlease enter the new Admin 2 Mobile Number.\n_(Example: 98765 43210 or +91 9876543210)_");
        }

        // -- Change Admin 3 Flow --
        if (normalizedInput === 'change admin 3 number' || normalizedInput === 'change admin 3 phone number') {
            waitingForAdminUpdate[msg.from] = 3;
            return msg.reply("🛡️ *Admin 3 Configuration*\nPlease enter the new Admin 3 Mobile Number.\n_(Example: 98765 43210 or +91 9876543210)_");
        }

        // -- Change Shop Number Flow --
        if (normalizedInput === 'change shop number' || normalizedInput === 'change shop phone number') {
            waitingForAdminUpdate[msg.from] = 'shop';
            return msg.reply("🏪 *Shop Configuration*\nPlease enter the new Shop Mobile Number.\n_(Example: 98765 43210 or +91 9876543210)_");
        }

        // -- C. List Admins Flow --
        if (normalizedInput === 'list admin numbers' || normalizedInput === 'list admin phone number') {
            return msg.reply(`📋 *Current Admin Configuration*\n\n👑 *Admin 1:* ${currentAdminPhone1 || 'Not set'} (Alerts: ${admin1AlertsEnabled ? 'Enabled' : 'Muted'})\n👑 *Admin 2:* ${currentAdminPhone2 || 'Not set'}\n👑 *Admin 3:* ${currentAdminPhone3 || 'Not set'}\n🏪 *Shop:* ${currentShopPhone || 'Not set'}`);
        }

        // -- E. Remove Admin 1 Flow --
        if (normalizedInput === 'remove admin 1 number' || normalizedInput === 'remove admin 1 phone number') {
            try {
                // Clears both new adminPhone1 and legacy adminPhone to prevent fallback re-loads
                await db.collection('system_folder').doc('config').set({ adminPhone1: null, adminPhone: null }, { merge: true });
                currentAdminPhone1 = null;
                return msg.reply("🗑️ *Admin 1 Successfully Removed.*\nNo further alerts will be sent to this slot.");
            } catch (err) {
                console.error("Failed to remove admin 1:", err);
                return msg.reply("⚠️ Error updating database.");
            }
        }

        // -- F. Remove Admin 2 Flow --
        if (normalizedInput === 'remove admin 2 number' || normalizedInput === 'remove admin 2 phone number') {
            try {
                await db.collection('system_folder').doc('config').set({ adminPhone2: null }, { merge: true });
                currentAdminPhone2 = null;
                return msg.reply("🗑️ *Admin 2 Successfully Removed.*\nNo further alerts will be sent to this slot.");
            } catch (err) {
                console.error("Failed to remove admin 2:", err);
                return msg.reply("⚠️ Error updating database.");
            }
        }

        // -- Remove Admin 3 Flow --
        if (normalizedInput === 'remove admin 3 number' || normalizedInput === 'remove admin 3 phone number') {
            try {
                await db.collection('system_folder').doc('config').set({ adminPhone3: null }, { merge: true });
                currentAdminPhone3 = null;
                return msg.reply("🗑️ *Admin 3 Successfully Removed.*\nNo further alerts will be sent to this slot.");
            } catch (err) {
                console.error("Failed to remove admin 3:", err);
                return msg.reply("⚠️ Error updating database.");
            }
        }

        // -- Remove Shop Number Flow --
        if (normalizedInput === 'remove shop number' || normalizedInput === 'remove shop phone number') {
            try {
                await db.collection('system_folder').doc('config').set({ shopPhone: null }, { merge: true });
                currentShopPhone = null;
                return msg.reply("🗑️ *Shop Number Successfully Removed.*\nNo further alerts will be sent to this slot.");
            } catch (err) {
                console.error("Failed to remove shop number:", err);
                return msg.reply("⚠️ Error updating database.");
            }
        }

        // -- Process Admin Input --
        if (waitingForAdminUpdate[msg.from]) {
            const adminSlot = waitingForAdminUpdate[msg.from];
            const formattedNewNumber = formatPhone(input);
            
            if (!formattedNewNumber) {
                return msg.reply("❌ *Invalid Number Format.*\nPlease enter a valid 10-digit Indian number.");
            }

            try {
                if (adminSlot === 'shop') {
                    await db.collection('system_folder').doc('config').set({ shopPhone: formattedNewNumber }, { merge: true });
                    currentShopPhone = formattedNewNumber;
                    delete waitingForAdminUpdate[msg.from];
                    return msg.reply(`✅ *Shop Number Successfully Updated*\nAll future inquiry confirmations will be sent to:\n*${formattedNewNumber}*`);
                }

                // Overwrite specific database field to strictly prevent arrays/duplication
                const fieldName = adminSlot === 1 ? 'adminPhone1' : (adminSlot === 2 ? 'adminPhone2' : 'adminPhone3');
                await db.collection('system_folder').doc('config').set({ [fieldName]: formattedNewNumber }, { merge: true });
                
                if (adminSlot === 1) {
                    currentAdminPhone1 = formattedNewNumber;
                } else if (adminSlot === 2) {
                    currentAdminPhone2 = formattedNewNumber;
                } else {
                    currentAdminPhone3 = formattedNewNumber;
                }
                
                delete waitingForAdminUpdate[msg.from];
                
                return msg.reply(`✅ *Admin ${adminSlot} Successfully Updated*\nAll future billing alerts will be sent to:\n*${formattedNewNumber}*`);
            } catch (err) {
                console.error("Failed to update admin:", err);
                return msg.reply("⚠️ Error updating database.");
            }
        }

        // -- D. Marketing Total Flow --
        if (normalizedInput === 'marketing total') {
            // Optional: Ensure only an admin can check totals
            // const isAuth = (currentAdminPhone1 && msg.from === currentAdminPhone1 + '@c.us') || (currentAdminPhone2 && msg.from === currentAdminPhone2 + '@c.us');
            // if (!isAuth) return;

            await msg.reply("📊 _Calculating today's sales..._");
            
            try {
                const today = new Date();
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

                const q = await db.collection('sellings')
                    .where('date', '>=', startOfDay)
                    .where('date', '<=', endOfDay)
                    .get();

                let cashTotal = 0;
                let onlineTotal = 0;
                let grandTotal = 0;
                let count = 0;

                q.forEach(doc => {
                    const data = doc.data();
                    const total = data.totals?.grand || 0;
                    const mode = (data.paymentMode || data.paymentMethod || 'Cash').toLowerCase();
                    
                    grandTotal += total;
                    count++;

                    if (mode === 'online') onlineTotal += total;
                    else cashTotal += total;
                });

                const summaryMsg = `📈 *MEENA MARKETING - DAILY SUMMARY*\n📅 ${today.toLocaleDateString('en-IN')}\n\n🧾 *Total Invoices:* ${count}\n💵 *Cash Sales:* ₹${cashTotal.toLocaleString()}\n📱 *Online Sales:* ₹${onlineTotal.toLocaleString()}\n\n🏆 *GRAND TOTAL: ₹${grandTotal.toLocaleString()}*`;
                
                return msg.reply(summaryMsg);

            } catch (error) {
                console.error("Sales Calculation Error:", error);
                return msg.reply("⚠️ Could not fetch sales data right now.");
            }
        }
    } catch (globalMsgError) {
        console.error("⚠️ [CRITICAL] Unhandled error in bot message listener:", globalMsgError);
    }
});

// ---------------------------------------------------------
// 5. REAL-TIME BILLING TRIGGER (From Firebase)
// ---------------------------------------------------------
// FIX APPLIED HERE: Added .where('createdAt', '>=', serverStartTime) to prevent massive boot-up read leak
// PRODUCTION FIX: Added Firebase error callback attached to snapshot
db.collection('sellings').where('createdAt', '>=', serverStartTime).onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
        // Only process newly added bills
        if (change.type === 'added') {
            const billData = change.doc.data();
            
            // Prevent processing old bills on server restart
            if (billData.createdAt && billData.createdAt.toDate() < serverStartTime) return;
            
            const invNo = billData.invoiceNo || 'N/A';
            const grandTotal = billData.totals?.grand || 0;
            const payMode = billData.paymentMode || 'Cash';
            let dateStr = billData.date ? billData.date.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN');

            // --- A. TEXT ADMIN ALERT (Sent to ALL Active Admins) ---
            // RE-ENGINEERED LINE FOR ZERO READ SAVINGS: Admin 1 added only if memory variable admin1AlertsEnabled is true
            const activeAdmins = [];
            if (currentAdminPhone1 && admin1AlertsEnabled) activeAdmins.push(currentAdminPhone1);
            if (currentAdminPhone2) activeAdmins.push(currentAdminPhone2);
            if (currentAdminPhone3) activeAdmins.push(currentAdminPhone3);
            
            if (activeAdmins.length > 0) {
                // Build the item list text dynamically for the admin
                let itemListText = '';
                if (billData.items && Array.isArray(billData.items)) {
                    billData.items.forEach(item => {
                        const modelText = item.model ? ` (Model: ${item.model})` : '';
                        itemListText += `- ${item.qty}x ${item.name}${modelText}\n`;
                    });
                }

                const adminAlert = `🚨 *NEW SALE ALERT*\n\n📄 *Invoice:* ${invNo}\n👤 *Customer:* ${billData.customer?.name || 'Cash Customer'}\n🛍️ *Purchased Items:*\n${itemListText}💰 *Amount:* ₹${grandTotal.toLocaleString()}\n💳 *Mode:* ${payMode}\n\n_Meena Marketing Backend_`;
                
                // Loop through all registered admins and send
                for (const adminPhone of activeAdmins) {
                    let messageToSend = adminAlert;

                    // Apply conversational, precise Tamil formatting exclusively for Admin 2 and Admin 3
                    if (adminPhone === currentAdminPhone2 || adminPhone === currentAdminPhone3) {
                        const tamilNumbers = {
                            1: 'ஒன்று', 2: 'இரண்டு', 3: 'மூன்று', 4: 'நான்கு', 5: 'ஐந்து',
                            6: 'ஆறு', 7: 'ஏழு', 8: 'எட்டு', 9: 'ஒன்பது', 10: 'பத்து'
                        };

                        let parsedItemText = '';
                        if (billData.items && Array.isArray(billData.items) && billData.items.length > 0) {
                            if (billData.items.length === 1) {
                                const item = billData.items[0]; // FIX APPLIED HERE
                                const pName = item.name || 'பொருள்';
                                const pQty = parseInt(item.qty) || 1;
                                const qtyInTamil = tamilNumbers[pQty] || pQty.toString();
                                
                                parsedItemText = `${pName} ${qtyInTamil}`;
                            } else {
                                let parts = [];
                                billData.items.forEach((item) => {
                                    const pName = item.name || 'பொருள்';
                                    const pQty = parseInt(item.qty) || 1;
                                    const qtyInTamil = tamilNumbers[pQty] || pQty.toString();
                                    parts.push(`${pName} ${qtyInTamil}`);
                                });
                                const lastPart = parts.pop();
                                parsedItemText = parts.join(', ') + ', மற்றும் ' + lastPart;
                            }
                        } else {
                            parsedItemText = 'பொருட்கள்';
                        }

                        // Exact conversational format requested by user
                        messageToSend = `கடையில், ${parsedItemText}, ரூ ${grandTotal.toLocaleString()}-க்கு விற்பனை ஆகி உள்ளது`;
                    }

                    // ENTERPRISE FIX: Added getNumberId check & initialization fallback to fix findChat: @lid crashes
                    // PRODUCTION FIX: Forced String typing to guarantee regex success
                    const adminPlainPhone = adminPhone ? String(adminPhone).replace(/\D/g, '') : '';
                    try {
                        await sleep(2000); // Give DOM time to process
                        const adminContactId = await client.getNumberId(adminPlainPhone);
                        const verifiedAdminId = adminContactId ? adminContactId._serialized : `${adminPlainPhone}@c.us`;
                        
                        try {
                            await client.sendMessage(verifiedAdminId, messageToSend);
                        } catch (adminSendErr) {
                            if (adminSendErr.message && (adminSendErr.message.includes('findChat') || adminSendErr.message.includes('@lid') || adminSendErr.message.includes('not found'))) {
                                console.log(`⚠️ Applying initialization workaround for Admin chat: ${verifiedAdminId}`);
                                await client.sendMessage(verifiedAdminId, `🚨 Syncing Admin Alert Channel...`);
                                await sleep(2000);
                                await client.sendMessage(verifiedAdminId, messageToSend);
                            } else {
                                throw adminSendErr;
                            }
                        }
                    } catch (e) {
                        console.log(`Failed to send admin alert to ${adminPhone} Error:`, e.message);
                    }
                }
            }

            // --- B. CUSTOMER RECEIPT (Image + Text) ---
            const rawCustPhone = billData.customer?.phone;
            const formattedCustPhone = formatPhone(rawCustPhone);

            if (formattedCustPhone) {
                // FIX: Strip ALL non-numeric characters (including the '+' symbol)
                // PRODUCTION FIX: Enforced String conversion mapping
                const plainPhone = String(formattedCustPhone).replace(/\D/g, '');
                
                try {
                    // ENTERPRISE FIX: Brief delay before querying to ensure stability
                    await sleep(1500); 
                    // Check if customer is actually on WhatsApp (Using getNumberId prevents the @lid / findChat bug)
                    const contactId = await client.getNumberId(plainPhone);
                    
                    if (contactId) {
                        // Use the exact verified ID from WhatsApp's database
                        const verifiedWhatsappId = contactId._serialized;
                        
                        // 1. Generate Receipt Image
                        const imageBuffer = await generateReceiptImage(client, billData);
                        const receiptMedia = new MessageMedia('image/png', imageBuffer.toString('base64'), `Receipt_${invNo}.png`);
                        
                        // 2. Bilingual Caption with Powered By Branding
                        const receiptCaption = `🎉 *Thank you for shopping at Meena Marketing!*\n📄 Bill No: *${invNo}*\n💰 Total Amount: *₹${grandTotal.toLocaleString()}*\n📅 Date: ${dateStr}\n\n🎉 *மீனா மார்க்கெட்டிங்கில் பொருட்கள் வாங்கியமைக்கு நன்றி!*\n📄 பில் எண்: *${invNo}*\n💰 மொத்த தொகை: *₹${grandTotal.toLocaleString()}*\n📅 தேதி: ${dateStr}\n\n_System Generated Receipt_\n⚡ *Powered by Goorac*`;
                        
                        // 3. Dynamic Thank You Image Generation (Cache Busting Enforced)
                        const thankYouUrl = `https://huggingface.co/datasets/corporationgoorac/marketingVoice/resolve/main/image.png?t=${Date.now()}`;
                        let thankYouMedia;
                        try {
                            thankYouMedia = await MessageMedia.fromUrl(thankYouUrl, { unsafeMime: true });
                        } catch (imgErr) {
                            console.error("⚠️ Failed to fetch dynamic thank you image:", imgErr.message);
                        }
                        
                        // 4. Bilingual Thank You Caption with Powered By Branding
                        const thankYouCaption = `🎉 *Thank you for choosing Meena Marketing!*\n🎉 *மீனா மார்க்கெட்டிங்கைத் தேர்ந்தெடுத்ததற்கு நன்றி!*\n\n⚡ _Powered by Goorac_`;

                        try {
                            // Attempt 1: Try sending media directly (Works normally for existing chats)
                            await client.sendMessage(verifiedWhatsappId, receiptMedia, { caption: receiptCaption });
                            console.log(`✅ Sent receipt to customer for ${invNo}`);
                            
                            // Human-like pause before sending the Thank You Flyer
                            if (thankYouMedia) {
                                await sleep(2000); 
                                await client.sendMessage(verifiedWhatsappId, thankYouMedia, { caption: thankYouCaption });
                                console.log(`✅ Sent Thank You image to customer for ${invNo}`);
                            }

                        } catch (sendErr) {
                            // Attempt 2: Fallback for 'findChat' / '@lid' multi-device bug
                            if (sendErr.message && (sendErr.message.includes('findChat') || sendErr.message.includes('@lid') || sendErr.message.includes('not found'))) {
                                console.log(`⚠️ Applying initialization workaround for new chat: ${verifiedWhatsappId}`);
                                
                                // Send text first to initialize chat session in cache safely
                                await client.sendMessage(verifiedWhatsappId, `🛍️ Processing your receipt for Invoice: ${invNo}...`);
                                
                                // Brief delay to ensure cache is updated locally
                                await sleep(1500);
                                
                                // Retry sending the Receipt Image
                                await client.sendMessage(verifiedWhatsappId, receiptMedia, { caption: receiptCaption });
                                console.log(`✅ Sent receipt to customer for ${invNo} (after initialization)`);
                                
                                // Retry sending the Thank You Flyer with a human-like pause
                                if (thankYouMedia) {
                                    await sleep(2000); 
                                    await client.sendMessage(verifiedWhatsappId, thankYouMedia, { caption: thankYouCaption });
                                    console.log(`✅ Sent Thank You image to customer for ${invNo} (after initialization)`);
                                }
                                
                            } else {
                                throw sendErr; // Re-throw if it's a different unknown error
                            }
                        }
                    } else {
                        console.log(`⚠️ Number ${formattedCustPhone} is not registered on WhatsApp. Skipped.`);
                    }
                } catch (err) {
                    console.error("Error sending customer receipt:", err);
                }
            } else {
                console.log(`ℹ️ Bill ${invNo} saved with no valid customer phone. Admin alerted.`);
            }
        }
    });
}, (error) => {
    // PRODUCTION FIX: Catch Firestore network drop errors natively
    console.error('🔥 [FATAL] Firestore Sellings Snapshot Error:', error);
});

// ---------------------------------------------------------
// 5B. REAL-TIME PRODUCT INQUIRY TRIGGER ("ASK" HOOK)
// ---------------------------------------------------------
// RE-ENGINEERED OPTIMIZATION: Listens directly to the specialized single document path to incur exactly 1 database read operation.
db.collection('ask').doc('ask').onSnapshot(async (docSnap) => {
    if (!docSnap.exists) return;
    const askData = docSnap.data();

    // PRODUCTION BUG FIX: Safely handles Firestore Timestamp objects, ISO string formats, or native Javascript Dates gracefully.
    let clickedDate = null;
    if (askData.clickedTime) {
        clickedDate = typeof askData.clickedTime.toDate === 'function' ? askData.clickedTime.toDate() : new Date(askData.clickedTime);
    }

    // Prevent dispatching historical clicks when server starts or reloads natively
    if (clickedDate && clickedDate < serverStartTime) return;

    if (!currentAdminPhone1) {
        console.log("⚠️ Product inquiry received but Admin 1 phone number is unset. Dispatch aborted.");
        return;
    }

    const prodName = askData.name || 'N/A';
    const prodModel = askData.model || 'N/A';
    const prodBase = askData.basePrice || askData.price || 0;
    const prodMrp = askData.mrp || 0;
    const prodMyRate = askData.myRate || 0;
    const prodQty = askData.qty || 0;

    // High Contrast, crisp Unicode layout with MY RATE dynamically highlighted
    const inquiryMessage = `📦 *PRODUCT INQUIRY ALERT*
━━━━━━━━━━━━━━━━━━
🔹 *Item:* ${prodName}
🔖 *Model:* ${prodModel}
📦 *Stock Qty:* ${prodQty}

💰 *Base Price:* Rs. ${prodBase.toLocaleString()}
🏷️ *MRP:* Rs. ${prodMrp.toLocaleString()}
⭐ *MY RATE:* Rs. ${prodMyRate.toLocaleString()} 👈

━━━━━━━━━━━━━━━━━━
_Meena Marketing Internal_`;

    // PRODUCTION FIX: String Cast
    const adminPlainPhone = currentAdminPhone1 ? String(currentAdminPhone1).replace(/\D/g, '') : '';
    try {
        await sleep(1500); // Give DOM processes safe settling execution margins
        const adminContactId = await client.getNumberId(adminPlainPhone);
        const verifiedAdminId = adminContactId ? adminContactId._serialized : `${adminPlainPhone}@c.us`;

        try {
            await client.sendMessage(verifiedAdminId, inquiryMessage);
            console.log(`✅ Inquiry details for "${prodName}" dispatched successfully to Admin 1.`);
        } catch (sendErr) {
            if (sendErr.message && (sendErr.message.includes('findChat') || sendErr.message.includes('@lid') || sendErr.message.includes('not found'))) {
                console.log(`⚠️ Applying path initialization workaround for Inquiry alert Channel...`);
                await client.sendMessage(verifiedAdminId, `🔎 Syncing Product Inquiry Stream...`);
                await sleep(1500);
                await client.sendMessage(verifiedAdminId, inquiryMessage);
            } else {
                throw sendErr;
            }
        }
    } catch (err) {
        console.error("Error processing text delivery for product inquiry alert stream:", err.message);
    }

    // --- NEW: SHOP INQUIRY CONFIRMATION DISPATCH ---
    if (currentShopPhone) {
        let shopInquiryMessage = "";

        const parsedBasePrice = parseFloat(prodBase) || 0;
        const parsedMyRate = parseFloat(prodMyRate) || 0;

        // Smart AI Calculator Logic
        if (!parsedMyRate || parsedMyRate <= 0 || parsedMyRate >= parsedBasePrice) {
            // Safety Net Fallback
            shopInquiryMessage = `✅ *INQUIRY CONFIRMATION*
━━━━━━━━━━━━━━━━━━
🔹 *Product:* ${prodName}
🔖 *Model:* ${prodModel}
📦 *Stock Qty:* ${prodQty}

_Request has been successfully dispatched to Admin._`;
        } else {
            // Context-Aware Discount Calculation
            const profit = parsedBasePrice - parsedMyRate;
            
            // 1. Tiered Target Discount
            let targetDiscount = 0;
            if (parsedBasePrice < 3000) {
                targetDiscount = parsedBasePrice * 0.04; // 4%
            } else if (parsedBasePrice <= 10000) {
                targetDiscount = parsedBasePrice * 0.025; // 2.5%
            } else {
                targetDiscount = parsedBasePrice * 0.015; // 1.5%
            }

            // Absolute Cap Check
            if (targetDiscount > 500) {
                targetDiscount = 500;
            }

            // 2. Profit Shield (Max 15% of actual profit)
            const profitShield = profit * 0.15;

            // 3. Final Calculation & Margin Protection
            let maxAllowedDiscount = Math.min(targetDiscount, profitShield);
            maxAllowedDiscount = Math.floor(maxAllowedDiscount); // Safely round down
            
            const bottomPrice = parsedBasePrice - maxAllowedDiscount;

            shopInquiryMessage = `✅ *INQUIRY LOGGED & ANALYZED*
━━━━━━━━━━━━━━━━━━
🔹 *Product:* ${prodName}
🔖 *Model:* ${prodModel}
📦 *Stock Qty:* ${prodQty}

💰 *Standard Price:* Rs. ${parsedBasePrice.toLocaleString()}
🟢 *Max AI Discount Allowed:* Rs. ${maxAllowedDiscount.toLocaleString()}
🛑 *Absolute Bottom Price:* Rs. ${bottomPrice.toLocaleString()}

_Request has been successfully dispatched to Admin for final review if further negotiation is needed._`;
        }

        // PRODUCTION FIX: String Cast
        const shopPlainPhone = currentShopPhone ? String(currentShopPhone).replace(/\D/g, '') : '';
        try {
            await sleep(1500); // Give DOM processes safe settling execution margins
            const shopContactId = await client.getNumberId(shopPlainPhone);
            const verifiedShopId = shopContactId ? shopContactId._serialized : `${shopPlainPhone}@c.us`;

            try {
                await client.sendMessage(verifiedShopId, shopInquiryMessage);
                console.log(`✅ Inquiry confirmation dispatched successfully to the Shop number.`);
            } catch (sendErr) {
                if (sendErr.message && (sendErr.message.includes('findChat') || sendErr.message.includes('@lid') || sendErr.message.includes('not found'))) {
                    console.log(`⚠️ Applying path initialization workaround for Shop alert Channel...`);
                    await client.sendMessage(verifiedShopId, `🔎 Syncing Shop Alert Stream...`);
                    await sleep(1500);
                    await client.sendMessage(verifiedShopId, shopInquiryMessage);
                } else {
                    throw sendErr;
                }
            }
        } catch (err) {
            console.error("Error processing text delivery for shop confirmation stream:", err.message);
        }
    }
}, (error) => {
    // PRODUCTION FIX: Catch Firestore Ask network drop errors natively
    console.error('🔥 [FATAL] Firestore Ask Snapshot Error:', error);
});

// ---------------------------------------------------------
// 5C. REAL-TIME INVENTORY REDUCTION ALERT (ZERO-WASTE READS)
// ---------------------------------------------------------
db.collection('alerts').doc('stock_reduction').onSnapshot(async (docSnap) => {
    if (!docSnap.exists) return;
    const alertData = docSnap.data();

    let editTime = null;
    if (alertData.lastUpdated) {
        editTime = new Date(alertData.lastUpdated);
    }

    // Prevent firing old alerts on server boot
    if (editTime && editTime < serverStartTime) return;

    if (!currentAdminPhone1) {
        console.log("⚠️ Stock reduction alert received but Admin 1 phone number is unset. Dispatch aborted.");
        return;
    }

    const prodName = alertData.name || 'N/A';
    const prodModel = alertData.model || 'N/A';
    const oldQty = alertData.previousQty || 0;
    const newQty = alertData.qty || 0;
    const reducedBy = oldQty - newQty;
    const prodPrice = alertData.price || 0;
    const staffName = alertData.lastEditBy || 'Unknown Staff';
    const editReason = alertData.lastEditReason || 'No reason provided';

    // 12-hour format time string
    let timeString = "Unknown Time";
    if (editTime) {
        timeString = editTime.toLocaleString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true,
            day: '2-digit', month: 'short', year: 'numeric'
        });
    }

    // Perfect WhatsApp Message
    const alertMessage = `📉 *STOCK REDUCTION ALERT*
━━━━━━━━━━━━━━━━━━
📦 *Product:* ${prodName}
🔖 *Model:* ${prodModel}
💰 *Base Price:* Rs. ${prodPrice.toLocaleString()}

📉 *Stock Change:* ${oldQty} ➔ ${newQty} (-${reducedBy})
👤 *Edited By:* ${staffName}
⏱️ *Time:* ${timeString}

🚨 *Reason:* _*${editReason}*_
━━━━━━━━━━━━━━━━━━
_Meena Marketing Security_`;

    // Send to Admin 1 bypassing sales mute
    const adminPlainPhone = currentAdminPhone1 ? String(currentAdminPhone1).replace(/\D/g, '') : '';
    try {
        await sleep(1500); // DOM margin delay
        const adminContactId = await client.getNumberId(adminPlainPhone);
        const verifiedAdminId = adminContactId ? adminContactId._serialized : `${adminPlainPhone}@c.us`;
        
        try {
            await client.sendMessage(verifiedAdminId, alertMessage);
            console.log(`✅ Stock reduction alert sent to Admin 1 for "${prodName}"`);
        } catch (sendErr) {
            // Multi-device sync fallback (Initialization workaround)
            if (sendErr.message && (sendErr.message.includes('findChat') || sendErr.message.includes('@lid') || sendErr.message.includes('not found'))) {
                console.log(`⚠️ Applying path initialization workaround for Stock Alert Channel...`);
                await client.sendMessage(verifiedAdminId, `🔎 Syncing Inventory Alert Stream...`);
                await sleep(1500);
                await client.sendMessage(verifiedAdminId, alertMessage);
            } else {
                throw sendErr;
            }
        }
    } catch (err) {
        console.error("Error sending stock reduction alert:", err.message);
    }
}, (error) => {
    console.error('🔥 [FATAL] Firestore Stock Alert Snapshot Error:', error);
});

// ---------------------------------------------------------
// 6. PUPPETEER IMAGE GENERATOR (Redesigned & Overlap Fixed)
// ---------------------------------------------------------
async function generateReceiptImage(client, data) {
    // PRODUCTION FIX: Ensure browser state is fully active to prevent node crashes
    if (!client || !client.pupBrowser) {
        throw new Error("Puppeteer browser not initialized yet. Cannot generate image.");
    }
    
    const page = await client.pupBrowser.newPage(); 
    await page.setViewport({ width: 600, height: 800 }); // Compact Receipt Size

    // Randomize Template
    const isLightMode = Math.random() < 0.5;

    // Theme Variables
    const themeVars = isLightMode ? `
        --bg-body: #f3f4f6;
        --bg-card: #ffffff;
        --border-color: #e5e7eb;
        --border-dashed: #d1d5db;
        --text-main: #111827;
        --text-muted: #6b7280;
        --brand-color: #dc2626;
        --shadow: 0 10px 40px rgba(0,0,0,0.08);
        --meta-bg: #f8fafc;
        --tag-bg: #2563eb;
        --tag-text: #ffffff;
        --total-color: #059669;
    ` : `
        --bg-body: #000000;
        --bg-card: #0f0f11;
        --border-color: #27272a;
        --border-dashed: #3f3f46;
        --text-main: #ffffff;
        --text-muted: #a1a1aa;
        --brand-color: #ef4444;
        --shadow: 0 10px 40px rgba(0,0,0,0.8);
        --meta-bg: #18181b;
        --tag-bg: #3b82f6;
        --tag-text: #ffffff;
        --total-color: #10b981;
    `;

    // FIX: Replaced '₹' with 'Rs.' so standard English font letters are used. This 100% prevents the overlapping issue on Linux Headless servers.
    const itemsHtml = (data.items || []).map(item => {
        const modelHtml = item.model ? `<div style="color:var(--text-muted); font-size:11px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width: 100%;">Model: ${item.model}</div>` : '';
        return `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:15px; margin-bottom:12px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
            <div style="flex: 1; min-width: 0; word-break: break-word; overflow-wrap: break-word;">
                <div style="font-weight:700; font-size:16px; line-height:1.4; color: var(--text-main);">${item.name}</div>
                ${modelHtml}
                <div style="color:var(--text-muted); font-size:13px; margin-top:4px;">${item.qty} x Rs. ${(item.price || 0).toLocaleString()}</div>
            </div>
            <div style="font-weight:700; font-size:16px; white-space:nowrap; text-align:right; min-width:80px; color: var(--text-main);">Rs. ${(item.finalTotal || 0).toLocaleString()}</div>
        </div>
        `;
    }).join('');

    const htmlContent = `
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Noto+Sans+Tamil:wght@400;700&display=swap');
            
            :root {
                ${themeVars}
            }

            body { 
                background: var(--bg-body); color: var(--text-main); 
                font-family: 'Inter', 'Noto Sans Tamil', sans-serif; 
                padding: 30px; margin: 0; box-sizing: border-box;
            }
            .receipt-card {
                background: var(--bg-card);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 30px;
                box-shadow: var(--shadow);
            }
            .header { text-align: center; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); }
            .brand { font-size: 28px; font-weight: 900; color: var(--brand-color); letter-spacing: -0.5px; margin-bottom: 4px;}
            .sub { color: var(--text-muted); font-size: 14px; font-weight: 500;}
            .loc { color: var(--text-muted); font-size: 12px; margin-top: 2px;}
            
            .meta { display: flex; justify-content: space-between; align-items: center; background: var(--meta-bg); padding: 15px; border-radius: 10px; margin-bottom: 25px; border: 1px solid var(--border-color); }
            .meta-left { display: flex; flex-direction: column; gap: 4px; }
            .meta-name { font-weight: 700; font-size: 16px; color: var(--text-main); }
            .meta-inv { color: var(--text-muted); font-size: 13px; font-weight: 500; }
            .pay-tag { background: var(--tag-bg); padding: 6px 14px; border-radius: 8px; font-weight: 700; color: var(--tag-text); font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
            
            .totals { margin-top: 25px; padding-top: 20px; border-top: 2px dashed var(--border-dashed); }
            .t-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 15px; color: var(--text-main); }
            .t-row span:last-child { white-space: nowrap; text-align: right; font-weight: 600; }
            
            .t-grand { font-size: 22px; font-weight: 900; color: var(--total-color); margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color); }
            
            .footer { text-align: center; color: var(--text-muted); font-size: 12px; margin-top: 35px; line-height: 1.6; font-weight: 500;}
        </style>
    </head>
    <body>
        <div class="receipt-card">
            <div class="header">
                <div class="brand">MEENA MARKETING</div>
                <div class="sub">Electronics & Furnitures</div>
                <div class="loc">Alwarthirunagiri</div>
            </div>
            
            <div class="meta">
                <div class="meta-left">
                    <span class="meta-name">${data.customer?.name || 'Cash Customer'}</span>
                    <span class="meta-inv">Inv: ${data.invoiceNo}</span>
                </div>
                <div>
                    <span class="pay-tag">${data.paymentMode || 'Cash'}</span>
                </div>
            </div>

            <div class="items">
                ${itemsHtml}
            </div>

            <div class="totals">
                <div class="t-row">
                    <span style="color:var(--text-muted)">Subtotal</span>
                    <span>Rs. ${(data.totals?.sub || 0).toLocaleString()}</span>
                </div>
                <div class="t-row">
                    <span style="color:var(--text-muted)">Tax (GST)</span>
                    <span>Rs. ${(data.totals?.gst || 0).toLocaleString()}</span>
                </div>
                <div class="t-row t-grand">
                    <span>TOTAL</span>
                    <span>Rs. ${(data.totals?.grand || 0).toLocaleString()}</span>
                </div>
            </div>

            <div class="footer">
                Thank you for your business!<br>
                Powered by Goorac Software Solutions
            </div>
        </div>
    </body>
    </html>`;

    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const screenshot = await page.screenshot({ type: 'png', fullPage: true });
    await page.close().catch(() => {}); 
    return screenshot;
}

// ---------------------------------------------------------
// 7. DYNAMIC MODULE LOADER (Passes client and db)
// ---------------------------------------------------------
let modulesLoaded = false; // NEW BUG FIX: Prevents multiple initializations on WhatsApp reconnects

client.on('ready', () => {
    if (modulesLoaded) {
        console.log('📦 Modules already loaded. Skipping re-initialization on reconnect.');
        return;
    }
    modulesLoaded = true;

    // Look for marketing module
    if (fs.existsSync('./marketing.js')) {
        console.log('📦 Loading marketing.js module...');
        require('./marketing.js')(client, db);
    } else if (fs.existsSync('./mrkting.js')) {
        console.log('📦 Loading mrkting.js module...');
        require('./mrkting.js')(client, db);
    }

    // Look for check module (Account statements)
    if (fs.existsSync('./check.js')) {
        console.log('📦 Loading check.js module...');
        require('./check.js')(client, db);
    }
});

// --- ADVANCED AUTO-RETRY ON NETWORK TIMEOUT (BUG & EDGE CASE FIXED) ---
async function startWhatsAppClient() {
    console.log("🚀 Booting WhatsApp Client...");
    try {
        await client.initialize();
    } catch (err) {
        console.error("❌ WhatsApp Engine Failed to Start:", err.message);
        console.log("🧹 Cleaning up locked browser instance...");
        
        try {
            await client.destroy(); 
        } catch (destroyErr) {
            // Ignore if the browser is already completely dead
        }

        console.log("🔄 Network timeout detected. Retrying safely in 15 seconds...");
        setTimeout(startWhatsAppClient, 15000);
    }
}

startWhatsAppClient();
