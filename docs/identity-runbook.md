# Keys and identity: owner runbook

These steps need your hands or your accounts. Steps 1 to 3 produce the files the site needs. Steps 4 to 8 connect the platforms back to the site. The site side (the `/keys` page, the build check, headers) is described in `docs/design.md` section 6.

This began as the `MANUAL-STEPS.md` of the identity spec bundle. On 2026-11-22 the owner replaced its key plan (hardware tokens and a key generated for the site) with the model below.

## The model in one paragraph

Your OpenPGP key is the one Proton Mail made for `adamloghry@pm.me`. That is the address for encrypted mail, and Proton keeps using the key for it. You export the private key from Proton once, keep a copy in 1Password, and use it on your workstation for one thing: signing `identity.txt`, a short list of your accounts and other keys. The signature says "the holder of this key claims these accounts". The page's contact address stays `adam@loghry.org`; the Proton address appears only on `/keys` and in the manifest.

What this trades away, knowingly:

- Proton holds the key. Whoever controls that Proton account controls the key that signs the manifest.
- Proton can replace the key (for example after a password reset without recovery). Then you export again, sign again and update the fingerprint wherever you posted it.
- The key has no expiry. The manifest's own `Expires:` (one year) is the liveness signal, and the build enforces it.

## Step 1. Export the private key from Proton

1. In 1Password, create an item with a long generated passphrase for the exported key file.
2. In Proton Mail: Settings, All settings, Encryption and keys, Email encryption keys, the menu beside the key for `adamloghry@pm.me`, Export private key. Proton asks for your account password and then for a passphrase for the file: use the one from 1Password. Menu names may differ slightly by app version.
3. Note where the file was saved. Do not put it in the repo.

## Step 2. Create the SSH signing key

Git commits are signed with an SSH key, not the OpenPGP key. In 1Password: New Item, SSH Key, Add Private Key, Generate, Ed25519. Turn on the 1Password SSH agent (Settings, Developer). The wizard in step 3 can also create this item through the `op` CLI, or pick the key from the SSH agent.

## Step 3. Run the wizard

```sh
nix develop --impure -c npm run identity:setup
```

It asks questions and does the rest:

| Stage | What happens |
|---|---|
| 1. Key | Imports the exported file into your GnuPG keyring (or uses the key if it is already there), marks it as your own, and compares its fingerprint with the key Proton publishes for the address. A mismatch stops the run unless you override it. |
| 2. Backup | Gets a copy of the private key file into 1Password, waits until you type `stored`, then offers to delete the loose file. |
| 3. SSH and age | Collects the SSH signing key (pasted, from the SSH agent, a `.pub` file, or a new 1Password item), the SSH login key and an optional age recipient. |
| 4. Site files | Writes `public/pgp.asc`, fills `identity/identity.src.txt` (dates, fingerprint, address, SSH and age lines), writes `public/allowed_signers`, adds the `Encryption:` line to `security.txt`, signs the manifest into `public/identity.txt`, and runs the build check. |

It keeps no state file: run it again after an interruption and it offers only what is missing, with the current values as defaults. The passphrase goes only into GnuPG's own prompt. It never commits. It was rehearsed on 2026-11-22 with a throwaway key shaped like the Proton one. The `op` CLI calls in it could not be tested (no `op` on that machine); each falls back to doing that step in the 1Password app.

The same by hand, if you ever need it:

```sh
gpg --import /path/to/exported-private-key.asc
npm run identity:export -- <FPR>       # writes public/pgp.asc
$EDITOR identity/identity.src.txt      # Issued, Expires (12 months), Fingerprint, Email, SSH lines
npm run identity:sign                  # passphrase prompt; writes public/identity.txt
npm run identity:check                 # must pass
```

Then finish the switch from "pending" to "published" (or hand this part to the implementer). The build and `npm run verify` fail with a message naming each item until it is done:

1. `package.json`: drop `IDENTITY_PENDING=1` from the `prebuild` script.
2. `public/index.html.md`: add `- pgp: https://akl.dev/keys` under the email line (the landing page now shows the `pgp` link).
3. The local test servers (`scripts/static-file.mjs` users) do not map `/keys` to `keys.html`; teach them to before `npm run test:bombadil` follows the new link.
4. `git add` the new files by explicit path (`public/pgp.asc`, `public/identity.txt`, `public/allowed_signers`, `public/.well-known/security.txt`, `identity/identity.src.txt`) and commit.

## Step 4. Move the Bluesky handle to akl.dev

Your account is identified by a DID that never changes. The handle is a label that points at it. Changing the handle keeps followers, posts, and blocks.

1. In Bluesky: Settings, Account, Handle, then the option for using your own domain.
2. Enter `akl.dev`. The dialog shows a DNS TXT record for `_atproto.akl.dev` with the value `did=did:plc:u2hotgrxdf5rr3zqjubs2wsb`. That record is already live (checked 2026-11-21). If the dialog shows a different value, stop.
3. Press the verify button, then save.
4. Leave the TXT record in place permanently. Removing it invalidates the handle.

The site also serves the same DID at `https://akl.dev/.well-known/atproto-did` (owner decision: keep both proofs). The manifest says `Bluesky: @akl.dev`, so do this before or right after publishing.

## Step 5. Mastodon (hachyderm.io)

1. Edit profile. In one of the extra fields, put `https://akl.dev/keys`. Save.
2. Mastodon fetches that page and looks for a `rel="me"` link back to your profile, which the site has on every page. The field turns green when it verifies. If it does not, re-save the profile after the site is deployed; the check runs on save.
3. Webfinger alias, so `@akl@akl.dev` finds you: nothing to do. `public/_redirects` sends `/.well-known/webfinger` to hachyderm.io with a 302.

