{
  description = "akl.dev landing page";

  nixConfig = {
    extra-substituters = [ "https://devenv.cachix.org" ];
    extra-trusted-public-keys = [ "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=" ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    devenv = {
      url = "github:cachix/devenv";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    inputs@{
      self,
      flake-parts,
      devenv,
      ...
    }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      imports = [
        inputs.treefmt-nix.flakeModule
        ./nix/treefmt.nix
      ];

      perSystem =
        {
          pkgs,
          lib,
          self',
          config,
          ...
        }:
        let
          treefmtWrapper = config.treefmt.build.wrapper;
          node = pkgs.nodejs_26;
        in
        {
          packages.default = pkgs.buildNpmPackage {
            pname = "akl-dev";
            version = "0.1.0";

            src = ./.;

            # importNpmLock derives the fixed-output derivations directly
            # from package-lock.json, so no npmDepsHash is needed.
            npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;

            nodejs = node;

            env = {
              ASTRO_TELEMETRY_DISABLED = "1";
              PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
              # Colophon.astro slices this to 7 chars; empty falls back to "dev".
              CF_PAGES_COMMIT_SHA = self.rev or self.dirtyRev or "";
            };

            installPhase = ''
              runHook preInstall
              cp -r dist $out
              runHook postInstall
            '';
          };

          apps =
            let
              # Deploy straight to Cloudflare Pages from a workstation, bypassing
              # the Pages Git integration: nix build -> dereference -> upload.
              deploy = pkgs.writeShellApplication {
                name = "deploy";
                runtimeInputs = [
                  pkgs.wrangler
                  pkgs.git
                ];
                text = ''
                  export WRANGLER_SEND_METRICS=false

                  src="''${1:-}"
                  if [ -z "$src" ]; then
                    if [ -e result ]; then
                      src=result
                    elif [ -d dist ]; then
                      src=dist
                    else
                      echo "error: no build found. Run 'nix build' (preferred — equivalent" >&2
                      echo "       to the Pages build: same lockfile and sources, though Pages" >&2
                      echo "       runs 'npm run build' on its own image) or 'npm run build'." >&2
                      exit 1
                    fi
                  fi
                  [ -f "$src/index.html" ] || { echo "error: $src/index.html not found" >&2; exit 1; }

                  : "''${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN (a token with the Cloudflare Pages:Edit permission)}"
                  : "''${CLOUDFLARE_ACCOUNT_ID:?set CLOUDFLARE_ACCOUNT_ID}"
                  : "''${CLOUDFLARE_PROJECT_NAME:?set CLOUDFLARE_PROJECT_NAME (the Pages project name)}"

                  # result/ is a symlink into the read-only nix store; wrangler wants
                  # a real, writable tree. -L dereferences it.
                  work=$(mktemp -d)
                  trap 'rm -rf "$work"' EXIT
                  cp -rL "$src" "$work/site"
                  chmod -R u+w "$work/site"

                  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo detached)
                  commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)
                  dirty=false
                  if ! git diff --quiet HEAD 2>/dev/null; then dirty=true; fi

                  echo "deploying $src -> Pages project $CLOUDFLARE_PROJECT_NAME (branch $branch, dirty=$dirty)"
                  wrangler pages deploy "$work/site" \
                    --project-name "$CLOUDFLARE_PROJECT_NAME" \
                    --branch "$branch" \
                    --commit-hash "$commit" \
                    --commit-dirty "$dirty"
                '';
              };
            in
            {
              deploy = {
                type = "app";
                program = "${deploy}/bin/deploy";
              };
            };

          devShells.default = devenv.lib.mkShell {
            inherit inputs pkgs;
            modules = [
              (
                { pkgs, ... }:
                {
                  languages.javascript = {
                    enable = true;
                    package = node;
                    npm.enable = true;
                    npm.install.enable = true;
                  };

                  # treefmt is the single formatting authority -- it already
                  # knows which files ship verbatim and must not be touched.
                  git-hooks.hooks = {
                    treefmt = {
                      enable = true;
                      package = treefmtWrapper;
                    };
                  };

                  scripts.dev.exec = "npm run dev";
                  scripts.build.exec = "npm run build";
                  scripts.preview.exec = "npm run preview";
                  scripts.verify.exec = "npm run verify";

                  env = {
                    # chromium + chromium_headless_shell only. Do NOT use playwright-driver.browsers-chromium: it omits
                    # the headless shell that the default headless chromium.launch() needs.
                    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers.override {
                      withFirefox = false;
                      withWebkit = false;
                    }}";
                    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
                    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
                    ASTRO_TELEMETRY_DISABLED = "1";
                  };

                  enterShell = ''
                    echo "akl.dev dev environment"
                    echo "  dev     - start the Astro dev server (npm run dev)"
                    echo "  build   - build the site to dist/ (npm run build)"
                    echo "  verify  - run the acceptance suite (npm run verify)"
                    echo "  nix flake check --impure - build, astro check, treefmt"
                  '';
                }
              )
            ];
          };

          checks.build = self'.packages.default;

          checks.playwright-pin =
            let
              npmPin = (builtins.fromJSON (builtins.readFile ./package.json)).devDependencies.playwright;
            in
            assert lib.assertMsg (npmPin == pkgs.playwright-driver.version)
              "package.json playwright (${npmPin}) != nixpkgs playwright-driver (${pkgs.playwright-driver.version}); see docs/runbook.md §9";
            pkgs.runCommand "playwright-pin" { } "touch $out";

          checks.astro-check = pkgs.buildNpmPackage {
            pname = "akl-dev-check";
            version = "0.1.0";
            src = ./.;
            npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
            npmConfigHook = pkgs.importNpmLock.npmConfigHook;
            # Same node as packages.default.
            nodejs = node;
            env = {
              ASTRO_TELEMETRY_DISABLED = "1";
              PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            };
            buildPhase = ''
              runHook preBuild
              npm run check
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              touch $out
              runHook postInstall
            '';
          };
        };
    };
}
