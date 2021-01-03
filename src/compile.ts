import * as ng from '@angular/compiler-cli';
import ts from 'typescript';
import path from 'path';
import { runTypeCheck } from './typeCheck';

export interface CompileArgs {
  rootNames: string[];
  compilerHost: ng.CompilerHost;
  compilerOptions: ng.CompilerOptions;
  oldProgram?: ng.Program;
}

export interface CacheEntry {
  exists?: boolean;
  sf?: ts.SourceFile;
  content?: string;
}

export interface RecompileResult extends ng.PerformCompilationResult {
  recompiledFiles: string[];
}

export type RecompileFunctionAsync = (
  fileName: string,
  src: string
) => Promise<RecompileResult>;

/**
 * Based on `@angular/compiler-cli.performCompilation()`
 */
export const performCompilationAsync = async (
  { compilerHost, compilerOptions, rootNames, oldProgram }: CompileArgs,
  typeCheck: boolean = true
): Promise<ng.PerformCompilationResult> => {
  const diagnostics: (ts.Diagnostic | ng.Diagnostic)[] = [];
  const program = ng.createProgram({
    rootNames,
    host: compilerHost,
    options: compilerOptions,
    oldProgram,
  });
  await program.loadNgStructureAsync();
  if (typeCheck)
    diagnostics.push(
      ...runTypeCheck(rootNames, compilerOptions, program, compilerHost)
    );
  const emitResult = program.emit();
  diagnostics.push(...emitResult.diagnostics);
  return { diagnostics, program, emitResult };
};

export const compileAsync = async ({
  rootNames,
  compilerHost,
  compilerOptions,
}: CompileArgs) => {
  const compilationResult = await performCompilationAsync({
    rootNames,
    compilerHost,
    compilerOptions,
  });
  return compilationResult;
};

export const watchCompileAsync = async ({
  rootNames,
  compilerHost,
  compilerOptions,
}: CompileArgs) => {
  const compiledFiles = new Set<string>();
  const fileCache = new Map<string, CacheEntry>();
  const modifiedFile = new Set<string>();
  let cachedProgram: ng.Program | undefined;

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
    const srcRelativePath = path.relative(
      path.resolve(compilerOptions.outDir!),
      path.resolve(fileName)
    );
    compiledFiles.add(srcRelativePath);
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
  // Read resource is a optional function,
  // it has priority over readFile when loading resources (html/css),
  // async file processing will require a custom performCompilation to run `program.loadNgStuctureAsync()`
  const oriReadResource = compilerHost.readResource;
  if (oriReadResource)
    compilerHost.readResource = async (fileName) => {
      const cache = getCacheEntry(fileName);
      if (cache.content === undefined)
        cache.content = await oriReadResource(fileName);
      return cache.content;
    };

  compilerHost.getModifiedResourceFiles = () => {
    return modifiedFile;
  };

  // Do first compile
  const firstCompilation = await compileAsync({
    rootNames,
    compilerHost,
    compilerOptions,
  });
  cachedProgram = firstCompilation.program;

  const recompile: RecompileFunctionAsync = async (
    fileName: string,
    src: string
  ) => {
    // perhaps this function need debouncing like in perform_watch.ts
    fileName = path.normalize(fileName);
    fileCache.delete(fileName);
    modifiedFile.add(fileName);
    compiledFiles.clear();
    const oldProgram = cachedProgram;
    cachedProgram = undefined;
    const recompileResult = await performCompilationAsync(
      {
        rootNames,
        compilerHost,
        compilerOptions,
        oldProgram,
      },
      false
    );
    cachedProgram = recompileResult.program;
    modifiedFile.clear();
    return {
      program: recompileResult.program,
      emitResult: recompileResult.emitResult,
      recompiledFiles: [...compiledFiles],
      diagnostics: recompileResult.diagnostics,
    };
  };
  return { firstCompilation, recompile };
};
