import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from '@jest/globals';
import { GameLobby } from '../../../src/frontend/components/game/GameLobby';
import { GameContextProvider } from '../../../src/frontend/contexts/GameContext';
import { WalletContextProvider } from '../../../src/frontend/contexts/WalletContext';
import { mockWallet, mockGameState, mockMatches } from '../mocks/gameData';

/**
 * React Component Tests for Game Lobby
 * Tests user interaction, state management, and real-time updates
 */

// Mock dependencies
jest.mock('../../../src/frontend/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    socket: {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    },
    connected: true,
    error: null
  })
}));

jest.mock('../../../src/frontend/services/api', () => ({
  apiService: {
    getMatches: jest.fn(),
    createMatch: jest.fn(),
    joinMatch: jest.fn()
  }
}));

// Test wrapper with all necessary providers
const TestWrapper = ({ children, initialGameState = mockGameState, initialWallet = mockWallet }) => (
  <WalletContextProvider value={initialWallet}>
    <GameContextProvider value={initialGameState}>
      {children}
    </GameContextProvider>
  </WalletContextProvider>
);

describe('GameLobby Component Tests', () => {
  const user = userEvent.setup();
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Component Rendering', () => {
    it('should render lobby with match list', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByTestId('game-lobby')).toBeInTheDocument();
      expect(screen.getByText('Available Matches')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Match' })).toBeInTheDocument();
    });
    
    it('should display user wallet information', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByText(mockWallet.publicKey.toString().substring(0, 8) + '...')).toBeInTheDocument();
      expect(screen.getByText(`${mockWallet.balance} SOL`)).toBeInTheDocument();
    });
    
    it('should show loading state initially', () => {
      const loadingGameState = {
        ...mockGameState,
        matches: [],
        loading: true
      };
      
      render(
        <TestWrapper initialGameState={loadingGameState}>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading matches...')).toBeInTheDocument();
    });
    
    it('should display error state when API fails', () => {
      const errorGameState = {
        ...mockGameState,
        error: 'Failed to load matches',
        loading: false
      };
      
      render(
        <TestWrapper initialGameState={errorGameState}>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByText('Failed to load matches')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });
  
  describe('Match List Display', () => {
    it('should render match cards with correct information', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      mockMatches.forEach(match => {
        expect(screen.getByText(match.creator.username)).toBeInTheDocument();
        expect(screen.getByText(`${match.currentPlayers}/${match.config.maxPlayers} players`)).toBeInTheDocument();
        expect(screen.getByText(`${match.config.entryFee / 1000000} SOL`)).toBeInTheDocument();
      });
    });
    
    it('should show match status badges correctly', () => {
      const matchesWithStatuses = [
        { ...mockMatches[0], status: 'waiting' },
        { ...mockMatches[0], id: '2', status: 'in_progress' },
        { ...mockMatches[0], id: '3', status: 'completed' }
      ];
      
      render(
        <TestWrapper initialGameState={{ ...mockGameState, matches: matchesWithStatuses }}>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByText('Waiting')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
    
    it('should filter matches by status', async () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const statusFilter = screen.getByTestId('status-filter');
      await user.selectOptions(statusFilter, 'waiting');
      
      // Should only show waiting matches
      await waitFor(() => {
        const matchCards = screen.getAllByTestId('match-card');
        matchCards.forEach(card => {
          expect(card).toHaveTextContent('Waiting');
        });
      });
    });
    
    it('should sort matches by different criteria', async () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const sortSelect = screen.getByTestId('sort-select');
      
      // Sort by entry fee
      await user.selectOptions(sortSelect, 'entryFee');
      
      await waitFor(() => {
        const matchCards = screen.getAllByTestId('match-card');
        const entryFees = matchCards.map(card => {
          const feeText = card.textContent?.match(/(\d+(?:\.\d+)?) SOL/)?.[1];
          return parseFloat(feeText || '0');
        });
        
        // Should be sorted in descending order
        for (let i = 1; i < entryFees.length; i++) {
          expect(entryFees[i]).toBeLessThanOrEqual(entryFees[i - 1]);
        }
      });
    });
  });
  
  describe('Match Creation', () => {
    it('should open create match modal', async () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const createButton = screen.getByRole('button', { name: 'Create Match' });
      await user.click(createButton);
      
      expect(screen.getByTestId('create-match-modal')).toBeInTheDocument();
      expect(screen.getByText('Create New Match')).toBeInTheDocument();
    });
    
    it('should validate match configuration form', async () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      await user.click(screen.getByRole('button', { name: 'Create Match' }));
      
      const form = screen.getByTestId('create-match-form');
      expect(form).toBeInTheDocument();
      
      // Try to submit empty form
      const submitButton = screen.getByRole('button', { name: 'Create Match' });
      await user.click(submitButton);
      
      // Should show validation errors
      expect(screen.getByText('Max players is required')).toBeInTheDocument();
      expect(screen.getByText('Entry fee is required')).toBeInTheDocument();
    });
    
    it('should create match with valid configuration', async () => {
      const mockCreateMatch = jest.fn().mockResolvedValue({
        id: 'new-match-id',
        creator: mockWallet.user,
        status: 'waiting'
      });
      
      const apiService = require('../../../src/frontend/services/api');
      apiService.apiService.createMatch = mockCreateMatch;
      
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      await user.click(screen.getByRole('button', { name: 'Create Match' }));
      
      // Fill form
      await user.type(screen.getByLabelText('Max Players'), '4');
      await user.type(screen.getByLabelText('Entry Fee (SOL)'), '1.5');
      await user.type(screen.getByLabelText('Turn Timeout (seconds)'), '60');
      
      await user.click(screen.getByRole('button', { name: 'Create Match' }));
      
      await waitFor(() => {
        expect(mockCreateMatch).toHaveBeenCalledWith({
          maxPlayers: 4,
          entryFee: 1500000,
          turnTimeout: 60,
          matchDuration: 1800
        });
      });
      
      expect(screen.queryByTestId('create-match-modal')).not.toBeInTheDocument();
    });
    
    it('should check wallet balance before creating expensive match', async () => {
      const poorWallet = {
        ...mockWallet,
        balance: 0.5 // Only 0.5 SOL
      };
      
      render(
        <TestWrapper initialWallet={poorWallet}>
          <GameLobby />
        </TestWrapper>
      );
      
      await user.click(screen.getByRole('button', { name: 'Create Match' }));
      
      await user.type(screen.getByLabelText('Entry Fee (SOL)'), '1.0'); // More than balance
      
      await user.click(screen.getByRole('button', { name: 'Create Match' }));
      
      expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
    });
  });
  
  describe('Match Joining', () => {
    it('should show join button for available matches', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const waitingMatch = mockMatches.find(m => m.status === 'waiting');
      if (waitingMatch) {
        const matchCard = screen.getByTestId(`match-card-${waitingMatch.id}`);
        expect(matchCard.querySelector('button[data-testid="join-match-btn"]')).toBeInTheDocument();
      }
    });
    
    it('should disable join button for own matches', () => {
      const userMatch = {
        ...mockMatches[0],
        creator: { id: mockWallet.user.id, username: mockWallet.user.username }
      };
      
      render(
        <TestWrapper initialGameState={{ ...mockGameState, matches: [userMatch] }}>
          <GameLobby />
        </TestWrapper>
      );
      
      const joinButton = screen.getByTestId('join-match-btn');
      expect(joinButton).toBeDisabled();
      expect(joinButton).toHaveTextContent('Your Match');
    });
    
    it('should disable join button for full matches', () => {
      const fullMatch = {
        ...mockMatches[0],
        currentPlayers: mockMatches[0].config.maxPlayers,
        status: 'in_progress'
      };
      
      render(
        <TestWrapper initialGameState={{ ...mockGameState, matches: [fullMatch] }}>
          <GameLobby />
        </TestWrapper>
      );
      
      const joinButton = screen.getByTestId('join-match-btn');
      expect(joinButton).toBeDisabled();
      expect(joinButton).toHaveTextContent('Full');
    });
    
    it('should join match successfully', async () => {
      const mockJoinMatch = jest.fn().mockResolvedValue({ success: true });
      const apiService = require('../../../src/frontend/services/api');
      apiService.apiService.joinMatch = mockJoinMatch;
      
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const joinButton = screen.getByTestId('join-match-btn');
      await user.click(joinButton);
      
      // Should show confirmation dialog
      expect(screen.getByText('Join Match?')).toBeInTheDocument();
      
      const confirmButton = screen.getByRole('button', { name: 'Join' });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(mockJoinMatch).toHaveBeenCalledWith(mockMatches[0].id);
      });
    });
    
    it('should handle insufficient balance for match entry', async () => {
      const poorWallet = {
        ...mockWallet,
        balance: 0.001 // Very low balance
      };
      
      render(
        <TestWrapper initialWallet={poorWallet}>
          <GameLobby />
        </TestWrapper>
      );
      
      const joinButton = screen.getByTestId('join-match-btn');
      await user.click(joinButton);
      
      expect(screen.getByText('Insufficient balance to join this match')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Join' })).not.toBeInTheDocument();
    });
  });
  
  describe('Real-time Updates', () => {
    it('should update match list when new matches are created', async () => {
      const { rerender } = render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const initialMatchCount = screen.getAllByTestId('match-card').length;
      
      const newMatch = {
        id: 'new-match',
        creator: { id: '999', username: 'newplayer' },
        status: 'waiting',
        currentPlayers: 1,
        config: { maxPlayers: 2, entryFee: 2000000 }
      };
      
      const updatedGameState = {
        ...mockGameState,
        matches: [...mockMatches, newMatch]
      };
      
      rerender(
        <TestWrapper initialGameState={updatedGameState}>
          <GameLobby />
        </TestWrapper>
      );
      
      const updatedMatchCount = screen.getAllByTestId('match-card').length;
      expect(updatedMatchCount).toBe(initialMatchCount + 1);
    });
    
    it('should update match status in real-time', async () => {
      const { rerender } = render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      // Initially waiting
      expect(screen.getByText('Waiting')).toBeInTheDocument();
      
      // Update to in progress
      const updatedMatch = {
        ...mockMatches[0],
        status: 'in_progress',
        currentPlayers: mockMatches[0].config.maxPlayers
      };
      
      const updatedGameState = {
        ...mockGameState,
        matches: [updatedMatch, ...mockMatches.slice(1)]
      };
      
      rerender(
        <TestWrapper initialGameState={updatedGameState}>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });
    
    it('should show player count updates', async () => {
      const { rerender } = render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const initialText = `${mockMatches[0].currentPlayers}/${mockMatches[0].config.maxPlayers} players`;
      expect(screen.getByText(initialText)).toBeInTheDocument();
      
      const updatedMatch = {
        ...mockMatches[0],
        currentPlayers: mockMatches[0].currentPlayers + 1
      };
      
      const updatedGameState = {
        ...mockGameState,
        matches: [updatedMatch, ...mockMatches.slice(1)]
      };
      
      rerender(
        <TestWrapper initialGameState={updatedGameState}>
          <GameLobby />
        </TestWrapper>
      );
      
      const updatedText = `${updatedMatch.currentPlayers}/${updatedMatch.config.maxPlayers} players`;
      expect(screen.getByText(updatedText)).toBeInTheDocument();
    });
  });
  
  describe('User Experience Features', () => {
    it('should show match recommendations', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByText('Recommended for You')).toBeInTheDocument();
      
      const recommendedSection = screen.getByTestId('recommended-matches');
      expect(recommendedSection).toBeInTheDocument();
    });
    
    it('should display player statistics in lobby', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByText('Your Stats')).toBeInTheDocument();
      expect(screen.getByText(`Level ${mockWallet.user.level}`)).toBeInTheDocument();
      expect(screen.getByText(`Rating: ${mockWallet.user.rating}`)).toBeInTheDocument();
    });
    
    it('should show recent match history', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByText('Recent Matches')).toBeInTheDocument();
      expect(screen.getByTestId('match-history')).toBeInTheDocument();
    });
    
    it('should refresh match list manually', async () => {
      const mockRefresh = jest.fn();
      const gameState = {
        ...mockGameState,
        refreshMatches: mockRefresh
      };
      
      render(
        <TestWrapper initialGameState={gameState}>
          <GameLobby />
        </TestWrapper>
      );
      
      const refreshButton = screen.getByTestId('refresh-matches-btn');
      await user.click(refreshButton);
      
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
  
  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Game lobby');
      expect(screen.getByRole('list')).toHaveAttribute('aria-label', 'Available matches');
      expect(screen.getByRole('button', { name: 'Create Match' })).toHaveAttribute('aria-describedby');
    });
    
    it('should support keyboard navigation', async () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const createButton = screen.getByRole('button', { name: 'Create Match' });
      createButton.focus();
      
      // Tab to first match join button
      await user.tab();
      const firstJoinButton = screen.getAllByTestId('join-match-btn')[0];
      expect(firstJoinButton).toHaveFocus();
      
      // Enter should trigger click
      await user.keyboard('{Enter}');
      expect(screen.getByText('Join Match?')).toBeInTheDocument();
    });
    
    it('should announce dynamic content changes', async () => {
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const announcements = screen.getByTestId('announcements');
      expect(announcements).toHaveAttribute('aria-live', 'polite');
      expect(announcements).toHaveAttribute('aria-atomic', 'true');
    });
  });
  
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const mockError = jest.fn().mockRejectedValue(new Error('Network error'));
      const apiService = require('../../../src/frontend/services/api');
      apiService.apiService.joinMatch = mockError;
      
      render(
        <TestWrapper>
          <GameLobby />
        </TestWrapper>
      );
      
      const joinButton = screen.getByTestId('join-match-btn');
      await user.click(joinButton);
      
      const confirmButton = screen.getByRole('button', { name: 'Join' });
      await user.click(confirmButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to join match. Please try again.')).toBeInTheDocument();
      });
    });
    
    it('should retry failed operations', async () => {
      const mockRetry = jest.fn().mockResolvedValue(mockMatches);
      const gameState = {
        ...mockGameState,
        error: 'Failed to load matches',
        refreshMatches: mockRetry
      };
      
      render(
        <TestWrapper initialGameState={gameState}>
          <GameLobby />
        </TestWrapper>
      );
      
      const retryButton = screen.getByRole('button', { name: 'Retry' });
      await user.click(retryButton);
      
      expect(mockRetry).toHaveBeenCalled();
    });
  });
});