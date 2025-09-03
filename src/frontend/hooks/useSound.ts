'use client';

import { useEffect, useState } from 'react';
import useSound from 'react-use-sound';

interface SoundSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  enabled: boolean;
}

const defaultSettings: SoundSettings = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  enabled: true,
};

export const useSoundSettings = () => {
  const [settings, setSettings] = useState<SoundSettings>(defaultSettings);

  useEffect(() => {
    const saved = localStorage.getItem('soundSettings');
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const updateSettings = (newSettings: Partial<SoundSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('soundSettings', JSON.stringify(updated));
  };

  return { settings, updateSettings };
};

export const useGameSounds = () => {
  const { settings } = useSoundSettings();

  // Background music
  const [playBackgroundMusic, { stop: stopBackgroundMusic }] = useSound('/sounds/background.mp3', {
    volume: settings.musicVolume * settings.masterVolume,
    loop: true,
  });

  // UI sounds
  const [playButtonClick] = useSound('/sounds/button-click.wav', {
    volume: settings.sfxVolume * settings.masterVolume * 0.5,
  });

  const [playButtonHover] = useSound('/sounds/button-hover.wav', {
    volume: settings.sfxVolume * settings.masterVolume * 0.3,
  });

  // Game sounds
  const [playMatchFound] = useSound('/sounds/match-found.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  const [playAttack] = useSound('/sounds/attack.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  const [playDefend] = useSound('/sounds/defend.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  const [playAbility] = useSound('/sounds/ability.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  const [playVictory] = useSound('/sounds/victory.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  const [playDefeat] = useSound('/sounds/defeat.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  const [playCoinsEarn] = useSound('/sounds/coins-earn.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  // Wallet sounds
  const [playWalletConnect] = useSound('/sounds/wallet-connect.wav', {
    volume: settings.sfxVolume * settings.masterVolume * 0.7,
  });

  const [playTransaction] = useSound('/sounds/transaction.wav', {
    volume: settings.sfxVolume * settings.masterVolume,
  });

  const playSound = (soundType: string) => {
    if (!settings.enabled) return;

    switch (soundType) {
      case 'click':
        playButtonClick();
        break;
      case 'hover':
        playButtonHover();
        break;
      case 'matchFound':
        playMatchFound();
        break;
      case 'attack':
        playAttack();
        break;
      case 'defend':
        playDefend();
        break;
      case 'ability':
        playAbility();
        break;
      case 'victory':
        playVictory();
        break;
      case 'defeat':
        playDefeat();
        break;
      case 'coins':
        playCoinsEarn();
        break;
      case 'walletConnect':
        playWalletConnect();
        break;
      case 'transaction':
        playTransaction();
        break;
      default:
        break;
    }
  };

  const startBackgroundMusic = () => {
    if (settings.enabled && settings.musicVolume > 0) {
      playBackgroundMusic();
    }
  };

  const stopMusic = () => {
    stopBackgroundMusic();
  };

  return {
    playSound,
    startBackgroundMusic,
    stopMusic,
    settings,
  };
};