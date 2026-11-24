const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, 'shared');
const services = ['student-service', 'instructor-session-service', 'course-reports-service'];

for (const service of services) {
  const target = path.join(__dirname, service, 'shared');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

console.log(`Copied shared/ into ${services.join(', ')}`);
