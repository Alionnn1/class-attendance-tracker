const { sendError } = require('../shared/http');
const { isId, parseId } = require('../shared/validate');
const { getCourseForUser } = require('../shared/courses');
const { attendanceStatus } = require('../shared/policy');
const { attendanceTotals } = require('../services/studentService');
const { saveFile, downloadLink } = require('../services/storage');
const reports = require('../services/reports');

const SCOPES = ['course', 'student', 'session'];
const FORMATS = ['csv', 'json'];

async function courseRows(course) {
  const totals = await attendanceTotals(course.id);
  return totals.map((t) => {
    const total = t.present + t.absent + t.excused;
    return {
      student: t.fullName,
      email: t.email,
      present: t.present,
      absent: t.absent,
      excused: t.excused,
      attendancePercent: total === 0 ? 100 : Math.round((t.present / total) * 100),
      absencesRemaining: Math.max(course.absence_limit - t.absent, 0),
      status: attendanceStatus(t.absent, course)
    };
  });
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(','))].join('\n');
}

async function generateReport(req, res) {
  const { courseId, scope, format } = req.body ?? {};
  if (!isId(courseId)) return sendError(res, 400, 'VALIDATION_ERROR', 'courseId must be an id.');
  if (!SCOPES.includes(scope)) return sendError(res, 400, 'VALIDATION_ERROR', 'Scope must be course, student or session.', 'scope');
  if (!FORMATS.includes(format)) return sendError(res, 400, 'VALIDATION_ERROR', 'Format must be csv or json.', 'format');

  const { course, problem } = await getCourseForUser(req.user, courseId);
  if (problem) return sendError(res, ...problem);

  let rows;
  try {
    if (scope === 'course') rows = await courseRows(course);
    else if (scope === 'session') rows = await reports.sessionRows(course.id);
    else rows = await reports.studentRows(course.id);
  } catch (error) {
    console.error(`Report data for course ${course.id} failed: ${error.message}`);
    return sendError(res, 502, 'STUDENT_SERVICE_UNAVAILABLE', 'Attendance totals are not available right now. Try again in a minute.');
  }

  const content = format === 'csv' ? toCsv(rows) : JSON.stringify(rows, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileKey = `reports/${course.code}/${scope}-${stamp}.${format}`;
  try {
    await saveFile(fileKey, content, format === 'csv' ? 'text/csv' : 'application/json');
  } catch (error) {
    console.error(`Saving report file ${fileKey} failed: ${error.message}`);
    return sendError(res, 502, 'STORAGE_UNAVAILABLE', 'The report file could not be stored. Try again in a minute.');
  }

  const report = await reports.createReport({ courseId: course.id, scope, format, fileKey, createdBy: req.user.id });
  return res.status(201).json(report);
}

async function listReports(req, res) {
  let courseId = null;
  if (req.query.courseId !== undefined && req.query.courseId !== '') {
    courseId = parseId(req.query.courseId);
    if (!courseId) return sendError(res, 400, 'VALIDATION_ERROR', 'courseId must be an id.');
  }
  return res.status(200).json(await reports.listReports(req.user, courseId));
}

async function downloadReport(req, res) {
  const id = parseId(req.params.id);
  const report = id ? await reports.findReport(id) : null;
  if (!report) return sendError(res, 404, 'REPORT_NOT_FOUND', 'Report not found.');
  const { problem } = await getCourseForUser(req.user, report.courseId);
  if (problem) return sendError(res, ...problem);

  const fileName = `${report.courseCode}-${report.scope}-report-${report.id}.${report.format}`;
  try {
    return res.status(200).json({ url: await downloadLink(report.fileKey, fileName), fileName });
  } catch (error) {
    console.error(`Download link for ${report.fileKey} failed: ${error.message}`);
    return sendError(res, 502, 'STORAGE_UNAVAILABLE', 'The report file is not available right now. Try again in a minute.');
  }
}

module.exports = { generateReport, listReports, downloadReport };
