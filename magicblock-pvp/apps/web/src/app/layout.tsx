import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MagicBlock PvP - The Ultimate Gambling Arena',
  description: 'Experience the thrill of decentralized gambling on Solana with MagicBlock\'s ephemeral rollups. Fast, fair, and fun!',
  keywords: 'solana, gambling, pvp, betting, crypto, blockchain, magicblock, defi',
  authors: [{ name: 'MagicBlock Labs' }],
  themeColor: '#667eea',
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  openGraph: {
    title: 'MagicBlock PvP - The Ultimate Gambling Arena',
    description: 'Experience the thrill of decentralized gambling on Solana',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MagicBlock PvP',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MagicBlock PvP - The Ultimate Gambling Arena',
    description: 'Experience the thrill of decentralized gambling on Solana',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        <Providers>
          <div className="game-container">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  )
}