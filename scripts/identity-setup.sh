#!/usr/bin/env bash
# Interactive setup for the akl.dev identity files. The OpenPGP key is the one
# the owner's mail provider (Proton) made for the encrypted-mail address; this
# script never generates a key. It asks questions, then runs the commands of
# docs/identity-runbook.md:
#
#   1. key        find the key in the keyring, or import the private key exported
#                 from Proton; compare it with the key Proton publishes
#   2. backup     get a copy of the private key into 1Password
#   3. ssh/age    collect the SSH signing key, SSH auth key and age recipient
#   4. site       export the public key, fill and sign the manifest, write
#                 allowed_signers and security.txt, then run the build check
#
# Safe to run again: every stage looks at the keyring and the repo first and
# offers what is still missing, with the current values as defaults. It keeps
# no state file. The passphrase is only ever typed into GnuPG's own pinentry.
# It never commits, pushes or deploys.
#
# Usage: scripts/identity-setup.sh [FINGERPRINT]      (or: npm run identity:setup)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

KEY_ADDR="${IDENTITY_ADDRESS:-adamloghry@pm.me}"   # the address for encrypted mail
SRC="identity/identity.src.txt"
FPR="${1:-}"
OP_VAULT=""
BACKED_UP=0

# --- small helpers -------------------------------------------------------------
if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; N=$'\033[0m'; else B=""; D=""; N=""; fi
say() { printf '%s\n' "$*"; }
note() { printf '%s\n' "${D}$*${N}"; }
die() { printf 'identity-setup: %s\n' "$*" >&2; exit 1; }
stage() { printf '\n%s== %s ==%s\n' "$B" "$*" "$N"; }
have() { command -v "$1" >/dev/null 2>&1; }

ask() { # ask "question" [default]  -> $REPLY
  if [ -n "${2-}" ]; then printf '%s [%s]: ' "$1" "$2"; else printf '%s: ' "$1"; fi
  IFS= read -r REPLY || die "input ended"
  [ -n "$REPLY" ] || REPLY="${2-}"
}
confirm() { # confirm "question" [y|n]
  local a hint="[y/N]"
  [ "${2:-n}" = y ] && hint="[Y/n]"
  printf '%s %s ' "$1" "$hint"
  IFS= read -r a || die "input ended"
  case "${a:-${2:-n}}" in [Yy]*) return 0 ;; *) return 1 ;; esac
}

WORK="$(mktemp -d "${XDG_RUNTIME_DIR:-/nonexistent}/identity-setup.XXXXXX" 2>/dev/null || mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

# --- keyring queries -----------------------------------------------------------
secret_fprs() { # [address] -> fingerprints of secret primary keys
  { gpg --batch --with-colons --list-secret-keys ${1:+"<$1>"} 2>/dev/null || true; } |
    awk -F: '$1 == "sec" { s = 1; next } $1 == "fpr" && s { print $10; s = 0 }'
}
key_addrs() { # addresses of user IDs that are neither revoked nor expired
  gpg --batch --with-colons --list-keys "$FPR" |
    awk -F: '$1 == "uid" && $2 !~ /^[re]/ { print $10 }' |
    sed -n 's/.*<\([^<>]*@[^<>]*\)>.*/\1/p' | tr '[:upper:]' '[:lower:]' | sort -u
}
can_sign() { # a valid primary or subkey with the sign capability
  gpg --batch --with-colons --list-keys "$FPR" |
    awk -F: '($1 == "pub" || $1 == "sub") && $2 !~ /^[re]/ && $12 ~ /s/ { f = 1 } END { exit !f }'
}
primary_secret_here() { # false when the primary secret is a stub ("sec#")
  gpg --batch --with-colons --list-secret-keys "$FPR" | awk -F: '$1 == "sec" && $15 == "#" { stub = 1 } END { exit stub }'
}
cur_field() { # current manifest value, empty while it is still a <PLACEHOLDER>
  sed -n "s/^$1: //p" "$SRC" | sed -n 1p | grep -v '<' || true
}

