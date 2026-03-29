import { useChain } from '@/contexts/ChainContext';

/**
 * Returns chain-aware display strings based on the currently active chain.
 * Use this across all pages to show the correct chain/token names.
 */
export function useChainInfo() {
  const { activeChain, getEVMChain } = useChain();

  if (activeChain === 'evm') {
    const evmChain = getEVMChain();
    return {
      chainName: evmChain?.name || 'EVM',
      nativeToken: evmChain?.nativeToken || 'ETH',
      shortName: evmChain?.shortName || 'EVM',
      blockExplorer: evmChain?.blockExplorer || 'https://etherscan.io',
      isEVM: true,
      isSolana: false,
    };
  }

  return {
    chainName: 'Solana',
    nativeToken: 'SOL',
    shortName: 'SOL',
    blockExplorer: 'https://solscan.io',
    isEVM: false,
    isSolana: true,
  };
}
