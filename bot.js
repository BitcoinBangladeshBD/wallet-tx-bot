const fs = require('fs-extra');
const axios = require('axios');
const cheerio = require('cheerio');
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

// ============ CONFIG ============
const BOT_TOKEN = '8291238784:AAEXDTen7wPtD7WlkxCszhxQg--YLzdIzhE';
const SOURCE_CHANNEL = -1002868789953;        // @wantedeth
const ALERT_CHANNEL = -1003324201181;         // @Transactionchecker
const CHECK_INTERVAL = 5 * 60 * 1000;         // 5 minutes
const WALLET_FILE = './wallets.json';
const PORT = process.env.PORT || 3000;
const RENDER_URL = 'https://your-render-service.onrender.com'; // Replace with your Render URL

// ============ INIT BOT ============
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${RENDER_URL}/bot${BOT_TOKEN}`);

const app = express();
app.use(bodyParser.json());
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Load wallets with previous TX counts to avoid duplicate alerts
let wallets = fs.existsSync(WALLET_FILE) ? fs.readJsonSync(WALLET_FILE) : [];
wallets = wallets.map(w => ({ address: w.address || w, lastTx: w.lastTx || { ethTx: 0, bscTx: 0, polyTx: 0, baseTx: 0 } }));

function saveWallets() {
    fs.writeJsonSync(WALLET_FILE, wallets, { spaces: 2 });
}

// ============ HELPER FUNCTIONS ============
function extractAddress(text) {
    const match = text.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : null;
}

async function getTxCount(url, chain) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        let txCount = 0;

        switch(chain) {
            case 'ETH':
            case 'BSC':
            case 'POLY':
            case 'BASE':
                // All explorers have tx count in summary section; adjust selector if needed
                txCount = $('#ContentPlaceHolder1_divSummary .row:nth-child(1) .col-md-8').text();
                break;
            default:
                txCount = '0';
        }

        return parseInt(txCount.replace(/[^0-9]/g, '') || 0);
    } catch (e) {
        console.error(`Error fetching ${chain} tx count for ${url}:`, e.message);
        return 0;
    }
}

async function checkWallet(wallet) {
    const ethTx = await getTxCount(`https://etherscan.io/address/${wallet}`, 'ETH');
    const bscTx = await getTxCount(`https://bscscan.com/address/${wallet}`, 'BSC');
    const polyTx = await getTxCount(`https://polygonscan.com/address/${wallet}`, 'POLY');
    const baseTx = await getTxCount(`https://basescan.org/address/${wallet}`, 'BASE');

    return { ethTx, bscTx, polyTx, baseTx };
}

async function sendAlert(wallet, txs, delta) {
    const msg = `🧠 Transaction Alert Found!
🧾 Address: ${wallet}
📊 Ethereum: ${txs.ethTx} tx ${delta.ethTx > 0 ? `(+${delta.ethTx})` : ''}
📊 BSC: ${txs.bscTx} tx ${delta.bscTx > 0 ? `(+${delta.bscTx})` : ''}
📊 Polygon: ${txs.polyTx} tx ${delta.polyTx > 0 ? `(+${delta.polyTx})` : ''}
📊 Base: ${txs.baseTx} tx ${delta.baseTx > 0 ? `(+${delta.baseTx})` : ''}
🔗 Explorers
ETH: https://etherscan.io/address/${wallet}
BSC: https://bscscan.com/address/${wallet}
Polygon: https://polygonscan.com/address/${wallet}
Base: https://basescan.org/address/${wallet}`;
    await bot.sendMessage(ALERT_CHANNEL, msg);
}

// ============ LISTEN TO SOURCE CHANNEL ============
bot.on('message', async (msg) => {
    if (msg.chat.id === SOURCE_CHANNEL) {
        const walletAddr = extractAddress(msg.text);
        if (walletAddr && !wallets.some(w => w.address === walletAddr)) {
            wallets.push({ address: walletAddr, lastTx: { ethTx: 0, bscTx: 0, polyTx: 0, baseTx: 0 } });
            saveWallets();
            console.log('Saved new wallet:', walletAddr);
        }
    }
});

// ============ PERIODIC CHECK ============
async function checkAllWallets() {
    for (let w of wallets) {
        const txs = await checkWallet(w.address);
        const delta = {
            ethTx: txs.ethTx - w.lastTx.ethTx,
            bscTx: txs.bscTx - w.lastTx.bscTx,
            polyTx: txs.polyTx - w.lastTx.polyTx,
            baseTx: txs.baseTx - w.lastTx.baseTx
        };
        if (delta.ethTx > 0 || delta.bscTx > 0 || delta.polyTx > 0 || delta.baseTx > 0) {
            await sendAlert(w.address, txs, delta);
            w.lastTx = txs;
            saveWallets();
        }
    }
}

setInterval(checkAllWallets, CHECK_INTERVAL);

// ============ START SERVER ============
app.listen(PORT, () => {
    console.log(`Bot server running on port ${PORT}`);
});
