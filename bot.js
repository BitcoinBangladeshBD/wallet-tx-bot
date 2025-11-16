const fs = require('fs-extra');
const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');

// ============ CONFIG ============
const BOT_TOKEN = '8291238784:AAEXDTen7wPtD7WlkxCszhxQg--YLzdIzhE';
const SOURCE_CHANNEL = -1002868789953;        // @wantedeth
const ALERT_CHANNEL = -1003324201181;         // @Transactionchecker
const CHECK_INTERVAL = 5 * 60 * 1000;         // 5 minutes
const WALLET_FILE = './wallets.json';

// ============ INIT BOT ============
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let wallets = fs.existsSync(WALLET_FILE) ? fs.readJsonSync(WALLET_FILE) : [];

// ============ HELPER FUNCTIONS ============
function saveWallets() {
    fs.writeJsonSync(WALLET_FILE, wallets, { spaces: 2 });
}

function extractAddress(text) {
    const match = text.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : null;
}

async function getTxCount(url, selector) {
    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        let txCount = $(selector).text() || '0';
        return parseInt(txCount.replace(/\D/g, '') || 0);
    } catch (e) {
        console.error('Error fetching:', url, e.message);
        return 0;
    }
}

async function checkWallet(wallet) {
    const ethTx = await getTxCount(`https://etherscan.io/address/${wallet}`, '.u-label');   // update selector if needed
    const bscTx = await getTxCount(`https://bscscan.com/address/${wallet}`, '.u-label');
    const polyTx = await getTxCount(`https://polygonscan.com/address/${wallet}`, '.u-label');
    const baseTx = await getTxCount(`https://basescan.org/address/${wallet}`, '.u-label');

    return { ethTx, bscTx, polyTx, baseTx };
}

async function sendAlert(wallet, txs) {
    const msg = `🧠 Transaction Alert Found!
🧾 Address: ${wallet}
📊 Ethereum: ${txs.ethTx} tx
📊 BSC: ${txs.bscTx} tx
📊 Polygon: ${txs.polyTx} tx
📊 Base: ${txs.baseTx} tx
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
        const wallet = extractAddress(msg.text);
        if (wallet && !wallets.includes(wallet)) {
            wallets.push(wallet);
            saveWallets();
            console.log('Saved new wallet:', wallet);
        }
    }
});

// ============ PERIODIC CHECK ============
setInterval(async () => {
    for (let wallet of wallets) {
        const txs = await checkWallet(wallet);
        if (txs.ethTx + txs.bscTx + txs.polyTx + txs.baseTx > 0) {
            await sendAlert(wallet, txs);
        }
    }
}, CHECK_INTERVAL);
