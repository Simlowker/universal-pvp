import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Universal PvP - Web3 Gaming on Solana',
  description: 'Lightning-fast Web3 PvP battles on Solana Ephemeral Rollups with sub-30ms latency and gasless transactions.',
  keywords: 'Web3, Gaming, PvP, Solana, MagicBlock, Ephemeral Rollups, NFT Gaming',
  authors: [{ name: 'Universal PvP Team' }],
  themeColor: '#667eea',
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  openGraph: {
    title: 'Universal PvP - Web3 Gaming Revolution',
    description: 'Experience the future of Web3 gaming with instant, gasless PvP battles.',
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
    title: 'Universal PvP - Web3 Gaming Revolution',
    description: 'Experience the future of Web3 gaming with instant, gasless PvP battles.',
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
