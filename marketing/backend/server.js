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
// 3. CORE UTILITIES & DUAL ADMIN SETUP
// ---------------------------------------------------------
const serverStartTime = new Date();
const sleep = (ms) => new Promise(res => setTimeout(res, ms)); // ENTERPRISE FIX: Global sleep utility for WhatsApp DOM delays

let currentAdminPhone1 = null;
let currentAdminPhone2 = null;
let currentAdminPhone3 = null;
let admin1AlertsEnabled = true; // MEMORY CACHE GUARD: Keeps track of admin 1 sales alerts toggles with 0 continuous database reads

// Fetch admins on boot
async function fetchAdminPhone() {
    const docSnap = await db.collection('system_folder').doc('config').get();
    if (docSnap.exists) {
        const data = docSnap.data();
        // Support legacy 'adminPhone' field for Admin 1 backward compatibility
        currentAdminPhone1 = data.adminPhone1 || data.adminPhone || null;
        currentAdminPhone2 = data.adminPhone2 || null;
        currentAdminPhone3 = data.adminPhone3 || null;
        
        // Sync active state from DB on boot up
        if (data.admin1AlertsEnabled !== undefined) {
            admin1AlertsEnabled = data.admin1AlertsEnabled;
        }
        
        console.log(`👑 Admin 1 Phone Loaded: ${currentAdminPhone1 || 'Not Set'} (Sales Alert State: ${admin1AlertsEnabled ? 'ACTIVE' : 'MUTED'})`);
        console.log(`👑 Admin 2 Phone Loaded: ${currentAdminPhone2 || 'Not Set'}`);
        console.log(`👑 Admin 3 Phone Loaded: ${currentAdminPhone3 || 'Not Set'}`);
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

    // -- C. List Admins Flow --
    if (normalizedInput === 'list admin numbers' || normalizedInput === 'list admin phone number') {
        return msg.reply(`📋 *Current Admin Configuration*\n\n👑 *Admin 1:* ${currentAdminPhone1 || 'Not set'} (Alerts: ${admin1AlertsEnabled ? 'Enabled' : 'Muted'})\n👑 *Admin 2:* ${currentAdminPhone2 || 'Not set'}\n👑 *Admin 3:* ${currentAdminPhone3 || 'Not set'}`);
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

    // -- Process Admin Input --
    if (waitingForAdminUpdate[msg.from]) {
        const adminSlot = waitingForAdminUpdate[msg.from];
        const formattedNewNumber = formatPhone(input);
        
        if (!formattedNewNumber) {
            return msg.reply("❌ *Invalid Number Format.*\nPlease enter a valid 10-digit Indian number.");
        }

        try {
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
                                const item = billData.items[0];
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
                    const adminPlainPhone = adminPhone.replace(/\D/g, '');
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
                const plainPhone = formattedCustPhone.replace(/\D/g, '');
                
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
                                await sleep(1500);
                                
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

    const adminPlainPhone = currentAdminPhone1.replace(/\D/g, '');
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
});

// ---------------------------------------------------------
// 6. PUPPETEER IMAGE GENERATOR (Redesigned & Overlap Fixed)
// ---------------------------------------------------------
async function generateReceiptImage(client, data) {
    const page = await client.pupBrowser.newPage(); 
    await page.setViewport({ width: 600, height: 800 }); // Compact Receipt Size

    // FIX: Replaced '₹' with 'Rs.' so standard English font letters are used. This 100% prevents the overlapping issue on Linux Headless servers.
    const itemsHtml = (data.items || []).map(item => `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:15px; margin-bottom:12px; border-bottom:1px solid #27272a; padding-bottom:10px;">
            <div style="flex: 1; word-break: break-word; overflow-wrap: break-word;">
                <div style="font-weight:700; font-size:16px; line-height:1.4;">${item.name}</div>
                <div style="color:#a1a1aa; font-size:13px; margin-top:4px;">${item.qty} x Rs. ${(item.price || 0).toLocaleString()}</div>
            </div>
            <div style="font-weight:700; font-size:16px; white-space:nowrap; text-align:right; min-width:80px;">Rs. ${(item.finalTotal || 0).toLocaleString()}</div>
        </div>
    `).join('');

    const htmlContent = `
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=Noto+Sans+Tamil:wght@400;700&display=swap');
            
            body { 
                background: #000000; color: #ffffff; 
                font-family: 'Inter', 'Noto Sans Tamil', sans-serif; 
                padding: 30px; margin: 0; box-sizing: border-box;
            }
            .receipt-card {
                background: #0f0f11;
                border: 1px solid #27272a;
                border-radius: 16px;
                padding: 30px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            }
            .header { text-align: center; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid #27272a; }
            .brand { font-size: 28px; font-weight: 900; color: #ef4444; letter-spacing: -0.5px; }
            .sub { color: #a1a1aa; font-size: 14px; margin-top: 5px; }
            
            .meta { display: flex; justify-content: space-between; align-items: center; background: #18181b; padding: 15px; border-radius: 10px; margin-bottom: 25px; }
            .meta-left { display: flex; flex-direction: column; gap: 4px; }
            .meta-name { font-weight: 700; font-size: 16px; color: #f4f4f5; }
            .meta-inv { color: #a1a1aa; font-size: 13px; }
            .pay-tag { background: #2563eb; padding: 6px 14px; border-radius: 8px; font-weight: 700; color: #ffffff; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
            
            .totals { margin-top: 25px; padding-top: 20px; border-top: 2px dashed #3f3f46; }
            .t-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 15px; }
            .t-row span:last-child { white-space: nowrap; text-align: right; font-weight: 600; }
            
            .t-grand { font-size: 22px; font-weight: 900; color: #10b981; margin-top: 20px; padding-top: 15px; border-top: 1px solid #27272a; }
            
            .footer { text-align: center; color: #71717a; font-size: 12px; margin-top: 35px; line-height: 1.6; }
        </style>
    </head>
    <body>
        <div class="receipt-card">
            <div class="header">
                <div class="brand">MEENA MARKETING</div>
                <div class="sub">Premium Quality Products</div>
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
                    <span style="color:#a1a1aa">Subtotal</span>
                    <span>Rs. ${(data.totals?.sub || 0).toLocaleString()}</span>
                </div>
                <div class="t-row">
                    <span style="color:#a1a1aa">Tax (GST)</span>
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

// Initialize WhatsApp
client.initialize();
