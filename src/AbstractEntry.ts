import { ErrorParams } from ".";
import { AbstractFileSystem } from "./AbstractFileSystem";
import {
  CopyOptions,
  DeleteOptions,
  Directory,
  Entry,
  HeadOptions,
  MoveOptions,
  OnNotExist,
  Options,
  PatchOptions,
  Stats,
  URLOptions,
  XmitOptions,
} from "./core";
import {
  createError,
  FileSystemError,
  isFileSystemError,
  NoModificationAllowedError,
  NotFoundError,
  NotReadableError,
} from "./errors";
import { getParentPath } from "./util";

export abstract class AbstractEntry implements Entry {
  constructor(
    public readonly fs: AbstractFileSystem,
    public readonly path: string
  ) {}

  public async copy(
    to: Entry,
    options?: CopyOptions,
    errors?: FileSystemError[]
  ): Promise<boolean> {
    options = { ...this.fs.defaultCopyOptions, ...options };
    return this._copy(to, options, errors);
  }

  public cp = (to: Entry, options?: CopyOptions, errors?: FileSystemError[]) =>
    this.copy(to, options, errors);

  public del = (options?: DeleteOptions, errors?: FileSystemError[]) =>
    this.delete(options, errors);

  public async delete(
    options?: DeleteOptions,
    errors?: FileSystemError[]
  ): Promise<boolean> {
    options = { ...this.fs.defaultDeleteOptions, ...options };
    try {
      await this._exists(options);
    } catch (e) {
      if (isFileSystemError(e) && e.name !== NotFoundError.name) {
        if (options.onNotExist === OnNotExist.Error) {
          await this.fs._handleFileSystemError(e, errors);
          return false;
        }
      } else {
        await this._handleNotReadableError(errors, { e });
        return false;
      }
    }

    try {
      let result = await this._beforeDelete(options);
      if (result != null) {
        return result;
      }

      result = await this._delete(options);
      await this._afterDelete(result, options);
      return result;
    } catch (e) {
      const opts = options;
      await this._handleNoModificationAllowedError(
        errors,
        { e },
        async (error) => {
          await this._afterDelete(false, opts, error);
        }
      );
      return false;
    }
  }

  public async getParent(): Promise<Directory>;
  public async getParent(errors?: FileSystemError[]): Promise<Directory | null>;
  public async getParent(
    errors?: FileSystemError[]
  ): Promise<Directory | null> {
    const parentPath = getParentPath(this.path);
    return this.fs.getDirectory(parentPath, errors);
  }

  public async move(
    to: Entry,
    options?: MoveOptions,
    errors?: FileSystemError[]
  ): Promise<boolean> {
    let result = await this._copy(
      to,
      {
        ...this.fs.defaultMoveOptions,
        ...options,
        recursive: true,
      },
      errors
    );
    if (!result) {
      return false;
    }

    result = await this.delete(
      {
        ...this.fs.defaultDeleteOptions,
        ...options,
        recursive: true,
      },
      errors
    );
    return result;
  }

  public mv = (to: Entry, options?: MoveOptions, errors?: FileSystemError[]) =>
    this.move(to, options, errors);

  public patch = (
    props: Stats,
    options?: PatchOptions,
    errors?: FileSystemError[]
  ) => this.fs.patch(this.path, props, options, errors);

  public remove = (options?: DeleteOptions, errors?: FileSystemError[]) =>
    this.delete(options, errors);

  public rm = (options?: DeleteOptions, errors?: FileSystemError[]) =>
    this.delete(options, errors);

  public stat(options?: HeadOptions): Promise<Stats>;
  public stat(options?: HeadOptions, errors?: FileSystemError[]) {
    return this.head(options, errors);
  }

  public toString = () => `${this.fs.repository}:${this.path}`;

  public toURL(options?: URLOptions): Promise<string>;
  public toURL(
    options?: URLOptions,
    errors?: FileSystemError[]
  ): Promise<string | null> {
    return this.fs.toURL(this.path, options, errors);
  }

  public abstract _copy(
    entry: Entry,
    options: XmitOptions,
    errors?: FileSystemError[]
  ): Promise<boolean>;
  public abstract _delete(option: DeleteOptions): Promise<boolean>;
  public abstract head(options?: HeadOptions): Promise<Stats>;
  public abstract head(
    options?: HeadOptions,
    errors?: FileSystemError[]
  ): Promise<Stats | null>;

  protected async _afterDelete(
    result: boolean,
    options: DeleteOptions,
    error?: FileSystemError
  ) {
    const fs = this.fs;
    const afterDelete = fs.options.hook?.afterDelete;
    if (afterDelete && !options.ignoreHook) {
      await afterDelete(fs.repository, this.path, options, result, error);
    }
  }

  protected _beforeDelete(options: DeleteOptions) {
    const fs = this.fs;
    const beforeDelete = fs.options.hook?.beforeDelete;
    if (beforeDelete && !options.ignoreHook) {
      return beforeDelete(fs.repository, this.path, options);
    }
    return null;
  }

  protected _createNoModificationAllowedError(params?: ErrorParams) {
    return createError({
      name: NoModificationAllowedError.name,
      repository: this.fs.repository,
      path: this.path,
      ...params,
    });
  }

  protected _createNotFoundError(params?: ErrorParams) {
    return createError({
      name: NotFoundError.name,
      repository: this.fs.repository,
      path: this.path,
      ...params,
    });
  }

  protected _createNotReadableError(params?: ErrorParams) {
    return createError({
      name: NotReadableError.name,
      repository: this.fs.repository,
      path: this.path,
      ...params,
    });
  }

  protected async _handleNoModificationAllowedError(
    errors?: FileSystemError[],
    params?: ErrorParams,
    callback?: (e: FileSystemError) => Promise<void>
  ) {
    const error = this._createNoModificationAllowedError(params);
    return this.fs._handleFileSystemError(error, errors, callback);
  }

  protected _handleNotFoundError(
    errors?: FileSystemError[],
    params?: ErrorParams,
    callback?: (e: FileSystemError) => Promise<void>
  ) {
    const error = this._createNotFoundError(params);
    return this.fs._handleFileSystemError(error, errors, callback);
  }

  protected _handleNotReadableError(
    errors?: FileSystemError[],
    params?: ErrorParams,
    callback?: (e: FileSystemError) => Promise<void>
  ) {
    const error = this._createNotReadableError(params);
    return this.fs._handleFileSystemError(error, errors, callback);
  }

  protected abstract _exists(options: Options): Promise<Stats>;
}
