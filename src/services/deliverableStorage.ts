import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";

export type StoredRange = { stream: ReturnType<typeof createReadStream>; start: number; end: number; size: number };

export interface DeliverableStorage {
  append(key: string, offset: number, chunk: Buffer): Promise<number>;
  complete(key: string): Promise<{ key: string; size: number; sha256: string }>;
  read(key: string, range?: { start: number; end?: number }): Promise<StoredRange>;
}

export class LocalDeliverableStorage implements DeliverableStorage {
  constructor(private readonly root = resolve(process.env.DELIVERABLE_STORAGE_DIR ?? "storage/deliverables")) {}

  async append(key: string, offset: number, chunk: Buffer) {
    const path = this.path(key, true);
    await mkdir(this.root, { recursive: true });
    const handle = await open(path, offset === 0 ? "w" : "r+");
    try {
      await handle.write(chunk, 0, chunk.length, offset);
    } finally {
      await handle.close();
    }
    return offset + chunk.length;
  }

  async complete(key: string) {
    const partial = this.path(key, true);
    const final = this.path(key, false);
    const digest = createHash("sha256");
    const stream = createReadStream(partial);
    for await (const chunk of stream) digest.update(chunk as Buffer);
    await rename(partial, final);
    const info = await stat(final);
    return { key, size: info.size, sha256: `0x${digest.digest("hex")}` };
  }

  async read(key: string, range?: { start: number; end?: number }) {
    const path = this.path(key, false);
    const info = await stat(path);
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? info.size - 1, info.size - 1);
    return { stream: createReadStream(path, { start, end }), start, end, size: info.size };
  }

  private path(key: string, partial: boolean) {
    if (!/^[a-f0-9-]+$/i.test(key)) throw new Error("Invalid storage key");
    return resolve(this.root, `${key}${partial ? ".part" : ".bin"}`);
  }
}
