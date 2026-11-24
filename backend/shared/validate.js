const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkText(value, label, min, max) {
  if (typeof value !== 'string') {
    return `${label} is required.`;
  }
  const length = value.trim().length;
  if (length < min || length > max) {
    return `${label} must contain between ${min} and ${max} characters.`;
  }
  return null;
}

function checkEmail(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'Email is required.';
  }
  const email = value.trim();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return 'Email must be a valid email address.';
  }
  return null;
}

function checkPassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    return 'Password must contain between 8 and 128 characters.';
  }
  return null;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function parseId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return id <= 2147483647 ? id : null;
}

function isId(value) {
  return Number.isInteger(value) && value >= 1 && value <= 2147483647;
}

function checkIdList(value, label) {
  if (!Array.isArray(value) || value.length > 50 || !value.every(isId)) {
    return `${label} must be a list of ids.`;
  }
  return null;
}

module.exports = {
  checkText,
  checkEmail,
  checkPassword,
  normalizeEmail,
  parseId,
  isId,
  checkIdList
};