# --- 0. preflight --------------------------------------------------------------
stage "0/4 preflight"
[ -f "$SRC" ] && [ -f package.json ] || die "run this from the akl.dev repo (no $SRC here)"
for tool in gpg gpgconf node ssh-keygen awk sed; do have "$tool" || die "missing tool: $tool"; done
[ -d node_modules/openpgp ] || die "node_modules is missing: run 'npm ci' first (the final check needs it)"
say "gpg:        $(gpg --version | sed -n 1p)"
say "keyring:    $(gpgconf --list-dirs homedir)"
if have op; then say "1Password:  op CLI found (optional; used only where you say yes)"; else say "1Password:  op CLI not found; you will store backups through the app"; fi
if [ -f public/pgp.asc ]; then note "public/pgp.asc exists already: this run updates the published files."; fi

# --- 1. key ----------------------------------------------------------------------
stage "1/4 OpenPGP key"
say "The identity key is the one Proton made for $KEY_ADDR. Proton keeps using it"
say "for mail; a copy of the private key in this keyring signs the manifest."
EXPORT_FILE=""
if [ -n "$FPR" ]; then
  gpg --batch --list-secret-keys "$FPR" >/dev/null 2>&1 || die "no secret key $FPR in the keyring"
else
  mapfile -t FOUND < <(secret_fprs "$KEY_ADDR")
  if [ "${#FOUND[@]}" -eq 1 ] && confirm "Found a secret key for $KEY_ADDR: ${FOUND[0]}. Use it?" y; then
    FPR="${FOUND[0]}"
  elif [ "${#FOUND[@]}" -gt 1 ]; then
    say "Several secret keys carry $KEY_ADDR:"; printf '  %s\n' "${FOUND[@]}"
    ask "Fingerprint to use (empty to import a file instead)"
    FPR="$REPLY"
  fi
fi

if [ -z "$FPR" ]; then
  say
  say "No private key chosen, so import the one from Proton. In Proton Mail:"
  say "  Settings, All settings, Encryption and keys, Email encryption keys,"
  say "  the menu beside the key for $KEY_ADDR, Export private key."
  say "Proton asks for your password, then for a passphrase that protects the"
  say "exported file. Generate that passphrase in 1Password and keep it there:"
  say "GnuPG asks for it every time you sign."
  ask "Path of the exported private key file"
  EXPORT_FILE="${REPLY/#\~/$HOME}"
  [ -f "$EXPORT_FILE" ] || die "no file at $EXPORT_FILE"
  LISTING="$(gpg --batch --show-keys --with-colons "$EXPORT_FILE" 2>/dev/null || true)"
  grep -q '^sec:' <<<"$LISTING" || die "that file holds no private key (is it the public key export?)"
  FPR="$(awk -F: '$1 == "fpr" && !n++ { print $10 }' <<<"$LISTING")"
  gpg --import "$EXPORT_FILE"
fi

primary_secret_here || die "the private key for $FPR is not usable here (sec#); import the full export"
can_sign || die "key $FPR cannot sign"
[ -n "$(key_addrs)" ] || die "key $FPR has no user ID with an address"

# Your own key: without this, every 'gpg --verify' warns that the key is not trusted.
if [ "$(gpg --batch --with-colons --list-keys "$FPR" | awk -F: '$1 == "pub" { print $9 }')" != u ] &&
  confirm "Mark this key as your own in this keyring (ultimate trust)?" y; then
  printf '%s:6:\n' "$FPR" | gpg --batch --import-ownertrust
fi

# The copy here must be the key Proton hands out today, or senders and the site disagree.
if have curl; then
  LIVE="$(curl -fsS --max-time 15 "https://mail-api.proton.me/pks/lookup?op=get&search=$KEY_ADDR" 2>/dev/null |
    gpg --batch --show-keys --with-colons 2>/dev/null | awk -F: '$1 == "fpr" && !n++ { print $10 }' || true)"
  if [ -z "$LIVE" ]; then
    note "Could not fetch the key Proton publishes for $KEY_ADDR; compare the fingerprint in Proton's settings by eye."
  elif [ "$LIVE" = "$FPR" ]; then
    say "Proton publishes the same key for $KEY_ADDR: fingerprints match."
  else
    say "${B}Mismatch:${N} Proton publishes $LIVE for $KEY_ADDR,"
    say "but this keyring has $FPR. Proton may have replaced the key; export again."
    confirm "Continue with the key in this keyring anyway?" n || die "stopped on fingerprint mismatch"
  fi
