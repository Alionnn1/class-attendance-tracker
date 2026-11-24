const express = require('express');

const { requireAuth, requireInternal } = require('./shared/auth/middleware');
const { requireJson } = require('./shared/http');
const students = require('./controllers/students');
const attendance = require('./controllers/attendance');
const excuses = require('./controllers/excuses');

const router = express.Router();

router.post('/attendance/check-in', requireAuth('student'), requireJson, attendance.checkIn);
router.get('/students/me/attendance-summary', requireAuth('student'), attendance.mySummary);
router.get('/students/me/attendance', requireAuth('student'), attendance.myAttendance);
router.get('/students/me/excuses', requireAuth('student'), excuses.myExcuses);
router.post('/excuses', requireAuth('student'), requireJson, excuses.submitExcuse);

router.get('/students', requireAuth('admin'), students.listStudents);
router.post('/students', requireAuth('admin'), requireJson, students.createStudent);
router.patch('/students/:id', requireAuth('admin'), requireJson, students.updateStudent);
router.delete('/students/:id', requireAuth('admin'), students.deleteStudent);

router.post('/attendance/absences', requireInternal, requireJson, attendance.markAbsences);
router.patch('/excuses/:id/status', requireInternal, requireJson, excuses.setExcuseStatus);
router.get('/courses/:courseId/attendance-totals', requireInternal, attendance.courseTotals);

module.exports = router;
