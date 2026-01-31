/**
 * DfuSe - ST Microelectronics DFU Extensions
 * Based on the original webdfu library
 */

import {
  DfuDevice,
  DfuInterfaceSettings,
  DfuStatus,
  dfuDNBUSY,
  dfuIDLE,
  dfuMANIFEST,
  dfuDNLOAD_IDLE,
  STATUS_OK,
} from "./dfu";

// DfuSe commands
export const GET_COMMANDS = 0x00;
export const SET_ADDRESS = 0x21;
export const ERASE_SECTOR = 0x41;

// Memory segment interface
export interface MemorySegment {
  start: number;
  end: number;
  sectorSize: number;
  readable: boolean;
  erasable: boolean;
  writable: boolean;
}

export interface MemoryInfo {
  name: string;
  segments: MemorySegment[];
}

/**
 * Parse a DfuSe memory descriptor string
 */
export function parseMemoryDescriptor(desc: string): MemoryInfo {
  const nameEndIndex = desc.indexOf("/");
  if (!desc.startsWith("@") || nameEndIndex === -1) {
    throw new Error(`Not a DfuSe memory descriptor: "${desc}"`);
  }

  const name = desc.substring(1, nameEndIndex).trim();
  const segmentString = desc.substring(nameEndIndex);

  const segments: MemorySegment[] = [];

  const sectorMultipliers: Record<string, number> = {
    " ": 1,
    B: 1,
    K: 1024,
    M: 1048576,
  };

  const contiguousSegmentRegex =
    /\/\s*(0x[0-9a-fA-F]{1,8})\s*\/(\s*[0-9]+\s*\*\s*[0-9]+\s?[ BKM]\s*[abcdefg]\s*,?\s*)+/g;
  let contiguousSegmentMatch;

  while ((contiguousSegmentMatch = contiguousSegmentRegex.exec(segmentString))) {
    const segmentRegex = /([0-9]+)\s*\*\s*([0-9]+)\s?([ BKM])\s*([abcdefg])\s*,?\s*/g;
    let startAddress = parseInt(contiguousSegmentMatch[1], 16);
    let segmentMatch;

    while ((segmentMatch = segmentRegex.exec(contiguousSegmentMatch[0]))) {
      const sectorCount = parseInt(segmentMatch[1], 10);
      const sectorSize = parseInt(segmentMatch[2]) * sectorMultipliers[segmentMatch[3]];
      const properties = segmentMatch[4].charCodeAt(0) - "a".charCodeAt(0) + 1;

      segments.push({
        start: startAddress,
        sectorSize,
        end: startAddress + sectorSize * sectorCount,
        readable: (properties & 0x1) !== 0,
        erasable: (properties & 0x2) !== 0,
        writable: (properties & 0x4) !== 0,
      });

      startAddress += sectorSize * sectorCount;
    }
  }

  return { name, segments };
}

/**
 * DfuSe Device class extending DfuDevice with ST DFU extensions
 */
export class DfuseDevice extends DfuDevice {
  memoryInfo: MemoryInfo | null = null;
  startAddress: number = NaN;

  constructor(device: USBDevice, settings: DfuInterfaceSettings) {
    super(device, settings);
    if (settings.name) {
      try {
        this.memoryInfo = parseMemoryDescriptor(settings.name);
      } catch {
        // Not a DfuSe descriptor
        this.memoryInfo = null;
      }
    }
  }

  /**
   * Send a DfuSe-specific command
   */
  async dfuseCommand(command: number, param: number = 0x00, len: number = 1): Promise<void> {
    const commandNames: Record<number, string> = {
      0x00: "GET_COMMANDS",
      0x21: "SET_ADDRESS",
      0x41: "ERASE_SECTOR",
    };

    const payload = new ArrayBuffer(len + 1);
    const view = new DataView(payload);
    view.setUint8(0, command);

    if (len === 1) {
      view.setUint8(1, param);
    } else if (len === 4) {
      view.setUint32(1, param, true);
    } else {
      throw new Error(`Don't know how to handle data of len ${len}`);
    }

    try {
      await this.download(payload, 0);
    } catch (error) {
      throw new Error(`Error during special DfuSe command ${commandNames[command]}: ${error}`);
    }

    const status = await this.poll_until((state) => state !== dfuDNBUSY);
    if (status.status !== STATUS_OK) {
      throw new Error(`Special DfuSe command ${commandNames[command]} failed`);
    }
  }

