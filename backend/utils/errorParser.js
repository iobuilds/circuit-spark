module.exports = {
  parse(output) {
    if (!output) return [];
    const errors = [];
    const seen = new Set();

    // Pattern 1: file.ino:line:col: error: message
    const pattern1 = /([^:\n]+\.(ino|cpp|c|h)):(\d+):(\d+):\s*(error|fatal error):\s*(.+)/g;
    let match;
    while ((match = pattern1.exec(output)) !== null) {
      const key = `${match[1]}:${match[3]}:${match[6]}`;
      if (!seen.has(key)) {
        seen.add(key);
        errors.push({
          file: match[1].split('/').pop(),
          line: parseInt(match[3]),
          col: parseInt(match[4]),
          severity: 'error',
          message: match[6].trim(),
        });
      }
    }

    // Pattern 2: In function / In file included (context only)
    const contextPattern = /In (function|file included from) ['"]?([^'":\n]+)/g;
    let contextMatch;
    const contexts = [];
    while ((contextMatch = contextPattern.exec(output)) !== null) {
      contexts.push(contextMatch[2]);
    }

    if (errors.length === 0 && output.length > 0) {
      errors.push({
        file: 'sketch.ino',
        line: 1,
        col: 1,
        severity: 'error',
        message: output.replace(/\n/g, ' ').substring(0, 300),
      });
    }

    return errors;
  },

  parseWarnings(output) {
    if (!output) return [];
    const warnings = [];
    const seen = new Set();
    const pattern = /([^:\n]+\.(ino|cpp|c|h)):(\d+):(\d+):\s*warning:\s*(.+)/g;
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const key = `${match[1]}:${match[3]}:${match[5]}`;
      if (!seen.has(key)) {
        seen.add(key);
        warnings.push({
          file: match[1].split('/').pop(),
          line: parseInt(match[3]),
          col: parseInt(match[4]),
          severity: 'warning',
          message: match[5].trim(),
        });
      }
    }
    return warnings;
  }
};
