import { SnowpackPlugin, SnowpackPluginFactory } from 'snowpack';
import { AngularCompilerService } from './compilerService';
import path from 'path';

export interface pluginOptions {
  /** @default 'src' */
  src?: string;
  /** @default 'angular.json' */
  angularJson?: string;
  /** @default defaultProject in angular.json */
  angularProject?: string;
  /** @default [] */
  ngccTargets?: string[];
  /** @default true */
  errorToBrowser?: boolean;
}

const pluginFactory: SnowpackPluginFactory<pluginOptions> = (
  snowpackConfig,
  pluginOptions
) => {
  const angularJson = pluginOptions?.angularJson || 'angular.json';
  const angularProject = pluginOptions?.angularProject;
  const sourceDirectory = pluginOptions?.src || 'src';
  const errorToBrowser = pluginOptions?.errorToBrowser ?? true;
  const ngccTargets = pluginOptions?.ngccTargets || [];
  ngccTargets.unshift(
    '@angular/core',
    '@angular/common',
    '@angular/platform-browser-dynamic'
  );
  const compiler = new AngularCompilerService(
    angularJson,
    sourceDirectory,
    ngccTargets,
    angularProject
  );
  const skipRecompileFiles: string[] = [];
  const index = compiler.getAngularCriticalFiles().index;

  const plugin: SnowpackPlugin = {
    name: 'angular-snowpack-plugin',
    knownEntrypoints: ['@angular/common'],
    resolve: {
      input: ['.ts'],
      output: ['.js'],
    },
    config() {
      compiler.onTypeCheckError((diagnostic) => {
        if (diagnostic.length > 0) {
          if (!errorToBrowser) {
            console.error(
              `[angular] ${compiler.formatDiagnostics(diagnostic)}`
            );
          } else {
            const erroredFiles = compiler.getErroredFiles(diagnostic);
            skipRecompileFiles.push(...erroredFiles);
            erroredFiles.forEach((file) => this.markChanged!(file));
          }
        }
      });
    },
    async load({ filePath, isDev }) {
      const useSourceMaps = isDev || snowpackConfig.buildOptions.sourceMaps;
      await compiler.buildSource(isDev);
      const error = compiler.getErrorInFile(filePath);
      if (error.length > 0)
        throw new Error(`[angular] ${compiler.formatDiagnostics(error)}`);
      const result = compiler.getBuiltFile(filePath);
      return {
        '.js': {
          code: result?.code!,
          map: useSourceMaps ? result?.map : undefined,
        },
      };
    },
    async onChange({ filePath }) {
      filePath = path.resolve(filePath);
      if (skipRecompileFiles.includes(filePath)) {
        skipRecompileFiles.splice(skipRecompileFiles.indexOf(filePath), 1);
        return;
      }
      const recompile = await compiler.recompile(filePath);
      recompile.recompiledFiles = recompile.recompiledFiles.filter(
        (file) => file !== filePath
      );
      skipRecompileFiles.push(...recompile.recompiledFiles);
      recompile.recompiledFiles.forEach((file) => this.markChanged!(file));
    },
    async transform({ id, contents }) {
      id = path.resolve(id);
      if (id === index) {
        const {
          injectMain,
          injectPolyfills,
          injectScripts,
          injectStyles,
        } = compiler.getIndexInjects();
        return contents
          .toString('utf-8')
          .replace('</head>', `${injectStyles.join('')}\n</head>`)
          .replace(
            '</body>',
            `${injectPolyfills}${injectMain}${injectScripts.join('')}\n</body>`
          );
      }
    },
  };
  return plugin;
};

export default pluginFactory;
