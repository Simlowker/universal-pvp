'use client'

import React, { useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useUserStore } from '@/stores/user-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  Wallet, 
  User, 
  Settings, 
  LogOut, 
  TrendingUp,
  DollarSign,
  Copy,
  ExternalLink
} from 'lucide-react'
import { formatCurrency, getTierColor, getTierIcon } from '@/lib/utils'
import { toast } from '@/components/providers/toast-provider'
import { motion } from 'framer-motion'

export function WalletConnect() {
  const { connected, publicKey, disconnect } = useWallet()
  const { user, balance, connectWallet, disconnectWallet, isLoading } = useUserStore()

  // Sync wallet connection with user store
  useEffect(() => {
    if (connected && publicKey && !user) {
      connectWallet()
    } else if (!connected && user) {
      disconnectWallet()
    }
  }, [connected, publicKey, user, connectWallet, disconnectWallet])

  const handleDisconnect = async () => {
    try {
      await disconnect()
      disconnectWallet()
      toast({
        title: "Wallet Disconnected",
        description: "You've been successfully disconnected.",
        variant: "default"
      })
    } catch (error) {
      toast({
        title: "Disconnect Error",
        description: "Failed to disconnect wallet",
        variant: "destructive"
      })
    }
  }

  const copyAddress = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toString())
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
        variant: "success"
      })
    }
  }

  const openExplorer = () => {
    if (publicKey) {
      const url = `https://explorer.solana.com/address/${publicKey.toString()}?cluster=devnet`
      window.open(url, '_blank')
    }
  }

  // If not connected, show the connect button
  if (!connected || !user) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center space-y-2"
      >
        <WalletMultiButton 
          className="!bg-gradient-to-r !from-neon-blue !to-neon-purple !text-white !font-bold !rounded-lg !px-6 !py-3 !border-0 hover:!scale-105 !transition-transform"
        />
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-muted-foreground"
          >
            Connecting...
          </motion.div>
        )}
      </motion.div>
    )
  }

  // Connected state - show user menu
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className="relative p-2 h-auto space-x-3 hover:bg-card/50 border border-white/10"
        >
          <Avatar className="w-8 h-8">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="bg-gradient-to-br from-neon-blue to-neon-purple text-white text-sm">
              {user.username?.slice(0, 2).toUpperCase() || publicKey?.toString().slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="text-left space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">
                {user.username || `${publicKey?.toString().slice(0, 4)}...${publicKey?.toString().slice(-4)}`}
              </span>
              <div className="text-sm">
                {getTierIcon(user.tier)}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCurrency(balance)}
            </div>
          </div>

          {/* Connection Status Indicator */}
          <div className="absolute -top-1 -right-1">
            <div className="w-3 h-3 bg-game-win rounded-full animate-pulse border-2 border-background" />
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        className="w-80 glass-card border-white/20"
        align="end"
        sideOffset={10}
      >
        {/* User Info Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="bg-gradient-to-br from-neon-blue to-neon-purple text-white">
                {user.username?.slice(0, 2).toUpperCase() || 'GM'}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 space-y-1">
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold">
                  {user.username || 'Anonymous Ape'}
                </h3>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getTierColor(user.tier)} border-current`}
                >
                  {user.tier.toUpperCase()}
                </Badge>
              </div>
              
              <div className="text-sm text-muted-foreground">
                Balance: <span className="text-neon-green font-bold">{formatCurrency(balance)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="p-4 border-b border-white/10">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="font-bold text-neon-blue">{user.stats.totalGames}</div>
              <div className="text-xs text-muted-foreground">Games</div>
            </div>
            <div>
              <div className="font-bold text-game-win">
                {(user.stats.winRate * 100).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
            <div>
              <div className={`font-bold ${user.stats.netPnL >= 0 ? 'text-game-win' : 'text-game-loss'}`}>
                {formatCurrency(user.stats.netPnL)}
              </div>
              <div className="text-xs text-muted-foreground">P&L</div>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="py-2">
          <DropdownMenuItem className="cursor-pointer">
            <User className="w-4 h-4 mr-3" />
            <span>Profile</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem className="cursor-pointer">
            <TrendingUp className="w-4 h-4 mr-3" />
            <span>Match History</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem className="cursor-pointer">
            <DollarSign className="w-4 h-4 mr-3" />
            <span>Deposit / Withdraw</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem className="cursor-pointer">
            <Settings className="w-4 h-4 mr-3" />
            <span>Settings</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem onClick={copyAddress} className="cursor-pointer">
            <Copy className="w-4 h-4 mr-3" />
            <span>Copy Address</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={openExplorer} className="cursor-pointer">
            <ExternalLink className="w-4 h-4 mr-3" />
            <span>View in Explorer</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={handleDisconnect} 
            className="cursor-pointer text-game-loss focus:text-game-loss"
          >
            <LogOut className="w-4 h-4 mr-3" />
            <span>Disconnect</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}