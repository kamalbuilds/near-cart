import base64, json, time, urllib.request

RPC = "https://rpc.mainnet.near.org"

def view(path, domain=1):
    args = base64.b64encode(json.dumps({"path": path, "predecessor": "example.near", "domain_id": domain}).encode()).decode()
    body = json.dumps({"jsonrpc": "2.0", "id": "cart-spike", "method": "query", "params": {"request_type": "call_function", "account_id": "v1.signer", "method_name": "derived_public_key", "args_base64": args, "finality": "final"}}).encode()
    started = time.perf_counter()
    with urllib.request.urlopen(urllib.request.Request(RPC, body, {"Content-Type": "application/json"}), timeout=20) as response:
        result = json.load(response)
    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    if "error" in result:
        return result["error"], elapsed_ms
    view_result = result["result"]
    if "error" in view_result:
        return view_result["error"], elapsed_ms
    return json.loads(bytes(view_result["result"]).decode()), elapsed_ms

def b58decode(value):
    alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    number = 0
    for char in value:
        number = number * 58 + alphabet.index(char)
    raw = number.to_bytes((number.bit_length() + 7) // 8, "big")
    return b"\0" * (len(value) - len(value.lstrip("1"))) + raw

first, t1 = view("solana-1")
second, t2 = view("solana-1")
other, t3 = view("solana-2")
invalid, t4 = view("solana-1", 99)
assert first == second, "same account/path/domain was not deterministic"
assert first != other, "changing derivation path did not change key"
assert first.startswith("ed25519:") and len(b58decode(first.split(":", 1)[1])) == 32, "not a 32-byte Ed25519 public key"
assert "No such domain." in invalid, f"unsupported domain was not rejected: {invalid}"
print(json.dumps({"network": "NEAR mainnet", "rpc": RPC, "signer": "v1.signer", "account": "example.near (public test vector)", "path": "solana-1", "domain_id": 1, "derived": first, "key_bytes": len(b58decode(first.split(":", 1)[1])), "repeat_equal": first == second, "alternate_path": other, "alternate_path_differs": first != other, "unsupported_domain_99": invalid, "latency_ms": [t1, t2, t3, t4]}, indent=2))
