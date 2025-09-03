export interface Player {
  id: string;
  walletAddress: string;
  username: string;
  level: number;
  wins: number;
  losses: number;
  rating: number;
  character?: Character;
}

export interface Character {
  id: string;
  name: string;
  class: CharacterClass;
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  attack: number;
  defense: number;
  speed: number;
  abilities: Ability[];
  equipment: Equipment[];
  nftMint?: string;
}

export interface CharacterClass {
  id: string;
  name: string;
  description: string;
  baseStats: {
    health: number;
    mana: number;
    attack: number;
    defense: number;
    speed: number;
  };
  abilities: string[];
  image: string;
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  manaCost: number;
  damage: number;
  cooldown: number;
  type: 'attack' | 'defense' | 'heal' | 'buff' | 'debuff';
  animation: string;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  stats: {
    attack?: number;
    defense?: number;
    health?: number;
    mana?: number;
    speed?: number;
  };
  nftMint?: string;
}

export interface GameMatch {
  id: string;
  player1: Player;
  player2: Player;
  status: 'waiting' | 'active' | 'completed';
  betAmount: number;
  winner?: Player;
  turns: GameTurn[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GameTurn {
  turnNumber: number;
  playerId: string;
  action: GameAction;
  timestamp: Date;
}

export interface GameAction {
  type: 'attack' | 'defend' | 'ability' | 'item';
  targetId?: string;
  abilityId?: string;
  itemId?: string;
  damage?: number;
  healing?: number;
  effects?: StatusEffect[];
}

export interface StatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  duration: number;
  value: number;
  stat: 'attack' | 'defense' | 'speed' | 'health' | 'mana';
}

export interface GameStats {
  totalMatches: number;
  activeMatches: number;
  totalPlayersOnline: number;
  totalVolume: number;
}

export interface Reward {
  type: 'sol' | 'token' | 'nft' | 'xp';
  amount: number;
  item?: Equipment | Character;
}