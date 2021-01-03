import fs from 'fs';
import path from 'path';

export interface fileReplacement {
  replace: string;
  with: string;
}

export interface AngularArchitectConfig {
  fileReplacements: fileReplacement[];
  optimization: boolean;
  sourceMap: boolean;
}

export interface AngularArchitectSubset {
  options: {
    outputPath: string;
    index: string;
    main: string;
    polyfills: string;
    tsConfig: string;
    aot: boolean;
    assets: string[];
    styles: string[];
    scripts: string[];
  };
  configurations: {
    [configurationName: string]: AngularArchitectConfig;
  };
}

export interface AngularProjectSubset {
  sourceRoot: string;
  architect: {
    [architectName: string]: AngularArchitectSubset;
  };
}

export interface AngularJson {
  projects: {
    [projectName: string]: AngularProjectSubset;
  };
  defaultProject: string;
}

export interface AngularCriticalFiles {
  index: string;
  polyfills: string;
  main: string;
  styles: string[];
  scripts: string[];
  tsConfig: string;
}

export interface AngularJsonWrapper {
  angularJson: AngularJson;
  getProject: (projectName?: string) => AngularProjectSubset;
  getResolvedFilePaths: (projectName?: string) => AngularCriticalFiles;
}

export const readAngularJson = (fileName: string): AngularJsonWrapper => {
  const jsonContents = JSON.parse(
    fs.readFileSync(fileName, 'utf-8')
  ) as AngularJson;
  return {
    angularJson: jsonContents,
    getProject(projectName?: string) {
      if (!projectName) projectName = this.angularJson.defaultProject;
      return this.angularJson.projects[projectName];
    },
    getResolvedFilePaths(projectName?: string): AngularCriticalFiles {
      const project = this.getProject(projectName);
      return {
        index: path.resolve(project.architect.build.options.index),
        polyfills: path.resolve(project.architect.build.options.polyfills),
        main: path.resolve(project.architect.build.options.main),
        styles: project.architect.build.options.styles.map((style) =>
          path.resolve(style)
        ),
        scripts: project.architect.build.options.scripts.map((script) =>
          path.resolve(script)
        ),
        tsConfig: project.architect.build.options.tsConfig,
      };
    },
  };
};
