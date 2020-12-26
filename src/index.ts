import type {
  PluginLoadOptions,
  PluginTransformOptions,
  SnowpackPluginFactory,
} from 'snowpack';
import {
  CompilerHost,
  CompilerOptions,
  createCompilerHost,
} from '@angular/compiler-cli';
import { ScriptTarget, ModuleKind, ModuleResolutionKind } from 'typescript';
import { resolve, join } from 'path';
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
  };

  let entryPointsCompiled = false;
  const entryPoints = ['main.ts', 'polyfills.ts'];
  const compileEntryPoints = () => {
    if (!entryPointsCompiled) {
      console.log('Compiling entry points...');
      for (const entryPoint of entryPoints) {
        const filePath = resolve(join(rootDir, entryPoint));
        compile({
          filePath,
          compilerHost,
          compilerOptions,
          files,
        });
      }
      console.log('Entry points compiled');
      entryPointsCompiled = true;
    }
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
        console.log(`CompilerHost written file: ${fileName}`);
        const fileKey = resolve(fileName);
        files.set(fileKey, contents.replace(/\/\/# sourceMappingURL.*/, ''));
      };
    },
    async load(options: PluginLoadOptions) {
      console.log(`Load happened: ${options.filePath}`);
      compileEntryPoints();
      // const result = compile({
      //   filePath: options.filePath,
      //   compilerHost,
      //   compilerOptions,
      //   files,
      // });
      const file = resolve(options.filePath).replace('.ts', '');
      let result;
      if (files.has(`${file}.js`) && files.has(`${file}.js.map`)) {
        result = {
          code: files.get(`${file}.js`),
          map: files.get(`${file}.js.map`),
        };
      } else {
        console.log(`Compiling new file: ${file}`);
        result = compile({
          filePath: options.filePath,
          compilerHost,
          compilerOptions,
          files,
        });
      }
      debugger;
      return {
        '.js': {
          code: result?.code,
          map: sourceMap ? result?.map : undefined,
        },
      };
    },
  };
};

export default plugin;
