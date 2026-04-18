import { useState, useEffect, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { SwapInterface } from '@/components/SwapInterface';
import { PegasusAnimation } from '@/components/PegasusAnimation';
import { motion } from 'framer-motion';
import { TrendingUp, Rocket, ArrowLeft, ExternalLink, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewTokensList } from '@/components/NewTokensList';
import { fetchTokenInfo, DexScreenerTokenInfo } from '@/services/dexScreener';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LaunchTokenModal } from '@/components/LaunchTokenModal';
import { useWallet } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { Link } from 'react-router-dom';
import { useChainInfo } from '@/hooks/useChainInfo';

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string; logoURI?: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  priceChange?: { h24: number };
  volume?: { h24: number };
  liquidity?: { usd: number };
  fdv: number;
  marketCap: number;
  info?: { imageUrl?: string };
}

const TOKENS_PER_PAGE = 30;
const MAX_TOKENS = 300;

const Dex = () => {
  const { chainName } = useChainInfo();
  const defaultFromToken: Token = {
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL', name: 'Solana', decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
  };
  const defaultToToken: Token = {
    address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC', name: 'USD Coin', decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png'
  };

  const [dexScreenerToken, setDexScreenerToken] = useState('So11111111111111111111111111111111111111112');
  const [currentPairAddress, setCurrentPairAddress] = useState<string | null>(null);
  const [selectedTokenInfo, setSelectedTokenInfo] = useState<DexScreenerTokenInfo | null>(null);
  const [isDetailView, setIsDetailView] = useState(false);
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const { publicKey, sendTransaction } = useWallet();

  // Paginated token list
  const [allTokens, setAllTokens] = useState<DexPair[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);

  const totalPages = Math.min(10, Math.ceil(allTokens.length / TOKENS_PER_PAGE));
  const paginatedTokens = allTokens.slice((currentPage - 1) * TOKENS_PER_PAGE, currentPage * TOKENS_PER_PAGE);

  // Fetch tokens for the list (same sources as Ads page)
  const fetchTokenList = useCallback(async () => {
    try {
      const sources = [
        'https://api.dexscreener.com/token-profiles/latest/v1',
        'https://api.dexscreener.com/token-boosts/latest/v1',
        'https://api.dexscreener.com/token-boosts/top/v1'
      ];
      const responses = await Promise.allSettled(sources.map(url => fetch(url).then(r => r.json())));
      const candidateAddresses = new Set<string>();
      responses.forEach(result => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          result.value.forEach((item: any) => { if (item?.tokenAddress) candidateAddresses.add(item.tokenAddress); });
        }
      });
      if (candidateAddresses.size === 0) { setIsLoadingTokens(false); return; }

      const addresses = Array.from(candidateAddresses).slice(0, MAX_TOKENS);
      const chunks: string[][] = [];
      for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));

      const pairsResults = await Promise.all(
        chunks.map(chunk =>
          fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`)
            .then(r => r.json()).then(d => (d?.pairs || []) as DexPair[]).catch(() => [] as DexPair[])
        )
      );
      const allPairs = pairsResults.flat().filter(Boolean);

      // Deduplicate by base token address
      const uniqueMap = new Map<string, DexPair>();
      allPairs.forEach(p => {
        if (!p?.baseToken?.address) return;
        const addr = p.baseToken.address;
        const curLiq = p.liquidity?.usd || 0;
        const existLiq = uniqueMap.get(addr)?.liquidity?.usd || 0;
        if (!uniqueMap.has(addr) || curLiq > existLiq) uniqueMap.set(addr, p);
      });

      const processed = Array.from(uniqueMap.values());
      processed.sort((a, b) => (b.priceChange?.h24 || 0) - (a.priceChange?.h24 || 0));

      setAllTokens(prev => {
        // Merge new tokens, keeping max 300
        const existingAddrs = new Set(prev.map(t => t.baseToken.address));
        const newTokens = processed.filter(p => !existingAddrs.has(p.baseToken.address));
        const updated = prev.map(t => {
          const fresh = processed.find(p => p.baseToken.address === t.baseToken.address);
          return fresh || t;
        });
        const combined = [...newTokens, ...updated];
        combined.sort((a, b) => (b.priceChange?.h24 || 0) - (a.priceChange?.h24 || 0));
        return combined.slice(0, MAX_TOKENS);
      });
      setIsLoadingTokens(false);
    } catch (err) {
      console.error('Error fetching token list:', err);
      setIsLoadingTokens(false);
    }
  }, []);

  useEffect(() => {
    fetchTokenList();
    const interval = setInterval(fetchTokenList, 60000);
    return () => clearInterval(interval);
  }, [fetchTokenList]);

  useEffect(() => {
    const updatePairAddress = async () => {
      if (!dexScreenerToken) return;
      try {
        const info = await fetchTokenInfo(dexScreenerToken);
        if (info && info.pairAddress) setCurrentPairAddress(info.pairAddress);
        else setCurrentPairAddress(null);
      } catch (e) { console.error("Failed to fetch pair", e); }
    };
    updatePairAddress();
  }, [dexScreenerToken]);

  const handleFromTokenChange = (token: Token) => setDexScreenerToken(token.address);

  const handleTokenSelect = async (tokenAddress: string) => {
    setDexScreenerToken(tokenAddress);
    setIsDetailView(true);
    const info = await fetchTokenInfo(tokenAddress);
    if (info) setSelectedTokenInfo(info);
  };

  const handleBack = () => {
    setIsDetailView(false);
    setSelectedTokenInfo(null);
    setDexScreenerToken(defaultFromToken.address);
  };

  return (
    <div className="min-h-screen bg-transparent text-white selection:bg-primary/30">
      <Navigation />
      <PegasusAnimation />

      <main className="container mx-auto px-4 pt-24 pb-12 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-3">
            <div className="p-1 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-white/10">
              <AnimatedLogo className="w-12 h-12" />
            </div>
          </div>
          <motion.div
            animate={{ y: [0, -5, 0], boxShadow: ["0 4px 6px -1px rgba(0,0,0,0.1)", "0 10px 15px -3px rgba(124,58,237,0.3)", "0 4px 6px -1px rgba(0,0,0,0.1)"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Button size="lg" className="bg-gradient-to-r from-primary to-purple-600 hover:from-primary/80 hover:to-purple-600/80 gap-2" onClick={() => setIsLaunchModalOpen(true)}>
              <Rocket className="w-5 h-5 animate-pulse" /> Launch Pad
            </Button>
          </motion.div>
        </div>

        {/* Token Detail View or Main Swap */}
        {isDetailView && selectedTokenInfo ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={handleBack} className="hover:bg-white/10"><ArrowLeft className="w-5 h-5" /></Button>
              <div className="flex items-center gap-3">
                {selectedTokenInfo.baseToken.logoURI && <img src={selectedTokenInfo.baseToken.logoURI} alt={selectedTokenInfo.baseToken.name} className="w-8 h-8 rounded-full" />}
                <div>
                  <h2 className="text-xl font-bold">{selectedTokenInfo.baseToken.name}</h2>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{selectedTokenInfo.baseToken.symbol}</span>
                    <Badge variant="outline" className="text-xs border-primary/20 text-primary">{selectedTokenInfo.priceChange.h24}% (24h)</Badge>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card className="glass-card h-[500px] border-white/10 overflow-hidden">
                  <iframe src={`https://dexscreener.com/solana/${selectedTokenInfo.pairAddress}?embed=1&theme=dark`} width="100%" height="100%" frameBorder="0" />
                </Card>
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="glass-card border-white/10"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Liquidity</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">${selectedTokenInfo.liquidity.usd.toLocaleString()}</div></CardContent></Card>
                  <Card className="glass-card border-white/10"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Market Cap</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">${selectedTokenInfo.fdv.toLocaleString()}</div></CardContent></Card>
                  <Card className="glass-card border-white/10"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Volume (24h)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">${selectedTokenInfo.volume.h24.toLocaleString()}</div></CardContent></Card>
                </div>
              </div>
              <div className="lg:col-span-1">
                <div className="sticky top-24">
                  <SwapInterface defaultFromToken={defaultFromToken} defaultToToken={{ address: selectedTokenInfo.baseToken.address, symbol: selectedTokenInfo.baseToken.symbol, name: selectedTokenInfo.baseToken.name, decimals: 9, logoURI: selectedTokenInfo.baseToken.logoURI }} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-12">
            {/* Swap + Chart */}
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              <div className="flex justify-center">
                <SwapInterface defaultFromToken={defaultFromToken} defaultToToken={defaultToToken} onFromTokenChange={handleFromTokenChange} />
              </div>
              <div className="flex justify-center w-full h-[600px]">
                {currentPairAddress ? (
                  <Card className="glass-card w-full h-full border-white/10 overflow-hidden">
                    <iframe src={`https://dexscreener.com/solana/${currentPairAddress}?embed=1&theme=dark`} width="100%" height="100%" frameBorder="0" />
                  </Card>
                ) : (
                  <div className="flex items-center justify-center w-full h-full text-muted-foreground glass-card border-white/10 rounded-xl">Loading chart...</div>
                )}
              </div>
            </div>

            {/* Paginated Token List */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="glass-card border-white/10">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" /> Trending Tokens
                    </CardTitle>
                    <span className="text-sm text-muted-foreground">{allTokens.length} tokens · Page {currentPage}/{totalPages || 1}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingTokens ? (
                    <div className="text-center py-12 text-muted-foreground">Loading tokens...</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/10 text-muted-foreground">
                              <th className="text-left p-3">#</th>
                              <th className="text-left p-3">Token</th>
                              <th className="text-right p-3">Price</th>
                              <th className="text-right p-3">24h %</th>
                              <th className="text-right p-3 hidden md:table-cell">Volume (24h)</th>
                              <th className="text-right p-3 hidden md:table-cell">Liquidity</th>
                              <th className="text-right p-3 hidden lg:table-cell">Market Cap</th>
                              <th className="text-right p-3">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedTokens.map((token, i) => {
                              const rank = (currentPage - 1) * TOKENS_PER_PAGE + i + 1;
                              const change = token.priceChange?.h24 || 0;
                              return (
                                <tr key={token.baseToken.address + token.pairAddress} className="border-b border-white/5 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => handleTokenSelect(token.baseToken.address)}>
                                  <td className="p-3 text-muted-foreground">{rank}</td>
                                  <td className="p-3">
                                    <div className="flex items-center gap-2">
                                      {token.info?.imageUrl && <img src={token.info.imageUrl} alt="" className="w-6 h-6 rounded-full" />}
                                      <div>
                                        <div className="font-medium">{token.baseToken.name}</div>
                                        <div className="text-xs text-muted-foreground">{token.baseToken.symbol}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-3 text-right font-mono">${Number(token.priceUsd).toFixed(6)}</td>
                                  <td className={`p-3 text-right font-mono ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</td>
                                  <td className="p-3 text-right font-mono hidden md:table-cell">${(token.volume?.h24 || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                  <td className="p-3 text-right font-mono hidden md:table-cell">${(token.liquidity?.usd || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                  <td className="p-3 text-right font-mono hidden lg:table-cell">${(token.marketCap || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                  <td className="p-3 text-right">
                                    <Button size="sm" variant="outline" className="border-primary/30 hover:bg-primary/20 text-xs">Trade</Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-6">
                          <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="border-white/10">
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <Button key={page} variant={page === currentPage ? 'default' : 'outline'} size="sm"
                              className={page === currentPage ? 'bg-primary' : 'border-white/10'}
                              onClick={() => setCurrentPage(page)}>
                              {page}
                            </Button>
                          ))}
                          <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="border-white/10">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        )}

        {/* Footer */}
        <motion.footer initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-12 text-center text-xs sm:text-sm text-muted-foreground">
          <p>Built with ⚡ on {chainName}</p>
          <Link to="/why-pegasus" className="text-primary hover:underline mt-1 inline-block">Why Pegswap?</Link>
        </motion.footer>
      </main>

      <LaunchTokenModal isOpen={isLaunchModalOpen} onClose={() => setIsLaunchModalOpen(false)} />
    </div>
  );
};

export default Dex;
