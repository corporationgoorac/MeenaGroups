const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const admin = require('firebase-admin');
const express = require('express');
const qrcode = require('qrcode');
const fs = require('fs');

// FORCE ENTIRE SERVER NATIVELY INTO INDIAN STANDARD TIME (IST)
process.env.TZ = "Asia/Kolkata";

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

let qrDataURL = '';
let isConnected = false;

// The Web Dashboard
app.get('/', (req, res) => {
    if (isConnected) {
        res.send(`
            <html>
                <body style="background:#09090b; color:#10b981; text-align:center; padding:50px; font-family:sans-serif; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; margin:0;">
                    <h1 style="font-size:3rem; margin-bottom:10px;">✅ Online</h1>
                    <p style="color:#a1a1aa; font-size:1.2rem;">Meena Marketing WhatsApp Server is Connected.</p>
                </body>
            </html>
        `);
    } else if (qrDataURL) {
        res.send(`
            <html>
                <head><meta http-equiv="refresh" content="25"></head>
                <body style="background:#09090b; color:white; text-align:center; padding:50px; font-family:sans-serif; display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; margin:0;">
                    <h2 style="color:#3b82f6; margin-bottom:20px;">Scan to Login - Meena Marketing</h2>
                    <div style="background:white; padding:20px; border-radius:16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                        <img src="${qrDataURL}" alt="WhatsApp QR" style="width:300px; height:300px;"/>
                    </div>
                    <p style="color:#71717a; margin-top:20px;">Page auto-refreshes every 25 seconds.</p>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <head><meta http-equiv="refresh" content="5"></head>
                <body style="background:#09090b; color:#a1a1aa; text-align:center; padding:50px; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
                    <h2>Generating Secure QR Code... Please wait.</h2>
                </body>
            </html>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Web Dashboard running on port ${PORT}`);
});

// ---------------------------------------------------------
// 2. WHATSAPP CLIENT & MEMORY GUARD
// ---------------------------------------------------------
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    }
});

client.on('qr', async (qr) => {
    console.log('🔄 New QR Code Generated. Check Web Dashboard.');
    qrDataURL = await qrcode.toDataURL(qr);
});

