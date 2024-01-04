import Homey, {Driver} from 'homey';

class NibeSDriver extends Driver {
  async onInit() {
    this.log('Nibe S-Series driver has been initialized');
  }

  async onPairListDevices() {
    this.log("Pairing");
    return [
      // Example device data, note that `store` is optional
      {
        name: 'Nibe S-Series',
        data: {
          id: 'Nibe S-Series-002',
        },
        settings: {
          address: "192.168.1.204"
        }
      }
    ];
  }

  async xxx() {
    const discoveryStrategy = this.getDiscoveryStrategy();
    const discoveryResults = discoveryStrategy.getDiscoveryResults();
    const devices = Object.values(discoveryResults).map(discoveryResult => {
      return {
        name: (discoveryResult as any).name,
        data: {
          id: discoveryResult.id,
        },
        settings: {
          address: discoveryResult.address,
        }
      };
    });
    this.log(discoveryResults);
    return devices;
  }
}

module.exports = NibeSDriver;
