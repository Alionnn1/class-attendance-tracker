const { callService } = require('../shared/services');

async function markAbsences(sessionId, courseId) {
  const { status, body } = await callService('STUDENT_SERVICE_URL', 'POST', '/attendance/absences',
    { internal: true, body: { sessionId, courseId } });
  if (status !== 201) throw new Error(`Student service answered ${status} when marking absences.`);
  return body.markedAbsent;
}

async function setExcuseStatus(excuseId, decision, reviewerId) {
  return callService('STUDENT_SERVICE_URL', 'PATCH', `/excuses/${excuseId}/status`,
    { internal: true, body: { decision, reviewerId } });
}

async function sendDueWarnings(courseId, token) {
  try {
    const { status, body } = await callService('COURSE_SERVICE_URL', 'POST', `/courses/${courseId}/warnings`, { token });
    if (status === 201 && Array.isArray(body)) return body;
    console.error(`Warnings for course ${courseId}: course service answered ${status}.`);
  } catch (error) {
    console.error(`Warnings for course ${courseId} failed: ${error.message}`);
  }
  return [];
}

module.exports = { markAbsences, setExcuseStatus, sendDueWarnings };
