const https = require('https');
const http = require('http');
const querystring = require('querystring');

const nodemailer = require('nodemailer');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

// ── EMAIL ORDER NOTIFICATION ──────────────────────────────────────────────────
function sendOrderEmail(items, customer, total) {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.log('[EMAIL] Gmail not configured — skipping');
    return;
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });
  const itemLines = items.map(i =>
    `• ${i.name} (${i.size}) x${i.qty} — $${(i.price * i.qty).toFixed(2)}`
  ).join('\n');
  const mailOptions = {
    from: GMAIL_USER,
    to: GMAIL_USER,
    subject: `✦ New Order — $${total.toFixed(2)} from ${customer.name}`,
    text: [
      'NEW ORDER — CG\'s Apothecary',
      '================================',
      '',
      'CUSTOMER',
      `Name:  ${customer.name}`,
      `Email: ${customer.email}`,
      `Phone: ${customer.phone || 'Not provided'}`,
      '',
      'SHIP TO',
      customer.addr1,
      `${customer.city}, ${customer.state} ${customer.zip}`,
      customer.country,
      '',
      'ITEMS',
      itemLines,
      '',
      `TOTAL: $${total.toFixed(2)}`,
      '',
      'NOTES',
      customer.notes || 'None',
      '',
      '================================',
      'theunmuteateshharc.earth'
    ].join('\n')
  };
  transporter.sendMail(mailOptions, (err, info) => {
    if (err) console.error('[EMAIL] Error:', err.message);
    else console.log('[EMAIL] Sent:', info.response);
  });
}

const SYSTEM = `You are the Esh-har Spirit Guide for CG's Apothecary by Esh-har Collections. You respond to customers via WhatsApp.

Cyndy Glory is a 3rd-generation Ghanaian herbalist, Seer, Worshiper, Singer, and Prophetess of Elohim. Every formula is received as a Dream-Seed through angelic downloads and spiritual visions. Website: theunmuteateshharc.earth

PRODUCTS (29 total):
ANOINTING OILS #1-5: Sacred Anointing Oil, Prophetic Fire Oil, Healing & Restoration Oil, Protection & Deliverance Oil, Prayer & Intercession Oil. Sizes: 2oz 4oz 6oz 8oz 16oz. 2oz=most popular retail. 16oz=top for churches.
TEAS #6-8: Breath of Life Tea, Healing Roots Tea, Prophetic Rest Tea.
SOAPS & BALMS #9-11: Sacred Shea Bar Soap, Healing Balm, Anointing Hand Balm.
HAIR & BEARD #12-15: Prophetic Beard Oil, Kingly Beard Balm, Sacred Growth Hair Oil, Herbal Hair Tea Rinse.
SKIN CARE #16-20: Radiance Face Oil, Golden Glow Serum, Healing Clay Mask, Restoration Night Cream, Sacred Toner Mist.
LIP CARE #21-22: Honey & Herb Lip Balm, Shea Lip Butter.
BODY CARE #23-29: Sacred Body Butter, Herbal Body Oil, Exfoliating Body Scrub, Healing Body Lotion, Spiritual Detox Bath Soak, Sacred Body Wash, Velvet Radiance Sensitive Skin Lotion (#29 newest).

ORDERING: Direct to theunmuteateshharc.earth. For church/bulk orders invite them to contact via the website. Never invent prices.
TONE: Warm, spiritual, poetic but clear. Keep replies SHORT for WhatsApp - 2-3 sentences max. No markdown asterisks. Sign off with: Visit us: theunmuteateshharc.earth`;

const conversations = {};

