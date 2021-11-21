// ***********************************************************
// Control toio core cube with web bluetooth

let thisDevice = null;
let thisCharacteristics = null;

export class coreCube {

  constructor(params) {
    this.SERVICE = '10b20100-5b3b-4571-9508-cf3efcd7bbae';
    this.CHARACTERISTIC_LIST = [
      {name: 'position', uuid: '10b20101-5b3b-4571-9508-cf3efcd7bbae'},
      {name: 'motor',    uuid: '10b20102-5b3b-4571-9508-cf3efcd7bbae'},
      {name: 'lamp',     uuid: '10b20103-5b3b-4571-9508-cf3efcd7bbae'},
      {name: 'sound',    uuid: '10b20104-5b3b-4571-9508-cf3efcd7bbae'},
      {name: 'motion',   uuid: '10b20106-5b3b-4571-9508-cf3efcd7bbae'},
      {name: 'button',   uuid: '10b20107-5b3b-4571-9508-cf3efcd7bbae'},
      {name: 'battery',  uuid: '10b20108-5b3b-4571-9508-cf3efcd7bbae'},
    ];
    this._resetParams(params);
  }

  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _resetParams(params) {
    if (params === undefined) {
      params = {
        name: null,
        logger: console.log,
      };
    } else {
      if (params.name === undefined) {
        params.name = null;
      }
      if (params.logger === undefined) {
        params.logger = console.log;
      }
    }
    this.name = params.name;
    this.logger = params.logger;
    this.connecting = false;
    this.busy = false;
    this.moving = false;
    thisDevice = null;
    thisCharacteristics = {};
    this.uuidToChrName = {};
    this.chrNameToUuid = {};
    this.CHARACTERISTIC_LIST.forEach((c) => {
      thisCharacteristics[c.name] = {
        name: c.name,
        chr: null,
        handler: []
      };
      this.uuidToChrName[c.uuid] = c.name;
      this.chrNameToUuid[c.name] = c.uuid;
    });
    this.disconnectHandler = [];
    this.idCounter = 0;
  }

  isConnected() {
    if (thisDevice !== null) {
      return thisDevice.gatt.connected;
    } else {
      return this.connecting;
    }
  }

  isMoving() {
    return this.moving;
  }

  async write(chrName, value) {
    let result = false;
    if (this.isConnected() && !this.busy ) {
      this.busy = true;
      try {
        await thisCharacteristics[chrName].chr.writeValue(value);
        result = true;
      } catch (e) {
        this.logger(`ble write error ${e}`);
        throw e;
      } finally {
        this.busy = false;
      }
    }
    return result;
  }

  async read(chrName) {
    let result = false;
    if (this.isConnected() && !this.busy ) {
      this.busy = true;
      try {
        const readData = thisCharacteristics[chrName].chr.readValue();
        result = readData;
      } catch (e) {
        this.logger(`ble read error ${e}`);
        throw e;
      } finally {
        this.busy = false;
      }
    }
    return result;
  }

  async setLamp(r, g, b) {
    const value = new Uint8Array([0x03, 0, 0x01, 0x01, r, g, b]);
    return this.write('lamp', value);
  }

  async setMotor(l, r) {
    this.logger(`${this.name}: move ${l} ${r}`);
    const direction_l = (l > 0) ? 0x01 : 0x02;
    const direction_r = (r > 0) ? 0x01 : 0x02;
    const speed_l = Math.min(Math.abs(l), 255);
    const speed_r = Math.min(Math.abs(r), 255);
    const value = new Uint8Array([0x01, 0x01, direction_l, speed_l, 0x02, direction_r, speed_r]);
    return this.write('motor', value);
  }

  async move(l, r, duration) {
    this.logger(`${this.name}: move ${l} ${r} ${duration}`);
    const direction_l = (l > 0) ? 0x01 : 0x02;
    const direction_r = (r > 0) ? 0x01 : 0x02;
    const speed_l = Math.min(Math.abs(l), 255);
    const speed_r = Math.min(Math.abs(r), 255);
    const durationUint8 = Math.min(Math.abs(duration), 255);
    const value = new Uint8Array([0x02, 0x01, direction_l, speed_l, 0x02, direction_r, speed_r, durationUint8]);
    return this.write('motor', value);
  }

