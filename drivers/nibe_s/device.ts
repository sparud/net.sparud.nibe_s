import {Device, DiscoveryResult} from 'homey';
import net, {SocketConnectOpts, TcpSocketConnectOpts} from 'net';
import modbus, {ModbusTCPClient} from 'jsmodbus';
import {capabilities, capabilitiesOptions} from './driver.compose.json';

const socket = new net.Socket();

const Input = "input";
const Output = "output";

enum Dir {
    In,
    Out
}

const returnAirMap = Object({
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
    3: "Not in use",
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
    2: "Add.heat only"
});

interface Register  {
    address: number;
    name: string;
    direction: Dir;
    scale?: number
    enum?: Record<number, string>
    bool?: boolean;
    picker?: boolean;
    additional_name?: string;
}

const registers: Register[] = [
    // Rad 1 Temp
    {address:    1, name: "2023_measure_temperature.i1_outside",              direction: Dir.In,  scale:  10}, // Aktuell utetemperatur (BT1)
    {address:   26, name: "2023_measure_temperature.i26_inside",              direction: Dir.In,  scale:  10}, // Rumsensor 1 ionomhus
    // Rad 2 Framledning
    {address: 1017, name: "2023_measure_temperature.i1017_calculated_supply", direction: Dir.In,  scale:  10}, // Beräknad framledning klimatsystem 1
    {address:    5, name: "2023_measure_temperature.i5_heating_supply",       direction: Dir.In,  scale:  10}, // Framledning (BT2)
    // Rad 3
    {address:   11, name: "measure_degree_minutes.h11_degree_minutes",        direction: Dir.Out, scale:  10}, // Gradminuter
    {address:    7, name: "2023_measure_temperature.i7_heating_return",       direction: Dir.In,  scale:  10}, // Returledning (BT3)
    // Rad 4
    {address: 1102, name: "measure_percentage.i1102_heating_pump",            direction: Dir.In,  scale:   1}, // Värmebärarpumphastighet (GP1)
    {address: 1104, name: "measure_percentage.i1104_source_pump",             direction: Dir.In,  scale:   1}, // Köldbärarpumphastighet (GP2)
    // Rad 5
    {address:   10, name: "2023_measure_temperature.i10_source_in",           direction: Dir.In,  scale:  10}, // Köldbärare in (BT10)
    {address:   11, name: "2023_measure_temperature.i11_source_out",          direction: Dir.In,  scale:  10}, // Köldbärare ut (BT11)
    // Rad 6
    {address: 1028, name: "measure_enum.i1028_priority",                      direction: Dir.In,  enum: priorityMap}, // Prio
    {address:   40, name: "2023_measure_water.i40_flow_sensor",               direction: Dir.In,  scale:  10}, // Flödesgivare (BF1)
    // Rad 7
    {address: 1048, name: "2023_measure_power.i1048_compressor_add_power",    direction: Dir.In,  scale:   1}, // Kompressor tillförd effekt
    {address: 2166, name: "2023_measure_power.i2166_energy_usage",            direction: Dir.In,  scale:   1}, // Momentan använd effekt
    // Rad 8
    {address: 1047, name: "2023_measure_temperature.i1047_inverter",          direction: Dir.In,  scale:  10}, // Invertertemperatur
    {address: 1046, name: "measure_frequency.i1046_compressor",               direction: Dir.In,  scale:  10}, // Kompressorfrekvens, aktuell
    // Rad 9
    {address:    8, name: "2023_measure_temperature.i8_warmwater_top",        direction: Dir.In,  scale:  10}, // Varmvatten topp (BT7)
    {address:    9, name: "2023_measure_temperature.i9_hot_water",            direction: Dir.In,  scale:  10}, // Varmvatten laddning (BT6)
    // Rad 10 Frånluft
    {address:   19, name: "2023_measure_temperature.i19_return_air",          direction: Dir.In,  scale:  10}, // Frånluft (AZ10-BT20)
    {address:   20, name: "2023_measure_temperature.i20_supply_air",          direction: Dir.In,  scale:  10}, // Avluft (AZ10-BT21)
    // Rad 11 Frånluft status
    {address:  109, name: "measure_percentage.h109_returnair_normal",         direction: Dir.Out, scale:   1},  // Frånluft fläkthastighet normal
    {address: 1037, name: "measure_enum.i1037_return_fan_step",               direction: Dir.In,  enum: returnAirMap }, // Fläktläge 1 0-Normal Övrigt 1-4
    // Rad 12 Eltillsats
    {address: 1029, name: "measure_count.i1029_additive_heat_steps",          direction: Dir.In,  scale:   1}, // Driftläge intern tillsats
    {address: 1027, name: "2023_meter_power.i1027_additive_effect",           direction: Dir.In,  scale: 100}, // Effekt intern tillsats
    // Rad 13 Eltillsats statistik
    {address: 1025, name: "measure_hour.i1025_additive_usage_total",          direction: Dir.In,  scale:  10}, // Total drifttid tillsats
    {address: 1069, name: "measure_hour.i1069_additive_usage_hotwater",       direction: Dir.In,  scale:  10}, // Total varmvatten drifttid tillsats
    // Rad 14 Kompressor utomhus temp avg
    {address: 1083, name: "measure_count.i1083_compressor_starts",            direction: Dir.In,  scale:   1}, // Kompressorstarter
    {address:   37, name: "2023_measure_temperature.i37_outside_avg",         direction: Dir.In,  scale:  10}, // BT1 - Average outside temperature -Medeltemperatur (BT1)
    // Rad 15 Kompressor statistik
    {address: 1087, name: "measure_hour.i1087_compressor_usage_total",        direction: Dir.In,  scale:   1}, // Total drifttid kompressor
    {address: 1091, name: "measure_hour.i1091_compressor_usage_hotwater",     direction: Dir.In,  scale:   1}, // Total drifttid kompressor varmvatten
    // Rad 16 Värmekurvor
    {address:   26, name: "measure_count.h26_heat_curve",                     direction: Dir.Out},  // Värmekurva klimatsystem 1
    {address:   30, name: "measure_count.h30_heat_curve_displacement",        direction: Dir.Out},  // Värmeförskjutning klimatsystem 1 RW
    // Rad 17 Varmvatten
    {address:   56, name: "measure_enum.h56_hotwater_demand_mode",            direction: Dir.Out, enum: hotwaterMap}, // Varmvatten behovsläge RW
        // lägg till för att styra/skriva till registret h56 ** 0 = small, 1 = medium, 2 = large, 3 = not in use, 4 = Smart control
    {address:  697, name: "measure_enum.h697_onetimeincrease_hotwater",       direction: Dir.Out,  enum: onetimeincreaseMap}, // Mer varmvatten engångshöjning 
        // lägg till för att styra/skriva till registret h697 ** 0 = Från, 2 = Engångshöjning, 3 = 3 timmar, 6 = 6 timmar, 12 = 12 timmar, 24 = timmar, 48 = 48 Timma
    // Rad 18 Periodisk varmvatten höjning
    {address:  65, name: "measure_enum.h65_periodic_hotwater",                direction: Dir.Out,  enum: booleanMap}, // Periodisk varmvatten
    {address:  66, name: "measure_day.h66_periodic_hotwater_interval",        direction: Dir.Out,  scale:   1},  // Periodiskt varmvatten intervall i dagar
    // Rad 19 Periodisk varmvatten höjning fortsättning
    {address:  67, name: "measure_count.h67_periodic_hotwater_start",         direction: Dir.Out,  scale:   1},  // Periodiskt varmvatten start klockan ** nu returneras sekunder från 00.00 hur visar man tid??
    {address:  92, name: "measure_minute.h92_periodtime hotwater",            direction: Dir.Out,  scale:   1},  // Periodtid varmvatten minuter
    // Rad 20 Driftläge
    {address: 237, name: "measure_enum.h237_operating_mode",                  direction: Dir.Out,  enum: modeMap}, // Driftläge

    // Statistics
    {address: 2283, name: "meter_power.i2283_prod_heat_current_hour",         direction: Dir.In,  scale: 100}, // Energilogg - Producerad energi för värme under senaste timmen
    {address: 2285, name: "meter_power.i2285_prod_water_current_hour",        direction: Dir.In,  scale: 100}, // Energilogg - Producerad energi för varmvatten under senaste timmen

    {address: 2287, name: "meter_power.i2287_prod_pool_current_hour",         direction: Dir.In,  scale: 100}, //
    {address: 2289, name: "meter_power.i2289_prod_cool_current_hour",         direction: Dir.In,  scale: 100}, //

    {address: 2291, name: "meter_power.i2291_used_heat_current_hour",         direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi för värme under senaste timmen
    {address: 2293, name: "meter_power.i2293_used_water_current_hour",        direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi för varmvatten under senaste timmen

    {address: 2295, name: "meter_power.i2295_used_pool_current_hour",         direction: Dir.In,  scale: 100}, //Energilogg - Förbrukad energi för pool under senaste timmen
    {address: 2297, name: "meter_power.i2297_used_cool_current_hour",         direction: Dir.In,  scale: 100}, //Energilogg - Förbrukad energi för kylning under senaste timmen

    {address: 2299, name: "meter_power.i2299_extra_heat_current_hour",        direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi av tillsatsvärmaren för värme under senaste timmen
    {address: 2301, name: "meter_power.i2301_extra_water_current_hour",       direction: Dir.In,  scale: 100}, // Energilogg - Förbrukad energi av tillsatsvärmaren för varmvatten under senaste timmen

    {address: 2303, name: "meter_power.i2303_extra_pool_current_hour",        direction: Dir.In,  scale: 100}, //Energilogg - Förbrukad energi av tillsatsvärmaren för pool under senaste timmen

    {address:   27, name: "2023_measure_temperature.i27_pool",                direction: Dir.In,  scale:  10}, //
    {address:  237, name: "measure_count.hixx_test",                          direction: Dir.Out,  scale:   1}, // test olika register

    // Ej på värdesdelen av appen

    // Poolvärme inställningar temp
    {address:  687, name: "target_temperature.h687_pool_start",               direction: Dir.Out, scale:  10}, //
    {address:  689, name: "target_temperature.h689_pool_stop",                direction: Dir.Out, scale:  10}, //

    // On / Off delar på kortet
    {address:  227, name: "onoff.h227_nightchill",                            direction: Dir.Out, bool: true}, // Nattsvalka 1
    // On / Off Periodiskt varmvatten
    {address:   65, name: "onoff.h65_periodic_hotwater",                      direction: Dir.Out, bool: true}, // Periodisk varmvatten
    // On / Off delar på kortet
    {address: 1828, name: "onoff.i1828_pool_circulation",                     direction: Dir.In,  bool: true}, // Pool 1 pump status
    {address:  691, name: "onoff.h691_pool_active",                           direction: Dir.Out, bool: true}, //
    // Inställning Frånluftshastighet
    {address:  109, name: "target_percentage.h109_returnair_normal",          direction: Dir.Out, scale:   1},  // Frånluft fläkthastighet normal
    // Inställning värmekurva
    {address:  26, name: "2023_curve_mode.h26_heat_curve",                    direction: Dir.Out, picker: true},  // Värmekurva klimatsystem 1
    {address:  30, name: "2023_curve_displacement.h30_heat_curve_displacement", direction: Dir.Out, picker: true},  // Värmeförskjutning klimatsystem 1 RW
    // Inställning varmvatten
    {address:   56, name: "2023_hotwater_demand.h56_hotwater_demand_mode",    direction: Dir.Out, picker: true}, // Varmvatten behovsläge RW 0 = small, 1 = medium, 2 = large, 3 = not in use, 4 = Smart control
    {address:  697, name: "2023_hotwater_increase.h697_onetimeincrease_hotwater",direction: Dir.Out, picker: true} // Mer varmvatten engångshöjning 0 = Från, 2 = Engångshöjning, 3 = 3 timmar, 6 = 6 timmar, 12 = 12 timmar, 24 = timmar, 48 = 48 Timmar

    // Systeminställningar
    // *** Läggtill h26 Värmekurva klimatsystem 1 0 - 10
    //{address:   26, name: "2023_curve_mode.h26_heat_curve",                   direction: Dir.Out, scale:   1}, // *** Fungerar dåligt visar % vid slider
    // *** Lägg till h30 Värmeförskjutning klimatsystem -5 -- +5
    //{address:   30, name: "2023_curve_displacement.h30_heat_curve_displacement",  direction: Dir.Out, scale:   1}, // *** Fungerar dåligt visar % vid slider
    // *** Lägg till h66 Periodiskt varmvatten intervall i dagar
    // *** Lägg till h67 Periodiskt varmvatten startid
    // *** Lägg till h92 Periodtid varmvatten minuter
];

const registerByName =
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
        await this.client!.writeSingleRegister(register.address, this.toRegisterValue(register, value))
            .then(result => {
                this.log(JSON.stringify(result));
            }).catch((reason: any) => {
                this.log("Error writing to register", reason);
            });
    }

    private poll() {
        this.log("Polling");
        this.readRegisters().then((results: any) => {
            this.log(`Got ${registers.length} results`);
            for (let i = 0; i < registers.length; ++i)
                if (results[i] !== undefined) {
                    this.setCapabilityValue(registers[i].name, results[i]);
                    if (registers[i].additional_name)
                        this.setCapabilityValue(registers[i].additional_name!, results[i]);
                }
        }).catch((error) => {
            this.log(error);
            socket.end();
            this.setUnavailable();
        });
    }

    private checkConfig() {
        for (let i = 0; i < registers.length; ++i) {
            if (registers[i].name != capabilities[i] && (!registers[i].additional_name || registers[i].additional_name! != capabilities[i])) {
                this.log(`Config mismatch: register[${i}](${registers[i].name}) != capabilities[${i}](${capabilities[i]}) `)
            }
            const option: any = (capabilitiesOptions as any)[registers[i].name];
            if (!option) {
                this.log(`No options for ${registers[i].name}`);
            }
            if (registers[i].additional_name) {
                const option: any = (capabilitiesOptions as any)[registers[i].additional_name!];
                if (!option) {
                    this.log(`No options for ${registers[i].additional_name}`);
                }
            }
        }
    }

    async onInit() {
        this.log('NibeSDevice has been initialized');

        this.checkConfig();

        await Promise.all(registers.map(async (register: Register) => {
            if (!this.hasCapability(register.name))
                await this.addCapability(register.name);
            if (register.additional_name && !this.hasCapability(register.additional_name))
                await this.addCapability(register.additional_name);
            if (register.direction == Dir.Out) {
                this.registerCapabilityListener(register.name, async (value) => {
                    await this.writeRegister(register, value);
                });
            }
        }));

        // *** Action flow cards ***

        // Pool aktivering
        this.homey.flow.getActionCard('pool_activate').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["onoff.h691_pool_active"], true);
        });

        this.homey.flow.getActionCard('pool_deactivate').registerRunListener(async (args, state) => {
            this.log("Deactivating pool");
            await this.writeRegister(registerByName["onoff.h691_pool_active"], false);
        });
        // Pool cirkulation
        //this.homey.flow.getActionCard('poolcirculation_activate').registerRunListener(async (args, state) => {
        //    await this.writeRegister(registerByName["onoff.i1828_pool_circulation"], true);
        //});

        //this.homey.flow.getActionCard('poolcirculation_deactivate').registerRunListener(async (args, state) => {
        //    this.log("Deactivating pool");
        //    await this.writeRegister(registerByName["onoff.i1828_pool_circulation"], false);
        //});
        // Nattsvalka
        this.homey.flow.getActionCard('nightchill_activate').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["onoff.h227_nightchill"], true);
        });

        this.homey.flow.getActionCard('nightchill_deactivate').registerRunListener(async (args, state) => {
            this.log("Deactivating nattsvalka");
            await this.writeRegister(registerByName["onoff.h227_nightchill"], false);
        });

        // Sätt pooltemperatur
        this.homey.flow.getActionCard('set_pool_start_temperature').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["target_temperature.h687_pool_start"], args.temp);
        });

        this.homey.flow.getActionCard('set_pool_stop_temperature').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["target_temperature.h689_pool_stop"], args.temp);
        });
        // Sätt frånluftshastighet
        this.homey.flow.getActionCard('set_returnair_normal_speed').registerRunListener(async (args, state) => {
            await this.writeRegister(registerByName["target_percentage.h109_returnair_normal"], args.speed);
        });

        // *** Condition flow cards ***

        // Är nattsvalka aktiv
        this.homey.flow.getConditionCard('nightchill_is_active').registerRunListener(async (args, state) => {
            return (await this.readRegister(registerByName["onoff.h227_nightchill"]) as boolean) ;
        });
        // Är poolcirkulation aktiv
        this.homey.flow.getConditionCard('poolcirculation_is_active').registerRunListener(async (args, state) => {
            return (await this.readRegister(registerByName["onoff.i1828_pool_circulation"]) as boolean) ;
        });
         // Är poolvärme aktiv
         this.homey.flow.getConditionCard('poolheater_is_active').registerRunListener(async (args, state) => {
            return (await this.readRegister(registerByName["onoff.h691_pool_active"]) as boolean) ;
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

