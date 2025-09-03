'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Swords, Settings, Volume2, VolumeX, Sun, Moon, Menu, X, Trophy } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useGame } from '../../contexts/GameContext';
import { useWalletContext } from '../../contexts/WalletContext';
import { useGameSounds, useSoundSettings } from '../../hooks/useSound';
import SimpleWalletButton from '../wallet/SimpleWalletButton';
import Button from '../ui/Button';
import Modal from '../ui/Modal';

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { player } = useGame();
  const { wallet } = useWalletContext();
  const { playSound } = useGameSounds();
  const { settings, updateSettings } = useSoundSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const handleSettingsClick = () => {
    playSound('click');
    setShowSettings(true);
  };

  const handleThemeToggle = () => {
    playSound('click');
    toggleTheme();
  };

  const handleSoundToggle = () => {
    playSound('click');
    updateSettings({ enabled: !settings.enabled });
  };

  const toggleMobileMenu = () => {
    playSound('click');
    setShowMobileMenu(!showMobileMenu);
  };

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-game-surface/90 backdrop-blur-sm border-b border-game-border sticky top-0 z-40"
      >
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => window.location.reload()}
            >
              <div className="relative">
                <Swords className="h-8 w-8 text-primary-500" />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 border border-primary-500/30 rounded-full"
                />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-game-text font-gaming">
                  SOL Duel
                </h1>
                <p className="text-xs text-game-muted hidden sm:block">
                  Decentralized Battle Arena
                </p>
              </div>
            </motion.div>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-6">
              {/* Player Stats */}
              {wallet.connected && player && (
                <div className="flex items-center gap-4 bg-game-bg/30 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500" />
                    <div className="text-sm">
                      <span className="text-game-text font-semibold">
                        {player.username}
                      </span>
                      <div className="text-xs text-game-muted">
                        Level {player.level} • {player.wins}W/{player.losses}L
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Theme Toggle */}
              <Button
                onClick={handleThemeToggle}
                variant="ghost"
                size="sm"
                className="p-2"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>

              {/* Sound Toggle */}
              <Button
                onClick={handleSoundToggle}
                variant="ghost"
                size="sm"
                className="p-2"
                aria-label="Toggle sound"
              >
                {settings.enabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
              </Button>

              {/* Settings */}
              <Button
                onClick={handleSettingsClick}
                variant="ghost"
                size="sm"
                className="p-2"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>

              {/* Wallet Button */}
              <SimpleWalletButton />
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center gap-2">
              <SimpleWalletButton />
              <Button
                onClick={toggleMobileMenu}
                variant="ghost"
                size="sm"
                className="p-2"
                aria-label="Toggle menu"
              >
                {showMobileMenu ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {showMobileMenu && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden mt-4 pt-4 border-t border-game-border space-y-4"
            >
              {/* Player Stats Mobile */}
              {wallet.connected && player && (
                <div className="bg-game-bg/30 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="text-game-text font-semibold">
                        {player.username}
                      </p>
                      <p className="text-sm text-game-muted">
                        Level {player.level} • {player.wins}W/{player.losses}L • Rating: {player.rating}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Controls */}
              <div className="flex items-center justify-around">
                <Button
                  onClick={handleThemeToggle}
                  variant="ghost"
                  size="sm"
                  leftIcon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                >
                  {theme === 'dark' ? 'Light' : 'Dark'}
                </Button>

                <Button
                  onClick={handleSoundToggle}
                  variant="ghost"
                  size="sm"
                  leftIcon={settings.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                >
                  {settings.enabled ? 'Sound On' : 'Sound Off'}
                </Button>

                <Button
                  onClick={handleSettingsClick}
                  variant="ghost"
                  size="sm"
                  leftIcon={<Settings className="h-4 w-4" />}
                >
                  Settings
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.header>

      {/* Settings Modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="Settings"
        size="md"
      >
        <div className="space-y-6">
          {/* Audio Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-game-text font-gaming">
              Audio Settings
            </h3>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-game-text">Sound Effects</span>
                <Button
                  onClick={() => updateSettings({ enabled: !settings.enabled })}
                  variant={settings.enabled ? 'primary' : 'outline'}
                  size="sm"
                >
                  {settings.enabled ? 'On' : 'Off'}
                </Button>
              </div>

              {settings.enabled && (
                <>
                  <div className="space-y-2">
                    <label className="block text-sm text-game-text">
                      Master Volume: {Math.round(settings.masterVolume * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.masterVolume}
                      onChange={(e) => updateSettings({ masterVolume: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-game-bg rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm text-game-text">
                      Music Volume: {Math.round(settings.musicVolume * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.musicVolume}
                      onChange={(e) => updateSettings({ musicVolume: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-game-bg rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm text-game-text">
                      SFX Volume: {Math.round(settings.sfxVolume * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.sfxVolume}
                      onChange={(e) => updateSettings({ sfxVolume: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-game-bg rounded-lg appearance-none cursor-pointer slider"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Display Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-game-text font-gaming">
              Display Settings
            </h3>
            
            <div className="flex items-center justify-between">
              <span className="text-game-text">Theme</span>
              <div className="flex gap-2">
                <Button
                  onClick={() => theme !== 'light' && toggleTheme()}
                  variant={theme === 'light' ? 'primary' : 'outline'}
                  size="sm"
                  leftIcon={<Sun className="h-3 w-3" />}
                >
                  Light
                </Button>
                <Button
                  onClick={() => theme !== 'dark' && toggleTheme()}
                  variant={theme === 'dark' ? 'primary' : 'outline'}
                  size="sm"
                  leftIcon={<Moon className="h-3 w-3" />}
                >
                  Dark
                </Button>
              </div>
            </div>
          </div>

          {/* Game Info */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-game-text font-gaming">
              Game Information
            </h3>
            
            <div className="bg-game-bg/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-game-muted">Version:</span>
                <span className="text-game-text">v1.0.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-muted">Network:</span>
                <span className="text-game-text">Solana Devnet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-muted">Platform Fee:</span>
                <span className="text-game-text">5%</span>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <Button
            onClick={() => setShowSettings(false)}
            variant="primary"
            fullWidth
          >
            Close Settings
          </Button>
        </div>
      </Modal>

      {/* Custom CSS for sliders */}
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          background: #0ea5e9;
          border-radius: 50%;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          background: #0ea5e9;
          border-radius: 50%;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </>
  );
};

export default Header;