// =====================================================================
//  npm run share — get a temporary public https link to the app running
//  on THIS computer (for user testing), using a free Cloudflare quick tunnel.
//  The site and database stay on your machine; the link stops working as
//  soon as you close this window (Ctrl+C).
//  Requires `cloudflared`:  macOS: brew install cloudflared
//                           Windows: winget install --id Cloudflare.cloudflared
// =====================================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

process.chdir(path.join(__dirname, '..'));
const isWin = process.platform === 'win32';
const envFile = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
const port = process.env.PORT || (envFile.match(/^PORT=(\d+)/m) || [])[1] || '3000';
const children = [];

function findCloudflared() {
  const candidates = ['cloudflared', '/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'];
  return candidates.find((c) => spawnSync(c.includes(' ') ? `"${c}"` : c, ['--version'], { stdio: 'ignore', shell: isWin }).status === 0);
}

function isUp() {
  return new Promise((resolve) => {
    http.get(`http://127.0.0.1:${port}/api/health`, (res) => { res.resume(); resolve(res.statusCode === 200); })
      .on('error', () => resolve(false));
  });
}

async function main() {
  const cloudflared = findCloudflared();
  if (!cloudflared) {
    console.error('\n❌ cloudflared is not installed.\n   macOS:   brew install cloudflared\n   Windows: winget install --id Cloudflare.cloudflared\n');
    process.exit(1);
  }

  if (!(await isUp())) {
    console.log(`▶ Starting Food Advisor on port ${port}…`);
    const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'server.js'], { stdio: 'inherit', env: { ...process.env, PORT: port } });
    children.push(server);
    for (let i = 0; i < 40 && !(await isUp()); i++) await new Promise((r) => setTimeout(r, 500));
    if (!(await isUp())) { console.error('❌ The server did not start. Is MySQL running?'); shutdown(1); }
  } else {
    console.log(`▶ Food Advisor is already running on port ${port}`);
  }

  console.log('▶ Opening a public tunnel (takes ~5 seconds)…');
  const tunnel = spawn(cloudflared.includes(' ') && isWin ? `"${cloudflared}"` : cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { shell: isWin });
  children.push(tunnel);
  let shown = false;
  const onData = (chunk) => {
    const m = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !shown) {
      shown = true;
      const line = '─'.repeat(m[0].length + 4);
      console.log(`\n  ┌${line}┐\n  │  ${m[0]}  │\n  └${line}┘\n`);
      console.log('  ✅ Send this link to your testers. It works while this window stays open.');
      console.log('  💬 Their feedback appears in Admin panel → Feedback.');
      console.log('  🔒 The demo-login buttons are hidden on the public link.');
      console.log('  Press Ctrl+C to stop sharing.\n');
    }
  };
  tunnel.stdout.on('data', onData);
  tunnel.stderr.on('data', onData);
  tunnel.on('exit', (code) => { if (!shown) console.error('❌ Could not open the tunnel. Check your internet connection.'); shutdown(code || 0); });
}

function shutdown(code) {
  children.forEach((c) => { try { c.kill(); } catch (e) { /* already stopped */ } });
  process.exit(code);
}
process.on('SIGINT', () => { console.log('\nSharing stopped.'); shutdown(0); });

main().catch((err) => { console.error(err); shutdown(1); });
