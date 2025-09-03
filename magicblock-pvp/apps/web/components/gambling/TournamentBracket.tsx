'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

interface Player {
  id: string;
  name: string;
  avatar?: string;
  seed?: number;
  rating?: number;
  wins?: number;
  losses?: number;
}

interface Match {
  id: string;
  round: number;
  position: number;
  player1?: Player;
  player2?: Player;
  winner?: string;
  score1?: number;
  score2?: number;
  status: 'scheduled' | 'live' | 'completed' | 'bye';
  startTime?: Date;
  odds?: {
    player1: number;
    player2: number;
  };
  bettingOpen?: boolean;
}

interface TournamentBracketProps {
  matches: Match[];
  tournamentType?: 'single_elimination' | 'double_elimination' | 'round_robin';
  onMatchSelect?: (match: Match) => void;
  onPlayerSelect?: (player: Player) => void;
  onBetClick?: (match: Match, selection: 'player1' | 'player2') => void;
  selectedMatch?: string;
  showOdds?: boolean;
  showBetting?: boolean;
  interactive?: boolean;
  variant?: 'default' | 'compact' | 'mobile';
  className?: string;
}

export const TournamentBracket: React.FC<TournamentBracketProps> = ({
  matches = [],
  tournamentType = 'single_elimination',
  onMatchSelect,
  onPlayerSelect,
  onBetClick,
  selectedMatch,
  showOdds = true,
  showBetting = false,
  interactive = true,
  variant = 'default',
  className = ''
}) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
  const [hoveredMatch, setHoveredMatch] = useState<string | null>(null);

  // Organize matches by rounds
  const bracketStructure = useMemo(() => {
    const rounds: { [round: number]: Match[] } = {};
    const maxRound = Math.max(...matches.map(m => m.round), 0);

    for (let i = 0; i <= maxRound; i++) {
      rounds[i] = matches
        .filter(m => m.round === i)
        .sort((a, b) => a.position - b.position);
    }

    return rounds;
  }, [matches]);

  const getTotalRounds = () => Object.keys(bracketStructure).length;
  const getMatchesInRound = (round: number) => bracketStructure[round]?.length || 0;

  const formatOdds = (odds: number) => {
    return odds.toFixed(2);
  };

  const getPlayerWinProbability = (odds: number, opponentOdds: number) => {
    const total = (1/odds) + (1/opponentOdds);
    return ((1/odds) / total * 100).toFixed(1);
  };

  const getMatchStatusColor = (status: Match['status']) => {
    switch (status) {
      case 'live': return 'border-green-500 bg-green-50 dark:bg-green-950';
      case 'completed': return 'border-blue-500 bg-blue-50 dark:bg-blue-950';
      case 'scheduled': return 'border-gray-300 bg-white dark:bg-game-surface';
      case 'bye': return 'border-gray-200 bg-gray-50 dark:bg-gray-800';
      default: return 'border-gray-300 bg-white dark:bg-game-surface';
    }
  };

  const getMatchStatusIcon = (status: Match['status']) => {
    switch (status) {
      case 'live': return '🔴';
      case 'completed': return '✅';
      case 'scheduled': return '⏰';
      case 'bye': return '➡️';
      default: return '';
    }
  };

  const getRoundTitle = (round: number, totalRounds: number) => {
    if (tournamentType === 'single_elimination') {
      if (round === totalRounds - 1) return 'Final';
      if (round === totalRounds - 2) return 'Semi-Final';
      if (round === totalRounds - 3) return 'Quarter-Final';
      return `Round ${round + 1}`;
    }
    return `Round ${round + 1}`;
  };

  const isCompact = variant === 'compact';
  const isMobile = variant === 'mobile';

  if (matches.length === 0) {
    return (
      <div className={clsx('text-center py-12', className)}>
        <div className="text-6xl mb-4">🏆</div>
        <h3 className="text-game-text text-lg font-semibold mb-2">Tournament Bracket</h3>
        <p className="text-game-muted">No matches scheduled yet</p>
      </div>
    );
  }

  return (
    <div className={clsx('tournament-bracket', className)}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-game-text mb-1">
              Tournament Bracket
            </h2>
            <p className="text-game-muted text-sm">
              {tournamentType.replace('_', ' ').toUpperCase()} • {matches.length} matches
            </p>
          </div>

          {/* Zoom Controls */}
          {!isMobile && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
                className="p-2 bg-game-surface border border-game-border rounded hover:bg-game-border transition-colors"
                disabled={zoomLevel <= 0.5}
              >
                🔍-
              </button>
              <span className="text-sm text-game-muted min-w-16 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
                className="p-2 bg-game-surface border border-game-border rounded hover:bg-game-border transition-colors"
                disabled={zoomLevel >= 2}
              >
                🔍+
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bracket Container */}
      <div className="relative overflow-x-auto overflow-y-hidden">
        <div 
          className="bracket-grid flex gap-8 min-w-max pb-4"
          style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}
        >
          {Object.entries(bracketStructure).map(([roundStr, roundMatches]) => {
            const round = parseInt(roundStr);
            
            return (
              <div key={round} className="bracket-round flex-shrink-0">
                {/* Round Header */}
                <div className="text-center mb-4">
                  <h3 className="text-lg font-semibold text-game-text">
                    {getRoundTitle(round, getTotalRounds())}
                  </h3>
                  <p className="text-sm text-game-muted">
                    {roundMatches.length} match{roundMatches.length !== 1 ? 'es' : ''}
                  </p>
                </div>

                {/* Matches */}
                <div className="space-y-6">
                  {roundMatches.map((match, index) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={clsx(
                        'match-card relative border-2 rounded-lg overflow-hidden transition-all duration-200 cursor-pointer',
                        getMatchStatusColor(match.status),
                        selectedMatch === match.id && 'ring-2 ring-primary-500',
                        hoveredMatch === match.id && 'shadow-lg transform scale-105',
                        isCompact ? 'w-48' : 'w-64',
                        isMobile && 'w-full'
                      )}
                      onMouseEnter={() => setHoveredMatch(match.id)}
                      onMouseLeave={() => setHoveredMatch(null)}
                      onClick={() => interactive && onMatchSelect?.(match)}
                    >
                      {/* Match Status Badge */}
                      <div className="absolute top-2 right-2 z-10">
                        <span className="text-sm">
                          {getMatchStatusIcon(match.status)}
                        </span>
                        {match.status === 'live' && (
                          <span className="ml-1 text-xs text-green-600 font-medium">
                            LIVE
                          </span>
                        )}
                      </div>

                      {/* Match Info Header */}
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-game-muted">
                            Match {match.position + 1}
                          </span>
                          {match.startTime && (
                            <span className="text-xs text-game-muted">
                              {match.startTime.toLocaleTimeString([], { 
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Players */}
                      <div className="p-3 space-y-2">
                        {/* Player 1 */}
                        <div
                          className={clsx(
                            'player-row flex items-center justify-between p-2 rounded transition-colors',
                            match.winner === match.player1?.id && 'bg-green-100 dark:bg-green-900',
                            interactive && 'hover:bg-game-border cursor-pointer'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (match.player1) {
                              onPlayerSelect?.(match.player1);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div className="player-avatar w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {match.player1?.avatar || match.player1?.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-game-text truncate">
                                {match.player1?.name || 'TBD'}
                              </div>
                              {!isCompact && match.player1?.seed && (
                                <div className="text-xs text-game-muted">
                                  Seed #{match.player1.seed}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Score */}
                            {match.score1 !== undefined && (
                              <span className="text-lg font-bold text-game-text">
                                {match.score1}
                              </span>
                            )}

                            {/* Odds & Betting */}
                            {showOdds && match.odds && match.player1 && (
                              <div className="text-right">
                                <div className="text-xs font-medium text-primary-600">
                                  {formatOdds(match.odds.player1)}
                                </div>
                                {!isCompact && (
                                  <div className="text-xs text-game-muted">
                                    {getPlayerWinProbability(match.odds.player1, match.odds.player2)}%
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Bet Button */}
                            {showBetting && match.bettingOpen && match.player1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onBetClick?.(match, 'player1');
                                }}
                                className="px-2 py-1 bg-primary-500 text-white text-xs rounded hover:bg-primary-600 transition-colors"
                              >
                                Bet
                              </button>
                            )}
                          </div>
                        </div>

                        {/* VS Divider */}
                        <div className="text-center">
                          <span className="text-xs text-game-muted font-medium">VS</span>
                        </div>

                        {/* Player 2 */}
                        <div
                          className={clsx(
                            'player-row flex items-center justify-between p-2 rounded transition-colors',
                            match.winner === match.player2?.id && 'bg-green-100 dark:bg-green-900',
                            interactive && 'hover:bg-game-border cursor-pointer'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (match.player2) {
                              onPlayerSelect?.(match.player2);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <div className="player-avatar w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {match.player2?.avatar || match.player2?.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-game-text truncate">
                                {match.player2?.name || 'TBD'}
                              </div>
                              {!isCompact && match.player2?.seed && (
                                <div className="text-xs text-game-muted">
                                  Seed #{match.player2.seed}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Score */}
                            {match.score2 !== undefined && (
                              <span className="text-lg font-bold text-game-text">
                                {match.score2}
                              </span>
                            )}

                            {/* Odds & Betting */}
                            {showOdds && match.odds && match.player2 && (
                              <div className="text-right">
                                <div className="text-xs font-medium text-primary-600">
                                  {formatOdds(match.odds.player2)}
                                </div>
                                {!isCompact && (
                                  <div className="text-xs text-game-muted">
                                    {getPlayerWinProbability(match.odds.player2, match.odds.player1)}%
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Bet Button */}
                            {showBetting && match.bettingOpen && match.player2 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onBetClick?.(match, 'player2');
                                }}
                                className="px-2 py-1 bg-primary-500 text-white text-xs rounded hover:bg-primary-600 transition-colors"
                              >
                                Bet
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Match Footer */}
                      {!isCompact && (match.status === 'completed' || showBetting) && (
                        <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-t border-game-border">
                          {match.status === 'completed' && (
                            <div className="text-xs text-center text-game-muted">
                              Winner advances to next round
                            </div>
                          )}
                          {showBetting && match.bettingOpen && (
                            <div className="text-xs text-center text-primary-600">
                              📊 Betting Available
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Connection Lines */}
                {round < getTotalRounds() - 1 && !isMobile && (
                  <div className="absolute top-1/2 -right-4 w-8 border-t-2 border-game-border"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tournament Stats */}
      {!isCompact && (
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-game-surface border border-game-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary-600">
              {matches.filter(m => m.status === 'completed').length}
            </div>
            <div className="text-sm text-game-muted">Completed</div>
          </div>
          <div className="bg-game-surface border border-game-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-500">
              {matches.filter(m => m.status === 'live').length}
            </div>
            <div className="text-sm text-game-muted">Live</div>
          </div>
          <div className="bg-game-surface border border-game-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">
              {matches.filter(m => m.status === 'scheduled').length}
            </div>
            <div className="text-sm text-game-muted">Scheduled</div>
          </div>
          <div className="bg-game-surface border border-game-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-500">
              {getTotalRounds()}
            </div>
            <div className="text-sm text-game-muted">Rounds</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentBracket;

// Export types for external usage
export type { Player, Match, TournamentBracketProps };