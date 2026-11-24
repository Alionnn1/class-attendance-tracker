const fs = require('node:fs');
const path = require('node:path');

const [buildFolder, ...pairs] = process.argv.slice(2);
const all = {};
for (const pair of pairs) {
  const at = pair.indexOf('=');
  const value = pair.slice(at + 1);
  if (value) all[pair.slice(0, at)] = value;
}

const common = ['DATABASE_URL', 'INTERNAL_API_KEY', 'TOKEN_TTL_HOURS', 'CORS_ORIGINS'];
const perService = {
  student: [...common, 'SESSION_SERVICE_URL'],
  session: [...common, 'STUDENT_SERVICE_URL', 'COURSE_SERVICE_URL'],
  course: [...common, 'STUDENT_SERVICE_URL', 'BREVO_API_KEY', 'EMAIL_SENDER', 'REPORTS_BUCKET', 'S3_PUBLIC_ENDPOINT']
};

for (const [service, names] of Object.entries(perService)) {
  const variables = { NODE_ENV: 'production' };
  for (const name of names) {
    if (all[name] !== undefined) variables[name] = all[name];
  }
  fs.writeFileSync(path.join(buildFolder, `env-${service}.json`), JSON.stringify({ Variables: variables }, null, 2));
}
console.log('Settings written for student, session, course');
