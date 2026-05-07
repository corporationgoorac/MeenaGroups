const { MessageMedia } = require('whatsapp-web.js'); // FIXED: Changed 'Const' to 'const'
const admin = require('firebase-admin');

// Use the existing Firestore instance
const db = admin.firestore();

// ---------------------------------------------------------
// 1. THE MESSAGE LISTENER (Interactive Bot Logic)
// ---------------------------------------------------------
module.exports = function(client) {
    // --- ADVANCED MEMORY GUARD: Prevents crashes on low-resource environments like Hugging Face ---
    const monitorMemory = setInterval(async () => {
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        if (memoryUsage > 450) { // If memory exceeds 450MB
            console.log(`⚠️ High Memory Detected (${Math.round(memoryUsage)}MB). Purging message cache...`);
            // This clears the internal message store to free RAM without logging out
            if (client.pupPage) {
                await client.pupPage.evaluate(() => {
                    if (typeof window !== 'undefined' && window.Store && window.Store.Msg) { // POLISH: Added typeof window check
                        window.Store.Msg.clear();
                    }
                }).catch(() => {});
            }
        }
    }, 300000); // Check every 5 minutes

    client.on('message', async (msg) => {
        // Normalizing the input: 'c 44', 'C 44', and ' c44 ' all become 'C44'
       const input = msg.body.replace(/\s+/g, '').toUpperCase();

        // Pattern: Starts with 1 Letter and followed by 1-5 numbers (e.g., A20, M500)
        const accountPattern = /^[A-Z]\d{1,5}$/;

        if (accountPattern.test(input)) {
            console.log(`🔍 [BOT] Processing Request for: ${input}`);
            
            try {
                // 1. Fetch from Firestore 'customers' collection
                // Ensure your Firestore documents store the 'id' as a String to match this input
                const q = await db.collection('customers').where('id', '==', input).get();
                
                if (q.empty) {
                    return msg.reply("❌ *Customer ID not found.*\nPlease check the ID and try again.\n\n❌ *வாடிக்கையாளர் எண் காணப்படவில்லை.*\nஎண்ணை சரிபார்த்து மீண்டும் முயற்சிக்கவும்.");
                }

                // FIXED: Extract data from the first document in the array
                const customer = q.docs[0].data(); 
                const products = customer.products || [];
                
                if (products.length === 0) {
                    return msg.reply(`⚠️ Record found for *${customer.name}*, but no active products were found.\n\n⚠️ *${customer.name}* க்கான பதிவு உள்ளது, ஆனால் செயலில் உள்ள பொருட்கள் எதுவும் இல்லை.`);
                }

                // 2. Fetch Temporary Entries (Pending/Drafts) from Firestore for this customer
                const tempDocs = await db.collection('temp_entries').where('customerId', '==', input).get();
                const tempEntries = [];
                tempDocs.forEach(doc => tempEntries.push(doc.data()));

                // Professional "Fetching" response with Goorac styling & Tamil
                await msg.reply(`✨ _Goorac_ Analytics\nFound *${products.length}* active product(s) for *${customer.name}*.\n\n📥 _Generating Statements..._ | _அறிக்கைகளை உருவாக்குகிறது..._`);

                // 3. Generate and Send specialized images for EACH product
                for (const product of products) {
                    // Pass tempEntries down to the generator
                    const imageBuffer = await generateStatementImage(client, customer, product, tempEntries);

                    // 4. Send the Media
                    const media = new MessageMedia('image/png', imageBuffer.toString('base64'), `Statement_${input}_${product.name.replace(/\s+/g, '_')}.png`);
                    
                    // UPDATED LINE: Added the dynamic /#${input} to the URL for instant login
                    const caption = `👤 *Customer / வாடிக்கையாளர்:* ${customer.name}\n📦 *Product / பொருள்:* ${product.name}\n🆔 *Account / கணக்கு:* ${input}\n\n🌐 *View full payments details / முழு கட்டண விவரங்களை இங்கே காணவும்:*\nhttps://meena.goorac.biz/#${input}\n\n✨ _Goorac_`;

                    await client.sendMessage(msg.from, media, { caption: caption });
                }

                console.log(`✅ ${products.length} Statement(s) sent successfully for ${input}`);

            } catch (error) {
                console.error("❌ Bot Error:", error);
                msg.reply("⚠️ *System Busy:* Could not generate the image at this moment. Please try again in a few minutes.\n\n⚠️ *கணினி பிஸியாக உள்ளது:* தற்போது அறிக்கை உருவாக்க முடியவில்லை. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.");
            }
        }
    });
};

