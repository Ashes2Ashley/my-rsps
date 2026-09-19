module.exports = {
  name: 'CustomWelcome',
  dependsOn: [],
  register(api) {
    api.onServerStartup(() => {
      console.info('[CustomWelcome] custom plugin hub is active');
    });
    api.onServerShutdown(() => {
      console.info('[CustomWelcome] shutdown hook received');
    });
  },
};
