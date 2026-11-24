const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

execFileSync(process.execPath, [path.join(ROOT, 'backend', 'sync-shared.js')], { stdio: 'inherit' });

const programs = [
  { name: 'student', folder: 'backend/student-service', args: ['--watch', 'server.js'] },
  { name: 'session', folder: 'backend/instructor-session-service', args: ['--watch', 'server.js'] },
  { name: 'course ', folder: 'backend/course-reports-service', args: ['--watch', 'server.js'] },
  { name: 'website', folder: 'frontend', args: ['node_modules/http-server/bin/http-server', '.', '-p', '8080', '-c-1'] }
];

const children = [];
for (const { name, folder, args } of programs) {
  const child = spawn(process.execPath, args, { cwd: path.join(ROOT, folder) });
  children.push(child);
  const print = (data) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) console.log(`[${name}] ${line}`);
    }
  };
  child.stdout.on('data', print);
  child.stderr.on('data', print);
}

process.on('SIGTERM', () => {
  children.forEach((child) => child.kill());
  process.exit(0);
});
