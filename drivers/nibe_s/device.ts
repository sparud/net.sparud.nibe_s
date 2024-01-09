import {Device, DiscoveryResult} from 'homey';
import net, {SocketConnectOpts, TcpSocketConnectOpts} from 'net';
import modbus, {ModbusTCPClient} from 'jsmodbus';


const socket = new net.Socket();

const Input = "input";
const Output = "output";

enum Dir {
    In,
    Out
}

const priorityMap = Object({
    10: "Off",
    20: "Hot water",
    30: "Heating",
    40: "Pool",
    60: "Cooling"
});

interface Register  {
    address: number;
    name: string;
    direction: Dir;
    scale?: number
    enum?: Record<number, string>
    bool?: boolean;
}

function fromRegisterValue(register: Register, value: number) {
    if (value >= 32768)
        value -= 65536;
    if (register.scale)
        return value / register.scale;
    if (register.enum)
        return register.enum[value];
    if (register.bool)
        return value === 1;
    return value;
}

function toRegisterValue(register: Register, value: any) {
    if (value < 0)
        value += 65536;
    if (register.scale)
        return Math.round(value * register.scale);
    if (register.enum)
        return parseInt(Object.entries(register.enum).filter(pair => pair[1] == value)[0][0]);
    if (register.bool)
        return value ? 1 : 0;
    return value;
}

const poolStartTemperature: Register =
    {address: 687, name: "target_temperature.pool_start", scale: 10, direction: Dir.Out};
const poolStopTemperature: Register =
    {address: 689, name: "target_temperature.pool_stop", scale: 10, direction: Dir.Out};
const poolActivation: Register =
    {address: 691, name: "onoff.pool_active", bool: true, direction: Dir.Out}

const registers: Register[] = [
    {address:    1, name: "measure_temperature.outside",           direction: Dir.In,  scale: 10},
    {address:   37, name: "measure_temperature.outside_avg",       direction: Dir.In,  scale: 10},
    {address:   10, name: "measure_temperature.source_in",         direction: Dir.In,  scale: 10},
    {address:   11, name: "measure_temperature.source_out",        direction: Dir.In,  scale: 10},
    {address:    5, name: "measure_temperature.heating_supply",    direction: Dir.In,  scale: 10},
    {address:    7, name: "measure_temperature.heating_return",    direction: Dir.In,  scale: 10},
    {address:   11, name: "degree_minutes",                        direction: Dir.Out, scale: 10},
    {address:    9, name: "measure_temperature.hot_water",         direction: Dir.In,  scale: 10},
    {address: 1017, name: "measure_temperature.calculated_supply", direction: Dir.In,  scale: 10},
    {address: 1102, name: "measure_percentage.heating_pump",       direction: Dir.In},
    {address: 1104, name: "measure_percentage.source_pump",        direction: Dir.In},
    {address: 1028, name: "measure_string.priority",               direction: Dir.In,  enum: priorityMap },
    {address: 1047, name: "measure_temperature.inverter",          direction: Dir.In,  scale: 10}, //
    {address: 2166, name: "measure_power",                         direction: Dir.In},
    {address:   26, name: "measure_temperature.room_1",            direction: Dir.In, scale: 10}, //
    {address: 1083, name: "meter_count.compressor_starts",         direction: Dir.In,  scale: 1}, //
    {address: 1048, name: "meter_power.used_compressor",           direction: Dir.In,  scale: 1}, //
    {address:   40, name: "measure_water.flow_bf1",                direction: Dir.In,  scale: 10}, //
    {address: 1087, name: "speaker_duration.compressor_total",     direction: Dir.In,  scale: 1}, //
    {address: 1091, name: "speaker_duration.compressor_total_hotwater", direction: Dir.In,  scale: 1}, //
    {address: 1025, name: "speaker_duration.additive",             direction: Dir.In,  scale: 10}, //
    {address: 1027, name: "meter_power.internal_additive",         direction: Dir.In,  scale: 100}, //
    {address: 1069, name: "speaker_duration.aditive_hotwater",     direction: Dir.In,  scale: 10}, //
    {address: 1029, name: "meter_count.additive_heat_steps",       direction: Dir.In,  scale: 1}, //
    {address: 1046, name: "measure_frequency.compressor",          direction: Dir.In,  scale: 10}, //
    {address:    8, name: "measure_temperature.warmwater_top_bt7", direction: Dir.In,  scale: 10}, //
    {address:   19, name: "measure_temperature.return_air_az10_bt20", direction: Dir.In,  scale: 10}, //
    {address:   20, name: "measure_temperature.supply_air_az10_bt21", direction: Dir.In,  scale: 10}, //
    {address: 2283, name: "meter_power.prod_heat_current_hour",    direction: Dir.In,  scale: 100},
    {address: 2285, name: "meter_power.prod_water_current_hour",   direction: Dir.In,  scale: 100},
    {address: 2287, name: "meter_power.prod_pool_current_hour",    direction: Dir.In,  scale: 100},
    //{address: 2289, name: "meter_power.prod_cool_current_hour",    direction: Dir.In,  scale: 100},
    {address: 2291, name: "meter_power.used_heat_current_hour",    direction: Dir.In,  scale: 100},
    {address: 2293, name: "meter_power.used_water_current_hour",   direction: Dir.In,  scale: 100},
    {address: 2295, name: "meter_power.used_pool_current_hour",    direction: Dir.In,  scale: 100},
    //{address: 2297, name: "meter_power.used_cool_current_hour",    direction: Dir.In,  scale: 100},
    {address: 2299, name: "meter_power.extra_heat_current_hour",   direction: Dir.In,  scale: 100},
    {address: 2301, name: "meter_power.extra_water_current_hour",  direction: Dir.In,  scale: 100},
    {address: 2303, name: "meter_power.extra_pool_current_hour",   direction: Dir.In,  scale: 100},
    {address:   27, name: "measure_temperature.pool",              direction: Dir.In,  scale: 10},
    {address: 1828, name: "onoff.pool_circulation",                direction: Dir.In,  bool: true},
    poolStartTemperature,
    poolStopTemperature,
    poolActivation
];

