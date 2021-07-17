import { createHash } from "sha256-uint8array";
import { InvalidModificationError, NotFoundError } from "./errors";
import { toUint8Array } from "./util/buffer";
import { toHex } from "./util/misc";
import { getName, getParentPath, joinPaths } from "./util/path";

export interface Interceptor {
  afterDelete?: (path: string) => Promise<void>;
  afterGet?: (path: string) => Promise<void>;
  afterHead?: (path: string, stats: Stats) => Promise<void>;
  afterList?: (path: string, list: string[]) => Promise<void>;
  afterMkcol?: (path: string) => Promise<void>;
  afterPatch?: (path: string) => Promise<void>;
  afterPost?: (path: string) => Promise<void>;
  afterPut?: (path: string) => Promise<void>;
  beforeDelete?: (path: string, options?: DeleteOptions) => Promise<boolean>;
  beforeGet?: (
    path: string,
    options?: OpenOptions
  ) => Promise<ReadStream | null>;
  beforeHead?: (path: string) => Promise<Stats | null>;
  beforeList?: (path: string) => Promise<string[] | null>;
  beforeMkcol?: (path: string, options?: MkcolOptions) => Promise<boolean>;
  beforePatch?: (path: string, props: Props) => Promise<boolean>;
  beforePost?: (
    path: string,
    options?: OpenOptions
  ) => Promise<WriteStream | null>;
  beforePut?: (
    path: string,
    options?: OpenOptions
  ) => Promise<WriteStream | null>;
}

export interface Times {
  accessed?: number;
  created?: number;
  deleted?: number;
  modified?: number;
}

export interface Props extends Times {
  [name: string]: any;
}

export interface Stats extends Props {
  size?: number;
}

export interface FileSystemOptions {
  interceptor?: Interceptor;
}

export abstract class FileSystem {
  private afterDelete?: (path: string) => Promise<void>;
  private afterHead?: (path: string, stats: Stats) => Promise<void>;
  private afterPatch?: (path: string) => Promise<void>;
  private beforeDelete?: (
    path: string,
    options?: DeleteOptions
  ) => Promise<boolean>;
  private beforeHead?: (path: string) => Promise<Stats | null>;
  private beforePatch?: (path: string, props: Props) => Promise<boolean>;

  public del = this.delete;
  public rm = this.delete;
  public stat = this.head;

  constructor(
    public readonly repository: string,
    public readonly options: FileSystemOptions = {}
  ) {
    const interceptor = options.interceptor;
    this.beforeDelete = interceptor?.beforeDelete;
    this.beforeHead = interceptor?.beforeHead;
    this.beforePatch = interceptor?.beforePatch;
    this.afterDelete = interceptor?.afterDelete;
    this.afterHead = interceptor?.afterHead;
    this.afterPatch = interceptor?.afterPatch;
  }

  public async delete(path: string, options?: DeleteOptions): Promise<void> {
    if (this.beforeDelete) {
      if (await this.beforeDelete(path, options)) {
        return;
      }
    }
    await this._delete(path, options);
    if (this.afterDelete) {
      await this.afterDelete(path);
    }
  }

  public async head(path: string): Promise<Stats> {
    let stats: Stats | null | undefined;
    if (this.beforeHead) {
      stats = await this.beforeHead(path);
    }
    if (!stats) {
      stats = await this._head(path);
    }
    if (this.afterHead) {
      await this.afterHead(path, stats);
    }
    return stats;
  }

  public async patch(path: string, props: Props): Promise<void> {
    if (this.beforePatch) {
      if (await this.beforePatch(path, props)) {
        return;
      }
    }
    await this._patch(path, props);
    if (this.afterPatch) {
      await this.afterPatch(path);
    }
  }

  public abstract _delete(path: string, options?: DeleteOptions): Promise<void>;
  public abstract _head(path: string): Promise<Stats>;
  public abstract _patch(path: string, props: Props): Promise<void>;
  /**
   * Get a directory.
   * @param path A path to a directory.
   * @param options
   */
  public abstract getDirectory(path: string): Promise<Directory>;
  /**
   * Get a file.
   * @param path A path to a file.
   * @param options
   */
  public abstract getFile(path: string): Promise<File>;
}

