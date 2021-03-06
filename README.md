# angular-snowpack-plugin

This is a highly experimental snowpack plugin. Has only been tested to work on brand new Angular >= 9 project generated through `ng new <project_name>`. Working setup could be seen [here](https://github.com/phantasmalmira/AngularSnowpackDemo).

## Style Preprocessors (USE `ngsnow` INSTEAD OF `snowpack dev`)

Starting from version `2.3.0`, style pre/post-processing is now supported with caveats. `snowpack dev` will not support this feature, use `ngsnow` instead. `ngsnow` is a wrapper around `snowpack dev` that will enable this feature. `ngsnow` is bundled with the plugin, run `ngsnow` by using `npx ngsnow` or `package.json` run scripts after installing. 

Install appropriate snowpack plugins such as [@snowpack/plugin-sass](https://www.npmjs.com/package/@snowpack/plugin-sass) or [@snowpack/plugin-postcss](https://www.npmjs.com/package/@snowpack/plugin-postcss) to enable style pre/post-processing.

Sass is tested along with PostCSS, TailwindCSS tested to fully work with `@apply` rules.

## Usage

```bash
npm i --save-dev angular-snowpack-plugin
```

```js
// snowpack.config.js

{
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

| Name             | Type       | Description                                                                                                                                                                                                                                     | Default                                                                     |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `angularJson`    | `string`   | Relative path to `angular.json` of your Angular project.                                                                                                                                                                                        | `angular.json`                                                              |
| `angularProject` | `string`   | Target project of the build as according to `angular.json`                                                                                                                                                                                      | default project defined in `angular.json`                                   |
| `ngccTargets`    | `string[]` | Explicit `ngcc` targets that the plugin will attempt to run `ngcc` with on each startup, values here will be extending the default value.                                                                                                                | Detected `node_modules` packages imported in source files |
| `errorToBrowser` | `boolean`  | Determines whether a type-check error will be pushed to the browser as a build error, note that this only applies to dev mode, build and first compilation will push error to browser regardless, `false` will mimic the behavior of `ng serve` | `true`                                                                      |
| `useHmr`         | `boolean`  | Enables hot-module replacement\(HMR\) based on Angular 11 HMR code, tested to work on Angular >= 9 with ivy enabled                                                                                                                             | `false`                                                                     |

## Setup in existing `@angular/cli` projects

```bash
npm i --save-dev angular-snowpack-plugin snowpack
```

```js
// snowpack.config.js

{
  mount: {
    src: '/'
  },
  plugins: [
    [
      "angular-snowpack-plugin",
      { /* Plugin Options goes here */ }
    ]
  ]
}
```

Run `snowpack dev` (`ngsnow` for style pre/post-processing capabilities) or `snowpack build`.

## Important Notes

If facing strange errors while running `snowpack dev`, please run `snowpack build` first, and determine if the same errors happen on the built version.
If errors only happen in `snowpack dev`, try running `snowpack --reload` to clear development cache.

This is because `ngcc` has to build @angular packages that your project uses into ivy compatible, and `snowpack dev` converts these packages into web_modules before they were run through `ngcc` by the plugin, and `snowpack dev` does not clear cache even after `ngcc` finishes.