  async moveTo(x, y, degree, ...[option]) {
    this.logger(`${this.name}: moveTo ${x},${y} ${degree}`, option);
    const force = ('force' in option) ? option.force : false;
    if (force === true) {
      this.logger('force to move');
    } else if (this.moving === true) {
      this.logger('moving now');
      return false;
    }
    this.moving = true;
    const x_l = x & 0xff;
    const x_h = (x >> 8) & 0xff;
    const y_l = y & 0xff;
    const y_h = (y >> 8) & 0xff;
    const degree_l = degree & 0xff;
    const degree_h = (degree >> 8) & 0xff;
    if (option === undefined) {
      option = {};
    }
    const timeout = (('timeout' in option) ? option.timeout : 8) & 0xff;
    const speed = (('speed' in option) ? option.speed : 0x40) & 0xff;
    const movingMode = (('moving' in option) ? option.moving : 0) & 0xff;
    const accelerationMode = (('acceleration' in option) ? option.acceleration : 3) & 0xff;
    const currentCommandId = this.idCounter;
    this.idCounter = (this.idCounter + 1) & 0xff;

    this.logger(`moving options ${movingMode}, ${accelerationMode}`);
    const value = new Uint8Array([0x03, currentCommandId, timeout, movingMode, speed, accelerationMode, 0x00, x_l, x_h, y_l, y_h, degree_l, degree_h]);
    const currentCube = this;
    const motorChr = thisCharacteristics['motor'].chr;

    const resolver = new Promise(function(resolve, reject) {
      let moveToResultHandler = null;
      let moveToResultWatcher = null;

      this.logger('add event handler for motor', currentCommandId);
      const motorResultHandler = (event) => {
        this.logger(`motorResultHandler event received`);
        const commandType = event.target.value.getUint8(0);
        const commandId = event.target.value.getUint8(1);

        // write response of moveTo
        if (commandType === 0x03 && commandId === currentCommandId) {
          this.logger(`moveTo response command(handler) (id:${commandId} ${currentCommandId})`);
          return;
        }

        // remove EventListener and ResultWatcher
        this.logger('remove motor result handler & watcher', currentCommandId);
        motorChr.removeEventListener(
          'characteristicvaluechanged',
          motorResultHandler);
        if (moveToResultWatcher !== null) {
          clearTimeout(moveToResultWatcher);
        }

        if (commandType === 0x83 && commandId === currentCommandId) {
          const commandResult = event.target.value.getUint8(2);
          this.logger(`moveResult ${commandResult}`, currentCommandId);
          if (commandResult === 0x00) {
            currentCube.moving = false;
            this.logger(`moveTo success(handler) ${commandResult} ${commandType} ${commandId}`);
            resolve(currentCube);
          } else {
            currentCube.moving = false;
            this.logger(`moveTo failed(handler) ${commandResult} ${commandType} ${commandId}`);
            reject(commandResult);
          }
        } else {
          this.logger(`unexpected command response(handler) ${commandType.toString(16)} ${commandId} ${currentCommandId}`);
          currentCube.moving = false;
          reject(-1);
        }
      }

      const motorResultWatcher = async () => {
        this.logger('motorResultWatcher', currentCommandId);
        const moveResult = await currentCube.read('motor');
        if (moveResult === false) {
          return;
        }
        const commandType = moveResult.getUint8(0);
        const commandId = moveResult.getUint8(1);

        // write response of moveTo
        if (commandType === 0x03 && commandId === currentCommandId) {
          this.logger(`find moveTo command, set motor result watcher again (id:${commandId} ${currentCommandId})`);
          moveToResultWatcher = setTimeout(motorResultWatcher, (timeout * 100) + 100);
          return;
        }

        // remove EventListener and ResultWatcher
        this.logger('remove motor result handler & watcher', currentCommandId);
        motorChr.removeEventListener(
          'characteristicvaluechanged',
          motorResultHandler);
        if (moveToResultWatcher !== null) {
          clearTimeout(moveToResultWatcher);
        }

        if (commandType === 0x83 && commandId === currentCommandId) {
          const commandResult = moveResult.getUint8(2);
          this.logger(`moveResult ${commandResult}`);
          if (commandResult === 0x00) {
            currentCube.moving = false;
            this.logger(`moveTo success(watcher) ${commandResult} ${commandType} ${commandId}`, currentCommandId);
            resolve(currentCube);
          } else {
            currentCube.moving = false;
            this.logger(`moveTo failed(watcher) ${commandResult} ${commandType} ${commandId}`, currentCommandId);
            reject(commandResult);
          }
        } else {
          this.logger(`unexpected command response(watcher) ${commandType.toString(16)} ${commandId} ${currentCommandId}`);
          currentCube.moving = false;
          reject(-1);
        }
      }

      moveToResultHandler = motorResultHandler;
      this.logger('add motor result handler');
      const enableNotify = motorChr.startNotifications();
      enableNotify.then(() => {
        this.logger('enableNotify', enableNotify);
        motorChr.addEventListener(
          'characteristicvaluechanged',
          moveToResultHandler);

        this.logger('set motor result watcher');
        moveToResultWatcher = setTimeout(motorResultWatcher, (timeout * 100) + 100);
        this.logger('start to move');
        currentCube.write('motor', value).then((result) => {
          this.logger(`moveTo command success ${result}`);
          return;
        }).catch((result) => {
          currentCube.moving = false;
          this.logger(`moveTo command failed ${result}`);
          reject(result);
        });
      }).catch((e) => {
        currentCube.moving = false;
        this.logger('Promise exception handler:', e);
        reject(e);
      });
    });

    this.logger('return resolver (pending)', resolver);
    return resolver;
  }

