# Publishing Spec Renderer

## One-time setup

1. **Create a publisher.** Sign in at <https://marketplace.visualstudio.com/manage>
   with a Microsoft account and create a publisher. The publisher **ID** is
   permanent.
2. **Set the ID** in `package.json` by replacing `"publisher": "your-publisher-id"`.
3. **Create a Personal Access Token.** In Azure DevOps
   (<https://dev.azure.com>), go to *User settings → Personal access tokens*.
   Choose *Organization: All accessible organizations* and the scope
   *Marketplace → Manage*.
4. **Optional: Open VSX.** This makes the extension available in Cursor,
   Windsurf and VSCodium. Create an account at <https://open-vsx.org>, sign the
   publisher agreement, and create an access token.

## Publish manually

```sh
npm ci
npm run package                 # creates spec-renderer-<version>.vsix
code --install-extension spec-renderer-*.vsix   # try it locally first
npx vsce login <publisher-id>   # paste the PAT
npx vsce publish                # or: npx vsce publish minor
npx ovsx publish spec-renderer-*.vsix -p <open-vsx-token>   # optional
```

## Publish from GitHub Actions

`.github/workflows/release.yml` publishes when a `v*` tag is pushed.

1. Add repository secrets `VSCE_PAT`, and optionally `OVSX_PAT`.
2. Bump `version` in `package.json` and update `CHANGELOG.md`.
3. Tag and push:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

## Checklist before each release

- `npm test` and `npm run typecheck` pass.
- `CHANGELOG.md` has an entry for the new version.
- Screenshots in `docs/images/` are current. The Marketplace page uses them
  through the `repository` URL.
- `media/icon.png` is 128×128. Regenerate it from `media/icon.svg` with
  `npm run icon`, which needs Playwright installed.
