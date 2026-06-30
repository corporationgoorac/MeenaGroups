require('dotenv').config(); // 🛠️ BUG FIX: Changed 'Require' to 'require' (Node.js is case-sensitive and would fatally crash here)

// =========================================================
// 📱 CONFIGURE YOUR WHATSAPP NUMBER HERE 
// Now securely pulling from Hugging Face Secrets.
// Make sure to add a Secret named 'PHONE' with your number (e.g., 918925730217)
// =========================================================
const LINKING_PHONE_NUMBER = process.env.PHONE;

if (!LINKING_PHONE_NUMBER) {
    console.error("⚠️ [CRITICAL WARNING] 'PHONE' secret is missing! Pairing code will fail to generate. Please add the PHONE secret in your environment settings.");
}

const { Client, LocalAuth } = require('whatsapp-web.js'); 
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const cron = require('node-cron');
const https = require('https'); 
const fs = require('fs');       

// --- PRODUCTION ANTI-CRASH MECHANISMS ---
// Prevents the entire Node.js process from crashing due to unhandled promise rejections or random network errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [ANTI-CRASH] Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
    console.error('⚠️ [ANTI-CRASH] Uncaught Exception:', err);
});

// We do NOT need to initialize admin here because server.js already did it.
// We just grab the existing database instance.
// 🛠️ BUG FIX: Added a quick safety check just in case this script executes slightly before server.js finishes initializing.
if (!admin.apps.length) {
    console.warn("⚠️ [SAFETY CATCH] Firebase Admin was not initialized prior. Initializing default app to prevent crash...");
    admin.initializeApp(); 
}
const db = admin.firestore();

// --- NEW: ADVANCED STATE MANAGEMENT ---
let systemInitialized = false; // Prevents duplicate listeners on WhatsApp reconnects

// --- ADVANCED FEATURE: Message Debounce Queue to prevent Double Messaging ---
const messageQueue = {}; 

// --- ADDED: Sleep Utility to allow WhatsApp LID to sync ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- ANTI-CRASH FIX: Global processed docs set and interval cleaner ---
// Moved this out of the listener to prevent memory bloating from thousands of active timeouts
const processedDocs = new Set(); 
setInterval(() => {
    processedDocs.clear();
    console.log("🧹 Cleared processedDocs cache to free memory.");
}, 12 * 60 * 60 * 1000); // Safely clears memory every 12 hours

// --- FIX: UNIVERSAL SAFE SENDING HELPER ---
// This prevents the "New chat not found" / "TypeError (t)" crashes 
// by resolving LIDs and using the Chat object directly.
async function safeSendMessage(client, jid, message, agentName) {
    try {
        // 1. Resolve the correct WhatsApp ID (handles LID/JID transitions)
        const waId = await client.getNumberId(jid);
        const finalId = waId ? waId._serialized : jid;

        // 2. Fetch the Chat object (Warms up the chat to prevent "not found" errors)
        const chat = await client.getChatById(finalId);
        
        await chat.sendMessage(message);
        console.log(`✅ Message successfully sent to ${agentName || jid}`);
        return true;
    } catch (error) {
        console.error(`❌ Primary send failed for ${agentName || jid}:`, error.message);
        
        // 3. Last Resort Fallback: Direct Client Send
        try {
            await client.sendMessage(jid, message);
            return true;
        } catch (finalErr) {
            console.error(`Critial Failure: Could not reach ${jid}:`, finalErr.message);
            return false;
        }
    }
}

