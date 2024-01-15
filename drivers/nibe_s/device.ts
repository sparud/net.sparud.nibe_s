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

const registers: Register[] = [
    {address:    1, name: "measure_temperature.outside",              direction: Dir.In,  scale: 10},
    {address:   37, name: "measure_temperature.outside_avg",          direction: Dir.In,  scale: 10},
    {address:   10, name: "measure_temperature.source_in",            direction: Dir.In,  scale: 10},
    {address:   11, name: "measure_temperature.source_out",           direction: Dir.In,  scale: 10},
    {address:    5, name: "measure_temperature.heating_supply",       direction: Dir.In,  scale: 10},
    {address:    7, name: "measure_temperature.heating_return",       direction: Dir.In,  scale: 10},
    {address:   11, name: "degree_minutes",                           direction: Dir.Out, scale: 10},
    {address:    9, name: "measure_temperature.hot_water",            direction: Dir.In,  scale: 10},
    {address: 1017, name: "measure_temperature.calculated_supply",    direction: Dir.In,  scale: 10},
    {address: 1102, name: "measure_percentage.heating_pump",          direction: Dir.In},
    {address: 1104, name: "measure_percentage.source_pump",           direction: Dir.In},
    {address: 1028, name: "select.priority",                          direction: Dir.In,  enum: priorityMap },
    {address:  109, name: "target_percentage.returnair_normal",       direction: Dir.Out, scale:1 },
    {address: 1047, name: "measure_temperature.inverter",             direction: Dir.In,  scale: 10}, //
    {address: 2166, name: "measure_power",                            direction: Dir.In},
    {address:   26, name: "measure_temperature.room_1",               direction: Dir.In, scale: 10}, //
    {address: 1083, name: "meter_count.compressor_starts",            direction: Dir.In,  scale: 1}, //
    {address: 1048, name: "measure_power.compressor_add_power",       direction: Dir.In,  scale: 1}, //
    {address:   40, name: "measure_water.flow_bf1",                   direction: Dir.In,  scale: 10}, //
    {address: 1087, name: "measure_hour.compressor_total",            direction: Dir.In,  scale: 1}, //
    {address: 1091, name: "measure_hour.compressor_total_hotwater",   direction: Dir.In,  scale: 1}, //
    {address: 1025, name: "measure_hour.additive",                    direction: Dir.In,  scale: 10}, //
    {address: 1027, name: "meter_power.internal_additive",            direction: Dir.In,  scale: 100}, //
    {address: 1069, name: "measure_hour.additive_hotwater",           direction: Dir.In,  scale: 10}, //
    {address: 1029, name: "meter_count.additive_heat_steps",          direction: Dir.In,  scale: 1}, //
    {address: 1046, name: "measure_frequency.compressor",             direction: Dir.In,  scale: 10}, //
    {address:    8, name: "measure_temperature.warmwater_top_bt7",    direction: Dir.In,  scale: 10}, //
    {address:   19, name: "measure_temperature.return_air_az10_bt20", direction: Dir.In,  scale: 10}, //
    {address:   20, name: "measure_temperature.supply_air_az10_bt21", direction: Dir.In,  scale: 10}, //
    {address: 2283, name: "meter_power.prod_heat_current_hour",       direction: Dir.In,  scale: 100},
    {address: 2285, name: "meter_power.prod_water_current_hour",      direction: Dir.In,  scale: 100},
    {address: 2287, name: "meter_power.prod_pool_current_hour",       direction: Dir.In,  scale: 100},
    //{address: 2289, name: "meter_power.prod_cool_current_hour",    direction: Dir.In,  scale: 100},
    {address: 2291, name: "meter_power.used_heat_current_hour",       direction: Dir.In,  scale: 100},
    {address: 2293, name: "meter_power.used_water_current_hour",      direction: Dir.In,  scale: 100},
    {address: 2295, name: "meter_power.used_pool_current_hour",       direction: Dir.In,  scale: 100},
    //{address: 2297, name: "meter_power.used_cool_current_hour",    direction: Dir.In,  scale: 100},
    {address: 2299, name: "meter_power.extra_heat_current_hour",      direction: Dir.In,  scale: 100},
    {address: 2301, name: "meter_power.extra_water_current_hour",     direction: Dir.In,  scale: 100},
    {address: 2303, name: "meter_power.extra_pool_current_hour",      direction: Dir.In,  scale: 100},
    {address:   27, name: "measure_temperature.pool",                 direction: Dir.In,  scale: 10},
    {address: 1828, name: "onoff.pool_circulation",                   direction: Dir.In,  bool: true},
    {address: 687, name: "target_temperature.pool_start",             direction: Dir.Out, scale: 10},
    {address: 689, name: "target_temperature.pool_stop",              direction: Dir.Out, scale: 10},
    {address: 691, name: "onoff.pool_active",                         direction: Dir.Out, bool: true}
];

