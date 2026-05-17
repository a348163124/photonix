# Contributing to Photonix

Thanks for taking a look. Photonix is a young Windows-first AI photo editor with a small surface area, so contributions are very welcome — bug reports, feature suggestions, prototypes, and pull requests all help.

## Ways to contribute

- **Bug reports** — file an [issue](https://github.com/a348163124/photonix/issues/new/choose) and pick the Bug template
- **Feature ideas** — pick the Feature template
- **Documentation** — typo fixes, clarifications, screenshots, and README polish
- **Code** — pick an open issue or open one to discuss before non-trivial changes

If you are unsure whether a change fits, open a quick issue first. We would rather have a 30-second discussion than a wasted day.

## Setting up locally

You need:

- Windows 10/11
- Node.js 20+
- Rust stable + Visual Studio Build Tools (C++ workload + Windows SDK)

```cmd
git clone https://github.com/a348163124/photonix.git
cd photonix\photonix-app
npm install
npm run tauri dev
```

The first run downloads all Rust crates and may take 3–5 minutes. Subsequent builds are incremental.

## Project layout

```
photonix-app/
  src/                      Frontend (React + TypeScript)
    components/             UI: layout, library, editor, settings, generate, ui
    services/               Tauri invoke wrappers, edit pipeline, retry, providers
    stores/                 Zustand stores (app, editor, settings, presets, batch, generate)
    types/                  Shared TypeScript types
  src-tauri/
    src/commands/           Tauri commands: edit, prompt, generate, library, secrets
    src/image_core/         Scanner, thumbnails, proxies
    src/storage/            SQLite, migrations, repository
```

## Conventions

### TypeScript

- Strict mode is on. Run `npx tsc --noEmit` before committing.
- Prefer named exports over default exports for components and modules with more than one export.
- Components live next to each other in `components/<area>/`. State that is shared across components goes in `stores/`.
- All file-system or network work goes through Rust commands, not direct `fetch` from the WebView. This avoids CORS, keeps the API key out of JS, and keeps the privacy boundary clean.
- Keep panels under ~250 lines where reasonable; if they grow, factor a sub-component out.

### Rust

- Run `cargo check` before committing.
- Tauri commands return `Result<T, String>` so the frontend gets a readable string. Use the `String` body to encode actionable error context (e.g. include the path that failed to open).
- Long-running work (`image::open`, encoding, network) goes inside `tokio::task::spawn_blocking` so the UI thread stays responsive.
- New tables → new numbered migration in `storage/migrations.rs`. Never edit a previously released migration; always add a new one.

### Commits

- Use [conventional](https://www.conventionalcommits.org/en/v1.0.0/) prefixes when natural: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `ci:`. Not strictly enforced.
- Keep the subject under ~70 characters. Use the body for context, what was tested, and any known gaps.
- One topic per commit when feasible. It makes review and revert easier.

### PRs

- Reference the issue you are addressing in the body (`Closes #123`).
- Mention what you tested. Manual testing notes are fine — we don't have an automated UI test suite yet.
- CI must pass: TypeScript check, Vite build, and `cargo check`.
- For UI changes, attach a screenshot or short clip.

## Releasing (maintainers)

1. Bump version in `photonix-app/package.json` and `photonix-app/src-tauri/Cargo.toml` and `tauri.conf.json`
2. Update CHANGELOG (TBD)
3. `git tag vX.Y.Z`, push tag
4. Build with `npm run tauri build` on Windows; attach the resulting `.msi` and `.exe` to the GitHub Release

## Code of conduct

Be kind, be patient, assume good faith. Photonix is a tool for photographers; the contribution flow should feel as calm as the editor itself.

## License

By contributing you agree your changes are released under the [MIT License](./LICENSE) of the project.
