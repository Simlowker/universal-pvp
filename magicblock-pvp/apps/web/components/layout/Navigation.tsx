'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Home, Trophy, User, BarChart3, Settings, 
  Wallet, LogOut, Menu, X, Zap, Crown
} from 'lucide-react';
import { useWalletContext } from '../../contexts/WalletContext';
import Button from '../ui/Button';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string | number;
  requiresWallet?: boolean;
}

const navItems: NavItem[] = [
  {
    href: '/lobby',
    label: 'Lobby',
    icon: <Home className="h-5 w-5" />,
    badge: 'LIVE'
  },
  {
    href: '/leaderboard', 
    label: 'Leaderboard',
    icon: <Trophy className="h-5 w-5" />
  },
  {
    href: '/profile',
    label: 'Profile', 
    icon: <User className="h-5 w-5" />,
    requiresWallet: true
  },
  {
    href: '/tournaments',
    label: 'Tournaments',
    icon: <Crown className="h-5 w-5" />,
    badge: 'NEW'
  }
];

export default function Navigation() {
  const pathname = usePathname();
  const { wallet, connect, disconnect, balance } = useWalletContext();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowWalletMenu(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleWalletClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (wallet.connected) {
      setShowWalletMenu(!showWalletMenu);
    } else {
      connect();
    }
  };

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center justify-between px-6 py-4 bg-black/60 backdrop-blur-xl border-b border-gray-800">
        
        {/* Logo */}
        <Link href="/lobby" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white font-gaming">SOL DUEL</h1>
            <p className="text-xs text-gray-400">Decentralized Battle Arena</p>
          </div>
        </Link>

        {/* Navigation Items */}
        <div className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const isDisabled = item.requiresWallet && !wallet.connected;

            return (
              <Link
                key={item.href}
                href={isDisabled ? '#' : item.href}
                className={`
                  relative flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                  ${isActive 
                    ? 'text-purple-300 bg-purple-500/20 border border-purple-500/30' 
                    : isDisabled
                      ? 'text-gray-500 cursor-not-allowed'
                      : 'text-gray-300 hover:text-white hover:bg-gray-800'
                  }
                `}
                onClick={isDisabled ? (e) => e.preventDefault() : undefined}
              >
                {item.icon}
                <span>{item.label}</span>
                
                {/* Badge */}
                {item.badge && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full"
                  >
                    {item.badge}
                  </motion.span>
                )}

                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeNav"
                    className="absolute inset-0 bg-purple-500/10 border border-purple-500/30 rounded-lg -z-10"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Wallet Section */}
        <div className="relative">
          <Button
            onClick={handleWalletClick}
            variant={wallet.connected ? 'outline' : 'primary'}
            leftIcon={<Wallet className="h-4 w-4" />}
            className="relative"
          >
            {wallet.connected ? (
              <div className="flex items-center gap-2">
                <span className="font-mono">
                  {wallet.publicKey?.slice(0, 4)}...{wallet.publicKey?.slice(-4)}
                </span>
                <span className="text-green-400 font-bold">
                  ◎{balance.toFixed(3)}
                </span>
              </div>
            ) : (
              'Connect Wallet'
            )}
          </Button>

          {/* Wallet Dropdown */}
          <AnimatePresence>
            {showWalletMenu && wallet.connected && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50"
              >
                <div className="p-4 border-b border-gray-700">
                  <p className="text-sm text-gray-400">Connected Wallet</p>
                  <p className="font-mono text-white break-all">
                    {wallet.publicKey}
                  </p>
                  <div className="mt-2 flex items-center gap-4">
                    <div>
                      <p className="text-lg font-bold text-green-400">
                        ◎{balance.toFixed(6)}
                      </p>
                      <p className="text-xs text-gray-400">SOL Balance</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-purple-400">
                        #{Math.floor(Math.random() * 1000)}
                      </p>
                      <p className="text-xs text-gray-400">Global Rank</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-2">
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 px-3 py-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <User className="h-4 w-4" />
                    <span>View Profile</span>
                  </Link>
                  
                  <button
                    onClick={() => {
                      disconnect();
                      setShowWalletMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <nav className="md:hidden flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-xl border-b border-gray-800">
        
        {/* Logo */}
        <Link href="/lobby" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white font-gaming">SOL DUEL</h1>
        </Link>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-300 hover:text-white transition-colors"
        >
          {isMobileMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-800 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              
              {/* Wallet Section */}
              <div className="mb-8">
                <Button
                  onClick={handleWalletClick}
                  variant={wallet.connected ? 'outline' : 'primary'}
                  leftIcon={<Wallet className="h-4 w-4" />}
                  fullWidth
                >
                  {wallet.connected ? (
                    <div className="flex flex-col items-start">
                      <span className="font-mono text-sm">
                        {wallet.publicKey?.slice(0, 8)}...{wallet.publicKey?.slice(-8)}
                      </span>
                      <span className="text-green-400 font-bold">
                        ◎{balance.toFixed(3)}
                      </span>
                    </div>
                  ) : (
                    'Connect Wallet'
                  )}
                </Button>
              </div>

              {/* Navigation Items */}
              <div className="space-y-2">
                {navItems.map((item) => {
                  const isActive = pathname === item.href;
                  const isDisabled = item.requiresWallet && !wallet.connected;

                  return (
                    <Link
                      key={item.href}
                      href={isDisabled ? '#' : item.href}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all
                        ${isActive 
                          ? 'text-purple-300 bg-purple-500/20 border border-purple-500/30' 
                          : isDisabled
                            ? 'text-gray-500 cursor-not-allowed'
                            : 'text-gray-300 hover:text-white hover:bg-gray-800'
                        }
                      `}
                      onClick={isDisabled ? (e) => e.preventDefault() : undefined}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                      
                      {item.badge && (
                        <span className="ml-auto px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>

              {/* Settings and Disconnect */}
              {wallet.connected && (
                <div className="mt-8 pt-6 border-t border-gray-800 space-y-2">
                  <button
                    onClick={() => {
                      disconnect();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <LogOut className="h-5 w-5" />
                    <span>Disconnect Wallet</span>
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}