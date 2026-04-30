const crypto = require('crypto');

module.exports = {
  generate({ files, board, libraries }) {
    const content = JSON.stringify({
      files: files.map(f => ({ name: f.name, content: f.content })).sort((a, b) => a.name.localeCompare(b.name)),
      board,
      libraries: [...(libraries || [])].sort(),
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }
};
