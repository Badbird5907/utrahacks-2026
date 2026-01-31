/**
 * WebDFU - Modern ESM TypeScript implementation
 * Based on the original webdfu library
 */

// DFU Commands
export const DETACH = 0x00;
export const DNLOAD = 0x01;
export const UPLOAD = 0x02;
export const GETSTATUS = 0x03;
export const CLRSTATUS = 0x04;
export const GETSTATE = 0x05;
export const ABORT = 0x06;

// DFU States
export const appIDLE = 0;
export const appDETACH = 1;
export const dfuIDLE = 2;
export const dfuDNLOAD_SYNC = 3;
export const dfuDNBUSY = 4;
export const dfuDNLOAD_IDLE = 5;
export const dfuMANIFEST_SYNC = 6;
export const dfuMANIFEST = 7;
export const dfuMANIFEST_WAIT_RESET = 8;
export const dfuUPLOAD_IDLE = 9;
export const dfuERROR = 10;

// DFU Status codes
export const STATUS_OK = 0x0;

// Type definitions
export interface DfuInterfaceSettings {
  configuration: USBConfiguration;
  interface: USBInterface;
  alternate: USBAlternateInterface;
  name: string | null;
}

export interface DfuStatus {
  status: number;
  pollTimeout: number;
  state: number;
}

export interface DeviceDescriptor {
  bLength: number;
  bDescriptorType: number;
  bcdUSB: number;
  bDeviceClass: number;
  bDeviceSubClass: number;
  bDeviceProtocol: number;
  bMaxPacketSize: number;
  idVendor: number;
  idProduct: number;
  bcdDevice: number;
  iManufacturer: number;
  iProduct: number;
  iSerialNumber: number;
  bNumConfigurations: number;
}

export interface ConfigurationDescriptor {
  bLength: number;
  bDescriptorType: number;
  wTotalLength: number;
  bNumInterfaces: number;
  bConfigurationValue: number;
  iConfiguration: number;
  bmAttributes: number;
  bMaxPower: number;
  descriptors: Descriptor[];
}

export interface InterfaceDescriptor {
  bLength: number;
  bDescriptorType: number;
  bInterfaceNumber: number;
  bAlternateSetting: number;
  bNumEndpoints: number;
  bInterfaceClass: number;
  bInterfaceSubClass: number;
  bInterfaceProtocol: number;
  iInterface: number;
  descriptors: Descriptor[];
}

export interface FunctionalDescriptor {
  bLength: number;
  bDescriptorType: number;
  bmAttributes: number;
  wDetachTimeOut: number;
  wTransferSize: number;
  bcdDFUVersion: number;
}

export interface GenericDescriptor {
  bLength: number;
  bDescriptorType: number;
  data: DataView;
}

export type Descriptor = InterfaceDescriptor | FunctionalDescriptor | GenericDescriptor;

export interface DfuProperties {
  WillDetach: boolean;
  ManifestationTolerant: boolean;
  CanUpload: boolean;
  CanDnload: boolean;
  TransferSize: number;
  DetachTimeOut: number;
  DFUVersion: number;
}

/**
 * Find all DFU interfaces on a USB device
 */
export function findDeviceDfuInterfaces(device: USBDevice): DfuInterfaceSettings[] {
  const interfaces: DfuInterfaceSettings[] = [];
  
  for (const conf of device.configurations) {
    for (const intf of conf.interfaces) {
      for (const alt of intf.alternates) {
        if (
          alt.interfaceClass === 0xfe &&
          alt.interfaceSubclass === 0x01 &&
          (alt.interfaceProtocol === 0x01 || alt.interfaceProtocol === 0x02)
        ) {
          interfaces.push({
            configuration: conf,
            interface: intf,
            alternate: alt,
            name: alt.interfaceName ?? null,
          });
        }
      }
    }
  }

  return interfaces;
}

/**
 * Find all DFU devices and their interfaces
 */
