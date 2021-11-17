<template>
  <div class="hello">
    <h1>{{ msg }}</h1>
    <p>
      For a guide and recipes on how to configure / customize this project,<br>
      check out the
      <a href="https://cli.vuejs.org" target="_blank" rel="noopener">vue-cli documentation</a>.
    </p>
    <h3>Connect to toio &trade; core cube</h3>
    <br>
    <div v-if="cube.isConnected()">
        <button v-on:click="disconnectWithCube">Disconnect</button>
        <div v-if="cubeIsReady">
            <br>
            <br>
            キューブをふってコマンドを入力します
            <br>
            机の上に置いてキューブをダブルタップすると走り出します
            <br>
            <br>
            ひっくりかえした状態でダブルタップするとコマンドがクリアされます
        </div>
        <div v-else>
            <br>
            <br>
            キューブのランプが光るまでおまちください
        </div>
    </div>
    <div v-else>
        <button v-on:click="connectToCube">Connect</button>
    </div>
  </div>
</template>

<script>
import { coreCube } from '../libs/CoreCube.js';

const sleep = msec => new Promise(resolve => setTimeout(resolve, msec));
const speed = 80;
const lampColor = [
    { r:0x00, g:0x00, b:0x00}, // 0x00
    { r:0x40, g:0x40, b:0x40}, // 0x01
    { r:0xff, g:0x00, b:0x00}, // 0x02
    { r:0x00, g:0xff, b:0x00}, // 0x03
    { r:0x00, g:0x00, b:0xff}, // 0x04
    { r:0xff, g:0xff, b:0x00}, // 0x05
    { r:0x00, g:0xff, b:0xff}, // 0x06
];

export default {
  name: 'HelloWorld',
  data: function () {
      return {
          ready: false,
          cube: new coreCube(),
          currentMotion: {
              flat: NaN,
              tap: NaN,
              doubleTap: NaN,
              posture: NaN,
              shakingLevel: NaN,
          },
          previousPosture: NaN,
          duration: 0,
          actions: [],
      }
  },
  props: {
    msg: String
  },
  created: function() {
      console.log('Hello World!')
      console.log('This is a test program!')
  },
  computed: {
      cubeIsReady: function () {
          return this.ready;
      }
  },
  methods: {
      autoRun: async function () {
          console.log('autoRun start!!', this.actions.length);
          for (const action of this.actions) {
              console.log(action.posture, action.duration);
              switch (action.posture) {
                  case 0x03:
                      // go forward
                      await this.cube.setMotor(speed, speed);
                      await sleep(action.duration * 10);
                      break;
                  case 0x04:
                      // go back
                      await this.cube.setMotor(-1 * speed, -1 * speed);
                      await sleep(action.duration * 10);
                      break;
                  case 0x05:
                      // turn left
                      await this.cube.setMotor(speed / 2, speed);
                      await sleep(action.duration * 10);
                      break;
                  case 0x06:
                      // turn right
                      await this.cube.setMotor(speed, speed / 2);
                      await sleep(action.duration * 10);
                      break;
                  default:
                      break;
              }
          }
          await this.cube.setMotor(0, 0);
          console.log('autoRun end');
      },
      disconnectHandler: async function () {
          await this.cube.setLamp(0, 0, 0);
          console.log('disconnect');
          this.ready = false;
      },
      motionHandler: async function (event) {
          if (event.target.value.getUint8(0) === 0x01) {
              this.currentMotion.flat = event.target.value.getUint8(1);
              this.currentMotion.tap = event.target.value.getUint8(2);
              this.currentMotion.doubleTap = event.target.value.getUint8(3);
              this.currentMotion.posture = event.target.value.getUint8(4);
              this.currentMotion.shakingLevel = event.target.value.getUint8(5);
          }
          console.log(this.previousPosture, this.duration);

          if (this.previousPosture !== this.currentMotion.posture) {
              if (!isNaN(this.previousPosture)) {
                  if (this.duration > 10) {
                      this.actions.push({
                          posture: this.previousPosture,
                          duration: this.duration - 10,
                      });
                      await this.cube.setLamp(0, 0, 0);
                      await sleep(50);
                      console.log('action:', this.actions);
                  }
              }
              this.duration = 0;
              this.previousPosture = this.currentMotion.posture;
              await this.cube.setLamp(
                  lampColor[this.previousPosture].r,
                  lampColor[this.previousPosture].g,
                  lampColor[this.previousPosture].b
              );
          } else {
              this.duration += this.currentMotion.shakingLevel;
          }

          if (this.currentMotion.doubleTap === 0x01) {
              if (this.currentMotion.posture === 0x02) {
                  console.log('clear all actions');
                  await this.cube.setMotor(0, 0);
                  await this.cube.setLamp(0, 0, 0);
                  this.actions = [];
                  await sleep(200);
              } else {
                  console.log('Run!!');
                  await this.autoRun();
              }
          }
      },
      connectToCube: async function () {
          console.log('connect to ble device');
          console.log(this.cube);
          if (!this.cube.isConnected()) {
              await this.cube.connectDevice(this.disconnectHandler);
              if (!this.cube.isConnected()) {
                  console.log('Error:failed to conenct');
              }
              await this.cube.addHandler('motion', this.motionHandler);
              await this.cube.setLamp(0xff, 0xff, 0xff);
              this.ready = true;
          }
      },
      disconnectWithCube: async function () {
          if (this.cube.isConnected()) {
              await this.cube.setLamp(0, 0, 0);
              await this.cube.disconnectDevice(true);
              this.ready = false;
          }
      }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
