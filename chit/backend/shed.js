const fs = require('fs'); // FIXED: Lowercase 'const' prevents startup crash

// =========================================================
// 🕒 UTC to IST (Indian Standard Time) Converter Engine
// =========================================================
function getIST() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (330 * 60000)); // +5.5 Hours for IST
}

function getISTDateString(istDate) {
    return `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}-${String(istDate.getDate()).padStart(2, '0')}`;
}

// =========================================================
// 🧮 CHITFUND MATH ENGINES (Copied from Core Architecture)
// =========================================================
function calculateCurrentMonth(startDateStr) {
    if(!startDateStr) return 1; 
    const start = (typeof startDateStr.toDate === 'function') ? startDateStr.toDate() : new Date(startDateStr);
    if (isNaN(start)) return 1;
    
    const now = getIST();
    let months = (now.getFullYear() - start.getFullYear()) * 12;
    months -= start.getMonth();
    months += now.getMonth();
    return months <= 0 ? 1 : months + 1; 
}

function calculateDueForMonth(targetMonth, startAmount, schedule) {
    if (targetMonth <= 1) return startAmount;
    let currentAmount = startAmount;
    for (let m = 2; m <= targetMonth; m++) {
        let increment = 0;
        for (let tier of schedule) {
            if (m >= tier.start && m <= tier.end) {
                increment = tier.amount; break;
            }
        }
        currentAmount += increment;
    }
    return currentAmount;
}

// =========================================================
// 🛡️ UNIVERSAL NUMBER SANITIZER
// =========================================================
function sanitizeNumberForWhatsApp(rawNum) {
    if (!rawNum) return null;
    // 1. Strip everything except numbers
    let clean = rawNum.toString().replace(/\D/g, '');
    
    // 2. Remove leading zero if 11 digits (e.g. 09080246126 -> 9080246126)
    if (clean.startsWith('0') && clean.length === 11) clean = clean.substring(1);
    
    // 3. Auto-inject Indian country code if missing
    if (clean.length === 10) clean = '91' + clean;
    
    // 4. Final Validation: Must be 12 digits and start with 91
    if (clean.length === 12 && clean.startsWith('91')) return clean + '@c.us';
    
    return null; // Rejected Ghost Number
}

