import {Device, DiscoveryResult} from 'homey';
import net, {SocketConnectOpts, TcpSocketConnectOpts} from 'net';
import modbus, {ModbusTCPClient} from 'jsmodbus';
import {capabilities, capabilitiesOptions} from './driver.compose.json';
import {triggers, conditions, actions} from './driver.flow.compose.json';
import fs from 'fs'

const socket = new net.Socket();

const Input = "input";
const Output = "output";

enum Dir {
    In,
    Out
}

const returnairMap = Object({
    0: "Normal",
    1: "Speed 1",
    2: "Speed 2",
    3: "Speed 3",
    4: "Speed 4"
});

const priorityMap = Object({
    10: "Off",
    20: "Hot water",
    30: "Heating",
    40: "Pool",
    60: "Cooling"
});

const hotwaterMap = Object({
    0: "Small",
    1: "Medium",
    2: "Large",
    4: "Smart control"
});

const onetimeincreaseMap = Object({
    0: "Off",
    2: "One-time increase 1h",
    3: "One-time increase 3h",
    6: "One-time increase 6h",
    12: "One-time increase 12h",
    24: "One-time increase 24h",
    48: "One-time increase 48h"
});

const booleanMap = Object({
    0: "Off",
    1: "On"
});

const modeMap = Object({
    0: "Auto",
    1: "Manual",
    2: "Additional heat only"
});

interface Register  {
    address: number;
    name: string;
    direction: Dir;
    scale?: number
    enum?: Record<number, string>
    bool?: boolean;
    picker?: boolean;
    noAction?: boolean;
    min?: number;
    max?: number;
}

