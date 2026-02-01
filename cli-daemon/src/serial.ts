import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { SerialPort } from 'serialport'

interface SSEClient {
  id: string
  send: (event: string, data: unknown) => Promise<void>
}

interface SerialLogEntry {
  timestamp: number
  data: string
}

export type SerialMonitorStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface SerialMonitorState {
  status: SerialMonitorStatus
  port: string | null
  baudRate: number
  error: string | null
}

class SerialConnectionManager {
  private static instance: SerialConnectionManager | null = null
  
  private port: SerialPort | null = null
  private status: SerialMonitorStatus = 'idle'
  private logBuffer: SerialLogEntry[] = []
  private clients: Map<string, SSEClient> = new Map()
  private reconnectTimer: NodeJS.Timeout | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private targetPort: string | null = null
  private baudRate: number = 9600
  private errorMessage: string | null = null
  private isShuttingDown: boolean = false
  
  private readonly MAX_LOG_BUFFER = 1000
  private readonly RECONNECT_DELAY = 2000
  private readonly POLL_INTERVAL = 2000
  
  private constructor() {}
  
  static getInstance(): SerialConnectionManager {
    if (!SerialConnectionManager.instance) {
      SerialConnectionManager.instance = new SerialConnectionManager()
    }
    return SerialConnectionManager.instance
  }
  
  async start(port?: string, baudRate: number = 9600): Promise<void> {
    console.log(`[SerialManager] Starting serial monitor - port: ${port || 'auto'}, baudRate: ${baudRate}`)
    
    this.isShuttingDown = false
    this.baudRate = baudRate
    this.targetPort = port || null
    
    if (!this.targetPort) {
      const detectedPort = await this.autoDetectPort()
      if (detectedPort) {
        this.targetPort = detectedPort
      }
    }
    
    if (this.targetPort) {
      await this.connect()
    } else {
      // No device found, start polling
      this.status = 'disconnected'
      this.broadcastEvent('status', this.getState())
      this.startPolling()
    }
  }
  
  stop(): void {
    console.log('[SerialManager] Stopping serial monitor')
    this.isShuttingDown = true
    
    this.stopPolling()
    this.stopReconnectTimer()
    
    if (this.port && this.port.isOpen) {
      this.port.close()
    }
    
    this.port = null
    this.status = 'idle'
    this.targetPort = null
    this.errorMessage = null
    
    this.broadcastEvent('stopped', { message: 'Serial monitor stopped' })
  }
  
  async send(data: string): Promise<void> {
    if (!this.port || !this.port.isOpen) {
      throw new Error('Serial port is not connected')
    }
    
    return new Promise((resolve, reject) => {
      this.port!.write(data, (error) => {
        if (error) {
          console.error('[SerialManager] Write error:', error)
          reject(error)
        } else {
          // Also log sent data
          this.addToBuffer(`> ${data}`)
          this.broadcastEvent('sent', { data })
          resolve()
        }
      })
    })
  }
  
  addClient(client: SSEClient): void {
    console.log(`[SerialManager] Client connected: ${client.id}`)
    this.clients.set(client.id, client)
    
    client.send('status', this.getState())
    
    const recentLogs = this.logBuffer.slice(-100)
    if (recentLogs.length > 0) {
      client.send('history', { logs: recentLogs.map(l => l.data) })
    }
  }
  
  removeClient(clientId: string): void {
    console.log(`[SerialManager] Client disconnected: ${clientId}`)
    this.clients.delete(clientId)
  }
  
  getLogs(limit: number = 50): string[] {
    const count = Math.min(limit, this.logBuffer.length)
    return this.logBuffer.slice(-count).map(l => l.data)
  }
  
  clearLogs(): void {
    this.logBuffer = []
    this.broadcastEvent('cleared', { message: 'Logs cleared' })
  }
  
  getState(): SerialMonitorState {
    return {
      status: this.status,
      port: this.targetPort,
      baudRate: this.baudRate,
      error: this.errorMessage,
    }
  }
  
