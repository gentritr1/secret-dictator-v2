import json, socket, sys
from pathlib import Path
command = {'type': 'execute_code', 'params': {'code': Path(sys.argv[1]).read_text()}}
with socket.create_connection(('127.0.0.1', 9877), timeout=10) as s:
    s.settimeout(120)
    s.sendall(json.dumps(command).encode())
    data = b''
    while True:
        part = s.recv(1048576)
        if not part: raise RuntimeError('MCP disconnected')
        data += part
        try: result = json.loads(data); break
        except json.JSONDecodeError: pass
print(json.dumps(result, indent=2))
if result.get('status') != 'success': raise SystemExit(1)
