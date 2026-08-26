const https = require('https');
const http = require('http');
const querystring = require('querystring');
const url = require('url');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'cgsapothecary2024';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

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

function sendWhatsAppReply(phoneNumberId, to, message, accessToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      text: { body: message }
    });
    const options = {
      hostname: 'graph.facebook.com',
      path: `/v22.0/${phoneNumberId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── CORS headers for the website checkout ──
const CHECKOUT_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

// ── Create a Stripe Checkout Session from the cart ──
// Uses the raw Stripe REST API (no extra npm packages needed).
function createStripeCheckout(payload) {
  return new Promise((resolve, reject) => {
    const items = (payload && payload.items) || [];
    const c = (payload && payload.customer) || {};
    const p = [];
    const add = (k, v) => p.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));

    add('mode', 'payment');
    add('success_url', 'https://www.theunmuteateshharc.earth/?paid=1');
    add('cancel_url', 'https://www.theunmuteateshharc.earth/apothecary');
    if (c.email) add('customer_email', c.email);

    items.forEach((it, i) => {
      const label = it.size ? (it.name + ' (' + it.size + ')') : it.name;
      const cents = Math.round(Number(it.price) * 100);
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      add('line_items[' + i + '][price_data][currency]', 'usd');
      add('line_items[' + i + '][price_data][product_data][name]', label);
      add('line_items[' + i + '][price_data][unit_amount]', cents);
      add('line_items[' + i + '][quantity]', qty);
    });

    // Store who ordered + where to ship in the payment's metadata (visible in Stripe)
    add('metadata[customer_name]', c.name || '');
    add('metadata[phone]', c.phone || '');
    add('metadata[shipping]', [c.addr1, c.city, c.state, c.zip, c.country].filter(Boolean).join(', '));
    if (c.notes) add('metadata[notes]', c.notes.slice(0, 480));

    const body = p.join('&');
    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/checkout/sessions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const sreq = https.request(options, (sres) => {
      let data = '';
      sres.on('data', ch => data += ch);
      sres.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.url) resolve(parsed.url);
          else reject(new Error(parsed && parsed.error ? parsed.error.message : ('Stripe error: ' + data)));
        } catch (e) { reject(e); }
      });
    });
    sreq.on('error', reject);
    sreq.write(body);
    sreq.end();
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // Health check
  if (req.method === 'GET' && parsedUrl.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Esh-har Spirit Guide WhatsApp Bot is running! ✦');
    return;
  }

  // Meta webhook verification (GET)
  if (req.method === 'GET' && parsedUrl.pathname === '/webhook') {
    const mode = parsedUrl.query['hub.mode'];
    const token = parsedUrl.query['hub.verify_token'];
    const challenge = parsedUrl.query['hub.challenge'];

    console.log(`Webhook verify: mode=${mode}, token=${token}`);

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified!');
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.end(challenge);
    } else {
      console.log('Webhook verification failed');
      res.writeHead(403);
      res.end('Forbidden');
    }
    return;
  }

  // Twilio webhook (POST) - legacy support
  if (req.method === 'POST' && parsedUrl.pathname === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        // Try Meta Cloud API format first
        let data;
        try {
          data = JSON.parse(body);
        } catch(e) {
          data = null;
        }

        if (data && data.object === 'whatsapp_business_account') {
          // Meta Cloud API format
          const entry = data.entry && data.entry[0];
          const changes = entry && entry.changes && entry.changes[0];
          const value = changes && changes.value;
          const messages = value && value.messages;

          if (messages && messages[0]) {
            const msg = messages[0];
            const from = msg.from;
            const text = msg.text && msg.text.body;
            const phoneNumberId = value.metadata && value.metadata.phone_number_id;
            const accessToken = process.env.META_ACCESS_TOKEN;

            console.log(`[Meta IN] ${from}: ${text}`);

            if (text && phoneNumberId && accessToken) {
              if (!conversations[from]) conversations[from] = [];
              if (conversations[from].length > 10) conversations[from] = conversations[from].slice(-10);
              conversations[from].push({role: 'user', content: text});

              try {
                const reply = await callClaude(conversations[from]);
                conversations[from].push({role: 'assistant', content: reply});
                await sendWhatsAppReply(phoneNumberId, from, reply, accessToken);
                console.log(`[Meta OUT] ${from}: ${reply}`);
              } catch(err) {
                console.error('Claude error:', err.message);
                await sendWhatsAppReply(phoneNumberId, from, 'Blessings beloved. I am momentarily still. Please try again shortly. ✦', accessToken);
              }
            }
          }

          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({status: 'ok'}));

        } else {
          // Twilio format
          const params = querystring.parse(body);
          const from = params.From || '';
          const msgBody = params.Body ? params.Body.trim() : '';
          console.log(`[Twilio IN] ${from}: ${msgBody}`);

          if (!msgBody) {
            res.writeHead(200, {'Content-Type': 'text/xml'});
            res.end('<Response></Response>');
            return;
          }

          if (!conversations[from]) conversations[from] = [];
          if (conversations[from].length > 10) conversations[from] = conversations[from].slice(-10);
          conversations[from].push({role: 'user', content: msgBody});

          const reply = await callClaude(conversations[from]);
          conversations[from].push({role: 'assistant', content: reply});
          console.log(`[Twilio OUT] ${from}: ${reply}`);

          const safe = reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          res.writeHead(200, {'Content-Type': 'text/xml'});
          res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`);
        }
      } catch(err) {
        console.error('Error:', err.message);
        res.writeHead(200, {'Content-Type': 'text/xml'});
        res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Blessings beloved. I am momentarily still. ✦</Message></Response>`);
      }
    });
    return;
  }

  // ── CORS preflight for the website checkout ──
  if (req.method === 'OPTIONS' && parsedUrl.pathname === '/create-checkout') {
    res.writeHead(204, CHECKOUT_CORS);
    res.end();
    return;
  }

  // ── Website checkout: build a Stripe payment page from the cart ──
  if (req.method === 'POST' && parsedUrl.pathname === '/create-checkout') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set on the server');
        const payload = JSON.parse(body || '{}');
        if (!payload.items || !payload.items.length) throw new Error('Cart is empty');
        const checkoutUrl = await createStripeCheckout(payload);
        console.log('[Checkout] session created for ' + (payload.customer && payload.customer.email));
        res.writeHead(200, Object.assign({'Content-Type': 'application/json'}, CHECKOUT_CORS));
        res.end(JSON.stringify({ url: checkoutUrl }));
      } catch (err) {
        console.error('[Checkout] error:', err.message);
        res.writeHead(500, Object.assign({'Content-Type': 'application/json'}, CHECKOUT_CORS));
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── CORS preflight for the website Spirit Guide chat widget ──
  if (req.method === 'OPTIONS' && parsedUrl.pathname === '/chat') {
    res.writeHead(204, CHECKOUT_CORS);
    res.end();
    return;
  }

  // ── Website Spirit Guide chat widget ──
  if (req.method === 'POST' && parsedUrl.pathname === '/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set on the server');
        const payload = JSON.parse(body || '{}');
        let messages;
        if (Array.isArray(payload.messages) && payload.messages.length) {
          messages = payload.messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content != null ? m.content : (m.text || ''))
          }));
        } else {
          const userText = payload.message || payload.text || payload.prompt || payload.input || payload.question || '';
          messages = [{ role: 'user', content: String(userText) }];
        }
        if (!messages.length || !String(messages[messages.length - 1].content).trim()) {
          throw new Error('No message provided');
        }
        const reply = await callClaude(messages);
        console.log('[Website Chat] replied');
        res.writeHead(200, Object.assign({'Content-Type': 'application/json'}, CHECKOUT_CORS));
        // Send the reply under several common field names so the existing widget finds it
        res.end(JSON.stringify({ reply: reply, response: reply, message: reply, text: reply, content: reply }));
      } catch (err) {
        console.error('[Website Chat] error:', err.message);
        const grace = 'Blessings beloved. I am momentarily still. Please try again in a moment. \u2726';
        res.writeHead(200, Object.assign({'Content-Type': 'application/json'}, CHECKOUT_CORS));
        res.end(JSON.stringify({ reply: grace, response: grace, message: grace, text: grace, content: grace, error: err.message }));
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
