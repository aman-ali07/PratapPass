## What changed

<!-- A short summary of the change and the user-visible effect. -->

## Why

<!-- Link the issue or explain the motivation. -->

Closes #

## How it was verified

<!-- Paste the real commands and their results. "It should work" is not evidence. -->

- [ ] `./scripts/test.sh` — result:
- [ ] `npm run build` — result:
- [ ] Manual flow exercised (describe):

```text
paste relevant output here
```

## Screenshots / recordings

<!-- For UI changes, include before/after at desktop and 360 px. Use synthetic data only. -->

## Checklist

- [ ] Diff is focused; no unrelated refactors or dependency bumps.
- [ ] Inputs validated at the boundary; errors surfaced, not swallowed.
- [ ] No secrets, `.env*` files, or real student data.
- [ ] RLS / `SECURITY DEFINER` / audit rules preserved (or explicitly discussed).
- [ ] New behavior has an assertion or documented smoke evidence.
- [ ] Docs updated (`TASKS.md`, `KNOWN_ISSUES.md`, area doc) where relevant.
- [ ] I did not claim a check passed unless I ran it.
