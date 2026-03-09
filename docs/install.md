# Install Guide

## Lowest-Friction (Plugin Bundles)

```bash
npx -y free-fast-mode plugin scaffold --target all --out .ffm-plugins
```

This creates provider-ready plugin files under `.ffm-plugins/`.

## Local Development

```bash
npm install
npm run build
npm link
```

Verify:

```bash
ffm status
```
