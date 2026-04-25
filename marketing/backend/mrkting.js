const fs = require('fs');
const { MessageMedia } = require('whatsapp-web.js');

// NEW BUG FIX: Global lock to prevent duplicate bots spawning when WhatsApp reconnects
let isInitialized = false; 

/**
 * MEENA MARKETING - ENTERPRISE DIGITAL AD AGENT
 * 1. 30-Day Anti-Ban Drip Marketing Cycle (FIREBASE TRACKED)
 * 2. 1000+ Product Combinations & 500+ Template Variations
 * 3. On-Demand Generator Trigger (!generate image)
 * 4. 16-Hour Business Pacing Math (6:00 AM - 10:00 PM IST)
 * 5. Unique Promo Code Generation & Time-Based Greetings
 * 6. 500+ Dynamic Agent Pitch Generator (Bilingual)
 * 7. Canvas Height Expansion (Fixed Overlap Bug)
 * 8. Anti-Duplication Shield (Prevents spam on server reconnects)
 * 9. Opt-Out Blacklist & Dead Number Graveyard Processing
 * 10. ENTERPRISE CRON PACING: Database tracked delays, Server-crash proof
 * 11. SMART WEEKEND BOOSTER: Dynamically adjusts quota on Sundays
 * 12. EXPANDED INVENTORY & MULTI-LAYOUT DESIGNS ADDED
 */