export type URLType = "GET" | "POST" | "PUT" | "DELETE";

export interface DeleteOptions {
  /**
   * When `true`, exceptions will be ignored if `path` does not exist.
   * @default false
   */
  force?: boolean;
  /**
   * If `true`, perform a recursive directory removal. In
   * recursive mode, errors are not reported if `path` does not exist, and
   * operations are retried on failure.
   * @default false
   */
  recursive?: boolean;
}

export interface XmitError {
  error: Error;
  from: FileSystemObject;
  to: FileSystemObject;
}
export abstract class FileSystemObject {
  public del = this.delete;
  public rm = this.delete;
  public stat = this.head;

  constructor(public readonly fs: FileSystem, public path: string) {}

  public async copy(fso: FileSystemObject): Promise<XmitError[]> {
    const copyErrors: XmitError[] = [];
    await this._xmit(fso, false, copyErrors);
    return copyErrors;
  }

  public async delete(options?: DeleteOptions): Promise<void> {
    return this.fs.delete(this.path, options);
  }

  public async getParent(): Promise<string> {
    return getParentPath(this.path);
  }

  public head(): Promise<Stats> {
    return this.fs.head(this.path);
  }

  public async move(fso: FileSystemObject): Promise<XmitError[]> {
    const copyErrors: XmitError[] = [];
    await this._xmit(fso, true, copyErrors);
    return copyErrors;
  }

  public patch(props: Props): Promise<void> {
    return this.fs.patch(this.path, props);
  }

  public toString = (): string => {
    return `${this.fs.repository}:${this.path}`;
  };

  public abstract _xmit(
    fso: FileSystemObject,
    move: boolean,
    copyErrors: XmitError[]
  ): Promise<void>;
  public abstract toURL(urlType?: URLType): Promise<string>;
}

export interface MkcolOptions {
  /**
   * Indicates whether parent folders should be created.
   * If a folder was created, the path to the first created folder will be returned.
   * @default false
   */
  recursive?: boolean;
}

export abstract class Directory extends FileSystemObject {
  private afterList?: (path: string, list: string[]) => Promise<void>;
  private afterMkcol?: (path: string) => Promise<void>;
  private beforeList?: (path: string) => Promise<string[] | null>;
  private beforeMkcol?: (
    psth: string,
    options?: MkcolOptions
  ) => Promise<boolean>;

  public ls = this.list;
  public readdir = this.list;

  constructor(fs: FileSystem, path: string) {
    super(fs, path);
    const interceptor = fs.options?.interceptor;
    if (interceptor) {
      this.beforeMkcol = interceptor.beforeMkcol;
      this.beforeList = interceptor.beforeList;
      this.afterMkcol = interceptor.afterMkcol;
      this.afterList = interceptor.afterList;
    }
  }

