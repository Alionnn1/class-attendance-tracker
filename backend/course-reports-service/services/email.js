const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 8000;

const EXAMPLE_DOMAINS = ['example.com', 'example.net', 'example.org', 'example.edu'];

function isExampleAddress(email) {
  const domain = email.split('@')[1].toLowerCase();
  return EXAMPLE_DOMAINS.includes(domain);
}

function warningEmail(level, student, course) {
  const title = `${course.code} ${course.name}`;
  const left = course.absence_limit - student.absent;
  const greeting = `Dear ${student.fullName},\n\n`;
  const footer = '\n\nIf an absence had a valid reason, send an excuse from the Excuses page.\n\nAttendance Tracker';

  if (level === 'exam_barred') {
    return {
      subject: `Barred from the unseen exam: ${course.code}`,
      text: `${greeting}You have ${student.absent} absences in ${title}, more than the ${course.absence_limit} allowed, so you cannot sit the unseen exam of this course. Contact your instructor if you think this is wrong.\n\nAttendance Tracker`
    };
  }
  const which = level === 'first_warning' ? 'First' : 'Second';
  return {
    subject: `${which} attendance warning: ${course.code}`,
    text: `${greeting}You have ${student.absent} absences in ${title}. The course allows ${course.absence_limit}; one more than that bars you from the unseen exam. You have ${left} ${left === 1 ? 'absence' : 'absences'} left.${footer}`
  };
}

async function sendWarningEmail(level, student, course) {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) return { sent: true, result: 'not sent: BREVO_API_KEY is not set' };
  if (isExampleAddress(student.email)) return { sent: true, result: 'not sent: example address' };

  const { subject, text } = warningEmail(level, student, course);
  try {
    const response = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: process.env.EMAIL_SENDER, name: 'Attendance Tracker' },
        to: [{ email: student.email, name: student.fullName }],
        subject,
        textContent: text
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (response.status === 201) {
      const body = await response.json();
      return { sent: true, result: `sent (${body.messageId})` };
    }
    return { sent: false, result: `refused by the email API (${response.status})` };
  } catch (error) {
    return { sent: false, result: `email API not reachable (${error.message})` };
  }
}

module.exports = { sendWarningEmail };
