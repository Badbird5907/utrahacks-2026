import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { SerialPort } from 'serialport'

// ============================================================================
// Serial Port Route Handlers
// ============================================================================

/**
 * Register all serial port routes
 */
export function registerSerialRoutes(app: Hono) {
  // List available serial ports
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

  // Stream serial port data (SSE)
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
}
