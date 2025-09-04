# Universal PvP - Frontend Web

Application Next.js pour le jeu PvP Universal avec intégration MagicBlock et Solana.

## Structure du projet

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Layout principal avec providers
│   │   ├── page.tsx            # Page d'accueil du jeu
│   │   └── globals.css         # Styles globaux et thème gaming
│   ├── components/
│   │   ├── providers/          # Providers React (Wallet, WebSocket, Toast)
│   │   └── wallet/             # Composants de connexion wallet
│   └── stores/
│       └── user-store.ts       # Store Zustand pour l'état utilisateur
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Fonctionnalités

- **Connexion Wallet Solana** : Support Phantom et Solflare
- **Interface Gaming** : Design moderne avec thème néon
- **État Global** : Gestion d'état avec Zustand
- **WebSocket** : Communication temps réel (mock)
- **Responsive** : Interface adaptative mobile/desktop

## Installation

```bash
cd apps/web
npm install
```

## Développement

```bash
npm run dev
```

## Build

```bash
npm run build
npm start
```

## Technologies

- **Next.js 14** : Framework React
- **TypeScript** : Typage statique
- **Tailwind CSS** : Styling avec thème gaming
- **Zustand** : Gestion d'état
- **Solana Wallet Adapter** : Intégration wallet
- **Framer Motion** : Animations