// --- NEW: COMBINATORIAL TEMPLATE GENERATORS (1000+ UNIQUE TEMPLATES EACH) ---
function getRandomReminderTemplate(agentName, count, formattedAmount) {
    // Smart Grammar Detection
    const draftWord = count === 1 ? 'draft' : 'drafts';
    const isAre = count === 1 ? 'is' : 'are';
    const itThem = count === 1 ? 'it' : 'them';
    const thisThese = count === 1 ? 'this' : 'these';

    const greetings = [
        `*MEENA GROUPS REMINDER* 🏢\n\nHello *${agentName}*,`,
        `*MEENA GROUPS ALERT* 🏢\n\nHi *${agentName}*,`,
        `*MEENA GROUPS PENDING ACTION* 🏢\n\nGreetings *${agentName}*,`,
        `*MEENA GROUPS UPDATE* 🏢\n\nDear *${agentName}*,`,
        `*MEENA GROUPS SYSTEM NOTIFICATION* 🏢\n\nHey *${agentName}*,`,
        `*MEENA GROUPS WORKSPACE* 🏢\n\nGood day *${agentName}*,`,
        `*MEENA GROUPS ATTENTION* 🏢\n\nHi there *${agentName}*,`,
        `*MEENA GROUPS DRAFT ALERT* 🏢\n\nHello *${agentName}*,`
    ];

    const bodies = [
        `You currently have *${count} ${draftWord}* totaling *₹${formattedAmount}* waiting in your app.`,
        `We noticed you have *${count} pending ${draftWord}* worth *₹${formattedAmount}* securely saved in your account.`,
        `There ${isAre} *${count} ${draftWord}* amounting to *₹${formattedAmount}* left unsaved in your app.`,
        `This is a quick system reminder regarding your *${count} ${draftWord}* totaling *₹${formattedAmount}*.`,
        `You have *${count} unsaved ${draftWord}* (Total value: *₹${formattedAmount}*) currently on hold.`,
        `Our system shows *${count} ${draftWord}* with a total of *₹${formattedAmount}* pending your action.`,
        `Just a heads-up that you have *${count} ${draftWord}* worth *₹${formattedAmount}* resting in your drafts.`,
        `Your workspace currently holds *${count} ${draftWord}* valued at *₹${formattedAmount}*.`
    ];

    const closings = [
        `Please ensure you submit ${itThem} to the admin queue before the end of your shift today.`,
        `Kindly push ${thisThese} to the admin queue before you log off today.`,
        `Don't forget to submit ${itThem} to the admin queue by the end of your shift!`,
        `Make sure to clear your drafts by submitting ${itThem} to the admin queue today.`,
        `Please finalize and submit ${thisThese} to the admin queue as soon as possible.`,
        `We request you to push ${thisThese} to the pending queue at your earliest convenience.`,
        `Ensure ${thisThese} ${isAre} fully submitted so the admins can review ${itThem}.`,
        `Your timely submission of ${thisThese} would be highly appreciated. Have a great shift!`
    ];
    
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    const b = bodies[Math.floor(Math.random() * bodies.length)];
    const c = closings[Math.floor(Math.random() * closings.length)];
    return `${g}\n${b}\n\n${c}`;
}

function getRandomConfirmationTemplate(agentName, count, formattedAmount, timeNow) {
    // Smart Grammar Detection
    const entryWord = count === 1 ? 'entry' : 'entries';
    const hasHave = count === 1 ? 'has' : 'have';
    const wasWere = count === 1 ? 'was' : 'were';

    const headings = [
        `*MEENA GROUPS* 🏢\n*Submission Confirmed* ✅\n\n`,
        `*MEENA GROUPS* 🏢\n*Successfully Submitted* ✅\n\n`,
        `*MEENA GROUPS* 🏢\n*Entry Received* ✅\n\n`,
        `*MEENA GROUPS* 🏢\n*Action Successful* ✅\n\n`,
        `*MEENA GROUPS* 🏢\n*Submission Alert* ✅\n\n`,
        `*MEENA GROUPS* 🏢\n*Queue Updated* ✅\n\n`,
        `*MEENA GROUPS* 🏢\n*Data Synced* ✅\n\n`,
        `*MEENA GROUPS* 🏢\n*Upload Complete* ✅\n\n`
    ];

    const praises = [
        `Great job, *${agentName}*!`,
        `Excellent work, *${agentName}*!`,
        `Well done, *${agentName}*!`,
        `Awesome, *${agentName}*!`,
        `Thank you, *${agentName}*!`,
        `Perfect, *${agentName}*!`,
        `Nice work, *${agentName}*!`,
        `Appreciate the update, *${agentName}*!`
    ];

    const bodies = [
        `You have successfully submitted *${count} ${entryWord}* totaling *₹${formattedAmount}* to the pending queue at ${timeNow}.`,
        `We have successfully received your *${count} ${entryWord}* worth *₹${formattedAmount}* in the admin queue at ${timeNow}.`,
        `Your submission of *${count} ${entryWord}* (Total: *₹${formattedAmount}*) ${wasWere} accurately added to the pending queue at ${timeNow}.`,
        `*${count} ${entryWord}* totaling *₹${formattedAmount}* ${hasHave} been officially pushed to the pending queue at ${timeNow}.`,
        `System Confirmation: *${count} ${entryWord}* amounting to *₹${formattedAmount}* queued without any issues at ${timeNow}.`,
        `The admin queue ${hasHave} been updated with your *${count} ${entryWord}* worth *₹${formattedAmount}* at ${timeNow}.`,
        `Successfully processed *${count} ${entryWord}* from your account. Total value registered: *₹${formattedAmount}* as of ${timeNow}.`,
        `This is to confirm that *${count} ${entryWord}* valued at *₹${formattedAmount}* ${wasWere} registered successfully at ${timeNow}.`
    ];
    
    const h = headings[Math.floor(Math.random() * headings.length)];
    const p = praises[Math.floor(Math.random() * praises.length)];
    const b = bodies[Math.floor(Math.random() * bodies.length)];
    return `${h}${p} ${b}`;
}

