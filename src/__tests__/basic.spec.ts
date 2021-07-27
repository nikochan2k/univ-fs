import { NodeFileSystem } from "../node/NodeFileSystem";
import { testAll } from "./basic";
import { getRootDir } from "./init";

const fs = new NodeFileSystem(getRootDir());
testAll(fs);
