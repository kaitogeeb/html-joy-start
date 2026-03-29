

# Detailed Analysis: Why EVM Chain Switching Fails

## Root Cause (3 problems working together)

### Problem 1: Privy iframe blocked in preview
The console shows: `"Privy iframe failed to load: Frame ancestor is not allowed"`. Privy uses an iframe for its internal communication, and the Lovable preview (which is itself an iframe) blocks nested iframes from Privy's domain. This causes Privy's `switchChain()` method to silently fail because it relies on that iframe.

### Problem 2: Privy's `switchChain()` doesn't trigger MetaMask's network prompt
Even on the live site, Privy's `wallet.switchChain(chainId)` goes through Privy's internal routing. For external wallets like MetaMask, this doesn't reliably trigger the native "Switch Network" popup that MetaMask shows. The call resolves without error, but MetaMask stays on Ethereum.

### Problem 3: `syncWalletState` reads whatever chain the wallet is actually on
After the failed `switchChain`, the code calls `syncWalletState(evmWallet)` which reads `browserProvider.getNetwork()`. Since the wallet never switched, it reports chain 1 (Ethereum), and the app stores Ethereum as the active chain — even though the user clicked BSC or Polygon.

## The Flow Today (broken)

```text
User clicks "BNB Smart Chain" → connectEVM(56)
  → sets pendingChainId = 56
  → calls Privy login() → Privy modal opens → user connects MetaMask
  → MetaMask connects on Ethereum (chain 1) by default
  → useEffect fires → sees pendingChainId = 56
  → calls evmWallet.switchChain(56) → SILENTLY FAILS (no MetaMask popup)
  → calls syncWalletState → reads chain 1 (Ethereum)
  → App thinks user is on Ethereum ✗
```

## The Fix

After Privy authentication succeeds and we have the wallet, bypass Privy's `switchChain` and instead call MetaMask/injected wallet directly using the standard `wallet_switchEthereumChain` JSON-RPC method. This is what triggers the actual "Switch to BNB Smart Chain?" popup in MetaMask. If the chain isn't configured in the wallet yet, fall back to `wallet_addEthereumChain` to add it.

### Changes (single file: `src/providers/EVMWalletProvider.tsx`)

1. **Add a `requestChainSwitch` helper** that gets the raw Ethereum provider from the Privy wallet via `wallet.getEthereumProvider()`, then calls `wallet_switchEthereumChain` with the hex chain ID directly. If the wallet throws a "chain not found" error (code 4902), call `wallet_addEthereumChain` with the full chain config (name, RPC URL, native currency, block explorer) from the `EVM_CHAINS` array.

2. **Replace `evmWallet.switchChain(targetChain)`** in both the `useEffect` (post-login) and the `switchChain` callback with the new `requestChainSwitch` helper.

3. **Re-sync after switch**: After the raw RPC call succeeds, re-create `BrowserProvider` and `Signer` from the same Ethereum provider to ensure the provider/signer reflect the new chain.

### Fixed flow

```text
User clicks "BNB Smart Chain" → connectEVM(56)
  → sets pendingChainId = 56
  → Privy login() → MetaMask connects (on Ethereum)
  → useEffect fires → sees pendingChainId = 56
  → gets raw provider via wallet.getEthereumProvider()
  → calls wallet_switchEthereumChain("0x38")
  → MetaMask shows "Switch to BNB Smart Chain?" popup ✓
  → user approves → wallet is now on BSC
  → syncWalletState reads chain 56 → app stores BSC ✓
```

### No other files change
The `EVMWalletContext` interface stays identical, so `SwapInterface`, `Charity`, `OTC`, `Ads`, `Refund`, and `evmTransactions.ts` all continue to work unchanged.

