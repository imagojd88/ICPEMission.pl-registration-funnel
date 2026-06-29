// PM2 — proces backendu NestJS.
// Uruchom z katalogu repo:  pm2 start deploy/ecosystem.config.cjs
// Zmienne środowiskowe ładuje sama aplikacja z /var/www/icpe/.env (ConfigModule).
module.exports = {
  apps: [
    {
      name: 'icpe-api',
      cwd: '/var/www/icpe/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
