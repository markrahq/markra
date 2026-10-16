# WinGet distribution

Markra's WinGet package identifier is `Markra.Markra`. The initial package supports the Windows x64 NSIS installer (`Markra_<version>_windows_x64_setup.exe`) with the installer's default per-user scope. MSI, portable ZIPs, ARM64, and prereleases are excluded.

The package becomes available through WinGet only after its pull request is merged into [`microsoft/winget-pkgs`](https://github.com/microsoft/winget-pkgs) and the catalog is refreshed. Preparing these files or opening a pull request does not publish the package immediately.

## Initial submission

The bootstrap manifests in [`packaging/winget/manifests/m/Markra/Markra/2.13.0`](../packaging/winget/manifests/m/Markra/Markra/2.13.0) use the actual v2.13.0 release installer and its SHA-256. They are a fixed starting point, rather than a second catalog to update on every release. `scripts/release/generate-winget-manifests.mjs` generates fresh manifests from each release's installer and Tauri configuration.

1. Run the **WinGet** workflow with `tag_name: v2.13.0` and `submit: false` to validate the manifests and test silent install/uninstall on Windows. Pull requests changing the WinGet tooling also run these checks against the bootstrap release.
2. Add an Actions repository secret named `WINGET_CREATE_GITHUB_TOKEN`. Use a dedicated GitHub classic personal access token with the `public_repo` scope, as required by [WinGetCreate](https://github.com/microsoft/winget-create/blob/main/doc/token.md). Fine-grained tokens are not supported by this submission flow. Keep the token in the secret; do not commit it or pass it in command-line arguments.
3. Run **WinGet** again for the same tag with `submit: true`. The workflow submits the initial package if it has not yet been added. Check the resulting pull request in `microsoft/winget-pkgs` and address any review feedback.

Without the secret, validation and artifact upload still run. A requested submission emits a warning explaining that the token is missing. No GitHub login prompt is opened.

Manual runs also verify a configured token through a read-only GitHub authentication and scope check, including when `submit` is false. This checks the credential without opening an upstream pull request. Pull request validation does not use the token.

To submit the checked-in bootstrap manifests manually on Windows:

```powershell
winget validate --manifest packaging/winget/manifests/m/Markra/Markra/2.13.0
wingetcreate submit packaging/winget/manifests/m/Markra/Markra/2.13.0 --prtitle "New package: Markra.Markra version 2.13.0"
```

Omitting the token argument allows WinGetCreate's interactive local authentication. The automated workflow instead uses the `WINGET_CREATE_GITHUB_TOKEN` environment variable.

## Stable release updates

The Release workflow calls the reusable WinGet workflow after `publish_release` succeeds. Draft and prerelease releases are excluded. Keeping this as an explicit workflow dependency avoids relying on `release.published` events, which are not triggered by releases created using the repository's `GITHUB_TOKEN`.

For each eligible release the workflow:

- Reads the published release and the Tauri configuration at its tag, selects exactly one matching x64 setup EXE, and downloads it.
- Generates version, default locale, and installer manifests with a hash of those exact bytes. The installer type is `nullsoft`; product name, publisher, and install scope match Tauri's NSIS defaults.
- Validates the manifests with WinGet, tests silent installation and uninstallation, and uploads the generated manifests as a workflow artifact.
- Skips submission when that version is already merged or has an open WinGet pull request. API errors other than a missing package fail the job.
- Uses `wingetcreate update` once the package exists, preserving metadata and installer settings reviewed in the upstream catalog. Before the initial package is merged, it uses `wingetcreate submit` with the generated manifests.

WinGetCreate is pinned to a version and verified against its SHA-256 before execution. When upgrading that tool, update the download URL and checksum together.

The WinGet job has its own status. Failure does not remove the published GitHub release. Retry the **WinGet** workflow with the same release tag after fixing the failure; no desktop rebuild is required. An upstream pull request still needs to pass Microsoft's checks and merge before users receive the version through WinGet.

## Local generation and tests

Download the exact stable installer first, then run:

```sh
RELEASE_VERSION=v2.13.0 \
RELEASE_ASSETS_ROOT=/path/to/downloaded-assets \
OUTPUT_DIR=/tmp/markra-winget \
node scripts/release/generate-winget-manifests.mjs

pnpm test:release
```

`GITHUB_REPOSITORY` defaults to `markrahq/markra`. `TAURI_CONFIG_PATH` defaults to `apps/desktop/src-tauri/tauri.conf.json`; override it with the configuration from the released tag when generating an older version. The output follows the upstream layout under `<OUTPUT_DIR>/manifests/m/Markra/Markra/<version>/`.

If the NSIS install mode changes from `currentUser`, generation fails so the scope can be reviewed before publishing incorrect metadata.

## Installation and upgrade verification

After the initial package is merged and indexed, run on Windows:

```powershell
winget source update
winget show --id Markra.Markra --exact --source winget
winget install --id Markra.Markra --exact --source winget
winget list --id Markra.Markra --exact
winget upgrade --id Markra.Markra --exact --source winget
winget uninstall --id Markra.Markra --exact
```

For the first version update, also test upgrading an older NSIS installation and an installation updated through Markra's built-in updater. Verify that WinGet recognizes the installed version, upgrades the existing installation, and preserves user settings and documents. The automated silent install/uninstall check does not cover these upgrade scenarios or launching the editor UI.
