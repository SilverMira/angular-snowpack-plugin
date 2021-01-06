import { SnowpackPlugin, SnowpackPluginFactory } from 'snowpack';
import { AngularCompilerService } from './compilerService';
import path from 'path';
import { ModuleKind } from 'typescript';

export interface pluginOptions {
  /** @default 'angular.json' */
  angularJson?: string;
  /** @default defaultProject in angular.json */
  angularProject?: string;
  /** @default [] */
  ngccTargets?: string[];
  /** @default true */
  errorToBrowser?: boolean;
  /**
   * @default false
   * This would only work on Angular11 projects, as it will use the hmr accept logic from Angular11
   */
  useHmr?: boolean;
}

const pluginFactory: SnowpackPluginFactory<pluginOptions> = (
  snowpackConfig,
  pluginOptions
) => {
  const angularJson = pluginOptions?.angularJson || 'angular.json';
  const angularProject = pluginOptions?.angularProject;
  const errorToBrowser = pluginOptions?.errorToBrowser ?? true;
  const useHmr = pluginOptions?.useHmr ?? false;
  const ngccTargets = pluginOptions?.ngccTargets || [];
  const useSourceMaps = snowpackConfig.buildOptions.sourceMaps;
  ngccTargets.unshift(
    '@angular/core',
    '@angular/common',
    '@angular/platform-browser-dynamic'
  );
  const compiler = new AngularCompilerService(
    angularJson,
    ngccTargets,
    angularProject
  );
  const skipRecompileFiles: string[] = [];
  const { index, main } = compiler.getAngularCriticalFiles();
  compiler.useSourceMaps(useSourceMaps ? 'normal' : 'none', true);

  const knownEntrypoints = ['@angular/common'];
  if (useHmr) {
    knownEntrypoints.push('angular-snowpack-plugin/vendor/hmr/hmr-accept');
    if (useSourceMaps) compiler.useSourceMaps('inline', true);
  }

  const plugin: SnowpackPlugin = {
    name: 'angular-snowpack-plugin',
    knownEntrypoints,
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
    async load({ filePath, isDev, isHmrEnabled }) {
      if (
        useHmr &&
        isHmrEnabled &&
        compiler.ngConfiguration.options.module !== ModuleKind.ESNext
      )
        compiler.ngConfiguration.options.module = ModuleKind.ESNext;
      await compiler.buildSource(isDev || isHmrEnabled);
      const error = compiler.getErrorInFile(filePath);
      if (error.length > 0)
        throw new Error(`[angular] ${compiler.formatDiagnostics(error)}`);
      let result = compiler.getBuiltFile(filePath);
      if (useHmr && isHmrEnabled && result && path.resolve(filePath) === main) {
        result = Object.assign({}, result);
        result.code = `import hmrAccept from 'angular-snowpack-plugin/vendor/hmr/hmr-accept';\n${result.code}\nif(import.meta.hot) hmrAccept(import.meta);\n`;
      }
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
