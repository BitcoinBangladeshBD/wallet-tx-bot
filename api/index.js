import axios from "axios";
import { kv } from "@vercel/kv";

// ⚡ Your Telegram API Info
const BOT_TOKEN = "8291238784:AAEXDTen7wPtD7WlkxCszhxQg--YLzdIzhE";
const CHAT_ID = "892636707"; // Your personal Telegram ID
const CHANNEL_ID = "@Transactionchecker"; // Your Telegram channel

// Function to send message to user + channel
async function sendMessage(msg) {
  try {
    // Send to user
    await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      params: { chat_id: CHAT_ID, text: msg, parse_mode: "Markdown" }
    });

    // Send to channel
    if (CHANNEL_ID) {
      await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        params: { chat_id: CHANNEL_ID, text: msg, parse_mode: "Markdown" }
      });
    }
  } catch (e) {
    console.error("Telegram send error:", e.message);
  }
}

// Extract Ethereum-compatible address
function extractAddress(text) {
  const match = text.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

// Get transaction counts for each blockchain
async function getTx_ETH(address) {
  try {
    const r = await axios.get(`https://etherscan.io/address/${address}`);
    // Parse tx count from HTML (simple approach)
    const match = r.data.match(/Transactions<\/span>\s*<span.*?>(\d+)/i);
    return match ? parseInt(match[1]) : 0;
  } catch { return 0; }
}

async function getTx_BSC(address) {
  try {
    const r = await axios.get(`https://bscscan.com/address/${address}`);
    const match = r.data.match(/Transactions<\/span>\s*<span.*?>(\d+)/i);
    return match ? parseInt(match[1]) : 0;
  } catch { return 0; }
}

async function getTx_POLYGON(address) {
  try {
    const r = await axios.get(`https://polygonscan.com/address/${address}`);
    const match = r.data.match(/Transactions<\/span>\s*<span.*?>(\d+)/i);
    return match ? parseInt(match[1]) : 0;
  } catch { return 0; }
}

async function getTx_BASE(address) {
  try {
    const r = await axios.get(`https://basescan.org/address/${address}`);
    const match = r.data.match(/Transactions<\/span>\s*<span.*?>(\d+)/i);
    return match ? parseInt(match[1]) : 0;
  } catch { return 0; }
}

// Check transactions and send alert if new tx detected
async function checkAddress(address) {
  const eth = await getTx_ETH(address);
  const bsc = await getTx_BSC(address);
  const poly = await getTx_POLYGON(address);
  const base = await getTx_BASE(address);

  const last = await kv.get(`tx:${address}`) || { eth: 0, bsc: 0, poly: 0, base: 0 };

  if (eth > last.eth || bsc > last.bsc || poly > last.poly || base > last.base) {
    const msg = `
🧠 Transaction Alert!

🧾 Address: \`${address}\`

📊 Ethereum: ${eth} tx
🔗 https://etherscan.io/address/${address}

📊 BSC: ${bsc} tx
🔗 https://bscscan.com/address/${address}

📊 Polygon: ${poly} tx
🔗 https://polygonscan.com/address/${address}

📊 Base: ${base} tx
🔗 https://basescan.org/address/${address}
    `;
    await sendMessage(msg);
  }

  await kv.set(`tx:${address}`, { eth, bsc, poly, base });
}

// Vercel serverless handler
export default async function handler(req, res) {
  // 1️⃣ Collect new wallet from Telegram message
  if (req.method === "POST" && req.body?.message) {
    const text = req.body.message.text || "";
    const address = extractAddress(text);
    if (address) {
      const exists = await kv.get(address);
      if (!exists) {
        await kv.set(address, true);
        await kv.set(`tx:${address}`, { eth: 0, bsc: 0, poly: 0, base: 0 });
        await sendMessage(`📝 New wallet added for monitoring: ${address}`);
      }
    }
  }

  // 2️⃣ Check all wallets for new transactions
  const keys = await kv.keys("*");
  for (const addr of keys) {
    if (addr.startsWith("tx:")) continue;
    await checkAddress(addr);
  }

  res.status(200).json({ ok: true, checked: keys.length });
        }
