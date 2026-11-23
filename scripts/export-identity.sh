#!/usr/bin/env bash
# Regenerate every published key artifact from the local GnuPG keyring.
# Run on a normal (online) workstation that holds the PUBLIC key; no secret
# key or token is needed. Run again after every key change (renewal, new
# subkey, new or revoked user ID, revocation), then re-sign the manifest and
# commit.
#
# Writes public/pgp.asc (the whole key) and one WKD file (direct method) for
# each address on the key at this site's own domain, $IDENTITY_DOMAIN (akl.dev):
#       public/.well-known/openpgpkey/hu/<hash>
# Each WKD file holds the key with only the matching user ID. The whole
# openpgpkey directory is rebuilt, so a removed address leaves no stale file.
#
# Addresses at other domains are not this site's to serve: WKD for them belongs
# to whoever runs that domain (the owner's key lives at their mail provider,
# which publishes it itself). A key with no address at this domain therefore
# gets no openpgpkey directory at all.
#
# Usage: scripts/export-identity.sh <FINGERPRINT> [site-root]
set -euo pipefail

FPR="${1:?usage: export-identity.sh <FINGERPRINT> [site-root]}"
ROOT="${2:-.}"
SITE_DOMAIN="${IDENTITY_DOMAIN:-akl.dev}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WKD="$ROOT/public/.well-known/openpgpkey"

# Addresses of the user IDs that are neither revoked nor expired.
mapfile -t ADDRS < <(
  gpg --batch --with-colons --list-keys "$FPR" |
    awk -F: '$1 == "uid" && $2 !~ /^[re]/ { print $10 }' |
    sed -n 's/.*<\([^<>]*@[^<>]*\)>.*/\1/p' |
    tr '[:upper:]' '[:lower:]' | sort -u
)
if [ "${#ADDRS[@]}" -eq 0 ]; then
  echo "no user ID with an email address found on $FPR" >&2
  exit 1
fi

# export-clean drops third-party signatures; the published key stays small.
gpg --batch --export-options export-clean --armor --export "$FPR" > "$ROOT/public/pgp.asc"
echo "wrote $ROOT/public/pgp.asc"

rm -rf "$WKD"
for addr in "${ADDRS[@]}"; do
  if [ "${addr##*@}" != "$SITE_DOMAIN" ]; then
    echo "no WKD file here for $addr (${addr##*@} serves its own)"
    continue
  fi
  hash="$(node "$HERE/wkd-hash.mjs" "$addr")"
  mkdir -p "$WKD/hu"
  gpg --batch --export-options export-clean --export-filter "keep-uid=mbox = $addr" \
    --no-armor --export "$FPR" > "$WKD/hu/$hash"
  : > "$WKD/policy"
  echo "wrote $WKD/hu/$hash  (WKD for $addr)"
done

echo "next: update identity/identity.src.txt if needed, then run the sign step"
