const { defineConfig } = require('@vue/cli-service');

module.exports = defineConfig({
  outputDir: `dist/${process.env.MPX_CURRENT_TARGET_MODE}`,
  pluginOptions: {
    mpx: {
      plugin: {
        srcMode: 'wx'
      },
      loader: {}
    }
  }
});
