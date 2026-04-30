module.exports = {
  apps: [
    {
      name: 'embedsim-api',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '500M',
      error_file: '/var/log/embedsim/api-error.log',
      out_file: '/var/log/embedsim/api-out.log',
    },
    {
      name: 'embedsim-worker',
      script: 'queue/compileWorker.js',
      instances: 1,
      exec_mode: 'fork',
      env_production: { NODE_ENV: 'production' },
      max_memory_restart: '800M',
      error_file: '/var/log/embedsim/worker-error.log',
      out_file: '/var/log/embedsim/worker-out.log',
    }
  ]
};
