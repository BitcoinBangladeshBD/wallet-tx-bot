# wallet-tx-bot

Telegram wallet scanner + automatic transaction alert system.

- Webhook: `/api/webhook` — add new wallets by sending/forwarding to your bot
- Checker: `/api/checker` — runs every 5 minutes and sends alerts when tx count increases
- Uses Vercel KV for storage

## Environment variables (set on Vercel)
- BOT_TOKEN
- CHAT_ID
- CHANNEL_ID

## Deploy
1. Push repo to GitHub
2. Import to Vercel
3. Set env vars
4. Set Telegram webhook: https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_URL>/api/webhook
