# Security policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub:
[Report a vulnerability](https://github.com/git-cgallagher/avalanche-run-web/security/advisories/new)
(the **Security** tab, then **Report a vulnerability**). Don't open a public issue for a security problem.

You can expect an acknowledgement within a week. This is a one-person project, so fixes are best effort.

## Supported versions

Only the latest release gets fixes.

## Scope

Avalanche Run is an offline game. It makes no network requests, has no accounts, and stores only its
settings and local high-score table in localStorage. The desktop app is a Tauri shell with no plugins or
IPC commands enabled, and a content security policy limited to the bundled files. Installers are not
notarized (macOS) or code-signed (Windows); see the README.
