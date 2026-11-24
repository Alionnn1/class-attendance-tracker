const KEY = 'cat-session';

const HOME_PAGES = {
  student: 'student.html',
  instructor: 'instructor.html',
  admin: 'admin.html'
};

export function getSession() {
  try {
    const session = JSON.parse(sessionStorage.getItem(KEY));
    if (!session || !session.token) return null;
    if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
  }
}

export function homeFor(role) {
  return HOME_PAGES[role] || 'index.html';
}

export function requireRole(role) {
  const session = getSession();
  if (!session) {
    location.replace('index.html');
    return null;
  }
  if (session.role !== role) {
    location.replace(homeFor(session.role));
    return null;
  }
  return session;
}