fi

say
gpg --list-secret-keys --with-subkey-fingerprints "$FPR"
say "${B}Fingerprint: $FPR${N}"

# --- 2. backup -------------------------------------------------------------------
stage "2/4 backup"
say "Proton holds the key, encrypted with your password. A copy of the exported"
say "file in 1Password means a lost Proton password does not lose the key, and"
say "lets you sign a hand-over statement if Proton ever replaces it."
if confirm "Store a copy of the private key in 1Password now?" y; then
  if [ -z "$EXPORT_FILE" ]; then
    say "GnuPG asks for the passphrase to export the key."
    EXPORT_FILE="$WORK/secret-key-$FPR.asc"
    gpg --armor --export-secret-keys "$FPR" >"$EXPORT_FILE"
  fi
  say "File to store (as a 1Password document): $EXPORT_FILE"
  if have op && confirm "Upload it with the op CLI now?" n; then
    ask "Vault" "Private"; OP_VAULT="$REPLY"
    if op document create "$EXPORT_FILE" --vault "$OP_VAULT" --title "OpenPGP private key $KEY_ADDR ${FPR: -16}" >/dev/null; then
      say "  uploaded"
    else
      say "  upload FAILED: add the file through the app"
    fi
  fi
  while :; do
    ask "Type 'stored' once it is in 1Password, or 'later' to be asked again on the next run"
    case "$REPLY" in
      stored) BACKED_UP=1; break ;;
      later) break ;;
    esac
  done
  if [ "$BACKED_UP" -eq 1 ] && confirm "Delete the loose file $EXPORT_FILE now?" y; then
    rm -f "$EXPORT_FILE"; say "Deleted."
  fi
else
  confirm "Is a copy already stored there?" n && BACKED_UP=1
fi

# --- 3. SSH keys and age ---------------------------------------------------------------
stage "3/4 SSH signing key, SSH auth key, age"
valid_ssh() { printf '%s\n' "$1" >"$WORK/k.pub"; ssh-keygen -l -f "$WORK/k.pub" >/dev/null 2>&1; }
ssh_fp() { printf '%s\n' "$1" >"$WORK/f.pub"; ssh-keygen -l -f "$WORK/f.pub" 2>/dev/null | awk '{ print $2 }'; }