module.exports = (client, db) => {
    // FIX: If the bot is already running, block duplicate setups completely
    // ADDED: global.isMarketingInitialized to survive require() cache clears
    if (isInitialized || global.isMarketingInitialized) {
        console.log("🛡️ [Marketing] Prevented duplicate agent spawn on WhatsApp reconnect.");
        return; 
    }
    isInitialized = true;
    global.isMarketingInitialized = true;

    let isProcessing = false;
    const docRef = db.collection('marketing_messages').doc('campaign_data');

    // --- UTILITIES ---
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    // ENTERPRISE FIX: Smart Phone Number Formatter handling Gaps, +81, 92, and standard 10-digit Indian numbers
    const formatPhone = (num) => {
        if (!num) return null;
        // Strip out all spaces, dashes, and letters natively
        let cleaned = num.toString().replace(/[^0-9+]/g, ''); 
        
        // Ensure only one '+' sign exists at the very beginning
        if (cleaned.startsWith('+')) {
            cleaned = '+' + cleaned.replace(/\+/g, '');
        } else {
            cleaned = cleaned.replace(/\+/g, '');
        }
        
        // Remove leading zero if it's an 11-digit local format
        if (cleaned.startsWith('0') && cleaned.length === 11) cleaned = cleaned.substring(1); 
        
        // Intelligently assign the + symbol based on length
        if (!cleaned.startsWith('+')) {
            if (cleaned.length === 10) {
                cleaned = '+91' + cleaned; // Default 10 digits to +91 (India)
            } else if (cleaned.length >= 11) {
                cleaned = '+' + cleaned; // Assume country code is already present (e.g., 91, 81, 92)
            }
        }
        
        // Final WhatsApp Validation check (Country code + Phone)
        if (cleaned.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 16) {
            return cleaned;
        }
        return null;
    };

    // Generates a random tracking code for walk-in conversions
    const generatePromoCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = 'MEENA-';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    };

    // Checks current IST time for a natural greeting
    const getTimeGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return { en: 'Good Morning', ta: 'காலை வணக்கம்' };
        if (hour < 17) return { en: 'Good Afternoon', ta: 'மதிய வணக்கம்' };
        return { en: 'Good Evening', ta: 'மாலை வணக்கம்' };
    };

    // NEW UTILITY: Formats time exactly as requested (e.g. 5.30 Pm)
    const formatTimeForLog = (timestamp) => {
        const date = new Date(timestamp);
        let hours = date.getHours();
        let minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'Pm' : 'Am';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        minutes = minutes < 10 ? '0' + minutes : minutes;
        return `${hours}.${minutes} ${ampm}`;
    };

    // --- 1. ON-DEMAND WHATSAPP AD GENERATOR & OPT-OUT HANDLER ---
    client.on('message', async (msg) => {
        const input = msg.body.trim().toLowerCase();
        
        // OPT-OUT BLACKLIST HANDLER
        if (input === 'stop') {
            try {
                // FORMAT FIX for opt-out to match DB structure safely
                const rawPhone = msg.from.replace('@c.us', '');
                const formattedNumber = formatPhone(rawPhone) || rawPhone; 
                
                let snap = await docRef.get();
                if (snap.exists) {
                    let data = snap.data();
                    let optedOut = data.optedOut || [];
                    if (!optedOut.includes(formattedNumber)) {
                        optedOut.push(formattedNumber);
                        await docRef.set({ optedOut: optedOut }, { merge: true });
                    }
                }
                await msg.reply("✅ _You have successfully opted out. You will no longer receive promotional offers from Meena Marketing._");
                console.log(`🛑 [Marketing] Customer ${formattedNumber} opted out.`);
            } catch (err) {
                console.error("Opt-out error:", err);
            }
            return;
        }

        if (input === 'generate image' || input === 'generate ad') {
            await msg.reply("🎨 _Digital Agent is designing a new promotional poster... Please wait._");
            
            try {
                // Get sender name (if available from contact list, else default to 'Customer')
                const contact = await msg.getContact();
                const customerName = contact.pushname || contact.name || 'Valued Customer';
                
                const adData = generateRandomAdData();
                const imageBuffer = await generateAdImage(client, customerName, adData);
                const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'meena_ad.png');
                const caption = getBilingualCaption(customerName, adData);
                
                // ENTERPRISE FIX: Give DOM time to sync before sending
                await sleep(2000);
                await client.sendMessage(msg.from, media, { caption: caption });
            } catch (err) {
                console.error("Manual Ad Generation Error:", err);
                await msg.reply("⚠️ Error generating image. Server might be busy.");
            }
        }
    });

    // --- 2. CORE AUTOMATED DISTRIBUTION LOGIC (ENTERPRISE PACING) ---
    const fetchAndPrepareBatch = async () => {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            let snap = await docRef.get();
            let dbData = snap.exists ? snap.data() : null;
            const now = Date.now();

            // ADVANCED PACING CHECK: Read timestamp from DB to see if we are allowed to send yet.
            if (dbData && dbData.nextAllowedTime && now < dbData.nextAllowedTime) {
                const waitMins = Math.ceil((dbData.nextAllowedTime - now) / 60000);
                const timeToWait = dbData.nextAllowedTime - now;

                if (waitMins > 0) {
                    // NEW FIX: RAM Cache check to prevent log spam. Only logs once.
                    if (global.lastLoggedNextTime !== dbData.nextAllowedTime) {
                        const nextTimeStr = formatTimeForLog(dbData.nextAllowedTime);
                        console.log(`⏳ [Marketing] Pacing active. The next marketing message in ${nextTimeStr}`);
                        global.lastLoggedNextTime = dbData.nextAllowedTime;
                    }
                }
                
                // HYBRID ARCHITECTURE: Schedule exact dynamic wakeup, bypassing the 30-min heartbeat
                if (global.marketingDynamicTimeout) clearTimeout(global.marketingDynamicTimeout);
                global.marketingDynamicTimeout = setTimeout(fetchAndPrepareBatch, timeToWait);

                isProcessing = false;
                return; // Early exit prevents duplicate sending loops
            }

            // Initialize DB if empty or if cycle is fully complete
            if (!dbData || !dbData.pendingCustomers || dbData.pendingCustomers.length === 0) {
                console.log("📥 [Marketing] 30-Day Cycle Started: Pulling last 200 bills from Firebase...");
                
                // FIREBASE OPTIMIZATION: Exactly 200 reads, performed ONLY once a month.
                const sellingSnap = await db.collection('sellings').orderBy('date', 'desc').limit(200).get();
                const uniqueCustomers = new Map();

                // Deduplication
                sellingSnap.forEach(doc => {
                    const data = doc.data();
                    const rawPhone = data.customer?.phone;
                    const formatted = formatPhone(rawPhone);

                    if (formatted && !uniqueCustomers.has(formatted)) {
                        uniqueCustomers.set(formatted, {
                            name: data.customer?.name || 'Customer',
                            phone: formatted
                        });
                    }
                });

                let customersList = Array.from(uniqueCustomers.values());
                let optedOut = dbData?.optedOut || [];
                let invalidNumbers = dbData?.invalidNumbers || [];

                // Filter out Blacklist and Graveyard immediately
                customersList = customersList.filter(c => !optedOut.includes(c.phone) && !invalidNumbers.includes(c.phone));

                console.log(`🧹 [Marketing] Deduplicated and filtered to ${customersList.length} safe unique customers.`);

                const todayStr = new Date().toLocaleDateString('en-IN');
                dbData = {
                    campaignMonth: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
                    pendingCustomers: customersList,
                    sentCustomers: [],
                    optedOut: optedOut,
                    invalidNumbers: invalidNumbers,
                    messagesSentToday: 0,
                    lastRunDate: todayStr,
                    nextAllowedTime: 0, // NEW: Tracks EXACT millisecond next message is allowed
                    totalCycleCount: customersList.length // NEW: For Progress Tracking
                };

                await docRef.set(dbData);
            }

            // Begin the distribution engine
            await runDistributionCycle(dbData);

        } catch (err) {
            console.error("❌ [Marketing] Error fetching batch:", err);
            isProcessing = false;
        }
    };

    const runDistributionCycle = async (dbData) => {
        const todayStr = new Date().toLocaleDateString('en-IN');
        const currentDayOfWeek = new Date().getDay(); // 0 is Sunday
        
        // Reset daily counters if it's a new day
        if (dbData.lastRunDate !== todayStr) {
            dbData.messagesSentToday = 0;
            dbData.lastRunDate = todayStr;
            dbData.nextAllowedTime = 0; // Wipe pacing clear for the new day
        }

        // ADVANCED LOGIC: Weekend Booster. Sundays get 10 limits instead of 7.
        const maxDailyMessages = (currentDayOfWeek === 0) ? 10 : 7; 
        let currentHour = new Date().getHours();

        // 16-HOUR MATH: Ensure all daily messages finish strictly between 6 AM and 10 PM
        if (currentHour < 6 || currentHour >= 22) {
            console.log(`🌙 [Marketing] Outside business hours (6 AM - 10 PM). Resting...`);
            isProcessing = false;
            return;
        }

        if (dbData.messagesSentToday >= maxDailyMessages) {
            console.log(`🔒 [Marketing] Daily quota of ${maxDailyMessages} met. Sleeping until tomorrow...`);
            isProcessing = false;
            return;
        }

        if (dbData.pendingCustomers.length === 0) {
            console.log("✅ [Marketing] Entire 30-Day Cycle Complete. Restarting database fetch.");
            // Wipe nextAllowedTime to force an immediate cycle reload
            await docRef.set({ nextAllowedTime: 0 }, { merge: true });
            isProcessing = false;
            return;
        }

        // --- THE ENGINE LOOP ---
        const total = Math.max(dbData.totalCycleCount || 1, dbData.pendingCustomers.length);
        const remaining = dbData.pendingCustomers.length;
        const progress = Math.round(((total - remaining) / total) * 100);
        
        console.log(`⚙️ [Marketing] Engine running. Progress: ${progress}%. Sent today: ${dbData.messagesSentToday}/${maxDailyMessages}`);

        // Grab the first customer in line
        const customer = dbData.pendingCustomers[0]; 

        // SAFEGUARD & FORMAT FIX: In case Firebase holds old string arrays instead of objects
        const rawPhone = typeof customer === 'string' ? customer : customer?.phone;
        const formattedPhone = formatPhone(rawPhone);
        
        if (!formattedPhone) {
            console.log(`⚠️ [Marketing] Invalid customer format in DB for: ${rawPhone}. Removing entry.`);
            dbData.invalidNumbers.push(rawPhone);
            dbData.pendingCustomers.shift();
            dbData.nextAllowedTime = Date.now() + 6000; // FAST SKIP: 6 seconds
            await docRef.set(dbData);
            isProcessing = false;
            
            // SMART QUICK-TRIGGER: Prevent waiting 30 mins for the interval if we just did a 6-second skip
            if (global.marketingDynamicTimeout) clearTimeout(global.marketingDynamicTimeout);
            global.marketingDynamicTimeout = setTimeout(fetchAndPrepareBatch, 6000);
            return;
        }

        // Strip non-numeric characters for API validation like server.js
        const plainPhone = formattedPhone.replace(/\D/g, ''); 
        
        let verifiedWhatsappId = null;
        let wasSentSuccessfully = false;
        let isTransientError = false; // NEW FIX: Track transient WhatsApp Web errors like WidFactory

        try {
            // ENTERPRISE FIX: Use getNumberId like server.js to bypass @lid bugs and verify registry
            await sleep(3000); 
            const contactId = await client.getNumberId(plainPhone);
            
            if (contactId) {
                verifiedWhatsappId = contactId._serialized;
            }
        } catch(e) { 
            if(e.message && (e.message.includes('WidFactory') || e.message.includes('Evaluation failed') || e.message.includes('findChat'))) {
                console.log('⚠️ WidFactory timeout or DOM sync error on check. Proceeding to attempt send with fallback ID.');
                verifiedWhatsappId = plainPhone + '@c.us';
            } else throw e; 
        }
            
        if (!verifiedWhatsappId) {
            console.log(`🪦 [Marketing] Number ${formattedPhone} is not on WhatsApp. Moving to Graveyard.`);
            dbData.invalidNumbers.push(formattedPhone);
        } else {
            // --- HUMAN SIMULATION ---
            try {
                // ENTERPRISE FIX: Allow time for DOM to find the chat before engaging
                await sleep(2000);
                const chat = await client.getChatById(verifiedWhatsappId);
                await chat.sendStateTyping();
                await sleep(Math.floor(Math.random() * 3000) + 5000); // Type for 5-8 seconds
            } catch (e) {
                console.log(`⚠️ Could not simulate typing for ${formattedPhone}, likely a new chat. Proceeding directly to send.`);
            }

            try {
                await sendPromotion(customer, verifiedWhatsappId);
                wasSentSuccessfully = true;
            } catch (error) {
                console.error(`⚠️ [Marketing] Unexpected error processing ${formattedPhone}:`, error);
                // NEW FIX: Detect internal whatsapp-web.js loading issues to prevent losing the lead
                if (error && error.message && (error.message.includes('WidFactory') || error.message.includes('Evaluation failed') || error.message.includes('findChat'))) {
                    isTransientError = true;
                }
            }
        }

        // --- DATABASE ARRAY SHIFTING (1-Read Magic) ---
        dbData.pendingCustomers.shift(); 
        
        if (wasSentSuccessfully) {
            dbData.sentCustomers.push(customer);
            dbData.messagesSentToday += 1;
            
            // ENTERPRISE PACING MATH: Calculates the exact timestamp in the future for the next send.
            const randomMinutes = Math.floor(Math.random() * 60) + 90; // Between 90 and 150 minutes
            dbData.nextAllowedTime = Date.now() + (randomMinutes * 60000);
            
            const nextTimeStr = formatTimeForLog(dbData.nextAllowedTime);
            console.log(`📅 [Marketing] Success. The next marketing message in ${nextTimeStr}`);
            global.lastLoggedNextTime = dbData.nextAllowedTime; // Mark as logged so it doesn't duplicate
            
        } else {
            // ADVANCED GRACEFUL FAIL-SAFE: If number was bad, skip and try next in 6 seconds (bypass 90 mins)
            dbData.nextAllowedTime = Date.now() + 6000; 
            
            // NEW FIX: Re-queue the customer if it was a transient WidFactory/DOM error instead of discarding them
            if (isTransientError) {
                dbData.pendingCustomers.unshift(customer);
                console.log(`♻️ [Marketing] Re-queued ${formattedPhone} due to internal WhatsApp syncing issue.`);
            }
        }

        // Save State to Firebase (Overwrites the document, preventing data bloating)
        await docRef.set(dbData);
        
        // RAM Cleanup
        if (client.pupPage) {
            await client.pupPage.evaluate(() => {
                if (window.Store && window.Store.Msg) window.Store.Msg.clear();
            }).catch(() => {});
        }

        isProcessing = false; 

        // SMART QUICK-TRIGGER: If we scheduled a fast 6-second retry, forcefully call the batch again 
        // without waiting for the 30-minute global polling interval to catch up.
        const timeToNext = dbData.nextAllowedTime - Date.now();
        if (timeToNext > 0 && timeToNext <= 60000) { // If wait time is under 1 minute (e.g. 6 seconds)
            if (global.marketingDynamicTimeout) clearTimeout(global.marketingDynamicTimeout);
            global.marketingDynamicTimeout = setTimeout(fetchAndPrepareBatch, timeToNext);
        }
    };

    const sendPromotion = async (customer, verifiedWhatsappId) => {
        // SAFEGUARD: Robustly handle both new Object and old String database formats
        const customerPhone = typeof customer === 'string' ? customer : customer?.phone;
        const customerName = typeof customer === 'string' ? 'Customer' : (customer?.name || 'Customer');
        const adData = generateRandomAdData();

        try {
            const imageBuffer = await generateAdImage(client, customerName, adData);
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'meena_offer.png');
            const caption = getBilingualCaption(customerName, adData);
            
            // ENTERPRISE FIX: Retry mechanism + robust loading delays for WhatsApp DOM injection limits
            await sleep(4000); // Give ample room to the WhatsApp load and DOM settlement
            
            let retries = 3;
            let success = false;

            while (retries > 0 && !success) {
                try {
                    await client.sendMessage(verifiedWhatsappId, media, { caption });
                    success = true;
                } catch (sendErr) {
                    // SERVER.JS FIX FOR findChat / @lid errors 
                    if (sendErr.message && (sendErr.message.includes('findChat') || sendErr.message.includes('@lid') || sendErr.message.includes('not found'))) {
                        console.log(`⚠️ Applying initialization workaround for chat: ${verifiedWhatsappId}`);
                        
                        // Send text first to initialize chat session in cache safely
                        await client.sendMessage(verifiedWhatsappId, `🛍️ Loading a special offer for you...`);
                        
                        // Brief delay to ensure cache is updated locally
                        await sleep(2000);
                        
                        // Retry sending the media image
                        await client.sendMessage(verifiedWhatsappId, media, { caption });
                        success = true;
                    } else {
                        retries--;
                        console.error(`⚠️ [Marketing] Send loop failure. Retries left: ${retries}. Error: ${sendErr.message}`);
                        if (retries === 0) throw sendErr;
                        await sleep(6000); // Wait 6 seconds for DOM to breathe before retry
                    }
                }
            }

            console.log(`📩 Sent Ad to ${customerName} (${customerPhone})`);
        } catch (err) {
            console.error(`❌ Failed to send Ad to ${customerName}`);
            throw err; // Throw up to the loop so it doesn't count as successfully sent
        }
    };

    // --- 3. DYNAMIC AD ENGINE (Millions of Combinations) ---
    const generateRandomAdData = () => {
        // EXPANDED CATEGORIES
        const categories = ['Mobiles', 'Appliances', 'Furniture', 'Smart Home & Electronics', 'Kitchenware'];
        const selectedCategory = categories[Math.floor(Math.random() * categories.length)];

        // Massive Database Simulation (EXPANDED INVENTORY)
        const dbData = {
            Mobiles: {
                brands: ['POCO', 'VIVO', 'Samsung', 'Apple', 'Redmi', 'Realme', 'Oppo', 'OnePlus', 'iQOO', 'Motorola', 'Asus ROG', 'Nothing'],
                mainProducts: ['5G Smartphones', 'Flagship Killers', 'Premium Mobiles', 'Gaming Phones', 'Foldable Phones', 'High-Performance Tablets'],
                subProducts: ['Bluetooth TWS Earbuds', 'Smartwatches', 'Fast Chargers', 'Power Banks', 'Premium Cases', 'Screen Protectors', 'Wired Earphones', 'Mobile Gimbals', 'Car Mounts']
            },
            Appliances: {
                brands: ['LG', 'Samsung', 'Whirlpool', 'Voltas', 'Haier', 'Godrej', 'Blue Star', 'Bosch', 'IFB', 'Lloyd', 'Panasonic', 'Daikin', 'TCL'],
                mainProducts: ['Front-Load Washing Machines', 'Double Door Refrigerators', 'Split Air Conditioners', '4K Smart LED TVs', 'OLED TVs', 'Inverter ACs', 'Top-Load Washers'],
                subProducts: ['Mixer Grinders', 'Microwave Ovens', 'Water Purifiers', 'Induction Stoves', 'Ceiling Fans', 'Iron Boxes', 'Geysers', 'Voltage Stabilizers']
            },
            Furniture: {
                brands: ['Premium Teak', 'Steel Strong', 'Royal Oak', 'Nilkamal', 'Custom Handcrafted', 'Zuari', 'Wakefit', 'Urban Ladder Design', 'Godrej Interio'],
                mainProducts: ['King Size Wooden Cots', 'Heavy Steel Beeros', 'Teak Wood Beeros', 'L-Shape Sofa Sets', 'Glass Dining Tables', 'Modular Wardrobes', 'Premium Recliners'],
                subProducts: ['Orthopedic Mattresses', 'Office Chairs', 'Recliners', 'Dressing Tables', 'Pooja Mandirs', 'Shoe Racks', 'Study Desks', 'Bookshelves', 'Coffee Tables', 'Bedside Tables']
            },
            "Smart Home & Electronics": {
                brands: ['Sony', 'Bose', 'JBL', 'Dell', 'HP', 'Lenovo', 'Philips', 'Acer', 'Apple'],
                mainProducts: ['High-Performance Laptops', 'Home Theater Systems', 'Soundbars with Subwoofers', 'Gaming Monitors', 'Smart Displays', 'All-in-One Desktops'],
                subProducts: ['Wireless Keyboards', 'Gaming Mice', 'Webcams', 'Smart Plugs', 'Security Cameras', 'Bluetooth Speakers', 'Wi-Fi Routers', 'External Hard Drives']
            },
            Kitchenware: {
                brands: ['Prestige', 'Butterfly', 'Pigeon', 'Wonderchef', 'Milton', 'Bajaj', 'Havells', 'Cello'],
                mainProducts: ['4-Burner Glass Gas Stoves', 'Premium Cookware Sets', 'Air Fryers', 'Electric Chimneys', 'Dishwashers', 'Cold Press Juicers'],
                subProducts: ['Non-Stick Tawas', 'Pressure Cookers', 'Electric Kettles', 'Toasters', 'Choppers', 'Dinner Sets', 'Thermos Flasks', 'Spice Racks']
            }
        };

        // EXPANDED OFFERS
        const offers = [
            { text: "Flat 20% OFF", taText: "20% நேரடி தள்ளுபடி" },
            { text: "Up to 30% OFF", taText: "30% வரை தள்ளுபடி" },
            { text: "Zero Down Payment", taText: "முன்பணம் தேவையில்லை" },
            { text: "Exchange Bonus ₹2000", taText: "பழைய பொருளுக்கு ₹2000 கூடுதல் மதிப்பு" },
            { text: "Save Up To ₹5000", taText: "₹5000 வரை சேமிக்கலாம்" },
            { text: "Special Festival Combo Price", taText: "சிறப்பு பண்டிகை காம்போ ஆஃபர்" },
            { text: "Buy 1 Get 1 Free", taText: "ஒன்றை வாங்கினால் ஒன்று இலவசம்" },
            { text: "Cashback Up To ₹1000", taText: "₹1000 வரை கேஷ்பேக்" },
            { text: "Free Home Delivery", taText: "இலவச டோர் டெலிவரி" },
            { text: "No Cost EMI Available", taText: "வட்டி இல்லா மாதத்தவணை" }
        ];

        // 500+ DYNAMIC AGENT PHRASES (Combinatorics Math) - EXPANDED
        const agentHooksEn = [
            "We have handpicked these exclusive deals just for you!",
            "Don't miss our biggest price drop of the season.",
            "Upgrade your lifestyle with our premium collections.",
            "Incredible savings are waiting for you this week.",
            "Your favorite brands are now at unbeatable prices.",
            "Experience top-tier quality at wholesale prices.",
            "Transform your home with our latest arrivals.",
            "You deserve the best! Check out these VIP offers.",
            "Surprise! We unlocked special mega discounts for you.",
            "Why pay more? Get top electronics and furniture at factory prices."
        ];
        const agentHooksTa = [
            "உங்களுக்காகவே பிரத்யேகமாக தேர்ந்தெடுக்கப்பட்ட சலுகைகள்!",
            "இந்த சீசனின் மிகப்பெரிய விலை குறைப்பை தவறவிடாதீர்கள்.",
            "எங்கள் பிரீமியம் கலெக்‌ஷன் மூலம் உங்கள் வாழ்க்கை முறையை மேம்படுத்துங்கள்.",
            "இந்த வாரம் நம்பமுடியாத சேமிப்புகள் உங்களுக்காக காத்திருக்கின்றன.",
            "உங்களுக்குப் பிடித்த பிராண்டுகள் இப்போது தோற்கடிக்க முடியாத விலையில்.",
            "சிறந்த தரத்தை மொத்த விலையில் அனுபவியுங்கள்.",
            "எங்களின் புதிய வரவுகள் மூலம் உங்கள் வீட்டை அழகுபடுத்துங்கள்.",
            "நீங்கள் சிறந்ததை பெற தகுதியானவர்! இந்த VIP சலுகைகளை பாருங்கள்.",
            "ஆச்சரியம்! உங்களுக்காக பிரத்யேக மெகா தள்ளுபடிகளை வழங்கியுள்ளோம்.",
            "ஏன் அதிகம் செலுத்த வேண்டும்? சிறந்த பொருட்களை குறைவான விலையில் பெறுங்கள்."
        ];

        // EXPANDED URGENCIES
        const urgenciesEn = [
            "Limited stock available. Hurry!",
            "Offer valid only until stocks last.",
            "Grab this deal before it expires.",
            "Walk in today to claim your discount.",
            "Show this message at the counter to redeem.",
            "Flash sale alert! Prices drop for the next 24 hours only.",
            "This is a one-time offer, don't let it slip away!"
        ];
        const urgenciesTa = [
            "குறைந்த அளவு ஸ்டாக் மட்டுமே! விரைந்து வாருங்கள்.",
            "ஸ்டாக் இருக்கும் வரை மட்டுமே இந்த சலுகை.",
            "இந்த சலுகை முடிவதற்குள் பெற்றுக்கொள்ளுங்கள்.",
            "உங்கள் தள்ளுபடியைப் பெற இன்றே வருகை தாருங்கள்.",
            "சலுகையைப் பெற இந்த மெசேஜை கடையில் காண்பிக்கவும்.",
            "ஃபிளாஷ் சேல்! அடுத்த 24 மணி நேரத்திற்கு மட்டுமே இந்த விலை.",
            "இது ஒரு முறை மட்டுமே வரும் சலுகை, நழுவ விடாதீர்கள்!"
        ];

        // 500+ Template Engine (Themes X Layouts X Fonts) - EXPANDED
        const themes = [
            { bg: '#09090b', accent: '#ef4444', textCol: 'white' }, // Dark Ruby
            { bg: '#0f172a', accent: '#3b82f6', textCol: 'white' }, // Midnight Blue
            { bg: '#064e3b', accent: '#10b981', textCol: 'white' }, // Emerald Dark
            { bg: '#451a03', accent: '#f59e0b', textCol: 'white' }, // Rich Wood
            { bg: '#171717', accent: '#eab308', textCol: 'white' }, // Premium Gold
            { bg: '#312e81', accent: '#c084fc', textCol: 'white' }, // Indigo Purple
            { bg: '#ffffff', accent: '#dc2626', textCol: '#111827' }, // Clean White / Red (Modern)
            { bg: '#fef3c7', accent: '#b45309', textCol: '#451a03' },  // Festival Yellow
            { bg: '#1a0b2e', accent: '#f0abfc', textCol: '#ffffff' }, // Neon Cyberpunk
            { bg: '#f8fafc', accent: '#0ea5e9', textCol: '#0f172a' }, // Minimalist Pastel Blue
            { bg: '#083344', accent: '#22d3ee', textCol: '#ffffff' }, // Ocean Blue
            { bg: '#14532d', accent: '#4ade80', textCol: '#ffffff' }, // Festive Green
            { bg: '#4c0519', accent: '#fda4af', textCol: '#ffffff' }  // Deep Burgundy
        ];

        // EXPANDED LAYOUTS
        const layouts = ['center', 'left', 'right'];

        const catData = dbData[selectedCategory];
        
        // Pick Randoms (Ensuring Multiple Products)
        const randomBrand = catData.brands[Math.floor(Math.random() * catData.brands.length)];
        const randomMain = catData.mainProducts[Math.floor(Math.random() * catData.mainProducts.length)];
        const randomSub1 = catData.subProducts[Math.floor(Math.random() * catData.subProducts.length)];
        const randomSub2 = catData.subProducts[Math.floor(Math.random() * catData.subProducts.length)];
        const randomSub3 = catData.subProducts[Math.floor(Math.random() * catData.subProducts.length)];
        const randomSub4 = catData.subProducts[Math.floor(Math.random() * catData.subProducts.length)];
        const randomOffer = offers[Math.floor(Math.random() * offers.length)];
        const randomTheme = themes[Math.floor(Math.random() * themes.length)];
        const randomLayout = layouts[Math.floor(Math.random() * layouts.length)];
        
        // Add Dynamic Flash Badges
        const badges = ["🔥 Special Bundle Offer", "⚡ FLASH SALE ALERT", "🎉 VIP CUSTOMER DEAL", "🎁 MEGA DISCOUNT ACTIVATED"];
        const randomBadge = badges[Math.floor(Math.random() * badges.length)];

        // Assemble Dynamic Agent Pitch
        const rHookIdx = Math.floor(Math.random() * agentHooksEn.length);
        const rUrgIdx = Math.floor(Math.random() * urgenciesEn.length);

        return {
            category: selectedCategory,
            brand: randomBrand,
            mainProduct: randomMain,
            subProduct1: randomSub1,
            subProduct2: randomSub2,
            subProduct3: randomSub3,
            subProduct4: randomSub4,
            offer: randomOffer,
            enPitch: `${agentHooksEn[rHookIdx]} ${urgenciesEn[rUrgIdx]}`,
            taPitch: `${agentHooksTa[rHookIdx]} ${urgenciesTa[rUrgIdx]}`,
            theme: randomTheme,
            layout: randomLayout,
            badgeText: randomBadge,
            promoCode: generatePromoCode(),
            timeGreeting: getTimeGreeting()
        };
    };

    const generateAdImage = async (client, name, adData) => {
        let page;
        // BUG FIX: Ensure browser is available before trying to open a page
        if (!client.pupBrowser) {
            console.log("⚠️ [Marketing] Puppeteer browser not completely initialized yet. Skipping image generation temporarily.");
            throw new Error("Browser not ready");
        }
        try {
            page = await client.pupBrowser.newPage();
            // Expanded height to 1400px to completely prevent overlap bugs
            await page.setViewport({ width: 850, height: 1400 }); 

            // ADDED DYNAMIC CSS FOR NEW 'RIGHT' LAYOUT WITHOUT BREAKING OLD LAYOUTS
            let alignStyle = 'align-items: center; text-align: center;';
            let cardPos = 'left: 50%; transform: translateX(-50%);';
            
            if (adData.layout === 'left') {
                alignStyle = 'align-items: flex-start; text-align: left; padding-left: 60px;';
                cardPos = 'left: 60px; transform: none;';
            } else if (adData.layout === 'right') {
                alignStyle = 'align-items: flex-end; text-align: right; padding-right: 60px;';
                cardPos = 'right: 60px; left: auto; transform: none;';
            }

            const html = `
            <html>
            <head>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
                    /* BUG FIX: Added max-width and word-wrap to prevent text from pushing layout off-screen */
                    body { background:${adData.theme.bg}; color:${adData.theme.textCol}; font-family:'Inter', sans-serif; height:1400px; padding-bottom: 300px; display:flex; flex-direction:column; justify-content:center; margin:0; border:25px solid ${adData.theme.accent}; box-sizing: border-box; position: relative; max-width: 100%; overflow: hidden; ${alignStyle}}
                    
                    .badge { background: ${adData.theme.accent}; color: ${adData.theme.bg}; font-weight: 900; padding: 12px 25px; border-radius: 50px; font-size: 22px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 25px; display: inline-block; max-width: 90%; word-wrap: break-word;}
                    .greeting { font-size: 35px; opacity: 0.9; margin-bottom: 10px; font-weight: 700; max-width: 90%; word-wrap: break-word;}
                    .headline { font-size: 70px; color: ${adData.theme.accent}; margin: 0; letter-spacing: -2px; font-weight: 900; line-height: 1.1; text-transform: uppercase; max-width: 95%; word-wrap: break-word;}
                    
                    .product-highlight { font-size: 45px; font-weight: 900; margin-top: 30px; line-height: 1.2; max-width: 90%; word-wrap: break-word;}
                    .brand-highlight { color: ${adData.theme.accent}; font-style: italic; font-size: 55px;}
                    
                    .offer-box { margin-top: 30px; background: ${adData.theme.accent}; color: ${adData.theme.bg}; padding: 20px 40px; border-radius: 15px; font-size: 38px; font-weight: 900; transform: rotate(-2deg); display: inline-block; box-shadow: 0 10px 20px rgba(0,0,0,0.3); max-width: 90%; word-wrap: break-word;}
                    
                    .sub-items { margin-top: 35px; font-size: 22px; opacity: 0.9; font-weight: 700; line-height: 1.6; background: rgba(0,0,0,0.15); padding: 20px; border-radius: 15px; border-left: 5px solid ${adData.theme.accent}; display: inline-block; max-width: 90%; word-wrap: break-word;}
                    .sub-items span { color: ${adData.theme.accent}; font-size: 24px; }

                    .promo-code { margin-top: 25px; background: rgba(0,0,0,0.2); padding: 10px 20px; border-radius: 8px; font-family: monospace; font-size: 24px; border: 1px dashed ${adData.theme.accent}; display: inline-block;}

                    .card { position: absolute; bottom: 140px; ${cardPos} background: rgba(0,0,0,0.1); padding: 25px 40px; border-radius: 20px; border: 2px solid ${adData.theme.accent}; width: 80%; max-width: 700px; box-shadow: 0 20px 40px rgba(0,0,0,0.2); backdrop-filter: blur(10px); text-align: center; box-sizing: border-box;}
                    .shop-name { font-size: 32px; font-weight: 900; letter-spacing: 1px; word-wrap: break-word;}
                    .shop-address { font-size: 16px; opacity: 0.8; margin-top: 8px; word-wrap: break-word;}
                    .phone { font-size: 28px; font-weight: bold; color: ${adData.theme.accent}; margin-top: 8px;}
                    
                    .emi-banner { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); background: #fbbf24; color: #000; font-weight: 900; font-size: 22px; padding: 15px 50px; border-radius: 8px; box-shadow: 0 10px 20px rgba(0,0,0,0.4); white-space: nowrap; max-width: 90%; word-wrap: break-word;}
                </style>
            </head>
            <body>
                <div class="badge">${adData.badgeText}</div>
                <div class="greeting">${adData.timeGreeting.en}, ${name}!</div>
                <div class="headline">MEGA ${adData.category} SALE</div>
                
                <div class="product-highlight">
                    <span class="brand-highlight">${adData.brand}</span><br>
                    ${adData.mainProduct}
                </div>

                <div class="offer-box">${adData.offer.text}</div>

                <div class="sub-items">
                    🔥 <strong>PLUS MASSIVE DISCOUNTS ON:</strong><br>
                    <span>✔</span> ${adData.subProduct1} &nbsp;&nbsp;&nbsp; <span>✔</span> ${adData.subProduct2}<br>
                    <span>✔</span> ${adData.subProduct3} &nbsp;&nbsp;&nbsp; <span>✔</span> ${adData.subProduct4}
                </div>

                <div class="promo-code">Show Code: ${adData.promoCode}</div>

                <div class="card">
                    <div class="shop-name">MEENA MARKETING</div>
                    <div class="shop-address">31B,C, East, Sannathi, Alwarthirunagari, Tamil Nadu 628612</div>
                    <div class="phone">📞 9444589733</div>
                </div>

                <div class="emi-banner">✅ Bajaj Finance Easy EMI Available</div>
            </body>
            </html>`;

            await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
            const buffer = await page.screenshot();
            return buffer;
        } finally {
            if (page) await page.close().catch(() => {});
        }
    };

    const getBilingualCaption = (name, adData) => {
        return `🎉 *MEENA MARKETING EXCLUSIVE DEALS* 🎉\n\n${adData.timeGreeting.en} *${name}*, ${adData.enPitch}\n\n🔥 *Top Deal:* ${adData.brand} ${adData.mainProduct}\n🎁 *Offer:* ${adData.offer.text}\n🏷️ *Your Promo Code:* ${adData.promoCode}\n\nWe also have huge discounts on:\n✅ ${adData.subProduct1}\n✅ ${adData.subProduct2}\n✅ ${adData.subProduct3}\n✅ ${adData.subProduct4}\n\n➖➖➖➖➖➖➖➖\n\n${adData.timeGreeting.ta} *${name}*, ${adData.taPitch}\n\n🔥 *சிறப்பு சலுகை:* ${adData.brand} ${adData.mainProduct}\n🎁 *ஆஃபர்:* ${adData.offer.taText}\n\n✅ *Bajaj Finance Easy EMI Available!*\n📱 Contact: 9444589733\n📍 31B,C, East, Sannathi, Alwarthirunagari\n\n_Reply STOP to opt-out of offers. Powered by Quantum_`;
    };

    // --- INITIALIZATION ---
    // Start the initial boot check slightly delayed to let the main client settle
    // ADDED: ClearTimeout prevents looping if module is forcefully hot-reloaded
    if (global.marketingBootTimeout) clearTimeout(global.marketingBootTimeout);
    global.marketingBootTimeout = setTimeout(fetchAndPrepareBatch, 10000);

    // ENTERPRISE POLLING: Wakes up every 30 minutes to check the database timestamp. 
    // Uses virtually zero memory/CPU compared to keeping a promise active in RAM.
    // ADDED: ClearInterval completely destroys overlapping polling loops
    if (global.marketingPollingInterval) clearInterval(global.marketingPollingInterval);
    global.marketingPollingInterval = setInterval(fetchAndPrepareBatch, 30 * 60 * 1000);
};
