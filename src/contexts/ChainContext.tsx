import { createContext, useContext, useState, ReactNode, FC } from 'react';

export type ActiveChain = 'solana' | 'evm';

export interface EVMChainConfig {
  chainId: number;
  chainIdHex: string;
  name: string;
  shortName: string;
  nativeToken: string;
  rpcUrl: string;
  blockExplorer: string;
  icon: string;
}

export const EVM_CHAINS: EVMChainConfig[] = [
  {
    chainId: 1,
    chainIdHex: '0x1',
    name: 'Ethereum',
    shortName: 'ETH',
    nativeToken: 'ETH',
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorer: 'https://etherscan.io',
    icon: 'ethereum',
  },
  {
    chainId: 56,
    chainIdHex: '0x38',
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    nativeToken: 'BNB',
    rpcUrl: 'https://bsc-dataseed1.binance.org',
    blockExplorer: 'https://bscscan.com',
    icon: 'bnb',
  },
  {
    chainId: 137,
    chainIdHex: '0x89',
    name: 'Polygon',
    shortName: 'MATIC',
    nativeToken: 'MATIC',
    rpcUrl: 'https://polygon-rpc.com',
    blockExplorer: 'https://polygonscan.com',
    icon: 'polygon',
  },
  {
    chainId: 8453,
    chainIdHex: '0x2105',
    name: 'Base',
    shortName: 'BASE',
    nativeToken: 'ETH',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    icon: 'base',
  },
];

interface ChainContextType {
  activeChain: ActiveChain;
  setActiveChain: (chain: ActiveChain) => void;
  evmChainId: number | null;
  setEvmChainId: (chainId: number | null) => void;
  getEVMChain: () => EVMChainConfig | undefined;
}

const ChainContext = createContext<ChainContextType | undefined>(undefined);

export const ChainProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeChain, setActiveChain] = useState<ActiveChain>('solana');
  const [evmChainId, setEvmChainId] = useState<number | null>(null);

  const getEVMChain = () => EVM_CHAINS.find(c => c.chainId === evmChainId);

  return (
    <ChainContext.Provider value={{ activeChain, setActiveChain, evmChainId, setEvmChainId, getEVMChain }}>
      {children}
    </ChainContext.Provider>
  );
};

export const useChain = () => {
  const ctx = useContext(ChainContext);
  if (!ctx) throw new Error('useChain must be used within ChainProvider');
  return ctx;
};
