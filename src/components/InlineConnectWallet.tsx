import { FC } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useChain } from '@/contexts/ChainContext';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { Wallet } from 'lucide-react';

/**
 * Inline connect-wallet prompt that disappears once a wallet is connected.
 * Drop this into any modal or page section that requires a connected wallet.
 */
export const InlineConnectWallet: FC<{ className?: string }> = ({ className = '' }) => {
  const { connected } = useWallet();
  const { activeChain } = useChain();
  const { isEVMConnected } = useEVMWallet();

  const isConnected = connected || (activeChain === 'evm' && isEVMConnected);
  if (isConnected) return null;

  return (
    <div className={`flex flex-col items-center gap-2 p-4 rounded-xl bg-primary/5 border border-primary/20 ${className}`}>
      <Wallet className="w-5 h-5 text-primary" />
      <p className="text-xs text-muted-foreground text-center">Connect your wallet to proceed</p>
      <ConnectWalletButton />
    </div>
  );
};