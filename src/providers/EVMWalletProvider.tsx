import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode, FC } from 'react';
import { ethers } from 'ethers';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useChain, EVM_CHAINS } from '@/contexts/ChainContext';

interface EVMWalletContextType {
  evmAddress: string | null;
  evmProvider: ethers.BrowserProvider | null;
  evmSigner: ethers.JsonRpcSigner | null;
  isEVMConnected: boolean;
  connectEVM: (chainId: number) => Promise<void>;
  disconnectEVM: () => void;
  switchChain: (chainId: number) => Promise<void>;
}

const EVMWalletContext = createContext<EVMWalletContextType | undefined>(undefined);

/**
 * Bypass Privy's switchChain and call the wallet directly via JSON-RPC.
 * This triggers the native MetaMask/Coinbase "Switch Network" popup.
 */
async function requestChainSwitch(
  ethereumProvider: ethers.Eip1193Provider,
  chainId: number
): Promise<void> {
  const chainConfig = EVM_CHAINS.find((c) => c.chainId === chainId);
  if (!chainConfig) throw new Error(`Unknown chain ID: ${chainId}`);

  try {
    await ethereumProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainConfig.chainIdHex }],
    });
  } catch (err: any) {
    // 4902 = chain not added to wallet yet
    if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
      await ethereumProvider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: chainConfig.chainIdHex,
            chainName: chainConfig.name,
            nativeCurrency: {
              name: chainConfig.nativeToken,
              symbol: chainConfig.nativeToken,
              decimals: 18,
            },
            rpcUrls: [chainConfig.rpcUrl],
            blockExplorerUrls: [chainConfig.blockExplorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

export const EVMWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [evmProvider, setEvmProvider] = useState<ethers.BrowserProvider | null>(null);
  const [evmSigner, setEvmSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const { setActiveChain, setEvmChainId } = useChain();
  const pendingChainId = useRef<number | null>(null);

  const { login, logout, authenticated, ready } = usePrivy();
  const { wallets } = useWallets();

  // Sync wallet state from the raw Ethereum provider
  const syncWalletState = useCallback(async (wallet: {
    address: string;
    getEthereumProvider: () => Promise<ethers.Eip1193Provider>;
  }) => {
    const ethereumProvider = await wallet.getEthereumProvider();
    const browserProvider = new ethers.BrowserProvider(ethereumProvider);
    const signer = await browserProvider.getSigner();
    const network = await browserProvider.getNetwork();

    setEvmAddress(wallet.address);
    setEvmProvider(browserProvider);
    setEvmSigner(signer);
    setEvmChainId(Number(network.chainId));
  }, [setEvmChainId]);

  // After Privy login completes, use direct RPC to switch to the pending chain
  useEffect(() => {
    const syncWallet = async () => {
      if (!ready || !authenticated || wallets.length === 0) return;

      const evmWallet = wallets.find((wallet) => wallet.walletClientType !== 'solana');
      if (!evmWallet) return;

      try {
        if (pendingChainId.current !== null) {
          const targetChain = pendingChainId.current;
          pendingChainId.current = null;

          try {
            // Direct RPC call — triggers the native wallet "Switch Network" popup
            const rawProvider = await evmWallet.getEthereumProvider();
            await requestChainSwitch(rawProvider, targetChain);

            const chainName = EVM_CHAINS.find((c) => c.chainId === targetChain)?.name || 'EVM';
          } catch (switchErr: any) {
            console.error('Failed to switch chain after login:', switchErr);
            // If user rejected, don't retry
            if (switchErr?.code !== 4001) {
              pendingChainId.current = targetChain;
            }
          }
        }

        // Sync state from whatever chain the wallet is actually on now
        await syncWalletState(evmWallet);
      } catch (err) {
        console.error('Failed to sync Privy wallet:', err);
      }
    };

    syncWallet();
  }, [ready, authenticated, wallets, syncWalletState]);

  const switchChain = useCallback(async (chainId: number) => {
    const evmWallet = wallets.find((wallet) => wallet.walletClientType !== 'solana');
    if (!evmWallet) throw new Error('No EVM wallet connected');

    try {
      const rawProvider = await evmWallet.getEthereumProvider();
      await requestChainSwitch(rawProvider, chainId);
      await syncWalletState(evmWallet);

      const chainName = EVM_CHAINS.find((c) => c.chainId === chainId)?.name || 'EVM';
    } catch (err: any) {
      console.error('Chain switch error:', err);
      throw err;
    }
  }, [wallets, syncWalletState]);

  const connectEVM = useCallback(async (chainId: number) => {
    try {
      setActiveChain('evm');
      pendingChainId.current = chainId;

      if (!authenticated) {
        login();
        return;
      }

      // Already authenticated — switch chain directly
      if (wallets.length > 0) {
        await switchChain(chainId);
        pendingChainId.current = null;
      }
    } catch (error: any) {
      console.error('EVM connection error:', error);
    }
  }, [authenticated, login, wallets, switchChain, setActiveChain]);

  const disconnectEVM = useCallback(() => {
    setEvmAddress(null);
    setEvmProvider(null);
    setEvmSigner(null);
    setActiveChain('solana');
    setEvmChainId(null);
    pendingChainId.current = null;

    if (authenticated) {
      logout();
    }
  }, [authenticated, logout, setActiveChain, setEvmChainId]);

  return (
    <EVMWalletContext.Provider value={{
      evmAddress,
      evmProvider,
      evmSigner,
      isEVMConnected: !!evmAddress,
      connectEVM,
      disconnectEVM,
      switchChain,
    }}>
      {children}
    </EVMWalletContext.Provider>
  );
};

export const useEVMWallet = () => {
  const ctx = useContext(EVMWalletContext);
  if (!ctx) throw new Error('useEVMWallet must be used within EVMWalletProvider');
  return ctx;
};
