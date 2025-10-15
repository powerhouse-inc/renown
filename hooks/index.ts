import { BrowserProvider, JsonRpcSigner } from "ethers";
import React from "react";
import { useWalletClient } from "wagmi";
import type { WalletClient } from "viem";

export { useRenownSwitchboard } from "./renown-switchboard";
export { useAuth } from "./auth";

export function walletClientToProvider(walletClient: WalletClient) {
  const { chain, transport } = walletClient;
  if (!chain) {
    throw new Error("Chain not available");
  }
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  const provider = new BrowserProvider(transport, network);
  return provider;
}

/** Hook to convert a viem Wallet Client to an ethers.js Signer. */
export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
  const { data: walletClient } = useWalletClient({ chainId });
  console.log("walletClient", walletClient);
  return React.useMemo(
    () => (walletClient ? walletClientToProvider(walletClient) : undefined),
    [walletClient]
  );
}

export function walletClientToSigner(walletClient: WalletClient) {
  const { account } = walletClient;
  if (!account) {
    throw new Error("Account not available");
  }

  const provider = walletClientToProvider(walletClient);
  const signer = new JsonRpcSigner(provider, account.address);
  return signer;
}

/** Hook to convert a viem Wallet Client to an ethers.js Signer. */
export function useEthersSigner({ chainId }: { chainId?: number } = {}) {
  const { data: walletClient } = useWalletClient({ chainId });
  return React.useMemo(
    () => (walletClient ? walletClientToSigner(walletClient) : undefined),
    [walletClient]
  );
}
