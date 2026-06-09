// ============================================================================
// CONFIGURATION: PASTE YOUR MACRODROID WEBHOOK URLS HERE
// ============================================================================
// Paste your main URL in URL_1. If you have secondary devices, paste them below.
// To disable a slot, just leave it as an empty string "".
const MACRODROID_URL_1 = "https://trigger.macrodroid.com/79df0a26-d0d9-43a6-b0b2-311f92f8a987/text";
const MACRODROID_URL_2 = ""; 
const MACRODROID_URL_3 = ""; 
const MACRODROID_URL_4 = ""; 
const MACRODROID_URL_5 = ""; 
// ============================================================================

const admin = require("firebase-admin");
const axios = require("axios");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 7860;

// Initialize Firebase Admin using Hugging Face Space Repository Secrets
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("✔ Firebase Admin SDK Initialized Successfully.");
} else {
    console.error("❌ Critical Error: FIREBASE_SERVICE_ACCOUNT_JSON environment variable missing!");
    // We don't exit immediately so the UI can still load and show the error state if needed, 
    // but in production, you'd want the container to fail if secrets are missing.
}

const db = admin.firestore();
const sessionStartTime = admin.firestore.Timestamp.now();

// --- TAMIL TRANSLATION DICTIONARIES ---
const tamilNumbers = {
    1: 'ஒன்று', 2: 'இரண்டு', 3: 'மூன்று', 4: 'நான்கு', 5: 'ஐந்து',
    6: 'ஆறு', 7: 'ஏழு', 8: 'எட்டு', 9: 'ஒன்பது', 10: 'பத்து'
};

const reasonTranslations = {
    "Damaged Product": "பழுதான பொருள்",
    "Sent to Meena Agency": "மீனா ஏஜென்சிக்கு அனுப்பப்பட்டுள்ளது",
    "Product Missing": "பொருள் காணவில்லை",
    "Returned to Dealer": "டீலருக்கு திருப்பி அனுப்பப்பட்டுள்ளது",
    "Gift to Customer": "வாடிக்கையாளருக்கு பரிசு",
    "Counting Mistake": "எண்ணிக்கை தவறு",
    "Customer Return": "வாடிக்கையாளர் திருப்பிக் கொடுத்தது",
    "New Stock": "புதிய சரக்கு"
};

// --- DYNAMIC TAMIL TEMPLATES ---
const salesTemplates = [
    "கடையில், [ITEMS], ரூ [AMOUNT]-க்கு விற்பனை ஆகி உள்ளது.",
    "நற்செய்தி! [ITEMS], மொத்தம் [AMOUNT] ரூபாய்க்கு விற்பனையாகியுள்ளது.",
    "ஒரு புதிய விற்பனை நடந்துள்ளது. [ITEMS], [AMOUNT] ரூபாய்க்கு விற்கப்பட்டுள்ளது.",
    "மீனா மார்க்கெட்டிங்கில் தற்போது, [ITEMS], [AMOUNT] ரூபாய்க்கு பில் செய்யப்பட்டுள்ளது.",
    "சிறப்பு! வாடிக்கையாளர் [ITEMS]-ஐ, [AMOUNT] ரூபாய்க்கு வாங்கியுள்ளார்.",
    "கவனத்திற்கு! [ITEMS], [AMOUNT] ரூபாய்க்கு வெற்றிகரமாக விற்பனை செய்யப்பட்டுள்ளது.",
    "[ITEMS], மொத்தம் [AMOUNT] ரூபாய் மதிப்பிற்கு விற்பனையாகி உள்ளது.",
    "மகிழ்ச்சியான செய்தி! கடையில் [ITEMS], [AMOUNT] ரூபாய்க்கு விற்பனை முடிந்துள்ளது."
];

