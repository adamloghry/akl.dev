#!/usr/bin/env bash
# Clearsign the identity manifest with the signing subkey (token must be
# plugged in; expect a PIN prompt and a touch). The signed file is committed.
# Signing cannot run in CI because the secret key lives only on the token.
#
# Usage: [IDENTITY_KEY=<FPR>] scripts/sign-identity.sh [site-root]
set -euo pipefail
ROOT="${1:-.}"
SRC="$ROOT/identity/identity.src.txt"
OUT="$ROOT/public/identity.txt"

grep -q '^Issued: ' "$SRC" || { echo "missing Issued: line in $SRC" >&2; exit 1; }
grep -q '^Expires: ' "$SRC" || { echo "missing Expires: line in $SRC" >&2; exit 1; }
if grep -Eq '<[A-Z0-9_-]+>' "$SRC"; then
  echo "unfilled <PLACEHOLDER> in $SRC" >&2; exit 1
fi

# IDENTITY_KEY (a fingerprint) picks the key when the keyring holds several.
gpg ${IDENTITY_KEY:+--local-user "$IDENTITY_KEY"} --yes --clearsign --output "$OUT" "$SRC"
gpg --verify "$OUT"
echo "wrote $OUT"
