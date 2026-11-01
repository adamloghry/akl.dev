# Formatting for repo tooling only. Shipped bytes and design-owned sources are excluded:
# forest.js/global.css must stay byte-identical to docs/handoff/reference/, public/ is the
# deployed artefact, and docs/handoff/ is the design provenance.
{ ... }:
{
  perSystem =
    { ... }:
    {
      treefmt = {
        projectRootFile = "flake.nix";
        programs.nixfmt.enable = true;
        programs.prettier = {
          enable = true;
          includes = [
            "*.json"
            "*.yml"
            "*.yaml"
          ];
        };
        settings.excludes = [
          "public/**"
          "docs/handoff/**"
          "src/scripts/forest.js"
          "src/styles/global.css"
          "package-lock.json"
          "flake.lock"
          "tmp/**"
        ];
      };
    };
}