class NibeSDevice extends Device {
    private pollInterval: NodeJS.Timeout | null = null;
    private client: ModbusTCPClient | null = null;

    private async readRegister(register: Register) {
        if (register.direction === Dir.In)
            return await this.client!.readInputRegisters(register.address, 1);
        else
            return await this.client!.readHoldingRegisters(register.address, 1);
    }

    private async readRegisters() {
        return await Promise.all(registers.map((register) =>
            this.readRegister(register).then((resp: any) => {
                return fromRegisterValue(register, resp.response.body.values[0])}
            ).catch((reason: any) => {
                return undefined;
            })));
    }

    private async writeRegister(register: Register, value: any) {
        await this.client!.writeSingleRegister(register.address, toRegisterValue(register, value))
            .then(result => {
                this.log(JSON.stringify(result));
            }).catch((reason: any) => {
                this.log("Error writing to register", reason);
            });
    }

    onDiscoveryResult(discoveryResult: DiscoveryResult) {
        // Return a truthy value here if the discovery result matches your device.
        return discoveryResult.id === this.getData().id;
    }
    async onDiscoveryAvailable(discoveryResult: DiscoveryResult) {
        // This method will be executed once when the device has been found (onDiscoveryResult returned true)
        this.setAvailable();
        this.log(discoveryResult);
        this.setSettings({
          //address: discoveryResult.address,
        });
    }

    onDiscoveryAddressChanged(discoveryResult: DiscoveryResult) {
        // Update your connection details here, reconnect when the device is offline
        this.log('in onDiscoAddrChange, IP =', this.getSettings().address);
        this.log(discoveryResult);
        this.setSettings({
          //address: discoveryResult.address,
        });
    }

    onDiscoveryLastSeenChanged(discoveryResult: DiscoveryResult) {
        // When the device is offline, try to reconnect here
        this.log(discoveryResult);
        this.setSettings({
          //address: discoveryResult.address,
        });
    }

    async registerRegisterCapabilityListener(register: Register) {
        this.registerCapabilityListener(register.name, async (value) => {
            await this.writeRegister(register, value);
        });
    }

    async onInit() {
        this.log('NibeSDevice has been initialized');

        await Promise.all(registers.map(async (register: Register) => {
            if (!this.hasCapability(register.name)) {
                await this.addCapability(register.name);
            }
        }));

        await this.registerRegisterCapabilityListener(poolStartTemperature);
        await this.registerRegisterCapabilityListener(poolStopTemperature);
        await this.registerRegisterCapabilityListener(poolActivation);

        // Action flow cards
        this.homey.flow.getActionCard('pool_activate').registerRunListener(async (args, state) => {
            await this.writeRegister(poolActivation, true);
        });

        this.homey.flow.getActionCard('pool_deactivate').registerRunListener(async (args, state) => {
            await this.writeRegister(poolActivation, false);
        });

        this.client = new ModbusTCPClient(socket, 1, 5000);
        socket.connect({port: 502, host: this.getSettings().address});
        socket.on('connect', () => {
            // Start the polling interval
            this.pollInterval = setInterval(() => {
                this.readRegisters().then((results: any) => {
                    this.log(`Got ${registers.length} results`);
                    for (let i = 0; i < registers.length; ++i)
                        if (results[i] !== undefined)
                            this.setCapabilityValue(registers[i].name, results[i])
                }).catch((error) => {
                    this.log(error);
                    socket.end();
                    this.setUnavailable();
                })
                // Close the polling interval
            }, 15000);
            this.setAvailable();
        });

        // Failure handling
        socket.on('error', (error) => {
            this.log(error);
            if (!socket.closed)
                socket.end();
            this.setUnavailable();
        })

        // Close socket and retry
        socket.on('close', () => {
            this.log('Socket closed, retrying in 30 seconds ...');

            // check if host changed
            clearInterval(this.pollInterval!);

            setTimeout(() => {
                socket.connect({port: 502, host: this.getSettings().address});
                this.log('Reconnecting now ...');
            }, 30000);
        });
    }

    async onAdded() {
        this.log('MyDevice has been added');
        clearInterval(this.pollInterval!);
    }

    async onSettings({oldSettings, newSettings, changedKeys}: {
        oldSettings: { [key: string]: boolean | string | number | undefined | null };
        newSettings: { [key: string]: boolean | string | number | undefined | null };
        changedKeys: string[];
    }): Promise<string | void> {
        this.log('Nibe S-series settings were changed');
    }

    async onDeleted() {
        this.log('Nibe S-series device has been deleted');
        clearInterval(this.pollInterval!);
    }

}

module.exports = NibeSDevice;

