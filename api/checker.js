import axios from "axios";
import { kv } from "@vercel/kv";

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_CHAT_ID = process.env.CHAT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;

// helper: send to user + channel
async function sendToTargets(text) {
  try {
    if (OWNER_CHAT_ID) {
      await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        params: { chat_id: OWNER_CHAT_ID, text, parse_mode: "Markdown" }
      });
    }
    if (CHANNEL_ID) {
      await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        params: { chat_id: CHANNEL_ID, text, parse_mode: "Markdown" }
      });
    }
  } catch (e) {
    console.error("sendToTargets error:", e?.response?.data || e.message);
  }
}

// Get transaction count via Blockscout for ETH/POLY/BASE
async function getTx_blockscout(baseUrl, address) {
  try {
    const r = await axios.get(`${baseUrl}/api/v2/addresses/${address}`);
    return Number(r.data.transaction_count || 0);
  } catch (e) {
    return 0;
  }
}

// BSC via RPC eth_getTransactionCount
async function getTx_bsc_rpc(address) {
  try {
    const r = await axios.post("https://bsc-dataseed1.binance.org", {
      jsonrpc: "2.0",
      method: "eth_getTransactionCount",
      params: [address, "latest"],
      id: 1
    });
    return parseInt(r.data.result || "0x0", 16);
  } catch (e) {
    return 0;
  }
}

async function checkAddress(address) {
  // fetch current counts
  const eth = await getTx_blockscout("https://eth.blockscout.com", address);
  const poly = await getTx_blockscout("https://polygon.blockscout.com", address);
  const base = await getTx_blockscout("https://base.blockscout.com", address);
  const bsc = await getTx_bsc_rpc(address);

  // get last known
  const last = (await kv.get(`tx:${address}`)) || { eth: 0, bsc: 0, poly: 0, base: 0 };

  // if any increased -> alert
  if (eth > last.eth || bsc > last.bsc || poly > last.poly || base > last.base) {
    const msg = `🧠 *Transaction Alert Found!*\n\n🧾 Address: \`${address}\`\n\n📊 Ethereum: ${eth} tx\n🔗 https://etherscan.io/address/${address}\n\n📊 BSC: ${bsc} tx\n🔗 https://bscscan.com/address/${address}\n\n📊 Polygon: ${poly} tx\n🔗 https://polygonscan.com/address/${address}\n\n📊 Base: ${base} tx\n🔗 https://basescan.org/address/${address}`;

    await sendToTargets(msg);
  }

  // update KV
  await kv.set(`tx:${address}`, { eth, bsc, poly, base });
}

export default async function handler(req, res) {
  // list all keys (wallet addresses) in KV
  try {
    const keys = await kv.keys("*");
    // keys includes tx: keys as well, we skip tx:*
    const addresses = keys.filter(k => !k.startsWith("tx:"));
    for (const addr of addresses) {
      try {
        await checkAddress(addr);
      } catch (e) {
        console.error("checkAddress error", addr, e.message);
      }
    }
    return res.status(200).json({ ok: true, checked: addresses.length });
  } catch (e) {
    console.error("checker error", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
}
