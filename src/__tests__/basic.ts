import { DEFAULT_CONVERTER } from "univ-conv";
import { File, FileSystem, OnExists, OnNoParent } from "../core";
import { NotFoundError } from "../errors";

const c = DEFAULT_CONVERTER;

export const testAll = (
  fs: FileSystem,
  options?: {
    setup?: () => Promise<void>;
    teardown?: () => Promise<void>;
  }
) => {
  it("setup", async () => {
    if (options?.setup) {
      await options.setup();
    }
  });

  it("rootdir", async () => {
    const dir = await fs.getDirectory("/");
    expect(dir).not.toBeNull();
    const paths = await dir!.readdir();
    expect(paths).not.toBeNull();
    expect(paths!.length).toBe(0);
  });

  it("add empty file", async () => {
    const file = await fs.getFile("/empty.txt");
    expect(file).not.toBeNull();
    try {
      await file!.stat();
      throw new Error("Found file: " + file!.path);
    } catch (e) {
      expect((e as any).name).toBe(NotFoundError.name);
    }
    const buffer = await c.toArrayBuffer("");
    await file!.write(buffer);
    const stats = await file!.stat();
    expect(stats?.size).toBe(0);
  });

  it("add text file", async () => {
    const file = await fs.getFile("/test.txt");
    expect(file).not.toBeNull();
    try {
      await file!.stat();
      throw new Error("Found file: " + file!.path);
    } catch (e) {
      expect((e as any).name).toBe(NotFoundError.name);
    }
    const buffer = await c.toArrayBuffer("test");
    await file!.write(buffer);
    const stats = await file!.stat();
    expect(stats?.size).toBe(4);
  });

  it("read text file", async () => {
    const file = await fs.getFile("/test.txt");
    expect(file).not.toBeNull();
    const buffer = await file!.read("uint8array");
    expect(buffer?.byteLength).toBe(4);
    const text = await c.toText(buffer!);
    expect(text).toBe("test");
  });

  it("continuous read and write", async () => {
    const file = await fs.getFile("/otani.txt");
    expect(file).not.toBeNull();
    await file!.write("大谷翔平");
    let text = await file!.read("text");
    expect(text).toBe("大谷翔平");

    await file!.write("ホームラン", { append: true, create: false });
    text = await file!.read("text");
    expect(text).toBe("大谷翔平ホームラン");
  });

  it("listdir test", async () => {
    const dir = await fs.getDirectory("/");
    expect(dir).not.toBeNull();
    let dirs = await dir!.readdir();
    expect(dirs).not.toBeNull();
    expect(0 <= dirs!.indexOf("/empty.txt")).toBe(true);
    expect(0 <= dirs!.indexOf("/test.txt")).toBe(true);
    expect(0 <= dirs!.indexOf("/otani.txt")).toBe(true);
  });

  it("mkdir test", async () => {
    const folder = await fs.getDirectory("/folder");
    expect(folder).not.toBeNull();
    try {
      const stats = await folder!.stat();
      expect(stats).not.toBeNull();
      if (stats?.size != null) {
        throw new Error("Found file: " + folder!.path);
      }
    } catch (e) {
      expect((e as any).name).toBe(NotFoundError.name);
    }

    await folder!.mkdir();
    try {
      const stats = await folder!.stat();
      expect(stats).not.toBe(null);
      if (stats?.size != null) {
        throw new Error("File has created: " + folder!.path);
      }
    } catch (e) {
      expect((e as any).name).toBe(NotFoundError.name);
    }
  });

  it("create file in dir", async () => {
    let file = await fs.getFile("/folder/sample.txt");
    expect(file).not.toBeNull();
    file = file as File;
    try {
      await file!.stat();
      throw new Error("Found file: " + file.path);
    } catch (e) {
      expect((e as any).name).toBe(NotFoundError.name);
    }
    const before = Math.floor(Date.now() / 1000);
    await file.write("Sample");
    const after = Math.floor(Date.now() + 1 / 1000);
    const stats = await file.stat();
    expect(stats).not.toBeNull();
    const modified = Math.floor((stats?.modified ?? 0) / 1000);
    expect(modified).toBeGreaterThanOrEqual(before);
    expect(modified).toBeLessThan(after);
    const text = await file.read("text");
    expect(text).toBe("Sample");

    const dir = await fs.getDirectory("/folder/");
    expect(dir).not.toBeNull();
    const list = await dir!.list();
    expect(list).not.toBeNull();
    expect(0 <= list!.indexOf("/folder/sample.txt")).toBe(true);
  });

  it("copy directory", async () => {
    const from = await fs.getDirectory("/folder");
    expect(from).not.toBeNull();
    const to = await fs.getDirectory("/folder2");
    expect(to).not.toBeNull();
    await from!.copy(to!, {
      onExists: OnExists.Error,
      onNoParent: OnNoParent.Error,
      recursive: true,
    });
    const stats = await to!.stat();
    expect(stats?.size).toBeUndefined();
    if (fs.supportDirectory()) {
      const root = await fs.getDirectory("/");
      expect(root).not.toBeNull();
      const list = await root!.ls();
      expect(list).not.toBeNull();
      expect(0 <= list!.indexOf("/folder2")).toBe(true);
    }
    const toList = await to!.ls();
    expect(toList).not.toBeNull();
    expect(0 <= toList!.indexOf("/folder2/sample.txt")).toBe(true);
  });

  it("move file", async () => {
    await fs.move("/folder2/sample.txt", "/folder2/sample2.txt");
    const list = await fs.list("/folder2");
    expect(list).not.toBeNull();
    expect(list!.indexOf("/folder2/sample.txt") < 0).toBe(true);
    expect(0 <= list!.indexOf("/folder2/sample2.txt")).toBe(true);
  });

  it("move directory", async () => {
    await fs.move("/folder2", "/folder3");
    if (fs.supportDirectory()) {
      const root = await fs.getDirectory("/");
      expect(root).not.toBeNull();
      const list = await root!.ls();
      expect(list).not.toBeNull();
      expect(list!.indexOf("/folder2") < 0).toBe(true);
      expect(0 <= list!.indexOf("/folder3")).toBe(true);
    }
    const folder3 = await fs.getDirectory("/folder3");
    expect(folder3).not.toBeNull();
    const folder3List = await folder3!.ls();
    expect(folder3List).not.toBeNull();
    expect(0 <= folder3List!.indexOf("/folder3/sample2.txt")).toBe(true);
  });

  it("teardown", async () => {
    if (options?.teardown) {
      await options.teardown();
    }
  });
};
