<template>
  <div class="hello">
    <h1>{{ msg }}</h1>
    試作その3
    <p>
      Vue + web bluetooth による
      <br />
      toio &trade; core cube 制御サンプルプログラム<br />
    </p>
    <h3>toio &trade; core cube と接続</h3>
    <br />
    <div v-if="cube.isConnected()">
      <button v-on:click="disconnectWithCube">せ つ だ ん</button>
      <div v-if="cubeIsReady">
        <br />
        <br />
        キューブをふってコマンドを入力します
        <br />
        <br />
        キューブを机の上に置くと走り出します
      </div>
      <div v-else>
        <br />
        <br />
        【接続中】キューブのランプが光るまでおまちください
      </div>
    </div>
    <div v-else>
      <button v-on:click="connectToCube">せ つ ぞ く</button>
    </div>
    <div v-if="debugMode">
      <h3>デバッグ情報</h3>
      <div>
        <textarea readonly v-model="logMessages"></textarea>
      </div>
    </div>
  </div>
</template>

<script>
import { coreCube } from "../libs/CoreCube.js";

const sleep = (msec) => new Promise((resolve) => setTimeout(resolve, msec));
const lampColor = [
  { r: 0x00, g: 0x00, b: 0x00 }, // 0x00
  { r: 0x10, g: 0x10, b: 0x10 }, // 0x01
  { r: 0xff, g: 0x00, b: 0x00 }, // 0x02
  { r: 0x00, g: 0xff, b: 0x00 }, // 0x03
  { r: 0x00, g: 0x00, b: 0xff }, // 0x04
  { r: 0xff, g: 0xff, b: 0x00 }, // 0x05
  { r: 0x00, g: 0xff, b: 0xff }, // 0x06
];

export default {
  name: "HelloWorld",
  data: function () {
    return {
      ready: false,
      cube: new coreCube("cube1"),
      currentMotion: {
        flat: NaN,
        tap: NaN,
        doubleTap: NaN,
        posture: NaN,
        shakingLevel: NaN,
      },
      previousMotion: {
        flat: NaN,
        tap: NaN,
        doubleTap: NaN,
        posture: NaN,
        shakingLevel: NaN,
      },
      motionEventNumber: 0,
      duration: 0,
      actions: [],
      running: false,
      timeoutEvent: null,
      logMessages: "",
    };
  },
  props: {
    msg: String,
    debugMode: Boolean,
  },
  computed: {
    cubeIsReady: function () {
      return this.ready;
    },
    getLog: function () {
      return this.logMessages;
    },
  },
  created: function () {
    console.log("Hello World!");
    console.log("This is a test program!");
    this.logMessages = "";
  },
  beforeUnmount: async function () {
    if (this.cube.isConnected()) {
      console.log("force to disconnect with cube");
      await this.cube.disconnectDevice(true);
    }
    console.log("Bye!");
  },
  methods: {
    debugLog: function (msg) {
      console.log(msg);
      this.logMessages += "\n" + msg;
    },
    autoRun: async function () {
      this.running = true;
      console.log("autoRun start!!", this.actions.length);
      for (const action of this.actions) {
        switch (action.posture) {
          case 0x01:
          case 0x03:
            // go forward
            await this.cube.setMotor(action.speed, action.speed);
            await sleep(action.duration);
            break;
          case 0x02:
          case 0x04:
            // go back
            await this.cube.setMotor(-1 * action.speed, -1 * action.speed);
            await sleep(action.duration);
            break;
          case 0x05:
            // turn left
            await this.cube.setMotor(action.speed / 2, action.speed);
            await sleep(action.duration);
            break;
          case 0x06:
            // turn right
            await this.cube.setMotor(action.speed, action.speed / 2);
            await sleep(action.duration);
            break;
          default:
            break;
        }
      }
      this.actions = []
      await this.cube.setMotor(0, 0);
      console.log("autoRun end");
      this.running = false;
    },

    disconnectHandler: async function () {
      await this.cube.setLamp(0, 0, 0);
      console.log("disconnect");
      this.ready = false;
    },
    motionHandler: async function (event) {
      if (event.target.value.getUint8(0) === 0x01) {
        this.motionEventNumber += 1;
        this.previousMotion = { ...this.currentMotion };

        this.currentMotion.flat = event.target.value.getUint8(1);
        this.currentMotion.tap = event.target.value.getUint8(2);
        this.currentMotion.doubleTap = event.target.value.getUint8(3);
        this.currentMotion.posture = event.target.value.getUint8(4);
        this.currentMotion.shakingLevel = event.target.value.getUint8(5);
      }
      console.log(
        "motion data:",
        this.previousMotion.posture,
        this.previousMotion.shakingLevel,
        this.currentMotion.shakingLevel,
        this.actions.length
      );

      if (this.currentMotion.shakingLevel) {
        if (this.timeoutEvent !== null) {
          console.log('clear timeout');
          clearTimeout(this.timeoutEvent);
          this.timeoutEvent = null;
        }
        this.actions.push({
          posture: this.currentMotion.posture,
          duration: this.currentMotion.shakingLevel * 5,
          speed: (this.currentMotion.shakingLevel * 10) + 50,
        });
      }

      if (this.currentMotion.posture != this.previousMotion.posture) {
        let posture = this.currentMotion.posture;
        await this.cube.setLamp(
          lampColor[posture].r,
          lampColor[posture].g,
          lampColor[posture].b
        );
      }

      const runAfterStatic = (currentEventNumver, cb) => {
        if (currentEventNumver === this.motionEventNumber) {
          console.log("run callback", currentEventNumver);
          cb();
        } else {
          console.log(
            "runAfterStatic:",
            currentEventNumver,
            this.motionEventNumber
          );
        }
      };

      if (
        this.currentMotion.doubleTap === 0x01 &&
        this.currentMotion.posture === 0x02
      ) {
        console.log("clear all actions");
        this.actions = [];
        await this.cube.setMotor(0, 0);
        await this.cube.setLamp(0, 0, 0);
        await sleep(200);
        await this.cube.setLamp(
          lampColor[this.previousPosture].r,
          lampColor[this.previousPosture].g,
          lampColor[this.previousPosture].b
        );
      }

      if (
        this.timeoutEvent === null &&
        this.currentMotion.flat === 0x01 &&
        this.currentMotion.tap === 0x00 &&
        this.currentMotion.doubleTap === 0x00 &&
        this.currentMotion.shakingLevel === 0x00 &&
        this.currentMotion.posture === 0x01
      ) {
        console.log("set timeout");
        this.timeoutEvent = setTimeout(() => {
          runAfterStatic(this.motionEventNumber, async () => {
            if (this.running === false) {
              await this.autoRun();
            }
            this.timeoutEvent = null;
          });
        }, 800);
      }
    },
    connectToCube: async function () {
      this.debugLog("connect to ble device");
      if (!this.cube.isConnected()) {
        await this.cube.connectDevice(this.disconnectHandler);
        if (!this.cube.isConnected()) {
          console.log("Error:failed to conenct");
          return;
        }
        this.debugLog("add handler");
        await this.cube.addHandler("motion", this.motionHandler);
        this.debugLog("lamp on");
        await this.cube.setLamp(0xff, 0xff, 0xff);
        this.debugLog("success to connect");
        this.ready = true;
      }
    },
    disconnectWithCube: async function () {
      if (this.cube.isConnected()) {
        await this.cube.setLamp(0, 0, 0);
        await this.cube.disconnectDevice(true);
        this.ready = false;
      }
    },
  },
};
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
textarea {
  width: 80%;
  height: 15em;
}
</style>
