import { EventEmitter } from 'events';
import path from 'path';

interface StyleResourceEvents {
  request: (stylePath: string) => void;
}

declare interface StyleResource {
  on<U extends keyof StyleResourceEvents>(
    event: U,
    listener: StyleResourceEvents[U]
  ): this;
  emit<U extends keyof StyleResourceEvents>(
    event: U,
    ...args: Parameters<StyleResourceEvents[U]>
  ): boolean;
}

interface StyleLookup {
  listeners: ((styleContents: string) => void)[];
  content: string | null;
}

class StyleResource extends EventEmitter {
  private styleLookups = new Map<string, StyleLookup>();
  constructor() {
    super();
  }

  /**
   * Returns a promise of the compiled style
   * @param stylePath Path to the style requested
   *
   * The compiled style will be provided from the `transform` step of the plugin.
   */
  async requestStyle(stylePath: string): Promise<string> {
    stylePath = path.resolve(stylePath);
    this.emit('request', stylePath);
    return new Promise<string>((resolve) => {
      const compiledStylePath = stylePath.replace(
        path.extname(stylePath),
        '.css'
      );
      if (!this.styleLookups.has(compiledStylePath)) {
        this.styleLookups.set(compiledStylePath, {
          listeners: [],
          content: null,
        });
      }
      const lookup = this.styleLookups.get(compiledStylePath)!;
      if (typeof lookup.content === 'string') {
        resolve(lookup.content);
      } else {
        lookup.listeners.push(resolve);
      }
    });
  }

  submitStyle(stylePath: string, styleContents: string) {
    stylePath = path
      .resolve(stylePath)
      .replace(path.extname(stylePath), '.css');
    if (!this.styleLookups.has(stylePath)) {
      this.styleLookups.set(stylePath, {
        listeners: [],
        content: null,
      });
    }
    const lookup = this.styleLookups.get(stylePath)!;
    lookup.content = styleContents;
    for (const listener of lookup.listeners) {
      listener(styleContents);
    }
    lookup.listeners = [];
  }

  purgeCache(stylePath?: string) {
    if (!stylePath) {
      this.styleLookups.clear();
    } else {
      stylePath = path
        .resolve(stylePath)
        .replace(path.extname(stylePath), '.css');
      const lookup = this.styleLookups.get(stylePath);
      if (lookup) lookup.content = null;
    }
  }

  get hasListener() {
    return this.listenerCount('request') > 0;
  }
}

// Export singleton manager
export const styleResourceManager = new StyleResource();
export const STYLES_FILEEXT_REGEX = /\.(css|scss|sass|styl|less)$/;
