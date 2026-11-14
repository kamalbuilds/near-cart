import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, KeyPair } from 'near-api-js';
import bs58 from 'bs58';
import { DERIVATION_PATH, DOMAIN_ED25519 } from './cart-core.mjs';
import { signRequestArgs, readNearSignature } from './near-sign.mjs';

export const NETWORKS = {
  testnet: {
    signer: 'v1.signer-prod.testnet',
    rpcs: ['https://near-testnet.drpc.org', 'https://test.rpc.fastnear.com'],
  },
  mainnet: {
    signer: 'v1.signer',
    rpcs: ['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org'],
  },
};

function provider(network) {
  return new FailoverRpcProvider(NETWORKS[network].rpcs.map((url) => new JsonRpcProvider({ url })));
}

function loadAccount(network, accountId) {
  const file = join(homedir(), '.near-credentials', network, `${accountId}.json`);
  const key = JSON.parse(readFileSync(file, 'utf8')).private_key;
  return new Account(accountId, provider(network), new KeyPairSigner(KeyPair.fromString(key)));
}

export async function derivedSolanaAddress(network, accountId) {
  const response = await withRetry(() => provider(network).callFunction({
    contractId: NETWORKS[network].signer,
    method: 'derived_public_key',
    args: { path: DERIVATION_PATH, predecessor: accountId, domain_id: DOMAIN_ED25519 },
  }));
  const key = String(response);
  if (!key.startsWith('ed25519:')) throw new Error('Signer did not return an Ed25519 key');
  return key.slice('ed25519:'.length);
}

async function withRetry(run, attempts = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const text = `${error?.message ?? ''} ${error?.cause ?? ''} ${(error?.errors ?? []).join(' ')}`;
      if (attempt >= attempts || !/429|Rate limit|Exceeded \d+ providers/.test(text)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
    }
  }
}

const EXECUTED = ['EXECUTED_OPTIMISTIC', 'EXECUTED', 'FINAL'];

// Broadcast once, then poll the transaction until its receipts have run. The MPC signature comes back in a
// later receipt; waiting on the broadcast call itself holds the RPC connection for over a minute on testnet.
export async function signWithNearAccount({ network = 'testnet', accountId, message, timeoutMs = 60_000 }) {
  const account = loadAccount(network, accountId);
  const rpc = provider(network);
  const sent = await withRetry(() => account.callFunctionRaw({
    contractId: NETWORKS[network].signer,
    methodName: 'sign',
    args: signRequestArgs(message),
    gas: 300000000000000n,
    deposit: 1n,
    waitUntil: 'INCLUDED',
  }));
  const txHash = sent.transaction.hash;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const status = await rpc.viewTransactionStatus({ txHash, accountId, waitUntil: 'EXECUTED_OPTIMISTIC' });
      if (EXECUTED.includes(status.final_execution_status)) return { signature: readNearSignature(status), txHash };
    } catch (error) {
      if (/did not return an Ed25519 signature/.test(error.message)) throw error;
    }
    if (Date.now() > deadline) throw new Error(`NEAR signer transaction ${txHash} did not finish within ${timeoutMs / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

export { bs58 };
