function attendanceStatus(absent, course) {
  if (absent > course.absence_limit) return 'barred';
  if (absent >= course.second_warning_at) return 'second_warning';
  if (absent >= course.first_warning_at) return 'first_warning';
  return 'safe';
}

function warningLevels(absent, course) {
  const levels = [];
  if (absent >= course.first_warning_at) levels.push('first_warning');
  if (absent >= course.second_warning_at) levels.push('second_warning');
  if (absent > course.absence_limit) levels.push('exam_barred');
  return levels;
}

module.exports = { attendanceStatus, warningLevels };
