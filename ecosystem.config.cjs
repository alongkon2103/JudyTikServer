const path = require('node:path');
const server = path.join(__dirname, 'server');

module.exports = {
  apps: [{
    name: 'judytik-backend',
    cwd: server,
    script: path.join(server, 'dist', 'main.js'),
    interpreter: process.execPath,
    exec_mode: 'fork',
    instances: 1,
    watch: false,
    autorestart: true,
    restart_delay: 3000,
    min_uptime: 10000,
    max_restarts: 10,
    kill_timeout: 30000,
    time: true,
    env: { NODE_ENV: 'production' },
  }],
};
