const fs = require('fs');
const path = require('path');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const routes = require('./routes');

const swaggerDoc = YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'swagger.yaml'), 'utf8'));

const app = express();

app.use(express.json());
app.get('/api-docs.json', (req, res) => res.json(swaggerDoc));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, { customSiteTitle: 'Policy Upload API Docs' }));
app.use('/api', routes);

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ message: err.message || 'Internal server error' });
});

module.exports = app;