// ---------------------------------------------------------
// 2. GOORAC A4 IMAGE GENERATOR (DYNAMIC LIGHT/DARK THEME)
// ---------------------------------------------------------
async function generateStatementImage(client, customer, product, tempEntries) {
    let page;
    try {
        // POLISH: Verify the browser instance is available before opening a tab
        if (!client.pupBrowser) {
            throw new Error("Puppeteer browser instance is not available. Client may be disconnected.");
        }

        // Open a new tab in the existing browser instance
        page = await client.pupBrowser.newPage(); 
        
        // Set viewport to A4 aspect ratio (High Resolution)
        await page.setViewport({ width: 800, height: 1131 });

        // ------------------------------------------
        // THEME GENERATOR (Randomly Light or Dark)
        // ------------------------------------------
        const isDarkTheme = Math.random() > 0.5;
        
        const theme = {
            bg: isDarkTheme ? '#050505' : '#f0f2f5',
            cardBg: isDarkTheme ? '#121212' : '#ffffff',
            textMain: isDarkTheme ? '#ffffff' : '#1c1e21',
            textMuted: isDarkTheme ? '#b3b3b3' : '#65676B',
            borderColor: isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
            tableBg: isDarkTheme ? '#1c1c1e' : '#f7f8fa',
            accentGradient: 'linear-gradient(45deg, #0064e0, #d936cf)', // Meta AI Signature gradient
            accentBlue: '#0064e0',
            success: '#00a400',
            warning: '#ffb300', // For processing/pending
            danger: '#fa383e'
        };

        // ------------------------------------------
        // DATA PREPARATION (MERGING APPROVED + TEMP)
        // ------------------------------------------
        const totalVal = parseFloat(product.total) || 0;
        
        // 1. Map approved payments
        let allTxns = (product.payments || []).map(pay => ({
            ...pay,
            status: 'approved'
        }));

        // 2. Map pending/draft payments for THIS specific product
        const relevantTemps = tempEntries.filter(t => t.productName === product.name);
        relevantTemps.forEach(t => {
            allTxns.push({
                dueNumber: t.dueNumber,
                date: t.date,
                amount: t.amount,
                status: t.status // 'pending' or 'draft'
            });
        });

        // 3. Sort chronologically by due number
        allTxns.sort((a, b) => (parseFloat(a.dueNumber) || 0) - (parseFloat(b.dueNumber) || 0));

        // 4. Calculate Running Balance
        let runningPaid = 0;
        const processedLedger = allTxns.map(pay => {
            runningPaid += parseFloat(pay.amount) || 0;
            return {
                ...pay,
                currentBalance: totalVal - runningPaid
            };
        });

        const outstanding = totalVal - runningPaid;
        const statusLabel = outstanding <= 0 ? "PAID IN FULL" : "PAYMENT DUE";
        const statusColor = outstanding <= 0 ? theme.success : theme.danger;

        // Capture only the LAST 10 transactions (e.g., 41 to 50) and reverse for display
        const last10 = processedLedger.slice(-10).reverse();

        // Helper for status badge rendering
        const getStatusBadge = (status) => {
            if(status === 'pending' || status === 'draft') return `<span style="color: ${theme.warning}; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">PROCESSING</span>`;
            return `<span style="color: ${theme.success}; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">PAID</span>`;
        };

        // ------------------------------------------
        // HTML TEMPLATE
        // ------------------------------------------
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;600;700;800&display=swap');
                * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
                body { 
                    background: ${theme.bg}; color: ${theme.textMain}; 
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; 
                    margin: 0; padding: 60px; 
                    width: 800px; height: 1131px;
                    display: flex; flex-direction: column;
                }
                .meta-header { 
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 50px;
                }
                .brand-logo {
                    font-size: 32px; font-weight: 800; background: ${theme.accentGradient};
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }
                .brand-badge {
                    background: ${theme.borderColor}; padding: 8px 16px; border-radius: 20px;
                    font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;
                    color: ${theme.textMain};
                }
                
                .card {
                    background: ${theme.cardBg}; border: 1px solid ${theme.borderColor};
                    border-radius: 24px; padding: 40px; margin-bottom: 30px;
                    box-shadow: ${isDarkTheme ? '0 20px 40px rgba(0,0,0,0.4)' : '0 10px 30px rgba(0,0,0,0.05)'};
                }
                .cust-name { font-size: 42px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -1px; }
                .cust-info { color: ${theme.textMuted}; font-size: 16px; display: flex; gap: 20px; font-weight: 500; }
                
                .stats-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 40px; }
                .stat-box { 
                    background: ${theme.cardBg}; padding: 25px; border-radius: 24px; 
                    border: 1px solid ${theme.borderColor};
                    border-top: 4px solid ${theme.borderColor};
                    box-shadow: ${isDarkTheme ? 'none' : '0 4px 15px rgba(0,0,0,0.03)'};
                }
                .stat-box.primary { border-top-color: ${theme.accentBlue}; }
                .stat-box.success { border-top-color: ${theme.success}; }
                .stat-box.danger { border-top-color: ${statusColor}; }
                
                .stat-label { font-size: 12px; color: ${theme.textMuted}; text-transform: uppercase; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.5px; }
                .stat-val { font-size: 28px; font-weight: 800; color: ${theme.textMain}; }

                .ledger-section { flex: 1; }
                .ledger-head { font-size: 20px; font-weight: 800; margin-bottom: 20px; color: ${theme.textMain}; letter-spacing: -0.5px; }

                table { width: 100%; border-collapse: separate; border-spacing: 0 8px; }
                th { text-align: left; font-size: 13px; color: ${theme.textMuted}; padding: 0 20px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;}
                td { 
                    padding: 20px; background: ${theme.tableBg}; 
                    border-top: 1px solid ${theme.borderColor};
                    border-bottom: 1px solid ${theme.borderColor};
                    font-size: 15px; font-weight: 500;
                }
                td:first-child { border-left: 1px solid ${theme.borderColor}; border-radius: 16px 0 0 16px; }
                td:last-child { border-right: 1px solid ${theme.borderColor}; border-radius: 0 16px 16px 0; }
                
                .due-pill { 
                    background: ${isDarkTheme ? '#2c2c2e' : '#e4e6eb'}; 
                    color: ${theme.textMain};
                    padding: 6px 14px; border-radius: 10px; 
                    font-weight: 800; font-size: 14px; 
                }
                .amt-paid { color: ${theme.textMain}; font-weight: 700; font-family: monospace; font-size: 16px;}
                .amt-bal { text-align: right; font-weight: 800; font-family: monospace; font-size: 16px; color: ${theme.textMuted}; }
                
                .site-footer { 
                    margin-top: auto; padding-top: 40px; border-top: 1px solid ${theme.borderColor};
                    display: flex; justify-content: space-between; align-items: center;
                    color: ${theme.textMuted}; font-size: 14px; font-weight: 500;
                }
                .brand-accent { color: ${theme.accentBlue}; font-weight: 700; font-style: italic; }
            </style>
        </head>
        <body>
            <div class="meta-header">
                <div class="brand-logo">MEENA GROUPS</div>
                <div class="brand-badge">Goorac AI Analytics</div>
            </div>

            <div class="card">
                <h1 class="cust-name">${customer.name}</h1>
                <div class="cust-info">
                    <span>🆔 Account: ${customer.id}</span>
                    <span>📦 Product: ${product.name}</span>
                    <span>${customer.place ? '📍 ' + customer.place : ''}</span>
                </div>
            </div>

            <div class="stats-row">
                <div class="stat-box primary">
                    <div class="stat-label">Product Value</div>
                    <div class="stat-val">₹${totalVal.toLocaleString()}</div>
                </div>
                <div class="stat-box success">
                    <div class="stat-label">Total Collected</div>
                    <div class="stat-val">₹${runningPaid.toLocaleString()}</div>
                </div>
                <div class="stat-box danger" style="border-top-color: ${statusColor}">
                    <div class="stat-label" style="color: ${statusColor}">${statusLabel}</div>
                    <div class="stat-val" style="color: ${statusColor}">₹${outstanding.toLocaleString()}</div>
                </div>
            </div>

            <div class="ledger-section">
                <div class="ledger-head">Recent Transactions & Processing</div>
                <table>
                    <thead>
                        <tr>
                            <th width="20%">DUE</th>
                            <th width="25%">DATE</th>
                            <th width="20%">STATUS</th>
                            <th width="20%">PAID</th>
                            <th width="15%" style="text-align: right">BALANCE</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${last10.map(p => `
                            <tr>
                                <td><span class="due-pill">#${p.dueNumber}</span></td>
                                <td>${p.date}</td>
                                <td>${getStatusBadge(p.status)}</td>
                                <td class="amt-paid">₹${(parseFloat(p.amount)||0).toLocaleString()}</td>
                                <td class="amt-bal">₹${p.currentBalance.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="site-footer">
                <div>Generated ${new Date().toLocaleDateString('en-IN')}</div>
                <div>Powered by <span class="brand-accent">Goorac Secure Systems</span></div>
            </div>
        </body>
        </html>`;

        // Render the high-res image
        await page.setContent(htmlContent, { waitUntil: 'load' });
        
        // -------------------------------------------------------------
        // NEW ADDITION: 600ms Timeout for Google Fonts fallback
        // -------------------------------------------------------------
        await Promise.race([
            page.evaluateHandle('document.fonts.ready'),
            new Promise(resolve => setTimeout(resolve, 600))
        ]);

        const screenshot = await page.screenshot({ 
            fullPage: false, 
            type: 'png',
            omitBackground: true 
        });
        
        return screenshot;

    } catch (error) {
        console.error("Image generation error:", error);
        throw error;
    } finally {
        // --- CRITICAL: Ensure the tab is always closed to prevent memory leaks ---
        // POLISH: Added `!page.isClosed()` check to avoid throwing an error while trying to close an already closed page
        if (page && !page.isClosed()) {
            await page.close().catch(() => {}); 
        }
    }
}
