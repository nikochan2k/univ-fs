import { createHash } from "sha256-uint8array";
import { toUint8Array } from "../util/buffer";
import { toHex } from "../util/misc";
import { getName, getParentPath, joinPaths } from "../util/path";
import {
  DeleteOptions,
  Directory,
  File,
  FileSystem,
  FileSystemObject,
  FileSystemOptions,
  HeadOptions,
  ListOptions,
  MkcolOptions,
  OpenOptions,
  OpenWriteOptions,
  PatchOptions,
  Props,
  Stats,
  URLType,
  XmitError,
  XmitOptions,
} from "./common";
import {
  InvalidModificationError,
  NotFoundError,
  PathExistsError,
} from "./errors";

export abstract class AbstractFileSystem implements FileSystem {
  private afterDelete?: (path: string) => Promise<void>;
  private afterHead?: (path: string, stats: Stats) => Promise<void>;
  private afterPatch?: (path: string) => Promise<void>;
  private beforeDelete?: (
    path: string,
    options: DeleteOptions
  ) => Promise<boolean>;
  private beforeHead?: (
    path: string,
    options: HeadOptions
  ) => Promise<Stats | null>;
  private beforePatch?: (
    path: string,
    props: Props,
    options: PatchOptions
  ) => Promise<boolean>;

  public del = this.delete;
  public rm = this.delete;
  public stat = this.head;

  constructor(
    public readonly repository: string,
    public readonly options: FileSystemOptions = {}
  ) {
    const hook = options.hook;
    this.beforeDelete = hook?.beforeDelete;
    this.beforeHead = hook?.beforeHead;
    this.beforePatch = hook?.beforePatch;
    this.afterDelete = hook?.afterDelete;
    this.afterHead = hook?.afterHead;
    this.afterPatch = hook?.afterPatch;
  }

  public async copy(
    fromPath: string,
    toPath: string,
    options: XmitOptions = {}
  ): Promise<XmitError[]> {
    const { from, to } = await this._prepareXmit(fromPath, toPath);
    return from.copy(to, options);
  }

  public async delete(
    path: string,
    options: DeleteOptions = {}
  ): Promise<void> {
    if (!options.ignoreHook && this.beforeDelete) {
      if (await this.beforeDelete(path, options)) {
        return;
      }
    }
    await this._delete(path, options);
    if (!options.ignoreHook && this.afterDelete) {
      await this.afterDelete(path);
    }
  }

  public async head(path: string, options: HeadOptions = {}): Promise<Stats> {
    let stats: Stats | null | undefined;
    if (!options.ignoreHook && this.beforeHead) {
      stats = await this.beforeHead(path, options);
    }
    if (!stats) {
      stats = await this._head(path, options);
    }
    if (!options.ignoreHook && this.afterHead) {
      await this.afterHead(path, stats);
    }
    return stats;
  }

  public async move(
    fromPath: string,
    toPath: string,
    options: XmitOptions = {}
  ): Promise<XmitError[]> {
    const { from, to } = await this._prepareXmit(fromPath, toPath);
    return from.move(to, options);
  }

  public async patch(
    path: string,
    props: Props,
    options: PatchOptions = {}
  ): Promise<void> {
    if (this.beforePatch) {
      if (await this.beforePatch(path, props, options)) {
        return;
      }
    }
    await this._patch(path, props, options);
    if (this.afterPatch) {
      await this.afterPatch(path);
    }
  }

  public abstract _delete(path: string, options: DeleteOptions): Promise<void>;
  public abstract _head(path: string, options: HeadOptions): Promise<Stats>;
  public abstract _patch(
    path: string,
    props: Props,
    options: PatchOptions
  ): Promise<void>;
  /**
   * Get a directory.
   * @param path A path to a directory.
   * @param options
   */
  public abstract getDirectory(path: string): Promise<AbstractDirectory>;
  /**
   * Get a file.
   * @param path A path to a file.
   * @param options
   */
  public abstract getFile(path: string): Promise<AbstractFile>;
  public abstract toURL(path: string, urlType?: URLType): Promise<string>;

  private async _prepareXmit(fromPath: string, toPath: string) {
    const stats = await this.stat(fromPath);
    const from = await (stats.size
      ? this.getFile(fromPath)
      : this.getDirectory(fromPath));
    const to = await (stats.size
      ? this.getFile(toPath)
      : this.getDirectory(toPath));
    return { from, to };
  }
}

export abstract class AbstractFileSystemObject implements FileSystemObject {
  public del = this.delete;
  public rm = this.delete;
  public stat = this.head;

  constructor(public readonly fs: AbstractFileSystem, public path: string) {}

  public async copy(
    fso: AbstractFileSystemObject,
    options: XmitOptions
  ): Promise<XmitError[]> {
    const copyErrors: XmitError[] = [];
    await this._xmit(fso, false, copyErrors, options);
    return copyErrors;
  }