## Step 6. GitHub (adamloghry)

1. Settings, SSH and GPG keys: add the SSH key twice if you use it for both purposes, once as an authentication key and once as a **signing** key.
2. Optional: add the GPG public key (contents of `pgp.asc`). GitHub then serves it at `https://github.com/adamloghry.gpg`, an independent copy of the fingerprint.
3. Add the address you commit with as a verified email on the account, or signatures show as unverified.
4. Set the profile website to `https://akl.dev`.
5. Configure git to sign with SSH (the wizard prints these with your key filled in):
   ```sh
   git config --global gpg.format ssh
   git config --global user.signingkey 'key::<ssh public key>'
   git config --global commit.gpgsign true
   git config --global tag.gpgsign true
   ```
   With the 1Password agent, also set `gpg.ssh.program` to `op-ssh-sign`; the SSH key item's "Configure commit signing" button shows the exact path.

## Step 7. Key server (optional)

Proton already publishes the key for people who write from Proton or look it up there. Uploading to keys.openpgp.org adds an independent copy:

```sh
gpg --export <FPR> | curl -T - https://keys.openpgp.org
```

Open the link in the response and confirm `adamloghry@pm.me` by the email it sends.

## Step 8. Signal and loose ends

- Signal has no public profile to link, so the username `akl.07` in the signed manifest is the only proof. Real verification with a contact is comparing safety numbers.
- Remove the old domain from profiles, email signatures, and conference bios.
- Run the live checks below.

## Live checks after deploy

```sh
# 1. The manifest verifies with the key served by the site
export GNUPGHOME=$(mktemp -d)
curl -s https://akl.dev/pgp.asc | gpg --import
curl -s https://akl.dev/identity.txt | gpg --verify

# 2. The site and Proton hand out the same key (the two fingerprints must match)
curl -s https://akl.dev/pgp.asc | gpg --show-keys --with-colons | awk -F: '$1=="fpr"{print $10; exit}'
curl -s 'https://mail-api.proton.me/pks/lookup?op=get&search=adamloghry@pm.me' | gpg --show-keys --with-colons | awk -F: '$1=="fpr"{print $10; exit}'

# 3. Content types (application/pgp-keys; text/plain)
curl -sI https://akl.dev/pgp.asc; curl -sI https://akl.dev/identity.txt; curl -sI https://akl.dev/.well-known/security.txt

# 4. /keys answers 200 with no redirect (Mastodon fetches exactly this URL)
curl -sI https://akl.dev/keys

# 5. Webfinger: 302 to hachyderm.io with exactly one resource= (AC-LIVE-16 in docs/runbook.md)
curl -sI 'https://akl.dev/.well-known/webfinger?resource=acct:akl@akl.dev'

# 6. Bluesky handle record
dig +short TXT _atproto.akl.dev
```

Manual checks:

- The Mastodon profile shows the link to `https://akl.dev/keys` as verified.
- Searching `@akl@akl.dev` from another Mastodon server finds the hachyderm account.

Known gap, 2026-11-22: Proton's Web Key Directory host (`openpgpkey.pm.me`) answered the lookup for this address with `200` and an empty body, so `gpg --locate-keys adamloghry@pm.me` would not have found the key that day, while Proton's key server URL in check 2 returned it. The key was hours old then. `/keys` therefore tells people to import `pgp.asc`; if the lookup starts working, nothing here needs to change.

## Yearly renewal (about 5 minutes)

The build fails 30 days before the manifest or `security.txt` expires, and `verify.yml` builds weekly, so this cannot be missed silently. Put a calendar reminder at 11 months anyway.

1. Update the `Expires:` line in `public/.well-known/security.txt`.
2. Run `npm run identity:setup` again and accept the defaults: it re-checks the key against Proton, sets new dates and signs.
3. Commit and deploy. Add a line to the `history` list at the top of `src/pages/keys.astro` if anything other than the dates changed.

## If something goes wrong

| Event | Action |
|---|---|
| **Proton replaced the key** (the wizard reports a fingerprint mismatch) | Export the new private key (step 1), store it in 1Password beside the old one, and run the wizard. Set `Previous-Fingerprint` in `identity/identity.src.txt` to the old fingerprint before signing. If you still have the old private key, sign a short hand-over statement with it and publish that too. Update the fingerprint on Mastodon and the key on GitHub and the key server. |
| **Workstation or exported file exposed** | The file is protected by its passphrase, which buys time. In Proton, generate a new key for the address and mark the old one compromised, then follow the row above. |
| **Proton account lost** | The copy in 1Password still decrypts old mail and can sign one last manifest that says where to reach you instead. |
| **Domain lost or hijacked** | The domain anchors the manifest, the Bluesky handle and the Mastodon link. Protect the registrar account with a hardware key, enable registrar lock, and keep auto-renew on. Proton's copy of the key and the GitHub copy remain independent witnesses of the true fingerprint. |
| **Build fails on expiry** | Working as designed. Do the renewal. |

## Checklist

- [ ] Private key exported from Proton; copy and passphrase in 1Password; loose file deleted
- [ ] SSH signing key in 1Password; agent on
- [ ] Wizard run; check passes; published-state switch done; committed
- [ ] `_atproto` TXT record live; Bluesky handle is `@akl.dev`
- [ ] Mastodon link verified; webfinger alias resolves
- [ ] GitHub has the SSH signing key; commits show as verified
- [ ] Live checks pass
- [ ] Registrar account locked down
- [ ] Calendar reminder set: 11 months (manifest and `security.txt`)