const registers: Register[] = [
    // Rad 1 Temp
    {address:    1, name: "measure_temperature_NIBE.i1_outside",              direction: Dir.In,  scale:  10}, // Aktuell utetemperatur (BT1)
    {address:   26, name: "measure_temperature_NIBE.i26_inside",              direction: Dir.In,  scale:  10}, // Rumsensor 1 ionomhus
    // Rad 2 Framledning
    {address: 1017, name: "measure_temperature_NIBE.i1017_calculated_supply", direction: Dir.In,  scale:  10}, // Beräknad framledning klimatsystem 1
    {address:    5, name: "measure_temperature_NIBE.i5_heating_supply",       direction: Dir.In,  scale:  10}, // Framledning (BT2) klimatsystem 1
    // Rad 3
    {address:   11, name: "measure_degree_minutes_NIBE.h11_degree_minutes",   direction: Dir.Out, scale:  10, noAction: true}, // Gradminuter
    {address:    7, name: "measure_temperature_NIBE.i7_heating_return",       direction: Dir.In,  scale:  10}, // Returledning (BT3)
    // Rad 4
    {address: 1102, name: "measure_percentage_NIBE.i1102_heating_pump",       direction: Dir.In,  scale:   1}, // Värmebärarpumphastighet (GP1)
    {address: 1104, name: "measure_percentage_NIBE.i1104_source_pump",        direction: Dir.In,  scale:   1}, // Köldbärarpumphastighet (GP2)
    // Rad 5
    {address:   10, name: "measure_temperature_NIBE.i10_source_in",           direction: Dir.In,  scale:  10}, // Köldbärare in (BT10)
    {address:   11, name: "measure_temperature_NIBE.i11_source_out",          direction: Dir.In,  scale:  10}, // Köldbärare ut (BT11)
    // Rad 6
    {address: 1028, name: "measure_enum_NIBE.i1028_priority",                 direction: Dir.In,  enum: priorityMap}, // Prio
    {address:   40, name: "measure_water_NIBE.i40_flow_sensor",               direction: Dir.In,  scale:  10}, // Flödesgivare (BF1)
    // Rad 7
    {address: 1048, name: "measure_power_NIBE.i1048_compressor_add_power",    direction: Dir.In,  scale:   1}, // Kompressor tillförd effekt
    {address: 2166, name: "measure_power_NIBE.i2166_energy_usage",            direction: Dir.In,  scale:   1}, // Momentan använd effekt
    // Rad 8
    {address: 1047, name: "measure_temperature_NIBE.i1047_inverter",          direction: Dir.In,  scale:  10}, // Invertertemperatur
    {address: 1046, name: "measure_frequency_NIBE.i1046_compressor",          direction: Dir.In,  scale:  10}, // Kompressorfrekvens, aktuell
    // Rad 9
    {address:    8, name: "measure_temperature_NIBE.i8_warmwater_top",        direction: Dir.In,  scale:  10}, // Varmvatten topp (BT7)
    {address:    9, name: "measure_temperature_NIBE.i9_hot_water",            direction: Dir.In,  scale:  10}, // Varmvatten laddning (BT6)
    // Rad 10 Frånluft
    {address:   19, name: "measure_temperature_NIBE.i19_return_air",          direction: Dir.In,  scale:  10}, // Frånluft (AZ10-BT20)
    {address:   20, name: "measure_temperature_NIBE.i20_supply_air",          direction: Dir.In,  scale:  10}, // Avluft (AZ10-BT21)
    // Rad 11 Frånluft status
    {address:  109, name: "measure_percentage_NIBE.h109_returnair_normal",    direction: Dir.Out, scale:   1, min: 0, max: 100}, // Frånluft fläkthastighet normal
    {address: 1037, name: "measure_enum_NIBE.i1037_return_fan_step",          direction: Dir.In,  enum: returnairMap}, // Fläktläge 1 0-Normal Övrigt 1-4
    // Rad 12 Eltillsats
    {address: 1029, name: "measure_count_NIBE.i1029_additive_heat_steps",     direction: Dir.In,  scale:   1}, // Driftläge intern tillsats
    {address: 1027, name: "meter_power_NIBE.i1027_additive_effect",           direction: Dir.In,  scale: 100}, // Effekt intern tillsats
    // Rad 13 Eltillsats statistik
    {address: 1025, name: "measure_hour_NIBE.i1025_additive_usage_total",     direction: Dir.In,  scale:  10}, // Total drifttid tillsats
    {address: 1069, name: "measure_hour_NIBE.i1069_additive_usage_hotwater",  direction: Dir.In,  scale:  10}, // Total varmvatten drifttid tillsats
    // Rad 14 Kompressor utomhus temp avg
    {address: 1083, name: "measure_count_NIBE.i1083_compressor_starts",       direction: Dir.In,  scale:   1}, // Kompressorstarter
    {address:   37, name: "measure_temperature_NIBE.i37_outside_avg",         direction: Dir.In,  scale:  10}, // BT1 - Average outside temperature -Medeltemperatur (BT1)
    // Rad 15 Kompressor statistik
    {address: 1087, name: "measure_hour_NIBE.i1087_compressor_usage_total",   direction: Dir.In,  scale:   1}, // Total drifttid kompressor
    {address: 1091, name: "measure_hour_NIBE.i1091_compressor_usage_hotwater",direction: Dir.In,  scale:   1}, // Total drifttid kompressor varmvatten
    // Rad 16 Värmekurvor
    {address:   26, name: "measure_count_NIBE.h26_heat_curve",                direction: Dir.Out, scale:   1, min: 0, max: 10}, // Värmekurva klimatsystem 1
    {address:   30, name: "measure_count_NIBE.h30_heat_curve_displacement",   direction: Dir.Out, scale:   1, min: -10, max: 10}, // Värmeförskjutning klimatsystem 1 RW
    // Rad 17 Varmvatten
    {address:   56, name: "measure_enum_NIBE.h56_hotwater_demand_mode",       direction: Dir.Out, enum: hotwaterMap}, // Varmvatten behovsläge RW
    {address:  697, name: "measure_enum_NIBE.h697_onetimeincrease_hotwater",  direction: Dir.Out,  enum: onetimeincreaseMap}, // Mer varmvatten engångshöjning 
    // Rad 18 Periodisk varmvatten höjning
    {address:   65, name: "measure_enum_NIBE.h65_periodic_hotwater",          direction: Dir.Out,  enum: booleanMap}, // Periodisk varmvatten
    {address:   66, name: "measure_day_NIBE.h66_periodic_hotwater_interval",  direction: Dir.Out,  scale:   1, min: 1, max: 90},  // Periodiskt varmvatten intervall i dagar
    // Rad 19 Periodisk varmvatten höjning fortsättning
    {address:   67, name: "measure_count_NIBE.h67_periodic_hotwater_start",   direction: Dir.Out,  scale:   1, noAction: true},  // Periodiskt varmvatten start klockan ** nu returneras sekunder från 00.00 hur visar man tid??
    {address:   92, name: "measure_minute_NIBE.h92_periodtime_hotwater",      direction: Dir.Out,  scale:   1, min: 0, max: 180},  // Periodtid varmvatten minuter
    // Rad 20 Strömförbrukning
    {address:  103, name: "measure_current_NIBE.h103_fuse",                   direction: Dir.Out,  scale:   1, noAction: true},  // Säkring inkommande
    {address:   50, name: "measure_current_NIBE.i50_sensor",                  direction: Dir.In,   scale:  10},  // Strömavkänare BE1 -L1
    {address:   48, name: "measure_current_NIBE.i48_sensor",                  direction: Dir.In,   scale:  10},  // Strömavkänare BE2 -L2
    {address:   46, name: "measure_current_NIBE.i46_sensor",                  direction: Dir.In,   scale:  10},  // Strömavkänare BE3 -L3
    // Rad 21 Driftläge / pool
    {address: 237, name: "measure_enum_NIBE.h237_operating_mode",             direction: Dir.Out,  enum: modeMap}, // Driftläge
    {address:  27, name: "measure_temperature_NIBE.i27_pool",                 direction: Dir.In,   scale:  10},  // Pooltemperatur
    // Rad 22
    {address:   12, name: "measure_temperature_NIBE.i12_heating_supply",      direction: Dir.In,   scale:  10},  // Framledning BT12 värme och varmvatten
    {address:   13, name: "measure_temperature_NIBE.i13_discharge",           direction: Dir.In,   scale:  10},  // Hetgas BT14
    // Rad 23
    {address:   14, name: "measure_temperature_NIBE.i14_liquid_line",         direction: Dir.In,   scale:  10},  // Vätskeledning BT15
    {address:   16, name: "measure_temperature_NIBE.i16_suction_gas",         direction: Dir.In,   scale:  10},  // Suggas BT17

    // Statistics
    {address: 2283, name: "meter_power_NIBE.i2283_prod_heat_current_hour",    direction: Dir.In,  scale: 100}, // Energilogg - Producerad energi för värme under senaste timmen
    {address: 2285, name: "meter_power_NIBE.i2285_prod_water_current_hour",   direction: Dir.In,  scale: 100}, // Energilogg - Producerad energi för varmvatten under senaste timmen

    {address: 2287, name: "meter_power_NIBE.i2287_prod_pool_current_hour",    direction: Dir.In,  scale: 100}, //
    {address: 2289, name: "meter_power_NIBE.i2289_prod_cool_current_hour",    direction: Dir.In,  scale: 100}, //

    {address: 2291, name: "meter_power_NIBE.i2291_used_heat_current_hour",    direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi för värme under senaste timmen
    {address: 2293, name: "meter_power_NIBE.i2293_used_water_current_hour",   direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi för varmvatten under senaste timmen

    {address: 2295, name: "meter_power_NIBE.i2295_used_pool_current_hour",    direction: Dir.In,  scale: 100}, //Energilogg - Förbrukad energi för pool under senaste timmen
    {address: 2297, name: "meter_power_NIBE.i2297_used_cool_current_hour",    direction: Dir.In,  scale: 100}, //Energilogg - Förbrukad energi för kylning under senaste timmen

    {address: 2299, name: "meter_power_NIBE.i2299_extra_heat_current_hour",   direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi av tillsatsvärmaren för värme under senaste timmen
    {address: 2301, name: "meter_power_NIBE.i2301_extra_water_current_hour",  direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi av tillsatsvärmaren för varmvatten under senaste timmen

    {address: 2303, name: "meter_power_NIBE.i2303_extra_pool_current_hour",   direction: Dir.In,  scale: 100}, //Energilogg - Förbrukad energi av tillsatsvärmaren för pool under senaste timmen

    // Ej på värdedelen av appen

    // Poolvärme inställningar temp
    {address:  687, name: "target_temperature.h687_pool_start",               direction: Dir.Out, scale:  10, min: 10, max: 35}, //
    {address:  689, name: "target_temperature.h689_pool_stop",                direction: Dir.Out, scale:  10, min: 10, max: 35}, //

    // On / Off delar på kortet
    // On / Off Nattsvalka
    {address:  227, name: "onoff.h227_nightchill",                            direction: Dir.Out, bool: true}, // Nattsvalka 1
    // On / Off Periodiskt varmvatten
    {address:   65, name: "onoff.h65_periodic_hotwater",                      direction: Dir.Out, bool: true}, // Periodisk varmvatten

    {address: 1828, name: "onoff.i1828_pool_circulation",                     direction: Dir.In,  bool: true}, // Pool 1 pump status
    {address:  691, name: "onoff.h691_pool_active",                           direction: Dir.Out, bool: true}, //
    
    // Inställning Frånluftshastighet
    {address:  109, name: "target_percentage_NIBE.h109_returnair_normal",     direction: Dir.Out, scale:   1},    // Frånluft fläkthastighet normal
    // Inställning värmekurva
    {address:   26, name: "curve_mode_NIBE.h26_heat_curve",                   direction: Dir.Out, picker: true},  // Värmekurva klimatsystem 1
    {address:   30, name: "curve_displacement_NIBE.h30_heat_curve_displacement", direction: Dir.Out, picker: true},  // Värmeförskjutning klimatsystem 1 RW
    // Inställning varmvatten
    {address:   56, name: "hotwater_demand_NIBE.h56_hotwater_demand_mode",    direction: Dir.Out, picker: true},  // Varmvatten behovsläge RW 0 = small, 1 = medium, 2 = large, 3 = not in use, 4 = Smart control
    {address:  697, name: "hotwater_increase_NIBE.h697_onetimeincrease_hotwater", direction: Dir.Out, picker: true}, // Mer varmvatten engångshöjning 0 = Från, 2 = Engångshöjning, 3 = 3 timmar, 6 = 6 timmar, 12 = 12 timmar, 24 = timmar, 48 = 48 Timmar
        // Inställning Periodiskt varmvatten
    {address:   66, name: "hotwater_periodic_interval_NIBE.h66_periodic_hw_interval", direction: Dir.Out, picker: true},  // Periodiskt varmvatten intervall i dagar
    {address:   92, name: "hotwater_periodtime_NIBE.h92_periodtime_hotwater", direction: Dir.Out, picker: true},   // Periodiskt varmvatten längd i minuter

    {address:  180, name: "onoff.h180_enable_addition",                       direction: Dir.Out, bool: true}, // Tillåt tillsats
    {address:  181, name: "onoff.h181_enable_heating",                        direction: Dir.Out, bool: true}, // Tillåt värme
    {address:  182, name: "onoff.h182_enable_cooling",                        direction: Dir.Out, bool: true} // Tillåt kyla
];

const registerByName =
    Object.fromEntries(registers.map((register: Register) => [register.name, register]));

const actionSpecs: {[name: string]: any} = Object.fromEntries(actions.map((action: any) => [action.id, action]));
const conditionSpecs: {[name: string]: any} = Object.fromEntries(conditions.map((cond: any) => [cond.id, cond]));

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
            return this.homey.__(register.enum[value]) || register.enum[value];
        if (register.picker)
            return ""+ value;
        if (register.bool)
            return value === 1;
        return value;
    }

    private toRegisterValue(register: Register, value: any) {
        if (register.picker)
            value = parseInt(value);
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
        .catch((reason: any) =>
            undefined
        );
    }

    private async readRegisters() {
        return await Promise.all(registers.map((register) =>
            this.readRegister(register))
        );
    }

    private async writeRegister(register: Register, value: any) {
        return await this.client!.writeSingleRegister(register.address, this.toRegisterValue(register, value))
            .then(result => {
                this.log("Wrote", JSON.stringify(result));
                return true;
            }).catch((reason: any) => {
                this.log("Error writing to register", reason);
                return false;
            });
    }

    private setValue(register: Register, value: any) {
        const oldValue = this.getCapabilityValue(register.name);
        this.setCapabilityValue(register.name, value);
        if (oldValue !== value) {
            if (register.bool) {

            }
        }
    }

    private poll() {
        this.log("Polling");
        this.readRegisters().then((results: any) => {
            this.log(`Got ${registers.length} results`);
            for (let i = 0; i < registers.length; ++i)
                if (results[i] !== undefined) {
                    this.setCapabilityValue(registers[i].name, results[i]);
                }
        }).catch((error) => {
            this.log(error);
            socket.end();
            this.setUnavailable();
        });
    }

    private checkConfig() {
        for (let i = 0; i < registers.length; ++i) {
            if (registers[i].name != capabilities[i]) {
                this.log(`Config mismatch: register[${i}](${registers[i].name}) != capabilities[${i}](${capabilities[i]}) `)
            }
            const option: any = (capabilitiesOptions as any)[registers[i].name];
            if (!option) {
                this.log(`No options for ${registers[i].name}`);
            }
        }
    }

    async onInit() {
        this.log('NibeSDevice has been initialized');

        this.checkConfig();

        await Promise.all(registers.map(async (register: Register) => {
            if (!this.hasCapability(register.name))
                await this.addCapability(register.name);
            if (register.direction == Dir.Out) {
                // Write capability value change to device
                this.registerCapabilityListener(register.name, async (value) => {
                    await this.writeRegister(register, value);
                });
                // Flow controls for enums
                if (register.enum && actionSpecs[register.name + ".enum"]) {
                    this.homey.flow.getActionCard(register.name + ".enum")
                        .registerArgumentAutocompleteListener(
                            "mode",
                            async (query, args) =>
                                Object.entries(register.enum as any).map((parts: any) => {
                                    return {
                                        id: parts[1],
                                        name:  this.homey.__(parts[1]) || parts[1]
                                    }
                                }).filter((result: any) => result.name.toLowerCase().includes(query.toLowerCase()))
                        )
                        .registerRunListener(async (args, state) => {""
                            if (await this.writeRegister(register, args.mode.id))
                                this.setCapabilityValue(register.name, args.mode.id);
                        });
                }
            }
            if (register.enum && conditionSpecs[register.name + ".enum"]) {
                this.homey.flow.getConditionCard(register.name + ".enum")
                    .registerArgumentAutocompleteListener(
                        "mode",
                        async (query, args) =>
                            Object.entries(register.enum as any).map((parts: any) => {
                                return {
                                    id: parts[1],
                                    name:  this.homey.__(parts[1]) || parts[1]
                                }
                            }).filter((result: any) => result.name.toLowerCase().includes(query.toLowerCase()))
                    )
                    .registerRunListener(async (args, state) => {
                        return this.getCapabilityValue(register.name) === args.mode.name;
                    });
            }
        }));
        
        // Create an autofill object for a register
        const regToAutofill = (register: Register) => {
            const option: any = (capabilitiesOptions as any)[register.name];
            return {
                id: register.name,
                name: option.title[this.homey.i18n.getLanguage()] || option.title["en"]
            };   
        };
        
        // Flow control for setting values of numeric registers
        this.homey.flow.getActionCard("set_numeric_value")
            .registerArgumentAutocompleteListener(
                "register",
                async (query, args) =>
                    registers
                        .filter((reg) => reg.direction == Dir.Out && reg.scale  && !reg.noAction)
                        .map(regToAutofill)
                        .filter((result: any) => result.name.toLowerCase().includes(query.toLowerCase()))
            )
            .registerRunListener(async (args, state) => {
                const register = registerByName[args.register.id];
                if (args.value < register.min! || args.value > register.max!)
                    throw new Error("The value " + args.value + " is out of range. Value should be between " +
                        register.min + " and " + register.max + ".");
                if (await this.writeRegister(register, args.value)) {
                    const newValue = await this.readRegister(register);
                    if (newValue === args.value)
                        this.setCapabilityValue(register.name, newValue);
                    else
                        throw new Error("Failed setting " + args.value + ", got back value " + newValue);
                } else
                    throw new Error("Could not set value " + args.value);
            });

        // Flow control for enabling boolean registers
        this.homey.flow.getActionCard("enable_feature")
            .registerArgumentAutocompleteListener(
                "register",
                async (query, args) =>
                    registers
                        .filter((reg) => reg.direction == Dir.Out && reg.bool)
                        .map(regToAutofill)
                        .filter((result: any) => result.name.toLowerCase().includes(query.toLowerCase()))
            )
            .registerRunListener(async (args, state) => {
                const register = registerByName[args.register.id];
                if (await this.writeRegister(register, true))
                    this.setCapabilityValue(register.name, await this.readRegister(register));
            });

        // Flow control for disabling boolean registers
        this.homey.flow.getActionCard("disable_feature")
            .registerArgumentAutocompleteListener(
                "register",
                async (query, args) =>
                    registers
                        .filter((reg) => reg.direction == Dir.Out && reg.bool)
                        .map(regToAutofill)
                        .filter((result: any) => result.name.toLowerCase().includes(query.toLowerCase()))
            )
            .registerRunListener(async (args, state) => {
                const register = registerByName[args.register.id];
                if (await this.writeRegister(register, false))
                    this.setCapabilityValue(register.name, await this.readRegister(register));
            });

        // Flow condition for numeric comparisons
        this.homey.flow.getConditionCard("numeric_value_comparison")
            .registerArgumentAutocompleteListener(
                "register",
                async (query, args) =>
                    registers
                        .filter((reg) => reg.scale)
                        .map(regToAutofill)
                        .filter((result: any) => result.name.toLowerCase().includes(query.toLowerCase()))
            )
            .registerRunListener(async (args, state) => {
                const capabilityValue = this.getCapabilityValue(args.register.id);
                return args.comparison === "<" ? capabilityValue < args.value : capabilityValue > args.value;
            });

        this.homey.flow.getConditionCard("feature_enabled")
            .registerArgumentAutocompleteListener(
                "register",
                async (query, args) =>
                    registers
                        .filter((reg) => reg.bool)
                        .map(regToAutofill)
                        .filter((result: any) => result.name.toLowerCase().includes(query.toLowerCase()))
            )
            .registerRunListener(async (args, state) => {
                return this.getCapabilityValue(args.register.id);
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

const a = {"metrics":{"createdAt":"2024-02-17T15:08:45.174Z","startedAt":"2024-02-17T15:08:45.174Z","receivedAt":"2024-02-17T15:08:45.311Z","transferTime":137},"request":{"_id":303,"_protocol":0,"_length":6,"_unitId":1,"_body":{"_fc":6,"_address":30,"_value":11}},"response":{"_id":303,"_protocol":0,"_bodyLength":6,"_unitId":1,"_body":{"_fc":6,"_address":30,"_value":11}}}

const b = {"metrics":{"createdAt":"2024-02-17T15:09:37.338Z","startedAt":"2024-02-17T15:09:37.338Z","receivedAt":"2024-02-17T15:09:37.566Z","transferTime":228},"request":{"_id":530,"_protocol":0,"_length":6,"_unitId":1,"_body":{"_fc":6,"_address":30,"_value":1}},"response":{"_id":530,"_protocol":0,"_bodyLength":6,"_unitId":1,"_body":{"_fc":6,"_address":30,"_value":1}}}