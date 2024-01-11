import Homey, {Driver} from 'homey';
import PairSession from "homey/lib/PairSession";
import net from "net";

class NibeSDriver extends Driver {
  async onInit() {
    this.log('Nibe S-Series driver has been initialized');
  }

  async onPair(session: PairSession): Promise<void> {
    session.setHandler('ip_address_entered', async (data) => {
      this.log('onPair: ip_address_entered:', data);
      const ipAddress = data.ipaddress;

      if (!net.isIP(ipAddress)) {
        throw new Error(this.homey.__('pair.valid_ip_address'));
      }

      return {
        name: 'Nibe S-Series',
        data: {
          id: ipAddress,
        },
        settings: {
          address: ipAddress
        }
      };
    });
  };
}

module.exports = NibeSDriver;
