import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = 'https://happy-dragon-88.authkit.app';
const SITE = 'https://www.sp3nd.shop';
const MCP_URL = 'https://mcp.sp3nd.shop/mcp';
const REDIRECT = 'http://127.0.0.1:8976/callback';
const CLIENT_FILE = join(ROOT, '.sp3nd-client.json');
const SESSION_FILE = join(ROOT, '.sp3nd-session.json');

const b64url = (buffer) => buffer.toString('base64url');

function writePrivate(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(file, 0o600);
}

async function registerClient() {
  if (existsSync(CLIENT_FILE)) {
    const saved = JSON.parse(readFileSync(CLIENT_FILE, 'utf8'));
    if (saved.client_id && saved.redirect_uris?.includes(REDIRECT) && saved.grant_types?.includes('authorization_code')) return saved.client_id;
  }
  const response = await fetch(`${AUTH}/oauth2/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Cart for NEAR',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
    }),
  });
  const client = await response.json();
  if (!response.ok || !client.client_id) throw new Error(`SP3ND client registration failed (HTTP ${response.status})`);
  writePrivate(CLIENT_FILE, client);
  return client.client_id;
}

function cookieFrom(response, jar) {
  for (const line of response.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';');
    const index = pair.indexOf('=');
    jar[pair.slice(0, index)] = pair.slice(index + 1);
  }
}
const cookieHeader = (jar) => Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');

async function hop(url, jar, init = {}) {
  const response = await fetch(url, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: cookieHeader(jar) } });
  cookieFrom(response, jar);
  return response;
}

const unescapeFlight = (text) => text.replace(/\\"/g, '"');

async function approveConsent(pageUrl, html, jar) {
  const flight = unescapeFlight(html);
  const ref = /"action":"\$h(\d+)"/.exec(flight);
  const actionId = ref && new RegExp(`[^0-9]${ref[1]}:\\{"id":"([0-9a-f]+)"`).exec(flight)?.[1];
  if (!actionId) throw new Error('SP3ND consent page carried no approve action');
  const field = (name) => new RegExp(`name="${name}" value="([^"]*)"`).exec(html)?.[1];
  const entries = [];
  for (const name of ['redirect_uri', 'authorization_session_id', 'state', 'client_id', 'pending_authentication_token', 'claim_urn:sp3nd:wallet_address']) {
    const value = field(name);
    if (value) entries.push([name, value]);
  }
  entries.push(['intent', 'approve']);
  const body = new FormData();
  for (const [name, value] of entries) body.append(`_1_${name}`, value);
  body.append('0', '["$K1"]');
  const response = await hop(pageUrl, jar, { method: 'POST', body, headers: { 'next-action': actionId, accept: 'text/x-component' } });
  const redirect = response.headers.get('x-action-redirect');
  if (redirect) return new URL(redirect.split(';')[0], pageUrl).toString();
  const result = /^1:(\{.*\})$/m.exec(await response.text());
  const parsed = result ? JSON.parse(result[1]) : null;
  if (!parsed?.ok) throw new Error(`SP3ND consent approval failed: ${parsed?.error?.message ?? `HTTP ${response.status}`}`);
  return parsed.value.url;
}

async function followToCallback(start, jar) {
  let url = start;
  for (let step = 0; step < 12; step += 1) {
    if (url.startsWith(REDIRECT)) return new URL(url);
    const response = await hop(url, jar);
    const location = response.headers.get('location');
    if (!location) {
      const at = new URL(url);
      if (response.status === 200 && at.pathname === '/application-authorization') {
        url = await approveConsent(url, await response.text(), jar);
        continue;
      }
      if (response.status === 200 && at.pathname === '/application-authorization/success') {
        const page = (await response.text()).replace(/\\"/g, '"').replace(/\\u0026/g, '&');
        const target = /"clientRedirect":"([^"]+)"/.exec(page)?.[1];
        if (!target) throw new Error('SP3ND consent success page carried no client redirect');
        url = target;
        continue;
      }
      throw new Error(`OAuth redirect chain stopped at HTTP ${response.status} on ${at.origin}${at.pathname}`);
    }
    url = new URL(location, url).toString();
  }
  throw new Error('OAuth redirect chain did not reach the client callback');
}

