import { Converter, validateBufferSize } from "univ-conv";
import { AbstractFile } from "./AbstractFile";
import { DEFAULT_BUFFER_SIZE, OpenOptions, SeekOrigin, Stream } from "./core";

export abstract class AbstractStream implements Stream {
  protected readonly bufferSize = DEFAULT_BUFFER_SIZE;

  public converter: Converter;
  public position = 0;

  constructor(protected file: AbstractFile, options: OpenOptions) {
    validateBufferSize(options);
    this.converter = new Converter({ bufferSize: options.bufferSize });
  }

  public async seek(offset: number, origin: SeekOrigin): Promise<void> {
    const stats = await this.file.head();
    const size = stats.size as number;

    let start: number | undefined;
    if (origin === SeekOrigin.Begin) {
      start = offset;
    } else if (origin === SeekOrigin.Current) {
      start = this.position + offset;
    } else {
      start = size + offset;
    }

    if (start < 0) {
      start = 0;
    } else if (size < start) {
      start = size;
    }
    this.position = start;

    await this._seek(start);
  }

  public abstract close(): Promise<void>;

  protected abstract _seek(start: number): Promise<void>;
}