  public async delete(options: DeleteOptions = {}): Promise<void> {
    return this.fs.delete(this.path, options);
  }

  public async getParent(): Promise<string> {
    return getParentPath(this.path);
  }

  public head(options: HeadOptions = {}): Promise<Stats> {
    return this.fs.head(this.path, options);
  }

  public async move(
    fso: AbstractFileSystemObject,
    options: XmitOptions
  ): Promise<XmitError[]> {
    const copyErrors: XmitError[] = [];
    await this._xmit(fso, true, copyErrors, options);
    return copyErrors;
  }

  public patch = (props: Props, options: PatchOptions = {}) =>
    this.fs.patch(this.path, props, options);

  public toString = () => `${this.fs.repository}:${this.path}`;

  public toURL = (urlType?: URLType) => this.fs.toURL(this.path, urlType);

  public abstract _xmit(
    fso: AbstractFileSystemObject,
    move: boolean,
    copyErrors: XmitError[],
    options: XmitOptions
  ): Promise<void>;
}

export abstract class AbstractDirectory
  extends AbstractFileSystemObject
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

  public ls = this.list;
  public readdir = this.list;
  public mkdir = this.mkcol;

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

  public async _xmit(
    fso: AbstractFileSystemObject,
    move: boolean,
    copyErrors: XmitError[],
    options: XmitOptions = {}
  ): Promise<void> {
    await this.head(); // check if this directory exists
    if (fso instanceof AbstractFile) {
      throw new InvalidModificationError(
        fso.fs.repository,
        fso.path,
        `Cannot copy a directory "${this}" to a file "${fso}"`
      );
    }

    const toDir = fso as unknown as AbstractDirectory;
    await toDir.mkcol();

    const children = await this.list();
    for (const child of children) {
      const stats = await this.fs.head(child);
      const fromFso = await (stats.size
        ? this.fs.getFile(child)
        : this.fs.getDirectory(child));
      const name = getName(child);
      const toPath = joinPaths(toDir.path, name);
      const toFso = await (stats.size
        ? this.fs.getFile(toPath)
        : this.fs.getDirectory(toPath));
      try {
        await fromFso._xmit(toFso, move, copyErrors, options);
        if (move) {
          try {
            await fromFso.delete();
          } catch (error) {
            copyErrors.push({ from: fromFso, to: toFso, error });
          }
        }
      } catch (error) {
        copyErrors.push({ from: fromFso, to: toFso, error });
      }
    }
  }

  public async list(options: ListOptions = {}): Promise<string[]> {
    let list: string[] | null | undefined;
    if (!options.ignoreHook && this.beforeList) {
      list = await this.beforeList(this.path, options);
    }
    if (!list) {
      list = await this._list(options);
    }
    if (!options.ignoreHook && this.afterList) {
      await this.afterList(this.path, list);
    }
    return list;
  }

  /**
   * Create a directory.
   * @param options Either the file mode, or an object optionally specifying the file mode and whether parent folders
   */
  public async mkcol(options: MkcolOptions = {}): Promise<void> {
    if (!options.ignoreHook && this.beforeMkcol) {
      if (await this.beforeMkcol(this.path, options)) {
        return;
      }
    }
    await this._mkcol(options);
    if (!options.ignoreHook && this.afterMkcol) {
      await this.afterMkcol(this.path);
    }
  }

  public abstract _list(options: ListOptions): Promise<string[]>;
  public abstract _mkcol(options: MkcolOptions): Promise<void>;
}
export abstract class AbstractFile
  extends AbstractFileSystemObject
  implements File
{
  private beforeGet?: (
    path: string,
    options: OpenOptions
  ) => Promise<ReadStream | null>;
  private beforePost?: (
    path: string,
    options: OpenWriteOptions
  ) => Promise<WriteStream | null>;
  private beforePut?: (
    path: string,
    options: OpenWriteOptions
  ) => Promise<WriteStream | null>;

  constructor(fs: AbstractFileSystem, path: string) {
    super(fs, path);
    const hook = fs.options?.hook;
    if (hook) {
      this.beforeGet = hook.beforeGet;
      this.beforePost = hook.beforePost;
      this.beforePut = hook.beforePut;
    }
  }

  public async _xmit(
    fso: AbstractFileSystemObject,
    move: boolean,
    copyErrors: XmitError[],
    options: XmitOptions = {}
  ): Promise<void> {
    await this.stat(); // check if this directory exists
    if (fso instanceof AbstractDirectory) {
      throw new InvalidModificationError(
        fso.fs.repository,
        fso.path,
        `Cannot copy a file "${this}" to a directory "${fso}"`
      );
    }
    const to = fso as AbstractFile;

    const rs = await this.openReadStream({ bufferSize: options.bufferSize });
    try {
      let create: boolean;
      try {
        await to.stat();
        create = false;
      } catch (e) {
        if (e instanceof NotFoundError) {
          create = true;
        } else {
          throw e;
        }
      }
      const ws = await to.openWriteStream({
        create,
        bufferSize: options.bufferSize,
      });
      try {
        let buffer: any;
        while ((buffer = rs.read()) == null) {
          ws.write(buffer);
        }
      } finally {
        ws.close();
      }
    } finally {
      rs.close();
    }

    if (move) {
      try {
      } catch (error) {
        copyErrors.push({ from: this, to, error });
      }
    }
  }

  public async hash(bufferSize?: number): Promise<string> {
    const rs = await this.openReadStream({ bufferSize });
    try {
      const hash = createHash();
      let buffer: ArrayBuffer | Uint8Array;
      while ((buffer = await rs.read()) != null) {
        hash.update(toUint8Array(buffer));
      }

      return toHex(hash.digest());
    } finally {
      rs.close();
    }
  }

  public async openReadStream(options: OpenOptions = {}): Promise<ReadStream> {
    let rs: ReadStream | null | undefined;
    if (!options.ignoreHook && this.beforeGet) {
      rs = await this.beforeGet(this.path, options);
    }
    if (!rs) {
      rs = await this._openReadStream(options);
    }
    return rs;
  }

  public async openWriteStream(
    options: OpenWriteOptions = {}
  ): Promise<WriteStream> {
    let ws: WriteStream | null | undefined;
    try {
      await this.stat();
      if (options.create === true) {
        throw new PathExistsError(this.fs.repository, this.path);
      }
      options.create = false;
      if (!options.ignoreHook && this.beforePut) {
        ws = await this.beforePut(this.path, options);
      }
    } catch (e) {
      if (e instanceof NotFoundError) {
        if (options.create === false) {
          throw e;
        }
        options.create = true;
        if (!options.ignoreHook && this.beforePost) {
          ws = await this.beforePost(this.path, options);
        }
      } else {
        throw e;
      }
    }
    if (!ws) {
      ws = await this._openWriteStream(options);
    }
    return ws;
  }

  public abstract _openReadStream(options: OpenOptions): Promise<ReadStream>;
  public abstract _openWriteStream(options: OpenOptions): Promise<WriteStream>;
}

