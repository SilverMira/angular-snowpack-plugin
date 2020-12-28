import {
  CompilerHost,
  CompilerOptions,
  Diagnostics,
  performCompilation,
  PerformCompilationResult,
  Program,
} from '@angular/compiler-cli';
import { EmitResult, SourceFile } from 'typescript';
import path from 'path';

export interface CompileArgs {
  rootNames: string[];
  compilerHost: CompilerHost;
  compilerOptions: CompilerOptions;
}

export interface CacheEntry {
  exists?: boolean;
  sf?: SourceFile;
  content?: string;
}

export interface WatchCompilationResult {
  program?: Program;
  emitResult?: EmitResult;
  recompiledFiles: string[];
  diagnostics: Diagnostics;
}

export type RecompileFunction = (
  fileName: string,
  src: string
) => WatchCompilationResult | null;

export const compile = ({
  rootNames,
  compilerHost,
  compilerOptions,
}: CompileArgs): PerformCompilationResult => {
  const compilationResult = performCompilation({
    rootNames,
    host: compilerHost,
    options: compilerOptions,
  });
  return compilationResult;
};

export const watchCompile = ({
  rootNames,
  compilerHost,
  compilerOptions,
}: CompileArgs) => {
  const compiledFiles = new Set<string>();
  const fileCache = new Map<string, CacheEntry>();
  const modifiedFile = new Set<string>();
  const recompiledFiles = new Set<string>();
  let cachedProgram: Program | undefined;

  const getCacheEntry = (fileName: string) => {
    fileName = path.normalize(fileName);
    let entry = fileCache.get(fileName);
    if (!entry) {
      entry = {};
      fileCache.set(fileName, entry);
    }
    return entry;
  };

  // Setup compilerHost to use cache
  const oriWriteFile = compilerHost.writeFile;
  compilerHost.writeFile = (
    fileName,
    data,
    writeByteOrderMark,
    onError,
    sourceFiles
  ) => {
    const srcRelativePath = path
      .resolve(fileName)
      .replace(path.resolve(compilerOptions.outDir!), '');
    compiledFiles.add(srcRelativePath);
    recompiledFiles.add(srcRelativePath);
    return oriWriteFile(
      fileName,
      data,
      writeByteOrderMark,
      onError,
      sourceFiles
    );
  };
  const oriFileExists = compilerHost.fileExists;
  compilerHost.fileExists = (fileName) => {
    const cache = getCacheEntry(fileName);
    if (cache.exists === null || cache.exists === undefined)
      cache.exists = oriFileExists(fileName);
    return cache.exists;
  };
  const oriGetSourceFile = compilerHost.getSourceFile;
  compilerHost.getSourceFile = (fileName, languageVersion) => {
    const cache = getCacheEntry(fileName);
    if (!cache.sf) cache.sf = oriGetSourceFile(fileName, languageVersion);
    return cache.sf;
  };
  const oriReadFile = compilerHost.readFile;
  compilerHost.readFile = (fileName) => {
    const cache = getCacheEntry(fileName);
    if (!cache.content) cache.content = oriReadFile(fileName);
    return cache.content;
  };
  compilerHost.getModifiedResourceFiles = () => {
    return modifiedFile;
  };

  // Do first compile
  const firstCompilation = compile({
    rootNames,
    compilerHost,
    compilerOptions,
  });
  cachedProgram = firstCompilation.program;

  const recompile: RecompileFunction = (fileName: string, src: string) => {
    // perhaps this function need debouncing like in perform_watch.ts
    fileName = path.normalize(fileName);
    fileCache.delete(fileName);
    const compiledFilePath = path
      .resolve(fileName)
      .replace(path.resolve(path.join(process.cwd(), src)), '');
    if (!compiledFiles.has(compiledFilePath)) {
      modifiedFile.add(fileName);
      compiledFiles.clear();
      recompiledFiles.clear();
      const oldProgram = cachedProgram;
      cachedProgram = undefined;
      const recompileResult = performCompilation({
        rootNames,
        host: compilerHost,
        options: compilerOptions,
        oldProgram,
      });
      cachedProgram = recompileResult.program;
      modifiedFile.clear();
      return {
        program: recompileResult.program,
        emitResult: recompileResult.emitResult,
        recompiledFiles: [...recompiledFiles],
        diagnostics: recompileResult.diagnostics,
      };
    }
    return null;
  };
  return { firstCompilation, recompile };
};
