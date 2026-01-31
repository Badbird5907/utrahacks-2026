import { readFile, readdir, stat, mkdir, writeFile, rm } from 'fs/promises';
import { join, basename, dirname, extname } from 'path';
import { streamSSE } from 'hono/streaming';
import chokidar from 'chokidar';
// ============================================================================
// Filesystem Helper Functions
// ============================================================================
/**
 * Recursively read directory contents
 */
export async function readDirRecursive(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const entryPath = join(dirPath, entry.name);
        const stats = await stat(entryPath).catch(() => null);
        const fileEntry = {
            name: entry.name,
            path: entryPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats?.size,
            lastModified: stats?.mtimeMs
        };
        if (entry.isDirectory()) {
            try {
                fileEntry.children = await readDirRecursive(entryPath);
            }
            catch {
                fileEntry.children = [];
            }
        }
        return fileEntry;
    }));
    files.sort((a, b) => {
        if (a.type !== b.type)
            return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return files;
}
// ============================================================================
// Filesystem Route Handlers
// ============================================================================
/**
 * Register all filesystem-related routes
 */
export function registerFilesystemRoutes(app) {
    // List directory contents
    app.get('/fs/list', async (c) => {
        const dirPath = c.req.query('path');
        if (!dirPath) {
            return c.json({ error: 'path query parameter is required' }, 400);
        }
        try {
            const entries = await readdir(dirPath, { withFileTypes: true });
            const files = await Promise.all(entries.map(async (entry) => {
                const entryPath = join(dirPath, entry.name);
                const stats = await stat(entryPath).catch(() => null);
                const fileEntry = {
                    name: entry.name,
                    path: entryPath,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    size: stats?.size,
                    lastModified: stats?.mtimeMs
                };
                // Recursively read directories
                if (entry.isDirectory()) {
                    try {
                        const children = await readDirRecursive(entryPath);
                        fileEntry.children = children;
                    }
                    catch {
                        fileEntry.children = [];
                    }
                }
                return fileEntry;
            }));
            // Sort: directories first, then alphabetically
            files.sort((a, b) => {
                if (a.type !== b.type)
                    return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            return c.json({ files });
        }
        catch (error) {
            console.error('Failed to list directory:', error);
            return c.json({ error: 'Failed to list directory: ' + error.message }, 500);
        }
    });
    // Read file contents
    app.get('/fs/read', async (c) => {
        const filePath = c.req.query('path');
        if (!filePath) {
            return c.json({ error: 'path query parameter is required' }, 400);
        }
        try {
            const content = await readFile(filePath, 'utf-8');
            const stats = await stat(filePath);
            return c.json({
                content,
                size: stats.size,
                lastModified: stats.mtimeMs
            });
        }
        catch (error) {
            console.error('Failed to read file:', error);
            return c.json({ error: 'Failed to read file: ' + error.message }, 500);
        }
    });
    // Write file contents
    app.post('/fs/write', async (c) => {
        const body = await c.req.json();
        if (!body.path) {
            return c.json({ error: 'path is required' }, 400);
        }
        try {
            await writeFile(body.path, body.content, 'utf-8');
            const stats = await stat(body.path);
            return c.json({
                success: true,
                size: stats.size,
                lastModified: stats.mtimeMs
            });
        }
        catch (error) {
            console.error('Failed to write file:', error);
            return c.json({ error: 'Failed to write file: ' + error.message }, 500);
        }
    });
    // Create file or directory
    app.post('/fs/create', async (c) => {
        const body = await c.req.json();
        if (!body.path || !body.type) {
            return c.json({ error: 'path and type are required' }, 400);
        }
        try {
            if (body.type === 'directory') {
                await mkdir(body.path, { recursive: true });
            }
            else {
                // Ensure parent directory exists
                await mkdir(dirname(body.path), { recursive: true });
                await writeFile(body.path, '', 'utf-8');
            }
            return c.json({ success: true });
        }
        catch (error) {
            console.error('Failed to create:', error);
            return c.json({ error: 'Failed to create: ' + error.message }, 500);
        }
    });
    // Delete file or directory
    app.delete('/fs/delete', async (c) => {
        const filePath = c.req.query('path');
        if (!filePath) {
            return c.json({ error: 'path query parameter is required' }, 400);
        }
        try {
            await rm(filePath, { recursive: true });
            return c.json({ success: true });
        }
        catch (error) {
            console.error('Failed to delete:', error);
            return c.json({ error: 'Failed to delete: ' + error.message }, 500);
        }
    });
    // Validate Arduino sketch
    app.get('/fs/validate-sketch', async (c) => {
        const sketchPath = c.req.query('path');
        if (!sketchPath) {
            return c.json({ error: 'path query parameter is required' }, 400);
        }
        try {
            const stats = await stat(sketchPath);
            if (!stats.isDirectory()) {
                return c.json({
                    valid: false,
                    error: 'Path is not a directory'
                });
            }
            const sketchName = basename(sketchPath);
            const mainFile = `${sketchName}.ino`;
            const mainFilePath = join(sketchPath, mainFile);
            try {
                await stat(mainFilePath);
            }
            catch {
                return c.json({
                    valid: false,
                    error: `Main sketch file not found: ${mainFile}. Arduino sketches must have a .ino file matching the folder name.`
                });
            }
            // List all relevant files in the sketch
            const entries = await readdir(sketchPath);
            const sketchFiles = entries.filter(f => {
                const ext = extname(f).toLowerCase();
                return ['.ino', '.h', '.hpp', '.c', '.cpp'].includes(ext);
            });
            return c.json({
                valid: true,
                sketchName,
                mainFile,
                files: sketchFiles
            });
        }
        catch (error) {
            console.error('Failed to validate sketch:', error);
            return c.json({
                valid: false,
                error: 'Failed to validate sketch: ' + error.message
            });
        }
    });
    // Watch directory for changes (SSE)
    app.get('/fs/watch', async (c) => {
        const watchPath = c.req.query('path');
        if (!watchPath) {
            return c.json({ error: 'path query parameter is required' }, 400);
        }
        return streamSSE(c, async (stream) => {
            let aborted = false;
            stream.onAbort(() => {
                console.log('File watcher client disconnected');
                aborted = true;
            });
            const watcher = chokidar.watch(watchPath, {
                persistent: true,
                ignoreInitial: true,
                depth: 10,
                ignored: /(^|[\/\\])\../ // Ignore dotfiles
            });
            watcher.on('add', async (path) => {
                if (aborted)
                    return;
                await stream.writeSSE({
                    event: 'add',
                    data: JSON.stringify({ path })
                });
            });
            watcher.on('change', async (path) => {
                if (aborted)
                    return;
                await stream.writeSSE({
                    event: 'change',
                    data: JSON.stringify({ path })
                });
            });
            watcher.on('unlink', async (path) => {
                if (aborted)
                    return;
                await stream.writeSSE({
                    event: 'delete',
                    data: JSON.stringify({ path })
                });
            });
            watcher.on('addDir', async (path) => {
                if (aborted)
                    return;
                await stream.writeSSE({
                    event: 'addDir',
                    data: JSON.stringify({ path })
                });
            });
            watcher.on('unlinkDir', async (path) => {
                if (aborted)
                    return;
                await stream.writeSSE({
                    event: 'deleteDir',
                    data: JSON.stringify({ path })
                });
            });
            watcher.on('error', async (error) => {
                console.error('Watcher error:', error);
                if (!aborted) {
                    await stream.writeSSE({
                        event: 'error',
                        data: JSON.stringify({ message: error.message })
                    });
                }
            });
            await stream.writeSSE({
                event: 'ready',
                data: JSON.stringify({ message: `Watching ${watchPath}` })
            });
            // Keep stream open until aborted
            await new Promise((resolve) => {
                const checkAbort = setInterval(() => {
                    if (aborted) {
                        clearInterval(checkAbort);
                        watcher.close();
                        resolve();
                    }
                }, 100);
            });
        });
    });
}
