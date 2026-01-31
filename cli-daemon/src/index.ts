import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { spawn, ChildProcess } from 'child_process'
import { writeFile, unlink, readFile, readdir, stat, mkdir, rm } from 'fs/promises'
import { join, basename, dirname, extname } from 'path'
import { tmpdir } from 'os'
import { streamSSE } from 'hono/streaming'
import { SerialPort } from 'serialport'
import { createNodeWebSocket } from '@hono/node-ws'
import type { WSContext } from 'hono/ws'
import chokidar from 'chokidar'

// ============================================================================
// LSP Message Framing Utilities
// ============================================================================

function wrapWithLspHeaders(content: string): string {
  const contentLength = Buffer.byteLength(content, 'utf8')
  return `Content-Length: ${contentLength}\r\n\r\n${content}`
}

class LspMessageParser {
  private buffer: string = ''
  private onMessage: (message: string) => void

  constructor(onMessage: (message: string) => void) {
    this.onMessage = onMessage
  }

  feed(data: string) {
    this.buffer += data
    this.parseMessages()
  }

  private parseMessages() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const headerSection = this.buffer.slice(0, headerEnd)
      const contentLengthMatch = headerSection.match(/Content-Length:\s*(\d+)/i)
      if (!contentLengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const contentLength = parseInt(contentLengthMatch[1], 10)
      const contentStart = headerEnd + 4
      const contentEnd = contentStart + contentLength

      if (Buffer.byteLength(this.buffer.slice(contentStart), 'utf8') < contentLength) {
        return
      }

      const content = this.buffer.slice(contentStart, contentEnd)
      this.buffer = this.buffer.slice(contentEnd)
      this.onMessage(content)
    }
  }
}

// ============================================================================
// Filesystem Types
// ============================================================================

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  lastModified?: number
  children?: FileEntry[]
}

interface SketchInfo {
  valid: boolean
  error?: string
  mainFile?: string
  files?: string[]
  sketchName?: string
}

// ============================================================================
// Hono App Setup
// ============================================================================

const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: false
}))

// ============================================================================
// Health Check
// ============================================================================

app.get('/', (c) => {
  return c.json({ version: 1, status: 'ok' })
})

// ============================================================================
// LSP WebSocket Endpoint
// ============================================================================

app.get(
  '/lsp',
  upgradeWebSocket((c) => {
    let lspProcess: ChildProcess | null = null
    const sketchPath = c.req.query('sketchPath')

    return {
      onOpen(_event: Event, ws: WSContext) {
        console.log('LSP WebSocket client connected, sketchPath:', sketchPath)

        const cmdLine = process.env.ARDUINO_CLI_LSP_COMMAND_LINE
        if (!cmdLine) {
          console.error('ARDUINO_CLI_LSP_COMMAND_LINE not set')
          ws.close(1011, 'Server misconfigured')
          return
        }

        const parts = cmdLine.match(/(?:[^\s"]+|"[^"]*")+/g) || []
        const command = parts[0]
        if (!command) {
          console.error('Invalid command in ARDUINO_CLI_LSP_COMMAND_LINE')
          ws.close(1011, 'Invalid command')
          return
        }
        const args = parts.slice(1).map(arg => arg.replace(/^"(.*)"$/, '$1'))

        console.log('Spawning:', command, args)

        // Spawn LSP process with sketch path as cwd if provided
        const spawnOptions: { stdio: ['pipe', 'pipe', 'pipe'], shell: boolean, cwd?: string } = {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        }
        if (sketchPath) {
          spawnOptions.cwd = sketchPath
        }

        lspProcess = spawn(command, args, spawnOptions)

        const messageParser = new LspMessageParser((jsonContent: string) => {
          try {
            ws.send(jsonContent)
          } catch (err) {
            console.error('Error sending to WebSocket:', err)
          }
        })

        lspProcess.stdout?.on('data', (data: Buffer) => {
          messageParser.feed(data.toString())
        })

        lspProcess.stderr?.on('data', (data: Buffer) => {
          console.error('LSP stderr:', data.toString())
        })

        lspProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
          console.log(`LSP process exited: code=${code}, signal=${signal}`)
          ws.close(1011, 'LSP process terminated')
        })

        lspProcess.on('error', (err: Error) => {
          console.error('LSP process error:', err)
          ws.close(1011, 'LSP process error')
        })
      },

      onMessage(event: MessageEvent, ws: WSContext) {
        if (!lspProcess || !lspProcess.stdin) {
          console.error('LSP process not available')
          return
        }

        const message = event.data.toString()
        try {
          const framedMessage = wrapWithLspHeaders(message)
          lspProcess.stdin.write(framedMessage)
        } catch (err) {
          console.error('Error writing to LSP stdin:', err)
          ws.close(1011, 'Failed to communicate with LSP')
        }
      },

      onClose() {
        console.log('LSP WebSocket closed')
        if (lspProcess) {
          lspProcess.kill()
          lspProcess = null
        }
      },

      onError(event: Event) {
        console.error('LSP WebSocket error:', event)
        if (lspProcess) {
          lspProcess.kill()
          lspProcess = null
        }
      }
    }
  })
)

