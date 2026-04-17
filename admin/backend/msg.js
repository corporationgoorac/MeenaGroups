const { Client, LocalAuth } = require('whatsapp-web.js'); 
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const cron = require('node-cron');
const https = require('https'); 
const fs = require('fs');       

// We do NOT need to initialize admin here because server.js already did it.
// We just grab the existing database instance.
const db = admin.firestore();

// --- NEW: ADVANCED STATE MANAGEMENT ---
let systemInitialized = false; // Prevents duplicate listeners on WhatsApp reconnects

// --- ADVANCED FEATURE: Message Debounce Queue to prevent Double Messaging ---
const messageQueue = {}; 

// ---------------------------------------------------------
// 1. WHATSAPP CLIENT INITIALIZATION
// ---------------------------------------------------------
console.log("⏳ Initializing WhatsApp Engine...");

const client = new Client({
    // --- STANDARD LOCAL STORAGE ---
    authStrategy: new LocalAuth({ dataPath: './whatsapp-session' }),
    puppeteer: {
        executablePath: '/usr/bin/chromium', // <--- This points to the Docker-installed browser
        // These arguments are strictly required to run Puppeteer in a Linux/HuggingFace environment
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', (qr) => {
    // This will print the QR code in your Hugging Face Logs tab. 
    qrcode.generate(qr, { small: true });
    console.log('📱 ACTION REQUIRED: Scan the QR code above with your WhatsApp to link the bot.');

    // --- GENERATE PERFECT QR IMAGE FOR WEBPAGE VIEWING ---
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=20&data=' + encodeURIComponent(qr);
    https.get(qrUrl, (response) => {
        const file = fs.createWriteStream('whatsapp-qr.png');
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log('====================================================');
            console.log('🖼️ SUCCESS: A perfect QR Code image has been generated!');
            console.log('👉 Go to your Hugging Face "Files and versions" tab.');
            console.log('👉 Click on "whatsapp-qr.png" to view it perfectly as an image on the webpage and scan it.');
            console.log('👉 OR visit directly: https://corporationgoorac-meenagroups.hf.space/qr'); // DIRECT URL LOG
            console.log('====================================================');
        });
    }).on('error', (err) => {
        console.error('Failed to save QR image:', err.message);
    });
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
    
    // --- CLEAN UP IMAGE AFTER SUCCESSFUL SCAN ---
    if (fs.existsSync('whatsapp-qr.png')) {
        fs.unlinkSync('whatsapp-qr.png');
        console.log('🗑️ Cleaned up whatsapp-qr.png since connection was successful.');
    }
});

client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp Disconnected:', reason);
});

client.initialize();


// ---------------------------------------------------------
// 2. HELPER: FETCH & CACHE AGENT DETAILS (READ OPTIMIZATION)
// ---------------------------------------------------------
const userCache = new Map(); // Stores { name, phone } mapped to UID

