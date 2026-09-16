function result(section, id, name, status, message, fix) {
  return { section, id, name, status, message, ...(fix ? { fix } : {}) };
}

module.exports = { result };