export async function findAllDfuInterfaces(): Promise<DfuDevice[]> {
  const devices = await navigator.usb.getDevices();
  const matches: DfuDevice[] = [];

  for (const device of devices) {
    const interfaces = findDeviceDfuInterfaces(device);
    for (const intf of interfaces) {
      matches.push(new DfuDevice(device, intf));
    }
  }

  return matches;
}

/**
 * Parse a device descriptor from raw data
 */
export function parseDeviceDescriptor(data: DataView): DeviceDescriptor {
  return {
    bLength: data.getUint8(0),
    bDescriptorType: data.getUint8(1),
    bcdUSB: data.getUint16(2, true),
    bDeviceClass: data.getUint8(4),
    bDeviceSubClass: data.getUint8(5),
    bDeviceProtocol: data.getUint8(6),
    bMaxPacketSize: data.getUint8(7),
    idVendor: data.getUint16(8, true),
    idProduct: data.getUint16(10, true),
    bcdDevice: data.getUint16(12, true),
    iManufacturer: data.getUint8(14),
    iProduct: data.getUint8(15),
    iSerialNumber: data.getUint8(16),
    bNumConfigurations: data.getUint8(17),
  };
}

/**
 * Parse a configuration descriptor from raw data
 */
export function parseConfigurationDescriptor(data: DataView): ConfigurationDescriptor {
  const descriptorData = new DataView(data.buffer.slice(9));
  const descriptors = parseSubDescriptors(descriptorData);

  return {
    bLength: data.getUint8(0),
    bDescriptorType: data.getUint8(1),
    wTotalLength: data.getUint16(2, true),
    bNumInterfaces: data.getUint8(4),
    bConfigurationValue: data.getUint8(5),
    iConfiguration: data.getUint8(6),
    bmAttributes: data.getUint8(7),
    bMaxPower: data.getUint8(8),
    descriptors,
  };
}

/**
 * Parse an interface descriptor from raw data
 */
export function parseInterfaceDescriptor(data: DataView): InterfaceDescriptor {
  return {
    bLength: data.getUint8(0),
    bDescriptorType: data.getUint8(1),
    bInterfaceNumber: data.getUint8(2),
    bAlternateSetting: data.getUint8(3),
    bNumEndpoints: data.getUint8(4),
    bInterfaceClass: data.getUint8(5),
    bInterfaceSubClass: data.getUint8(6),
    bInterfaceProtocol: data.getUint8(7),
    iInterface: data.getUint8(8),
    descriptors: [],
  };
}

/**
 * Parse a DFU functional descriptor from raw data
 */
export function parseFunctionalDescriptor(data: DataView): FunctionalDescriptor {
  return {
    bLength: data.getUint8(0),
    bDescriptorType: data.getUint8(1),
    bmAttributes: data.getUint8(2),
    wDetachTimeOut: data.getUint16(3, true),
    wTransferSize: data.getUint16(5, true),
    bcdDFUVersion: data.getUint16(7, true),
  };
}

/**
 * Parse sub-descriptors from raw descriptor data
 */
export function parseSubDescriptors(descriptorData: DataView): Descriptor[] {
  const DT_INTERFACE = 4;
  const DT_DFU_FUNCTIONAL = 0x21;
  const USB_CLASS_APP_SPECIFIC = 0xfe;
  const USB_SUBCLASS_DFU = 0x01;

  let remainingData = descriptorData;
  const descriptors: Descriptor[] = [];
  let currIntf: InterfaceDescriptor | undefined;
  let inDfuIntf = false;

  while (remainingData.byteLength > 2) {
    const bLength = remainingData.getUint8(0);
    const bDescriptorType = remainingData.getUint8(1);
    const descData = new DataView(remainingData.buffer.slice(0, bLength));

    if (bDescriptorType === DT_INTERFACE) {
      currIntf = parseInterfaceDescriptor(descData);
      inDfuIntf =
        currIntf.bInterfaceClass === USB_CLASS_APP_SPECIFIC &&
        currIntf.bInterfaceSubClass === USB_SUBCLASS_DFU;
      descriptors.push(currIntf);
    } else if (inDfuIntf && bDescriptorType === DT_DFU_FUNCTIONAL) {
      const funcDesc = parseFunctionalDescriptor(descData);
      descriptors.push(funcDesc);
      if (currIntf) {
        currIntf.descriptors.push(funcDesc);
      }
    } else {
      const desc: GenericDescriptor = {
        bLength,
        bDescriptorType,
        data: descData,
      };
      descriptors.push(desc);
      if (currIntf) {
        currIntf.descriptors.push(desc);
      }
    }

    remainingData = new DataView(remainingData.buffer.slice(bLength));
  }

  return descriptors;
}

