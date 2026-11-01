// Pins the npm `playwright` devDependency to nixpkgs' playwright-driver.version
// (browsers come from Nix, so the two must match exactly). Requires nix.
// Usage: npm run pin-playwright
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const expr =
  '(builtins.getFlake (toString ./.)).inputs.nixpkgs.legacyPackages.${builtins.currentSystem}.playwright-driver.version';
const read = () => JSON.parse(readFileSync('package.json', 'utf8')).devDependencies.playwright;

const before = read();
const version = execFileSync('nix', ['eval', '--impure', '--raw', '--expr', expr], {
  encoding: 'utf8',
}).trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`unexpected playwright-driver version: ${version}`);

execFileSync('npm', ['install', '--save-dev', '--save-exact', `playwright@${version}`], {
  stdio: 'inherit',
});
console.log(`playwright: ${before} -> ${read()}`);