export enum SeekOrigin {
  Begin,
  Current,
  End,
}

export abstract class Stream {
  protected readonly bufferSize = 64 * 1024;

  constructor(protected fso: AbstractFileSystemObject, options: OpenOptions) {
    if (options.bufferSize) {
      this.bufferSize = options.bufferSize;
    }
  }

  public abstract seek(offset: number, origin: SeekOrigin): Promise<void>;
}

export abstract class ReadStream extends Stream {
  private afterGet?: (path: string) => Promise<void>;

  protected handled = false;

  constructor(
    fso: AbstractFileSystemObject,
    protected readonly options: OpenOptions
  ) {
    super(fso, options);
    this.afterGet = fso.fs.options.hook?.afterGet;
  }

  public async close(): Promise<void> {
    await this._close();
    if (!this.options.ignoreHook && this.afterGet) {
      this.afterGet(this.fso.path);
    }
  }

  /**
   * Asynchronously reads data from the file.
   * The `File` must have been opened for reading.
   */
  public async read(size?: number): Promise<ArrayBuffer | Uint8Array> {
    const buffer = await this._read(size);
    this.handled = true;
    return buffer;
  }

  public abstract _close(): Promise<void>;
  public abstract _read(size?: number): Promise<ArrayBuffer | Uint8Array>;
}

export abstract class WriteStream extends Stream {
  private afterPost?: (path: string) => Promise<void>;
  private afterPut?: (path: string) => Promise<void>;

  protected handled = false;

  constructor(
    fso: AbstractFileSystemObject,
    protected readonly options: OpenWriteOptions
  ) {
    super(fso, options);
    const hook = fso.fs.options.hook;
    this.afterPost = hook?.afterPost;
    this.afterPut = hook?.afterPut;
  }

  public async close(): Promise<void> {
    await this._close();
    if (!this.handled) {
      return;
    }
    if (!this.options.ignoreHook && this.afterPost && this.options.create) {
      await this.afterPost(this.fso.path);
    } else if (
      !this.options.ignoreHook &&
      this.afterPut &&
      !this.options.create
    ) {
      await this.afterPut(this.fso.path);
    }
  }

  public async setLength(len: number): Promise<void> {
    await this.setLength(len);
    this.handled = true;
  }

  /**
   * Asynchronously reads data from the file.
   * The `File` must have been opened for reading.
   */
  public async write(buffer: ArrayBuffer | Uint8Array): Promise<void> {
    await this._write(buffer);
    this.handled = true;
  }

  public abstract _close(): Promise<void>;
  public abstract _setLength(len: number): Promise<void>;
  public abstract _write(buffer: ArrayBuffer | Uint8Array): Promise<void>;
}
