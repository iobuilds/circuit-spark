const Joi = require('joi');

const fileSchema = Joi.object({
  name: Joi.string().pattern(/^[\w\-. ]+\.(ino|cpp|c|h)$/).max(100).required(),
  content: Joi.string().max(500000).required(),
});

const compileSchema = Joi.object({
  board: Joi.string().alphanum().max(50).required(),
  files: Joi.array().items(fileSchema).min(1).max(20).required(),
  libraries: Joi.array().items(Joi.string().max(100)).max(50).default([]),
  clientId: Joi.string().max(100).optional(),
});

module.exports = {
  validateCompile(req, res, next) {
    const { error, value } = compileSchema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message),
      });
    }
    req.body = value;
    next();
  }
};
