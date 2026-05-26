import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const launchDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
const logDir = path.join(root, 'logs');

mkdirSync(launchDir, { recursive: true });
mkdirSync(logDir, { recursive: true });

function plist(label, hour, minute, npmScript) {
  const log = path.join(logDir, `${label}.log`);
  const err = path.join(logDir, `${label}.err.log`);
  const command = `cd ${JSON.stringify(root)} && npm run ${npmScript}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${escapeXml(command)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(root)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(err)}</string>
</dict>
</plist>
`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function install(label, content) {
  const file = path.join(launchDir, `${label}.plist`);
  writeFileSync(file, content);
  try {
    execFileSync('launchctl', ['unload', file], { stdio: 'ignore' });
  } catch {
    // Not loaded yet.
  }
  execFileSync('launchctl', ['load', '-w', file], { stdio: 'inherit' });
  return file;
}

const fetchFile = install('com.repopulse.fetch', plist('com.repopulse.fetch', 6, 0, 'local:fetch'));
const publishFile = install('com.repopulse.publish', plist('com.repopulse.publish', 7, 0, 'local:publish'));

console.log(`Installed ${fetchFile}`);
console.log(`Installed ${publishFile}`);
