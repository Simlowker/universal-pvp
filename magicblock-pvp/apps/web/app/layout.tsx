import { Inter, Orbitron } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron' });

export const metadata = {
  title: 'SOL Duel - Decentralized Battle Arena',
  description: 'Battle other players in turn-based combat on Solana blockchain. Bet SOL, win rewards, and collect NFT equipment.',
  keywords: 'Solana, gaming, PvP, battle, NFT, cryptocurrency, blockchain',
  authors: [{ name: 'SOL Duel Team' }],
  manifest: '/manifest.json',
  themeColor: '#8b5cf6',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SOL Duel'
  },
  openGraph: {
    title: 'SOL Duel - Decentralized Battle Arena',
    description: 'Battle other players in turn-based combat on Solana blockchain.',
    type: 'website',
    url: 'https://solduel.com',
    siteName: 'SOL Duel',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'SOL Duel - Decentralized Battle Arena'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SOL Duel - Decentralized Battle Arena',
    description: 'Battle other players in turn-based combat on Solana blockchain.',
    images: ['/twitter-image.png']
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#8b5cf6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SOL Duel" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#8b5cf6" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        
        <link rel="icon" href="/favicon.ico" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#8b5cf6" />
        
        {/* Preconnect to critical domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.variable} ${orbitron.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}