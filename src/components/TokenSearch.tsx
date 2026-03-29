import { useState, useEffect, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { getTokenMetadata, isValidSolanaAddress, isPumpFunToken } from '@/services/tokenMetadata';
import { useChain } from '@/contexts/ChainContext';

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface TokenSearchProps {
  onSelectToken: (token: Token) => void;
  selectedToken?: Token;
}

const JUPITER_TOKEN_SEARCH_API = 'https://lite-api.jup.ag/tokens/v2/search';

const SOLANA_TOKENS: Token[] = [
  { address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana', decimals: 9, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
  { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'USDT', decimals: 6, logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg' },
];

const EVM_TOKENS: Record<number, Token[]> = {
  // Ethereum
  1: [
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ethereum', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoURI: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether', decimals: 6, logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
    { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8, logoURI: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png' },
  ],
  // BNB Smart Chain
  56: [
    { address: '0x0000000000000000000000000000000000000000', symbol: 'BNB', name: 'BNB', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
    { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
    { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
    { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', name: 'Wrapped BNB', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png' },
  ],
  // Polygon
  137: [
    { address: '0x0000000000000000000000000000000000000000', symbol: 'MATIC', name: 'Polygon', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/4713/small/polygon.png' },
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoURI: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', name: 'Tether', decimals: 6, logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  ],
  // Base
  8453: [
    { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH', name: 'Ethereum', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoURI: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, logoURI: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png' },
  ],
};

export const TokenSearch = ({ onSelectToken, selectedToken }: TokenSearchProps) => {
  const { activeChain, evmChainId } = useChain();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const popularTokens = useMemo(() => {
    if (activeChain === 'evm' && evmChainId && EVM_TOKENS[evmChainId]) {
      return EVM_TOKENS[evmChainId];
    }
    return SOLANA_TOKENS;
  }, [activeChain, evmChainId]);

  const [searchResults, setSearchResults] = useState<Token[]>(popularTokens);

  useEffect(() => {
    setSearchResults(popularTokens);
  }, [popularTokens]);

  useEffect(() => {
    const searchTokens = async () => {
      if (searchQuery.length < 2) {
        setSearchResults(popularTokens);
        return;
      }

      setIsSearching(true);
      try {
        // Check if query looks like a Solana address (for direct lookup via all APIs)
        const isAddressQuery = isValidSolanaAddress(searchQuery);

        // For address queries, use the full metadata lookup (Jupiter -> Moralis -> On-chain)
        if (isAddressQuery) {
          console.log('Address detected, using full metadata lookup:', searchQuery);
          const result = await getTokenMetadata(searchQuery);
          if (result.token) {
            console.log(`Token found via ${result.source}:`, result.token);
            setSearchResults([result.token]);
            setIsSearching(false);
            return;
          }
        }

        // For non-address queries, try Jupiter search API
        const response = await fetch(`${JUPITER_TOKEN_SEARCH_API}?query=${encodeURIComponent(searchQuery)}`);
        const data = await response.json();

        // Filter and validate results
        const validTokens = (data || []).filter((token: any) =>
          token?.id && token?.symbol && token?.name && token?.decimals !== undefined
        ).map((token: any) => ({
          address: token.id,
          symbol: token.symbol || 'UNK',
          name: token.name || 'Unknown',
          decimals: token.decimals,
          logoURI: token.icon
        }));

        setSearchResults(validTokens.length > 0 ? validTokens : popularTokens);
      } catch (error) {
        console.error('Error searching tokens:', error);
        
        // On error, if query looks like an address, try full metadata lookup as fallback
        if (isValidSolanaAddress(searchQuery)) {
          console.log('Search error, trying full metadata lookup for:', searchQuery);
          const result = await getTokenMetadata(searchQuery);
          if (result.token) {
            setSearchResults([result.token]);
            setIsSearching(false);
            return;
          }
        }
        
        setSearchResults(popularTokens);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchTokens, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSelectToken = (token: Token) => {
    onSelectToken(token);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 glass-card rounded-xl hover:bg-muted/50 transition-all hover:scale-[1.02] shrink-0"
      >
        {selectedToken ? (
          <>
            {selectedToken.logoURI ? (
              <img src={selectedToken.logoURI} alt={selectedToken.symbol} className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-xs font-bold">
                {selectedToken.symbol?.slice(0, 2) || '?'}
              </div>
            )}
            <span className="font-semibold">{selectedToken.symbol}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Select token</span>
        )}
        <ChevronDown className="w-4 h-4 ml-1" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="glass-card border-white/10 max-w-md">
          <DialogHeader>
            <DialogTitle>Select a token</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, symbol, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 glass-card border-white/10"
              />
            </div>

            <ScrollArea className="h-[400px] pr-4">
              {isSearching ? (
                <div className="p-4 text-center text-muted-foreground">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No tokens found</div>
              ) : (
                <div className="space-y-1">
                  {searchQuery.length === 0 && (
                    <div className="text-xs text-muted-foreground font-semibold mb-2 px-2">Popular tokens</div>
                  )}
                  {searchResults.map((token) => (
                    <button
                      key={token.address}
                      onClick={() => handleSelectToken(token)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 rounded-xl transition-all hover:scale-[1.01]"
                    >
                      {token.logoURI ? (
                        <img
                          src={token.logoURI}
                          alt={token.symbol}
                          className="w-10 h-10 rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div
                        className={`w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold ${token.logoURI ? 'hidden' : ''}`}
                      >
                        {token.symbol?.slice(0, 2) || '?'}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-semibold">{token.symbol}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{token.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
