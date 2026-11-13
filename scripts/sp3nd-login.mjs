import { derivedSolanaAddress, signWithNearAccount } from './chain-sig.mjs';
import { loginWithSigner, validSession } from './sp3nd.mjs';

export const NETWORK = process.env.CART_NEAR_NETWORK ?? 'testnet';
export const ACCOUNT = process.env.CART_NEAR_ACCOUNT ?? 'cart-spike-1313-kamal.testnet';

export async function ensureSession() {
  const existing = await validSession();
  if (existing) return existing;
  const walletAddress = await derivedSolanaAddress(NETWORK, ACCOUNT);
  return loginWithSigner({
    walletAddress,
    sign: async (message) => {
      const { signature, txHash } = await signWithNearAccount({ network: NETWORK, accountId: ACCOUNT, message });
      console.error(`chain-signatures login signature tx ${txHash}`);
      return signature;
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const session = await ensureSession();
  console.log(JSON.stringify({ wallet_address: session.wallet_address, expires_at: session.expires_at }));
}
