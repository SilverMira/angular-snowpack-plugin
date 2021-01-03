import * as ng from '@angular/compiler-cli';
import * as ts from 'typescript';
import path from 'path';
import { isTemplateDiagnostic } from '@angular/compiler-cli/src/ngtsc/typecheck/diagnostics/';

export const runTypeCheck = (
  rootNames: string[],
  options: ng.CompilerOptions,
  program?: ng.Program,
  host?: ng.CompilerHost
): ng.Diagnostics => {
  const diagnostics: (ng.Diagnostic | ts.Diagnostic)[] = [];
  try {
    if (!program) {
      if (!host) host = ng.createCompilerHost({ options });
      program = ng.createProgram({
        rootNames,
        host,
        options,
      });
    }
    diagnostics.push(...ng.defaultGatherDiagnostics(program));
    // No errors
    return diagnostics;
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
      code = ng.UNKNOWN_ERROR_CODE;
    }
    diagnostics.push({
      category: ts.DiagnosticCategory.Error,
      messageText: errMsg,
      code,
      source: ng.SOURCE,
    });
    return diagnostics;
  }
};

export const getTSDiagnosticErrorFile = (diagnostics: ng.Diagnostics) => {
  const tsDiagnostics = diagnostics.filter((diagnostic) =>
    ng.isTsDiagnostic(diagnostic)
  ) as ts.Diagnostic[];
  return tsDiagnostics.map((diagnostic) =>
    path.resolve(
      isTemplateDiagnostic(diagnostic)
        ? diagnostic.componentFile.fileName
        : diagnostic.file!.fileName
    )
  );
};

export const getTSDiagnosticErrorInFile = (
  filePath: string,
  diagnostics: ng.Diagnostics
) => {
  const tsErrors = diagnostics.filter((diagnostic) =>
    ng.isTsDiagnostic(diagnostic)
  ) as ts.Diagnostic[];
  return tsErrors.filter(
    (error) =>
      path.resolve(
        isTemplateDiagnostic(error)
          ? error.componentFile.fileName
          : error.file!.fileName
      ) === path.resolve(filePath)
  );
};

export const tsFormatDiagnosticHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (fileName) => fileName,
  getCurrentDirectory: () => path.resolve(process.cwd()),
  getNewLine: () => '\n',
};
