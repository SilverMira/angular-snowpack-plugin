#!/usr/bin/env node

import { loadConfiguration, startServer } from 'snowpack';
import path from 'path';
import { styleResourceManager } from './styleResource';

/**
 * The reason a wrapper code is needed for preprocess to work in dev mode is mainly because
 * Snowpack does NOT fully build a file if the browser does not request for it,
 * eg: the plugin can wait for `app.component.scss` at `transform()` forever but it will never be resolved unless the browser requested `app.component.scss`
 *
 * By using a simple wrapper for the snowpack dev server and communicating with the plugin, it is possible to trigger the above "browser request" behavior
 */
const devMain = async () => {
  const config = await loadConfiguration(
    {},
    path.resolve(process.cwd(), 'snowpack.config.js')
  );
  styleResourceManager.on('request', async (stylePath) => {
    const finalResourceUrl = server.getUrlForFile(stylePath)!;
    server.loadUrl(finalResourceUrl);
  });
  const server = await startServer({ config, lockfile: null });
};

devMain();
