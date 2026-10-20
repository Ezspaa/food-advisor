// An Error that carries an HTTP status code; the central error handler in
// server.js turns it into a JSON response.
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);

module.exports = { HttpError, notFound, forbidden };