  async disconnectDevice(force) {
    let result = false;
    if (!thisDevice.gatt.connected) {
      return false;
    }
    if (this.busy) {
      this.logger("Busy: can't disconnect");
      return false;
    }
    try {
      this.busy = true;
      this.logger(thisCharacteristics);
      const stopNotifyChr = this.CHARACTERISTIC_LIST.map((chrList) => {
        const chrName = chrList.name;
        this.logger(`stop notify ${chrName}`);
        return thisCharacteristics[chrName].chr.stopNotifications();
      });

      const disabledNotifyChr = await Promise.allSettled(stopNotifyChr);
      disabledNotifyChr.forEach((chr) => {
        if (chr.status === "fulfilled") {
          const chrName = this.uuidToChrName[chr.value.uuid];
          const registeredHandlers = thisCharacteristics[chrName].handler;
          this.logger(`remove handler ${chrName}`);
          registeredHandlers.forEach((handler) => {
            chr.value.removeEventListener('characteristicvaluechanged', handler);
          });
        } else {
          this.logger('promise rejected:', chr.reason);
        }
      });

      this.logger(`remove disconnectHandler`);
      this.disconnectHandler.forEach((handler) => {
        thisDevice.removeEventListener(
          'gattserverdisconnected',
          handler);
      });
      this.logger(`disconnect`);
      await thisDevice.gatt.disconnect();
      result = true;
    } catch (err) {
      this.logger('disconnectDevice:Error');
      this.logger(err);
      if (force !== undefined && force === true) {
        await thisDevice.gatt.disconnect();
      }
      result = false;
    }
    finally {
      this.busy = false;
    }

    this._resetParams({
      name: this.name,
      logger: this.logger,
    });
    return result;
  }

  async connectDevice(disconnectHandler) {
    let result = false;
    this.logger('***************************************** connect to cube');
    if (this.busy) {
      this.log("Busy: can't connect");
      return false;
    }
    try {
      this.busy = true;
      thisDevice = await navigator.bluetooth
        .requestDevice({
          filters: [{services: [this.SERVICE]}]
        });
      this.connecting = true;
      this.logger('******** add disconnect listener');
      this.disconnectHandler.push(disconnectHandler);
      await thisDevice.addEventListener('gattserverdisconnected', disconnectHandler);
      const server = await thisDevice.gatt.connect();

      const waitToConnect = async (times) => {
        this.logger('wait to connect');
        for (let count = 0; count < times; count++) {
          if (thisDevice.gatt.connected) {
            this.logger('connected: wait counter', count);
            return true;
          }
          await this._sleep(100);
        }
        this.logger('connection timeout');
        return false;
      }

      await waitToConnect(50);

      const service = await server.getPrimaryService(this.SERVICE);
      this.logger(service);
      const characteristicsPromises = this.CHARACTERISTIC_LIST.map((ch) => {
        return service.getCharacteristic(ch.uuid);
      });
      this.logger(characteristicsPromises);
      const characteristics = await Promise.allSettled(characteristicsPromises);
      this.logger('******** get characteristics');
      this.logger(characteristics);

      characteristics.forEach((chr) => {
        if (chr.status === 'fulfilled') {
          console.log(typeof(chr.value));
          console.log(chr.value);
          const chrName = this.uuidToChrName[chr.value.uuid];
          thisCharacteristics[chrName].chr = chr.value, {};
        } else {
          this.logger('promise rejected:', chr.reason);
        }
      });

      this.logger('******** thisCharacteristics');
      this.logger(thisCharacteristics);
      result = true;
    } catch(error) {
      if (thisDevice !== null) {
        await thisDevice.gatt.disconnect();
      }
      this.logger(`ERROR:connectToDevice(): ${error}`);
      this.connecting = false;
      result = false;
    }
    finally {
      this.busy = false;
    }
    return result;
  }

  async addHandler(name, handler) {
    let characteristicNames = Object.keys(thisCharacteristics);
    this.logger(characteristicNames);
    this.logger(`add handler to ${name}`);
    if (!characteristicNames.includes(name)) {
      this.logger(`ERROR:addHandler(): no characteristic ${name}`);
      return false;
    }
    try {
      let characteristic = thisCharacteristics[name];
      this.logger('selected characteristic:', characteristic);
      characteristic.handler.push(handler);
      const chrHandler = characteristic.chr;
      const handlerResult = await chrHandler.startNotifications().then(() => {
        chrHandler.addEventListener(
          'characteristicvaluechanged',
          handler);
        return true;
      }).catch(() => {
        return false;
      });
      this.logger('addEventListenerResult', handlerResult);
      return handlerResult;
    } catch(error) {
      this.logger(`ERROR:addHandler(): ${error}`);
      return false;
    }
  }
}

