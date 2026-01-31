import { Hono } from 'hono'
import { spawn } from 'child_process'
import { streamSSE } from 'hono/streaming'

// ============================================================================
// Arduino Compile Route Handler
// ============================================================================

export interface CompileRequest {
  sketchPath: string
  fqbn?: string
  exportBinaries?: boolean
}

export interface CompileResult {
  success: boolean
  outputPath?: string
  buildPath?: string
  fqbn: string
}

/**
 * Register Arduino compile route
 * 
 * POST /compile
 * Body: { sketchPath: string, fqbn?: string, exportBinaries?: boolean }
 * 
 * Streams SSE events:
 * - start: { message, sketchPath, fqbn }
 * - stdout: { data }
 * - stderr: { data }
 * - success: { message, exitCode, outputPath?, buildPath? }
 * - error: { message, exitCode? }
 * - done: { message }
 */
export function registerCompileRoute(app: Hono) {
  app.post('/compile', async (c) => {
    console.log('compile request received')
    
    const arduinoCliPath = process.env.ARDUINO_CLI_PATH
    if (!arduinoCliPath) {
      return c.json({ error: 'ARDUINO_CLI_PATH is not set' }, 400)
    }

    let body: CompileRequest
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const { sketchPath, exportBinaries = true } = body
    const fqbn = body.fqbn || process.env.FQBN

    if (!sketchPath) {
      return c.json({ error: 'sketchPath is required' }, 400)
    }

    if (!fqbn) {
      return c.json({ error: 'fqbn is required (or set FQBN env var)' }, 400)
    }

    return streamSSE(c, async (stream) => {
      let aborted = false

      stream.onAbort(() => {
        console.log('Client disconnected from compile stream')
        aborted = true
      })

      try {
        await stream.writeSSE({
          event: 'start',
          data: JSON.stringify({ 
            message: 'Starting compilation...', 
            sketchPath,
            fqbn
          })
        })

        // Build arduino-cli compile arguments
        const args = [
          'compile',
          '--fqbn', fqbn,
          '--warnings', 'all',
          '--verbose'
        ]

        // Export binaries to sketch folder if requested
        if (exportBinaries) {
          args.push('--export-binaries')
        }

        // Add sketch path last
        args.push(sketchPath)

        console.log(`Executing: ${arduinoCliPath} ${args.join(' ')}`)

        const proc = spawn(arduinoCliPath, args)

        // Capture build output path from stdout
        let buildPath: string | undefined
        let outputPath: string | undefined

        proc.stdout.on('data', async (data) => {
          if (aborted) return
          const output = data.toString()
          console.log('compile stdout:', output)

          // Try to extract output file path from arduino-cli output
          // Look for lines like "Sketch uses X bytes..." or output file paths
          const hexMatch = output.match(/([^\s]+\.hex)/i)
          const binMatch = output.match(/([^\s]+\.bin)/i)
          const elfMatch = output.match(/([^\s]+\.elf)/i)
          
          if (hexMatch) outputPath = hexMatch[1]
          else if (binMatch) outputPath = binMatch[1]
          else if (elfMatch) outputPath = elfMatch[1]

          // Look for build path
          const buildPathMatch = output.match(/Build path:\s*(.+)/i)
          if (buildPathMatch) buildPath = buildPathMatch[1].trim()

          await stream.writeSSE({
            event: 'stdout',
            data: JSON.stringify({ data: output })
          })
        })

        proc.stderr.on('data', async (data) => {
          if (aborted) return
          const output = data.toString()
          console.log('compile stderr:', output)
          await stream.writeSSE({
            event: 'stderr',
            data: JSON.stringify({ data: output })
          })
        })

        await new Promise<void>((resolve, reject) => {
          proc.on('close', async (code) => {
            console.log(`Compile process exited with code ${code}`)

            if (aborted) {
              resolve()
              return
            }

            if (code === 0) {
              await stream.writeSSE({
                event: 'success',
                data: JSON.stringify({ 
                  message: 'Compilation completed successfully', 
                  exitCode: code,
                  outputPath,
                  buildPath,
                  fqbn
                })
              })
              resolve()
            } else {
              await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({ 
                  message: 'Compilation failed', 
                  exitCode: code 
                })
              })
              reject(new Error(`Compile process exited with code ${code}`))
            }
          })

          proc.on('error', async (error) => {
            console.error('Compile process error:', error)
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
        console.error('Compile error:', error)
        if (!aborted) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ message: error.message })
          })
        }
      }
    })
  })

  /**
   * POST /upload-sketch
   * Compile and upload a sketch to a connected board
   * Body: { sketchPath: string, fqbn?: string, port?: string }
   * 
   * Streams SSE events similar to /compile
   */
  app.post('/upload-sketch', async (c) => {
    console.log('upload-sketch request received')

    const arduinoCliPath = process.env.ARDUINO_CLI_PATH
    if (!arduinoCliPath) {
      return c.json({ error: 'ARDUINO_CLI_PATH is not set' }, 400)
    }

    let body: { sketchPath: string; fqbn?: string; port?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const { sketchPath, port } = body
    const fqbn = body.fqbn || process.env.FQBN

    if (!sketchPath) {
      return c.json({ error: 'sketchPath is required' }, 400)
    }

    if (!fqbn) {
      return c.json({ error: 'fqbn is required (or set FQBN env var)' }, 400)
    }

    return streamSSE(c, async (stream) => {
      let aborted = false

      stream.onAbort(() => {
        console.log('Client disconnected from upload-sketch stream')
        aborted = true
      })

      try {
        await stream.writeSSE({
          event: 'start',
          data: JSON.stringify({
            message: 'Starting compile and upload...',
            sketchPath,
            fqbn,
            port: port || 'auto-detect'
          })
        })

        // Build arduino-cli upload arguments
        // arduino-cli upload will compile if needed
        const args = [
          'upload',
          '--fqbn', fqbn,
          '--verbose'
        ]

        // Add port if specified
        if (port) {
          args.push('--port', port)
        }

        // Add sketch path last
        args.push(sketchPath)

        console.log(`Executing: ${arduinoCliPath} ${args.join(' ')}`)

        const proc = spawn(arduinoCliPath, args)

        proc.stdout.on('data', async (data) => {
          if (aborted) return
          const output = data.toString()
          console.log('upload-sketch stdout:', output)
          await stream.writeSSE({
            event: 'stdout',
            data: JSON.stringify({ data: output })
          })
        })

        proc.stderr.on('data', async (data) => {
          if (aborted) return
          const output = data.toString()
          console.log('upload-sketch stderr:', output)
          await stream.writeSSE({
            event: 'stderr',
            data: JSON.stringify({ data: output })
          })
        })

        await new Promise<void>((resolve, reject) => {
          proc.on('close', async (code) => {
            console.log(`Upload-sketch process exited with code ${code}`)

            if (aborted) {
              resolve()
              return
            }

            if (code === 0) {
              await stream.writeSSE({
                event: 'success',
                data: JSON.stringify({
                  message: 'Upload completed successfully',
                  exitCode: code
                })
              })
              resolve()
            } else {
              await stream.writeSSE({
                event: 'error',
                data: JSON.stringify({
                  message: 'Upload failed',
                  exitCode: code
                })
              })
              reject(new Error(`Process exited with code ${code}`))
            }
          })

          proc.on('error', async (error) => {
            console.error('Upload-sketch process error:', error)
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
        console.error('Upload-sketch error:', error)
        if (!aborted) {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ message: error.message })
          })
        }
      }
    })
  })

  // GET /boards - List available boards
  app.get('/boards', async (c) => {
    const arduinoCliPath = process.env.ARDUINO_CLI_PATH
    if (!arduinoCliPath) {
      return c.json({ error: 'ARDUINO_CLI_PATH is not set' }, 400)
    }

    try {
      const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
        const proc = spawn(arduinoCliPath, ['board', 'listall', '--format', 'json'])
        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => {
          stdout += data.toString()
        })

        proc.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        proc.on('close', (code) => {
          resolve({ stdout, stderr, code })
        })

        proc.on('error', (error) => {
          resolve({ stdout, stderr: error.message, code: 1 })
        })
      })

      if (result.code !== 0) {
        return c.json({ error: 'Failed to list boards', stderr: result.stderr }, 500)
      }

      const boards = JSON.parse(result.stdout)
      return c.json(boards)
    } catch (error: any) {
      return c.json({ error: 'Failed to parse board list: ' + error.message }, 500)
    }
  })

  // GET /boards/connected - List connected boards
  app.get('/boards/connected', async (c) => {
    const arduinoCliPath = process.env.ARDUINO_CLI_PATH
    if (!arduinoCliPath) {
      return c.json({ error: 'ARDUINO_CLI_PATH is not set' }, 400)
    }

    try {
      const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
        const proc = spawn(arduinoCliPath, ['board', 'list', '--format', 'json'])
        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => {
          stdout += data.toString()
        })

        proc.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        proc.on('close', (code) => {
          resolve({ stdout, stderr, code })
        })

        proc.on('error', (error) => {
          resolve({ stdout, stderr: error.message, code: 1 })
        })
      })

      if (result.code !== 0) {
        return c.json({ error: 'Failed to list connected boards', stderr: result.stderr }, 500)
      }

      const boards = JSON.parse(result.stdout)
      return c.json(boards)
    } catch (error: any) {
      return c.json({ error: 'Failed to parse board list: ' + error.message }, 500)
    }
  })
}
