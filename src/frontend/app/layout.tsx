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
  openGraph: {
    title: 'SOL Duel - Decentralized Battle Arena',
    description: 'Battle other players in turn-based combat on Solana blockchain.',
    type: 'website',
    url: 'https://solduel.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SOL Duel - Decentralized Battle Arena',
    description: 'Battle other players in turn-based combat on Solana blockchain.',
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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${inter.variable} ${orbitron.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}