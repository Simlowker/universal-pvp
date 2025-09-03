import { NextRequest, NextResponse } from 'next/server'
import { User } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')

    if (!walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'Wallet address required',
        message: 'Please provide a wallet address'
      }, { status: 400 })
    }

    // Mock user profile
    const mockUser: User = {
      id: 'user_' + walletAddress.slice(-8),
      walletAddress,
      username: 'Player_' + walletAddress.slice(-4),
      stats: {
        totalGames: Math.floor(Math.random() * 1000),
        wins: Math.floor(Math.random() * 500),
        losses: Math.floor(Math.random() * 500),
        winRate: Math.random() * 0.7 + 0.3, // 30-100% win rate
        totalWinnings: Math.random() * 50000,
        totalLosses: Math.random() * 30000,
        netPnL: Math.random() * 20000 - 10000,
        currentStreak: Math.floor(Math.random() * 20),
        bestStreak: Math.floor(Math.random() * 50),
        averageBetSize: Math.random() * 100 + 10,
      },
      tier: ['bronze', 'silver', 'gold', 'diamond', 'legendary'][Math.floor(Math.random() * 5)] as any,
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      lastActive: new Date(),
    }

    return NextResponse.json({
      success: true,
      data: mockUser,
      message: 'Profile retrieved successfully'
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, updates } = body

    if (!walletAddress) {
      return NextResponse.json({
        success: false,
        error: 'Wallet address required',
        message: 'Please provide a wallet address'
      }, { status: 400 })
    }

    // Mock profile update
    return NextResponse.json({
      success: true,
      data: {
        ...updates,
        lastUpdated: new Date().toISOString()
      },
      message: 'Profile updated successfully'
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to update profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}