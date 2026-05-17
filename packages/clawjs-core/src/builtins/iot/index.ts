import type { BuiltinFamilyDefinition } from "../_types.ts";

import { IOT_THINGS } from "./iot_things.ts";
import { IOT_DEVICES } from "./iot_devices.ts";
import { SENSOR_READINGS } from "./sensor_readings.ts";
import { DEVICE_COMMANDS } from "./device_commands.ts";

export const IOT_FAMILY: BuiltinFamilyDefinition = {
  name: "iot",
  displayName: "IoT",
  description: "Things, devices, sensor readings, device commands, evidence, approvals, and physical-device gaps.",
  collections: [
    IOT_THINGS,
    IOT_DEVICES,
    SENSOR_READINGS,
    DEVICE_COMMANDS,
  ],
};

export { IOT_THINGS, IOT_DEVICES, SENSOR_READINGS, DEVICE_COMMANDS };
