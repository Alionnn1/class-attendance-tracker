const express = require('express');

const { requireAuth, requireInternal } = require('./shared/auth/middleware');
const { requireJson } = require('./shared/http');
const sessions = require('./controllers/sessions');
const excuses = require('./controllers/excuses');
const instructors = require('./controllers/instructors');

const router = express.Router();

router.get('/instructors/me/courses', requireAuth('instructor'), sessions.myCourses);
router.post('/sessions', requireAuth('instructor'), requireJson, sessions.openSession);
router.get('/sessions/open', requireInternal, sessions.findOpenByCode);
router.get('/sessions/:id', requireAuth('instructor'), sessions.getSession);
router.patch('/sessions/:id/close', requireAuth('instructor'), sessions.closeSession);
router.get('/courses/:courseId/excuses', requireAuth('instructor'), excuses.listCourseExcuses);
router.patch('/excuses/:id/review', requireAuth('instructor'), requireJson, excuses.reviewExcuse);

router.get('/instructors', requireAuth('admin'), instructors.listInstructors);
router.post('/instructors', requireAuth('admin'), requireJson, instructors.createInstructor);
router.patch('/instructors/:id', requireAuth('admin'), requireJson, instructors.updateInstructor);
router.delete('/instructors/:id', requireAuth('admin'), instructors.deleteInstructor);

module.exports = router;