  /**
   * Get the memory segment containing an address
   */
  getSegment(addr: number): MemorySegment | null {
    if (!this.memoryInfo || !this.memoryInfo.segments) {
      throw new Error("No memory map information available");
    }

    for (const segment of this.memoryInfo.segments) {
      if (segment.start <= addr && addr < segment.end) {
        return segment;
      }
    }

    return null;
  }

  /**
   * Get the start address of the sector containing an address
   */
  getSectorStart(addr: number, segment?: MemorySegment): number {
    if (!segment) {
      segment = this.getSegment(addr) ?? undefined;
    }

    if (!segment) {
      throw new Error(`Address ${addr.toString(16)} outside of memory map`);
    }

    const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
    return segment.start + sectorIndex * segment.sectorSize;
  }

  /**
   * Get the end address of the sector containing an address
   */
  getSectorEnd(addr: number, segment?: MemorySegment): number {
    if (!segment) {
      segment = this.getSegment(addr) ?? undefined;
    }

    if (!segment) {
      throw new Error(`Address ${addr.toString(16)} outside of memory map`);
    }

    const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
    return segment.start + (sectorIndex + 1) * segment.sectorSize;
  }

  /**
   * Get the first writable memory segment
   */
  getFirstWritableSegment(): MemorySegment | null {
    if (!this.memoryInfo || !this.memoryInfo.segments) {
      throw new Error("No memory map information available");
    }

    for (const segment of this.memoryInfo.segments) {
      if (segment.writable) {
        return segment;
      }
    }

    return null;
  }

  /**
   * Get the maximum readable size starting from an address
   */
  getMaxReadSize(startAddr: number): number {
    if (!this.memoryInfo || !this.memoryInfo.segments) {
      throw new Error("No memory map information available");
    }

    let numBytes = 0;
    for (const segment of this.memoryInfo.segments) {
      if (segment.start <= startAddr && startAddr < segment.end) {
        // Found the first segment the read starts in
        if (segment.readable) {
          numBytes += segment.end - startAddr;
        } else {
          return 0;
        }
      } else if (segment.start === startAddr + numBytes) {
        // Include a contiguous segment
        if (segment.readable) {
          numBytes += segment.end - segment.start;
        } else {
          break;
        }
      }
    }

    return numBytes;
  }

  /**
   * Erase flash memory starting at an address for a given length
   */
  async erase(startAddr: number, length: number): Promise<void> {
    let segment = this.getSegment(startAddr);
    if (!segment) {
      throw new Error(`Start address ${startAddr.toString(16)} outside of memory map`);
    }

    let addr = this.getSectorStart(startAddr, segment);
    const endAddr = this.getSectorEnd(startAddr + length - 1);

    let bytesErased = 0;
    const bytesToErase = endAddr - addr;

    if (bytesToErase > 0) {
      this.logProgress(bytesErased, bytesToErase);
    }

    while (addr < endAddr) {
      if (segment!.end <= addr) {
        segment = this.getSegment(addr);
      }

      if (!segment) {
        throw new Error(`Address ${addr.toString(16)} outside of memory map`);
      }

      if (!segment.erasable) {
        // Skip over the non-erasable section
        bytesErased = Math.min(bytesErased + segment.end - addr, bytesToErase);
        addr = segment.end;
        this.logProgress(bytesErased, bytesToErase);
        continue;
      }

      const sectorIndex = Math.floor((addr - segment.start) / segment.sectorSize);
      const sectorAddr = segment.start + sectorIndex * segment.sectorSize;
      this.logDebug(`Erasing ${segment.sectorSize}B at 0x${sectorAddr.toString(16)}`);

      await this.dfuseCommand(ERASE_SECTOR, sectorAddr, 4);

      addr = sectorAddr + segment.sectorSize;
      bytesErased += segment.sectorSize;
      this.logProgress(bytesErased, bytesToErase);
    }
  }

