const { callService } = require('../shared/services');

async function attendanceTotals(courseId) {
  const { status, body } = await callService('STUDENT_SERVICE_URL', 'GET',
    `/courses/${courseId}/attendance-totals`, { internal: true });
  if (status !== 200) throw new Error(`Student service answered ${status}.`);
  return body;
}

module.exports = { attendanceTotals };
