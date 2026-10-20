// =====================================================================
//  One-click launcher used by start.command (macOS) and start.bat (Windows).
//  1. checks the Node.js version
//  2. creates .env on first run (asks for the MySQL password)
//  3. runs `npm install` if dependencies are missing
//  4. starts the server and opens the browser when it is ready
//  Only Node built-ins are used.
// =====================================================================
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
process.chdir(root);
const isWin = process.platform === 'win32';

function fail(message) {
  console.error('\n❌ ' + message + '\n');
  process.exit(1);
}

// 1. Node.js version (--env-file-if-exists needs 22.9+)
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 9)) {
  fail(`Node.js ${process.versions.node} is too old. Install the LTS version (22 or 24) from https://nodejs.org`);
}

function askAll(questions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answers = [];
  return new Promise((resolve) => {
    const next = () => {
      if (answers.length === questions.length) { rl.close(); return resolve(answers); }
      rl.question(questions[answers.length], (a) => { answers.push(a); next(); });
    };
    rl.on('close', () => resolve(answers.concat(Array(questions.length - answers.length).fill(''))));
    next();
  });
}

async function main() {
  console.log('\n🍽️  Food Advisor — starting…\n');

  // 2. .env with the MySQL password
  if (!fs.existsSync('.env')) {
    console.log('First run on this computer: let\'s connect to MySQL.');
    const [userAnswer, password] = await askAll(['  MySQL user [root]: ', '  MySQL password (press Enter if there is none): ']);
    const user = userAnswer.trim() || 'root';
    const env = fs.readFileSync('.env.example', 'utf8')
      .replace(/^DB_USER=.*$/m, `DB_USER=${user}`)
      .replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${password}`);
    fs.writeFileSync('.env', env);
    console.log('  ✅ Saved to .env (you can edit it later)\n');
  }

  // 3. dependencies
  if (!fs.existsSync(path.join('node_modules', 'express')) || !fs.existsSync(path.join('node_modules', 'mysql2'))) {
    console.log('Installing dependencies (first run only)…');
    const r = spawnSync(isWin ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], { stdio: 'inherit', shell: isWin });
    if (r.status !== 0) fail('npm install failed. Check your internet connection and try again.');
  }

  // 4. start the server, open the browser once it is ready
  const port = (fs.readFileSync('.env', 'utf8').match(/^PORT=(\d+)/m) || [])[1] || '3000';
  const url = `http://localhost:${port}`;
  const server = spawn(process.execPath, ['--env-file-if-exists=.env', 'server.js'], { stdio: ['inherit', 'pipe', 'pipe'] });
  let opened = false;
  const openBrowser = () => {
    if (opened) return;
    opened = true;
    if (isWin) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
    console.log(`\n👉 Opened ${url} — keep this window open. Press Ctrl+C to stop the server.\n`);
  };
  server.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
    if (/✅/.test(chunk.toString())) openBrowser();
  });
  server.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
    if (/EADDRINUSE/.test(chunk.toString())) console.error(`\n❌ Port ${port} is busy. Is Food Advisor already running? Or change PORT in .env.\n`);
  });
  server.on('exit', (code) => process.exit(code || 0));
  process.on('SIGINT', () => server.kill('SIGINT'));
}

main().catch((err) => fail(err.message));