export async function loginWithSigner({ walletAddress, sign }) {
  const clientId = await registerClient();
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(12));
  const jar = {};
  const authorize = new URL(`${AUTH}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: REDIRECT, code_challenge: challenge,
    code_challenge_method: 'S256', scope: 'openid profile offline_access', resource: MCP_URL, state,
  }).toString();
  const first = await hop(authorize.toString(), jar);
  const login = first.headers.get('location');
  if (!login?.startsWith(`${SITE}/mcp/oauth/login`)) throw new Error('SP3ND authorization did not redirect to its wallet login');
  const entered = await hop(login, jar);
  if (entered.status !== 303) throw new Error(`SP3ND wallet login page returned HTTP ${entered.status}`);

  const post = async (path, body) => {
    const response = await hop(`${SITE}${path}`, jar, { method: 'POST', headers: { 'content-type': 'application/json', origin: SITE, referer: `${SITE}/mcp/oauth/authorize` }, body: JSON.stringify(body) });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`SP3ND ${path} failed (HTTP ${response.status}): ${json.error ?? 'rejected'}`);
    return json;
  };
  const challengeResponse = await post('/api/mcp/oauth/challenge', { wallet_address: walletAddress });
  if (typeof challengeResponse.message !== 'string' || challengeResponse.wallet_address !== walletAddress) throw new Error('SP3ND wallet challenge was incomplete');
  const signature = await sign(new TextEncoder().encode(challengeResponse.message));
  const complete = await post('/api/mcp/oauth/complete', { wallet_address: walletAddress, signature_base64: Buffer.from(signature).toString('base64') });
  if (typeof complete.redirect_uri !== 'string') throw new Error('SP3ND authorization response was incomplete');

  const callback = await followToCallback(complete.redirect_uri, jar);
  if (callback.searchParams.get('state') !== state) throw new Error('OAuth state mismatch');
  const code = callback.searchParams.get('code');
  if (!code) throw new Error(`OAuth callback carried no code: ${callback.searchParams.get('error') ?? 'unknown'}`);
  const tokenResponse = await fetch(`${AUTH}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: REDIRECT, code_verifier: verifier, resource: MCP_URL }),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error(`SP3ND token exchange failed (HTTP ${tokenResponse.status})`);
  const session = { ...token, client_id: clientId, wallet_address: walletAddress, expires_at: Math.floor(Date.now() / 1000) + (token.expires_in ?? 3600) };
  writePrivate(SESSION_FILE, session);
  return session;
}

export async function refreshSession(session) {
  if (!session.refresh_token) return null;
  const response = await fetch(`${AUTH}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refresh_token, client_id: session.client_id }),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) return null;
  const next = { ...session, ...token, expires_at: Math.floor(Date.now() / 1000) + (token.expires_in ?? 3600) };
  writePrivate(SESSION_FILE, next);
  return next;
}

export async function validSession() {
  if (!existsSync(SESSION_FILE)) return null;
  const session = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  return refreshSession(session);
}

let rpcId = 0;
async function rpc(session, method, params, mcpSession) {
  if (session.expires_at < Math.floor(Date.now() / 1000) + 30) {
    const next = await refreshSession(session);
    if (!next) throw new Error('SP3ND session expired and could not be refreshed; run scripts/sp3nd-login.mjs');
    Object.assign(session, next);
  }
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${session.access_token}`,
      ...(mcpSession ? { 'mcp-session-id': mcpSession } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SP3ND MCP ${method} failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
  const body = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).pop()
    : text;
  const message = JSON.parse(body);
  if (message.error) throw new Error(`SP3ND MCP ${method} error: ${message.error.message}`);
  return { result: message.result, sessionId: response.headers.get('mcp-session-id') ?? mcpSession };
}

export async function openMcp(session) {
  const init = await rpc(session, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'cart-for-near', version: '0.1.0' } });
  await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${session.access_token}`, ...(init.sessionId ? { 'mcp-session-id': init.sessionId } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  return {
    listTools: async () => (await rpc(session, 'tools/list', {}, init.sessionId)).result.tools,
    callTool: async (name, args) => (await rpc(session, 'tools/call', { name, arguments: args }, init.sessionId)).result,
  };
}
