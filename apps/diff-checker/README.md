# Diff Checker (Next.js App)

Spec–Design–Implementation Diff Checker Dashboard (App Router + Tailwind + API).

## Scripts

```
pnpm -F @diff-checker/next dev
pnpm -F @diff-checker/next build
pnpm -F @diff-checker/next start
```

## Dev

1. Install workspace deps at repo root:
   ```
   pnpm install
   ```
2. Run dev server:
   ```
   pnpm -F @diff-checker/next dev
   ```
3. Open http://localhost:3000 and use the dashboard.

## Notes

- API route: `POST /api/diff`
- Diff lib: `lib/diff.ts`
- Tailwind: `app/globals.css`, `tailwind.config.ts`, `postcss.config.js`



