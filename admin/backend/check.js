const { MessageMedia } = require('whatsapp-web.js');
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
                    if (window.Store && window.Store.Msg) window.Store.Msg.clear();
                }).catch(() => {});
            }
        }
    }, 300000); // Check every 5 minutes

    client.on('message', async (msg) => {
        // Normalizing the input: a20 and A20 become the same
        const input = msg.body.trim().toUpperCase();

        // Pattern: Starts with 1 Letter and followed by 1-5 numbers (e.g., A20, M500)
        const accountPattern = /^[A-Z]\d{1,5}$/;

        if (accountPattern.test(input)) {
            console.log(`🔍 [META-BOT] Processing Request for: ${input}`);
            
            try {
                // 1. Fetch from Firestore 'customers' collection
                const q = await db.collection('customers').where('id', '==', input).get();
                
                if (q.empty) {
                    return msg.reply("❌ *Customer ID not found.*\nPlease check the ID and try again.");
                }

                const customer = q.docs[0].data();
                const products = customer.products || [];
                
                if (products.length === 0) {
                    return msg.reply(`⚠️ Record found for *${customer.name}*, but no active products were found.`);
                }

                // Professional "Fetching" response with Meta-style formatting
                await msg.reply(`✨ *Meena Groups Analytics*\nFound *${products.length}* active product(s) for *${customer.name}*.\n\n📥 _Generating Meta-Theme Statements..._`);

                // 2. Generate and Send specialized images for EACH product
                for (const product of products) {
                    const imageBuffer = await generateStatementImage(client, customer, product);

                    // 3. Send the Media
                    const media = new MessageMedia('image/png', imageBuffer.toString('base64'), `Statement_${input}_${product.name.replace(/\s+/g, '_')}.png`);
                    
                    await client.sendMessage(msg.from, media, { 
                        caption: `👤 *Customer:* ${customer.name}\n📦 *Product:* ${product.name}\n🆔 *Account:* ${input}\n\n*Meena Groups | Meta Quantum Analytics*` 
                    });
                }

                console.log(`✅ ${products.length} Statement(s) sent successfully for ${input}`);

            } catch (error) {
                console.error("❌ Bot Error:", error);
                msg.reply("⚠️ *System Busy:* Could not generate the image at this moment. Please try again in a few minutes.");
            }
        }
    });
};