  public async _xmit(
    fso: FileSystemObject,
    move: boolean,
    copyErrors: XmitError[]
  ): Promise<void> {
    await this.stat(); // check if this directory exists
    if (fso instanceof File) {
      throw new InvalidModificationError(
        fso.fs.repository,
        fso.path,
        `Cannot copy a directory "${this}" to a file "${fso}"`
      );
    }

    const toDir = fso as unknown as Directory;
    await toDir.mkdir();

    const children = await this.ls();
    for (const child of children) {
      const stats = await this.fs.head(child);
      const fromFso = stats.size
        ? await this.fs.getFile(child)
        : await this.fs.getDirectory(child);
      const name = getName(child);
      const toPath = joinPaths(toDir.path, name);
      const toFso = stats.size
        ? await this.fs.getFile(toPath)
        : await this.fs.getDirectory(toPath);
      try {
        await fromFso._xmit(toFso, move, copyErrors);
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

  public async list(): Promise<string[]> {
    let list: string[] | null | undefined;
    if (this.beforeList) {
      list = await this.beforeList(this.path);
    }
    if (!list) {
      list = await this._list();
    }
    if (this.afterList) {
      await this.afterList(this.path, list);
    }
    return list;
  }

  /**
   * Create a directory.
   * @param options Either the file mode, or an object optionally specifying the file mode and whether parent folders
   */
  public async mkdir(options?: MkcolOptions): Promise<void> {
    if (this.beforeMkcol) {
      if (await this.beforeMkcol(this.path, options)) {
        return;
      }
    }
    await this._mkcol(options);
    if (this.afterMkcol) {
      await this.afterMkcol(this.path);
    }
  }

  public abstract _list(): Promise<string[]>;
  public abstract _mkcol(options?: MkcolOptions): Promise<void>;
}

export abstract class File extends FileSystemObject {
  private afterGet?: (path: string) => Promise<void>;
  private afterPost?: (path: string) => Promise<void>;
  private afterPut?: (path: string) => Promise<void>;
  private beforeGet?: (
    path: string,
    options?: OpenOptions | undefined
  ) => Promise<ReadStream | null>;
  private beforePost?: (
    path: string,
    options?: OpenOptions | undefined
  ) => Promise<WriteStream | null>;
  private beforePut?: (
    path: string,
    options?: OpenOptions | undefined
  ) => Promise<WriteStream | null>;

  constructor(fs: FileSystem, path: string) {
    super(fs, path);
    const interceptor = fs.options?.interceptor;
    if (interceptor) {
      this.beforeGet = interceptor.beforeGet;
      this.beforePost = interceptor.beforePost;
      this.beforePut = interceptor.beforePut;
      this.afterGet = interceptor.afterGet;
      this.afterPost = interceptor.afterPost;
      this.afterPut = interceptor.afterPut;
    }
  }

  public async _xmit(
    fso: FileSystemObject,
    move: boolean,
    copyErrors: XmitError[]
  ): Promise<void> {
    await this.stat(); // check if this directory exists
    if (fso instanceof Directory) {
      throw new InvalidModificationError(
        fso.fs.repository,
        fso.path,
        `Cannot copy a file "${this}" to a directory "${fso}"`
      );
    }
    const to = fso as File;

    const rs = await this.openReadStream();
    try {
      const ws = await to.openWriteStream();
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

  public async hash(): Promise<string> {
    const rs = await this.openReadStream();
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

  public async openReadStream(options?: OpenOptions): Promise<ReadStream> {
    let rs: ReadStream | null | undefined;
    if (this.beforeGet) {
      rs = await this.beforeGet(this.path, options);
    }
    if (!rs) {
      rs = await this._openReadStream(options);
    }
    if (this.afterGet) {
      await this.afterGet(this.path);
    }
    return rs;
  }

  public async openWriteStream(options?: OpenOptions): Promise<WriteStream> {
    let ws: WriteStream | null | undefined;
    let post: boolean;
    try {
      await this.stat();
      if (this.beforePut) {
        ws = await this.beforePut(this.path, options);
      }
      post = false;
    } catch (e) {
      if (e instanceof NotFoundError) {
        if (this.beforePost) {
          ws = await this.beforePost(this.path, options);
        }
        post = true;
      } else {
        throw e;
      }
    }
    if (!ws) {
      ws = await this._openWriteStream(options);
    }
    if (post && this.afterPost) {
      await this.afterPost(this.path);
    } else if (!post && this.afterPut) {
      await this.afterPut(this.path);
    }
    return ws;
  }

  public abstract _openReadStream(options?: OpenOptions): Promise<ReadStream>;
  public abstract _openWriteStream(options?: OpenOptions): Promise<WriteStream>;
}

export enum SeekOrigin {
  Begin,
  Current,
  End,
}

export interface OpenOptions {
  bufferSize?: number;
}
export abstract class Stream {
  protected readonly bufferSize = 64 * 1024;

  constructor(protected path: string, options?: OpenOptions) {
    if (options?.bufferSize) {
      this.bufferSize = options.bufferSize;
    }
  }

  public abstract close(): Promise<void>;
  public abstract seek(offset: number, origin: SeekOrigin): Promise<void>;
}

export abstract class ReadStream extends Stream {
  /**
   * Asynchronously reads data from the file.
   * The `File` must have been opened for reading.
   */
  public abstract read(size?: number): Promise<ArrayBuffer | Uint8Array>;
}

export abstract class WriteStream extends Stream {
  public abstract setLength(len: number): Promise<void>;
  /**
   * Asynchronously reads data from the file.
   * The `File` must have been opened for reading.
   */
  public abstract write(data: ArrayBuffer | Uint8Array): Promise<void>;
}