# The key git signs with today, if git is set up for SSH signing: a strong hint for the list below.
GIT_SIGN_FP=""
if [ "$(git config --get gpg.format 2>/dev/null || true)" = ssh ]; then
  GIT_KEY="$(git config --get user.signingkey 2>/dev/null || true)"
  case "$GIT_KEY" in
    key::*) GIT_SIGN_FP="$(ssh_fp "${GIT_KEY#key::}")" ;;
    ssh-* | sk-* | ecdsa-*) GIT_SIGN_FP="$(ssh_fp "$GIT_KEY")" ;;
    ?*) GIT_SIGN_FP="$(ssh-keygen -l -f "${GIT_KEY/#\~/$HOME}" 2>/dev/null | awk '{ print $2 }' || true)" ;;
  esac
fi

pick_ssh() { # pick_ssh "label" "current value" -> $PICKED (empty = none)
  local label="$1" current="$2" line agent=() fps=() i mark
  PICKED=""
  while :; do
    say
    say "${B}$label${N}"
    [ -n "$current" ] && say "  k  keep the current one: $(ssh_fp "$current")"
    mapfile -t agent < <(ssh-add -L 2>/dev/null | grep -E '^(ssh|sk|ecdsa)-' || true)
    fps=()
    if [ "${#agent[@]}" -gt 0 ]; then
      say "  Keys in your SSH agent (same fingerprints as 'ssh-add -l'):"
      for i in "${!agent[@]}"; do
        fps[i]="$(ssh_fp "${agent[$i]}")"
        mark=""
        [ -n "$GIT_SIGN_FP" ] && [ "${fps[$i]}" = "$GIT_SIGN_FP" ] && mark="  <- git signs with this one"
        [ -n "$current" ] && [ "${fps[$i]}" = "$(ssh_fp "$current")" ] && mark="$mark  <- in the manifest now"
        say "  $((i + 1))  ${fps[$i]}  $(awk '{ print $1 }' <<<"${agent[$i]}")  $(cut -d' ' -f3- <<<"${agent[$i]}")$mark"
      done
      say "     (type the number, or paste the SHA256:... fingerprint)"
    fi
    have op && say "  o  create a new Ed25519 key in 1Password with the op CLI"
    say "  p  paste a public key line"
    say "  f  read a .pub file"
    say "  s  none (the line is left out)"
    ask "Choice" "$([ -n "$current" ] && echo k || echo p)"
    line=""
    case "$REPLY" in
      k) line="$current" ;;
      SHA256:*) for i in "${!agent[@]}"; do [ "${fps[$i]}" = "$REPLY" ] && line="${agent[$i]}"; done ;;
      [0-9]*) if [[ "$REPLY" =~ ^[0-9]+$ ]] && [ "$REPLY" -ge 1 ] && [ "$REPLY" -le "${#agent[@]}" ]; then line="${agent[$((REPLY - 1))]}"; fi ;;
      o)
        [ -n "$OP_VAULT" ] || { ask "Vault" "Private"; OP_VAULT="$REPLY"; }
        ask "Title of the new item" "akl.dev git signing"
        if op item create --category ssh --title "$REPLY" --vault "$OP_VAULT" --ssh-generate-key ed25519 >/dev/null &&
          line="$(op read "op://$OP_VAULT/$REPLY/public key")"; then
          say "Created '$REPLY' in vault $OP_VAULT."
        else
          say "The op CLI call failed. Create the key in the app (New Item, SSH Key) and paste its public key."
          line=""
        fi
        ;;
      p) ask "Public key line (ssh-ed25519 AAAA...)"; line="$REPLY" ;;
      f) ask "Path of the .pub file"; line="$(head -n 1 "${REPLY/#\~/$HOME}" 2>/dev/null || true)" ;;
      s) return 0 ;;
    esac
    if [ -n "$line" ] && valid_ssh "$line"; then
      PICKED="$(awk '{ print $1 " " $2 }' <<<"$line")"   # type and key; the comment is dropped
      say "  $(ssh-keygen -l -f "$WORK/k.pub")"
      return 0
    fi
    say "No valid SSH public key came out of that choice. Try again."
  done
}

say "The manifest lists the SSH key you sign git commits with. With 1Password:"
say "create an SSH Key item (Ed25519) in the app, or let this script do it with"
say "the op CLI, and turn on the 1Password SSH agent (Settings, Developer)."
pick_ssh "SSH signing key (git commits and tags)" "$(cur_field SSH-Signing)"; SSH_SIGNING="$PICKED"
if [ -n "$SSH_SIGNING" ] && confirm "Use the same key for SSH login (SSH-Auth)?" y; then
  SSH_AUTH="$SSH_SIGNING"
else
  pick_ssh "SSH authentication key (logins)" "$(cur_field SSH-Auth)"; SSH_AUTH="$PICKED"
fi
ask "age recipient (age1..., empty for none)" "$(cur_field Age)"; AGE="$REPLY"
if [ -n "$AGE" ] && [[ ! "$AGE" =~ ^age1[a-z0-9]+$ ]]; then die "'$AGE' is not an age recipient"; fi

# --- 4. site files -------------------------------------------------------------------
stage "4/4 site files"
confirm "Write the site files now (export, manifest, allowed_signers, security.txt, sign, check)?" y ||
  { say "Stopped before touching the repo. Fingerprint: $FPR"; exit 0; }

