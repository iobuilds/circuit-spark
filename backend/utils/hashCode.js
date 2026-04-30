const crypto = require('crypto');

// Bump this whenever the compile pipeline's *semantics* change in a way that
// must invalidate previously cached results — e.g. adding a new validator,
// changing how errors are surfaced, or upgrading the toolchain. Every cache
// key is salted with this tag, so bumping it instantly orphans every old
// entry without needing to flush Redis.
//
// History:
//   v1 — initial cache
//   v2 — added board-aware pin-range validator (digitalWrite(60,…) etc.)
const PIPELINE_VERSION = 'v2';

module.exports = {
  PIPELINE_VERSION,
  generate({ files, board, libraries }) {
    const content = JSON.stringify({
      v: PIPELINE_VERSION,
      files: files.map(f => ({ name: f.name, content: f.content })).sort((a, b) => a.name.localeCompare(b.name)),
      board,
      libraries: [...(libraries || [])].sort(),
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }
};