client.on('ready', () => {
    console.log('✅ WhatsApp is ready!');
    isConnected = true;
    qrDataURL = ''; // Clear memory
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
// 3. CORE UTILITIES
// ---------------------------------------------------------
const serverStartTime = new Date();
let currentAdminPhone = null;

// Fetch admin on boot
async function fetchAdminPhone() {
    const docSnap = await db.collection('system_folder').doc('config').get();
    if (docSnap.exists && docSnap.data().adminPhone) {
        currentAdminPhone = docSnap.data().adminPhone;
        console.log(`👑 Admin Phone Loaded: ${currentAdminPhone}`);
    }
}
fetchAdminPhone();

// Smart Phone Number Formatter
function formatPhone(num) {
    if (!num) return null;
    let cleaned = num.toString().replace(/[^0-9+]/g, ''); // Remove spaces, dashes, text
    
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
    const input = msg.body.trim();
    const normalizedInput = input.toLowerCase();

    // -- A. Change Admin Flow --
    if (normalizedInput === 'change admin number') {
        waitingForAdminUpdate[msg.from] = true;
        return msg.reply("🛡️ *Admin Configuration*\nPlease enter the new Admin Mobile Number.\n_(Example: 98765 43210 or +91 9876543210)_");
    }

    if (waitingForAdminUpdate[msg.from]) {
        const formattedNewNumber = formatPhone(input);
        
        if (!formattedNewNumber) {
            return msg.reply("❌ *Invalid Number Format.*\nPlease enter a valid 10-digit Indian number.");
        }

        try {
            // Overwrite in database
            await db.collection('system_folder').doc('config').set({ adminPhone: formattedNewNumber }, { merge: true });
            currentAdminPhone = formattedNewNumber;
            delete waitingForAdminUpdate[msg.from];
            
            return msg.reply(`✅ *Admin Successfully Updated*\nAll future billing alerts will be sent to:\n*${formattedNewNumber}*`);
        } catch (err) {
            console.error("Failed to update admin:", err);
            return msg.reply("⚠️ Error updating database.");
        }
    }

    // -- B. Marketing Total Flow --
    if (normalizedInput === 'marketing total') {
        // Optional: Check if msg.from is the admin number. 
        // if (currentAdminPhone && msg.from !== currentAdminPhone + '@c.us') return;

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
});

// ---------------------------------------------------------
// 5. REAL-TIME BILLING TRIGGER (From Firebase)
// ---------------------------------------------------------
// FIX APPLIED HERE: Added .where('createdAt', '>=', serverStartTime) to prevent massive boot-up read leak
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

            // --- A. TEXT ADMIN ALERT (Text Only) ---
            if (currentAdminPhone) {
                // FIX: Strip ALL non-numeric characters (including the '+' symbol) before appending '@c.us'
                const adminWhatsappId = currentAdminPhone.replace(/\D/g, '') + '@c.us';
                
                // Build the item list text dynamically for the admin
                let itemListText = '';
                if (billData.items && Array.isArray(billData.items)) {
                    billData.items.forEach(item => {
                        const modelText = item.model ? ` (Model: ${item.model})` : '';
                        itemListText += `- ${item.qty}x ${item.name}${modelText}\n`;
                    });
                }

                const adminAlert = `🚨 *NEW SALE ALERT*\n\n📄 *Invoice:* ${invNo}\n👤 *Customer:* ${billData.customer?.name || 'Cash Customer'}\n🛍️ *Purchased Items:*\n${itemListText}💰 *Amount:* ₹${grandTotal.toLocaleString()}\n💳 *Mode:* ${payMode}\n\n_Meena Marketing Backend_`;
                
                client.sendMessage(adminWhatsappId, adminAlert).catch(e => console.log("Failed to send admin alert", e));
            }

            // --- B. CUSTOMER RECEIPT (Image + Text) ---
            const rawCustPhone = billData.customer?.phone;
            const formattedCustPhone = formatPhone(rawCustPhone);

            if (formattedCustPhone) {
                // FIX: Strip ALL non-numeric characters (including the '+' symbol)
                const plainPhone = formattedCustPhone.replace(/\D/g, '');
                
                try {
                    // Check if customer is actually on WhatsApp (Using getNumberId prevents the @lid / findChat bug)
                    const contactId = await client.getNumberId(plainPhone);
                    
                    if (contactId) {
                        // Use the exact verified ID from WhatsApp's database
                        const verifiedWhatsappId = contactId._serialized;
                        
                        // 1. Generate Receipt Image
                        const imageBuffer = await generateReceiptImage(client, billData);
                        const media = new MessageMedia('image/png', imageBuffer.toString('base64'), `Receipt_${invNo}.png`);
                        
                        // 2. Bilingual Caption
                        const caption = `🎉 *Thank you for shopping at Meena Marketing!*\n📄 Bill No: *${invNo}*\n💰 Total Amount: *₹${grandTotal.toLocaleString()}*\n📅 Date: ${dateStr}\n\n🎉 *மீனா மார்க்கெட்டிங்கில் பொருட்கள் வாங்கியமைக்கு நன்றி!*\n📄 பில் எண்: *${invNo}*\n💰 மொத்த தொகை: *₹${grandTotal.toLocaleString()}*\n📅 தேதி: ${dateStr}\n\n_System Generated Receipt_`;
                        
                        try {
                            // Attempt 1: Try sending media directly (Works normally for existing chats)
                            await client.sendMessage(verifiedWhatsappId, media, { caption: caption });
                            console.log(`✅ Sent receipt to customer for ${invNo}`);
                        } catch (sendErr) {
                            // Attempt 2: Fallback for 'findChat' / '@lid' multi-device bug
                            if (sendErr.message && (sendErr.message.includes('findChat') || sendErr.message.includes('@lid') || sendErr.message.includes('not found'))) {
                                console.log(`⚠️ Applying initialization workaround for new chat: ${verifiedWhatsappId}`);
                                
                                // Send text first to initialize chat session in cache safely
                                await client.sendMessage(verifiedWhatsappId, `🛍️ Processing your receipt for Invoice: ${invNo}...`);
                                
                                // Brief delay to ensure cache is updated locally
                                await new Promise(resolve => setTimeout(resolve, 1500));
                                
                                // Retry sending the media image
                                await client.sendMessage(verifiedWhatsappId, media, { caption: caption });
                                console.log(`✅ Sent receipt to customer for ${invNo} (after initialization)`);
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
});

// ---------------------------------------------------------
// 6. PUPPETEER IMAGE GENERATOR (Dark Theme Receipt)
// ---------------------------------------------------------
async function generateReceiptImage(client, data) {
    const page = await client.pupBrowser.newPage(); 
    await page.setViewport({ width: 600, height: 800 }); // Compact Receipt Size

    const itemsHtml = (data.items || []).map(item => `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #27272a; padding-bottom:8px;">
            <div>
                <div style="font-weight:700; font-size:16px;">${item.name}</div>
                <div style="color:#a1a1aa; font-size:12px;">${item.qty} x ₹${(item.price || 0).toLocaleString()}</div>
            </div>
            <div style="font-weight:700; font-size:16px;">₹${(item.finalTotal || 0).toLocaleString()}</div>
        </div>
    `).join('');

    const htmlContent = `
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { 
                background: #09090b; color: #fff; font-family: 'Inter', sans-serif; 
                padding: 40px; margin: 0; box-sizing: border-box;
            }
            .header { text-align: center; border-bottom: 2px dashed #3f3f46; padding-bottom: 20px; margin-bottom: 20px; }
            .brand { font-size: 28px; font-weight: 900; color: #ef4444; letter-spacing: -1px; }
            .sub { color: #a1a1aa; font-size: 14px; margin-top: 5px; }
            .meta { display: flex; justify-content: space-between; font-size: 14px; color: #d4d4d8; margin-bottom: 30px; }
            .totals { margin-top: 30px; padding-top: 20px; border-top: 2px solid #ef4444; }
            .t-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 15px; }
            .t-grand { font-size: 24px; font-weight: 900; color: #10b981; margin-top: 15px; }
            .footer { text-align: center; color: #71717a; font-size: 12px; margin-top: 40px; }
            .pay-tag { background: #27272a; padding: 4px 10px; border-radius: 6px; font-weight: 700; color: #3b82f6;}
        </style>
    </head>
    <body>
        <div class="header">
            <div class="brand">MEENA MARKETING</div>
            <div class="sub">Premium Quality Products</div>
        </div>
        
        <div class="meta">
            <div>
                <div style="font-weight:700;">${data.customer?.name || 'Cash Customer'}</div>
                <div style="color:#a1a1aa;">Inv: ${data.invoiceNo}</div>
            </div>
            <div style="text-align:right;">
                <div class="pay-tag">${data.paymentMode || 'Cash'}</div>
            </div>
        </div>

        <div class="items">
            ${itemsHtml}
        </div>

        <div class="totals">
            <div class="t-row">
                <span style="color:#a1a1aa">Subtotal</span>
                <span>₹${(data.totals?.sub || 0).toLocaleString()}</span>
            </div>
            <div class="t-row">
                <span style="color:#a1a1aa">Tax (GST)</span>
                <span>₹${(data.totals?.gst || 0).toLocaleString()}</span>
            </div>
            <div class="t-row t-grand">
                <span>TOTAL</span>
                <span>₹${(data.totals?.grand || 0).toLocaleString()}</span>
            </div>
        </div>

        <div class="footer">
            Thank you for your business!<br>
            Powered by Goorac Software Solutions
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
client.on('ready', () => {
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

// Initialize WhatsApp
client.initialize();