// ============================================================================
// Filesystem Endpoints
// ============================================================================

// List directory contents
app.get('/fs/list', async (c) => {
  const dirPath = c.req.query('path')
  if (!dirPath) {
    return c.json({ error: 'path query parameter is required' }, 400)
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const files: FileEntry[] = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(dirPath, entry.name)
        const stats = await stat(entryPath).catch(() => null)
        
        const fileEntry: FileEntry = {
          name: entry.name,
          path: entryPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats?.size,
          lastModified: stats?.mtimeMs
        }

        // Recursively read directories
        if (entry.isDirectory()) {
          try {
            const children = await readDirRecursive(entryPath)
            fileEntry.children = children
          } catch {
            fileEntry.children = []
          }
        }

        return fileEntry
      })
    )

    // Sort: directories first, then alphabetically
    files.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return c.json({ files })
  } catch (error: any) {
    console.error('Failed to list directory:', error)
    return c.json({ error: 'Failed to list directory: ' + error.message }, 500)
  }
})

async function readDirRecursive(dirPath: string): Promise<FileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const files: FileEntry[] = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(dirPath, entry.name)
      const stats = await stat(entryPath).catch(() => null)

      const fileEntry: FileEntry = {
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stats?.size,
        lastModified: stats?.mtimeMs
      }

      if (entry.isDirectory()) {
        try {
          fileEntry.children = await readDirRecursive(entryPath)
        } catch {
          fileEntry.children = []
        }
      }

      return fileEntry
    })
  )

  files.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return files
}

// Read file contents
app.get('/fs/read', async (c) => {
  const filePath = c.req.query('path')
  if (!filePath) {
    return c.json({ error: 'path query parameter is required' }, 400)
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    const stats = await stat(filePath)
    return c.json({ 
      content,
      size: stats.size,
      lastModified: stats.mtimeMs
    })
  } catch (error: any) {
    console.error('Failed to read file:', error)
    return c.json({ error: 'Failed to read file: ' + error.message }, 500)
  }
})

// Write file contents
app.post('/fs/write', async (c) => {
  const body = await c.req.json<{ path: string; content: string }>()
  if (!body.path) {
    return c.json({ error: 'path is required' }, 400)
  }

  try {
    await writeFile(body.path, body.content, 'utf-8')
    const stats = await stat(body.path)
    return c.json({ 
      success: true,
      size: stats.size,
      lastModified: stats.mtimeMs
    })
  } catch (error: any) {
    console.error('Failed to write file:', error)
    return c.json({ error: 'Failed to write file: ' + error.message }, 500)
  }
})

// Create file or directory
app.post('/fs/create', async (c) => {
  const body = await c.req.json<{ path: string; type: 'file' | 'directory' }>()
  if (!body.path || !body.type) {
    return c.json({ error: 'path and type are required' }, 400)
  }

  try {
    if (body.type === 'directory') {
      await mkdir(body.path, { recursive: true })
    } else {
      // Ensure parent directory exists
      await mkdir(dirname(body.path), { recursive: true })
      await writeFile(body.path, '', 'utf-8')
    }
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Failed to create:', error)
    return c.json({ error: 'Failed to create: ' + error.message }, 500)
  }
})

// Delete file or directory
app.delete('/fs/delete', async (c) => {
  const filePath = c.req.query('path')
  if (!filePath) {
    return c.json({ error: 'path query parameter is required' }, 400)
  }

  try {
    await rm(filePath, { recursive: true })
    return c.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete:', error)
    return c.json({ error: 'Failed to delete: ' + error.message }, 500)
  }
})

// Validate Arduino sketch
app.get('/fs/validate-sketch', async (c) => {
  const sketchPath = c.req.query('path')
  if (!sketchPath) {
    return c.json({ error: 'path query parameter is required' }, 400)
  }

  try {
    const stats = await stat(sketchPath)
    if (!stats.isDirectory()) {
      return c.json<SketchInfo>({ 
        valid: false, 
        error: 'Path is not a directory' 
      })
    }

    const sketchName = basename(sketchPath)
    const mainFile = `${sketchName}.ino`
    const mainFilePath = join(sketchPath, mainFile)

    try {
      await stat(mainFilePath)
    } catch {
      return c.json<SketchInfo>({ 
        valid: false, 
        error: `Main sketch file not found: ${mainFile}. Arduino sketches must have a .ino file matching the folder name.`
      })
    }

    // List all relevant files in the sketch
    const entries = await readdir(sketchPath)
    const sketchFiles = entries.filter(f => {
      const ext = extname(f).toLowerCase()
      return ['.ino', '.h', '.hpp', '.c', '.cpp'].includes(ext)
    })

    return c.json<SketchInfo>({
      valid: true,
      sketchName,
      mainFile,
      files: sketchFiles
    })
  } catch (error: any) {
    console.error('Failed to validate sketch:', error)
    return c.json<SketchInfo>({ 
      valid: false, 
      error: 'Failed to validate sketch: ' + error.message 
    })
  }
})