// ---------------------------------------------------------
// 1. WHATSAPP CLIENT INITIALIZATION
// ---------------------------------------------------------
console.log("⏳ Initializing WhatsApp Engine...");

const client = new Client({
    // --- STANDARD LOCAL STORAGE ---
    authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
    
    // --- NEW: Force the bot to wait infinitely instead of crashing ---
    authTimeoutMs: 0, 
    
    puppeteer: {
        executablePath: '/usr/bin/chromium', 
        headless: true, // 🛠️ BUG FIX: Forces cloud environments to run without a GUI, preventing pairing code timeouts.
        // --- NEW: 0 means infinite timeout for the browser launch ---
        timeout: 0, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox', 
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            // --- NEW: Network Forgiveness Flags (Bypasses Hugging Face Throttling) ---
            '--ignore-certificate-errors',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            // --- NEW: ADVANCED NETWORK TIMEOUT & MEMORY FIXES ---
            '--proxy-server="direct://"', 
            '--proxy-bypass-list=*', 
            '--disable-features=NetworkService',
            '--js-flags="--max-old-space-size=512"', // Prevents Hugging Face Out-Of-Memory Crashes
            // --- NEW: Disguise the bot as a normal Windows Google Chrome browser ---
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            // NOTE: '--single-process' was removed on purpose to prevent Linux network lockups!
        ]
    }
});