async function getAgentDetails(uid) {
    // If we already fetched this user's phone number today, use the cache (Zero Firebase Reads)
    if (userCache.has(uid)) return userCache.get(uid);

    try {
        const user = await admin.auth().getUser(uid);
        if (!user.phoneNumber) return null;

        // WhatsApp Web requires the ID format: 919876543210@c.us (No '+' sign)
        let formattedPhone = user.phoneNumber.replace('+', '') + '@c.us';
        
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
            // Single query to get all drafts
            const snap = await db.collection('temp_entries').where('status', '==', 'draft').get();
            if (snap.empty) {
                console.log('✅ No pending drafts found at 5 PM.');
                return;
            }

            // Group the drafts by agent UID (Optimization: 1 message per agent)
            const agentStats = {}; 
            snap.forEach(doc => {
                const d = doc.data();
                const uid = d.staffUid;
                if (!uid) return;
                
                if (!agentStats[uid]) {
                    agentStats[uid] = { count: 0, totalAmount: 0 };
                }
                agentStats[uid].count++;
                agentStats[uid].totalAmount += parseFloat(d.amount || 0); // Accumulate the draft amounts
            });

            // Send out the WhatsApp messages
            for (const [uid, stats] of Object.entries(agentStats)) {
                const agent = await getAgentDetails(uid);
                if (agent && agent.phone) {
                    const formattedAmount = stats.totalAmount.toLocaleString('en-IN');
                    
                    // --- UPDATED BRANDING: Bold Meena Groups & Amounts ---
                    const msg = `*MEENA GROUPS REMINDER* 🏢\n\nHello *${agent.name}*,\nYou currently have *${stats.count} draft(s)* totaling *₹${formattedAmount}* waiting in your app.\n\nPlease ensure you submit them to the admin queue before the end of your shift today.`;
                    
                    await client.sendMessage(agent.phone, msg);
                    console.log(`-> Sent 5 PM reminder to ${agent.name} (${stats.count} drafts, ₹${formattedAmount})`);
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
            // Single query to get all drafts
            const snap = await db.collection('temp_entries').where('status', '==', 'draft').get();
            if (snap.empty) {
                console.log('✅ No pending drafts found at 10 PM.');
                return;
            }

            // Group the drafts by agent UID (Optimization: 1 message per agent)
            const agentStats = {}; 
            snap.forEach(doc => {
                const d = doc.data();
                const uid = d.staffUid;
                if (!uid) return;
                
                if (!agentStats[uid]) {
                    agentStats[uid] = { count: 0, totalAmount: 0 };
                }
                agentStats[uid].count++;
                agentStats[uid].totalAmount += parseFloat(d.amount || 0); // Accumulate the draft amounts
            });

            // Send out the WhatsApp messages
            for (const [uid, stats] of Object.entries(agentStats)) {
                const agent = await getAgentDetails(uid);
                if (agent && agent.phone) {
                    const formattedAmount = stats.totalAmount.toLocaleString('en-IN');
                    
                    // --- UPDATED BRANDING: Bold Meena Groups & Amounts ---
                    const msg = `*MEENA GROUPS REMINDER* 🏢\n\nHello *${agent.name}*,\nYou currently have *${stats.count} draft(s)* totaling *₹${formattedAmount}* waiting in your app.\n\nPlease ensure you submit them to the admin queue before the end of your shift today.`;
                    
                    await client.sendMessage(agent.phone, msg);
                    console.log(`-> Sent 10 PM reminder to ${agent.name} (${stats.count} drafts, ₹${formattedAmount})`);
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
    
    // --- ADVANCED FIX: Idempotency memory cache to strictly prevent duplicate alerts ---
    const processedDocs = new Set(); 

    // We only listen for entries that are 'pending'.
    db.collection('temp_entries')
      .where('status', '==', 'pending')
      .onSnapshot(async (snapshot) => {
          
          // OPTIMIZATION: Ignore the initial bulk load on server restart to save reads and prevent WhatsApp spam
          if (isInitialLoad) {
              isInitialLoad = false;
              console.log(`✅ Initial Firestore sync complete. Now watching for fresh submissions...`);
              return;
          }

          // Because your frontend uses batch.commit(), 5 submissions will arrive in ONE snapshot event.
          // We group them by agent so they get ONE consolidated WhatsApp message.
          const submissionsByAgent = {};

          snapshot.docChanges().forEach((change) => {
              // We only care about documents being modified to pending, or newly added as pending
              if (change.type === 'added' || change.type === 'modified') {
                  const data = change.doc.data();
                  const uid = data.staffUid;
                  const docId = change.doc.id; // Added for duplicate tracking
                  
                  // --- ADVANCED FIX: Prevent duplicate processing of the same document ---
                  if (processedDocs.has(docId)) return;
                  processedDocs.add(docId);
                  
                  // Clear from memory after 24 hours to prevent RAM memory leaks
                  setTimeout(() => processedDocs.delete(docId), 86400000); 
                  
                  // Security check: Ignore if the system cron job submitted this at midnight
                  if (!uid || data.submittedBySystem) return;
                  
                  if (!submissionsByAgent[uid]) {
                      submissionsByAgent[uid] = { count: 0, totalAmount: 0 };
                  }
                  submissionsByAgent[uid].count++;
                  submissionsByAgent[uid].totalAmount += parseFloat(data.amount || 0); // Accumulate submitted amounts
              }
          });

          // Process the grouped submissions and send the WhatsApp texts
          for (const [uid, stats] of Object.entries(submissionsByAgent)) {
              
              // --- ADVANCED FIX: DEBOUNCE QUEUE (ABSORBS DOUBLE FIREBASE PINGS) ---
              if (!messageQueue[uid]) {
                  messageQueue[uid] = { count: 0, totalAmount: 0, timer: null };
              }
              
              messageQueue[uid].count += stats.count;
              messageQueue[uid].totalAmount += stats.totalAmount;

              // If a new chunk arrives within 4 seconds, reset the timer so it groups them together
              if (messageQueue[uid].timer) {
                  clearTimeout(messageQueue[uid].timer);
              }

              messageQueue[uid].timer = setTimeout(async () => {
                  // Lock in the stats and immediately clear the queue to receive future submissions
                  const finalStats = { 
                      count: messageQueue[uid].count, 
                      totalAmount: messageQueue[uid].totalAmount 
                  };
                  delete messageQueue[uid];
                  
                  const agent = await getAgentDetails(uid);
                  if (agent && agent.phone) {
                       const timeNow = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
                       const formattedAmount = finalStats.totalAmount.toLocaleString('en-IN');
                       
                       // --- UPDATED BRANDING: Bold Meena Groups & Amounts ---
                       const msg = `*MEENA GROUPS* 🏢\n*Submission Confirmed* ✅\n\nGreat job, *${agent.name}*! You have successfully submitted *${finalStats.count}* entry/entries totaling *₹${formattedAmount}* to the pending queue at ${timeNow}.`;
                       
                       await client.sendMessage(agent.phone, msg);
                       console.log(`-> Sent submission confirmation to ${agent.name} for ${finalStats.count} entries (₹${formattedAmount}).`);
                  }
              }, 4000); // 4000 milliseconds = 4 seconds delay to absorb duplicate pings
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
        require('./check.js')(client); // Correctly passing the client to the external bot
        console.log("🔍 check.js external script executed successfully.");
    } catch (error) {
        console.error("❌ Failed to execute check.js:", error.message);
    }
}
