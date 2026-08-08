/**
 * =========================================================
 * MEENA MARKETING - PRODUCTION PERPETUAL ENGINE (v3.0)
 * =========================================================
 * Features:
 * - Puppeteer HTML-to-Image Generation for Festivals & Mugurtham
 * - Bulletproof Memory Management (Guaranteed tab/browser closure)
 * - Dynamic Tanglish/English Template Permutations via External JSON
 * - Network-Resilient Weather & Calendar Fetches
 * - Zero API Keys Needed
 * - Advanced Error Retries & Pre-flight Disk Cleanup
 * - Admin On-Demand WhatsApp Command Listener
 * - Hardcore Process & Disconnect Crash Protection (NEW)
 * - Scalable SVG Graphics Integration (NEW)
 * - Firebase Single-Document State Management (NEW)
 * - Bulletproof Missed Schedule Watchdog (NEW)
 */

const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ical = require('node-ical');
const puppeteer = require('puppeteer');
const { getPanchangam, Observer } = require('@ishubhamx/panchangam-js');
const { MessageMedia } = require('whatsapp-web.js');

// 🛡️ Added 'db' to the export signature to accept Firebase instance
module.exports = (client, db) => {
    console.log("📦 Starting other.js");

    // ---------------------------------------------------------
    // CRASH PROTECTION NET (Prevents silent exits)
    // ---------------------------------------------------------
    process.on('uncaughtException', (err) => {
        console.error("🚨 CRITICAL ERROR (Uncaught Exception):", err.message);
        console.error(err.stack);
        // Keeps the Node process alive instead of crashing
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error("🚨 CRITICAL ERROR (Unhandled Rejection):", reason);
        // Keeps the Node process alive instead of crashing
    });

    client.on('disconnected', (reason) => {
        console.error('🔴 WhatsApp Client Disconnected! Reason:', reason);
        console.log('🔄 Attempting to safely restart the client in 10 seconds...');
        setTimeout(() => {
            try {
                client.initialize();
            } catch (err) {
                console.error('⚠️ Failed to re-initialize client:', err.message);
            }
        }, 10000);
    });

    // ---------------------------------------------------------
    // DYNAMIC PHRASE LOADER (Hot-reloads from phrases.json)
    // ---------------------------------------------------------
    function getPhrases() {
        try {
            const data = fs.readFileSync(path.join(__dirname, 'phrases.json'), 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error("⚠️ Error reading phrases.json. Using emergency fallback.", err.message);
            return {
                morning: { intros: ["Morning team!"], bodies: ["Let's achieve today's targets."], outros: ["All the best!"] },
                evening: { intros: ["Evening team!"], bodies: ["Update the pending logs."], outros: ["Close strong!"] },
                wishes: { festivals: ["HAPPY"], mugurtham: ["BLESSED"] }
            };
        }
    }

    // ---------------------------------------------------------
    // 0. PRE-FLIGHT DISK CLEANUP (Prevents storage leaks)
    // ---------------------------------------------------------
    try {
        console.log("🧹 Running startup disk cleanup for old images...");
        const files = fs.readdirSync(__dirname);
        for (const file of files) {
            if (file.startsWith('meena_marketing_') && file.endsWith('.png')) {
                fs.unlinkSync(path.join(__dirname, file));
                console.log(`🗑️ Cleared orphaned image: ${file}`);
            }
        }
    } catch (err) {
        console.error("⚠️ Cleanup error:", err.message);
    }

    // ---------------------------------------------------------
    // 1. CONFIGURATION & STATE
    // ---------------------------------------------------------
    const SHOP_LAT = 8.61; // Alwarthirunagiri
    const SHOP_LON = 77.94;
    const ELEVATION = 15;
    const CALENDAR_URL = 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics';
    
    // Admin Security: Only these numbers can trigger test commands
    const ADMIN_NUMBERS = [
        '919443042733@c.us', 
        '919488669733@c.us'
    ]; 

    const RAM_FILE = path.join(__dirname, '.meena_group_ram.json');
    let memoryGroupId = null;

    function loadGroupMemory() {
        if (fs.existsSync(RAM_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(RAM_FILE, 'utf8'));
                if (data.groupId) memoryGroupId = data.groupId;
            } catch (e) {
                console.error("⚠️ Failed to parse RAM file.");
            }
        }
    }

    function saveGroupMemory(id) {
        memoryGroupId = id;
        try {
            fs.writeFileSync(RAM_FILE, JSON.stringify({ groupId: id }));
        } catch (e) {
            console.error("⚠️ Failed to save RAM file.");
        }
    }

    loadGroupMemory();

    // 🛡️ Firebase State Tracking (RAM Cached to prevent database reads)
    let cachedMorningDate = null;
    let cachedEveningDate = null;

    async function loadFirebaseState() {
        try {
            const docSnap = await db.collection('group_message').doc('status').get();
            if (docSnap.exists) {
                const data = docSnap.data();
                cachedMorningDate = data.lastMorningBlastDate || null;
                cachedEveningDate = data.lastEveningBlastDate || null;
                console.log(`🔥 [Firebase State Loaded] Morning: ${cachedMorningDate} | Evening: ${cachedEveningDate}`);
            }
        } catch (err) {
            console.error("⚠️ Failed to load Firebase state on boot:", err.message);
        }
    }

    loadFirebaseState(); // Fires exactly once on startup

    // ---------------------------------------------------------
    // 2. IMAGE GENERATION ENGINE (HTML to PNG via Puppeteer)
    // ---------------------------------------------------------
    async function generateCelebrationImage(title, subtitle, type) {
        const tempPath = path.join(__dirname, `meena_marketing_${Date.now()}.png`);
        let browser;
        
        try {
            console.log(`🎨 Generating Image for: ${title}...`);
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });
            
            const page = await browser.newPage();
            // 800x800 is the perfect square ratio for WhatsApp media
            await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });

            const mugurthamGradients = [
                'linear-gradient(135deg, #800000 0%, #D4AF37 100%)', // Traditional Maroon & Gold
                'linear-gradient(135deg, #4A0E4E 0%, #E8B923 100%)', // Deep Purple & Gold
                'linear-gradient(135deg, #B22222 0%, #FFD700 100%)'  // Firebrick & Gold
            ];
            const festivalGradients = [
                'linear-gradient(135deg, #0B0C10 0%, #1F2833 50%, #C5A138 100%)', // Elegant Dark & Gold
                'linear-gradient(135deg, #004d00 0%, #b38f00 100%)', // Emerald & Gold
                'linear-gradient(135deg, #003366 0%, #cc9900 100%)'  // Royal Blue & Gold
            ];

            const bgGradient = type === 'mugurtham'
                ? mugurthamGradients[Math.floor(Math.random() * mugurthamGradients.length)]
                : festivalGradients[Math.floor(Math.random() * festivalGradients.length)];

            // Elegant CSS-styled SVGs instead of standard emojis
            const svgMugurtham = `<svg width="80" height="80" viewBox="0 0 24 24" fill="#FFD700"><path d="M12 1L9 9l-8 3 8 3 3 8 3-8 8-3-8-3-3-8z"/></svg>`;
            const svgFestival = `<svg width="80" height="80" viewBox="0 0 24 24" fill="#FFD700"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
            const decorSVG = type === 'mugurtham' ? svgMugurtham : svgFestival;
            
            // Fetch dynamically from phrases.json
            const db_phrases = getPhrases();
            const festivalWishes = db_phrases.wishes.festivals;
            const mugurthamWishes = db_phrases.wishes.mugurtham;

            let dynamicWish = "";
            if (type === 'festival') dynamicWish = festivalWishes[Math.floor(Math.random() * festivalWishes.length)];
            else if (type === 'mugurtham') dynamicWish = mugurthamWishes[Math.floor(Math.random() * mugurthamWishes.length)];
            
            const universalWish = (type === 'festival' || type === 'mugurtham') ? `<div class="wish-text">${dynamicWish}</div>` : '';

            const htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Montserrat:wght@500;700&display=swap" rel="stylesheet">
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            width: 800px;
                            height: 800px;
                            background: ${bgGradient};
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                            text-align: center;
                            color: white;
                            font-family: 'Montserrat', sans-serif;
                            box-sizing: border-box;
                            border: 15px solid rgba(255, 215, 0, 0.4); 
                            overflow: hidden; 
                        }
                        .from-text {
                            font-size: 18px;
                            font-weight: 500;
                            letter-spacing: 3px;
                            margin-bottom: 5px;
                            color: rgba(255, 255, 255, 0.9);
                        }
                        .brand {
                            font-size: 36px;
                            font-weight: 700;
                            letter-spacing: 5px;
                            text-transform: uppercase;
                            margin-bottom: 25px;
                            color: #FFD700;
                            text-shadow: 2px 2px 8px rgba(0,0,0,0.6);
                            max-width: 90%;
                            word-wrap: break-word;
                        }
                        .decor {
                            margin-bottom: 25px;
                            filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.5));
                        }
                        .wish-text {
                            font-size: 22px;
                            font-weight: 500;
                            letter-spacing: 3px;
                            margin-bottom: 10px;
                            color: rgba(255, 255, 255, 0.9);
                            text-transform: uppercase;
                        }
                        .title {
                            font-family: 'Playfair Display', serif;
                            font-size: clamp(40px, 8vw, 65px); 
                            font-weight: 700;
                            margin: 0 20px 20px 20px;
                            line-height: 1.2;
                            text-shadow: 3px 3px 10px rgba(0,0,0,0.5);
                            max-width: 90%;
                            word-wrap: break-word;
                            overflow-wrap: break-word;
                        }
                        .subtitle {
                            font-size: clamp(18px, 4vw, 24px); 
                            font-weight: 500;
                            background: rgba(0, 0, 0, 0.4);
                            padding: 15px 30px;
                            border-radius: 50px;
                            margin-top: 20px;
                            border: 1px solid rgba(255, 215, 0, 0.3);
                            max-width: 85%;
                            word-wrap: break-word;
                        }
                    </style>
                </head>
                <body>
                    <div class="from-text">WISHING YOU FROM</div>
                    <div class="brand">MEENA MARKETING</div>
                    <div class="decor">${decorSVG}</div>
                    ${universalWish}
                    <div class="title">${title}</div>
                    <div class="subtitle">${subtitle}</div>
                </body>
                </html>
            `;

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            
            // Wait for Web Fonts to fully load before snapping the picture
            await page.evaluateHandle('document.fonts.ready');
            
            await page.screenshot({ path: tempPath, type: 'png' });
            
            console.log("✅ Image successfully rendered.");
            return tempPath;
        } catch (error) {
            console.error('⚠️ Image Generation Failed:', error.message);
            return null;
        } finally {
            if (browser) {
                await browser.close();
                console.log("🧹 Puppeteer memory cleared.");
            }
        }
    }

    // ---------------------------------------------------------
    // 3. OFFLINE MUGURTHAM CALCULATOR
    // ---------------------------------------------------------
    function isAadiOrMargazhi(date) {
        const month = date.getMonth(); 
        const day = date.getDate();
        
        if ((month === 6 && day >= 16) || (month === 7 && day <= 16)) return true;
        if ((month === 11 && day >= 16) || (month === 0 && day <= 13)) return true;
        
        return false;
    }

    function checkAuspiciousDay(targetDate) {
        try {
            if (isAadiOrMargazhi(targetDate)) return { isAuspicious: false, name: null };

            const observer = new Observer(SHOP_LAT, SHOP_LON, ELEVATION);
            const panchang = getPanchangam(targetDate, observer, { timezoneOffset: 330 });
            
            const tithiNumber = panchang.tithi?.number || 0;
            const tithiName = panchang.tithi?.name || "Auspicious Day";

            const auspiciousTithis = [5, 11, 13, 15]; 
            const isAuspicious = auspiciousTithis.includes(tithiNumber);

            return { isAuspicious, name: tithiName };
        } catch (error) {
            return { isAuspicious: false, name: null };
        }
    }

    // ---------------------------------------------------------
    // 4. FESTIVAL ENGINE (Google .ics)
    // ---------------------------------------------------------
    async function checkFestivalToday() {
        let response;
        for (let i = 0; i < 3; i++) {
            try {
                response = await axios.get(CALENDAR_URL, { timeout: 10000 });
                break; // Success, exit retry loop
            } catch (error) {
                if (i === 2) return null; // Failed all retries
                await new Promise(res => setTimeout(res, 2000)); // Wait 2s before retry
            }
        }
        
        try {
            const events = ical.sync.parseICS(response.data);
            
            // Format to IST local timezone to prevent fetching wrong days
            const todayString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

            for (const event of Object.values(events)) {
                if (event.type === 'VEVENT' && event.start) {
                    const eventDateString = new Date(event.start).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
                    if (eventDateString === todayString) {
                        return event.summary;
                    }
                }
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    // ---------------------------------------------------------
    // 5. WEATHER ENGINE (Open-Meteo)
    // ---------------------------------------------------------
    async function getWeatherData() {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${SHOP_LAT}&longitude=${SHOP_LON}&current=temperature_2m,weather_code&timezone=auto`;
        let response;
        for (let i = 0; i < 3; i++) {
            try {
                response = await axios.get(url, { timeout: 8000 });
                break;
            } catch (error) {
                if (i === 2) return "Unable to fetch today's weather data due to network issues.";
                await new Promise(res => setTimeout(res, 2000));
            }
        }
        
        try {
            const currentTemp = response.data.current.temperature_2m;
            const wmoCode = String(response.data.current.weather_code);
            
            const weatherDesc = {
                "0": "Clear sky ☀️", "1": "Mainly clear 🌤️", "2": "Partly cloudy ⛅", "3": "Overcast ☁️",
                "45": "Foggy 🌫️", "51": "Light drizzle 🌧️", "61": "Slight rain 🌧️", "65": "Heavy rain 🌧️",
                "80": "Rain showers 🌦️", "95": "Thunderstorm 🌩️"
            };

            const condition = weatherDesc[wmoCode] || "Clear";
            return `It is currently ${currentTemp}°C and ${condition} in Alwarthirunagiri.`;
        } catch (error) {
            return "Unable to fetch today's weather data due to network issues.";
        }
    }

    // ---------------------------------------------------------
    // 6. PERMUTATION ENGINE (Tanglish/English via JSON)
    // ---------------------------------------------------------
    function generateMorningQuote() {
        const db_phrases = getPhrases();
        const intros = db_phrases.morning.intros;
        const bodies = db_phrases.morning.bodies;
        const outros = db_phrases.morning.outros;

        const intro = intros[Math.floor(Math.random() * intros.length)];
        const body = bodies[Math.floor(Math.random() * bodies.length)];
        const outro = outros[Math.floor(Math.random() * outros.length)];

        return `${intro} ${body} ${outro}`;
    }

    function generateEveningQuote() {
        const db_phrases = getPhrases();
        const intros = db_phrases.evening.intros;
        const bodies = db_phrases.evening.bodies;
        const outros = db_phrases.evening.outros;

        const intro = intros[Math.floor(Math.random() * intros.length)];
        const body = bodies[Math.floor(Math.random() * bodies.length)];
        const outro = outros[Math.floor(Math.random() * outros.length)];

        return `${intro} ${body} ${outro}`;
    }

    // ---------------------------------------------------------
    // 7. MESSAGE DISPATCHERS
    // ---------------------------------------------------------
    async function ensureGroupConnection() {
        // 1. Check local RAM/disk cache first
        if (memoryGroupId) {
            return true;
        }

        // 2. Fetch via Hugging Face Secrets / Environment Variable
        const rawInvite = process.env.GROUP_INVITE_CODE || process.env.GROUP_INVITE_LINK;
        if (rawInvite) {
            try {
                // Sanitize input: extract code from full link if present
                let inviteCode = rawInvite.trim();
                if (inviteCode.includes('chat.whatsapp.com/')) {
                    inviteCode = inviteCode.split('chat.whatsapp.com/')[1].split('?')[0].split('/')[0].trim();
                }

                console.log(`🔍 Fetching Group ID via Hugging Face Secret invite code (${inviteCode})...`);
                const inviteInfo = await client.getInviteInfo(inviteCode);

                if (inviteInfo && inviteInfo.id) {
                    const fetchedGroupId = inviteInfo.id._serialized || inviteInfo.id;
                    console.log(`✅ Group ID successfully resolved & saved: ${fetchedGroupId}`);
                    saveGroupMemory(fetchedGroupId);
                    return true;
                } else {
                    console.log("⚠️ Group info retrieved via link, but missing ID property.");
                }
            } catch (err) {
                console.error(`⚠️ Failed to resolve Group ID from Secret invite code: ${err.message}`);
            }
        } else {
            console.log("ℹ️ No GROUP_INVITE_CODE found in Secrets. Defaulting to DOM chat scanning...");
        }

        // 3. Fallback: Scan recent chats list
        try {
            console.log("🔍 Scanning chat list for target group...");
            const chats = await client.getChats();
            const groupChat = chats.find(chat => chat.isGroup);
            if (groupChat) {
                const foundId = groupChat.id._serialized;
                console.log(`✅ Found group via chat scan: ${foundId}`);
                saveGroupMemory(foundId);
                return true;
            } else {
                console.log("⚠️ No group chat found in recent chat list.");
                return false;
            }
        } catch (err) {
            console.error(`⚠️ DOM chat scan failed: ${err.message}`);
            return false;
        }
    }

    async function sendMorningBlast() {
        const todayString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // Output: YYYY-MM-DD
        
        // 🛡️ Guard: Prevent duplicate sends on the same day
        if (cachedMorningDate === todayString) {
            console.log(`⏸️ Morning Blast already sent for today (${todayString}). Skipping.`);
            return;
        }

        // 🔒 OPTIMISTIC LOCK: Claim task immediately to block the Watchdog from double-firing
        cachedMorningDate = todayString;

        console.log("☀️ Executing Morning Blast...");
        if (!(await ensureGroupConnection())) {
            cachedMorningDate = null; // Unlock if connection completely fails
            return;
        }

        const weatherText = await getWeatherData();
        const festival = await checkFestivalToday();
        const astroData = checkAuspiciousDay(new Date());
        const quote = generateMorningQuote();
        
        let imagePath = null;
        let media = null;
        const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

        let finalMessage = `🌅 *Meena Marketing Update*\n\n`;
        finalMessage += `🌤️ *Today's Weather:* ${weatherText}\n\n`;
        
        if (festival) {
            imagePath = await generateCelebrationImage(festival, dateStr, 'festival');
            finalMessage += `🎉 *Festival Alert:* Happy ${festival} to the Meena Marketing family! Let's make today special! 🎊\n\n`;
        } else if (astroData.isAuspicious) {
            imagePath = await generateCelebrationImage('SUBA MUGURTHAM', dateStr, 'mugurtham');
            finalMessage += `💍 *Auspicious Day:* Today is mathematically highly auspicious. Expect high footfall and be ready to close sales! 🚀\n\n`;
        }
        
        finalMessage += `💬 ${quote}\n\n`;
        finalMessage += `━━━━━━━━━━━━━━━━━━\n_🤖 System Generated Message_`;

        try {
            const sendOptions = {};
            if (imagePath && fs.existsSync(imagePath)) {
                sendOptions.media = MessageMedia.fromFilePath(imagePath);
            }
            
            await client.sendMessage(memoryGroupId, finalMessage, sendOptions);
            
            if (imagePath && fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch (e) {}
            }

            // 🛡️ Blind Write to Firebase (1 Write, 0 Reads)
            await db.collection('group_message').doc('status').set({
                lastMorningBlastDate: todayString
            }, { merge: true });

            console.log(`✅ Morning Blast completed and logged for ${todayString}`);
        } catch (e) {
            console.error("⚠️ Message send failed:", e.message);
            cachedMorningDate = null; // Unlock so it can retry later
        }
    }

    async function sendEveningBlast() {
        const todayString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // Output: YYYY-MM-DD
        
        // 🛡️ Guard: Prevent duplicate sends on the same day
        if (cachedEveningDate === todayString) {
            console.log(`⏸️ Evening Blast already sent for today (${todayString}). Skipping.`);
            return;
        }

        // 🔒 OPTIMISTIC LOCK: Claim task immediately to block the Watchdog from double-firing
        cachedEveningDate = todayString;

        console.log("🌙 Executing Evening Blast...");
        if (!(await ensureGroupConnection())) {
            cachedEveningDate = null; // Unlock if connection completely fails
            return;
        }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowAstroData = checkAuspiciousDay(tomorrow);
        
        let finalMessage = `🌅 *Meena Marketing - Evening Update*\n\n`;
        let imagePath = null;
        const tomorrowDateStr = tomorrow.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

        if (tomorrowAstroData.isAuspicious) {
            imagePath = await generateCelebrationImage('TOMORROW IS MUGURTHAM', tomorrowDateStr, 'mugurtham');
            finalMessage += `💍 *நாளை சுபமுகூர்த்த தினம்!*\nகடையில் நல்ல கூட்டம் வர வாய்ப்புள்ளது. நாளைக்கு தேவையான ஸ்டாக் மற்றும் டிஸ்பிளேவை இப்போதே சரியாக தயார் செய்து வையுங்கள். Let's get ready for a great sales day tomorrow! 🚀\n\n`;
        } else {
            const quote = generateEveningQuote();
            finalMessage += `💬 ${quote}\n\n`;
        }

        finalMessage += `━━━━━━━━━━━━━━━━━━\n_🤖 System Generated Message_`;

        try {
            const sendOptions = {};
            if (imagePath && fs.existsSync(imagePath)) {
                sendOptions.media = MessageMedia.fromFilePath(imagePath);
            }

            await client.sendMessage(memoryGroupId, finalMessage, sendOptions);

            if (imagePath && fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch (e) {}
            }

            // 🛡️ Blind Write to Firebase (1 Write, 0 Reads)
            await db.collection('group_message').doc('status').set({
                lastEveningBlastDate: todayString
            }, { merge: true });

            console.log(`✅ Evening Blast completed and logged for ${todayString}`);
        } catch (e) {
            console.error("⚠️ Message send failed:", e.message);
            cachedEveningDate = null; // Unlock so it can retry later
        }
    }

    async function sendForcedFestivalBlast(festivalName) {
        console.log(`🛠️ Executing Forced Festival Blast for: ${festivalName}...`);
        if (!(await ensureGroupConnection())) return;

        const weatherText = await getWeatherData();
        const quote = generateMorningQuote();
        
        let imagePath = null;
        const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

        let finalMessage = `🌅 *Meena Marketing Update (TEST)*\n\n`;
        finalMessage += `🌤️ *Today's Weather:* ${weatherText}\n\n`;
        
        imagePath = await generateCelebrationImage(festivalName, dateStr, 'festival');
        finalMessage += `🎉 *Festival Alert:* Happy ${festivalName} to the Meena Marketing family! Let's make today special! 🎊\n\n`;
        
        finalMessage += `💬 ${quote}\n\n`;
        finalMessage += `━━━━━━━━━━━━━━━━━━\n_🤖 System Generated Message_`;

        try {
            const sendOptions = {};
            if (imagePath && fs.existsSync(imagePath)) {
                sendOptions.media = MessageMedia.fromFilePath(imagePath);
            }
            
            await client.sendMessage(memoryGroupId, finalMessage, sendOptions);
            
            if (imagePath && fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch (e) {}
            }
        } catch (e) {
            console.error("⚠️ Message send failed:", e.message);
        }
    }

    // ---------------------------------------------------------
    // 8. ON-DEMAND TESTING COMMANDS (Admin Only)
    // ---------------------------------------------------------
    client.on('message', async (msg) => {
        if (!msg.body.toLowerCase().startsWith('!test')) return;

        // Fix: msg.author resolves the actual person in a group. msg.from gets the group ID in a group.
        const sender = msg.author || msg.from;
        
        // Security Check: Now allowing anyone as requested (previously restricted to admins)
        if (!ADMIN_NUMBERS.includes(sender)) {
            console.log(`ℹ️ Test command attempt from non-admin/anyone: ${sender}. Allowing access.`);
            // return; // Commented out to allow anyone to use the command
        }

        const args = msg.body.trim().split(' ');
        const command = args[1] ? args[1].toLowerCase() : '';

        try {
            // Acknowledge receipt immediately with an hourglass reaction
            await msg.react('⏳'); 

            if (command === 'morning') {
                console.log(`🛠️ User ${sender} triggered manual morning test.`);
                await sendMorningBlast();
                await msg.react('✅');
            } 
            else if (command === 'evening') {
                console.log(`🛠️ User ${sender} triggered manual evening test.`);
                await sendEveningBlast();
                await msg.react('✅');
            } 
            else if (command === 'festival') {
                const festivalName = args.slice(2).join(' '); // Capture everything after "!test festival"
                
                if (!festivalName) {
                    await msg.reply('⚠️ Please provide a festival name. \nExample: *!test festival Diwali*');
                    await msg.react('❌');
                    return;
                }
                
                console.log(`🛠️ User ${sender} triggered manual festival test for: ${festivalName}`);
                await sendForcedFestivalBlast(festivalName);
                await msg.react('✅');
            } 
            else {
                await msg.reply('ℹ️ *Available Test Commands:*\n\n1️⃣ `!test morning`\n2️⃣ `!test evening`\n3️⃣ `!test festival [Name]`');
                await msg.react('❓');
            }
        } catch (err) {
            console.error(`⚠️ Test command failed: ${err.message}`);
            await msg.react('❌');
        }
    });

    // ---------------------------------------------------------
    // 9. EXACT CRON SCHEDULERS
    // ---------------------------------------------------------
    // 🛡️ Strict execution with explicit timezone overrides
    cron.schedule('0 7 * * *', () => {
        console.log(`⏰ [Scheduler] Running Morning Blast at 7:00 AM IST...`);
        sendMorningBlast();
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    cron.schedule('0 17 * * *', () => {
        console.log(`⏰ [Scheduler] Running Evening Blast at 5:00 PM IST...`);
        sendEveningBlast();
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    // ---------------------------------------------------------
    // 10. BULLETPROOF WATCHDOG (Catches missed schedules safely)
    // ---------------------------------------------------------
    setInterval(async () => {
        // 1. Get strict IST Date String securely
        const todayString = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        
        // 2. Get current hour in IST (returns a number from 0 to 23)
        const hourString = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
        const currentHour = parseInt(hourString, 10);

        // Morning Catch-up: Past 7 AM, but strictly BEFORE 12 PM (Noon).
        // If the PC wakes up past noon, the morning blast is permanently skipped for today.
        if (currentHour >= 7 && currentHour < 12 && cachedMorningDate !== todayString) {
            console.log("🛡️ Watchdog caught a missed Morning Blast. Executing recovery...");
            await sendMorningBlast();
        }

        // Evening Catch-up: Past 5 PM (17), but strictly BEFORE 11 PM (23).
        if (currentHour >= 17 && currentHour < 23 && cachedEveningDate !== todayString) {
            console.log("🛡️ Watchdog caught a missed Evening Blast. Executing recovery...");
            await sendEveningBlast();
        }
    }, 10 * 60 * 1000); // Checks every 10 minutes
};