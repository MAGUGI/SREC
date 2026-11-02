const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// .env.test é local e fica fora do git; sem ele, vale o exemplo versionado,
// que aponta para o Postgres descartável do docker-compose.test.yml.
const local = path.join(__dirname, '..', '.env.test');
const example = path.join(__dirname, '..', '.env.test.example');
dotenv.config({ path: fs.existsSync(local) ? local : example, quiet: true });

process.env.RATE_LIMIT_WRITE_MAX = process.env.RATE_LIMIT_WRITE_MAX || '100000';
