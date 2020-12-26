import {
  CompilerHost,
  CompilerOptions,
  createProgram,
  Program,
} from '@angular/compiler-cli';
import { resolve } from 'path';

export interface CompileArgs {
  filePath: string;
  compilerHost: CompilerHost;
  compilerOptions: CompilerOptions;
  files: Map<string, string>;
  srcDir: string;
  programs: Map<string, Program>;
}

export const compile = ({
  filePath,
  compilerHost,
  compilerOptions,
  files,
  srcDir,
  programs,
}: CompileArgs) => {
  const shortPath = resolve(filePath).replace(resolve(srcDir || ''), '');
  const baseName = shortPath.replace('.ts', '');
  const oldProgram = programs.has(shortPath)
    ? programs.get(shortPath)
    : undefined;
  const program = createProgram({
    rootNames: [filePath],
    options: compilerOptions,
    host: compilerHost,
    oldProgram,
  });
  program.emit();
  programs.set(shortPath, program);
  const map = files.get(`${baseName}.js.map`);
  const code = files.get(`${baseName}.js`);

  return {
    code,
    map,
  };
};
