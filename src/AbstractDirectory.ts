import { AbstractEntry } from "./AbstractEntry";
import { AbstractFile } from "./AbstractFile";
import { AbstractFileSystem } from "./AbstractFileSystem";
import {
  DeleteOptions,
  Directory,
  Entry,
  ErrorLike,
  HeadOptions,
  ListOptions,
  MkcolOptions,
  Options,
  Stats,
  XmitOptions,
} from "./core";
import {
  createError,
  NotFoundError,
  NotReadableError,
  NotSupportedError,
  SecurityError,
  TypeMismatchError,
} from "./errors";
import { getName, joinPaths } from "./util";

export abstract class AbstractDirectory
  extends AbstractEntry
  implements Directory
{
  private afterList?: (path: string, list: string[]) => Promise<void>;
  private afterMkcol?: (path: string) => Promise<void>;
  private beforeList?: (
    path: string,
    options: ListOptions
  ) => Promise<string[] | null>;
  private beforeMkcol?: (
    psth: string,
    options: MkcolOptions
  ) => Promise<boolean>;

  constructor(fs: AbstractFileSystem, path: string) {
    super(fs, path);
    const hook = fs.options?.hook;
    if (hook) {
      this.beforeMkcol = hook.beforeMkcol;
      this.beforeList = hook.beforeList;
      this.afterMkcol = hook.afterMkcol;
      this.afterList = hook.afterList;
    }
  }

  public async _delete(
    options: DeleteOptions,
    errors: ErrorLike[]
  ): Promise<void> {
    try {
      await this._checkDirectory(options);
    } catch (e: unknown) {
      const name = (e as Error).name;
      if (name === TypeMismatchError.name) {
        throw e;
      }
      if (name === NotFoundError.name) {
        if (!options.force) {
          throw e;
        }
        return;
      } else {
        throw createError({
          name: NotReadableError.name,
          repository: this.fs.repository,
          path: this.path,
          e: e as ErrorLike,
        });
      }
    }

    if (options.recursive) {
      const children = await this.list(options);
      for (const child of children) {
        try {
          const childEntry = await this.fs.getEntry(child);
          await childEntry.delete(options);
        } catch (e: unknown) {
          if (options.force) {
            errors.push(e as ErrorLike);
          } else {
            throw e;
          }
        }
      }
    }

    return this._rmdir();
  }

  public async _xmit(
    to: Entry,
    copyErrors: ErrorLike[],
    options: XmitOptions
  ): Promise<void> {
    if (to instanceof AbstractFile) {
      throw createError({
        name: TypeMismatchError.name,
        repository: this.fs.repository,
        path: this.path,
        e: { message: `"${this.path}" is not a directory` },
      });
    }

    const toDir = to as Directory;
    await toDir.mkcol({
      force: options.force,
      recursive: false,
      ignoreHook: options.ignoreHook,
    });

    if (!options.recursive) {
      return;
    }

    const fromPaths = await this.list();
    for (const fromPath of fromPaths) {
      let toPath: string | undefined;
      try {
        const stats = await this.fs.head(fromPath, options);
        const fromEntry = (await (stats.size != null
          ? this.fs.getFile(fromPath)
          : this.fs.getDirectory(fromPath))) as Entry as AbstractEntry;
        const name = getName(fromPath);
        toPath = joinPaths(toDir.path, name);
        const toEntry = (await (stats.size != null
          ? this.fs.getFile(toPath)
          : this.fs.getDirectory(toPath))) as Entry as AbstractEntry;
        await fromEntry._xmit(toEntry, copyErrors, options);
      } catch (e: unknown) {
        copyErrors.push({ ...(e as ErrorLike), from: fromPath, to: toPath });
      }
    }
  }

  public head(options?: HeadOptions): Promise<Stats> {
    const path = this.path;
    if (!this.fs.canCreateDirectory()) {
      throw createError({
        name: NotSupportedError.name,
        repository: this.fs.repository,
        path,
        e: {
          message: "Stat/Head directory is not supported.",
        },
      });
    }

    options = { ...options, type: "directory" };
    return this.fs.head(path, options);
  }

  public async list(options?: ListOptions): Promise<string[]> {
    options = { ...options };
    let list: string[] | null | undefined;
    if (!options.ignoreHook && this.beforeList) {
      list = await this.beforeList(this.path, options);
    }
    if (!list) {
      if (this.path !== "/") {
        await this._checkDirectory(options);
      }
      list = await this._list();
    }
    if (!options.ignoreHook && this.afterList) {
      await this.afterList(this.path, list);
    }
    return list;
  }

  public ls = (options?: ListOptions | undefined) => this.list(options);

  public async mkcol(options?: MkcolOptions): Promise<void> {
    if (!this.fs.canCreateDirectory()) {
      throw createError({
        name: NotSupportedError.name,
        repository: this.fs.repository,
        path: this.path,
        e: {
          message: "Mkdir/Mkcol is not supported.",
        },
      });
    }

    options = { force: false, recursive: false, ...options };
    try {
      await this._checkDirectory(options);
      if (!options.force) {
        throw createError({
          name: SecurityError.name,
          repository: this.fs.repository,
          path: this.path,
          e: { message: `"${this.path}" has already existed` },
        });
      }
      return;
    } catch (e: unknown) {
      if ((e as ErrorLike).name === NotFoundError.name) {
        if (options.recursive) {
          const parent = await this.getParent();
          await parent.mkcol({
            force: true,
            recursive: true,
            ignoreHook: options.ignoreHook,
          });
        }
      } else {
        throw createError({
          name: NotReadableError.name,
          repository: this.fs.repository,
          path: this.path,
          e: e as ErrorLike,
        });
      }
    }
    if (!options.ignoreHook && this.beforeMkcol) {
      if (await this.beforeMkcol(this.path, options)) {
        return;
      }
    }
    await this._mkcol();
    if (!options.ignoreHook && this.afterMkcol) {
      await this.afterMkcol(this.path);
    }
  }

  public mkdir = (options?: MkcolOptions | undefined) => this.mkcol(options);

  public readdir = (options?: ListOptions | undefined) => this.list(options);

  public abstract _list(): Promise<string[]>;
  public abstract _mkcol(): Promise<void>;
  public abstract _rmdir(): Promise<void>;

  protected async _checkDirectory(options: Options) {
    const path = this.path;
    const stats = await this.fs.head(path, options);
    if (stats.size != null) {
      throw createError({
        name: TypeMismatchError.name,
        repository: this.fs.repository,
        path,
        e: { message: `"${path}" is not a directory` },
      });
    }
  }
}
