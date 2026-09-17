import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDeliverableStorage } from "../src/services/deliverableStorage.js";

describe("private deliverable storage", () => {
  let directory: string | undefined;
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  it("appends resumable chunks, hashes the final file, and serves ranges", async () => {
    directory = await mkdtemp(join(tmpdir(), "fiducia-artifacts-"));
    const storage = new LocalDeliverableStorage(directory);
    expect(await storage.append("abc-123", 0, Buffer.from("hello "))).toBe(6);
    expect(await storage.append("abc-123", 6, Buffer.from("world"))).toBe(11);
    const completed = await storage.complete("abc-123");
    expect(completed.size).toBe(11);
    expect(completed.sha256).toBe("0xb94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9");
    const ranged = await storage.read("abc-123", { start: 6, end: 10 });
    const chunks: Buffer[] = [];
    for await (const chunk of ranged.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("world");
    expect(await readFile(join(directory, "abc-123.bin"), "utf8")).toBe("hello world");
  });
});
