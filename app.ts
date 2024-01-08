import Homey from 'homey';

class MyApp extends Homey.App {

  async onInit() {
    this.log('MyApp has been initialized');
  }

}

module.exports = MyApp;
