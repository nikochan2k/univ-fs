import * as fs from "fs";
import { Directory, FileSystem, ListOptions, MkcolOptions } from "../core/core";
import { joinPaths } from "../util/path";
import { convertError } from "./NodeFileSystem";

export class NodeDirectory extends Directory {
  public override toString = this.getFullPath;

  constructor(fs: FileSystem, path: string) {
    super(fs, path);
  }

  public _list(_options: ListOptions): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      fs.readdir(this.getFullPath(), (err, names) => {
        if (err) {
          reject(convertError(this.fs.repository, this.path, err, false));
        } else {
          resolve(names.map((name) => joinPaths(this.path, name)));
        }
      });
    });
  }

  public _mkcol(options: MkcolOptions): Promise<void> {
    const recursive = options?.recursive || true;
    return new Promise<void>((resolve, reject) => {
      fs.mkdir(this.getFullPath(), { recursive }, (err) => {
        if (err) {
          reject(convertError(this.fs.repository, this.path, err, true));
        } else {
          resolve();
        }
      });
    });
  }

  private getFullPath() {
    return joinPaths(this.fs.repository, this.path);
  }
}
