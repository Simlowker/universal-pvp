import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClientProviders } from '@/components/providers/ClientProviders';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Universal PvP - Web3 Gaming on Solana',
  description: 'Lightning-fast Web3 PvP battles on Solana Ephemeral Rollups with sub-30ms latency and gasless transactions.',
  keywords: 'Web3, Gaming, PvP, Solana, MagicBlock, Ephemeral Rollups, NFT Gaming',
  authors: [{ name: 'Universal PvP Team' }],
  openGraph: {
    title: 'Universal PvP - Web3 Gaming Revolution',
    description: 'Experience the future of Web3 gaming with instant, gasless PvP battles.',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Universal PvP - Web3 Gaming Platform'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Universal PvP - Web3 Gaming Revolution',
    description: 'Experience the future of Web3 gaming with instant, gasless PvP battles.',
    images: ['/og-image.png']
  }
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1f2937" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${inter.className} bg-gray-900 text-white antialiased`}>
        <ClientProviders>
          <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900/10 to-purple-900/10">
            {/* Background pattern overlay */}
            <div className="fixed inset-0 opacity-5 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20" 
                   style={{
                     backgroundImage: `radial-gradient(circle at 25px 25px, rgba(59, 130, 246, 0.5) 2px, transparent 2px)`,
                     backgroundSize: '50px 50px'
                   }}
              />
            </div>
            
            {/* Main content */}
            <main className="relative z-10">
              {children}
            </main>
            
            {/* Global loading indicator */}
            <div id="global-loading" className="hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
              <div className="bg-gray-800 rounded-xl p-6 text-center border border-gray-700">
                <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-white">Loading...</p>
              </div>
            </div>
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}