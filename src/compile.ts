import * as ng from '@angular/compiler-cli';
import ts from 'typescript';
import path from 'path';

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

export interface WatchCompilationResult extends ng.PerformCompilationResult {
  recompiledFiles: string[];
}

export type RecompileFunction = (
  fileName: string,
  src: string
) => WatchCompilationResult | null;

export type RecompileFunctionAsync = (
  fileName: string,
  src: string
) => Promise<WatchCompilationResult | null>;

export const compile = ({
  rootNames,
  compilerHost,
  compilerOptions,
}: CompileArgs): ng.PerformCompilationResult => {
  const compilationResult = ng.performCompilation({
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
    compilerHost.readResource = (fileName) => {
      const cache = getCacheEntry(fileName);
      if (!cache.content) cache.content = oriReadResource(fileName) as string;
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
    const compiledFilePath = path.relative(
      path.resolve(src),
      path.resolve(fileName)
    );
    if (!compiledFiles.has(compiledFilePath)) {
      modifiedFile.add(fileName);
      compiledFiles.clear();
      const oldProgram = cachedProgram;
      cachedProgram = undefined;
      const recompileResult = ng.performCompilation({
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
        recompiledFiles: [...compiledFiles],
        diagnostics: recompileResult.diagnostics,
      };
    }
    return null;
  };
  return { firstCompilation, recompile };
};

/**
 * Based on `@angular/compiler-cli.performCompilation()`
 */
export const performCompilationAsync = async ({
  compilerHost,
  compilerOptions,
  rootNames,
  oldProgram,
}: CompileArgs): Promise<ng.PerformCompilationResult> => {
  let program: ng.Program | undefined;
  const diagnostics: (ng.Diagnostic | ts.Diagnostic)[] = [];
  try {
    program = ng.createProgram({
      rootNames,
      host: compilerHost,
      options: compilerOptions,
      oldProgram,
    });
    await program.loadNgStructureAsync();
    diagnostics.push(...ng.defaultGatherDiagnostics(program));
    // No errors
    if (!diagnostics.some((d) => d.category === ts.DiagnosticCategory.Error)) {
      const emitResult = program.emit();
      diagnostics.push(...emitResult.diagnostics);
      return { diagnostics, program, emitResult };
    }
    return { diagnostics, program };
  } catch (e) {
    let errMsg: string;
    let code: number;
    if (e['ngSyntaxError']) {
      // don't report the stack for syntax errors as they are well known errors.
      errMsg = e.message;
      code = ng.DEFAULT_ERROR_CODE;
    } else {
      errMsg = e.stack;
      // It is not a syntax error we might have a program with unknown state, discard it.
      program = undefined;
      code = ng.UNKNOWN_ERROR_CODE;
    }
    diagnostics.push({
      category: ts.DiagnosticCategory.Error,
      messageText: errMsg,
      code,
      source: ng.SOURCE,
    });
    return { diagnostics, program };
  }
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
    const compiledFilePath = path.relative(
      path.resolve(src),
      path.resolve(fileName)
    );
    if (!compiledFiles.has(compiledFilePath)) {
      modifiedFile.add(fileName);
      compiledFiles.clear();
      const oldProgram = cachedProgram;
      cachedProgram = undefined;
      const recompileResult = await performCompilationAsync({
        rootNames,
        compilerHost,
        compilerOptions,
        oldProgram,
      });
      cachedProgram = recompileResult.program;
      modifiedFile.clear();
      return {
        program: recompileResult.program,
        emitResult: recompileResult.emitResult,
        recompiledFiles: [...compiledFiles],
        diagnostics: recompileResult.diagnostics,
      };
    }
    return null;
  };
  return { firstCompilation, recompile };
};
