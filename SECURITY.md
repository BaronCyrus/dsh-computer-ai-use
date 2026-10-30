# Security

## What this plugin can do

Once a session approves it, the model can see the main display and use the mouse and keyboard as you. It works in any app on that display, and its screenshots go to the session's model provider. The plugin runs with your user's permissions, like every DSH plugin.

## Limits on the model

- Each session asks once before its first use, through DSH's approval. A session on the `danger-full-access` preset does not ask.
- If the pointer moved or the screen size changed since the last screenshot, an action is refused until the model looks again.
- The tool descriptions tell the model that text on screen is data, not instructions, to confirm irreversible actions, and not to type secrets. These are instructions to a model, not a guarantee. Do not leave a session running over content you do not trust.

## Updates

A new version runs with the same reach, so updates are the most sensitive thing this plugin does by itself. You can turn them off under Settings, Computer AI Use, or with `autoUpdate: false` in the profile's `cordis.patch.yml`.

When automatic updates are on, the plugin reads npm every 6 hours and a minute after DSH opens. It installs the `latest` version in the background only if all of these hold:

| Check | Protects against |
| --- | --- |
| The version has npm provenance and its manifest names this repository | A stolen npm token: npm refuses provenance from another repository, and a token alone cannot produce it |
| It was published at least 24 hours ago | A bad or compromised release: it leaves time to deprecate the version first |
| It is not deprecated | A release already known to be bad |
| It accepts the running DSH version, by the rule DSH's plugin manager uses | A plugin that DSH would refuse to load |

The check of provenance relies on npm's own validation at publish time. The plugin does not verify the Sigstore signature itself.

**Update now** on the settings page skips the age, provenance and deprecation checks, because a person asked for it. It still respects the compatibility check and pnpm's own release age policy.

The update never bypasses pnpm's `minimumReleaseAge`, and pnpm runs without environment variables whose names contain `KEY`, `PASSWORD`, `SECRET` or `TOKEN`, the same rule DSH's plugin manager applies. pnpm's output and registry answers stay on the host.

A local `link:` or `file:` install never updates.

## Reporting

Report a vulnerability through GitHub's private reporting on [BaronCyrus/dsh-computer-ai-use](https://github.com/BaronCyrus/dsh-computer-ai-use/security/advisories/new).