/**
 * DFU Device class for communicating with USB DFU devices
 */
export class DfuDevice {
  device_: USBDevice;
  settings: DfuInterfaceSettings;
  intfNumber: number;
  disconnected: boolean = false;
  properties?: DfuProperties;

  constructor(device: USBDevice, settings: DfuInterfaceSettings) {
    this.device_ = device;
    this.settings = settings;
    this.intfNumber = settings.interface.interfaceNumber;
  }

  // Logging methods - can be overridden
  logDebug(_msg: string): void {
    // Debug logging disabled by default
  }

  logInfo(msg: string): void {
    console.log(msg);
  }

  logWarning(msg: string): void {
    console.warn(msg);
  }

  logError(msg: string): void {
    console.error(msg);
  }

  logProgress(done: number, total?: number): void {
    if (total === undefined) {
      console.log(done);
    } else {
      console.log(`${done}/${total}`);
    }
  }

  async open(): Promise<void> {
    await this.device_.open();

    const confValue = this.settings.configuration.configurationValue;
    if (
      this.device_.configuration === null ||
      this.device_.configuration === undefined ||
      this.device_.configuration.configurationValue !== confValue
    ) {
      await this.device_.selectConfiguration(confValue);
    }

    const intfNumber = this.settings.interface.interfaceNumber;
    if (!this.device_.configuration!.interfaces[intfNumber].claimed) {
      await this.device_.claimInterface(intfNumber);
    }

    const altSetting = this.settings.alternate.alternateSetting;
    const intf = this.device_.configuration!.interfaces[intfNumber];

    if (
      intf.alternate === null ||
      intf.alternate.alternateSetting !== altSetting ||
      intf.alternates.length > 1
    ) {
      try {
        await this.device_.selectAlternateInterface(intfNumber, altSetting);
      } catch (error) {
        if (
          intf.alternate?.alternateSetting === altSetting &&
          String(error).endsWith("Unable to set device interface.")
        ) {
          this.logWarning(
            `Redundant SET_INTERFACE request to select altSetting ${altSetting} failed`
          );
        } else {
          throw error;
        }
      }
    }
  }

  async close(): Promise<void> {
    try {
      await this.device_.close();
    } catch (error) {
      console.log(error);
    }
  }

  async readDeviceDescriptor(): Promise<DataView> {
    const GET_DESCRIPTOR = 0x06;
    const DT_DEVICE = 0x01;
    const wValue = DT_DEVICE << 8;

    const result = await this.device_.controlTransferIn(
      {
        requestType: "standard",
        recipient: "device",
        request: GET_DESCRIPTOR,
        value: wValue,
        index: 0,
      },
      18
    );

    if (result.status === "ok" && result.data) {
      return result.data;
    }
    throw new Error(`Failed to read device descriptor: ${result.status}`);
  }

  async readStringDescriptor(index: number, langID: number = 0): Promise<number[] | string> {
    const GET_DESCRIPTOR = 0x06;
    const DT_STRING = 0x03;
    const wValue = (DT_STRING << 8) | index;

    const requestSetup: USBControlTransferParameters = {
      requestType: "standard",
      recipient: "device",
      request: GET_DESCRIPTOR,
      value: wValue,
      index: langID,
    };

    // Read enough for bLength
    let result = await this.device_.controlTransferIn(requestSetup, 1);

    if (result.status === "ok" && result.data) {
      // Retrieve the full descriptor
      const bLength = result.data.getUint8(0);
      result = await this.device_.controlTransferIn(requestSetup, bLength);

      if (result.status === "ok" && result.data) {
        const len = (bLength - 2) / 2;
        const u16Words: number[] = [];
        for (let i = 0; i < len; i++) {
          u16Words.push(result.data.getUint16(2 + i * 2, true));
        }
        if (langID === 0) {
          // Return the langID array
          return u16Words;
        } else {
          // Decode from UCS-2 into a string
          return String.fromCharCode(...u16Words);
        }
      }
    }

    throw new Error(`Failed to read string descriptor ${index}: ${result.status}`);
  }

