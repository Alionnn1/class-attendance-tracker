const fs = require('node:fs');
const path = require('node:path');

function serviceUrls(deployed) {
  if (!deployed) {
    return { student: 'http://localhost:3001', session: 'http://localhost:3002', course: 'http://localhost:3003' };
  }
  const config = fs.readFileSync(path.join(__dirname, 'build', 'website', 'js', 'config.js'), 'utf8');
  const url = (name) => config.match(new RegExp(`${name}: '([^']+)'`))[1];
  return { student: url('student'), session: url('session'), course: url('course') };
}

module.exports = { serviceUrls };
