import { spawn } from 'child_process';
import { wrapWithLspHeaders, LspMessageParser } from './lsp-utils';
/**
 * Creates WebSocket handler for LSP communication
 */
export function createLspWebSocketHandler(c) {
    let lspProcess = null;
    const sketchPath = c.req.query('sketchPath');
    return {
        onOpen(_event, ws) {
            console.log('LSP WebSocket client connected, sketchPath:', sketchPath);
            const cmdLine = process.env.ARDUINO_CLI_LSP_COMMAND_LINE;
            if (!cmdLine) {
                console.error('ARDUINO_CLI_LSP_COMMAND_LINE not set');
                ws.close(1011, 'Server misconfigured');
                return;
            }
            const parts = cmdLine.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            const command = parts[0];
            if (!command) {
                console.error('Invalid command in ARDUINO_CLI_LSP_COMMAND_LINE');
                ws.close(1011, 'Invalid command');
                return;
            }
            const args = parts.slice(1).map(arg => arg.replace(/^"(.*)"$/, '$1'));
            console.log('Spawning:', command, args);
            // Spawn LSP process with sketch path as cwd if provided
            const spawnOptions = {
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: false
            };
            if (sketchPath) {
                spawnOptions.cwd = sketchPath;
            }
            lspProcess = spawn(command, args, spawnOptions);
            const messageParser = new LspMessageParser((jsonContent) => {
                try {
                    ws.send(jsonContent);
                }
                catch (err) {
                    console.error('Error sending to WebSocket:', err);
                }
            });
            lspProcess.stdout?.on('data', (data) => {
                messageParser.feed(data.toString());
            });
            lspProcess.stderr?.on('data', (data) => {
                console.error('LSP stderr:', data.toString());
            });
            lspProcess.on('exit', (code, signal) => {
                console.log(`LSP process exited: code=${code}, signal=${signal}`);
                ws.close(1011, 'LSP process terminated');
            });
            lspProcess.on('error', (err) => {
                console.error('LSP process error:', err);
                ws.close(1011, 'LSP process error');
            });
        },
        onMessage(event, ws) {
            if (!lspProcess || !lspProcess.stdin) {
                console.error('LSP process not available');
                return;
            }
            const message = event.data.toString();
            try {
                const framedMessage = wrapWithLspHeaders(message);
                lspProcess.stdin.write(framedMessage);
            }
            catch (err) {
                console.error('Error writing to LSP stdin:', err);
                ws.close(1011, 'Failed to communicate with LSP');
            }
        },
        onClose() {
            console.log('LSP WebSocket closed');
            if (lspProcess) {
                lspProcess.kill();
                lspProcess = null;
            }
        },
        onError(event) {
            console.error('LSP WebSocket error:', event);
            if (lspProcess) {
                lspProcess.kill();
                lspProcess = null;
            }
        }
    };
}
