const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const libraryManager = require('../services/libraryManager');

const upload = multer({
  dest: '/tmp/embedsim-uploads/',
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.zip') {
      return cb(new Error('Only .zip files allowed'));
    }
    cb(null, true);
  }
});

router.get('/', async (req, res) => {
  try { res.json(await libraryManager.list()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/search', async (req, res) => {
  try { res.json(await libraryManager.search(req.query.q || '', req.query.topic)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/install', async (req, res) => {
  const { name, version } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try { res.json(await libraryManager.install(name, version)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/upload', upload.single('zipfile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No zip file uploaded' });
  try { res.json(await libraryManager.installFromZip(req.file.path)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:name', async (req, res) => {
  try { res.json(await libraryManager.uninstall(req.params.name)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
