'use client';

import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';

const DiagnosticWalletTest: React.FC = () => {
  const { connection } = useConnection();
  const { wallets, connected, connecting, publicKey, select, connect } = useWallet();
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [phantomInfo, setPhantomInfo] = useState<any>(null);

  const addDiagnostic = (message: string) => {
    console.log('DIAGNOSTIC:', message);
    setDiagnostics(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    const runDiagnostics = () => {
      addDiagnostic('Starting wallet diagnostics...');
      
      // Check if we're in browser
      if (typeof window === 'undefined') {
        addDiagnostic('❌ Running on server-side');
        return;
      }
      addDiagnostic('✅ Running in browser');

      // Check Phantom availability
      if (window.solana) {
        addDiagnostic('✅ window.solana exists');
        setPhantomInfo({
          isPhantom: window.solana.isPhantom,
          isConnected: window.solana.isConnected,
          publicKey: window.solana.publicKey?.toString()
        });
        
        if (window.solana.isPhantom) {
          addDiagnostic('✅ Phantom wallet detected');
        } else {
          addDiagnostic('❌ window.solana exists but not Phantom');
        }
      } else {
        addDiagnostic('❌ window.solana not found - Phantom not installed?');
      }

      // Check connection
      addDiagnostic(`Connection endpoint: ${connection.rpcEndpoint}`);
      
      // Check wallets from adapter
      addDiagnostic(`Available wallets: ${wallets.length}`);
      wallets.forEach(wallet => {
        addDiagnostic(`- ${wallet.adapter.name}: ${wallet.readyState}`);
      });
      
      // Check adapter state
      addDiagnostic(`Adapter connected: ${connected}`);
      addDiagnostic(`Adapter connecting: ${connecting}`);
      addDiagnostic(`PublicKey: ${publicKey?.toString() || 'null'}`);
    };

    runDiagnostics();
  }, [connection, wallets, connected, connecting, publicKey]);

  const testDirectPhantomConnection = async () => {
    addDiagnostic('Testing direct Phantom connection...');
    
    try {
      if (!window.solana) {
        throw new Error('window.solana not available');
      }
      
      if (!window.solana.isPhantom) {
        throw new Error('Not Phantom wallet');
      }

      addDiagnostic('Calling window.solana.connect()...');
      const response = await window.solana.connect();
      addDiagnostic(`✅ Direct connection successful: ${response.publicKey.toString()}`);
      
    } catch (error: any) {
      addDiagnostic(`❌ Direct connection failed: ${error.message}`);
    }
  };

  const testAdapterConnection = async () => {
    addDiagnostic('Testing adapter connection...');
    
    try {
      const phantomWallet = wallets.find(w => w.adapter.name === 'Phantom');
      if (!phantomWallet) {
        throw new Error('Phantom adapter not found');
      }
      
      addDiagnostic(`Found Phantom adapter, ready state: ${phantomWallet.readyState}`);
      
      addDiagnostic('Selecting wallet...');
      await select(phantomWallet.adapter.name);
      
      addDiagnostic('Connecting...');
      await connect();
      
      addDiagnostic('✅ Adapter connection successful');
      
    } catch (error: any) {
      addDiagnostic(`❌ Adapter connection failed: ${error.message}`);
    }
  };

  return (
    <div className="fixed top-4 right-4 w-96 max-h-96 overflow-auto bg-black text-green-400 p-4 rounded border border-green-500 text-xs font-mono z-50">
      <h3 className="text-green-300 font-bold mb-2">🔍 Wallet Diagnostics</h3>
      
      {/* Phantom Info */}
      {phantomInfo && (
        <div className="mb-2 p-2 bg-gray-900 rounded">
          <div>Phantom: {phantomInfo.isPhantom ? '✅' : '❌'}</div>
          <div>Connected: {phantomInfo.isConnected ? '✅' : '❌'}</div>
          <div>PublicKey: {phantomInfo.publicKey || 'None'}</div>
        </div>
      )}

      {/* Test Buttons */}
      <div className="flex gap-2 mb-2">
        <button 
          onClick={testDirectPhantomConnection}
          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
        >
          Test Direct
        </button>
        <button 
          onClick={testAdapterConnection}
          className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
        >
          Test Adapter
        </button>
        <button 
          onClick={() => setDiagnostics([])}
          className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
        >
          Clear
        </button>
      </div>

      {/* Diagnostic Messages */}
      <div className="space-y-1">
        {diagnostics.map((msg, i) => (
          <div key={i} className="text-xs">
            {msg}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DiagnosticWalletTest;

// Extend window type
declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      isConnected?: boolean;
      publicKey?: { toString: () => string };
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      disconnect: () => Promise<void>;
    };
  }
}