---
name: resolve-cve
description: Use when a Trivy image scan, npm audit, or Dependabot alert flags a HIGH/CRITICAL CVE in this repo and it needs to be resolved by bumping dependency versions (and, if the base OS/runtime is EOL, the Docker base image).
version: 0.1.0
---

# Resolving CVEs via Version Bumping

This repo's CI gates deploys on a Trivy image scan (`build-and-push-{api,web,receipt-processor}` in
`deploy-dev.yml`). A HIGH/CRITICAL finding fails that step, which blocks the image push, which in turn
makes `deploy-prod.yml` fail with `Image not found` when a version tag is pushed (it deploys the
`git-<sha>` tag assuming dev already built and pushed it). So a CVE gate failure in dev silently breaks
prod releases too — always check both workflows.

## Step 1 — Get the exact finding

Pull the Trivy table out of the failed run rather than guessing from `npm audit` alone (the CI gate is
Trivy, not npm audit — they can disagree):

```bash
gh run list --repo <owner>/<repo> --limit 5
gh run view <run-id> --repo <owner>/<repo> --json jobs --jq '.jobs[] | "\(.name)\t\(.conclusion)"'
gh run view <run-id> --repo <owner>/<repo> --log-failed | grep -iE "error|Total:"
```

For each flagged image, note: package name, installed version, fixed version(s), and which parent
package pulls it in (`npm ls <package>` — the tree shows every path, e.g. `@grpc/grpc-js` pulled in via
`google-gax` for API/receipt-processor but via `@firebase/firestore` for web, at different versions).

## Step 2 — Try the cheap fix first: just regenerate the lockfile

**Before reaching for `overrides`, check whether the committed `package-lock.json` is simply stale.**
Existing caret ranges in `package.json` (e.g. `^8.0.0` on `@google-cloud/firestore`) often already permit
a patched transitive version — nobody has just refreshed the lockfile in a while (a sign of this: a pile
of unmerged Dependabot version-bump branches sitting in the repo).

```bash
rm package-lock.json
rm -rf node_modules apps/api/node_modules apps/web/node_modules apps/receipt-processor/node_modules
npm install
npm ls <flagged-package>   # confirm it now resolves to a fixed version
```

**Do not glob this** (`rm -rf apps/*/node_modules`) in fish/zsh — if any one glob segment matches nothing,
the whole command aborts silently before running, and you'll think you did a clean install when you
didn't. Enumerate the paths explicitly as above.

**`npm install` alone, without deleting the lockfile, is not reliable** for forcibly re-resolving
already-locked transitive versions — even after adding `overrides`. Always delete `package-lock.json` and
`node_modules` fully when you need npm to actually re-evaluate the tree.

If this alone clears the CVE (check `npm audit` / re-run `npm ls`), you're done — no `overrides` block
needed. Simpler diff, less to maintain.

## Step 3 — If ranges are too tight, use scoped `overrides`

If the current semver ranges genuinely can't reach a fixed version, add root-level `overrides` in the
workspace root `package.json`. Two failure modes to avoid, both from real incidents:

1. **Blanket overrides can break an unrelated consumer.** A flat override applies everywhere the package
   name appears, even to a completely different, non-vulnerable resolution elsewhere in the tree. Check
   `npm ls <package>` first — if two different parents pull two different versions (e.g. `@firebase/firestore`
   pinned to `~1.9.0` of `@grpc/grpc-js`, unrelated to the vulnerable `1.14.3` pulled in via `google-gax`),
   scope the override to the parent that actually needs it:

   ```json
   "overrides": {
     "google-gax": { "@grpc/grpc-js": "1.14.4" }
   }
   ```

2. **The override version must satisfy the immediate parent's declared range**, not just be "a fixed
   version" per the advisory. E.g. an advisory may list `1.1.7` as fixed, but if the direct parent
   (`fast-xml-parser`) requires `^1.2.0`, overriding to `1.1.7` produces an `invalid:` warning in `npm ls`
   and npm may not actually honor it consistently. Pick a version that is both patched *and* satisfies the
   parent's range (check the already-open Dependabot branch names for a hint — they usually target the
   right version).

After any override change: delete lockfile + node_modules, reinstall, then **check for `invalid` markers**:

```bash
npm ls 2>&1 | grep -i invalid
```

Zero hits means every override is actually compatible with its consumers.

## Step 4 — Bump the Docker base image if it's EOL

If `node:20-alpine` (or any base image) is past its LTS/security-support window, no amount of `apk upgrade`
or `npm install -g npm@latest` in that stage will ever get new patches — bump the tag itself
(`node:20-alpine` → `node:24-alpine`, etc.) in every `FROM` line across all Dockerfiles in the repo.

Two gotchas specific to this repo's multi-stage Dockerfiles:
- Each `FROM ... AS <stage>` starts a fresh filesystem; a `RUN npm install -g npm@11` in one stage does
  **not** carry over to a later stage that isn't built `FROM` it. Check whether the final `runner` stage
  independently upgrades npm (api and receipt-processor do; web's runner didn't — that's why its bundled
  `sigstore` stayed on an old, vulnerable version even after other stages updated npm). Add the upgrade to
  every stage that gets scanned/shipped, not just `builder`.
- Some CVEs live in packages that never appear in `npm ls` at all (they're bundled inside the base image's
  own global npm install, e.g. `sigstore`). These can't be fixed via `package.json`/`overrides` — only via
  bumping the base image or explicitly reinstalling npm in the shipped stage.

## Step 5 — Verify before shipping

```bash
npm run build      # all workspaces
npm test           # all workspaces — confirm no regressions from the bump
```

Then push to `master` and watch `deploy-dev.yml` (this is what actually re-runs the Trivy gate):

```bash
git push origin master
gh run list --repo <owner>/<repo> --limit 3
gh run watch <deploy-dev-run-id> --repo <owner>/<repo> --interval 15 --exit-status
```

Only tag a prod release (`git tag -a vX.Y.Z && git push origin vX.Y.Z`) after `deploy-dev.yml`'s
`build-and-push-*` jobs pass — that's the step that proves the Trivy gate is clear and the image actually
got pushed for `deploy-prod.yml` to find.

## Step 6 — sanity-check in prod

After `deploy-prod.yml` finishes, confirm the rollout is actually healthy, not just "the workflow went
green":

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.configuration_name=~"-prod$" AND severity>=WARNING AND timestamp>="<deploy-completed-timestamp>"' \
  --project=<project-id> --limit=200
```

No output (or only expected INFO-level noise) means a clean deploy.

## Quick checklist

- [ ] Pulled exact CVE list from the failed Trivy step (not just `npm audit`)
- [ ] Tried a plain lockfile regen first — checked if it alone fixes it
- [ ] If using `overrides`, scoped to the actual vulnerable parent, not a blanket name match
- [ ] Override version satisfies the parent's own declared range (`npm ls` shows no `invalid:`)
- [ ] Bumped Docker base image if EOL, in every `FROM` line, in every stage that ships
- [ ] `npm run build` + `npm test` pass in every workspace
- [ ] `deploy-dev.yml` Trivy gate passes before tagging a prod release
- [ ] Checked prod logs post-deploy for warnings/errors