const alertTemplates = [
    "கவனம்! [PRODUCT], [QTY] எண்ணிக்கை குறைக்கப்பட்டுள்ளது. காரணம்: [REASON].",
    "எச்சரிக்கை! [PRODUCT], [QTY] இருப்பு எடுக்கப்பட்டுள்ளது. இதற்கான காரணம், [REASON].",
    "நிர்வாகியின் கவனத்திற்கு! [REASON] காரணமாக, [PRODUCT] இருப்பில் [QTY] குறைந்துள்ளது.",
    "முக்கிய தகவல். [PRODUCT] இருப்பிலிருந்து [QTY] நீக்கப்பட்டுள்ளது. காரணம்: [REASON].",
    "ஸ்டாக் அப்டேட்! [PRODUCT], [QTY] எண்ணிக்கை குறைக்கப்பட்டுள்ளது. காரணம்: [REASON]."
];

function getRandomTemplate(templateArray) {
    return templateArray[Math.floor(Math.random() * templateArray.length)];
}

// --- MULTI-WEBHOOK BROADCASTER ENGINE ---
async function broadcastToMacroDroid(textPhrase) {
    const targets = [MACRODROID_URL_1, MACRODROID_URL_2, MACRODROID_URL_3, MACRODROID_URL_4, MACRODROID_URL_5].filter(url => url && url.trim() !== "");
    
    if (targets.length === 0) {
        console.warn("⚠️ Broadcast requested, but no valid MacroDroid URLs are configured.");
        return;
    }

    const requests = targets.map(baseUrl => {
        return axios.get(baseUrl, {
            params: { text: textPhrase },
            timeout: 8000
        })
        .then(() => console.log(`🚀 Successfully pinged target: ${baseUrl}`))
        .catch(err => console.error(`❌ Failed to ping target: ${baseUrl}. Error: ${err.message}`));
    });

    await Promise.all(requests);
}

// --- REAL-TIME FIRESTORE LISTENERS ---

// 1. Sales Collection Listener
db.collection("sellings")
  .where("createdAt", ">=", sessionStartTime)
  .orderBy("createdAt", "desc")
  .limit(1)
  .onSnapshot(snapshot => {
      if (!snapshot || snapshot.empty) return;
      
      snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
              const data = change.doc.data();
              let parsedItemText = '';

              if (data.items && Array.isArray(data.items) && data.items.length > 0) {
                  let parts = [];
                  data.items.forEach(item => {
                      const pName = item.name || 'பொருள்';
                      const pQty = parseInt(item.qty) || 1;
                      const qtyInTamil = tamilNumbers[pQty] || pQty.toString();
                      parts.push(`${pName} ${qtyInTamil}`);
                  });
                  
                  if (parts.length === 1) {
                      parsedItemText = parts[0];
                  } else {
                      const lastPart = parts.pop();
                      parsedItemText = parts.join(', ') + ', மற்றும் ' + lastPart;
                  }
              } else {
                  parsedItemText = 'பொருட்கள்';
              }

              const totalAmount = Math.round(data.totals?.grand || 0);
              let ttsPhrase = getRandomTemplate(salesTemplates)
                  .replace('[ITEMS]', parsedItemText)
                  .replace('[AMOUNT]', totalAmount);

              console.log(`[SALES EVENT] Broadcasting phrase: "${ttsPhrase}"`);
              await broadcastToMacroDroid(ttsPhrase);
          }
      });
  }, err => console.error("Sales Listener Error:", err));

// 2. Stock Reduction Alert Document Listener
db.collection("alerts").doc("stock_reduction")
  .onSnapshot(async (docSnap) => {
      if (!docSnap || !docSnap.exists) return;
      
      const data = docSnap.data();
      if (data.lastUpdated) {
          const updateTime = data.lastUpdated.toDate ? data.lastUpdated.toDate() : new Date(data.lastUpdated);
          if (updateTime < sessionStartTime.toDate()) return;
      }

      const prodName = data.name || "பொருள்";
      const oldQty = data.previousQty || 0;
      const newQty = data.qty || 0;
      const reducedQty = oldQty - newQty;
      
      if (reducedQty <= 0) return;

      const englishReason = data.lastEditReason || "Unknown";
      const tamilReason = reasonTranslations[englishReason] || englishReason;
      const qtyInTamil = tamilNumbers[reducedQty] || reducedQty.toString();

      let ttsPhrase = getRandomTemplate(alertTemplates)
          .replace('[PRODUCT]', prodName)
          .replace('[QTY]', qtyInTamil)
          .replace('[REASON]', tamilReason);

      console.log(`[ALERT EVENT] Broadcasting phrase: "${ttsPhrase}"`);
      await broadcastToMacroDroid(ttsPhrase);
  }, err => console.error("Alert Listener Error:", err));


