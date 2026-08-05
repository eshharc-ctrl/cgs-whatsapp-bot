const https = require('https');
const http = require('http');
const querystring = require('querystring');
const url = require('url');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'cgsapothecary2024';

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
      path: `/v18.0/${phoneNumberId}/messages`,
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

  res.writeHead(404);
  res.end('Not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Esh-har Spirit Guide running on port ${PORT}`);
});
