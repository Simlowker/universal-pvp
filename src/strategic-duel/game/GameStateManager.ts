import { DuelState, DuelAction, Player, Round, PsychProfile, Tell } from '../types/DuelTypes';

export class GameStateManager {
  private state: DuelState;
  private listeners: Set<(state: DuelState) => void> = new Set();
  private websocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(initialState: DuelState) {
    this.state = { ...initialState };
    this.initializeWebSocket();
  }

  // Real-time state synchronization
  private initializeWebSocket() {
    try {
      this.websocket = new WebSocket(process.env.REACT_APP_WS_URL || 'ws://localhost:3001');
      
      this.websocket.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
      };

      this.websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      };

      this.websocket.onclose = () => {
        console.log('WebSocket disconnected');
        this.handleReconnect();
      };

      this.websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++;
        this.initializeWebSocket();
      }, 1000 * this.reconnectAttempts);
    }
  }

  private handleWebSocketMessage(message: any) {
    switch (message.type) {
      case 'STATE_UPDATE':
        this.updateState(message.data);
        break;
      case 'PLAYER_ACTION':
        this.handlePlayerAction(message.data);
        break;
      case 'ROUND_UPDATE':
        this.updateRound(message.data);
        break;
      case 'PSYCH_UPDATE':
        this.updatePsychProfile(message.data);
        break;
    }
  }

  // State management methods
  getState(): DuelState {
    return { ...this.state };
  }

  subscribe(callback: (state: DuelState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    this.listeners.forEach(callback => callback(this.getState()));
  }

  private updateState(newState: Partial<DuelState>) {
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }

  // Game actions with optimistic updates
  async performAction(action: DuelAction): Promise<boolean> {
    try {
      // Optimistic update
      this.addActionToRound(action);
      
      // Send to server
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({
          type: 'PLAYER_ACTION',
          data: action
        }));
      }

      // Update psychological profile
      this.updatePlayerPsychProfile(action);
      
      return true;
    } catch (error) {
      console.error('Failed to perform action:', error);
      // Rollback optimistic update
      this.rollbackLastAction();
      return false;
    }
  }

  private addActionToRound(action: DuelAction) {
    const currentRound = { ...this.state.currentRound };
    currentRound.actions.push(action);
    
    // Update pot and current bet
    if (action.type === 'bet' || action.type === 'raise') {
      currentRound.pot += action.amount || 0;
      currentRound.currentBet = Math.max(currentRound.currentBet, action.amount || 0);
    } else if (action.type === 'call') {
      const callAmount = currentRound.currentBet;
      currentRound.pot += callAmount;
    }

    // Update player chips
    const player = this.state.players.find(p => p.id === action.playerId);
    if (player && action.amount) {
      player.chips -= action.amount;
    }

    this.updateState({ currentRound });
  }

  private rollbackLastAction() {
    const currentRound = { ...this.state.currentRound };
    const lastAction = currentRound.actions.pop();
    
    if (lastAction) {
      // Restore pot and bet
      if (lastAction.amount) {
        currentRound.pot -= lastAction.amount;
        if (lastAction.type === 'raise') {
          currentRound.currentBet = this.getPreviousBet(currentRound.actions);
        }
      }

      // Restore player chips
      const player = this.state.players.find(p => p.id === lastAction.playerId);
      if (player && lastAction.amount) {
        player.chips += lastAction.amount;
      }
    }

    this.updateState({ currentRound });
  }

  private getPreviousBet(actions: DuelAction[]): number {
    for (let i = actions.length - 1; i >= 0; i--) {
      if (actions[i].type === 'bet' || actions[i].type === 'raise') {
        return actions[i].amount || 0;
      }
    }
    return 0;
  }

  private handlePlayerAction(actionData: DuelAction) {
    this.addActionToRound(actionData);
    this.updatePlayerPsychProfile(actionData);
  }

  private updateRound(roundData: Partial<Round>) {
    const currentRound = { ...this.state.currentRound, ...roundData };
    this.updateState({ currentRound });
  }

  // Psychological profiling
  private updatePlayerPsychProfile(action: DuelAction) {
    const playerId = action.playerId;
    const currentProfile = this.state.psychProfiles[playerId] || this.createDefaultProfile(playerId);
    
    const thinkTime = Date.now() - action.timestamp;
    
    // Update metrics based on action
    const updatedProfile: PsychProfile = {
      ...currentProfile,
      averageThinkTime: (currentProfile.averageThinkTime + thinkTime) / 2,
    };

    // Update aggression based on action type
    switch (action.type) {
      case 'raise':
      case 'bet':
        updatedProfile.aggression = Math.min(100, updatedProfile.aggression + 5);
        break;
      case 'fold':
        updatedProfile.foldTendency = Math.min(100, updatedProfile.foldTendency + 3);
        break;
      case 'call':
        // Neutral action, slight decrease in aggression
        updatedProfile.aggression = Math.max(0, updatedProfile.aggression - 1);
        break;
    }

    // Detect tells based on timing patterns
    this.detectTells(updatedProfile, action, thinkTime);

    this.updatePsychProfile({ playerId, profile: updatedProfile });
  }

  private createDefaultProfile(playerId: string): PsychProfile {
    return {
      playerId,
      aggression: 50,
      bluffFrequency: 50,
      foldTendency: 50,
      averageThinkTime: 5000,
      tells: [],
      confidence: 50,
    };
  }

  private detectTells(profile: PsychProfile, action: DuelAction, thinkTime: number) {
    const tells: Tell[] = [...profile.tells];

    // Quick action tell (under 1 second)
    if (thinkTime < 1000) {
      const quickTell = tells.find(t => t.pattern === 'quick-action');
      if (quickTell) {
        quickTell.frequency += 1;
        quickTell.lastSeen = Date.now();
      } else {
        tells.push({
          pattern: 'quick-action',
          strength: 70,
          frequency: 1,
          description: 'Quick decisions often indicate strong hands or bluffs',
          lastSeen: Date.now(),
        });
      }
    }

    // Long think tell (over 10 seconds)
    if (thinkTime > 10000) {
      const longThinkTell = tells.find(t => t.pattern === 'long-think');
      if (longThinkTell) {
        longThinkTell.frequency += 1;
        longThinkTell.lastSeen = Date.now();
      } else {
        tells.push({
          pattern: 'long-think',
          strength: 60,
          frequency: 1,
          description: 'Extended thinking usually indicates difficult decisions',
          lastSeen: Date.now(),
        });
      }
    }

    profile.tells = tells;
  }

  private updatePsychProfile(data: { playerId: string; profile: PsychProfile }) {
    const psychProfiles = {
      ...this.state.psychProfiles,
      [data.playerId]: data.profile,
    };
    this.updateState({ psychProfiles });
  }

  // Animation management
  addAnimation(animation: Omit<import('../types/DuelTypes').AnimationState, 'id' | 'startTime'>) {
    const newAnimation = {
      ...animation,
      id: Math.random().toString(36).substr(2, 9),
      startTime: Date.now(),
    };

    const animations = [...this.state.animations, newAnimation];
    this.updateState({ animations });

    // Remove animation after duration
    setTimeout(() => {
      this.removeAnimation(newAnimation.id);
    }, animation.duration);
  }

  private removeAnimation(id: string) {
    const animations = this.state.animations.filter(a => a.id !== id);
    this.updateState({ animations });
  }

  // Timer management
  startRoundTimer() {
    const timer = setInterval(() => {
      if (this.state.timeLeft > 0) {
        this.updateState({ timeLeft: this.state.timeLeft - 100 });
      } else {
        clearInterval(timer);
        // Force fold if time runs out
        this.performAction({
          type: 'fold',
          playerId: this.state.currentPlayer,
          timestamp: Date.now(),
        });
      }
    }, 100);

    return timer;
  }

  // Sound effects
  playSound(soundType: string) {
    if (this.state.gameStatus === 'active') {
      // Sound implementation would go here
      console.log(`Playing sound: ${soundType}`);
    }
  }

  // Cleanup
  destroy() {
    if (this.websocket) {
      this.websocket.close();
    }
    this.listeners.clear();
  }
}