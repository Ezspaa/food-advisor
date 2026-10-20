// Small declarative validator used by every route that accepts input
// (NFR Data integrity: the server never trusts client-side validation alone).
//
//   const data = validate(req.body, {
//     name:   { type: 'string', required: true, min: 2, max: 80, label: 'Name' },
//     rating: { type: 'int', required: true, min: 1, max: 5 },
//   });
//
// Returns cleaned values or throws HttpError(422) with { field: message }.
const { HttpError } = require('./http-error');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHONE_RE = /^[+\d][\d\s()-]{5,24}$/;

function isEmpty(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function check(value, rule, label) {
  switch (rule.type) {
    case 'string': {
      const s = String(value).trim();
      if (rule.min && s.length < rule.min) return [null, `${label} must be at least ${rule.min} characters`];
      if (rule.max && s.length > rule.max) return [null, `${label} must be at most ${rule.max} characters`];
      if (rule.pattern && !rule.pattern.test(s)) return [null, rule.message || `${label} is not valid`];
      return [s];
    }
    case 'email': {
      const s = String(value).trim().toLowerCase();
      if (s.length > 120 || !EMAIL_RE.test(s)) return [null, 'Enter a valid email address'];
      return [s];
    }
    case 'password': {
      const s = String(value);
      if (s.length < 8 || s.length > 72) return [null, 'Password must be 8–72 characters'];
      if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return [null, 'Password must contain letters and numbers'];
      return [s];
    }
    case 'int':
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n) || (rule.type === 'int' && !Number.isInteger(n))) return [null, `${label} must be a number`];
      if (rule.min !== undefined && n < rule.min) return [null, `${label} must be at least ${rule.min}`];
      if (rule.max !== undefined && n > rule.max) return [null, `${label} must be at most ${rule.max}`];
      return [n];
    }
    case 'bool':
      return [value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0];
    case 'set': {
      // array or comma-separated string; every item must be allowed → 'a,b,c'
      const items = (Array.isArray(value) ? value : String(value).split(',')).map((x) => String(x).trim()).filter(Boolean);
      const bad = items.filter((x) => !rule.values.includes(x));
      if (bad.length) return [null, `${label} contains unknown values: ${bad.join(', ')}`];
      return [[...new Set(items)].join(',')];
    }
    case 'enum':
      if (!rule.values.includes(value)) return [null, `${label} must be one of: ${rule.values.join(', ')}`];
      return [value];
    case 'url': {
      const s = String(value).trim();
      if (s.length > (rule.max || 500)) return [null, `${label} is too long`];
      try {
        const u = new URL(s);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      } catch {
        return [null, `${label} must be a valid http(s) URL`];
      }
      return [s];
    }
    case 'time': {
      const s = String(value).trim();
      if (!TIME_RE.test(s)) return [null, `${label} must be a time like 09:00`];
      return [s.length === 5 ? `${s}:00` : s];
    }
    case 'date': {
      const s = String(value).trim();
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return [null, `${label} must be a valid date`];
      if (rule.notFuture && new Date(s) > new Date()) return [null, `${label} cannot be in the future`];
      return [s];
    }
    case 'phone': {
      const s = String(value).trim();
      if (!PHONE_RE.test(s)) return [null, `${label} must be a valid phone number`];
      return [s];
    }
    default:
      throw new Error(`Unknown rule type ${rule.type}`);
  }
}

function validate(input, rules) {
  const body = input || {};
  const values = {};
  const errors = {};
  for (const [field, rule] of Object.entries(rules)) {
    const label = rule.label || field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ');
    const raw = body[field];
    if (isEmpty(raw)) {
      if (rule.required) errors[field] = `${label} is required`;
      else values[field] = rule.type === 'bool' ? 0 : rule.type === 'set' ? '' : rule.default !== undefined ? rule.default : null;
      continue;
    }
    const [value, error] = check(raw, rule, label);
    if (error) errors[field] = error;
    else values[field] = value;
  }
  if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields', errors);
  return values;
}

/** Parse a positive integer route/query parameter or throw 400. */
function id(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `Invalid ${label}`);
  return n;
}

module.exports = { validate, id };