  isConnected(): boolean {
    return this.status === 'connected' && this.port !== null && this.port.isOpen
  }
  
  private async connect(): Promise<void> {
    if (!this.targetPort) {
      console.error('[SerialManager] No target port set')
      return
    }
    
    this.status = 'connecting'
    this.errorMessage = null
    this.broadcastEvent('status', this.getState())
    
    try {
      if (this.port && this.port.isOpen) {
        this.port.close()
      }
      
      console.log(`[SerialManager] Opening port ${this.targetPort} at ${this.baudRate} baud`)
      
      this.port = new SerialPort({
        path: this.targetPort,
        baudRate: this.baudRate,
        autoOpen: false,
      })
      
      this.port.on('data', (data: Buffer) => {
        if (this.isShuttingDown) return
        
        const output = data.toString()
        this.addToBuffer(output)
        this.broadcastEvent('data', { data: output })
      })
      
      this.port.on('error', (error: Error) => {
        console.error('[SerialManager] Port error:', error)
        if (!this.isShuttingDown) {
          this.handleDisconnect(error.message)
        }
      })
      
      this.port.on('close', () => {
        console.log('[SerialManager] Port closed')
        if (!this.isShuttingDown) {
          this.handleDisconnect('Port closed')
        }
      })
      
      await new Promise<void>((resolve, reject) => {
        this.port!.open((error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
      
      console.log(`[SerialManager] Connected to ${this.targetPort}`)
      this.status = 'connected'
      this.stopPolling()
      this.stopReconnectTimer()
      this.broadcastEvent('connected', { port: this.targetPort, baudRate: this.baudRate })
      this.broadcastEvent('status', this.getState())
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to open port'
      console.error('[SerialManager] Connection failed:', message)
      this.handleDisconnect(message)
    }
  }
  
  private handleDisconnect(reason: string): void {
    console.log(`[SerialManager] Disconnected: ${reason}`)
    
    this.status = 'disconnected'
    this.errorMessage = reason
    
    if (this.port) {
      try {
        if (this.port.isOpen) {
          this.port.close()
        }
      } catch {
        // Ignore close errors
      }
      this.port = null
    }
    
    this.broadcastEvent('disconnected', { reason })
    this.broadcastEvent('status', this.getState())
    
    if (!this.isShuttingDown) {
      this.scheduleReconnect()
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return
    
    console.log(`[SerialManager] Scheduling reconnect in ${this.RECONNECT_DELAY}ms`)
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      
      if (this.isShuttingDown) return
      
      if (this.targetPort) {
        const ports = await SerialPort.list()
        const available = ports.find(p => p.path === this.targetPort)
        
        if (available) {
          this.broadcastEvent('reconnecting', { port: this.targetPort })
          await this.connect()
        } else {
          this.startPolling()
        }
      } else {
        this.startPolling()
      }
    }, this.RECONNECT_DELAY)
  }
  
  private startPolling(): void {
    if (this.pollTimer || this.isShuttingDown) return
    
    console.log('[SerialManager] Starting device polling')
    
    this.pollTimer = setInterval(async () => {
      if (this.isShuttingDown || this.status === 'connected') {
        this.stopPolling()
        return
      }
      
      const detectedPort = await this.autoDetectPort()
      
      if (detectedPort) {
        console.log(`[SerialManager] Device detected: ${detectedPort}`)
        this.targetPort = detectedPort
        this.stopPolling()
        this.broadcastEvent('reconnecting', { port: detectedPort })
        await this.connect()
      }
    }, this.POLL_INTERVAL)
  }
  
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }
  
  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
  
  private async autoDetectPort(): Promise<string | null> {
    try {
      const ports = await SerialPort.list()
      
      if (ports.length === 0) return null
      
      let selected = ports.find(p => p.vendorId?.toLowerCase() === '2341')
      
      if (!selected) {
        selected = ports.find(p => 
          p.pnpId && p.pnpId.includes('USB') && !p.pnpId.includes('BTHENUM')
        )
      }
      
      if (!selected) {
        selected = ports.find(p => p.vendorId && p.productId)
      }
      
      return selected?.path || null
    } catch (error) {
      console.error('[SerialManager] Auto-detect error:', error)
      return null
    }
  }
  
  private addToBuffer(data: string): void {
    // Split by newlines and add each line
    const lines = data.split('\n')
    const timestamp = Date.now()
    
    for (const line of lines) {
      if (line.trim()) {
        this.logBuffer.push({ timestamp, data: line })
      }
    }
    
    // Trim buffer if too large
    if (this.logBuffer.length > this.MAX_LOG_BUFFER) {
      this.logBuffer = this.logBuffer.slice(-this.MAX_LOG_BUFFER)
    }
  }
  
  private broadcastEvent(event: string, data: unknown): void {
    for (const client of this.clients.values()) {
      client.send(event, data).catch((error) => {
        console.error(`[SerialManager] Failed to send to client ${client.id}:`, error)
      })
    }
  }
}

export function registerSerialRoutes(app: Hono) {
  const manager = SerialConnectionManager.getInstance()
  
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
    } catch (error: unknown) {
      console.error('Failed to list serial ports:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: 'Failed to list serial ports: ' + message }, 500)
    }
  })
  
