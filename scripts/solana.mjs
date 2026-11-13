import { Connection, PublicKey } from '@solana/web3.js';
import { USDC_MINT } from './cart-core.mjs';

const RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'];

export async function solanaBalances(address) {
  let lastError;
  for (const url of RPCS) {
    try {
      const connection = new Connection(url, 'confirmed');
      const owner = new PublicKey(address);
      const lamports = BigInt(await connection.getBalance(owner));
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: USDC_MINT });
      const usdc = accounts.value.reduce((sum, account) => sum + BigInt(account.account.data.parsed.info.tokenAmount.amount), 0n);
      return { lamports, usdc, connection };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
