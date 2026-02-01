import type { Context } from 'hono'
import type { WSContext } from 'hono/ws'
import { spawn, ChildProcess } from 'child_process'
import { wrapWithLspHeaders, LspMessageParser } from './lsp-utils'

interface LspWebSocketHandler {
  onOpen(_event: Event, ws: WSContext): void
  onMessage(event: MessageEvent, ws: WSContext): void
  onClose(): void
  onError(event: Event): void
}

export function createLspWebSocketHandler(c: Context): LspWebSocketHandler {
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
}
