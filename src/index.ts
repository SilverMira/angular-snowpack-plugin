import type { PluginLoadOptions, SnowpackPluginFactory } from 'snowpack';
import {
  CompilerHost,
  CompilerOptions,
  createCompilerHost,
  Program,
} from '@angular/compiler-cli';
import { readConfigFile, sys, parseJsonConfigFileContent } from 'typescript';
import { resolve, extname } from 'path';
import { promises as fs } from 'fs';
import { compile } from './compile';

const plugin: SnowpackPluginFactory = (options) => {
  const srcDir = 'src';
  let buildSourceMap = options.buildOptions.sourceMaps;
  let compilerHost: CompilerHost;
  let parsedCompilerOpts: CompilerOptions;
  const files = new Map();
  const programs = new Map<string, Program>();

  let entryPointsCompiled = false;
  let entryPoints: string[] = [];
  const compileEntryPoints = (incremental = false) => {
    if (!entryPointsCompiled || incremental) {
      for (const entryPoint of entryPoints) {
        pluginLog(`Entry Point: ${entryPoint}`);
        const filePath = resolve(entryPoint);
        compile({
          filePath,
          compilerHost,
          compilerOptions: parsedCompilerOpts,
          files,
          srcDir,
          programs,
        });
      }
      entryPointsCompiled = true;
    }
  };

  const pluginLog = (contents: string) => {
    console.log(`[AngularSnowpack] ${contents}`);
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
      compileEntryPoints();
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
      if (extname(filePath) === '.ts') {
        console.time('incremental');
        compile({
          filePath: resolve('src/main.ts'),
          compilerHost,
          compilerOptions: parsedCompilerOpts,
          files,
          srcDir,
          programs,
        });
        console.timeEnd('incremental');
      }
      // turn .html to .ts
      else this.markChanged!(filePath.replace(extname(filePath), '.ts'));
    },
  };
};

export default plugin;