  /**
   * Override do_download to use DfuSe protocol
   */
  override async do_download(
    xfer_size: number,
    data: ArrayBuffer,
    _manifestationTolerant: boolean
  ): Promise<void> {
    if (!this.memoryInfo || !this.memoryInfo.segments) {
      throw new Error("No memory map available");
    }

    this.logInfo("Erasing DFU device memory");

    let bytes_sent = 0;
    const expected_size = data.byteLength;

    let startAddress = this.startAddress;
    if (isNaN(startAddress)) {
      startAddress = this.memoryInfo.segments[0].start;
      this.logWarning(`Using inferred start address 0x${startAddress.toString(16)}`);
    } else if (this.getSegment(startAddress) === null) {
      this.logError(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
    }

    await this.erase(startAddress, expected_size);

    this.logInfo("Copying data from browser to DFU device");
    this.logProgress(bytes_sent, expected_size);

    let address = startAddress;
    while (bytes_sent < expected_size) {
      const bytes_left = expected_size - bytes_sent;
      const chunk_size = Math.min(bytes_left, xfer_size);

      let bytes_written = 0;
      let dfu_status: DfuStatus;

      try {
        // Set the target address for this chunk
        await this.dfuseCommand(SET_ADDRESS, address, 4);
        this.logDebug(`Set address to 0x${address.toString(16)}`);
        
        // Download the chunk (block number 2 for data transfers in DfuSe)
        bytes_written = await this.download(data.slice(bytes_sent, bytes_sent + chunk_size), 2);
        this.logDebug(`Sent ${bytes_written} bytes`);
        
        // Wait for device to process the download
        dfu_status = await this.poll_until_idle(dfuDNLOAD_IDLE);
        
        address += chunk_size;
      } catch (error) {
        throw new Error(`Error during DfuSe download: ${error}`);
      }

      if (dfu_status.status !== STATUS_OK) {
        throw new Error(
          `DFU DOWNLOAD failed state=${dfu_status.state}, status=${dfu_status.status}`
        );
      }

      this.logDebug(`Wrote ${bytes_written} bytes`);
      bytes_sent += bytes_written;

      this.logProgress(bytes_sent, expected_size);
    }

    this.logInfo(`Wrote ${bytes_sent} bytes`);
    this.logInfo("Manifesting new firmware");

    try {
      await this.dfuseCommand(SET_ADDRESS, startAddress, 4);
      await this.download(new ArrayBuffer(0), 0);
    } catch (error) {
      throw new Error(`Error during DfuSe manifestation: ${error}`);
    }

    try {
      await this.poll_until((state) => state === dfuMANIFEST);
    } catch (error) {
      this.logError(String(error));
    }
  }

  /**
   * Override do_upload to use DfuSe protocol
   */
  override async do_upload(
    xfer_size: number,
    max_size: number = Infinity,
    _first_block: number = 0
  ): Promise<Blob> {
    let startAddress = this.startAddress;
    if (isNaN(startAddress)) {
      if (!this.memoryInfo || !this.memoryInfo.segments) {
        throw new Error("No memory map information available");
      }
      startAddress = this.memoryInfo.segments[0].start;
      this.logWarning(`Using inferred start address 0x${startAddress.toString(16)}`);
    } else if (this.getSegment(startAddress) === null) {
      this.logWarning(`Start address 0x${startAddress.toString(16)} outside of memory map bounds`);
    }

    this.logInfo(`Reading up to 0x${max_size.toString(16)} bytes starting at 0x${startAddress.toString(16)}`);

    const state = await this.getState();
    if (state !== dfuIDLE) {
      await this.abortToIdle();
    }

    await this.dfuseCommand(SET_ADDRESS, startAddress, 4);
    await this.abortToIdle();

    // DfuSe encodes the read address based on the transfer size,
    // the block number - 2, and the SET_ADDRESS pointer.
    return await super.do_upload(xfer_size, max_size, 2);
  }
}
