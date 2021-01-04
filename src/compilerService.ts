import { AngularJsonWrapper, readAngularJson } from './configParser';
import * as ng from '@angular/compiler-cli';
import fs, { promises as fsp } from 'fs';
import path from 'path';
import execa from 'execa';
import {
  compileAsync,
  RecompileFunctionAsync,
  watchCompileAsync,
} from './compile';
import {
  TypeCheckWorker,
  createTypeCheckWorker,
  TypeCheckArgs,
} from './typeCheckWorker';
import {
  getTSDiagnosticErrorFile,
  getTSDiagnosticErrorInFile,
  tsFormatDiagnosticHost,
} from './typeCheck';

interface BuildStatus {
  built: boolean;
  building: boolean;
  buildReadyCallback: VoidFunction[];
}

interface BuiltJSFile {
  code: string;
  map?: string;
}

type TypeCheckErrorListener = (diagnostic: ng.Diagnostics) => void;

export class AngularCompilerService {
  private _angularConfig: AngularJsonWrapper;
  private _ngCompilerHost: ng.CompilerHost;
  private _ngConfiguration: ng.ParsedConfiguration;
  private get _ngCompilerOptions(): ng.CompilerOptions {
    return this._ngConfiguration.options;
  }
  private _builtFiles = new Map<string, string>();
  private _buildStatus: BuildStatus = {
    built: false,
    building: false,
    buildReadyCallback: [],
  };
  private _recompileFunction?: RecompileFunctionAsync;
  private _lastCompilationResult?: ng.PerformCompilationResult;
  private _typeCheckErrorListeners = new Map<number, TypeCheckErrorListener>();
  private _typeCheckErrorListenerId = 0;
  private _typeCheckWorker?: TypeCheckWorker;
  private _lastTypeCheckResult: ng.Diagnostics = [];
  private _fileReplacements = new Map<string, string>();

  constructor(
    angularJson: string,
    private sourceDirectory: string,
    private ngccTargets: string[],
    private angularProject?: string
  ) {
    this._angularConfig = readAngularJson(angularJson);
    const { tsConfig } = this._angularConfig.getResolvedFilePaths(
      angularProject
    );
    this._ngConfiguration = ng.readConfiguration(tsConfig);
    this._ngCompilerHost = this.configureCompilerHost(
      ng.createCompilerHost({ options: this._ngCompilerOptions })
    );
  }
  private async runNgcc(targets: string[]) {
    for (const target of targets) {
      const ngcc = execa('ngcc', ['-t', target]);
      const { stdout } = await ngcc;
      stdout.split('\n').forEach((line) => {
        if (line !== '') console.log(`[angular] ${line}`);
      });
    }
    console.log(
      '[angular] Try clearing snowpack development cache with "snowpack --reload" if facing errors during dev mode'
    );
  }

