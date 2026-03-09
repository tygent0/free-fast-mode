# Example Workflows

## JS demo

```bash
cd examples/demo-repo-js
ffm snapshot
ffm status
```

## Python demo

```bash
cd examples/demo-repo-py
ffm snapshot
ffm status
```

## MCP-style request example

```json
{"id":1,"method":"ffm_read_files_batch","params":{"paths":["src/math.ts","test/math.test.js"]}}
```
