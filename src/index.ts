import type { PluginLoadOptions, SnowpackPluginFactory } from 'snowpack';
import {
  CompilerHost,
  CompilerOptions,
  createCompilerHost,
} from '@angular/compiler-cli';
import { ScriptTarget, ModuleKind, ModuleResolutionKind } from 'typescript';
import { resolve } from 'path';
import { compile } from './compile';

const plugin: SnowpackPluginFactory = () => {
  const rootDir = 'src';
  const sourceMap = true;
  let compilerHost: CompilerHost;
  const files = new Map();

  const compilerOptions: CompilerOptions = {
    target: ScriptTarget.ESNext,
    module: ModuleKind.ESNext,
    lib: ['dom', 'es2015', 'es2017', 'es2018', 'es2019', 'es2020'],
    rootDir: resolve(rootDir),
    moduleResolution: ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    declaration: false,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    enableIvy: true,
    sourceMap,
    aot: true,
  };

  return {
    name: 'custom-angular-snowpack-plugin',
    resolve: {
      input: ['.ts'],
      output: ['.js'],
    },
    config() {
      console.log(`Config happened, compilerHost created`);
      compilerHost = createCompilerHost({ options: compilerOptions });
      compilerHost.writeFile = (fileName, contents) => {
        console.log(`CompilerHost written file`);
        files.set(resolve(fileName), contents);
      };
    },
    async load(options: PluginLoadOptions) {
      console.log(`Load happened: ${options.filePath}`);
      const result = compile({
        filePath: options.filePath,
        compilerHost,
        compilerOptions,
        files,
      });
      return {
        '.js': {
          code: result.code as string,
          map: sourceMap ? (result.map as string) : undefined,
        },
      };
    },
  };
};

export default plugin;
