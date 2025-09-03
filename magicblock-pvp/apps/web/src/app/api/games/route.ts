import { NextRequest, NextResponse } from 'next/server'
import { Game } from '@/types'

const mockGames: Game[] = [
  {
    id: 'crash',
    type: 'crash',
    name: 'Crash',
    description: 'Watch the multiplier grow and cash out before the crash!',
    minBet: 0.1,
    maxBet: 1000,
    houseEdge: 0.01,
    isActive: true,
    playerCount: 2847,
    maxPlayers: 1000,
    totalVolume: 89432.45,
    recentGames: []
  },
  {
    id: 'coinflip',
    type: 'coinflip',
    name: 'Coin Flip',
    description: 'Classic heads or tails - double or nothing!',
    minBet: 0.5,
    maxBet: 5000,
    houseEdge: 0.02,
    isActive: true,
    playerCount: 1923,
    maxPlayers: 2,
    totalVolume: 67821.23,
    recentGames: []
  },
  {
    id: 'dice',
    type: 'dice',
    name: 'Dice Roll',
    description: 'Roll high or low for massive multipliers!',
    minBet: 1,
    maxBet: 2500,
    houseEdge: 0.015,
    isActive: true,
    playerCount: 1456,
    maxPlayers: 8,
    totalVolume: 45678.91,
    recentGames: []
  },
  {
    id: 'roulette',
    type: 'roulette',
    name: 'Roulette',
    description: 'European roulette with live multiplayer action!',
    minBet: 2,
    maxBet: 10000,
    houseEdge: 0.027,
    isActive: true,
    playerCount: 987,
    maxPlayers: 12,
    totalVolume: 123456.78,
    recentGames: []
  },
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const gameType = searchParams.get('type')
    const active = searchParams.get('active')

    let filteredGames = mockGames

    if (gameType) {
      filteredGames = filteredGames.filter(game => game.type === gameType)
    }

    if (active === 'true') {
      filteredGames = filteredGames.filter(game => game.isActive)
    }

    return NextResponse.json({
      success: true,
      data: filteredGames,
      message: 'Games retrieved successfully'
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve games',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { gameType, minBet, maxBet } = body

    // Mock room creation
    const roomId = `room_${gameType}_${Date.now()}`
    
    return NextResponse.json({
      success: true,
      data: {
        id: roomId,
        gameType,
        minBet,
        maxBet,
        players: [],
        status: 'waiting',
        createdAt: new Date().toISOString()
      },
      message: 'Game room created successfully'
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Failed to create game room',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}