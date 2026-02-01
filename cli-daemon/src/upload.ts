import { Hono } from 'hono'
import { spawn } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { streamSSE } from 'hono/streaming'

export function registerUploadRoute(app: Hono) {
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
}
