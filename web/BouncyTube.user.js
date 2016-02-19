// ==UserScript==
// @name         BouncyTube
// @namespace    bouncytube
// @version      0.1.2
// @description  Allows Berrytube.tv to disconnect from normal backend and reconnect to bouncer
// @author       Mal
// @match        http://berrytube.tv/*
// @match        http://www.berrytube.tv/*
// @match        http://btc.berrytube.tv:8000/*
// @updateURL    https://q-z.xyz/BouncyTube.user.js
// @grant        none
// ==/UserScript==
$( document ).ready(function(){
  waitForFlag("PLREADY",function(){//weird shit can happen, particularly in chrome, just wait till we got a playlist
  $.getScript('https://q-z.xyz/bounce/bounce.js');//It's dangerous to expect user scripts to not cache, load this!
  });
});
