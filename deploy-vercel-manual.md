# 🚀 Guide de déploiement Vercel - Universal PVP Devnet

## Méthode 1: Déploiement automatique via GitHub

### Étape 1: Connecter à Vercel
1. Va sur https://vercel.com
2. Connecte-toi avec ton compte GitHub
3. Clique sur "Import Project"
4. Sélectionne le repository `Simlowker/universal-pvp`

### Étape 2: Configuration du projet
```bash
Framework Preset: Next.js
Root Directory: magicblock-pvp/apps/web
Build Command: npm run build
Output Directory: .next
Install Command: npm ci
```

### Étape 3: Variables d'environnement
Ajoute ces variables dans Vercel Dashboard:

```env
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_HOST=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_WS_HOST=wss://api.devnet.solana.com
NEXT_PUBLIC_STRATEGIC_DUEL_PROGRAM_ID=6gaBQmha1o6u26PWb9quyzhcxufGWAWBYr71m6e6F3GD
NEXT_PUBLIC_MAGICBLOCK_API_URL=https://api.devnet.magicblock.gg
NEXT_PUBLIC_EPHEMERAL_ROLLUPS_ENABLED=true
```

## Méthode 2: CLI Vercel (Terminal)

### Installation et login
```bash
# Installation
npm install -g vercel

# Login (choisir GitHub)
vercel login

# Dans le dossier du projet
cd "/Users/simeonfluck/universal pvp"
cd magicblock-pvp/apps/web

# Déploiement
vercel --prod
```

## Méthode 3: GitHub Integration (Recommandée)

### Setup GitHub Secrets
1. Va dans Settings > Secrets and variables > Actions
2. Ajoute ces secrets:
   - `VERCEL_TOKEN`: Token Vercel (depuis Settings > Tokens)
   - `ORG_ID`: Org ID Vercel  
   - `PROJECT_ID`: Project ID Vercel

### Auto-déploiement
- Chaque push sur `main` déclenche un déploiement automatique
- URL de production: https://universal-pvp-devnet.vercel.app

## Configuration MagicBlock Devnet

### Endpoints requis:
- **RPC**: https://api.devnet.solana.com
- **WebSocket**: wss://api.devnet.solana.com  
- **MagicBlock API**: https://api.devnet.magicblock.gg
- **Program ID**: 6gaBQmha1o6u26PWb9quyzhcxufGWAWBYr71m6e6F3GD

### Features activées:
✅ Ephemeral Rollups SDK
✅ Session Keys (gasless transactions)  
✅ Real-time WebSocket gaming
✅ Solana devnet integration
✅ Wallet connection (Phantom, Solflare)
✅ Strategic Duel smart contracts

## Post-déploiement

### Vérifications:
1. **URL**: Vérifier l'accès à l'app
2. **Wallet**: Test de connexion wallet
3. **RPC**: Vérifier la connexion Solana devnet
4. **WebSocket**: Test des features temps réel
5. **Smart contracts**: Test des interactions

### Monitoring:
- Vercel Analytics activées
- Performance monitoring
- Error tracking

## Troubleshooting

### Erreur de build:
```bash
# Vérifier les dépendances
cd magicblock-pvp/apps/web
npm install
npm run build
```

### Erreur RPC:
- Vérifier NEXT_PUBLIC_SOLANA_RPC_HOST
- Tester: https://api.devnet.solana.com

### Erreur MagicBlock:
- Vérifier NEXT_PUBLIC_MAGICBLOCK_API_URL  
- Token API MagicBlock requis pour production

---

**✅ Projet prêt pour déploiement Vercel en mode devnet !**