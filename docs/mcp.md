# MCP Guide

Start server:

```bash
npx -y free-fast-mode serve
```

Protocol:
- line-delimited JSON-RPC
- methods: `initialize`, `tools/list`, `tools/call`
- direct tool methods are accepted (`ffm_search`, etc.)

Example call:

```json
{"id":1,"method":"tools/call","params":{"name":"ffm_search","arguments":{"query":"Optimizer"}}}
```
