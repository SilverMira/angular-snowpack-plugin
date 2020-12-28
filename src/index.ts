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
  formatDiagnostics,
  PerformCompilationResult,
} from '@angular/compiler-cli';
import ts, { FormatDiagnosticsHost } from 'typescript';
import path from 'path';
import { promises as fs } from 'fs';
import { compile, RecompileFunction, watchCompile } from './compile';
import execa from 'execa';

export interface AngularSnowpackPluginOptions {
  /** @default 'src' */
  src?: string;
  /** @default 'normal' */
  logLevel?: 'normal' | 'debug';
  /** @default 'tsconfig.app.json' */
  tsConfig?: string;
  /** @default [] */
  ngccTargets?: string[];
}

/**
 * Build Logic: Based on https://github.com/aelbore/rollup-plugin-ngc
 * Watch Logic: Based on packages/compiler-cli/src/perform_watch.ts https://github.com/angular/angular
 */
const plugin: SnowpackPluginFactory<AngularSnowpackPluginOptions> = (
  options: SnowpackConfig,
  pluginOptions?: AngularSnowpackPluginOptions
) => {
  const srcDir = pluginOptions?.src || 'src';
  const logLevel = pluginOptions?.logLevel || 'normal';
  const tsConfigPath = pluginOptions?.tsConfig || 'tsconfig.app.json';
  const ngccTargets = pluginOptions?.ngccTargets || [];
  const buildSourceMap = options.buildOptions.sourceMaps;
  let compilerHost: CompilerHost;
  let parsedTSConfig: CompilerOptions;
  const builtSourceFiles = new Map<string, string>();
  const cwd = path.resolve(process.cwd());

  let rootNamesCompiled: boolean = false;
  let rootNames: string[] = [];
  let recompile: RecompileFunction;
  let recompiledFiles: string[] = [];
  let compilationResult: PerformCompilationResult;

  const compileRootNames = (isDev = false) => {
    if (!rootNamesCompiled) {
      pluginLog('Building source...');
      console.time('[angular] Source built in');
      if (isDev) {
        const watchCompileResult = watchCompile({
          rootNames,
          compilerHost,
          compilerOptions: parsedTSConfig,
        });
        recompile = watchCompileResult.recompile;
        compilationResult = watchCompileResult.firstCompilation;
      } else {
        compilationResult = compile({
          rootNames,
          compilerHost,
          compilerOptions: parsedTSConfig,
        });
      }
      console.timeEnd('[angular] Source built in');
      rootNamesCompiled = true;
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

  const tsFormatDiagnosticHost: FormatDiagnosticsHost = {
    getCanonicalFileName(fileName) {
      return path.basename(path.resolve(fileName)) + path.extname(fileName);
    },
    getCurrentDirectory() {
      return cwd;
    },
    getNewLine() {
      return '\n';
    },
  };

  const runNgcc = async () => {
    ngccTargets.unshift('@angular/platform-browser');
    for (const target of ngccTargets) {
      const ngcc = execa('ngcc', ['-t', target]);
      ngcc.stdout?.pipe(process.stdout);
      await ngcc;
    }
    pluginLog('***************');
    pluginLog(
      'NGCC finished. Run "snowpack --reload" if strange errors regarding ivy appears during dev mode'
    );
    pluginLog('***************');
  };

  return {
    name: 'angular',
    resolve: {
      input: ['.ts'],
      output: ['.js', '.ts'],
    },
    async run() {
      await runNgcc();
    },
    config() {
      const parsedCommandLine = readAndParseTSConfig(tsConfigPath);
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
      compileRootNames(options.isDev);
      const relativeFilePathFromSrc = path
        .resolve(options.filePath)
        .replace(path.resolve(srcDir), '');
      const fileBaseName = relativeFilePathFromSrc.replace('.ts', '');
      const result: SnowpackBuiltFile = {} as any;
      const sourceFile: SnowpackBuiltFile = {} as any;
      // Throw pretty diagnostics when error happened during compilation
      if (compilationResult.diagnostics.length > 0) {
        const formatted = formatDiagnostics(
          compilationResult.diagnostics,
          tsFormatDiagnosticHost
        );
        throw new Error(`[angular] ${formatted}`);
      }
      // Load the file from builtSourceFiles
      if (builtSourceFiles.has(`${fileBaseName}.js`))
        result.code = builtSourceFiles.get(`${fileBaseName}.js`)!;
      if (sourceMap && builtSourceFiles.has(`${fileBaseName}.js.map`))
        result.map = builtSourceFiles.get(`${fileBaseName}.js.map`);
      // Not desirable, copy the original source file as well if sourceMaps is enabled.
      sourceFile.code = sourceMap
        ? await fs.readFile(options.filePath, 'utf-8')
        : undefined!;
      return {
        '.js': result,
        '.ts': sourceFile,
      };
    },
    async onChange({ filePath }) {
      // doRecompile is needed to avoid infinite loops where a component affects its module to be recompiled, or vice versa
      // if false, nothing will be done, the recompiled file will be reloaded by snowpack
      // changes to any resource files (.html/.ts/.css) will be sent to @angular/compiler-cli to recompile
      const doRecompile = !recompiledFiles.includes(filePath);
      if (!doRecompile)
        recompiledFiles.splice(recompiledFiles.indexOf(filePath), 1);
      else {
        console.time('[angular] Incremental Build Finished, Took');
        const recompiledResult = recompile(filePath, srcDir);
        console.timeEnd('[angular] Incremental Build Finished, Took');
        if (recompiledResult) compilationResult = recompiledResult;
        // map the compiled files path back to its source
        const files = recompiledResult!.recompiledFiles
          .map((file) => path.resolve(path.join(srcDir, file)))
          .filter((file) => path.extname(file) === '.js')
          .map((file) => file.replace(path.extname(file), '.ts'))
          .filter((file) => file !== filePath);
        if (files.length === 0)
          // Not the best solution, but work for now, used when error happens during recompilation and no files were recompiled, forcing a reload to throw error to snowpack
          // rootNames[0] is presumably src/main.ts (anything would work though)
          files.push(rootNames[0]);
        for (const file of files) {
          recompiledFiles.push(file);
          this.markChanged!(file);
        }
      }
    },
  };
};

export default plugin;