  async readInterfaceNames(): Promise<Record<number, Record<number, Record<number, string | null>>>> {
    const DT_INTERFACE = 4;

    const configs: Record<number, Record<number, Record<number, number>>> = {};
    const allStringIndices = new Set<number>();

    for (let configIndex = 0; configIndex < this.device_.configurations.length; configIndex++) {
      const rawConfig = await this.readConfigurationDescriptor(configIndex);
      const configDesc = parseConfigurationDescriptor(rawConfig);
      const configValue = configDesc.bConfigurationValue;
      configs[configValue] = {};

      // Retrieve string indices for interface names
      for (const desc of configDesc.descriptors) {
        if ("bInterfaceNumber" in desc && desc.bDescriptorType === DT_INTERFACE) {
          const intfDesc = desc as InterfaceDescriptor;
          if (!(intfDesc.bInterfaceNumber in configs[configValue])) {
            configs[configValue][intfDesc.bInterfaceNumber] = {};
          }
          configs[configValue][intfDesc.bInterfaceNumber][intfDesc.bAlternateSetting] =
            intfDesc.iInterface;
          if (intfDesc.iInterface > 0) {
            allStringIndices.add(intfDesc.iInterface);
          }
        }
      }
    }

    const strings: Record<number, string | null> = {};
    // Retrieve interface name strings
    for (const index of allStringIndices) {
      try {
        const result = await this.readStringDescriptor(index, 0x0409);
        strings[index] = typeof result === "string" ? result : null;
      } catch (error) {
        console.log(error);
        strings[index] = null;
      }
    }

    const result: Record<number, Record<number, Record<number, string | null>>> = {};
    for (const configValue in configs) {
      result[configValue] = {};
      for (const intfNumber in configs[configValue]) {
        result[configValue][intfNumber] = {};
        for (const alt in configs[configValue][intfNumber]) {
          const iIndex = configs[configValue][intfNumber][alt];
          result[configValue][intfNumber][alt] = strings[iIndex] ?? null;
        }
      }
    }

    return result;
  }

  async readConfigurationDescriptor(index: number): Promise<DataView> {
    const GET_DESCRIPTOR = 0x06;
    const DT_CONFIGURATION = 0x02;
    const wValue = (DT_CONFIGURATION << 8) | index;

    // First read to get the length
    let result = await this.device_.controlTransferIn(
      {
        requestType: "standard",
        recipient: "device",
        request: GET_DESCRIPTOR,
        value: wValue,
        index: 0,
      },
      4
    );

    if (result.status !== "ok" || !result.data) {
      throw new Error(`Failed to read configuration descriptor: ${result.status}`);
    }

    // Read full descriptor
    const wLength = result.data.getUint16(2, true);
    result = await this.device_.controlTransferIn(
      {
        requestType: "standard",
        recipient: "device",
        request: GET_DESCRIPTOR,
        value: wValue,
        index: 0,
      },
      wLength
    );

    if (result.status === "ok" && result.data) {
      return result.data;
    }
    throw new Error(`Failed to read configuration descriptor: ${result.status}`);
  }

