import {
  CompilerHost,
  CompilerOptions,
  createProgram,
} from '@angular/compiler-cli';
import { resolve } from 'path';

export interface CompileArgs {
  filePath: string;
  compilerHost: CompilerHost;
  compilerOptions: CompilerOptions;
  files: Map<string, string>;
  srcDir: string;
}

export const compile = ({
  filePath,
  compilerHost,
  compilerOptions,
  files,
  srcDir,
}: CompileArgs) => {
  const program = createProgram({
    rootNames: [filePath],
    options: compilerOptions,
    host: compilerHost,
  });
  program.emit();
  filePath = resolve(filePath).replace(resolve(srcDir || ''), '');
  const baseName = filePath.replace('.ts', '');
  const map = files.get(`${baseName}.js.map`);
  const code = files.get(`${baseName}.js`);

  return {
    code,
    map,
  };
};