  // --------------------------------------------------------------------------
  // Get serial monitor status
  // --------------------------------------------------------------------------
  app.get('/serial/status', (c) => {
    return c.json(manager.getState())
  })
  
  app.post('/serial/start', async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}))
      const port = body.port as string | undefined
      const baudRate = parseInt(body.baudRate) || 9600
      
      await manager.start(port, baudRate)
      
      return c.json({ success: true, state: manager.getState() })
    } catch (error: unknown) {
      console.error('Failed to start serial monitor:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: message }, 500)
    }
  })
  
  // --------------------------------------------------------------------------
  // Stop serial monitor
  // --------------------------------------------------------------------------
  app.post('/serial/stop', (c) => {
    manager.stop()
    return c.json({ success: true })
  })
  
  app.post('/serial/send', async (c) => {
    try {
      const body = await c.req.json()
      const data = body.data as string
      
      if (!data) {
        return c.json({ error: 'No data provided' }, 400)
      }
      
      await manager.send(data)
      return c.json({ success: true })
    } catch (error: unknown) {
      console.error('Failed to send data:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      return c.json({ error: message }, 500)
    }
  })
  
  // --------------------------------------------------------------------------
  // Get buffered logs (for Gemini tool)
  // --------------------------------------------------------------------------
  app.get('/serial/logs', (c) => {
    const limit = parseInt(c.req.query('limit') || '50')
    const logs = manager.getLogs(limit)
    return c.json({ logs, count: logs.length })
  })
  
  app.post('/serial/logs/clear', (c) => {
    manager.clearLogs()
    return c.json({ success: true })
  })
  
  // --------------------------------------------------------------------------
  // Subscribe to serial monitor (SSE stream)
  // --------------------------------------------------------------------------
  app.get('/serial/monitor', async (c) => {
    return streamSSE(c, async (stream) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      let aborted = false
      
      stream.onAbort(() => {
        console.log(`[Serial SSE] Client ${clientId} aborted`)
        aborted = true
        manager.removeClient(clientId)
      })
      
      const client: SSEClient = {
        id: clientId,
        send: async (event: string, data: unknown) => {
          if (aborted) return
          await stream.writeSSE({
            event,
            data: JSON.stringify(data),
          })
        },
      }
      
      manager.addClient(client)
      
      while (!aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        
        if (!aborted) {
          await stream.writeSSE({
            event: 'keepalive',
            data: JSON.stringify({ timestamp: Date.now() }),
          })
        }
      }
    })
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
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return c.json({ error: 'Failed to detect serial port: ' + message }, 500)
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
        
      } catch (error: unknown) {
        console.error('Serial port error:', error)
        if (!aborted) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ message })
          })
        }
      } finally {
        if (serialPort && serialPort.isOpen) {
          serialPort.close()
        }
      }
    })
  })
}
