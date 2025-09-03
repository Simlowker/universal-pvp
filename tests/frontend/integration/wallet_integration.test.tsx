import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from '@jest/globals';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';
import { WalletProvider } from '../../../src/frontend/contexts/WalletContext';
import { WalletButton } from '../../../src/frontend/components/wallet/WalletButton';
import { TransactionModal } from '../../../src/frontend/components/wallet/TransactionModal';
import { mockSolanaWallet, createMockTransaction } from '../mocks/wallet';

/**
 * Wallet Integration Tests
 * Tests Solana wallet connectivity, transaction signing, and error handling
 */

// Mock Solana Web3.js
jest.mock('@solana/web3.js', () => ({
  ...jest.requireActual('@solana/web3.js'),
  Connection: jest.fn(),
  PublicKey: jest.fn(),
  Transaction: jest.fn()
}));

// Mock browser wallet APIs
const mockPhantomWallet = {
  isPhantom: true,
  publicKey: new PublicKey('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9'),
  connect: jest.fn(),
  disconnect: jest.fn(),
  signMessage: jest.fn(),
  signTransaction: jest.fn(),
  signAllTransactions: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};

const mockSolflareWallet = {
  isSolflare: true,
  publicKey: new PublicKey('8xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgHU9'),
  connect: jest.fn(),
  disconnect: jest.fn(),
  signMessage: jest.fn(),
  signTransaction: jest.fn(),
  signAllTransactions: jest.fn()
};

// Setup global window mocks
beforeAll(() => {
  Object.defineProperty(window, 'solana', {
    value: mockPhantomWallet,
    writable: true
  });
  
  Object.defineProperty(window, 'solflare', {
    value: mockSolflareWallet,
    writable: true
  });
});

