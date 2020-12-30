import * as sass from 'sass';
import * as path from 'path';
import * as less from 'less';
import * as stylus from 'stylus';

export interface StyleProcessArgs {
  fileName: string;
  contents: string;
}

export interface BuiltStyle {
  css: string;
  map?: string;
}

export const sassHandler = async ({
  contents,
  fileName,
}: StyleProcessArgs): Promise<BuiltStyle> => {
  const sassResult = await new Promise<sass.Result>((resolve, reject) => {
    sass.render(
      {
        data: contents,
        sourceMap: path.basename(fileName) + '.map',
      },
      (err, res) => {
        if (err) return reject(err);
        resolve(res);
      }
    );
  });
  return {
    css: sassResult.css.toString('utf-8'),
    map: sassResult.map?.toString('utf-8'),
  };
};

export const lessHandler = async ({
  contents,
  fileName,
}: StyleProcessArgs): Promise<BuiltStyle> => {
  const lessResult = await less.render(contents);
  return {
    css: lessResult.css,
    map: lessResult.map,
  };
};

export const stylusHandler = async ({
  contents,
  fileName,
}: StyleProcessArgs): Promise<BuiltStyle> => {
  const stylusResult = await new Promise<string>((resolve, reject) => {
    stylus.render(contents, {}, (err, css) => {
      if (err) return reject(err);
      resolve(css);
    });
  });
  return {
    css: stylusResult,
  };
};

const PROCESSABLE_FILEEXT = /\.(scss|sass|less|styl)$/;
export const createStyleHandler = () => {
  return {
    async process({
      fileName,
      contents,
    }: StyleProcessArgs): Promise<BuiltStyle> {
      let result: BuiltStyle = {
        css: '',
      };
      switch (path.extname(fileName)) {
        case '.scss':
        case '.sass':
          result = await sassHandler({ fileName, contents });
          break;
        case '.less':
          result = await lessHandler({ fileName, contents });
          break;
        case '.styl':
          result = await stylusHandler({ fileName, contents });
          break;
        default:
          result.css = contents;
      }
      debugger;
      return result;
    },
    needProcess(fileName: string) {
      return PROCESSABLE_FILEEXT.test(fileName);
    },
  };
};
