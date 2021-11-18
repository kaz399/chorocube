<template>
  <div class="home">
    <img v-on:click="changeDebugMode" alt="Vue logo" src="../assets/logo.png">
    <HelloWorld msg="ふりふりキューブ" v-bind:debug-mode="debugMode" />
  </div>
</template>

<script>
// @ is an alias to /src
import HelloWorld from '@/components/HelloWorld.vue'

export default {
  name: 'Home',
  components: {
    HelloWorld
  },
  data: function () {
    return {
      debugMode: false,
    }
  },
  methods: {
    changeDebugMode: function () {
      this.debugMode = !this.debugMode;
      console.log("change debug mode", this.debugMode);
    }
  }
}
</script>
