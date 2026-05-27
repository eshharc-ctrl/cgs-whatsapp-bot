const https = require('https');
const http = require('http');
const querystring = require('querystring');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Esh-har Spirit Guide WhatsApp Bot is running! ✦');
    return;
  }

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