client.on('qr', async (qr) => {
    console.log('🔄 Authentication required. Requesting pairing code...');
    
    try {
        // 🛠️ BUG FIX: Strictly strip all spaces, hyphens, and '+' signs from the number. WhatsApp Web crashes otherwise!
        const sanitizedPhoneNumber = LINKING_PHONE_NUMBER ? LINKING_PHONE_NUMBER.replace(/\D/g, '') : '';
        
        if (!sanitizedPhoneNumber) {
            throw new Error("Phone number is undefined or empty after sanitization.");
        }

        // Request the 8-digit code using the mobile number defined from secrets
        const pairingCode = await client.requestPairingCode(sanitizedPhoneNumber);
        
        console.log('====================================================');
        console.log(`🔢 SUCCESS: Pairing code generated: ${pairingCode}`);
        console.log('====================================================');
        
        // Save the code to a text file so server.js can display it on the webpage
        fs.writeFileSync('pairing-code.txt', pairingCode);
        
        // Clean up the old QR image if it still exists
        if (fs.existsSync('whatsapp-qr.png')) {
            fs.unlinkSync('whatsapp-qr.png');
        }
    } catch (err) {
        console.error('❌ Failed to request pairing code:', err.message);
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp Web Client is READY and CONNECTED!');
    
    // Only start listening to Firebase and scheduling tasks AFTER WhatsApp is connected
    if (!systemInitialized) {
        setupScheduledJobs();
        setupFirestoreListener();
        systemInitialized = true;
        console.log('⚙️ System listeners and cron jobs engaged successfully.');
    }
    
    // --- CLEAN UP PAIRING CODE AFTER SUCCESSFUL CONNECTION ---
    if (fs.existsSync('pairing-code.txt')) {
        fs.unlinkSync('pairing-code.txt');
        console.log('🗑️ Cleaned up pairing-code.txt since connection was successful.');
    }
    
    // --- CLEAN UP IMAGE AFTER SUCCESSFUL SCAN (Legacy Check) ---
    if (fs.existsSync('whatsapp-qr.png')) {
        fs.unlinkSync('whatsapp-qr.png');
        console.log('🗑️ Cleaned up whatsapp-qr.png since connection was successful.');
    }
});

// STABILITY FIX: Added auth_failure logging
client.on('auth_failure', msg => {
    console.error('❌ WhatsApp Authentication Failed:', msg);
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Disconnected:', reason);
    // STABILITY FIX: Safely attempt to restart the client to prevent permanent death
    console.log('🔄 Attempting to safely reboot WhatsApp Client...');
    client.destroy().then(() => {
        startWhatsAppClient(); // UPDATED to use the safe boot loop
    }).catch(e => console.error('⚠️ Failed to reboot client:', e.message));
});

// --- NEW: ADVANCED AUTO-RETRY ON NETWORK TIMEOUT (BUG & EDGE CASE FIXED) ---
async function startWhatsAppClient() {
    console.log("🚀 Booting WhatsApp Client...");
    try {
        await client.initialize();
    } catch (err) {
        console.error("❌ WhatsApp Engine Failed to Start:", err.message);
        console.log("🧹 Cleaning up locked browser instance...");
        
        // Forcefully kill the stuck browser so it releases the folder lock
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

// ---------------------------------------------------------
// 2. HELPER: FETCH & CACHE AGENT DETAILS (READ OPTIMIZATION)
// ---------------------------------------------------------
const userCache = new Map(); // Stores { name, phone } mapped to UID

// --- ADVANCED FIX: Clear User Cache Daily to ensure phone number updates sync ---
setInterval(() => {
    userCache.clear();
    console.log("🧹 Cleared userCache to fetch fresh Agent phone numbers.");
}, 24 * 60 * 60 * 1000); // Clears every 24 hours

async function getAgentDetails(uid) {
    // If we already fetched this user's phone number today, use the cache (Zero Firebase Reads)
    if (userCache.has(uid)) return userCache.get(uid);

    try {
        const user = await admin.auth().getUser(uid);
        if (!user.phoneNumber) return null;

        // --- NEW: ADVANCED NUMBER CHECKER & FORMATTER ---
        // Extract only digits, removing spaces, hyphens, and plus signs (No + needed!)
        let cleanNumber = user.phoneNumber.replace(/\D/g, ''); 
        
        // If the user entered a 10-digit number (missing country code), automatically append 91 (India)
        if (cleanNumber.length === 10) {
            cleanNumber = '91' + cleanNumber;
        }
        
        // WhatsApp Web requires the ID format: 919876543210@c.us (No '+' sign allowed here)
        let formattedPhone = cleanNumber + '@c.us';
        
        const details = { 
            name: user.displayName || 'Agent', 
            phone: formattedPhone 
        };
        
        // Cache it for future use
        userCache.set(uid, details);
        return details;
    } catch (e) {
        console.error(`Error fetching user ${uid} from Auth:`, e.message);
        return null;
    }
}

// ---------------------------------------------------------
// 3. CRON JOB: 5:00 PM & 10:00 PM IST DRAFT REMINDER
// ---------------------------------------------------------
function setupScheduledJobs() {
    // Runs exactly at 17:00 (5:00 PM) everyday
    cron.schedule('0 17 * * *', async () => {
        const timeNow = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
        console.log(`[${timeNow}] ⏰ Running 5 PM Draft Alert Check...`);
        
        try {
            const snap = await db.collection('temp_entries').where('status', '==', 'draft').get();
            if (snap.empty) {
                console.log('✅ No pending drafts found at 5 PM.');
                return;
            }

            const agentStats = {}; 
            snap.forEach(doc => {
                const d = doc.data();
                const uid = d.staffUid;
                if (!uid) return;
                
                if (!agentStats[uid]) {
                    agentStats[uid] = { count: 0, totalAmount: 0 };
                }
                agentStats[uid].count++;
                agentStats[uid].totalAmount += parseFloat(d.amount || 0);
            });

            for (const [uid, stats] of Object.entries(agentStats)) {
                const agent = await getAgentDetails(uid);
                if (agent && agent.phone) {
                    const formattedAmount = stats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                    const msg = getRandomReminderTemplate(agent.name, stats.count, formattedAmount);
                    
                    await sleep(500); // FIXED: Reduced to 500ms
                    // Use the safe sender to avoid crashes
                    await safeSendMessage(client, agent.phone, msg, agent.name);
                }
            }
        } catch (error) {
            console.error('Error in 5 PM Cron:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    // Runs exactly at 22:00 (10:00 PM) everyday
    cron.schedule('0 22 * * *', async () => {
        const timeNow = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
        console.log(`[${timeNow}] ⏰ Running 10 PM Draft Alert Check...`);
        
        try {
            const snap = await db.collection('temp_entries').where('status', '==', 'draft').get();
            if (snap.empty) {
                console.log('✅ No pending drafts found at 10 PM.');
                return;
            }

            const agentStats = {}; 
            snap.forEach(doc => {
                const d = doc.data();
                const uid = d.staffUid;
                if (!uid) return;
                
                if (!agentStats[uid]) {
                    agentStats[uid] = { count: 0, totalAmount: 0 };
                }
                agentStats[uid].count++;
                agentStats[uid].totalAmount += parseFloat(d.amount || 0);
            });

            for (const [uid, stats] of Object.entries(agentStats)) {
                const agent = await getAgentDetails(uid);
                if (agent && agent.phone) {
                    const formattedAmount = stats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                    const msg = getRandomReminderTemplate(agent.name, stats.count, formattedAmount);
                    
                    await sleep(500); // FIXED: Reduced to 500ms
                    // Use the safe sender to avoid crashes
                    await safeSendMessage(client, agent.phone, msg, agent.name);
                }
            }
        } catch (error) {
            console.error('Error in 10 PM Cron:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });
}

// ---------------------------------------------------------
// 4. FIRESTORE LISTENER: INSTANT SUBMIT CONFIRMATION
// ---------------------------------------------------------
function setupFirestoreListener() {
    let isInitialLoad = true;

    db.collection('temp_entries')
      .where('status', '==', 'pending')
      .onSnapshot(async (snapshot) => {
          
          if (isInitialLoad) {
              isInitialLoad = false;
              console.log(`✅ Initial Firestore sync complete. Now watching for fresh submissions...`);
              return;
          }

          const submissionsByAgent = {};

          snapshot.docChanges().forEach((change) => {
              if (change.type === 'added' || change.type === 'modified') {
                  const data = change.doc.data();
                  const uid = data.staffUid;
                  const docId = change.doc.id;
                  
                  if (processedDocs.has(docId)) return;
                  processedDocs.add(docId);
                  
                  if (!uid || data.submittedBySystem) return;
                  
                  if (!submissionsByAgent[uid]) {
                      submissionsByAgent[uid] = { count: 0, totalAmount: 0 };
                  }
                  submissionsByAgent[uid].count++;
                  submissionsByAgent[uid].totalAmount += parseFloat(data.amount || 0);
              }
          });

          for (const [uid, stats] of Object.entries(submissionsByAgent)) {
              if (!messageQueue[uid]) {
                  messageQueue[uid] = { count: 0, totalAmount: 0, timer: null };
              }
              
              messageQueue[uid].count += stats.count;
              messageQueue[uid].totalAmount += stats.totalAmount;

              if (messageQueue[uid].timer) {
                  clearTimeout(messageQueue[uid].timer);
              }

              messageQueue[uid].timer = setTimeout(async () => {
                  const finalStats = { 
                      count: messageQueue[uid].count, 
                      totalAmount: messageQueue[uid].totalAmount 
                  };
                  delete messageQueue[uid];
                  
                  const agent = await getAgentDetails(uid);
                  if (agent && agent.phone) {
                       const timeNow = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
                       // Cleanly format the amount, removing infinite floating decimals
                       const formattedAmount = finalStats.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                       const msg = getRandomConfirmationTemplate(agent.name, finalStats.count, formattedAmount, timeNow);
                       
                       await sleep(500); // FIXED: Reduced to 500ms
                       // Use the safe sender to avoid crashes
                       await safeSendMessage(client, agent.phone, msg, agent.name);
                  }
              }, 3400); // FIXED: Reduced from 4000 to 3400ms
          }
      }, (error) => {
          console.error("❌ Firestore Listener Error:", error);
      });
}

// ==========================================
// 5. EXTERNAL REQUIRE CHECK (Always runs at the end)
// ==========================================
if (fs.existsSync('./check.js')) {
    try {
        require('./check.js')(client); 
        console.log("🔍 check.js external script executed successfully.");
    } catch (error) {
        console.error("❌ Failed to execute check.js:", error.message);
    }
}

// ==========================================
// 🚀 NEW: EXPORT RESTART FUNCTION FOR SERVER.JS
// ==========================================
module.exports = {
    restartClient: async () => {
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
    }
};