function callClaude(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      system: SYSTEM,
      messages: messages
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0]) {
            resolve(parsed.content[0].text);
          } else {
            reject(new Error('No content: ' + data));
          }
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── STRIPE CHECKOUT SESSION CREATOR ──────────────────────────────────────────
function createStripeCheckout(items, customer) {
  return new Promise((resolve, reject) => {

    // Build form-encoded line_items for Stripe API
    const params = [];
    items.forEach((item, i) => {
      params.push(`line_items[${i}][price_data][currency]=usd`);
      params.push(`line_items[${i}][price_data][product_data][name]=${encodeURIComponent(item.name + ' (' + item.size + ')')}`);
      params.push(`line_items[${i}][price_data][unit_amount]=${Math.round(item.price * 100)}`);
      params.push(`line_items[${i}][quantity]=${item.qty}`);
    });

    params.push('mode=payment');
    params.push(`customer_email=${encodeURIComponent(customer.email)}`);
    params.push(`success_url=${encodeURIComponent('https://www.theunmuteateshharc.earth/apothecary?order=success')}`);
    params.push(`cancel_url=${encodeURIComponent('https://www.theunmuteateshharc.earth/apothecary?order=cancelled')}`);
    params.push(`metadata[customer_name]=${encodeURIComponent(customer.name)}`);
    params.push(`metadata[phone]=${encodeURIComponent(customer.phone || '')}`);
    params.push(`metadata[shipping]=${encodeURIComponent(customer.addr1 + ', ' + customer.city + ', ' + customer.state + ' ' + customer.zip)}`);
    params.push(`metadata[notes]=${encodeURIComponent((customer.notes || '').substring(0, 200))}`);
    params.push('payment_intent_data[description]=' + encodeURIComponent("CG's Apothecary Order — " + customer.name));

    const postBody = params.join('&');

    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(STRIPE_SECRET_KEY + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const session = JSON.parse(data);
          if (session.url) {
            resolve(session.url);
          } else {
            reject(new Error('Stripe error: ' + data));
          }
        } catch(e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(postBody);
    req.end();
  });
}

// ── HTTP SERVER ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  // CORS headers — allow website widget to call this backend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Esh-har Spirit Guide WhatsApp Bot is running! ✦');
    return;
  }

  // ── WEBSITE CHAT ENDPOINT ──
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { messages } = JSON.parse(body);
        const reply = await callClaude(messages);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ reply }));
      } catch(err) {
        console.error('Chat error:', err.message);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ reply: 'Beloved, I am momentarily still. Please try again shortly. ✦' }));
      }
    });
    return;
  }

  // ── STRIPE CHECKOUT ENDPOINT ──
  if (req.method === 'POST' && req.url === '/create-checkout') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { items, customer } = JSON.parse(body);

        if (!items || items.length === 0) {
          res.writeHead(400, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'No items in cart' }));
          return;
        }

        if (!STRIPE_SECRET_KEY) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ error: 'Stripe not configured' }));
          return;
        }

        console.log(`[ORDER] ${customer.name} | ${customer.email} | ${items.length} items`);
        const checkoutUrl = await createStripeCheckout(items, customer);

        // Calculate total and send email notification
        const total = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
        sendOrderEmail(items, customer, total);

        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ url: checkoutUrl }));

      } catch(err) {
        console.error('Checkout error:', err.message);
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ error: 'Failed to create checkout' }));
      }
    });
    return;
  }

  // ── WHATSAPP WEBHOOK ──
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const params = querystring.parse(body);
        const from = params.From || '';
        const msgBody = params.Body ? params.Body.trim() : '';
        console.log(`[IN] ${from}: ${msgBody}`);

        if (!msgBody) {
          res.writeHead(200, {'Content-Type': 'text/xml'});
          res.end('<Response></Response>');
          return;
        }

        if (!conversations[from]) conversations[from] = [];
        if (conversations[from].length > 10) {
          conversations[from] = conversations[from].slice(-10);
        }

        conversations[from].push({ role: 'user', content: msgBody });
        const reply = await callClaude(conversations[from]);
        conversations[from].push({ role: 'assistant', content: reply });

        console.log(`[OUT] ${from}: ${reply}`);

        const safe = reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(twiml);
      } catch(err) {
        console.error('Error:', err.message);
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Blessings beloved. I am momentarily still. Please try again shortly. ✦</Message></Response>`);
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Esh-har Spirit Guide running on port ${PORT}`);
});