  async requestOut(bRequest: number, data?: BufferSource, wValue: number = 0): Promise<number> {
    try {
      const result = await this.device_.controlTransferOut(
        {
          requestType: "class",
          recipient: "interface",
          request: bRequest,
          value: wValue,
          index: this.intfNumber,
        },
        data
      );

      if (result.status === "ok") {
        return result.bytesWritten;
      }
      throw new Error(`ControlTransferOut failed: ${result.status}`);
    } catch (error) {
      // Provide more context about what failed
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`USB Control Transfer Out (request=${bRequest}, value=${wValue}): ${errorMsg}`);
    }
  }

  async requestIn(bRequest: number, wLength: number, wValue: number = 0): Promise<DataView> {
    const result = await this.device_.controlTransferIn(
      {
        requestType: "class",
        recipient: "interface",
        request: bRequest,
        value: wValue,
        index: this.intfNumber,
      },
      wLength
    );

    if (result.status === "ok" && result.data) {
      return result.data;
    }
    throw new Error(`ControlTransferIn failed: ${result.status}`);
  }

  async detach(): Promise<number> {
    return this.requestOut(DETACH, undefined, 1000);
  }

  async waitDisconnected(timeout: number): Promise<DfuDevice> {
    const usbDevice = this.device_;

    return new Promise((resolve, reject) => {
      let timeoutID: ReturnType<typeof setTimeout> | undefined;

      const onDisconnect = (event: USBConnectionEvent) => {
        if (event.device === usbDevice) {
          if (timeoutID !== undefined) {
            clearTimeout(timeoutID);
          }
          this.disconnected = true;
          navigator.usb.removeEventListener("disconnect", onDisconnect);
          resolve(this);
        }
      };

      if (timeout > 0) {
        timeoutID = setTimeout(() => {
          navigator.usb.removeEventListener("disconnect", onDisconnect);
          if (this.disconnected !== true) {
            reject(new Error("Disconnect timeout expired"));
          }
        }, timeout);
      }

      navigator.usb.addEventListener("disconnect", onDisconnect);
    });
  }

  async download(data: BufferSource, blockNum: number): Promise<number> {
    return this.requestOut(DNLOAD, data, blockNum);
  }

  // Alias for download
  dnload = this.download.bind(this);

  async upload(length: number, blockNum: number): Promise<DataView> {
    return this.requestIn(UPLOAD, length, blockNum);
  }

  async clearStatus(): Promise<number> {
    return this.requestOut(CLRSTATUS);
  }

  // Alias for clearStatus
  clrStatus = this.clearStatus.bind(this);

  async getStatus(): Promise<DfuStatus> {
    const data = await this.requestIn(GETSTATUS, 6);
    return {
      status: data.getUint8(0),
      pollTimeout: data.getUint32(1, true) & 0xffffff,
      state: data.getUint8(4),
    };
  }

  async getState(): Promise<number> {
    const data = await this.requestIn(GETSTATE, 1);
    return data.getUint8(0);
  }

  async abort(): Promise<number> {
    return this.requestOut(ABORT);
  }

  async abortToIdle(): Promise<void> {
    await this.abort();
    let state = await this.getState();
    if (state === dfuERROR) {
      await this.clearStatus();
      state = await this.getState();
    }
    if (state !== dfuIDLE) {
      throw new Error(`Failed to return to idle state after abort: state ${state}`);
    }
  }

  async do_upload(
    xfer_size: number,
    max_size: number = Infinity,
    first_block: number = 0
  ): Promise<Blob> {
    let transaction = first_block;
    const blocks: DataView[] = [];
    let bytes_read = 0;

    this.logInfo("Copying data from DFU device to browser");
    this.logProgress(0);

    let result: DataView;
    let bytes_to_read: number;

    do {
      bytes_to_read = Math.min(xfer_size, max_size - bytes_read);
      result = await this.upload(bytes_to_read, transaction++);
      this.logDebug(`Read ${result.byteLength} bytes`);

      if (result.byteLength > 0) {
        blocks.push(result);
        bytes_read += result.byteLength;
      }

      if (Number.isFinite(max_size)) {
        this.logProgress(bytes_read, max_size);
      } else {
        this.logProgress(bytes_read);
      }
    } while (bytes_read < max_size && result.byteLength === bytes_to_read);

    if (bytes_read === max_size) {
      await this.abortToIdle();
    }

    this.logInfo(`Read ${bytes_read} bytes`);

    // Convert DataViews to ArrayBuffers for Blob
    const buffers: BlobPart[] = blocks.map((dv) => {
      return new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength).slice();
    });
    return new Blob(buffers, { type: "application/octet-stream" });
  }

  async poll_until(state_predicate: (state: number) => boolean): Promise<DfuStatus> {
    let dfu_status = await this.getStatus();

    const asyncSleep = (duration_ms: number) => {
      return new Promise<void>((resolve) => {
        this.logDebug(`Sleeping for ${duration_ms}ms`);
        setTimeout(resolve, duration_ms);
      });
    };

    while (!state_predicate(dfu_status.state) && dfu_status.state !== dfuERROR) {
      // Only sleep if pollTimeout is non-zero
      // Many devices return 0, indicating status can be checked immediately
      if (dfu_status.pollTimeout > 0) {
        await asyncSleep(dfu_status.pollTimeout);
      }
      dfu_status = await this.getStatus();
    }

    return dfu_status;
  }

  async poll_until_idle(idle_state: number): Promise<DfuStatus> {
    return this.poll_until((state) => state === idle_state);
  }

  async do_download(
    xfer_size: number,
    data: ArrayBuffer,
    manifestationTolerant: boolean
  ): Promise<void> {
    let bytes_sent = 0;
    const expected_size = data.byteLength;
    let transaction = 0;

    this.logInfo("Copying data from browser to DFU device");
    this.logProgress(bytes_sent, expected_size);

    // Performance tracking
    const startTime = performance.now();
    let lastReportTime = startTime;
    let lastReportBytes = 0;
    const REPORT_INTERVAL_MS = 1000; // Report every 1 second
    
    // Adaptive status checking:
    // - For small transfers, check every N chunks to reduce overhead
    // - Still maintain safety by checking periodically
    let STATUS_CHECK_INTERVAL = 1; // Start conservative
    let consecutiveIdleStates = 0;

    while (bytes_sent < expected_size) {
      const bytes_left = expected_size - bytes_sent;
      const chunk_size = Math.min(bytes_left, xfer_size);

      let bytes_written = 0;
      let dfu_status: DfuStatus;

      try {
        const chunkStartTime = performance.now();
        bytes_written = await this.download(data.slice(bytes_sent, bytes_sent + chunk_size), transaction++);
        const downloadTime = performance.now() - chunkStartTime;
        this.logDebug(`Download took ${downloadTime.toFixed(1)}ms`);
        
        // Adaptive status checking: check more frequently initially, then back off if device is fast
        const shouldCheckStatus = (transaction % STATUS_CHECK_INTERVAL === 0) || 
                                  (bytes_sent + bytes_written >= expected_size);
        
        if (shouldCheckStatus) {
          // Check status after download
          const statusStartTime = performance.now();
          dfu_status = await this.getStatus();
          const statusTime = performance.now() - statusStartTime;
          this.logDebug(`getStatus took ${statusTime.toFixed(1)}ms, pollTimeout=${dfu_status.pollTimeout}ms, state=${dfu_status.state}`);
          
          // OPTIMIZATION: Only poll if device reports it's busy
          if (dfu_status.state === dfuDNLOAD_IDLE) {
            // Device is already idle, no need to poll
            consecutiveIdleStates++;
            this.logDebug(`Device already idle (${consecutiveIdleStates} consecutive)`);
            
            // If device consistently returns to idle immediately, we can check less often
            if (consecutiveIdleStates >= 10 && STATUS_CHECK_INTERVAL < 8) {
              STATUS_CHECK_INTERVAL = Math.min(8, STATUS_CHECK_INTERVAL * 2);
              this.logDebug(`Increased status check interval to ${STATUS_CHECK_INTERVAL}`);
              consecutiveIdleStates = 0;
            }
          } else if (dfu_status.state === dfuDNBUSY || dfu_status.state === dfuDNLOAD_SYNC) {
            // Device is busy, need to poll
            consecutiveIdleStates = 0;
            // If device needs polling, check more frequently
            if (STATUS_CHECK_INTERVAL > 2) {
              STATUS_CHECK_INTERVAL = 2;
              this.logDebug(`Decreased status check interval to ${STATUS_CHECK_INTERVAL}`);
            }
            
            const pollStartTime = performance.now();
            dfu_status = await this.poll_until_idle(dfuDNLOAD_IDLE);
            const pollTime = performance.now() - pollStartTime;
            this.logDebug(`Polling took ${pollTime.toFixed(1)}ms`);
          }
          
          if (dfu_status.status !== STATUS_OK) {
            throw new Error(
              `DFU DOWNLOAD failed state=${dfu_status.state}, status=${dfu_status.status}`
            );
          }
        }
      } catch (error) {
        throw new Error(`Error during DFU download: ${error}`);
      }

      this.logDebug(`Wrote ${bytes_written} bytes`);
      bytes_sent += bytes_written;

      this.logProgress(bytes_sent, expected_size);

      // Periodic speed reporting
      const now = performance.now();
      if (now - lastReportTime >= REPORT_INTERVAL_MS) {
        const elapsedSec = (now - startTime) / 1000;
        const intervalBytes = bytes_sent - lastReportBytes;
        const intervalTime = (now - lastReportTime) / 1000;
        const currentSpeed = intervalBytes / intervalTime;
        const avgSpeed = bytes_sent / elapsedSec;
        const eta = (expected_size - bytes_sent) / avgSpeed;
        
        this.logInfo(
          `Transfer: ${(bytes_sent / 1024).toFixed(1)}KB/${(expected_size / 1024).toFixed(1)}KB ` +
          `(${((bytes_sent / expected_size) * 100).toFixed(1)}%) @ ${(currentSpeed / 1024).toFixed(2)}KB/s ` +
          `(avg: ${(avgSpeed / 1024).toFixed(2)}KB/s, ETA: ${eta.toFixed(1)}s)`
        );
        
        lastReportTime = now;
        lastReportBytes = bytes_sent;
      }
    }

    this.logDebug("Sending empty block");
    try {
      await this.download(new ArrayBuffer(0), transaction++);
    } catch (error) {
      throw new Error(`Error during final DFU download: ${error}`);
    }

    this.logInfo(`Wrote ${bytes_sent} bytes`);
    this.logInfo("Manifesting new firmware");

    if (manifestationTolerant) {
      try {
        const dfu_status = await this.poll_until(
          (state) => state === dfuIDLE || state === dfuMANIFEST_WAIT_RESET
        );
        if (dfu_status.state === dfuMANIFEST_WAIT_RESET) {
          this.logDebug(
            "Device transitioned to MANIFEST_WAIT_RESET even though it is manifestation tolerant"
          );
        }
        if (dfu_status.status !== STATUS_OK) {
          throw new Error(
            `DFU MANIFEST failed state=${dfu_status.state}, status=${dfu_status.status}`
          );
        }
      } catch (error) {
        const errorStr = String(error);
        if (
          errorStr.includes("NotFoundError: Device unavailable") ||
          errorStr.includes("NotFoundError: The device was disconnected")
        ) {
          this.logWarning("Unable to poll final manifestation status");
        } else {
          throw new Error(`Error during DFU manifest: ${error}`);
        }
      }
    } else {
      try {
        const final_status = await this.getStatus();
        this.logDebug(`Final DFU status: state=${final_status.state}, status=${final_status.status}`);
      } catch (error) {
        this.logDebug(`Manifest GET_STATUS poll error: ${error}`);
      }
    }

    // Reset to exit MANIFEST_WAIT_RESET
    // Note: The device often disconnects during reset to apply firmware,
    // causing a "NetworkError" or "NotFoundError". This is expected and normal.
    try {
      await this.device_.reset();
      this.logDebug("Device reset successfully");
    } catch (error) {
      const errorStr = String(error);
      if (
        errorStr.includes("NetworkError") ||
        errorStr.includes("NotFoundError")
      ) {
        // This is normal - the device disconnected to apply the new firmware
        this.logDebug("Device disconnected during reset (expected behavior)");
      } else {
        // Unexpected error type - log it but don't fail the operation
        this.logWarning(`Unexpected reset error (may be normal): ${error}`);
      }
    }
  }
}
