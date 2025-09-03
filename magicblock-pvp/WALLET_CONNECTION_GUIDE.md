# Wallet Connection Troubleshooting Guide

## 🔧 Quick Fix Steps

### 1. Check Browser Console
Open your browser's developer console (F12 or right-click → Inspect → Console) and look for any error messages when you click "Connect Wallet".

### 2. Install a Solana Wallet Extension

You need at least one of these wallet extensions installed in your browser:

#### **Phantom Wallet** (Recommended)
- Visit: https://phantom.app/
- Click "Download" and install the browser extension
- Create a new wallet or import existing one
- Switch network to **Devnet** in Phantom settings:
  - Click the gear icon in Phantom
  - Go to Developer Settings
  - Enable "Testnet Mode"
  - Select "Devnet"

#### **Solflare Wallet**
- Visit: https://solflare.com/
- Install the browser extension
- Create/import wallet
- Switch to Devnet network

### 3. Get Free Devnet SOL (Test Tokens)

Once connected, you'll need test SOL to play:

1. Copy your wallet address (click the address in Phantom to copy)
2. Go to: https://faucet.solana.com/
3. Paste your address and click "Devnet"
4. You'll receive 2 SOL for testing

### 4. Refresh and Try Again

After installing a wallet:
1. Refresh the page (Ctrl/Cmd + R)
2. Click "Connect Wallet"
3. You should now see a wallet selection modal
4. Select your installed wallet (Phantom or Solflare)
5. Approve the connection in the wallet popup

## 🐛 Common Issues and Solutions

### Issue: Nothing happens when clicking "Connect Wallet"
**Solution:** 
- Make sure you have a wallet extension installed
- Check if popup blockers are preventing the wallet modal
- Try disabling ad blockers temporarily
- Check browser console for errors

### Issue: Wallet installed but not showing
**Solution:**
- Refresh the page
- Make sure the wallet extension is enabled
- Try restarting your browser
- Clear browser cache (Ctrl+Shift+Delete)

### Issue: Can't switch to Devnet
**Solution:**
- In Phantom: Settings → Developer Settings → Enable Testnet Mode → Select Devnet
- In Solflare: Click network dropdown → Select Devnet

### Issue: Transaction failures
**Solution:**
- Make sure you have enough SOL for gas fees (get from faucet)
- Check you're on Devnet network
- Try refreshing and reconnecting wallet

## 📊 Check Connection Status

The updated code now includes debug logging. When you click "Connect Wallet", check the browser console for:
- "Connect wallet clicked" - Button click registered
- "Opening wallet modal..." - Modal attempting to open
- Any error messages

## 🚀 Quick Start Commands

```bash
# If the app isn't running, start it:
cd "/Users/simeonfluck/universal pvp/magicblock-pvp/apps/web"
npm run dev

# The app will be available at:
# http://localhost:3000 or http://localhost:3001
```

## 📱 Mobile Testing

For mobile testing, you can use:
- Phantom mobile app (iOS/Android)
- Solflare mobile app (iOS/Android)
- Connect via WalletConnect if available

## Need Help?

If you're still having issues:
1. Check the browser console for specific error messages
2. Make sure you're using a supported browser (Chrome, Firefox, Brave, Edge)
3. Try incognito/private mode to rule out extension conflicts
4. Report the console error messages for further debugging

---

**Note:** This app is configured for Solana Devnet (test network). No real money is involved - all tokens are for testing purposes only.