// Watch directory for changes (SSE)
app.get('/fs/watch', async (c) => {
  const watchPath = c.req.query('path')
  if (!watchPath) {
    return c.json({ error: 'path query parameter is required' }, 400)
  }

  return streamSSE(c, async (stream) => {
    let aborted = false
    
    stream.onAbort(() => {
      console.log('File watcher client disconnected')
      aborted = true
    })

    const watcher = chokidar.watch(watchPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 10,
      ignored: /(^|[\/\\])\../ // Ignore dotfiles
    })

    watcher.on('add', async (path) => {
      if (aborted) return
      await stream.writeSSE({
        event: 'add',
        data: JSON.stringify({ path })
      })
    })

    watcher.on('change', async (path) => {
      if (aborted) return
      await stream.writeSSE({
        event: 'change',
        data: JSON.stringify({ path })
      })
    })

    watcher.on('unlink', async (path) => {
      if (aborted) return
      await stream.writeSSE({
        event: 'delete',
        data: JSON.stringify({ path })
      })
    })

    watcher.on('addDir', async (path) => {
      if (aborted) return
      await stream.writeSSE({
        event: 'addDir',
        data: JSON.stringify({ path })
      })
    })

    watcher.on('unlinkDir', async (path) => {
      if (aborted) return
      await stream.writeSSE({
        event: 'deleteDir',
        data: JSON.stringify({ path })
      })
    })

    watcher.on('error', async (error) => {
      console.error('Watcher error:', error)
      if (!aborted) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: error.message })
        })
      }
    })

    await stream.writeSSE({
      event: 'ready',
      data: JSON.stringify({ message: `Watching ${watchPath}` })
    })

    // Keep stream open until aborted
    await new Promise<void>((resolve) => {
      const checkAbort = setInterval(() => {
        if (aborted) {
          clearInterval(checkAbort)
          watcher.close()
          resolve()
        }
      }, 100)
    })
  })
})

// ============================================================================
// Arduino Upload Endpoint
// ============================================================================

app.post('/upload', async (c) => {
  console.log('upload')
  const arduinoCliPath = process.env.ARDUINO_CLI_PATH
  if (!arduinoCliPath) {
    return c.json({ error: 'ARDUINO_CLI_PATH is not set' }, 400)
  }
  const form = await c.req.parseBody()
  const file = form.file
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file uploaded' }, 400)
  }
  
  const tempFilePath = join(tmpdir(), `upload-${Date.now()}-${file.name}`)
  
  try {
    const arrayBuffer = await file.arrayBuffer()
    await writeFile(tempFilePath, Buffer.from(arrayBuffer))
    console.log(`File saved to: ${tempFilePath}`)
  } catch (error: any) {
    console.error('Failed to save file:', error)
    return c.json({ error: 'Failed to save uploaded file: ' + error.message }, 500)
  }
  
  return streamSSE(c, async (stream) => {
    let aborted = false
    
    stream.onAbort(() => {
      console.log('Client disconnected')
      aborted = true
    })
    
    try {
      await stream.writeSSE({
        event: 'start',
        data: JSON.stringify({ message: 'Starting upload...', filePath: tempFilePath })
      })
      
      const args = ['upload', '-i', tempFilePath, '-b', process.env.FQBN || '']
      console.log(`Executing: ${arduinoCliPath} ${args.join(' ')}`)
      
      const proc = spawn(arduinoCliPath, args)
      
      proc.stdout.on('data', async (data) => {
        if (aborted) return
        const output = data.toString()
        console.log('stdout:', output)
        await stream.writeSSE({
          event: 'stdout',
          data: JSON.stringify({ data: output })
        })
      })
      
      proc.stderr.on('data', async (data) => {
        if (aborted) return
        const output = data.toString()
        console.log('stderr:', output)
        await stream.writeSSE({
          event: 'stderr',
          data: JSON.stringify({ data: output })
        })
      })
      
      await new Promise<void>((resolve, reject) => {
        proc.on('close', async (code) => {
          console.log(`Process exited with code ${code}`)
          
          try {
            await unlink(tempFilePath)
            console.log('Temp file cleaned up')
          } catch (unlinkError) {
            console.error('Failed to clean up temp file:', unlinkError)
          }
          
          if (aborted) {
            resolve()
            return
          }
          
          if (code === 0) {
            await stream.writeSSE({
              event: 'success',
              data: JSON.stringify({ message: 'Upload completed successfully', exitCode: code })
            })
            resolve()
          } else {
            await stream.writeSSE({
              event: 'error',
              data: JSON.stringify({ message: 'Upload failed', exitCode: code })
            })
            reject(new Error(`Process exited with code ${code}`))
          }
        })
        
        proc.on('error', async (error) => {
          console.error('Process error:', error)
          if (!aborted) {
            await stream.writeSSE({
              event: 'error',
              data: JSON.stringify({ message: error.message })
            })
          }
          reject(error)
        })
      })
      
      if (!aborted) {
        await stream.writeSSE({
          event: 'done',
          data: JSON.stringify({ message: 'Stream complete' })
        })
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      if (!aborted) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: error.message })
        })
      }
      
      try {
        await unlink(tempFilePath)
      } catch (unlinkError) {
        // File might already be deleted, ignore
      }
    }
  })
})

