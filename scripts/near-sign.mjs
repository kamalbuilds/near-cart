import { DERIVATION_PATH, DOMAIN_ED25519 } from './cart-core.mjs';

export const MPC_SIGNER = 'v1.signer';

export function signRequestArgs(message) {
  const payload = Uint8Array.from(message);
  if (!payload.length) throw new Error('Solana message is empty');
  return {
    request: {
      path: DERIVATION_PATH,
      domain_id: DOMAIN_ED25519,
      payload_v2: { Eddsa: Array.from(payload, (byte) => byte.toString(16).padStart(2, '0')).join('') },
    },
  };
}

export async function requestNearSignature(wallet, accountId, message) {
  const result = await wallet.signAndSendTransaction({
    signerId: accountId,
    receiverId: MPC_SIGNER,
    actions: [{
      type: 'FunctionCall',
      params: {
        methodName: 'sign',
        args: signRequestArgs(message),
        gas: '30000000000000',
        deposit: '1',
      },
    }],
  });
  return readNearSignature(result);
}

export function readNearSignature(execution) {
  const outcomes = [
    execution?.transaction_outcome?.outcome,
    ...(execution?.receipts_outcome ?? []).map((receipt) => receipt.outcome),
  ];
  for (const outcome of outcomes) {
    const value = outcome?.status?.SuccessValue;
    if (!value) continue;
    try {
      const response = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), (byte) => byte.charCodeAt(0))));
      if (response.scheme === 'Ed25519' && Array.isArray(response.signature) && response.signature.length === 64) {
        return Uint8Array.from(response.signature);
      }
    } catch {
      continue;
    }
  }
  throw new Error('NEAR signer transaction did not return an Ed25519 signature');
}
