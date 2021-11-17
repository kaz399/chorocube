// ***********************************************************
// Control toio core cube with web bluetooth

export class coreCube {

  constructor(name) {
    if (name === undefined) {
      name = null;
    }
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
    this._resetParams(name);
  }

  _resetParams(name) {
    this.name = name
    this.connected = false;
    this.busy = false;
    this.moving = false;
    this.device = null;
    this.characteristics = {};
    this.uuidToChrName = {};
    this.chrNameToUuid = {};
    this.CHARACTERISTIC_LIST.forEach((c) => {
      this.characteristics[c.name] = {
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
    return this.connected;
  }

  isMoving() {
    return this.moving;
  }

  async write(chrName, value) {
    let result = false;
    if (this.connected && !this.busy ) {
      this.busy = true;
      try {
        await this.characteristics[chrName].chr.writeValue(value);
        result = true;
      } catch (e) {
        console.log(`ble write error ${e}`);
        throw e;
      } finally {
        this.busy = false;
      }
    }
    return result;
  }

  async read(chrName) {
    let result = false;
    if (this.connected && !this.busy ) {
      this.busy = true;
      try {
        const readData = this.characteristics[chrName].chr.readValue();
        result = readData;
      } catch (e) {
        console.log(`ble read error ${e}`);
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
    console.log(`${this.name}: move ${l} ${r}`);
    const direction_l = (l > 0) ? 0x01 : 0x02;
    const direction_r = (r > 0) ? 0x01 : 0x02;
    const speed_l = Math.min(Math.abs(l), 255);
    const speed_r = Math.min(Math.abs(r), 255);
    const value = new Uint8Array([0x01, 0x01, direction_l, speed_l, 0x02, direction_r, speed_r]);
    return this.write('motor', value);
  }

  async move(l, r, duration) {
    console.log(`${this.name}: move ${l} ${r} ${duration}`);
    const direction_l = (l > 0) ? 0x01 : 0x02;
    const direction_r = (r > 0) ? 0x01 : 0x02;
    const speed_l = Math.min(Math.abs(l), 255);
    const speed_r = Math.min(Math.abs(r), 255);
    const durationUint8 = Math.min(Math.abs(duration), 255);
    const value = new Uint8Array([0x02, 0x01, direction_l, speed_l, 0x02, direction_r, speed_r, durationUint8]);
    return this.write('motor', value);
  }

  async moveTo(x, y, degree, ...[option]) {
    console.log(`${this.name}: moveTo ${x},${y} ${degree}`, option);
    const force = ('force' in option) ? option.force : false;
    if (force === true) {
      console.log('force to move');
    } else if (this.moving === true) {
      console.log('moving now');
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

    console.log(`moving options ${movingMode}, ${accelerationMode}`);
    const value = new Uint8Array([0x03, currentCommandId, timeout, movingMode, speed, accelerationMode, 0x00, x_l, x_h, y_l, y_h, degree_l, degree_h]);
    const currentCube = this;
    const motorChr = this.characteristics['motor'].chr;

    const resolver = new Promise(function(resolve, reject) {
      let moveToResultHandler = null;
      let moveToResultWatcher = null;

      console.log('add event handler for motor', currentCommandId);
      const motorResultHandler = (event) => {
        console.log(`motorResultHandler event received`);
        const commandType = event.target.value.getUint8(0);
        const commandId = event.target.value.getUint8(1);

        // write response of moveTo
        if (commandType === 0x03 && commandId === currentCommandId) {
          console.log(`moveTo response command(handler) (id:${commandId} ${currentCommandId})`);
          return;
        }

        // remove EventListener and ResultWatcher
        console.log('remove motor result handler & watcher', currentCommandId);
        motorChr.removeEventListener(
          'characteristicvaluechanged',
          motorResultHandler);
        if (moveToResultWatcher !== null) {
          clearTimeout(moveToResultWatcher);
        }

        if (commandType === 0x83 && commandId === currentCommandId) {
          const commandResult = event.target.value.getUint8(2);
          console.log(`moveResult ${commandResult}`, currentCommandId);
          if (commandResult === 0x00) {
            currentCube.moving = false;
            console.log(`moveTo success(handler) ${commandResult} ${commandType} ${commandId}`);
            resolve(currentCube);
          } else {
            currentCube.moving = false;
            console.log(`moveTo failed(handler) ${commandResult} ${commandType} ${commandId}`);
            reject(commandResult);
          }
        } else {
          console.log(`unexpected command response(handler) ${commandType.toString(16)} ${commandId} ${currentCommandId}`);
          currentCube.moving = false;
          reject(-1);
        }
      }

      const motorResultWatcher = async () => {
        console.log('motorResultWatcher', currentCommandId);
        const moveResult = await currentCube.read('motor');
        if (moveResult === false) {
          return;
        }
        const commandType = moveResult.getUint8(0);
        const commandId = moveResult.getUint8(1);

        // write response of moveTo
        if (commandType === 0x03 && commandId === currentCommandId) {
          console.log(`find moveTo command, set motor result watcher again (id:${commandId} ${currentCommandId})`);
          moveToResultWatcher = setTimeout(motorResultWatcher, (timeout * 100) + 100);
          return;
        }

        // remove EventListener and ResultWatcher
        console.log('remove motor result handler & watcher', currentCommandId);
        motorChr.removeEventListener(
          'characteristicvaluechanged',
          motorResultHandler);
        if (moveToResultWatcher !== null) {
          clearTimeout(moveToResultWatcher);
        }

        if (commandType === 0x83 && commandId === currentCommandId) {
          const commandResult = moveResult.getUint8(2);
          console.log(`moveResult ${commandResult}`);
          if (commandResult === 0x00) {
            currentCube.moving = false;
            console.log(`moveTo success(watcher) ${commandResult} ${commandType} ${commandId}`, currentCommandId);
            resolve(currentCube);
          } else {
            currentCube.moving = false;
            console.log(`moveTo failed(watcher) ${commandResult} ${commandType} ${commandId}`, currentCommandId);
            reject(commandResult);
          }
        } else {
          console.log(`unexpected command response(watcher) ${commandType.toString(16)} ${commandId} ${currentCommandId}`);
          currentCube.moving = false;
          reject(-1);
        }
      }


      moveToResultHandler = motorResultHandler;
      console.log('add motor result handler');
      const enableNotify = motorChr.startNotifications();
      enableNotify.then(() => {
        console.log('enableNotify (fullfilled)', enableNotify);
        motorChr.addEventListener(
          'characteristicvaluechanged',
          moveToResultHandler);

        console.log('set motor result watcher');
        moveToResultWatcher = setTimeout(motorResultWatcher, (timeout * 100) + 100);
        console.log('start to move');
        currentCube.write('motor', value).then((result) => {
          console.log(`moveTo command success ${result}`);
          return;
        }).catch((result) => {
          currentCube.moving = false;
          console.log(`moveTo command failed ${result}`);
          reject(result);
        });
      }).catch((e) => {
        currentCube.moving = false;
        console.log('Promise exception handler:', e);
        reject(e);
      });
    });

    console.log('return resolver (pending)', resolver);
    return resolver;
  }

  async disconnectDevice(force) {
    let result = false;
    if (!this.device.gatt.connected) {
      return false;
    }
    try {
      console.log(this.characteristics);
      const stopNotifiyChr = this.CHARACTERISTIC_LIST.map((chrList) => {
        const chrName = chrList.name;
        console.log(`stop notify ${chrName}`);
        return this.characteristics[chrName].chr.stopNotifications();
      });

      const disabledNotifyChr = await Promise.all(stopNotifiyChr);
      disabledNotifyChr.forEach((chr) => {
        const chrName = this.uuidToChrName[chr.uuid];
        const registeredHandlers = this.characteristics[chrName].handler;
        console.log(`remove handler ${chrName}`);
        registeredHandlers.forEach((handler) => {
          chr.removeEventListener('characteristicvaluechanged', handler);
        });
      });

      console.log(`remove disconnectHandler`);
      this.disconnectHandler.forEach((handler) => {
        this.device.removeEventListener(
          'gattserverdisconnected',
          handler);
      });
      console.log(`disconnect`);
      await this.device.gatt.disconnect();
      result = true;
    } catch (err) {
      console.log('disconnectDevice:Error');
      console.log(err);
      if (force !== undefined && force === true) {
        await this.device.gatt.disconnect();
      }
      result = false;
    }

    this._resetParams();
    return result;
  }

  async connectDevice(disconnectHandler) {
    let result = false;
    console.log('***************************************** connect to cube');
    try {
      const device = await navigator.bluetooth
        .requestDevice({
          filters: [{services: [this.SERVICE]}]
        });
      this.device = device;
      this.connected = true;
      console.log('******** add disconnect lisner');
      this.disconnectHandler.push(disconnectHandler);
      await device.addEventListener('gattserverdisconnected', disconnectHandler);
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(this.SERVICE);
      const characteristicsPromises = this.CHARACTERISTIC_LIST.map((ch) => {
        return service.getCharacteristic(ch.uuid);
      });
      const characteristics = await Promise.all(characteristicsPromises);
      console.log(characteristics);

      characteristics.forEach((ch) => {
        const chrName = this.uuidToChrName[ch.uuid];
        this.characteristics[chrName].chr = ch;
      });

      console.log(this.characteristics);
      result = true;
    } catch(error) {
      console.log(`ERROR:connectToDevice(): ${error}`);
      result = false;
    }
    return result;
  }

  async addHandler(name, handler) {
    console.log(this.characteristics);
    if (!(name in this.characteristics)) {
      console.log(`ERROR:addHandler(): no characteristic ${name}`);
      return false;
    }
    try {
      let characteristic = this.characteristics[name];
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
      console.log('addEventListenerResult', handlerResult);
      return handlerResult;
    } catch(error) {
      console.log(`ERROR:addHandler(): ${error}`);
      return false;
    }
  }
}

