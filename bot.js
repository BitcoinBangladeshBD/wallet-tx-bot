const fs = require('fs-extra');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { parse } = require('node-html-parser');

// === CONFIGURATION ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Channels
const WATCH_CHANNEL_ID = @wantedeth; // @WantedBitcoin
const ALERT_CHANNEL = '@Transactionchecker';

// JSON file
const walletsFile = './wallets.json';

// === HELPER FUNCTIONS ===
async function readWallets() {
  return fs.pathExists(walletsFile)
    ? await fs.readJson(walletsFile)
    : [];
}

async function saveWallets(wallets) {
  await fs.writeJson(walletsFile, wallets, { spaces: 2 });
}

// Extract wallet address from message text
function extractWallet(msgText) {
  const match = msgText.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

// Get transaction count via public explorer
async function getTxCount(address, chain) {
  try {
    let url = '';
    switch (chain) {
      case 'eth': url = `https://etherscan.io/address/${address}`; break;
      case 'bsc': url = `https://bscscan.com/address/${address}`; break;
      case 'polygon': url = `https://polygonscan.com/address/${address}`; break;
      case 'base': url = `https://basescan.org/address/${address}`; break;
    }
    const res = await axios.get(url);
    const root = parse(res.data);

    // Extract transaction count (adjust per explorer HTML)
    let txCountText = '';
    if (chain === 'base') {
      const el = root.querySelector('a[href$="/transactions"] span');
      txCountText = el?.text || '0';
    } else {
      const el = root.querySelector('a#transactions') || root.querySelector('.card-body span');
      txCountText = el?.text || '0';
    }

    return parseInt(txCountText.replace(/\D/g, '')) || 0;
  } catch (err) {
    console.log(`Error fetching ${chain} tx for ${address}:`, err.message);
    return 0;
  }
}

// === ADD WALLET ON NEW MESSAGE ===
bot.on('message', async (msg) => {
  try {
    if (msg.chat.id !== WATCH_CHANNEL_ID) return; // only watch source channel
    const walletAddress = extractWallet(msg.text);
    if (!walletAddress) return;

    const wallets = await readWallets();
    if (!wallets.find(w => w.address === walletAddress)) {
      wallets.push({ address: walletAddress, ethTx: 0, bscTx: 0, polygonTx: 0, baseTx: 0 });
      await saveWallets(wallets);

      console.log(`New wallet added: ${walletAddress}`);

      // Send new wallet alert
      const message = `
🧠 New Wallet Scanned
🧾 Address: ${walletAddress}

❌ Ethereum: 0
🔗 Explorer: https://etherscan.io/address/${walletAddress}

❌ BSC: 0
🔗 Explorer: https://bscscan.com/address/${walletAddress}

❌ Polygon: 0
🔗 Explorer: https://polygonscan.com/address/${walletAddress}

❌ Base: 0
🔗 Explorer: https://basescan.org/address/${walletAddress}
      `;
      await bot.sendMessage(ALERT_CHANNEL, message);
    }
  } catch (err) {
    console.log('Error processing new message:', err.message);
  }
});

// === CHECK TRANSACTIONS ===
async function checkTransactions() {
  const wallets = await readWallets();

  for (let wallet of wallets) {
    const ethTx = await getTxCount(wallet.address, 'eth');
    const bscTx = await getTxCount(wallet.address, 'bsc');
    const polygonTx = await getTxCount(wallet.address, 'polygon');
    const baseTx = await getTxCount(wallet.address, 'base');

    if (ethTx > wallet.ethTx || bscTx > wallet.bscTx || polygonTx > wallet.polygonTx || baseTx > wallet.baseTx) {
      wallet.ethTx = ethTx;
      wallet.bscTx = bscTx;
      wallet.polygonTx = polygonTx;
      wallet.baseTx = baseTx;

      const message = `
🧠 Transaction Alert Found!
🧾 Address: ${wallet.address}
📊 Ethereum: ${ethTx} tx
📊 BSC: ${bscTx} tx
📊 Polygon: ${polygonTx} tx
📊 Base: ${baseTx} tx
🔗 Explorers
ETH: https://etherscan.io/address/${wallet.address}
BSC: https://bscscan.com/address/${wallet.address}
Polygon: https://polygonscan.com/address/${wallet.address}
Base: https://basescan.org/address/${wallet.address}
      `;

      await bot.sendMessage(ALERT_CHANNEL, message);
      console.log(`Alert sent for wallet: ${wallet.address}`);
    }
  }

  await saveWallets(wallets);
}

// === SCHEDULE CHECKS EVERY 5 MINUTES ===
setInterval(checkTransactions, 5 * 60 * 1000);

// Initial run
checkTransactions();
