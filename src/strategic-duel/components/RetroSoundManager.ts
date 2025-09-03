// ===============================================
//  RETRO SOUND MANAGER - 8-BIT AUDIO SYSTEM
//  Handles all arcade-style sound effects
// ===============================================

export type SoundType = 
  | 'coin-insert'
  | 'button-press' 
  | 'countdown-beep'
  | 'action-select'
  | 'turn-switch'
  | 'victory-fanfare'
  | 'defeat-buzz'
  | 'pixel-explosion'
  | 'menu-navigate'
  | 'game-start'
  | 'power-up'
  | 'warning-alert'
  | 'jackpot-ring'
  | 'laser-zap'
  | 'retro-ambient';

interface SoundConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
  envelope?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
}

class RetroSoundManager {
  private audioContext: AudioContext | null = null;
  private masterVolume: number = 0.3;
  private isEnabled: boolean = true;
  
  // Sound configurations for different 8-bit effects
  private soundLibrary: Record<SoundType, SoundConfig | SoundConfig[]> = {
    'coin-insert': [
      { frequency: 1000, duration: 0.1, type: 'square', volume: 0.4 },
      { frequency: 800, duration: 0.15, type: 'square', volume: 0.6 },
      { frequency: 600, duration: 0.2, type: 'triangle', volume: 0.5 }
    ],
    
    'button-press': {
      frequency: 800,
      duration: 0.1,
      type: 'square',
      volume: 0.3,
      envelope: { attack: 0.01, decay: 0.05, sustain: 0.3, release: 0.04 }
    },
    
    'countdown-beep': {
      frequency: 1200,
      duration: 0.2,
      type: 'square',
      volume: 0.5,
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.09 }
    },
    
    'action-select': [
      { frequency: 600, duration: 0.08, type: 'square', volume: 0.4 },
      { frequency: 900, duration: 0.08, type: 'square', volume: 0.3 }
    ],
    
    'turn-switch': {
      frequency: 440,
      duration: 0.3,
      type: 'triangle',
      volume: 0.2,
      envelope: { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 }
    },
    
    'victory-fanfare': [
      { frequency: 523, duration: 0.2, type: 'square', volume: 0.6 }, // C5
      { frequency: 659, duration: 0.2, type: 'square', volume: 0.6 }, // E5
      { frequency: 784, duration: 0.2, type: 'square', volume: 0.6 }, // G5
      { frequency: 1047, duration: 0.4, type: 'square', volume: 0.8 }  // C6
    ],
    
    'defeat-buzz': {
      frequency: 150,
      duration: 1.0,
      type: 'sawtooth',
      volume: 0.4,
      envelope: { attack: 0.1, decay: 0.3, sustain: 0.3, release: 0.6 }
    },
    
    'pixel-explosion': [
      { frequency: 2000, duration: 0.05, type: 'square', volume: 0.7 },
      { frequency: 1500, duration: 0.08, type: 'square', volume: 0.6 },
      { frequency: 1000, duration: 0.12, type: 'sawtooth', volume: 0.5 },
      { frequency: 500, duration: 0.2, type: 'triangle', volume: 0.3 }
    ],
    
    'menu-navigate': {
      frequency: 800,
      duration: 0.05,
      type: 'square',
      volume: 0.25
    },
    
    'game-start': [
      { frequency: 392, duration: 0.3, type: 'square', volume: 0.5 }, // G4
      { frequency: 523, duration: 0.3, type: 'square', volume: 0.5 }, // C5
      { frequency: 659, duration: 0.6, type: 'triangle', volume: 0.6 } // E5
    ],
    
    'power-up': [
      { frequency: 440, duration: 0.1, type: 'square', volume: 0.4 },
      { frequency: 554, duration: 0.1, type: 'square', volume: 0.5 },
      { frequency: 659, duration: 0.1, type: 'square', volume: 0.6 },
      { frequency: 880, duration: 0.2, type: 'triangle', volume: 0.7 }
    ],
    
    'warning-alert': [
      { frequency: 1000, duration: 0.2, type: 'square', volume: 0.6 },
      { frequency: 800, duration: 0.2, type: 'square', volume: 0.6 }
    ],
    
    'jackpot-ring': [
      { frequency: 1319, duration: 0.15, type: 'sine', volume: 0.4 }, // E6
      { frequency: 1760, duration: 0.15, type: 'sine', volume: 0.5 }, // A6
      { frequency: 2093, duration: 0.3, type: 'sine', volume: 0.6 },  // C7
      { frequency: 2637, duration: 0.4, type: 'triangle', volume: 0.7 } // E7
    ],
    
