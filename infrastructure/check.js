const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { EXAMPLE_PASSWORD } = require('../database/seed-data');
const { serviceUrls } = require('./service-urls');

const PASSWORD = (process.env.SEED_PASSWORD || '').trim() || EXAMPLE_PASSWORD;
const args = process.argv.slice(2);

const URLS = serviceUrls(args.includes('deployed'));

let passed = 0;
let failed = 0;
function check(label, ok, detail = '') {
  if (ok) passed += 1; else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok || !detail ? '' : `  -> ${detail}`}`);
}

async function call(service, method, urlPath, { token, body, internalKey } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (internalKey) headers['X-Internal-Key'] = internalKey;
  const response = await fetch(URLS[service] + urlPath, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, body: data };
}

async function login(email) {
  const r = await call('student', 'POST', '/auth/login', { body: { email, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`Login ${email} failed with ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function main() {
  console.log(`Checking ${args.includes('deployed') ? 'the deployed services' : 'the local services'}:`);
  console.log(`  ${URLS.student}\n  ${URLS.session}\n  ${URLS.course}\n`);

  for (const service of ['student', 'session', 'course']) {
    const r = await call(service, 'GET', '/health');
    check(`${service} service answers /health (${r.body?.runtime})`, r.status === 200);
  }

  let r = await call('student', 'POST', '/auth/login', { body: { email: 'admin@example.edu', password: 'wrong-password' } });
  check('wrong password -> 401', r.status === 401);
  const admin = await login('admin@example.edu');
  const instructor = await login('mona.hassan@example.edu');
  const omar = await login('omar.khaled@example.edu');
  const youssef = await login('youssef.ali@example.edu');
  check('admin, instructor and two students log in', true);
  r = await call('session', 'GET', '/instructors/me/courses');
  check('no token -> 401', r.status === 401);
  r = await call('session', 'GET', '/instructors/me/courses', { token: omar });
  check('student on an instructor endpoint -> 403', r.status === 403);
  r = await call('student', 'GET', '/courses/1/attendance-totals', { token: admin });
  check('internal endpoint without the internal key -> 401', r.status === 401);

  r = await call('session', 'GET', '/instructors/me/courses', { token: instructor });
  const cloud = r.body.find((c) => c.code === '25CSCI37H');
  check('instructor sees the Cloud course', r.status === 200 && Boolean(cloud));
  if (cloud.openSession) {
    await call('session', 'PATCH', `/sessions/${cloud.openSession.id}/close`, { token: instructor });
  }
  r = await call('session', 'POST', '/sessions', { token: instructor, body: { courseId: cloud.id, durationMinutes: 10 } });
  const session = r.body;
  check(`session opened with code ${session.code}`, r.status === 201 && /^[A-Z0-9]{6}$/.test(session.code), JSON.stringify(r.body));
  r = await call('session', 'POST', '/sessions', { token: instructor, body: { courseId: cloud.id, durationMinutes: 10 } });
  check('second open session for the same course -> 409', r.status === 409);

  r = await call('student', 'POST', '/attendance/check-in', { token: omar, body: { code: '' } });
  check('empty code -> 400', r.status === 400);
  r = await call('student', 'POST', '/attendance/check-in', { token: omar, body: { code: 'ZZZZZZ' } });
  check('wrong code -> 404', r.status === 404, JSON.stringify(r.body));
  r = await call('student', 'POST', '/attendance/check-in', { token: omar, body: { code: session.code } });
  check('student checks in -> 201', r.status === 201, JSON.stringify(r.body));
  r = await call('student', 'POST', '/attendance/check-in', { token: omar, body: { code: session.code } });
  check('second check-in -> 409', r.status === 409);
  r = await call('session', 'GET', `/sessions/${session.id}`, { token: instructor });
  check('instructor sees the check-in live', r.status === 200 && r.body.checkedIn.some((s) => s.studentName === 'Omar Khaled'));

  r = await call('session', 'PATCH', `/sessions/${session.id}/close`, { token: instructor });
  check(`session closed: ${r.body?.present} present, ${r.body?.absent} absent, ${r.body?.warningsSent?.length} warnings`,
    r.status === 200 && r.body.present >= 1 && r.body.absent >= 1, JSON.stringify(r.body));
  r = await call('student', 'POST', '/attendance/check-in', { token: youssef, body: { code: session.code } });
  check('check-in after the session closed -> 410', r.status === 410);

  r = await call('student', 'GET', '/students/me/attendance-summary', { token: youssef });
  const youssefCloud = r.body.find((c) => c.courseCode === '25CSCI37H');
  check(`summary: Youssef has ${youssefCloud.absent} absences in Cloud -> ${youssefCloud.status}`,
    r.status === 200 && youssefCloud.status === 'barred');

  r = await call('student', 'GET', '/students/me/attendance', { token: youssef });
  const absence = r.body.find((a) => a.sessionId === session.id);
  check('the new absence is on the student\'s list', absence?.status === 'absent');
  const present = r.body.find((a) => a.status === 'present');
  r = await call('student', 'POST', '/excuses', { token: youssef, body: { attendanceRecordId: present.id, reason: 'Test' } });
  check('excuse for a session the student attended -> 409', r.status === 409);
  r = await call('student', 'POST', '/excuses', { token: youssef, body: { attendanceRecordId: absence.id, reason: 'Hospital appointment (check script).' } });
  const excuse = r.body;
  check('excuse sent -> 201 pending', r.status === 201 && excuse.status === 'pending', JSON.stringify(r.body));
  r = await call('student', 'POST', '/excuses', { token: youssef, body: { attendanceRecordId: absence.id, reason: 'Again' } });
  check('second excuse for the same absence -> 409', r.status === 409);
  r = await call('session', 'PATCH', `/excuses/${excuse.id}/review`, { token: instructor, body: { decision: 'approve' } });
  check('instructor approves -> 200 (Student Service saves it)', r.status === 200 && r.body.status === 'approved', JSON.stringify(r.body));
  r = await call('session', 'PATCH', `/excuses/${excuse.id}/review`, { token: instructor, body: { decision: 'reject' } });
  check('deciding the same excuse again -> 409', r.status === 409);
  r = await call('student', 'GET', '/students/me/attendance', { token: youssef });
  check('the absence is now excused', r.body.find((a) => a.id === absence.id)?.status === 'excused');

  r = await call('course', 'GET', `/courses/${cloud.id}/flags`, { token: instructor });
  check(`flags: ${r.body.filter?.((f) => f.status !== 'safe').length} students past a warning level`, r.status === 200 && r.body.length > 0);
  r = await call('course', 'POST', `/courses/${cloud.id}/warnings`, { token: instructor });
  check('warnings checked again: none sent twice', r.status === 201 && r.body.length === 0, JSON.stringify(r.body));
  r = await call('course', 'POST', '/reports', { token: instructor, body: { courseId: cloud.id, scope: 'course', format: 'csv' } });
  const report = r.body;
  check('report created and stored in S3 -> 201', r.status === 201, JSON.stringify(r.body));
  r = await call('course', 'GET', `/reports/${report.id}/download`, { token: instructor });
  check('download link -> 200', r.status === 200 && r.body.url.startsWith('http'), JSON.stringify(r.body));
  const file = await fetch(r.body.url);
  const csv = await file.text();
  check('the link downloads the CSV file', file.status === 200 && csv.startsWith('student,email,present'), `${file.status} ${csv.slice(0, 80)}`);

  r = await call('course', 'POST', '/courses', {
    token: admin, body: { code: `CHK${Date.now() % 100000}`, name: 'Check Course', firstWarningAt: 2, secondWarningAt: 4, absenceLimit: 6 }
  });
  const temp = r.body;
  r = await call('session', 'GET', '/instructors?search=mona.hassan', { token: admin });
  const mona = r.body[0];
  await call('session', 'PATCH', `/instructors/${mona.id}`, { token: admin, body: { courseIds: [...mona.courseIds, temp.id] } });
  r = await call('session', 'POST', '/sessions', { token: instructor, body: { courseId: temp.id, durationMinutes: 5 } });
  const tempSession = r.body;
  await call('session', 'PATCH', `/sessions/${tempSession.id}/close`, { token: instructor });
  r = await call('course', 'DELETE', `/courses/${temp.id}`, { token: admin });
  check('delete a course that has a session -> 204', r.status === 204, JSON.stringify(r.body));
  r = await call('session', 'GET', `/sessions/${tempSession.id}`, { token: instructor });
  check('its session is deleted too -> 404', r.status === 404);

  if (args.includes('expiry')) {
    r = await call('session', 'POST', '/sessions', { token: instructor, body: { courseId: cloud.id, durationMinutes: 1 } });
    const short = r.body;
    console.log('       waiting 65 seconds for the code to expire...');
    await sleep(65000);
    r = await call('student', 'POST', '/attendance/check-in', { token: omar, body: { code: short.code } });
    check('expired code -> 410', r.status === 410);
    r = await call('session', 'GET', '/instructors/me/courses', { token: instructor });
    check('expired session closed by itself', r.body.find((c) => c.id === cloud.id).openSession === null);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(`\nCheck stopped: ${error.message}`);
  process.exit(1);
});