// =========================================================
// 🚀 MAIN SCHEDULER EXPORT
// =========================================================
module.exports = function(client, admin) {
    // --- ADVANCED EDGE CASE FIX: SELF-PROTECTING DUPLICATE GUARD ---
    // Prevents this file from generating duplicate intervals if the bot reconnects
    if (client._shedEngineLoaded) {
        console.log("⚡ [SHED.JS] Scheduler is already active in memory. Preventing duplicate intervals.");
        return;
    }
    client._shedEngineLoaded = true;

    const db = admin.firestore();
    console.log("⏰ [SHED.JS] Global Alternate-Day Reminder System Booting Up...");

    let isProcessing = false;
    let memState = {
        date: null,              // <-- FIXED EDGE CASE: Added missing var to prevent infinite tick rollovers!
        lastActiveDate: null,    // Tracks the last "Work Day"
        targetGroupIndex: 0,     // Which group we are currently on
        sentToday: [],           // Prevents double-sending mid-crash
        queue: [],               // Current users waiting for message
        isCompleted: false,      // Is today's group finished?
        nextAllowedSendTime: 0   // Unix timestamp in ms
    };

    const stateRef = db.collection('system').doc('scheduler_state');

    // --- 1. BOOT-UP SYNC (The Only Read Operation) ---
    async function syncStateFromDB() {
        try {
            const snap = await stateRef.get();
            if (snap.exists) {
                memState = { ...memState, ...snap.data() };
            } else {
                await stateRef.set(memState); // Create genesis block
            }
            console.log("📥 [SHED.JS] Checkpoint synced to RAM successfully.");
        } catch (e) {
            console.error("❌ [SHED.JS] Failed to sync checkpoint:", e);
        }
    }

    // --- 2. THE CHECKPOINT SAVER (Writes are cheap) ---
    async function saveStateToDB() {
        try {
            await stateRef.set(memState);
        } catch (e) {
            console.error("❌ [SHED.JS] Failed to save checkpoint:", e);
        }
    }

    // --- 3. THE ALTERNATE-DAY QUEUE BUILDER ---
    async function prepareNextGroup() {
        const todayIST = getIST();
        const todayStr = getISTDateString(todayIST);
        
        // Calculate yesterday's date string safely
        const yesterdayIST = new Date(todayIST.getTime() - 86400000); 
        const yesterdayStr = getISTDateString(yesterdayIST);

        // Daily Reset Logic (FIXED COLLISION WITH ALTERNATE DAY LOGIC)
        if (memState.date !== todayStr) {
            memState.date = todayStr;
            /* --- ORIGINAL CODE COMMENTED OUT TO PREVENT GHOST-RESET BUG ---
            memState.groupIndex = 0;
            memState.sentToday = [];
            memState.isCompleted = false;
            memState.queue = [];
            ----------------------------------------------------------------- */
            console.log(`🌅 [SHED.JS] New Day Detected (${todayStr}). Internal clock updated...`);
        }

        // ===================================================
        // THE "REST DAY" LOGIC
        // ===================================================
        if (memState.lastActiveDate === yesterdayStr) {
            console.log("😴 [SHED.JS] Today is a Rest Day. Bot will sleep until tomorrow.");
            memState.isCompleted = true; // FIXED: Prevent endless tick() spam today!
            await saveStateToDB();
            return; // Stop execution entirely.
        }

        // ===================================================
        // THE "WORK DAY" LOGIC
        // ===================================================
        if (memState.lastActiveDate !== todayStr) {
            // It's a new work day! Advance to the next group (unless it's the very first run ever)
            if (memState.lastActiveDate !== null) {
                memState.targetGroupIndex++;
            }
            
            memState.lastActiveDate = todayStr;
            memState.sentToday = [];
            memState.isCompleted = false;
            memState.queue = [];
            console.log(`🌅 [SHED.JS] Work Day Detected (${todayStr}). Preparing next group...`);
            await saveStateToDB();
        }

        // If we already finished today's group, or we already have a queue loaded, skip building.
        if (memState.isCompleted || memState.queue.length > 0) return; 

        try {
            // Fetch Groups (Deterministic Sorting so the order never changes)
            const groupsSnap = await db.collection('groups').orderBy('createdAt', 'asc').get();
            const groups = [];
            groupsSnap.forEach(g => groups.push({ id: g.id, ...g.data() }));

            if (groups.length === 0) return; // No groups exist yet

            // ENDLESS LOOP TRICK: Modulo operator ensures index wraps around automatically (e.g., 0, 1, 2, 0, 1...)
            const safeIndex = memState.targetGroupIndex % groups.length;
            const activeGroup = groups[safeIndex];
            
            console.log(`⚙️ [SHED.JS] Processing Group: ${activeGroup.groupName} (@${activeGroup.id})`);

            // Fetch Transactions for THIS group ONLY
            const txnsSnap = await db.collection('transactions').where('groupId', '==', activeGroup.id).get();
            const allGroupTxns = [];
            txnsSnap.forEach(t => allGroupTxns.push(t.data()));

            const systemCurrentMonth = calculateCurrentMonth(activeGroup.startDate);
            const totalGroupMonths = parseInt(activeGroup.totalMonths) || 0;
            const evalMonth = systemCurrentMonth > totalGroupMonths ? totalGroupMonths : systemCurrentMonth;

            // Extract users strictly assigned to this group (via activeGroups array)
            const usersSnap = await db.collection('users').where('activeGroups', 'array-contains', activeGroup.id).get();
            
            let tempQueue = [];

            usersSnap.forEach(uDoc => {
                const user = uDoc.data();
                user.id = uDoc.id;

                // Skip if already sent today (Mid-crash recovery check)
                if (memState.sentToday.includes(user.id)) return;

                // Calculate User's Ledger
                let maxMonthPaid = 0;
                allGroupTxns.forEach(txn => {
                    if (txn.subscriberId === user.id && txn.monthAttributed > maxMonthPaid) {
                        maxMonthPaid = txn.monthAttributed;
                    }
                });

                let pendingAmount = 0;
                let pendingMonthsCount = 0;
                let breakdownStr = ""; // NEW: Stores the schedule string breakdown
                
                if (evalMonth > maxMonthPaid) {
                    pendingMonthsCount = evalMonth - maxMonthPaid;
                    for (let m = maxMonthPaid + 1; m <= evalMonth; m++) {
                        let dueForM = calculateDueForMonth(m, activeGroup.startAmount || 0, activeGroup.installmentSchedule || []);
                        pendingAmount += dueForM;
                        breakdownStr += `\n   ▫️ Month ${m}: ₹${dueForM.toLocaleString('en-IN')}`; // Formats the exact amount due per month
                    }
                }

                // If they owe money, add to queue!
                if (pendingAmount > 0) {
                    tempQueue.push({
                        id: user.id,
                        name: user.name,
                        phone: user.phone,
                        groupName: activeGroup.groupName,
                        pendingAmount: pendingAmount,
                        pendingMonthsCount: pendingMonthsCount,
                        breakdown: breakdownStr // Passed to the dispatcher
                    });
                }
            });

            if (tempQueue.length === 0) {
                // ZERO DUES QUICK-SKIP: Nobody owes anything. Mark day as completed instantly.
                console.log(`⏩ [SHED.JS] Group ${activeGroup.groupName} has 0 dues. Day marked as complete.`);
                memState.isCompleted = true;
                await saveStateToDB();
            } else {
                // Work found! Lock it in RAM and DB.
                memState.queue = tempQueue;
                memState.nextAllowedSendTime = getIST().getTime() + 10000; // Start in 10 seconds
                await saveStateToDB();
                console.log(`🎯 [SHED.JS] Found ${tempQueue.length} pending dues. Queue locked and ready.`);
            }

        } catch (error) {
            console.error("❌ [SHED.JS] Error building queue:", error);
        }
    }

    // --- 4. THE DISPATCHER (0-Read Execution) ---
    async function dispatchNextMessage() {
        if (memState.queue.length === 0) return;

        const target = memState.queue.shift(); // Remove from front of queue
        const waId = sanitizeNumberForWhatsApp(target.phone);

        if (!waId) {
            console.log(`👻 [SHED.JS] Skipping ${target.name} (@${target.id}) - Invalid Phone Number`);
            memState.sentToday.push(target.id);
            await saveStateToDB();
            return;
        }

        try {
            // THE 10-SECOND GUILLOTINE: Prevents WA API Infinite Hangs
            /* --- ORIGINAL CODE COMMENTED OUT DUE TO MEMORY LEAK RISK ---
            const isRegistered = await Promise.race([
                client.isRegisteredUser(waId),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]).catch(() => false);
            -------------------------------------------------------------- */
            
            // FIXED MEMORY LEAK: Added clearTimeout so Node.js event loop doesn't get flooded over time.
            let timeoutHandle;
            const isRegistered = await Promise.race([
                client.isRegisteredUser(waId),
                new Promise((_, reject) => { timeoutHandle = setTimeout(() => reject(new Error('Timeout')), 10000); })
            ]).catch(() => false).finally(() => clearTimeout(timeoutHandle));

            if (!isRegistered) {
                console.log(`📵 [SHED.JS] Skipping ${target.name} - Not on WhatsApp.`);
            } else {
                console.log(`💬 [SHED.JS] Initiating contact with ${target.name} (${waId})...`);

                // HUMANIZER ENGINE: Simulate human typing behavior
                await client.sendPresenceAvailable();
                await client.pupPage.evaluate((chatId) => { window.Store.WapQuery.sendChatstateComposing(chatId); }, waId).catch(() => {});
                
                const typingDelay = Math.floor(Math.random() * (8000 - 4000 + 1) + 4000); // 4 to 8 seconds
                await new Promise(resolve => setTimeout(resolve, typingDelay));

                // Formulate Professional Payload (UPGRADED WITH EXACT BREAKDOWN)
                const msgText = `⚠️ *Payment Reminder / கட்டண நினைவூட்டல்*\n\nDear *${target.name}*,\nYour chit installment for the group *${target.groupName}* is currently pending.\n\n🔸 *Total Pending:* ₹${target.pendingAmount.toLocaleString('en-IN')}\n🔸 *Duration:* ${target.pendingMonthsCount} Month(s)\n\n📋 *Dues Breakdown:*${target.breakdown}\n\nKindly clear the dues at the earliest. Please ignore this message if you have already paid.\n\n✨ _System Generated by Meena Chitfunds_`;
                
                await client.sendMessage(waId, msgText);
                console.log(`✅ [SHED.JS] Reminder successfully sent to ${target.name}.`);
                
                // --- ADVANCED AUDIT: Memory Health Tracking post-send ---
                const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
                if (memUsed > 400) console.log(`⚠️ [SHED.JS] Notice: Memory footprint elevated (${memUsed}MB)`);
            }
        } catch (err) {
            console.error(`❌ [SHED.JS] Dispatch error for ${target.name}:`, err);
        }

        // Lock success into DB
        memState.sentToday.push(target.id);
        
        // --- DYNAMIC DELAY CALCULATOR ---
        if (memState.queue.length === 0) {
            // Daily Group Finished! Mark as complete for the rest of today.
            memState.isCompleted = true;
            console.log(`✅ [SHED.JS] Group finished for today. Bot will rest tomorrow.`);
        } else {
            // Calculate remaining duty time today (Duty stops at 10 PM / 22:00)
            const currentIST = getIST();
            const endOfDay = new Date(currentIST);
            endOfDay.setHours(22, 0, 0, 0); // 10:00:00 PM IST

            let remainingMinutes = (endOfDay.getTime() - currentIST.getTime()) / 60000;
            
            if (remainingMinutes <= 0) remainingMinutes = 5; // Failsafe if running late

            let avgDelay = remainingMinutes / memState.queue.length;
            avgDelay = Math.max(2, Math.min(45, avgDelay)); // Clamp between 2 mins and 45 mins

            // Randomize by +/- 20%
            const randomFactor = (Math.random() * 0.4) - 0.2; 
            let actualDelayMins = avgDelay * (1 + randomFactor);
            
            let nextRun = new Date(currentIST.getTime() + (actualDelayMins * 60000));

            // THE NIGHT SHIFT LOCK: If calculation pushes past 10 PM, force it to 6:05 AM tomorrow
            if (nextRun.getTime() > endOfDay.getTime()) {
                const nextMorning = new Date(currentIST);
                nextMorning.setDate(nextMorning.getDate() + 1);
                nextMorning.setHours(6, 5, 0, 0); // 6:05 AM IST
                nextRun = nextMorning;
                console.log(`🌙 [SHED.JS] Night shift triggered. Suspending queue until ${nextRun.toLocaleString('en-IN')}`);
            }

            memState.nextAllowedSendTime = nextRun.getTime();
            console.log(`⏱️ [SHED.JS] Calculated Delay: ~${Math.round(actualDelayMins)} mins. Next send scheduled for ${nextRun.toLocaleTimeString('en-IN')}`);
        }

        await saveStateToDB(); // Save the checkpoint
    }

    // --- 5. THE ZERO-POLL IN-MEMORY TICKER (Runs every 60 seconds) ---
    async function tick() {
        if (isProcessing) return;
        isProcessing = true;

        // --- ADVANCED SAFEGUARD: WHATSAPP CONNECTION CHECK ---
        // Prevents the scheduler from burning the queue if the phone disconnects from WA Web
        if (!client || !client.info) {
            console.log("⏳ [SHED.JS] WhatsApp Client not authenticated. Pausing scheduler...");
            isProcessing = false;
            return;
        }

        try {
            const currentIST = getIST();
            const currentHour = currentIST.getHours();

            // --- ADVANCED EDGE CASE FIX: DAY CARRY-OVER PROTECTION ---
            // If the queue spilled over into a new day (Night Shift Lock), we must force a fresh daily evaluation.
            const todayStrCheck = getISTDateString(currentIST);
            if (memState.date !== todayStrCheck && memState.date !== null) {
                console.log(`🔄 [SHED.JS] Day rollover detected (${todayStrCheck}). Re-evaluating Rest/Work schedule...`);
                // By temporarily emptying the queue, we force prepareNextGroup() to process the new day properly.
                memState.queue = []; 
                memState.isCompleted = false;
            }

            // DUTY TIME CHECK (6 AM to 10 PM)
            if (currentHour < 6 || currentHour >= 22) {
                isProcessing = false;
                return; // Outside duty hours. Go back to sleep instantly (0 Reads).
            }

            // Check if queue needs building
            if (memState.queue.length === 0 && !memState.isCompleted) {
                await prepareNextGroup();
            }

            // TIME LOCK CHECK (In-Memory)
            if (memState.queue.length > 0 && currentIST.getTime() >= memState.nextAllowedSendTime) {
                // Catch-up Mode Check (If delayed by > 5 minutes, force rapid fire to catch up)
                if (currentIST.getTime() - memState.nextAllowedSendTime > 300000) {
                    console.log("⚡ [SHED.JS] Deep Sleep recovered. Activating Catch-Up Mode...");
                }
                
                await dispatchNextMessage();
            }

        } catch (error) {
            console.error("❌ [SHED.JS] Ticker Crash:", error);
        }

        isProcessing = false;
    }

    // =========================================================
    // INITIALIZATION
    // =========================================================
    setTimeout(async () => {
        await syncStateFromDB();
        // Start the silent heartbeat ticker (Every 60 seconds)
        setInterval(tick, 60000); 
    }, 5000); // 5 sec boot delay to let WhatsApp client settle
};
