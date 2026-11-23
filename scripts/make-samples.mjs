// Writes fake Takeout zips for the two sample people to ./samples/, for trying
// the app without real data:  npm run sample
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { sampleTakeout, sampleSpotify } = await server.ssrLoadModule("/src/core/sample.ts");
  const { ZipWriter, BlobWriter, TextReader } = await import("@zip.js/zip.js");
  await mkdir("samples", { recursive: true });
  for (const who of ["Alex", "Sam"]) {
    for (const format of ["json", "html"]) {
      const writer = new ZipWriter(new BlobWriter("application/zip"));
      for (const f of sampleTakeout(who, format)) await writer.add(f.path, new TextReader(f.content));
      const blob = await writer.close();
      const name = `samples/takeout-${who.toLowerCase()}-${format}.zip`;
      await writeFile(name, Buffer.from(await blob.arrayBuffer()));
      console.log(name, `${(blob.size / 1024).toFixed(0)} KB`);
    }
  }
  // Sam listens on Spotify; that export comes as its own zip.
  const writer = new ZipWriter(new BlobWriter("application/zip"));
  for (const f of sampleSpotify("Sam")) await writer.add(f.path, new TextReader(f.content));
  const blob = await writer.close();
  await writeFile("samples/spotify-sam.zip", Buffer.from(await blob.arrayBuffer()));
  console.log("samples/spotify-sam.zip", `${(blob.size / 1024).toFixed(0)} KB`);
} finally {
  await server.close();
}