// ---------------------------------------------------------
// 2. META-THEME A4 IMAGE GENERATOR (PREMIUM DARK UI)
// ---------------------------------------------------------
async function generateStatementImage(client, customer, product) {
    // Open a new tab in the existing browser instance
    const page = await client.pupBrowser.newPage(); 
    
    // Set viewport to A4 aspect ratio (High Resolution)
    await page.setViewport({ width: 800, height: 1131 });

    // ------------------------------------------
    // DATA PREPARATION (RUNNING BALANCE ENGINE)
    // ------------------------------------------
    const totalVal = parseFloat(product.total) || 0;
    const totalPaid = parseFloat(product.paid) || 0;
    const balance = totalVal - totalPaid;

    const statusLabel = balance <= 0 ? "PAID IN FULL" : "PAYMENT DUE";
    const statusColor = balance <= 0 ? "#00f2a9" : "#ff3b5c"; // Instagram-style Success/Danger

    // --- CALCULATE RUNNING BALANCE FOR EVERY DUE ---
    let runningPaid = 0;
    const sortedPayments = (product.payments || [])
        .sort((a, b) => (parseFloat(a.dueNumber) || 0) - (parseFloat(b.dueNumber) || 0));

    const processedLedger = sortedPayments.map(pay => {
        runningPaid += parseFloat(pay.amount) || 0;
        return {
            ...pay,
            currentBalance: totalVal - runningPaid
        };
    });

    // Capture only the LAST 10 transactions (e.g., 41 to 50) and reverse for display
    const last10 = processedLedger.slice(-10).reverse();

    // ------------------------------------------
    // META PREMIUM HTML TEMPLATE
    // ------------------------------------------
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;600;700&display=swap');
            * { box-sizing: border-box; -webkit-font-smoothing: antialiased; }
            body { 
                background: #000000; color: #ffffff; 
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif; 
                margin: 0; padding: 60px; 
                width: 800px; height: 1131px;
                display: flex; flex-direction: column;
            }
            .meta-header { 
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 50px;
            }
            .meta-logo {
                font-size: 32px; font-weight: 700; background: linear-gradient(45deg, #0084ff, #a033ff);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            }
            .meta-badge {
                background: rgba(255, 255, 255, 0.1); padding: 8px 16px; border-radius: 20px;
                font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;
            }
            
            .card {
                background: #121212; border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 24px; padding: 35px; margin-bottom: 30px;
            }
            .cust-name { font-size: 42px; font-weight: 700; margin: 0 0 10px 0; letter-spacing: -1px; }
            .cust-info { color: #b3b3b3; font-size: 16px; display: flex; gap: 20px; }
            
            .stats-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 40px; }
            .stat-box { 
                background: #1c1c1e; padding: 25px; border-radius: 24px; 
                border-left: 4px solid #333;
            }
            .stat-box.primary { border-left-color: #0084ff; }
            .stat-box.success { border-left-color: #00f2a9; }
            .stat-box.danger { border-left-color: #ff3b5c; }
            
            .stat-label { font-size: 11px; color: #8e8e93; text-transform: uppercase; font-weight: 700; margin-bottom: 8px; }
            .stat-val { font-size: 26px; font-weight: 700; }

            .ledger-section { flex: 1; }
            .ledger-head { font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #ffffff; }

            table { width: 100%; border-collapse: separate; border-spacing: 0 10px; }
            th { text-align: left; font-size: 13px; color: #8e8e93; padding: 0 15px; }
            td { 
                padding: 20px 15px; background: #121212; 
                border-top: 1px solid rgba(255, 255, 255, 0.05);
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            td:first-child { border-left: 1px solid rgba(255, 255, 255, 0.05); border-radius: 15px 0 0 15px; }
            td:last-child { border-right: 1px solid rgba(255, 255, 255, 0.05); border-radius: 0 15px 15px 0; }
            
            .due-pill { 
                background: #2c2c2e; padding: 6px 12px; border-radius: 8px; 
                font-weight: 700; font-size: 14px; 
            }
            .amt-paid { color: #00f2a9; font-weight: 700; }
            
            .meta-footer { 
                margin-top: auto; padding-top: 40px; border-top: 1px solid rgba(255, 255, 255, 0.1);
                display: flex; justify-content: space-between; align-items: center;
                color: #8e8e93; font-size: 14px;
            }
            .meta-accent { color: #0084ff; font-weight: 700; }
        </style>
    </head>
    <body>
        <div class="meta-header">
            <div class="meta-logo">MEENA GROUPS</div>
            <div class="meta-badge">Quantum AI Analytics</div>
        </div>

        <div class="card">
            <h1 class="cust-name">${customer.name}</h1>
            <div class="cust-info">
                <span>🆔 Account: ${customer.id}</span>
                <span>📦 Product: ${product.name}</span>
                <span>📍 ${customer.place || 'General'}</span>
            </div>
        </div>

        <div class="stats-row">
            <div class="stat-box primary">
                <div class="stat-label">Product Value</div>
                <div class="stat-val">₹${totalVal.toLocaleString()}</div>
            </div>
            <div class="stat-box success">
                <div class="stat-label">Total Collected</div>
                <div class="stat-val">₹${totalPaid.toLocaleString()}</div>
            </div>
            <div class="stat-box danger" style="border-left-color: ${statusColor}">
                <div class="stat-label" style="color: ${statusColor}">${statusLabel}</div>
                <div class="stat-val" style="color: ${statusColor}">₹${balance.toLocaleString()}</div>
            </div>
        </div>

        <div class="ledger-section">
            <div class="ledger-head">Recent Installments</div>
            <table>
                <thead>
                    <tr>
                        <th>DUE</th>
                        <th>TRANSACTION DATE</th>
                        <th>PAID AMOUNT</th>
                        <th style="text-align: right">REMAINING</th>
                    </tr>
                </thead>
                <tbody>
                    ${last10.map(p => `
                        <tr>
                            <td><span class="due-pill">#${p.dueNumber}</span></td>
                            <td>${p.date}</td>
                            <td class="amt-paid">₹${(parseFloat(p.amount)||0).toLocaleString()}</td>
                            <td style="text-align: right; font-weight: 700;">₹${p.currentBalance.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="meta-footer">
            <div>Generated ${new Date().toLocaleDateString('en-IN')}</div>
            <div>Powered by <span class="meta-accent">Goorac Corporation</span></div>
        </div>
    </body>
    </html>`;

    // Render the high-res image
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const screenshot = await page.screenshot({ 
        fullPage: false, 
        type: 'png',
        omitBackground: true 
    });
    
    // --- CRITICAL: Close the tab immediately to prevent memory leaks on Hugging Face ---
    await page.close().catch(() => {}); 
    return screenshot;
}
