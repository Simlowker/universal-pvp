# SOL Duel Frontend

A modern React/Next.js frontend for the SOL Duel decentralized battle arena game built on Solana.

## Features

### 🎮 Core Game Interface
- **Game Lobby**: Browse and join active matches with real-time statistics
- **Character Selection**: Choose from multiple character classes with unique abilities
- **Battle Arena**: Turn-based combat interface with animations and effects
- **Victory/Defeat Screens**: Reward distribution and match results

### 💰 Wallet Integration
- **Multi-Wallet Support**: Phantom, Solflare, and Backpack wallet adapters
- **Transaction Management**: Secure bet placement and reward collection
- **Balance Display**: Real-time SOL and token balance tracking
- **NFT Inventory**: View and manage game-related NFTs

### 🎨 UI/UX Features
- **Responsive Design**: Optimized for desktop and mobile devices
- **Theme Support**: Dark/light mode with gaming aesthetics
- **Sound System**: Interactive audio feedback and background music
- **Loading States**: Smooth transitions and progress indicators
- **Error Handling**: User-friendly error messages and recovery

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom gaming theme
- **Animations**: Framer Motion
- **State Management**: React Context + Zustand
- **Solana Integration**: @solana/wallet-adapter-react
- **Audio**: react-use-sound
- **Notifications**: react-hot-toast

## Project Structure

```
src/frontend/
├── app/                    # Next.js App Router pages
│   ├── globals.css        # Global styles and Tailwind
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main game page
│   └── providers.tsx      # Context providers setup
├── components/
│   ├── game/              # Game-specific components
│   │   ├── GameLobby.tsx
│   │   ├── CharacterSelection.tsx
│   │   └── BattleArena.tsx
│   ├── wallet/            # Wallet integration components
│   │   ├── WalletButton.tsx
│   │   ├── TransactionModal.tsx
│   │   └── NFTInventory.tsx
│   ├── ui/                # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Modal.tsx
│   │   └── LoadingSpinner.tsx
│   └── layout/            # Layout components
│       └── Header.tsx
├── contexts/              # React contexts for state management
│   ├── ThemeContext.tsx
│   ├── WalletContext.tsx
│   └── GameContext.tsx
├── hooks/                 # Custom React hooks
│   └── useSound.ts
├── types/                 # TypeScript type definitions
│   ├── game.ts
│   └── wallet.ts
└── utils/                 # Utility functions
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Solana wallet (Phantom, Solflare, or Backpack)

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd src/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript type checking
```

## Configuration

### Environment Variables

Create a `.env.local` file in the frontend directory:

```env
# Solana Network Configuration
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com

# Game Configuration
NEXT_PUBLIC_GAME_PROGRAM_ID=your_program_id_here
NEXT_PUBLIC_PLATFORM_FEE=0.05

# Optional: Custom RPC endpoint
NEXT_PUBLIC_CUSTOM_RPC_ENDPOINT=your_rpc_endpoint
```

### Wallet Configuration

The app supports multiple Solana wallets out of the box:
- **Phantom**: Most popular Solana wallet
- **Solflare**: Feature-rich wallet with mobile support
- **Backpack**: Modern wallet with built-in features

### Theme Customization

The gaming theme can be customized in `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      game: {
        bg: '#0a0a0b',      // Background
        surface: '#1a1a1b',  // Card/surface color
        border: '#2d2d30',   // Border color
        text: '#ffffff',     // Primary text
        muted: '#9ca3af',    // Secondary text
        accent: '#8b5cf6',   // Accent color
      }
    }
  }
}
```

## Component Architecture

### Context Providers

1. **ThemeContext**: Manages dark/light theme switching
2. **WalletContext**: Handles Solana wallet connection and transactions
3. **GameContext**: Manages game state and match data

### Key Components

1. **GameLobby**: Main lobby interface with match browsing
2. **CharacterSelection**: Character class selection with stats
3. **BattleArena**: Turn-based combat interface
4. **WalletButton**: Wallet connection and management
5. **Header**: Navigation and user information

### State Management

The app uses React Context for global state management:

```typescript
// Game state
const { currentMatch, selectedCharacter, isInGame } = useGame();

// Wallet state
const { wallet, balance, nfts } = useWalletContext();

// Theme state
const { theme, toggleTheme } = useTheme();
```

## Sound System

The app includes an integrated sound system:

```typescript
const { playSound, settings } = useGameSounds();

// Play sounds for different actions
playSound('click');     // UI interactions
playSound('attack');    // Combat actions
playSound('victory');   // Game outcomes
```

Sound settings can be configured in the settings modal.

## Responsive Design

The UI is fully responsive with breakpoints:
- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

## Performance Optimizations

- **Code Splitting**: Automatic route-based code splitting
- **Image Optimization**: Next.js Image component for optimized loading
- **Bundle Analysis**: Built-in bundle analyzer for optimization
- **Caching**: Optimized caching strategies for static assets

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Development Guidelines

### Code Style
- Use TypeScript for all components
- Follow React hooks best practices
- Implement proper error boundaries
- Use semantic HTML elements

### Component Guidelines
- Keep components focused and single-purpose
- Use composition over inheritance
- Implement proper loading and error states
- Include accessibility features

### Performance
- Use React.memo for expensive components
- Implement virtual scrolling for large lists
- Optimize images and assets
- Use Suspense for code splitting

## Deployment

### Production Build

```bash
npm run build
npm run start
```

### Static Export (if needed)

```bash
# Add to next.config.js
output: 'export'

npm run build
```

### Environment-Specific Builds

Configure different environments in your deployment pipeline:

- **Development**: Connected to Solana Devnet
- **Staging**: Connected to Solana Testnet  
- **Production**: Connected to Solana Mainnet

## Troubleshooting

### Common Issues

1. **Wallet Connection Issues**
   - Ensure wallet extension is installed and unlocked
   - Check network configuration
   - Clear browser cache and cookies

2. **Transaction Failures**
   - Verify sufficient SOL balance for gas fees
   - Check network congestion
   - Retry with higher priority fees

3. **UI/Performance Issues**
   - Clear browser cache
   - Disable browser extensions
   - Check console for JavaScript errors

### Debug Mode

Enable debug mode in development:

```typescript
// Add to your component
const DEBUG = process.env.NODE_ENV === 'development';
if (DEBUG) console.log('Debug info:', data);
```

## Contributing

1. Follow the existing code style and patterns
2. Add TypeScript types for all new features
3. Include proper error handling and loading states
4. Test on multiple browsers and devices
5. Update documentation for new features

## License

This project is part of the SOL Duel game system and follows the same licensing terms.