  private configureCompilerHost(host: ng.CompilerHost): ng.CompilerHost {
    host.writeFile = (fileName, contents) => {
      fileName = path.relative(
        path.resolve(this._ngCompilerOptions.outDir || this.sourceDirectory),
        path.resolve(fileName)
      );
      // If sourceMap is inlined, leave it in the source.
      if (!this._ngCompilerOptions.inlineSourceMap)
        contents = contents.replace(/\/\/# sourceMappingURL.*/, '');
      this._builtFiles.set(fileName, contents);
    };
    host.readResource = async (fileName) => {
      const contents = await fsp.readFile(fileName, 'utf-8');
      return contents;
    };
    const oriReadFile = host.readFile;
    if (process.env.NODE_ENV === 'production') {
      const replacementConfig = this.angularConfig.getProject(
        this.angularProject
      ).architect.build.configurations.production.fileReplacements;
      replacementConfig.forEach((replacement) => {
        this._fileReplacements.set(
          path.resolve(replacement.replace),
          path.resolve(replacement.with)
        );
      });
    }
    host.readFile = (fileName) => {
      fileName = path.resolve(fileName);
      if (this._fileReplacements.has(fileName)) {
        const replaceWith = this._fileReplacements.get(fileName)!;
        fileName = replaceWith;
      }
      return oriReadFile(fileName);
    };
    return host;
  }

  private registerTypeCheckWorker() {
    this._typeCheckWorker = createTypeCheckWorker();
    this._typeCheckWorker.on('message', (msg) => {
      this._lastTypeCheckResult = msg;
      this._typeCheckErrorListeners.forEach((listener) => listener(msg));
    });
  }

  async buildSource(watch: boolean) {
    if (this._buildStatus.built) return;
    else if (!this._buildStatus.built && !this._buildStatus.building) {
      this._buildStatus.building = true;
      const compileArgs = {
        rootNames: this._ngConfiguration.rootNames,
        compilerHost: this._ngCompilerHost,
        compilerOptions: this._ngCompilerOptions,
      };
      await this.runNgcc(this.ngccTargets);
      if (watch) {
        this.registerTypeCheckWorker();
        const result = await watchCompileAsync(compileArgs);
        this._recompileFunction = result.recompile;
        this._lastCompilationResult = result.firstCompilation;
      } else {
        this._lastCompilationResult = await compileAsync(compileArgs);
      }
      this._buildStatus.built = true;
      this._buildStatus.building = false;
      this._buildStatus.buildReadyCallback.forEach((cb) => cb());
      this._buildStatus.buildReadyCallback = [];
    } else {
      return new Promise<void>((resolve) => {
        this._buildStatus.buildReadyCallback.push(resolve);
      });
    }
  }

  async recompile(modifiedFile: string) {
    if (!this._recompileFunction)
      throw new Error(
        'Cannot recompile as angular was not build with watch mode enabled'
      );
    else {
      const recompiledResult = await this._recompileFunction(
        modifiedFile,
        this.sourceDirectory
      );
      this._lastCompilationResult = {
        diagnostics: recompiledResult.diagnostics,
        emitResult: recompiledResult.emitResult,
        program: recompiledResult.program,
      };
      this._lastTypeCheckResult = [];
      const workerMessage: TypeCheckArgs = {
        action: 'run_check',
        data: {
          options: this._ngCompilerOptions,
          rootNames: this._ngConfiguration.rootNames,
        },
      };
      this._typeCheckWorker!.postMessage(workerMessage);
      const recompiledFiles = recompiledResult.recompiledFiles
        .filter((file) => path.extname(file) === '.js')
        .map((file) =>
          path
            .resolve(path.join(this.sourceDirectory, file))
            .replace(path.extname(file), '.ts')
        );
      return {
        recompiledFiles,
        recompiledResult,
      };
    }
  }

  getBuiltFile(filePath: string): BuiltJSFile | null {
    filePath = path.relative(
      path.resolve(this.sourceDirectory),
      path.resolve(filePath)
    );
    let result: BuiltJSFile | null = null;
    const codeFile = filePath.replace(path.extname(filePath), '.js');
    const mapFile = filePath.replace(path.extname(filePath), '.js.map');
    if (this._builtFiles.has(codeFile)) {
      result = {
        code: this._builtFiles.get(codeFile)!,
      };
      if (this._builtFiles.has(mapFile))
        result.map = this._builtFiles.get(mapFile);
    }
    return result;
  }

  onTypeCheckError(listener: TypeCheckErrorListener) {
    const id = this._typeCheckErrorListenerId++;
    this._typeCheckErrorListeners.set(id, listener);
    return id;
  }

  removeTypeCheckErrorListener(id: number) {
    this._typeCheckErrorListeners.delete(id);
  }

  getIndexInjects() {
    const {
      index,
      styles,
      scripts,
      main,
      polyfills,
    } = this._angularConfig.getResolvedFilePaths(this.angularProject);
    const indexDir = path.dirname(index);
    const injectStyles = styles.map((style) => {
      const relativeUrl = path
        .relative(indexDir, style)
        .replace(path.extname(style), '.css');
      return `<link rel="stylesheet" href="${relativeUrl}">`;
    });
    const injectScripts = scripts.map((script) => {
      const relativeUrl = path
        .relative(indexDir, script)
        .replace(path.extname(script), '.js');
      return `<script defer type="module" src="${relativeUrl}"></script>`;
    });
    const relativePolyfillsUrl = path
      .relative(indexDir, polyfills)
      .replace(path.extname(polyfills), '.js');
    const injectPolyfills = `<script defer type="module" src="${relativePolyfillsUrl}"></script>`;
    const relativeMainUrl = path
      .relative(indexDir, main)
      .replace(path.extname(main), '.js');
    const injectMain = `<script defer type="module" src="${relativeMainUrl}"></script>`;
    return {
      injectPolyfills,
      injectMain,
      injectStyles,
      injectScripts,
    };
  }

  getErrorInFile(filePath: string): ng.Diagnostics {
    return getTSDiagnosticErrorInFile(filePath, [
      ...this._lastTypeCheckResult,
      ...this._lastCompilationResult!.diagnostics,
    ]);
  }

  getErroredFiles(diagnostics: ng.Diagnostics): string[] {
    return getTSDiagnosticErrorFile(diagnostics);
  }

  formatDiagnostics(diagnostics: ng.Diagnostics) {
    return ng.formatDiagnostics(diagnostics, tsFormatDiagnosticHost);
  }

  get ngConfiguration() {
    return this._ngConfiguration;
  }

  get angularConfig() {
    return this._angularConfig;
  }

  getAngularCriticalFiles() {
    return this._angularConfig.getResolvedFilePaths(this.angularProject);
  }

  useSourceMaps(state?: 'normal' | 'none' | 'inline', inlineSources?: boolean) {
    if (inlineSources !== undefined)
      this._ngCompilerOptions.inlineSources = inlineSources;
    switch (state) {
      case 'none':
        this._ngCompilerOptions.sourceMap = this._ngCompilerOptions.inlineSourceMap = false;
        this._ngCompilerOptions.inlineSources = false;
        break;
      case 'normal':
        this._ngCompilerOptions.sourceMap = true;
        this._ngCompilerOptions.inlineSourceMap = false;
        break;
      case 'inline':
        this._ngCompilerOptions.inlineSourceMap = true;
        this._ngCompilerOptions.sourceMap = false;
        break;
    }
  }
}
