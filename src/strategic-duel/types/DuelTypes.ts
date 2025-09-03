export interface Player {
  id: string;
  address: string;
  name: string;
  avatar: string;
  chips: number;
  position: 'player' | 'opponent';
  lastAction?: DuelAction;
  lastActionTime?: number;
  isConnected: boolean;
}

export interface DuelAction {
  type: 'check' | 'call' | 'raise' | 'fold' | 'bet';
  amount?: number;
  timestamp: number;
  playerId: string;
}

export interface Round {
  id: string;
  roundNumber: number;
  pot: number;
  currentBet: number;
  playerCards: string[];
  opponentCards: string[];
  communityCards: string[];
  phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  actions: DuelAction[];
  winner?: string;
  winAmount?: number;
}

export interface PsychProfile {
  playerId: string;
  aggression: number; // 0-100
  bluffFrequency: number; // 0-100
  foldTendency: number; // 0-100
  averageThinkTime: number; // milliseconds
  tells: Tell[];
  confidence: number; // 0-100
}

export interface Tell {
  pattern: string;
  strength: number; // 0-100
  frequency: number; // 0-100
  description: string;
  lastSeen?: number;
}

export interface DuelState {
  gameId: string;
  players: Player[];
  currentRound: Round;
  roundHistory: Round[];
  currentPlayer: string;
  gameStatus: 'waiting' | 'active' | 'ended';
  timeLeft: number;
  maxThinkTime: number;
  psychProfiles: Record<string, PsychProfile>;
  animations: AnimationState[];
}

export interface AnimationState {
  id: string;
  type: 'chip-move' | 'card-deal' | 'action-feedback' | 'winner-reveal';
  duration: number;
  startTime: number;
  data: any;
}

export interface GameConfig {
  blinds: {
    small: number;
    big: number;
  };
  maxRounds: number;
  thinkTime: number;
  soundEnabled: boolean;
  animationsEnabled: boolean;
}