import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

loadLocalEnv();

const NODE_BIN = process.env.NODE_BIN || process.execPath;
const EDGEONE_PROJECT_NAME = process.env.EDGEONE_PROJECT_NAME || 'king-github-trending-cn';
const EDGEONE_ENV = process.env.EDGEONE_ENV || 'production';
const EDGEONE_AREA = process.env.EDGEONE_AREA || 'global';
const EDGEONE_CLI_VERSION = process.env.EDGEONE_CLI_VERSION || '1.5.4';
const EDGEONE_API_TOKEN = process.env.EDGEONE_API_TOKEN || '';

function loadLocalEnv() {
  const file = path.resolve('.env.local');
  try {
    const text = readFileSync(file, 'utf8');
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return;
      const [key, ...rest] = trimmed.split('=');
      if (process.env[key]) return;
      process.env[key] = rest.join('=').replace(/^['"]|['"]$/g, '');
    });
  } catch {
    // Optional local-only config.
  }
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    stdio: 'inherit',
    env: process.env,
    ...options,
  });
}

function hasStagedChanges() {
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], { stdio: 'ignore' });
    return false;
  } catch {
    return true;
  }
}

function publishGithubDataChanges() {
  run('git', ['add', 'public/data/trending.json', 'data/deepseek-cache.json']);
  if (!hasStagedChanges()) {
    console.log('No data changes to publish.');
    return;
  }

  run('git', ['commit', '-m', 'chore: daily data refresh']);
  run('git', ['push']);
}

function publishEdgeOne() {
  if (!EDGEONE_API_TOKEN) {
    console.log('EDGEONE_API_TOKEN is not configured. Skipping EdgeOne deploy.');
    return;
  }

  run('npx', [
    '--yes',
    `edgeone@${EDGEONE_CLI_VERSION}`,
    'pages',
    'deploy',
    './dist',
    '-n',
    EDGEONE_PROJECT_NAME,
    '-t',
    EDGEONE_API_TOKEN,
    '-e',
    EDGEONE_ENV,
    '-a',
    EDGEONE_AREA,
  ]);
}

run(NODE_BIN, ['node_modules/vite/bin/vite.js', 'build']);
publishGithubDataChanges();
publishEdgeOne();
