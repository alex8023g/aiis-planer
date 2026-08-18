module.exports = {
  apps: [
    {
      name: 'aiis-planer',
      script: 'node_modules/.bin/next',
      args: 'start -p 3008',
      cwd: './',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