"$HERE/export-identity.sh" "$FPR" "$ROOT"

mapfile -t KEY_ADDRS < <({ key_addrs | grep -xF "$KEY_ADDR" || true; key_addrs | grep -vxF "$KEY_ADDR" || true; })
TODAY="$(date -u +%F)"
NEXT_YEAR="$(node -e 'const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() + 1); console.log(d.toISOString().slice(0, 10))')"
ask "Manifest Issued" "$TODAY"; ISSUED="$REPLY"
ask "Manifest Expires (the build fails 30 days before this date)" "$NEXT_YEAR"; EXPIRES="$REPLY"
for d in "$ISSUED" "$EXPIRES"; do [[ "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "'$d' is not a YYYY-MM-DD date"; done

FILL=(--file "$SRC" --set "Issued=$ISSUED" --set "Expires=$EXPIRES" --set "Fingerprint=$FPR"
  --emails "$(IFS=,; echo "${KEY_ADDRS[*]}")")
optional() { # optional Key value: set it, drop the line when empty
  if [ -z "$2" ]; then FILL+=(--drop "$1")
  elif grep -q "^$1:" "$SRC"; then FILL+=(--set "$1=$2")
  else say "note: $SRC has no '$1:' line any more; add '$1: $2' by hand and run 'npm run identity:sign'"; fi
}
optional SSH-Signing "$SSH_SIGNING"
optional SSH-Auth "$SSH_AUTH"
optional Age "$AGE"
node "$HERE/fill-identity.mjs" "${FILL[@]}"
say "filled $SRC"

ALLOWED_NOW="$(awk '!/^#/ && NF { print $1; exit }' public/allowed_signers 2>/dev/null || true)"
if [ -n "$SSH_SIGNING" ]; then
  ask "Addresses your commits use (allowed_signers principals, comma-separated)" "${ALLOWED_NOW:-adam@loghry.org}"
  { grep '^#' identity/allowed_signers.example; printf '%s namespaces="git" %s\n' "${REPLY// /}" "$SSH_SIGNING"; } >public/allowed_signers
  say "wrote public/allowed_signers"
fi

SEC="public/.well-known/security.txt"
if ! grep -q '^Encryption: .*/pgp\.asc$' "$SEC"; then
  [ -z "$(tail -c 1 "$SEC")" ] || echo >>"$SEC"
  echo 'Encryption: https://akl.dev/pgp.asc' >>"$SEC"
  say "added the Encryption line to $SEC"
fi

say "Signing the manifest (GnuPG may ask for the passphrase)."
IDENTITY_KEY="$FPR" "$HERE/sign-identity.sh" "$ROOT"
env -u IDENTITY_PENDING node "$HERE/verify-identity.mjs" --root "$ROOT"

# --- done ---------------------------------------------------------------------------
stage "done"
say "Fingerprint: ${B}$FPR${N}"
say
say "Still to do, in this order:"
say "  1. Tell the implementer the key is in (or do the 'pending to published'"
say "     list in docs/identity-runbook.md step 6). Until then 'npm run build' fails"
say "     on purpose, because package.json still carries IDENTITY_PENDING=1."
if [ -n "$SSH_SIGNING" ]; then
  say "  2. Git commit signing (on NixOS put this in your git module instead):"
  say "       git config --global gpg.format ssh"
  say "       git config --global user.signingkey 'key::$SSH_SIGNING'"
  say "       git config --global commit.gpgsign true"
  say "       git config --global tag.gpgsign true"
  say "     With the 1Password agent also set gpg.ssh.program to op-ssh-sign"
  say "     (the SSH key item's 'Configure commit signing' button shows the exact path)."
fi
if [ "$BACKED_UP" -ne 1 ]; then say "  !  No confirmed copy of the private key in 1Password. Run this script again and do stage 2."; fi
say
say "Nothing was committed. New and changed files:"
say "  public/pgp.asc  public/identity.txt  public/allowed_signers"
say "  public/.well-known/security.txt  $SRC"
