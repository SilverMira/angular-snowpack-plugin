# angular-snowpack-plugin

This is a highly experimental snowpack plugin. Has only been tested to work on brand new Angular 11 project generated through `ng new <project_name>`. Working setup could be seen [here](https://github.com/phantasmalmira/AngularSnowpackDemo).

## Usage

```bash
npm i --save-dev angular-snowpack-plugin
```

```json
// snowpack.config.js

{
  "installs": ["@angular/common"],
  "plugins": [
    [
      "angular-snowpack-plugin",
      {
        /* Plugin Options goes here */
      }
    ]
  ]
}
```

## Plugin Options

| Name          | Type       | Description                                                                                                                      | Default                          |
| ------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- |
| `src`         | `string`   | Relative path to the source directory of your angular project.                                                                   | `src`                            |
| `logLevel`    | `'normal'  | 'debug'`                                                                                                                         | Logging verbosity of the plugin. | `normal` |
| `tsConfig`    | `string`   | Relative path to the build options tsconfig of your Angular project, check in `angular.json`.                                    | `tsconfig.app.json`              |
| `ngccTargets` | `string[]` | `ngcc` targets that the plugin will attempt to run `ngcc` with on each startup, values here will be extending the default value. | `['@angular/platform-browser']`  |

## Important Notes

If facing strange errors while running `snowpack dev`, please run `snowpack build` first, and determine if the same errors happen on the built version.
If errors only happen in `snowpack dev`, try running `snowpack --reload` to clear development cache.

This is because `ngcc` has to build @angular packages that your project uses into ivy compatible, and `snowpack dev` converts these packages into web_modules before they were run through `ngcc` by the plugin, and `snowpack dev` does not clear cache even after `ngcc` finishes.
