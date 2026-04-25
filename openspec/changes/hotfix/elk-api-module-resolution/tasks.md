# Tasks: ELK API Module Resolution Hotfix

## Phase 1: Browser runtime seam

- [x] 1.1 Update `src/lib/elkLayout.ts` so the browser ELK API path no longer dynamically imports `elkjs/lib/elk-api.js` as a bare module specifier at runtime.
- [x] 1.2 Preserve the existing `createElkLayout()` contract, browser fallback behavior, and Node/CLI bootstrap split while keeping the change local to `src/lib/elkLayout.ts`.

## Phase 2: Verification

- [x] 2.1 Run `npx tsc --noEmit` to confirm the bundler-safe browser seam compiles in strict TypeScript.
