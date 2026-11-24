const express = require('express');

const { requireAuth } = require('./shared/auth/middleware');
const { requireJson } = require('./shared/http');
const courses = require('./controllers/courses');
const flags = require('./controllers/flags');
const reports = require('./controllers/reports');

const router = express.Router();

router.get('/courses', requireAuth(), courses.listCourses);
router.get('/courses/:id', requireAuth(), courses.getCourse);
router.post('/courses', requireAuth('admin'), requireJson, courses.createCourse);
router.patch('/courses/:id', requireAuth('admin'), requireJson, courses.updateCourse);
router.delete('/courses/:id', requireAuth('admin'), courses.deleteCourse);

router.get('/courses/:courseId/flags', requireAuth('instructor', 'admin'), flags.getFlags);
router.post('/courses/:courseId/warnings', requireAuth('instructor', 'admin'), flags.sendWarnings);

router.post('/reports', requireAuth('instructor', 'admin'), requireJson, reports.generateReport);
router.get('/reports', requireAuth('instructor', 'admin'), reports.listReports);
router.get('/reports/:id/download', requireAuth('instructor', 'admin'), reports.downloadReport);

module.exports = router;
