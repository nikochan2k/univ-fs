import { FileSystem } from "../core";
import { NotFoundError } from "../errors";

export const testAll = (fs: FileSystem) => {
  test("rootdir", async () => {
    const stat = await fs.head("/");
    expect(stat.size).toBeUndefined();
  });

  test("nothing", async () => {
    try {
      await fs.stat("/nothing");
      fail("/nothing exists");
    } catch (e) {
      expect(e.name).toBe(NotFoundError.name);
    }
  });

  test("file_head", async () => {
    await fs.writeAll("/file_head", new ArrayBuffer(1));
    const stat = await fs.stat("/file_head");
    expect(stat.size).toBe(1);
  });
};
