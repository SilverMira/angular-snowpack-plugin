import type {
  PluginLoadOptions,
  SnowpackBuiltFile,
  SnowpackConfig,
  SnowpackPluginFactory,
} from 'snowpack';
import {
  CompilerHost,
  CompilerOptions,
  createCompilerHost,
} from '@angular/compiler-cli';
import ts from 'typescript';
import path from 'path';
import { promises as fs } from 'fs';
import { compile, RecompileFunction, watchCompile } from './compile';

export type AngularSnowpackPluginOptions =
  | {
      /** @default 'src' */
      src?: string;
      /** @default 'normal' */
      logLevel?: 'normal' | 'debug';
    }
  | undefined;

/**
 * Build Logic: Based on https://github.com/aelbore/rollup-plugin-ngc
 * Watch Logic: Based on packages/compiler-cli/src/perform_watch.ts https://github.com/angular/angular
 */
const plugin: SnowpackPluginFactory<AngularSnowpackPluginOptions> = (
  options: SnowpackConfig,
  pluginOptions: AngularSnowpackPluginOptions
) => {
  const srcDir = pluginOptions?.src || 'src';
  const logLevel = pluginOptions?.logLevel || 'normal';
  let buildSourceMap = options.buildOptions.sourceMaps;
  let compilerHost: CompilerHost;
  let parsedTSConfig: CompilerOptions;
  const builtSourceFiles = new Map<string, string>();
  const cwd = path.resolve(process.cwd());

  let rootNamesCompiled: boolean = false;
  let rootNames: string[] = [];
  let recompile: RecompileFunction;
  let recompiledFiles: string[] = [];

  const compileRootNames = (): void => {
    if (!rootNamesCompiled) {
      pluginLog('Building Source...');
      compile({
        rootNames,
        compilerHost,
        compilerOptions: parsedTSConfig,
      });
      rootNamesCompiled = true;
      pluginLog('Source Built!');
    }
  };

  const compileRootNamesWatch = (): void => {
    if (!rootNamesCompiled) {
      pluginLog('Building Source...');
      recompile = watchCompile({
        rootNames,
        compilerHost,
        compilerOptions: parsedTSConfig,
      });
      rootNamesCompiled = true;
      pluginLog('Source Built!');
    }
  };

  const pluginLog = (contents: string): void => {
    console.log(`[angular] ${contents}`);
  };

  const pluginDebug = (contents: string): void => {
    if (logLevel === 'debug') pluginLog(contents);
  };

  const readAndParseTSConfig = (configFile: string): ts.ParsedCommandLine => {
    configFile = path.resolve(configFile);
    const parsedConfig = ts.readConfigFile(configFile, ts.sys.readFile);
    const parsedCommandLine = ts.parseJsonConfigFileContent(
      parsedConfig.config,
      ts.sys,
      cwd
    );
    return parsedCommandLine;
  };

  return {
    name: 'angular',
    resolve: {
      input: ['.ts'],
      output: ['.js', '.ts'],
    },
    config() {
      const parsedCommandLine = readAndParseTSConfig('tsconfig.app.json');
      parsedTSConfig = parsedCommandLine.options;
      rootNames = parsedCommandLine.fileNames.map((file) => path.resolve(file));
      compilerHost = createCompilerHost({ options: parsedTSConfig });
      compilerHost.writeFile = (fileName, contents) => {
        fileName = path
          .resolve(fileName)
          .replace(path.resolve(parsedTSConfig.outDir!), '');
        pluginDebug(`File Compiled: ${fileName}`);
        builtSourceFiles.set(
          fileName,
          contents.replace(/\/\/# sourceMappingURL.*/, '') // required, to prevent multiple sourceMappingUrl as snowpack will append it if sourceMaps is enabled
        );
      };
    },
    async load(options: PluginLoadOptions) {
      const sourceMap = options.isDev || buildSourceMap;
      pluginDebug(`Loading: ${options.filePath}`);
      if (!options.isDev) compileRootNames();
      else compileRootNamesWatch();
      const relativeFilePathFromSrc = path
        .resolve(options.filePath)
        .replace(path.resolve(srcDir), '');
      const fileBaseName = relativeFilePathFromSrc.replace('.ts', '');
      const result: SnowpackBuiltFile = {} as any;
      const sourceFile: SnowpackBuiltFile = {} as any;
      // Load the file from builtSourceFiles
      if (
        builtSourceFiles.has(`${fileBaseName}.js`) &&
        builtSourceFiles.has(`${fileBaseName}.js.map`)
      ) {
        result.code = builtSourceFiles.get(`${fileBaseName}.js`)!;
        result.map = sourceMap
          ? builtSourceFiles.get(`${fileBaseName}.js.map`)
          : undefined;
        // Not desirable, copy the original source file as well if sourceMaps is enabled.
        sourceFile.code = sourceMap
          ? await fs.readFile(options.filePath, 'utf-8')
          : undefined!;
      }
      return {
        '.js': result,
        '.ts': sourceFile,
      };
    },
    async onChange({ filePath }) {
      // doRecompile is needed to avoid infinite loops where a component affects its module to be recompiled, or vice versa
      // if false, nothing will be done, the recompiled file will be reloaded by snowpack
      // changes to any files (.html/.ts/.css) will be sent to recompile, changed resource files (styles/templates) will automatically be recompiled by angular
      const doRecompile = !recompiledFiles.includes(filePath);
      if (!doRecompile)
        recompiledFiles.splice(recompiledFiles.indexOf(filePath), 1);
      else {
        console.time('[angular] Incremental Build Finished, Took');
        const recompiledResult = recompile(filePath, srcDir);
        console.timeEnd('[angular] Incremental Build Finished, Took');
        const files = recompiledResult!.recompiledFiles
          .map((file) => path.resolve(path.join(srcDir, file)))
          .filter((file) => path.extname(file) === '.js')
          .map((file) => file.replace(path.extname(file), '.ts'))
          .filter((file) => file !== filePath);
        for (const file of files!) {
          recompiledFiles.push(file);
          this.markChanged!(file);
        }
      }
    },
  };
};

export default plugin;
