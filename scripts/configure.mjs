#!/usr/bin/env node
// Interactive configurator: points Claude Desktop at this server, with the
// user's own Canvas host and token. Safe to re-run — it merges into an
// existing config rather than replacing it, and always takes a backup first.

import { readFile, writeFile, copyFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Writable } from 'node:stream';
import { execFileSync } from 'node:child_process';

const SERVER_KEY = 'canvas';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Prefer a stable node path over process.execPath, which on Homebrew/nvm points
 * at a version-pinned directory that disappears on the next upgrade.
 */
function resolveNodeCommand() {
  const candidates = ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const version = execFileSync(candidate, ['-p', 'process.versions.node'], {
        encoding: 'utf8',
        timeout: 5000,
      }).trim();
      if (Number(version.split('.')[0]) >= 18) return candidate;
    } catch {
      // Not runnable; try the next candidate.
    }
  }
  return process.execPath;
}

function configPath() {
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    case 'win32':
      return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    default:
      return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Claude', 'claude_desktop_config.json');
  }
}

/** Prompt on the terminal; `secret` hides typed characters. */
function prompt(question, { secret = false } = {}) {
  if (!process.stdin.isTTY) {
    // Non-interactive (piped input): read a plain line.
    return new Promise(resolve => {
      const rl = readline.createInterface({ input: process.stdin });
      rl.once('line', line => { rl.close(); resolve(line.trim()); });
    });
  }

  return new Promise(resolve => {
    let muted = false;
    const out = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });

    const rl = readline.createInterface({ input: process.stdin, output: out, terminal: true });
    rl.question(question, answer => {
      if (secret) process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
    muted = secret;
  });
}

function normaliseBaseUrl(input) {
  let value = input.trim().replace(/\/+$/, '');
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  // People paste deep links; keep only the origin.
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

async function verifyToken(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/v1/users/self`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const detail = response.status === 401
      ? 'the token was rejected (check you copied all of it)'
      : `Canvas replied ${response.status} ${response.statusText}`;
    throw new Error(detail);
  }
  return response.json();
}

async function loadConfig(file) {
  if (!existsSync(file)) return {};
  const raw = await readFile(file, 'utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Your existing Claude Desktop config is not valid JSON, so this script will not touch it.\n` +
      `  File:  ${file}\n` +
      `  Error: ${error.message}\n` +
      `Fix or remove the file, then run this again.`
    );
  }
}

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    console.error(`Node 18 or newer is required (found ${process.versions.node}).`);
    process.exit(1);
  }

  const entryPoint = path.join(projectRoot, 'dist', 'index.js');
  if (!existsSync(entryPoint)) {
    console.error(`Build output missing at ${entryPoint}\nRun "npm install && npm run build" first.`);
    process.exit(1);
  }

  console.log('\nCanvas MCP — Claude Desktop setup\n');

  // Canvas host
  let baseUrl = normaliseBaseUrl(process.env.CANVAS_BASE_URL ?? '');
  while (!baseUrl) {
    const answer = await prompt('Your Canvas URL (e.g. https://canvas.yourschool.edu): ');
    baseUrl = normaliseBaseUrl(answer);
    if (!baseUrl) console.log('  That did not look like a URL. Try again.\n');
  }

  // Token
  console.log(
    `\nCreate a token in Canvas: Account -> Settings -> Approved Integrations\n` +
    `-> "+ New Access Token". Copy it now; Canvas shows it only once.\n` +
    `(If there is no button, your institution has disabled student tokens.)\n`
  );
  let token = (process.env.CANVAS_API_TOKEN ?? '').trim();
  let user = null;
  while (!user) {
    if (!token) token = await prompt('Paste your Canvas API token: ', { secret: true });
    if (!token) continue;

    process.stdout.write('Checking the token... ');
    try {
      user = await verifyToken(baseUrl, token);
      console.log(`ok — signed in as ${user.name}\n`);
    } catch (error) {
      console.log(`failed: ${error.message}\n`);
      token = '';
      if (process.env.CANVAS_API_TOKEN) process.exit(1); // non-interactive: do not loop
    }
  }

  // Where downloaded files land
  const defaultDownloads = path.join(homedir(), 'Downloads', 'canvas');
  const downloadAnswer = process.env.CANVAS_DOWNLOAD_DIR
    ?? await prompt(`Save downloaded Canvas files to [${defaultDownloads}]: `);
  const downloadDir = downloadAnswer?.trim() ? path.resolve(downloadAnswer.trim().replace(/^~(?=$|\/)/, homedir())) : defaultDownloads;

  // Merge into the Claude Desktop config
  const file = configPath();
  const config = await loadConfig(file);

  if (existsSync(file)) {
    const backup = `${file}.backup`;
    await copyFile(file, backup);
    console.log(`Backed up existing config to ${backup}`);
  }

  config.mcpServers ??= {};
  const replacing = Boolean(config.mcpServers[SERVER_KEY]);
  config.mcpServers[SERVER_KEY] = {
    command: resolveNodeCommand(),
    args: [entryPoint],
    env: {
      CANVAS_API_TOKEN: token,
      CANVAS_BASE_URL: baseUrl,
      CANVAS_DOWNLOAD_DIR: downloadDir,
    },
  };

  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600).catch(() => {});

  const others = Object.keys(config.mcpServers).filter(k => k !== SERVER_KEY);
  console.log(
    `\n${replacing ? 'Updated' : 'Added'} the "${SERVER_KEY}" server in ${file}` +
    (others.length ? `\nLeft your other servers untouched: ${others.join(', ')}` : '')
  );
  console.log(`Downloads will go to ${downloadDir}`);
  console.log(
    `\nDone. Quit Claude Desktop completely (Cmd+Q / Alt+F4 — closing the window is not enough),\n` +
    `reopen it, then ask: "list my courses".\n`
  );
}

main().catch(error => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
