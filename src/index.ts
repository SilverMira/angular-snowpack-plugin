import type { PluginLoadOptions, SnowpackPluginFactory } from 'snowpack';
import {
  CompilerHost,
  CompilerOptions,
  createCompilerHost,
  Program,
} from '@angular/compiler-cli';
import { readConfigFile, sys, parseJsonConfigFileContent } from 'typescript';
import { resolve, extname, join } from 'path';
import { promises as fs } from 'fs';
import { compile, RecompileFunction, watchCompile } from './compile';

const plugin: SnowpackPluginFactory = (options) => {
  const srcDir = 'src';
  let buildSourceMap = options.buildOptions.sourceMaps;
  let compilerHost: CompilerHost;
  let parsedCompilerOpts: CompilerOptions;
  const files = new Map();
  const programs = new Map<string, Program>();

  let entryPointsCompiled = false;
  let entryPoints: string[] = [];
  let recompile: RecompileFunction;
  let recompiledFiles: string[] = [];

  const compileEntryPoints = () => {
    if (!entryPointsCompiled) {
      const rootNames = entryPoints.map((e) => resolve(e));
      compile({
        rootNames,
        compilerHost,
        compilerOptions: parsedCompilerOpts,
        files,
        srcDir,
        programs,
      });
      entryPointsCompiled = true;
    }
  };

  const compileEntryPointsWatch = () => {
    if (!entryPointsCompiled) {
      const rootNames = entryPoints.map((e) => resolve(e));
      recompile = watchCompile({
        rootNames,
        compilerHost,
        compilerOptions: parsedCompilerOpts,
      });
      entryPointsCompiled = true;
    }
  };

  const pluginLog = (contents: string) => {
    console.log(`[angular] ${contents}`);
  };

  return {
    name: 'custom-angular-snowpack-plugin',
    resolve: {
      input: ['.ts'],
      output: ['.js', '.ts'],
    },
    config() {
      const parsedConfig = readConfigFile('tsconfig.app.json', sys.readFile);
      const parsedCommandLine = parseJsonConfigFileContent(
        parsedConfig.config,
        sys,
        './'
      );
      parsedCompilerOpts = parsedCommandLine.options;
      entryPoints = parsedCommandLine.fileNames;
      compilerHost = createCompilerHost({ options: parsedCompilerOpts });
      compilerHost.writeFile = (fileName, contents) => {
        fileName = resolve(fileName).replace(
          resolve(parsedCompilerOpts.outDir || ''),
          ''
        );
        pluginLog(`Compiling : ${fileName}`);
        files.set(fileName, contents.replace(/\/\/# sourceMappingURL.*/, ''));
      };
    },
    async load(options: PluginLoadOptions) {
      const sourceMap = options.isDev || buildSourceMap;
      pluginLog(`Loading: ${options.filePath}`);
      if (!options.isDev) compileEntryPoints();
      else compileEntryPointsWatch();
      const filePath = resolve(options.filePath).replace(resolve(srcDir), '');
      const fileBaseName = filePath.replace('.ts', '');
      const result = { code: undefined, map: undefined } as any;
      const sourceFile = { code: undefined, map: undefined } as any;
      if (
        files.has(`${fileBaseName}.js`) &&
        files.has(`${fileBaseName}.js.map`)
      ) {
        result.code = files.get(`${fileBaseName}.js`);
        result.map = sourceMap
          ? files.get(`${fileBaseName}.js.map`)
          : undefined;
        sourceFile.code = sourceMap
          ? await fs.readFile(options.filePath, 'utf-8')
          : undefined;
      }
      return {
        '.js': result,
        '.ts': sourceFile,
      } as any;
    },
    async onChange({ filePath }) {
      pluginLog(`File Changed: ${filePath}`);
      const doRecompile = !recompiledFiles.includes(filePath);
      if (!doRecompile)
        recompiledFiles.splice(recompiledFiles.indexOf(filePath), 1);
      else if (extname(filePath) === '.ts' && doRecompile) {
        console.time('incremental');
        const recompiledResult = recompile(filePath);
        const files = recompiledResult!.recompiledFiles
          .map((file) => resolve(join(srcDir, file)))
          .filter((file) => extname(file) === '.js')
          .map((file) => file.replace(extname(file), '.ts'))
          .filter((file) => file !== filePath);
        for (const file of files!) {
          recompiledFiles.push(file);
          this.markChanged!(file);
        }
        console.timeEnd('incremental');
      }
      // turn .html to .ts
      else this.markChanged!(filePath.replace(extname(filePath), '.ts'));
    },
  };
};

export default plugin;