const registerByName=
    Object.fromEntries(registers.map((register: Register) => [register.name, register]));

class NibeSDevice extends Device {
    private pollInterval: NodeJS.Timeout | null = null;
    private retryInterval: NodeJS.Timeout | null = null;
    private client: ModbusTCPClient | null = null;

    private fromRegisterValue(register: Register, value: number) {
        if (value >= 32768)
            value -= 65536;
        if (register.scale)
            return value / register.scale;
        if (register.enum)
            return this.homey.__(register.enum[value]);
        if (register.bool)
            return value === 1;
        return value;
    }

    private toRegisterValue(register: Register, value: any) {
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

    private async readRegister(register: Register) {
        return await ((register.direction === Dir.In)
            ? this.client!.readInputRegisters(register.address, 1)
            : this.client!.readHoldingRegisters(register.address, 1))
        .then((resp) =>
            this.fromRegisterValue(register, resp.response.body.values[0]))
        .catch((reason: any) => {
            return undefined;
        });
    }

    private async readRegisters() {
        return await Promise.all(registers.map((register) =>
            this.readRegister(register))
        );
    }

    private async writeRegister(register: Register, value: any) {
        await this.client!.writeSingleRegister(register.address, this.toRegisterValue(register, value))
            .then(result => {
                this.log(JSON.stringify(result));
            }).catch((reason: any) => {
                this.log("Error writing to register", reason);
            });
    }

    async registerRegisterCapabilityListener(register: Register) {
        this.registerCapabilityListener(register.name, async (value) => {
            await this.writeRegister(register, value);
        });
    }

    private poll() {
        this.log("Polling");
        this.readRegisters().then((results: any) => {
            this.log(`Got ${registers.length} results`);
            for (let i = 0; i < registers.length; ++i)
                if (results[i] !== undefined)
                    this.setCapabilityValue(registers[i].name, results[i])
        }).catch((error) => {
            this.log(error);
            socket.end();
            this.setUnavailable();
        });
    }

    async onInit() {
        this.log('NibeSDevice has been initialized');

        await Promise.all(registers.map(async (register: Register) => {
            if (!this.hasCapability(register.name)) {
                await this.addCapability(register.name);
            }
            if (register.direction == Dir.Out) {
                await this.registerRegisterCapabilityListener(register);
            }
        }));

        // Action flow cards
        this.homey.flow.getActionCard('pool_activate').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["onoff.pool_active"], true);
        });

        this.homey.flow.getActionCard('pool_deactivate').registerRunListener(async (args, state) => {
            this.log("Deactivating pool");
            await this.writeRegister(registerByName["onoff.pool_active"], false);
        });

        this.homey.flow.getActionCard('set_pool_start_temperature').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["target_temperature.pool_start"], args.temp);
        });

        this.homey.flow.getActionCard('set_pool_stop_temperature').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["target_temperature.pool_stop"], args.temp);
        });

        this.homey.flow.getConditionCard('too_low_target').registerRunListener(async (args, state) => {
            return (await this.readRegister(registerByName["target_temperature.pool_start"]) as number) < 20;
        });

        this.client = new ModbusTCPClient(socket, 1, 5000);
        clearInterval(this.pollInterval!);
        this.log("Connecting");
        socket.connect({port: 502, host: this.getSettings().address});

        socket.on('connect', () => {
            this.setAvailable();
            this.log("Connected");
            // Start polling, delay a bit the first time
            setTimeout(() => this.poll(), 200);
            this.pollInterval = setInterval(() => this.poll(), 15000);
        });

        socket.on('error', (error) => {
            this.log(error);
            this.setUnavailable();
        })

        // Close socket and retry
        socket.on('close', () => {
            this.log('Socket closed, retrying in 15 seconds ...');

            clearInterval(this.pollInterval!);

            this.retryInterval = setTimeout(() => {
                socket.connect({port: 502, host: this.getSettings().address});
                this.log('Reconnecting now ...');
            }, 15000);
        });
    }

    async onAdded() {
        this.log('MyDevice has been added');
        clearInterval(this.pollInterval!);
        clearInterval(this.retryInterval!);
    }

    async onDeleted() {
        this.log('Nibe S-series device has been deleted');
        clearInterval(this.pollInterval!);
        clearInterval(this.retryInterval!);
        socket.removeAllListeners();
        socket.end();
    }
}

module.exports = NibeSDevice;

