import { AbstractFile } from "./AbstractFile";
import { AbstractStream } from "./AbstractStream";
import { OpenWriteOptions, Source, WriteStream } from "./core";

export abstract class AbstractWriteStream
  extends AbstractStream
  implements WriteStream
{
  private afterPost?: (path: string) => Promise<void>;
  private afterPut?: (path: string) => Promise<void>;

  protected changed = false;

  constructor(
    file: AbstractFile,
    protected readonly options: OpenWriteOptions
  ) {
    super(file, options);
    const hook = file.fs.options.hook;
    this.afterPost = hook?.afterPost;
    this.afterPut = hook?.afterPut;
  }

  public async close(): Promise<void> {
    await this._close();
    this.position = 0;
    if (!this.changed) {
      return;
    }
    if (!this.options.ignoreHook && this.afterPost && this.options.create) {
      await this.afterPost(this.file.path);
    } else if (
      !this.options.ignoreHook &&
      this.afterPut &&
      !this.options.create
    ) {
      await this.afterPut(this.file.path);
    }
  }

  public async truncate(size: number): Promise<void> {
    await this._truncate(size);
    if (size < this.position) {
      this.position = size;
    }
    this.changed = true;
  }

  /**
   * Asynchronously reads data from the file.
   * The `File` must have been opened for reading.
   */
  public async write(src: Source): Promise<number> {
    const written = await this._write(src);
    this.position += written;
    this.changed = true;
    return written;
  }

  public abstract _close(): Promise<void>;
  public abstract _truncate(size: number): Promise<void>;
  public abstract _write(value: Source): Promise<number>;
}
