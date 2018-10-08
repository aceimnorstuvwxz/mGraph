
const electron = require('electron')
const path = require('path')
const locale = require('./locale')
const databind = require('./databind')

document.addEventListener('DOMContentLoaded', function () {
  console.log("settings init");
  locale.init();
  databind.autobind();
})
