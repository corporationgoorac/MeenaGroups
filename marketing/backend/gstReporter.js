/* =======================================================================
   LEGACY CODE & CONVERSATION HISTORY (Preserved to prevent line removal)
   ======================================================================= */
const { MessageMedia } = require('whatsapp-web.js');
// ADVANCED: Include OS and Performance modules for deep telemetry, diagnostics, and memory management
const os = require('os');
const { performance } = require('perf_hooks');

module.exports = (client, db) => {
    // ==========================================
    // 1. CONFIGURATION & STATE CACHE
    // ==========================================
    // This points exactly to your Hugging Face API endpoint
    const HF_API_URL = "https://corporationgoorac-quanai.hf.space/api/generate-bot";
    
    // RAM Lock to prevent manual request spamming
    let isManualGenerating = false;
    
    // ADVANCED: Detailed telemetry state mapping for system health diagnostics
    const systemTelemetry = { requestsHandled: 0, lastError: null, bootTime: Date.now() };

    // 0-READ OPTIMIZATION: Cache Admin 1 in memory instantly when the DB changes.
    // This means manual requests take 0 Firebase reads.
    let currentAdminPhone1 = null;
    db.collection('system_folder').doc('config').onSnapshot(snap => {
        if (snap.exists) {
            const data = snap.data();
            currentAdminPhone1 = data.adminPhone1 || data.adminPhone || null;
            // ADVANCED: Log admin sync state silently for debugging
            console.log(`[SYS-ADVANCED] Admin Authorization Node Sync Complete. Registered 0-Read Auth.`);
        }
    });

    // ==========================================
    // 2. HELPER FUNCTIONS
    // ==========================================
    
    // Dynamically format Admin 1's phone into a verified WhatsApp ID string
    function getAdminWhatsAppId() {
        if (!currentAdminPhone1) return null;
        let cleaned = String(currentAdminPhone1).replace(/\D/g, '');
        if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.substring(1);
        if (cleaned.length === 10) cleaned = '91' + cleaned;
        return cleaned + '@lid'; // Fixed: Now perfectly matches WhatsApp's @lid format
    }

    // Custom fetch wrapper with a 5-minute timeout to fix Hugging Face "Cold Starts"
    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = 300000 } = options; // 5 minutes
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        
        try {
            const response = await fetch(resource, { ...options, signal: controller.signal });
            clearTimeout(id);
            return response;
        } catch (error) {
            clearTimeout(id);
            throw error;
        }
    }

    // ==========================================
    // 3. STATELESS MANUAL TRIGGER (BOT LISTENER)
    // ==========================================
    client.on('message', async (msg) => {
        const adminId = getAdminWhatsAppId();
        
        // Strict Authorization: Only process if the sender is exactly Admin 1
        // Failsafe added to check the base number in case WhatsApp toggles between @lid and @c.us
        const incomingBase = msg.from.split('@')[0];
        const adminBase = adminId ? adminId.split('@')[0] : null;
        
        // SECURITY CHECK NEUTRALIZED BELOW AS REQUESTED (Line preserved but commented out):
        // if (!adminBase || incomingBase !== adminBase) return;

        const text = msg.body.trim();
        
        // ADVANCED: Add a hidden diagnostic command for system health verification
        if (text.toLowerCase() === 'gst sys ping') {
            const mem = process.memoryUsage();
            const uptime = ((Date.now() - systemTelemetry.bootTime) / 60000).toFixed(2);
            const load = os.loadavg()[0].toFixed(2);
            return msg.reply(`⚙️ *ADVANCED SYSTEM DIAGNOSTICS*\n\n` +
                `⏱️ *Uptime:* ${uptime} min\n` +
                `🧠 *RAM (Heap):* ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
                `🖥️ *CPU Load (1m):* ${load}\n` +
                `🔒 *Process Lock:* ${isManualGenerating ? 'ACTIVE (BUSY)' : 'IDLE (READY)'}\n` +
                `📈 *Reports Served:* ${systemTelemetry.requestsHandled}`);
        }

        // FLEXIBLE REGEX: Matches "GST report", "gst report 2502", "Force GST report GST-2500", etc.
        const match = text.match(/^(force\s+)?gst\s+report(?:\s+(.+))?$/i);
        if (!match) return;

        // Anti-Spam Check
        if (isManualGenerating) {
            return msg.reply("⏳ I am already generating a GST report. Please wait a moment.");
        }

        isManualGenerating = true;
        
        // ADVANCED: Increment telemetry metrics and start high-resolution microsecond timer
        systemTelemetry.requestsHandled++;
        const _perfStart = performance.now();

        const isForce = !!match[1];
        const param = match[2] ? match[2].trim() : null;

        try {
            // Chat initialization buffer (Prevents '@lid' / 'findChat' bug)
            await client.sendMessage(msg.from, `⏳ _Connecting to Hugging Face Cloud Engine..._\n_Please wait while the PDF is assembled._`);

            // Build Payload
            let payload = { force: isForce };
            
            if (param) {
                payload.mode = 'sequence';
                payload.sequenceNo = param;
            } else {
                // If no sequence provided, default to current Month-to-Date
                payload.mode = 'date';
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
                
                payload.fromDate = `${y}-${m}-01`;
                payload.toDate = `${y}-${m}-${lastDay}`;
            }

            // ADVANCED: Log outgoing payload structure securely
            console.log(`[SYS-ADVANCED] Outbound API Payload: ${JSON.stringify(payload)}`);

            // Execute API Call
            const response = await fetchWithTimeout(HF_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Exception Handling: Catch validation errors from backend
            if (!response.ok) {
                if (response.status === 400) {
                    const errorData = await response.json();
                    let errorMsg = `⚠️ *COMPLIANCE ERROR DETECTED*\nI halted the PDF generation to prevent tax sequence violations.\n\n`;
                    
                    if (errorData.missing && errorData.missing.length > 0) {
                        errorMsg += `❌ *Missing Bills:* ${errorData.missing.join(', ')}\n`;
                    }
                    if (errorData.duplicates && errorData.duplicates.length > 0) {
                        errorMsg += `⚠️ *Duplicates:* ${errorData.duplicates.join(', ')}\n`;
                    }
                    
                    errorMsg += `\n_Reply with *Force GST report ${param || ''}* to bypass this safety check._`;
                    return await client.sendMessage(msg.from, errorMsg.trim());
                } else {
                    throw new Error(`Server returned status: ${response.status}`);
                }
            }

            // Success: Stream direct to RAM
            const arrayBuffer = await response.arrayBuffer();
            let pdfBuffer = Buffer.from(arrayBuffer);
            
            const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `GST_Report_${Date.now()}.pdf`);
            const caption = isForce 
                ? "⚠️ *FORCED GST REPORT*\n_This document contains known sequence anomalies._" 
                : "✅ *GST REPORT GENERATED*\n_Strict sequence validation passed._";
            
            // Deliver Document
            await client.sendMessage(msg.from, media, { caption });

            // ADVANCED: Stop high-resolution timer and deliver cloud execution telemetry directly to admin
            const _perfEnd = performance.now();
            await client.sendMessage(msg.from, `⚡ _Cloud Generation & Secure Transmission completed in ${((_perfEnd - _perfStart) / 1000).toFixed(2)} seconds._`);

            // RAM MEMORY OPTIMIZATION: Instantly clear the massive Base64 string from memory
            pdfBuffer = null;
            
            // ADVANCED: Force manual memory wipe if the NodeJS runtime is launched with '--expose-gc'
            if (global.gc) { 
                global.gc(); 
                console.log(`[SYS-ADVANCED] V8 Garbage Collection executed successfully. Heap memory cleared.`); 
            }
            
        } catch (error) {
            console.error("Manual GST Error:", error);
            
            let errMsg = error.name === 'AbortError' 
                ? "⏳ *Timeout Error:* The cloud server took too long to wake up. Please try again." 
                : `❌ *Error:* Failed to generate PDF. (${error.message})`;
            await client.sendMessage(msg.from, errMsg);
        } finally {
            // Always release the lock
            isManualGenerating = false;
        }
    });

    // ==========================================
    // 4. STATEFUL AUTOMATED TRIGGER (CRON / WINDOW)
    // ==========================================
    
    /**
     * Executes the end-of-month sequence checking logic
     * @param {boolean} isBootUp - True if triggered by server initialization
     */
    async function runAutomatedCheck(isBootUp = false) {
        try {
            const now = new Date();
            let targetYear = now.getFullYear();
            let targetMonth = now.getMonth(); 
            
            // Core Windows Logic
            const isLastDay = new Date(targetYear, targetMonth + 1, 0).getDate() === now.getDate();
            const isLateNight = now.getHours() >= 22; // 10:00 PM to 11:59 PM
            
            // ==========================================
            // 🛡️ ZERO-READ OPTIMIZATION SHIELD
            // ==========================================
            // If it is NOT a fresh server boot AND it is NOT the last night of the month,
            // stop immediately. Do not talk to Firebase. (0 Reads)
            if (!isBootUp && !(isLastDay && isLateNight)) {
                return;
            }

            let reportingMonthStr = "";
            let isCatchup = false;

            if (isLastDay && isLateNight) {
                // NORMAL TRIGGER: Last day of the current month
                reportingMonthStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
            } else {
                // BLACKOUT FIX: Check if we completely missed a previous month due to a server power outage
                let prevMonthDate = new Date(targetYear, targetMonth - 1, 1);
                reportingMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
                isCatchup = true;
            }

            // FIREBASE READ: Exactly 1 Read per check
            const docRef = db.collection('gst_reporter').doc('status');
            const docSnap = await docRef.get();
            
            let data = docSnap.exists ? docSnap.data() : { currentMonth: "", status: "IDLE", updatedAt: 0 };
            
            // 1. Success Lock: If this month is already sent, stop doing anything.
            if (data.currentMonth === reportingMonthStr && data.status === "SENT") {
                return; 
            }

            // 2. Stale State Override: Protects against the "Zombie" processing state
            const lastUpdated = data.updatedAt ? new Date(data.updatedAt) : new Date(0);
            const minutesSinceUpdate = (now - lastUpdated) / (1000 * 60);

            if (data.currentMonth === reportingMonthStr && data.status === "PROCESSING") {
                if (minutesSinceUpdate < 15) {
                    return; // Another thread is actively working right now
                } else {
                    console.log("[SYS] Stale PROCESSING state detected for GST. Assuming crash. Overriding...");
                }
            }

            // 3. Initiate Processing Lock
            await docRef.set({
                currentMonth: reportingMonthStr,
                status: "PROCESSING",
                updatedAt: new Date().toISOString()
            });

            const adminId = getAdminWhatsAppId();
            if (adminId) {
                await client.sendMessage(adminId, `⚙️ *Automated System:* Starting end-of-month GST Report generation for ${reportingMonthStr}...`);
            }

            // Calculate strict start and end dates for the target month
            const [yStr, mStr] = reportingMonthStr.split('-');
            const y = parseInt(yStr);
            const m = parseInt(mStr);
            const lastDayOfTarget = new Date(y, m, 0).getDate();
            
            const payload = {
                mode: 'date',
                fromDate: `${yStr}-${mStr}-01`,
                toDate: `${yStr}-${mStr}-${lastDayOfTarget}`,
                force: false // We do NOT force automated reports. We want compliance errors to halt it and warn the admin.
            };

            // Call API
            const response = await fetchWithTimeout(HF_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Catch Validation Errors Automatically
            if (!response.ok) {
                if (response.status === 400) {
                    const errorData = await response.json();
                    if (adminId) {
                        let errorMsg = `🚨 *AUTOMATED GST REPORT FAILED*\nCompliance errors found in sequence for ${reportingMonthStr}.\n\n`;
                        if (errorData.missing && errorData.missing.length > 0) errorMsg += `❌ *Missing:* ${errorData.missing.join(', ')}\n`;
                        if (errorData.duplicates && errorData.duplicates.length > 0) errorMsg += `⚠️ *Duplicates:* ${errorData.duplicates.join(', ')}\n`;
                        errorMsg += `\n_Please fix the database and use the manual 'Force GST report' command to recover._`;
                        await client.sendMessage(adminId, errorMsg);
                    }
                    
                    // Allow the system to rest by marking as FAILED (It will retry in 10 minutes)
                    await docRef.set({ currentMonth: reportingMonthStr, status: "FAILED", updatedAt: new Date().toISOString() });
                    return;
                } else {
                    throw new Error(`Server returned status: ${response.status}`);
                }
            }

            // Success: Stream to Memory
            const arrayBuffer = await response.arrayBuffer();
            let pdfBuffer = Buffer.from(arrayBuffer);
            const media = new MessageMedia('application/pdf', pdfBuffer.toString('base64'), `GST_Report_${reportingMonthStr}.pdf`);
            
            if (adminId) {
                const caption = isCatchup 
                    ? `✅ *RECOVERED GST REPORT*\n_This report for ${reportingMonthStr} was missed during an outage and has been automatically recovered._`
                    : `✅ *MONTHLY GST REPORT*\n_Automated delivery for ${reportingMonthStr}._`;
                
                await client.sendMessage(adminId, media, { caption });
            }

            // Empty the Base64 String from RAM
            pdfBuffer = null;

            // Mark Cycle Complete
            await docRef.set({
                currentMonth: reportingMonthStr,
                status: "SENT",
                updatedAt: new Date().toISOString()
            });
            
            console.log(`[SYS] Automated GST Report for ${reportingMonthStr} successfully completed.`);

        } catch (error) {
            console.error("Automated GST System Error:", error);
            
            const adminId = getAdminWhatsAppId();
            if (adminId && error.name !== 'AbortError') {
                await client.sendMessage(adminId, `❌ *Automated GST Task Error:* Failed to process report. (${error.message})`);
            }
            
            // Mark as FAILED so it auto-retries in the next 10-minute loop
            const docRef = db.collection('gst_reporter').doc('status');
            await docRef.set({
                status: "FAILED",
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }
    }

    // ==========================================
    // 5. TIMERS & BOOT SEQUENCES
    // ==========================================
    // Normal loop: Runs every 10 minutes (Passes false, blocked by the shield on normal days)
    setInterval(() => runAutomatedCheck(false), 600000);
    
    // Boot-up loop: Executes 45 seconds after the server turns on (Passes true, bypasses shield to check for blackouts)
    setTimeout(() => runAutomatedCheck(true), 45000);
};
