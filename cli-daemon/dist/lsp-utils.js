// ============================================================================
// LSP Message Framing Utilities
// ============================================================================
/**
 * Wraps message content with LSP headers
 */
export function wrapWithLspHeaders(content) {
    const contentLength = Buffer.byteLength(content, 'utf8');
    return `Content-Length: ${contentLength}\r\n\r\n${content}`;
}
/**
 * Parser for LSP messages that handles framing protocol
 */
export class LspMessageParser {
    buffer = '';
    onMessage;
    constructor(onMessage) {
        this.onMessage = onMessage;
    }
    feed(data) {
        this.buffer += data;
        this.parseMessages();
    }
    parseMessages() {
        while (true) {
            const headerEnd = this.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1)
                return;
            const headerSection = this.buffer.slice(0, headerEnd);
            const contentLengthMatch = headerSection.match(/Content-Length:\s*(\d+)/i);
            if (!contentLengthMatch) {
                this.buffer = this.buffer.slice(headerEnd + 4);
                continue;
            }
            const contentLength = parseInt(contentLengthMatch[1], 10);
            const contentStart = headerEnd + 4;
            const contentEnd = contentStart + contentLength;
            if (Buffer.byteLength(this.buffer.slice(contentStart), 'utf8') < contentLength) {
                return;
            }
            const content = this.buffer.slice(contentStart, contentEnd);
            this.buffer = this.buffer.slice(contentEnd);
            this.onMessage(content);
        }
    }
}