describe('Wallet Integration Tests', () => {
  const user = userEvent.setup();
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockPhantomWallet.connect.mockResolvedValue({
      publicKey: mockPhantomWallet.publicKey
    });
    mockSolflareWallet.connect.mockResolvedValue({
      publicKey: mockSolflareWallet.publicKey
    });
  });
  
  describe('Wallet Detection and Connection', () => {
    it('should detect installed wallets', async () => {
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      // Should show wallet selection modal
      expect(screen.getByTestId('wallet-modal')).toBeInTheDocument();
      
      // Should list available wallets
      expect(screen.getByTestId('phantom-wallet-option')).toBeInTheDocument();
      expect(screen.getByTestId('solflare-wallet-option')).toBeInTheDocument();
      
      // Should show wallet names and icons
      expect(screen.getByText('Phantom')).toBeInTheDocument();
      expect(screen.getByText('Solflare')).toBeInTheDocument();
    });
    
    it('should connect to Phantom wallet successfully', async () => {
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(mockPhantomWallet.connect).toHaveBeenCalled();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('wallet-connected')).toBeInTheDocument();
        expect(screen.getByText('7xKXtg2C...sgHU9')).toBeInTheDocument();
      });
    });
    
    it('should connect to Solflare wallet successfully', async () => {
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const solflareOption = screen.getByTestId('solflare-wallet-option');
      await user.click(solflareOption);
      
      await waitFor(() => {
        expect(mockSolflareWallet.connect).toHaveBeenCalled();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('wallet-connected')).toBeInTheDocument();
        expect(screen.getByText('8xKXtg2C...sgHU9')).toBeInTheDocument();
      });
    });
    
    it('should handle wallet connection rejection', async () => {
      mockPhantomWallet.connect.mockRejectedValue(new Error('User rejected the request'));
      
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByText('Connection failed. Please try again.')).toBeInTheDocument();
      });
      
      expect(screen.getByTestId('connect-wallet-btn')).toBeInTheDocument();
    });
    
    it('should handle wallet not installed scenario', async () => {
      // Remove phantom wallet from window
      Object.defineProperty(window, 'solana', {
        value: undefined,
        writable: true
      });
      
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByText('Phantom wallet not installed')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Install Phantom' })).toBeInTheDocument();
      });
    });
  });
  
  describe('Wallet Disconnection', () => {
    beforeEach(async () => {
      // Connect wallet first
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByTestId('wallet-connected')).toBeInTheDocument();
      });
    });
    
    it('should disconnect wallet successfully', async () => {
      const walletInfo = screen.getByTestId('wallet-info');
      await user.click(walletInfo);
      
      const disconnectButton = screen.getByTestId('disconnect-wallet-btn');
      await user.click(disconnectButton);
      
      await waitFor(() => {
        expect(mockPhantomWallet.disconnect).toHaveBeenCalled();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('connect-wallet-btn')).toBeInTheDocument();
        expect(screen.queryByTestId('wallet-connected')).not.toBeInTheDocument();
      });
    });
    
    it('should handle programmatic disconnection', async () => {
      // Simulate wallet disconnection event
      const disconnectCallback = mockPhantomWallet.on.mock.calls
        .find(call => call[0] === 'disconnect')?.[1];
      
      expect(disconnectCallback).toBeDefined();
      
      if (disconnectCallback) {
        disconnectCallback();
        
        await waitFor(() => {
          expect(screen.getByTestId('connect-wallet-btn')).toBeInTheDocument();
          expect(screen.queryByTestId('wallet-connected')).not.toBeInTheDocument();
        });
      }
    });
  });
  
  describe('Transaction Signing', () => {
    let mockTransaction: Transaction;
    
    beforeEach(async () => {
      // Setup connected wallet
      Object.defineProperty(window, 'solana', {
        value: mockPhantomWallet,
        writable: true
      });
      
      mockTransaction = createMockTransaction();
      mockPhantomWallet.signTransaction.mockResolvedValue(mockTransaction);
      
      render(
        <WalletProvider>
          <TransactionModal
            transaction={mockTransaction}
            onConfirm={jest.fn()}
            onCancel={jest.fn()}
            isOpen={true}
          />
        </WalletProvider>
      );
    });
    
    it('should display transaction details correctly', () => {
      expect(screen.getByTestId('transaction-modal')).toBeInTheDocument();
      expect(screen.getByText('Sign Transaction')).toBeInTheDocument();
      
      // Should show transaction details
      expect(screen.getByTestId('transaction-amount')).toBeInTheDocument();
      expect(screen.getByTestId('transaction-fee')).toBeInTheDocument();
      expect(screen.getByTestId('transaction-recipient')).toBeInTheDocument();
      
      // Should show action buttons
      expect(screen.getByTestId('approve-transaction-btn')).toBeInTheDocument();
      expect(screen.getByTestId('reject-transaction-btn')).toBeInTheDocument();
    });
    
    it('should sign transaction successfully', async () => {
      const approveButton = screen.getByTestId('approve-transaction-btn');
      await user.click(approveButton);
      
      await waitFor(() => {
        expect(mockPhantomWallet.signTransaction).toHaveBeenCalledWith(mockTransaction);
      });
      
      expect(screen.getByText('Transaction signed successfully')).toBeInTheDocument();
    });
    
    it('should handle transaction rejection', async () => {
      mockPhantomWallet.signTransaction.mockRejectedValue(new Error('User rejected the request'));
      
      const approveButton = screen.getByTestId('approve-transaction-btn');
      await user.click(approveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Transaction rejected')).toBeInTheDocument();
      });
    });
    
    it('should handle insufficient funds error', async () => {
      mockPhantomWallet.signTransaction.mockRejectedValue(
        new Error('Insufficient funds for transaction')
      );
      
      const approveButton = screen.getByTestId('approve-transaction-btn');
      await user.click(approveButton);
      
      await waitFor(() => {
        expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
        expect(screen.getByTestId('add-funds-btn')).toBeInTheDocument();
      });
    });
    
    it('should cancel transaction', async () => {
      const cancelButton = screen.getByTestId('reject-transaction-btn');
      await user.click(cancelButton);
      
      expect(screen.queryByTestId('transaction-modal')).not.toBeInTheDocument();
    });
  });
  
  describe('Message Signing', () => {
    const testMessage = 'Sign in to SOL Duel';
    const mockSignature = new Uint8Array([1, 2, 3, 4, 5]);
    
    beforeEach(() => {
      mockPhantomWallet.signMessage.mockResolvedValue({ signature: mockSignature });
    });
    
    it('should sign authentication message', async () => {
      const mockOnSign = jest.fn();
      
      render(
        <WalletProvider>
          <button
            data-testid="sign-message-btn"
            onClick={async () => {
              const result = await mockPhantomWallet.signMessage(
                new TextEncoder().encode(testMessage)
              );
              mockOnSign(result);
            }}
          >
            Sign Message
          </button>
        </WalletProvider>
      );
      
      const signButton = screen.getByTestId('sign-message-btn');
      await user.click(signButton);
      
      await waitFor(() => {
        expect(mockPhantomWallet.signMessage).toHaveBeenCalledWith(
          new TextEncoder().encode(testMessage)
        );
        expect(mockOnSign).toHaveBeenCalledWith({ signature: mockSignature });
      });
    });
    
    it('should handle message signing rejection', async () => {
      mockPhantomWallet.signMessage.mockRejectedValue(new Error('User rejected'));
      
      const mockOnError = jest.fn();
      
      render(
        <WalletProvider>
          <button
            data-testid="sign-message-btn"
            onClick={async () => {
              try {
                await mockPhantomWallet.signMessage(new TextEncoder().encode(testMessage));
              } catch (error) {
                mockOnError(error);
              }
            }}
          >
            Sign Message
          </button>
        </WalletProvider>
      );
      
      const signButton = screen.getByTestId('sign-message-btn');
      await user.click(signButton);
      
      await waitFor(() => {
        expect(mockOnError).toHaveBeenCalledWith(new Error('User rejected'));
      });
    });
  });
  
  describe('Balance Fetching', () => {
    const mockConnection = {
      getBalance: jest.fn(),
      getAccountInfo: jest.fn()
    };
    
    beforeEach(() => {
      (Connection as jest.Mock).mockImplementation(() => mockConnection);
      mockConnection.getBalance.mockResolvedValue(5000000000); // 5 SOL in lamports
    });
    
    it('should fetch and display wallet balance', async () => {
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByTestId('wallet-balance')).toBeInTheDocument();
        expect(screen.getByText('5.00 SOL')).toBeInTheDocument();
      });
      
      expect(mockConnection.getBalance).toHaveBeenCalledWith(mockPhantomWallet.publicKey);
    });
    
    it('should handle balance fetch errors', async () => {
      mockConnection.getBalance.mockRejectedValue(new Error('Network error'));
      
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByText('Balance unavailable')).toBeInTheDocument();
      });
    });
    
    it('should refresh balance on demand', async () => {
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByTestId('wallet-balance')).toBeInTheDocument();
      });
      
      // Click refresh balance
      const refreshButton = screen.getByTestId('refresh-balance-btn');
      await user.click(refreshButton);
      
      await waitFor(() => {
        expect(mockConnection.getBalance).toHaveBeenCalledTimes(2);
      });
    });
  });
  
  describe('Network Handling', () => {
    it('should detect and display current network', async () => {
      const mockConnection = {
        getBalance: jest.fn().mockResolvedValue(1000000000),
        rpcEndpoint: 'https://api.devnet.solana.com'
      };
      
      (Connection as jest.Mock).mockImplementation(() => mockConnection);
      
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByTestId('network-indicator')).toBeInTheDocument();
        expect(screen.getByText('Devnet')).toBeInTheDocument();
      });
    });
    
    it('should warn about wrong network', async () => {
      const mockConnection = {
        getBalance: jest.fn().mockResolvedValue(1000000000),
        rpcEndpoint: 'https://api.mainnet-beta.solana.com'
      };
      
      (Connection as jest.Mock).mockImplementation(() => mockConnection);
      
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByTestId('network-warning')).toBeInTheDocument();
        expect(screen.getByText('Please switch to Devnet')).toBeInTheDocument();
      });
    });
  });
  
  describe('Auto-reconnection', () => {
    it('should attempt to reconnect on page load', async () => {
      // Simulate page reload with wallet in localStorage
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: jest.fn(() => 'phantom'),
          setItem: jest.fn(),
          removeItem: jest.fn()
        },
        writable: true
      });
      
      mockPhantomWallet.connect.mockResolvedValue({
        publicKey: mockPhantomWallet.publicKey
      });
      
      render(
        <WalletProvider autoConnect={true}>
          <WalletButton />
        </WalletProvider>
      );
      
      await waitFor(() => {
        expect(mockPhantomWallet.connect).toHaveBeenCalled();
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('wallet-connected')).toBeInTheDocument();
      });
    });
    
    it('should handle auto-reconnection failure silently', async () => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: jest.fn(() => 'phantom'),
          setItem: jest.fn(),
          removeItem: jest.fn()
        },
        writable: true
      });
      
      mockPhantomWallet.connect.mockRejectedValue(new Error('Connection failed'));
      
      render(
        <WalletProvider autoConnect={true}>
          <WalletButton />
        </WalletProvider>
      );
      
      await waitFor(() => {
        expect(screen.getByTestId('connect-wallet-btn')).toBeInTheDocument();
      });
      
      // Should not show error for failed auto-reconnect
      expect(screen.queryByText('Connection failed')).not.toBeInTheDocument();
    });
  });
  
  describe('Multiple Wallet Support', () => {
    it('should switch between different wallets', async () => {
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      // Connect to Phantom first
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      await waitFor(() => {
        expect(screen.getByText('7xKXtg2C...sgHU9')).toBeInTheDocument();
      });
      
      // Switch to Solflare
      const walletInfo = screen.getByTestId('wallet-info');
      await user.click(walletInfo);
      
      const switchWalletButton = screen.getByTestId('switch-wallet-btn');
      await user.click(switchWalletButton);
      
      const solflareOption = screen.getByTestId('solflare-wallet-option');
      await user.click(solflareOption);
      
      await waitFor(() => {
        expect(screen.getByText('8xKXtg2C...sgHU9')).toBeInTheDocument();
      });
      
      expect(mockPhantomWallet.disconnect).toHaveBeenCalled();
      expect(mockSolflareWallet.connect).toHaveBeenCalled();
    });
  });
  
  describe('Error Recovery', () => {
    it('should recover from connection timeout', async () => {
      jest.setTimeout(10000);
      
      mockPhantomWallet.connect
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 5000)))
        .mockResolvedValueOnce({ publicKey: mockPhantomWallet.publicKey });
      
      render(
        <WalletProvider>
          <WalletButton />
        </WalletProvider>
      );
      
      const connectButton = screen.getByTestId('connect-wallet-btn');
      await user.click(connectButton);
      
      const phantomOption = screen.getByTestId('phantom-wallet-option');
      await user.click(phantomOption);
      
      // Should show timeout error
      await waitFor(() => {
        expect(screen.getByText('Connection timeout')).toBeInTheDocument();
      }, { timeout: 6000 });
      
      // Retry should work
      const retryButton = screen.getByTestId('retry-connection-btn');
      await user.click(retryButton);
      
      await waitFor(() => {
        expect(screen.getByTestId('wallet-connected')).toBeInTheDocument();
      });
    });
  });
});

// Test utilities
const TestWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <WalletProvider>{children}</WalletProvider>
);