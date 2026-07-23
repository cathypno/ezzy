import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const maxLines = 600;
const roots = ["app/components", "app/pages"];
const oversized = [];

async function collectVueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectVueFiles(path)));
    } else if (entry.isFile() && path.endsWith(".vue")) {
      files.push(path);
    }
  }

  return files;
}

for (const root of roots) {
  for (const file of await collectVueFiles(root)) {
    const lineCount = (await readFile(file, "utf8")).split("\n").length;
    if (lineCount > maxLines) {
      oversized.push(`${file}: ${lineCount} lines`);
    }
  }
}

if (oversized.length) {
  console.error(`Vue component limit exceeded (${maxLines} lines):`);
  console.error(oversized.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Vue component size check passed (max ${maxLines} lines).`);
}