// --- BEAUTIFUL DARK MODE STATUS DASHBOARD ---
app.get("/", (req, res) => {
    const activeDevices = [MACRODROID_URL_1, MACRODROID_URL_2, MACRODROID_URL_3, MACRODROID_URL_4, MACRODROID_URL_5].filter(url => url && url.trim() !== "").length;
    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const formattedUptime = `${hours}h ${minutes}m`;
    const firebaseStatus = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? "Connected" : "Missing Credentials";
    const statusColor = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? "#10b981" : "#ef4444";

    const htmlResponse = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Meena Soundbox Engine</title>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0b111a;
                --surface: #131b26;
                --border: #1e293b;
                --text-main: #f8fafc;
                --text-muted: #94a3b8;
                --accent: #3b82f6;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; }
            body { font-family: 'Inter', sans-serif; background-color: var(--bg); color: var(--text-main); display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
            .container { background: var(--surface); border: 1px solid var(--border); border-radius: 24px; padding: 40px 30px; max-width: 420px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); text-align: center; position: relative; overflow: hidden; }
            
            /* Decorative Glow */
            .container::before { content: ''; position: absolute; top: -50px; left: 50%; transform: translateX(-50%); width: 200px; height: 100px; background: rgba(59, 130, 246, 0.3); filter: blur(60px); z-index: 0; }
            
            .content { position: relative; z-index: 1; }
            
            .icon-wrapper { width: 80px; height: 80px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: var(--accent); }
            .icon-wrapper .material-symbols-outlined { font-size: 40px; }
            
            h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.5px; }
            p.subtitle { color: var(--text-muted); font-size: 14px; margin-bottom: 30px; line-height: 1.5; }
            
            .stats-grid { display: grid; grid-template-columns: 1fr; gap: 12px; margin-bottom: 30px; }
            .stat-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.05); padding: 16px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; }
            .stat-left { display: flex; align-items: center; gap: 12px; font-size: 14px; font-weight: 600; color: var(--text-muted); }
            .stat-left .material-symbols-outlined { font-size: 20px; opacity: 0.8; }
            .stat-right { font-weight: 700; font-size: 15px; color: var(--text-main); display: flex; align-items: center; gap: 8px; }
            
            .pulse-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); animation: pulse 2s infinite; }
            
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }
            
            .footer-text { font-size: 12px; color: #475569; font-weight: 500; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="content">
                <div class="icon-wrapper">
                    <span class="material-symbols-outlined">settings_input_antenna</span>
                </div>
                <h1>Audio Hub Engine</h1>
                <p class="subtitle">Secure Node.js backend monitoring Firebase and broadcasting to MacroDroid.</p>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-left">
                            <span class="material-symbols-outlined">database</span>
                            Database
                        </div>
                        <div class="stat-right">
                            <span class="pulse-dot" style="background-color: ${statusColor}; animation: ${process.env.FIREBASE_SERVICE_ACCOUNT_JSON ? 'pulse 2s infinite' : 'none'};"></span>
                            <span style="color: ${statusColor};">${firebaseStatus}</span>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-left">
                            <span class="material-symbols-outlined">cell_tower</span>
                            Webhooks
                        </div>
                        <div class="stat-right">
                            ${activeDevices} Active
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-left">
                            <span class="material-symbols-outlined">schedule</span>
                            Uptime
                        </div>
                        <div class="stat-right">
                            ${formattedUptime}
                        </div>
                    </div>
                </div>
                
                <div class="footer-text">
                    Engine is running securely in the cloud.
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    res.send(htmlResponse);
});

app.listen(PORT, () => {
    console.log(`🚀 Audio Hub Engine running smoothly on port ${PORT}`);
});