// ============================================================================
// Serial Port Endpoints
// ============================================================================

app.get('/serial/ports', async (c) => {
  try {
    const ports = await SerialPort.list()
    return c.json({ 
      ports: ports.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        pnpId: port.pnpId,
        locationId: port.locationId,
        productId: port.productId,
        vendorId: port.vendorId
      }))
    })
  } catch (error: any) {
    console.error('Failed to list serial ports:', error)
    return c.json({ error: 'Failed to list serial ports: ' + error.message }, 500)
  }
})

app.get('/serial', async (c) => {
  let port = c.req.query('port')
  const baudRate = parseInt(c.req.query('baudRate') || '9600')
  
  if (!port) {
    try {
      const ports = await SerialPort.list()
      if (ports.length === 0) {
        return c.json({ error: 'No serial ports found' }, 404)
      }
      
      let selectedPort = ports.find(p => p.vendorId?.toLowerCase() === '2341')
      
      if (!selectedPort) {
        selectedPort = ports.find(p => 
          p.pnpId && p.pnpId.includes('USB') && !p.pnpId.includes('BTHENUM')
        )
      }
      
      if (!selectedPort) {
        selectedPort = ports.find(p => p.vendorId && p.productId)
      }
      
      if (!selectedPort) {
        selectedPort = ports[0]
      }
      
      port = selectedPort.path
      console.log(`Auto-detected port: ${port}`, {
        manufacturer: selectedPort.manufacturer,
        vendorId: selectedPort.vendorId,
        productId: selectedPort.productId
      })
    } catch (error: any) {
      return c.json({ error: 'Failed to detect serial port: ' + error.message }, 500)
    }
  }
  
  return streamSSE(c, async (stream) => {
    let aborted = false
    let serialPort: SerialPort | null = null
    
    stream.onAbort(() => {
      console.log('Client disconnected from serial stream')
      aborted = true
      if (serialPort && serialPort.isOpen) {
        serialPort.close()
      }
    })
    
    try {
      await stream.writeSSE({
        event: 'start',
        data: JSON.stringify({ message: `Opening serial port ${port} at ${baudRate} baud` })
      })
      
      serialPort = new SerialPort({
        path: port,
        baudRate: baudRate,
        autoOpen: false
      })
      
      serialPort.on('error', async (error) => {
        console.error('Serial port error:', error)
        if (!aborted) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ message: error.message })
          })
        }
      })
      
      serialPort.on('close', async () => {
        console.log('Serial port closed')
        if (!aborted) {
          await stream.writeSSE({
            event: 'done',
            data: JSON.stringify({ message: 'Serial port closed' })
          })
        }
      })
      
      serialPort.on('data', async (data) => {
        if (aborted) return
        const output = data.toString()
        await stream.writeSSE({
          event: 'data',
          data: JSON.stringify({ data: output })
        })
      })
      
      await new Promise<void>((resolve, reject) => {
        serialPort!.open((error) => {
          if (error) {
            reject(error)
          } else {
            console.log(`Serial port ${port} opened successfully`)
            resolve()
          }
        })
      })
      
      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ message: 'Serial port connected' })
      })
      
      await new Promise<void>((resolve) => {
        const checkAbort = setInterval(() => {
          if (aborted || !serialPort || !serialPort.isOpen) {
            clearInterval(checkAbort)
            resolve()
          }
        }, 100)
      })
      
    } catch (error: any) {
      console.error('Serial port error:', error)
      if (!aborted) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: error.message })
        })
      }
    } finally {
      if (serialPort && serialPort.isOpen) {
        serialPort.close()
      }
    }
  })
})

// ============================================================================
// Start Server
// ============================================================================

const port = 8152
console.log(`Server starting on port ${port}`)

const server = serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

injectWebSocket(server)
