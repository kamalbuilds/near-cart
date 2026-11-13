const API = 'https://1click.chaindefuser.com/v0';
export const SOL_ASSET_ID = 'nep141:sol.omft.near';
export const SOLANA_USDC_ASSET_ID = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOL_FEE_RESERVE = '5000000';

export async function getSupportedTokens(fetchImpl = fetch) {
  const response = await fetchImpl(`${API}/tokens`);
  const tokens = await response.json();
  if (!response.ok || !Array.isArray(tokens) || tokens.length === 0) throw new Error(`1Click tokens request failed (HTTP ${response.status})`);
  return tokens;
}

export async function quoteExactOutput({ originAsset, destinationAsset, amount, recipient, refundTo }, fetchImpl = fetch) {
  if (!originAsset || !destinationAsset || !recipient || !refundTo || !/^[1-9]\d*$/.test(String(amount))) throw new Error('1Click exact-output quote parameters are incomplete');
  const tokens = await getSupportedTokens(fetchImpl);
  if (!tokens.some((token) => token.assetId === originAsset)) throw new Error('Selected input asset is not currently supported by 1Click');
  const target = tokens.find((token) => token.assetId === destinationAsset);
  if (!target) throw new Error('Selected output asset is not currently supported by 1Click');
  if (destinationAsset === SOLANA_USDC_ASSET_ID && target.contractAddress !== SOLANA_USDC_MINT) throw new Error('1Click Solana USDC mint does not match SP3ND');

  const response = await fetchImpl(`${API}/quote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dry: false,
      swapType: 'EXACT_OUTPUT',
      slippageTolerance: 100,
      originAsset,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset,
      amount: String(amount),
      recipient,
      recipientType: 'DESTINATION_CHAIN',
      refundTo,
      refundType: 'INTENTS',
      deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`1Click quote failed (HTTP ${response.status}): ${result.message ?? 'request rejected'}`);
  if (String(result.quote?.amountOut) !== String(amount) || !result.quote?.depositAddress || !result.quote?.amountIn || !result.quote?.minAmountIn) {
    throw new Error('1Click did not return the exact output and deposit instructions requested');
  }
  return result;
}

export async function waitForSwap(depositAddress, depositMemo, { timeoutMs = 20 * 60_000, intervalMs = 5_000, fetchImpl = fetch } = {}) {
  if (!depositAddress) throw new Error('1Click deposit address is required');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = new URLSearchParams({ depositAddress });
    if (depositMemo) query.set('depositMemo', depositMemo);
    const response = await fetchImpl(`${API}/status?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(`1Click status failed (HTTP ${response.status})`);
    const status = String(result.status ?? '').toLowerCase();
    if (status === 'success') return result;
    if (['refunded', 'failed', 'expired'].includes(status)) throw new Error(`1Click swap ended with ${result.status}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('1Click swap did not settle before the 20 minute timeout');
}
