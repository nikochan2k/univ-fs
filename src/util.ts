import { createError, SyntaxError } from "./errors";

function getPathParts(path: string) {
  const parts = path.split("/");
  const pathParts = [];
  for (const part of parts) {
    if (part === "..") {
      // Go up one level.
      if (pathParts.length === 0) {
        throw createError({
          name: SyntaxError.name,
          repository: "",
          path,
        });
      }
      pathParts.pop();
    } else if (part === ".") {
      // Skip over the current directory.
    } else if (part !== "") {
      // Eliminate sequences of '/'s as well as possible leading/trailing '/'s.
      pathParts.push(part);
    }
  }
  return pathParts;
}

export function getParentPath(path: string) {
  let parts = getPathParts(path);
  if (parts.length <= 1) {
    return "/";
  }
  parts = parts.slice(0, -1);
  return "/" + parts.join("/");
}

export function getName(path: string): string {
  const parts = getPathParts(path);
  if (parts.length === 0) {
    return "";
  }
  return parts[parts.length - 1] as string;
}

export function joinPaths(path1: string, path2: string) {
  const parts1 = getPathParts(path1);
  const parts2 = getPathParts(path2);
  const parts = [...parts1, ...parts2];
  return "/" + parts.join("/");
}

export function normalizePath(path: string) {
  const parts = getPathParts(path);
  return "/" + parts.join("/");
}

export function isIllegalFileName(name: string) {
  return /[\x00-\x1f\x7f-\x9f\\/:*?"<>|]/.test(name);
}

const LUT_HEX_4b = new Array(0x10);
for (let n = 0; n < 0x10; n++) {
  LUT_HEX_4b[n] = n.toString(16);
}

const LUT_HEX_8b = new Array(0x100);
for (let n = 0; n < 0x100; n++) {
  LUT_HEX_8b[n] = `${LUT_HEX_4b[(n >>> 4) & 0xf]}${LUT_HEX_4b[n & 0xf]}`;
}

export function toHex(u8: Uint8Array) {
  return u8.reduce((result, i) => result + LUT_HEX_8b[i], "");
}