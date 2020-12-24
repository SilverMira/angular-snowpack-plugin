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
}

export const compile = ({
  filePath,
  compilerHost,
  compilerOptions,
  files,
}: CompileArgs) => {
  const program = createProgram({
    rootNames: [filePath],
    options: compilerOptions,
    host: compilerHost,
  });
  const emitResult = program.emit();

  const file = resolve(filePath).replace('.ts', '');
  const map = files.get(`${file}.js.map`);
  const code = files.get(`${file}.js`);

  return {
    code: (code ?? '').replace(/\/\/# sourceMappingURL.*/, ''),
    map,
  };
};
