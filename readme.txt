This driver gives access to monitoring and controlling Nibe S-series heaters directly on the local network, not using
the MyUplink cloud connection. Vital current energy, temperature and flow values are collected and shown.
It is also possible to set modes, target temperatures etc. All aspects are exposed as flow properties.

In order to use this driver you need three things:
- A Nibe S-series heater connected to the same local network as your Homey.
- You have enabled MODBUS (the communication protocol used by Nibe) in menu 7.5.9.
- The local IP address of the Nibe to be used in the device installation.

With this driver you can change many values on your Nibe. Remember that the machine and the way it functions
is complicated and make sure that you know what you are doing when changing settings. The author of this driver
provides the app free of charge and can not take responsibility for any problems incurred by such changes.
The changes are the same as can be done in the MyUplink mobile app but one has to be extra careful when automating
control.

If a flow action tries to write a value that is out of range the flow will fail with a descriptive error message.



