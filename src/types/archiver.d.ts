declare module "archiver" {
  import type { Readable } from "node:stream";

  export class ZipArchive extends Readable {
    constructor(options?: { zlib?: { level?: number } });
    append(source: Buffer | string | Readable, data: { name: string }): this;
    finalize(): Promise<void>;
  }
}
