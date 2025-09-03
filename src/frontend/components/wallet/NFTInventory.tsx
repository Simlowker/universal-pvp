'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Star, ExternalLink, Filter, Grid, List, Search } from 'lucide-react';
import { useWalletContext } from '../../contexts/WalletContext';
import { NFTMetadata } from '../../types/wallet';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { InlineLoader } from '../ui/LoadingSpinner';

interface NFTInventoryProps {
  isOpen: boolean;
  onClose: () => void;
}

const NFTInventory: React.FC<NFTInventoryProps> = ({ isOpen, onClose }) => {
  const { nfts, wallet } = useWalletContext();
  const [selectedNFT, setSelectedNFT] = useState<NFTMetadata | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterRarity, setFilterRarity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Mock NFT data for demonstration
  const mockNFTs: NFTMetadata[] = [
    {
      mint: 'NFT1234567890',
      name: 'Legendary Sword of Fire',
      symbol: 'LSOF',
      description: 'A powerful legendary weapon that burns enemies with each strike. Forged in the depths of Mount Solana.',
      image: '/images/nfts/sword-fire.png',
      attributes: [
        { trait_type: 'Rarity', value: 'Legendary' },
        { trait_type: 'Attack Power', value: '+25' },
        { trait_type: 'Element', value: 'Fire' },
        { trait_type: 'Durability', value: '100/100' },
      ],
      collection: {
        name: 'Sol Duel Weapons',
        family: 'Sol Duel',
      },
    },
    {
      mint: 'NFT0987654321',
      name: 'Mystic Shield of Protection',
      symbol: 'MSOP',
      description: 'An ancient shield imbued with protective magic. Reduces incoming damage and provides magical resistance.',
      image: '/images/nfts/shield-mystic.png',
      attributes: [
        { trait_type: 'Rarity', value: 'Epic' },
        { trait_type: 'Defense Power', value: '+20' },
        { trait_type: 'Magic Resistance', value: '+15' },
        { trait_type: 'Durability', value: '85/100' },
      ],
      collection: {
        name: 'Sol Duel Armor',
        family: 'Sol Duel',
      },
    },
    {
      mint: 'NFT1122334455',
      name: 'Swift Boots of Agility',
      symbol: 'SBOA',
      description: 'Lightweight boots that enhance movement speed and agility in battle.',
      image: '/images/nfts/boots-swift.png',
      attributes: [
        { trait_type: 'Rarity', value: 'Rare' },
        { trait_type: 'Speed Bonus', value: '+10' },
        { trait_type: 'Agility', value: '+8' },
        { trait_type: 'Durability', value: '95/100' },
      ],
      collection: {
        name: 'Sol Duel Accessories',
        family: 'Sol Duel',
      },
    },
  ];

  const displayNFTs = mockNFTs; // In production, use actual NFTs: nfts.length > 0 ? nfts : mockNFTs;

  const filteredNFTs = displayNFTs.filter(nft => {
    const matchesSearch = nft.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         nft.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRarity = filterRarity === 'all' || 
                         nft.attributes.some(attr => 
                           attr.trait_type === 'Rarity' && 
                           attr.value.toLowerCase() === filterRarity.toLowerCase()
                         );

    return matchesSearch && matchesRarity;
  });

  const getRarityColor = (rarity: string) => {
    switch (rarity.toLowerCase()) {
      case 'legendary':
        return 'text-yellow-400 border-yellow-400';
      case 'epic':
        return 'text-purple-400 border-purple-400';
      case 'rare':
        return 'text-blue-400 border-blue-400';
      case 'common':
        return 'text-gray-400 border-gray-400';
      default:
        return 'text-game-muted border-game-border';
    }
  };

  const openNFTDetails = (nft: NFTMetadata) => {
    setSelectedNFT(nft);
  };

  const openExplorer = (mint: string) => {
    window.open(`https://explorer.solana.com/address/${mint}`, '_blank');
  };

  if (!wallet.connected) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="NFT Inventory" size="lg">
        <div className="text-center py-8">
          <Package className="h-16 w-16 text-game-muted mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-game-text mb-2">
            Wallet Not Connected
          </h3>
          <p className="text-game-muted">
            Connect your wallet to view your NFT collection
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="NFT Inventory" size="full">
        <div className="space-y-6">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-game-muted" />
              <input
                type="text"
                placeholder="Search NFTs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-game-bg border border-game-border rounded-lg text-game-text placeholder-game-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex gap-2">
              {/* Filter */}
              <select
                value={filterRarity}
                onChange={(e) => setFilterRarity(e.target.value)}
                className="px-3 py-2 bg-game-bg border border-game-border rounded-lg text-game-text focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Rarities</option>
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>

              {/* View Toggle */}
              <div className="flex border border-game-border rounded-lg overflow-hidden">
                <Button
                  onClick={() => setViewMode('grid')}
                  variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                  size="sm"
                  className="rounded-none px-3"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => setViewMode('list')}
                  variant={viewMode === 'list' ? 'primary' : 'ghost'}
                  size="sm"
                  className="rounded-none px-3 border-l border-game-border"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-game-bg/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-game-text font-gaming">
                {displayNFTs.length}
              </p>
              <p className="text-game-muted text-sm">Total NFTs</p>
            </div>
            <div className="bg-game-bg/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-game-text font-gaming">
                {displayNFTs.filter(nft => 
                  nft.attributes.some(attr => attr.trait_type === 'Rarity' && attr.value === 'Legendary')
                ).length}
              </p>
              <p className="text-game-muted text-sm">Legendary</p>
            </div>
            <div className="bg-game-bg/50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-game-text font-gaming">
                {new Set(displayNFTs.map(nft => nft.collection?.name)).size}
              </p>
              <p className="text-game-muted text-sm">Collections</p>
            </div>
          </div>

          {/* NFT Grid/List */}
          {isLoading ? (
            <InlineLoader message="Loading NFTs..." />
          ) : filteredNFTs.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-game-muted mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-game-text mb-2">
                {searchTerm || filterRarity !== 'all' ? 'No matching NFTs' : 'No NFTs Found'}
              </h3>
              <p className="text-game-muted">
                {searchTerm || filterRarity !== 'all' 
                  ? 'Try adjusting your search or filters'
                  : 'Your NFT collection will appear here'
                }
              </p>
            </div>
          ) : (
            <div className={
              viewMode === 'grid' 
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'space-y-3'
            }>
              {filteredNFTs.map((nft, index) => {
                const rarity = nft.attributes.find(attr => attr.trait_type === 'Rarity')?.value || 'Common';
                
                return (
                  <motion.div
                    key={nft.mint}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`
                      bg-game-surface border rounded-lg p-4 cursor-pointer transition-all duration-200
                      hover:border-primary-500/50 hover:shadow-lg
                      ${getRarityColor(rarity)}
                      ${viewMode === 'list' ? 'flex items-center gap-4' : ''}
                    `}
                    onClick={() => openNFTDetails(nft)}
                  >
                    {/* Image */}
                    <div className={`
                      bg-gradient-to-br from-game-accent/20 to-primary-500/20 rounded-lg flex items-center justify-center
                      ${viewMode === 'grid' ? 'aspect-square mb-4' : 'w-16 h-16 flex-shrink-0'}
                    `}>
                      <Package className={`${viewMode === 'grid' ? 'h-12 w-12' : 'h-8 w-8'} text-game-muted`} />
                    </div>

                    <div className={viewMode === 'list' ? 'flex-1' : ''}>
                      {/* Name and Rarity */}
                      <div className="mb-2">
                        <h4 className="font-semibold text-game-text text-sm mb-1 line-clamp-1">
                          {nft.name}
                        </h4>
                        <div className="flex items-center gap-2">
                          <Star className={`h-3 w-3 ${getRarityColor(rarity).split(' ')[0]}`} />
                          <span className={`text-xs font-medium ${getRarityColor(rarity).split(' ')[0]}`}>
                            {rarity}
                          </span>
                        </div>
                      </div>

                      {/* Collection */}
                      {nft.collection && (
                        <p className="text-xs text-game-muted mb-2">
                          {nft.collection.name}
                        </p>
                      )}

                      {/* Key Attributes */}
                      <div className="space-y-1">
                        {nft.attributes.slice(1, viewMode === 'grid' ? 3 : 2).map((attr, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-game-muted">{attr.trait_type}:</span>
                            <span className="text-game-text">{attr.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {viewMode === 'list' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openExplorer(nft.mint);
                        }}
                        leftIcon={<ExternalLink className="h-3 w-3" />}
                      >
                        View
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* NFT Details Modal */}
      {selectedNFT && (
        <Modal
          isOpen={!!selectedNFT}
          onClose={() => setSelectedNFT(null)}
          title={selectedNFT.name}
          size="lg"
        >
          <div className="space-y-6">
            {/* Image and Basic Info */}
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-1/2">
                <div className="aspect-square bg-gradient-to-br from-game-accent/20 to-primary-500/20 rounded-lg flex items-center justify-center">
                  <Package className="h-20 w-20 text-game-muted" />
                </div>
              </div>
              
              <div className="md:w-1/2 space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-game-text font-gaming mb-2">
                    {selectedNFT.name}
                  </h3>
                  <p className="text-game-muted text-sm leading-relaxed">
                    {selectedNFT.description}
                  </p>
                </div>

                {selectedNFT.collection && (
                  <div>
                    <h4 className="text-sm font-semibold text-game-text mb-1">Collection</h4>
                    <p className="text-game-muted text-sm">{selectedNFT.collection.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Attributes */}
            <div>
              <h4 className="text-lg font-semibold text-game-text font-gaming mb-4">
                Attributes
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {selectedNFT.attributes.map((attr, index) => (
                  <div
                    key={index}
                    className="bg-game-bg/50 border border-game-border rounded-lg p-3 text-center"
                  >
                    <p className="text-game-muted text-xs mb-1">{attr.trait_type}</p>
                    <p className="text-game-text font-semibold">{attr.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => openExplorer(selectedNFT.mint)}
                variant="outline"
                leftIcon={<ExternalLink className="h-4 w-4" />}
                fullWidth
              >
                View on Explorer
              </Button>
              <Button
                onClick={() => setSelectedNFT(null)}
                variant="primary"
                fullWidth
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};

export default NFTInventory;