    'laser-zap': {
      frequency: 2000,
      duration: 0.15,
      type: 'sawtooth',
      volume: 0.3,
      envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.04 }
    },
    
    'retro-ambient': {
      frequency: 100,
      duration: 2.0,
      type: 'sine',
      volume: 0.1,
      envelope: { attack: 0.5, decay: 0.3, sustain: 0.4, release: 1.2 }
    }
  };

  constructor() {
    this.initAudioContext();
  }

  private initAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
      this.isEnabled = false;
    }
  }

  private async ensureAudioContext(): Promise<void> {
    if (!this.audioContext || !this.isEnabled) return;
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  private createTone(config: SoundConfig, delay: number = 0): void {
    if (!this.audioContext || !this.isEnabled) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(config.frequency, this.audioContext.currentTime + delay);
    oscillator.type = config.type;
    
    const startTime = this.audioContext.currentTime + delay;
    const endTime = startTime + config.duration;
    const volume = config.volume * this.masterVolume;
    
    if (config.envelope) {
      const env = config.envelope;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + env.attack);
      gainNode.gain.linearRampToValueAtTime(volume * env.sustain, startTime + env.attack + env.decay);
      gainNode.gain.linearRampToValueAtTime(0, endTime - env.release);
    } else {
      gainNode.gain.setValueAtTime(volume, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, endTime);
    }
    
    oscillator.start(startTime);
    oscillator.stop(endTime);
  }

  public async playSound(soundType: SoundType): Promise<void> {
    await this.ensureAudioContext();
    
    const config = this.soundLibrary[soundType];
    
    if (Array.isArray(config)) {
      // Play sequence of sounds
      config.forEach((sound, index) => {
        this.createTone(sound, index * 0.1);
      });
    } else {
      // Play single sound
      this.createTone(config);
    }
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  public toggleSound(): void {
    this.isEnabled = !this.isEnabled;
  }

  public isAudioEnabled(): boolean {
    return this.isEnabled && this.audioContext !== null;
  }

  // Quick play methods for common game events
  public playMenuSound = () => this.playSound('menu-navigate');
  public playButtonPress = () => this.playSound('button-press');
  public playCoinInsert = () => this.playSound('coin-insert');
  public playCountdown = () => this.playSound('countdown-beep');
  public playActionSelect = () => this.playSound('action-select');
  public playTurnSwitch = () => this.playSound('turn-switch');
  public playVictory = () => this.playSound('victory-fanfare');
  public playDefeat = () => this.playSound('defeat-buzz');
  public playExplosion = () => this.playSound('pixel-explosion');
  public playGameStart = () => this.playSound('game-start');
  public playPowerUp = () => this.playSound('power-up');
  public playWarning = () => this.playSound('warning-alert');
  public playJackpot = () => this.playSound('jackpot-ring');
  public playLaser = () => this.playSound('laser-zap');
  public playAmbient = () => this.playSound('retro-ambient');

  // Create custom sound combinations
  public playCombo(sounds: SoundType[], delayBetween: number = 0.1): void {
    sounds.forEach((sound, index) => {
      setTimeout(() => this.playSound(sound), index * delayBetween * 1000);
    });
  }
}

// Singleton instance
export const retroSoundManager = new RetroSoundManager();

// React hook for easy integration
export function useRetroSound() {
  const playSound = async (soundType: SoundType) => {
    await retroSoundManager.playSound(soundType);
  };

  const playCombo = (sounds: SoundType[], delay: number = 0.1) => {
    retroSoundManager.playCombo(sounds, delay);
  };

  const setVolume = (volume: number) => {
    retroSoundManager.setMasterVolume(volume);
  };

  const toggleSound = () => {
    retroSoundManager.toggleSound();
  };

  const isEnabled = () => {
    return retroSoundManager.isAudioEnabled();
  };

  return {
    playSound,
    playCombo,
    setVolume,
    toggleSound,
    isEnabled,
    // Quick access methods
    playMenuSound: retroSoundManager.playMenuSound,
    playButtonPress: retroSoundManager.playButtonPress,
    playCoinInsert: retroSoundManager.playCoinInsert,
    playCountdown: retroSoundManager.playCountdown,
    playActionSelect: retroSoundManager.playActionSelect,
    playTurnSwitch: retroSoundManager.playTurnSwitch,
    playVictory: retroSoundManager.playVictory,
    playDefeat: retroSoundManager.playDefeat,
    playExplosion: retroSoundManager.playExplosion,
    playGameStart: retroSoundManager.playGameStart,
    playPowerUp: retroSoundManager.playPowerUp,
    playWarning: retroSoundManager.playWarning,
    playJackpot: retroSoundManager.playJackpot,
    playLaser: retroSoundManager.playLaser,
    playAmbient: retroSoundManager.playAmbient
  };
}

export default RetroSoundManager;