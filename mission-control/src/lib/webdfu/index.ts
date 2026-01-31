/**
 * WebDFU - Modern ESM TypeScript implementation
 * USB Device Firmware Upgrade (DFU) library for web browsers
 */

// Export everything from dfu
export {
  // Commands
  DETACH,
  DNLOAD,
  UPLOAD,
  GETSTATUS,
  CLRSTATUS,
  GETSTATE,
  ABORT,
  // States
  appIDLE,
  appDETACH,
  dfuIDLE,
  dfuDNLOAD_SYNC,
  dfuDNBUSY,
  dfuDNLOAD_IDLE,
  dfuMANIFEST_SYNC,
  dfuMANIFEST,
  dfuMANIFEST_WAIT_RESET,
  dfuUPLOAD_IDLE,
  dfuERROR,
  // Status
  STATUS_OK,
  // Functions
  findDeviceDfuInterfaces,
  findAllDfuInterfaces,
  parseDeviceDescriptor,
  parseConfigurationDescriptor,
  parseInterfaceDescriptor,
  parseFunctionalDescriptor,
  parseSubDescriptors,
  // Classes
  DfuDevice,
  // Types
  type DfuInterfaceSettings,
  type DfuStatus,
  type DfuProperties,
  type DeviceDescriptor,
  type ConfigurationDescriptor,
  type InterfaceDescriptor,
  type FunctionalDescriptor,
  type GenericDescriptor,
  type Descriptor,
} from "./dfu";

// Export everything from dfuse
export {
  // Commands
  GET_COMMANDS,
  SET_ADDRESS,
  ERASE_SECTOR,
  // Functions
  parseMemoryDescriptor,
  // Classes
  DfuseDevice,
  // Types
  type MemorySegment,
  type MemoryInfo,
} from "./dfuse";
