import type { FileEntry } from "@/lib/daemon-client";

export function formatFileTree(entries: FileEntry[], indent = ""): string {
  let result = "";
  for (const entry of entries) {
    result += `${indent}${entry.type === "directory" ? "📁" : "📄"} ${entry.name}\n`;
    if (entry.type === "directory" && entry.children) {
      result += formatFileTree(entry.children, indent + "  ");
    }
  }
  return result;
}

export function toRelativePath(absolutePath: string, sketchPath: string): string {
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const normalizedSketch = sketchPath.replace(/\\/g, "/");
  
  if (normalizedAbsolute.startsWith(normalizedSketch)) {
    const relative = normalizedAbsolute.slice(normalizedSketch.length);
    return "./" + relative.replace(/^\//, "");
  }
  return absolutePath;
}

export function toAbsolutePath(relativePath: string, sketchPath: string): string {
  const normalizedSketch = sketchPath.replace(/\\/g, "/");
  
  if (relativePath.startsWith("./")) {
    return normalizedSketch + "/" + relativePath.slice(2);
  }
  if (!relativePath.includes(":") && !relativePath.startsWith("/")) {
    return normalizedSketch + "/" + relativePath;
  }
  return relativePath;
}
