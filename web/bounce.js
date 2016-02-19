//oh hey I learned how to do this stuff a bit more properly >_<
//also borrowed some stuff from atte; <3 atte
window.BouncyTube = (function(){
"use strict";

var self = {
  storage: {},
  save: function(){
    localStorage.BouncyTube = JSON.stringify(BouncyTube.storage);
  },
  isConnected:false,
  initStorage:function(){
    self.storage = {
      firstRun:true,
      auto:false,
      host:"127.0.0.1",
      port:"8344"
    };
    self.save();
  },
  storageProps:{
    firstRun:{
      label:"Show First Run Dialog Next Reload",
      type:"checkbox"
    },
    auto:{
      label:"Automatically Connect To Bouncer",
      type:"checkbox"
    },
    host:{
      label:"IP/host of Bouncer",
      type:"text"
    },
    port:{
      label:"Port of Bouncer",
      type:"text"
    }
  },
  load:function(){
    try{
      self.storage = JSON.parse(localStorage.BouncyTube);
    }catch(err){
      console.log("error loading storage from localStorage, resetting to defaults");
      self.initStorage();
    }
  },
  dialog: function(text){
    self.dialogDOM.text(text).dialog({
      'modal': true,
      'buttons': {
        'Ok': function(){
          $(this).dialog('close');
        }
      }
    });
  },
  patch: function(container, name, callback, before){ //thanks atte
    var original = container[name];

    if ( before ){
      container[name] = function(){
        if ( callback.apply(this, arguments) !== false )
          return original.apply(this, arguments);
      };
    }
    else{
      container[name] = function(){
        var retu = original.apply(this, arguments);
        callback.apply(this, arguments);
        return retu;
      };
    }
  },
  fixWindowHeight: function(win){
    if ( !win || win.data('isBouncy') )
      return;
    var height = Math.min(
      win.height() + 20,
      $(window).height() - (win.offset().top - $(window).scrollTop()) - 20
    );

    win.css({
      'overflow-y': 'scroll',
      'max-height': height
    });

    //var height = $(window).scrollTop() - win.offset().top + $(window).height() - 30;

    //win.css({
      //'overflow-y': 'scroll',
      //'max-height': height
    //});

    win.data('isBouncy', true);
  },
  settingsContainer: null,
  updateSettingsGUI:function(){//I was going to do original names, but I've borred so much, why bother \\bpshrug
    if ( !self.settingsContainer )
      return;

    var win = self.settingsContainer.parents('.dialogContent');
    if ( !win )
      return;

    setTimeout(function(){self.fixWindowHeight(win)},300);

    self.load();
    self.settingsContainer.empty();

    // title
    self.settingsContainer.append(
      $('<legend>', {
        'text': 'Berrytube Bouncer'
      })
    );

    // basic toggles
    var connectButt = $('<div>',{
      'class':'button',
      'text':'Connect Now',
      click:function(){
        self.hijack();
        $(this).remove();
      }});
    self.settingsContainer.append.apply(self.settingsContainer,
      Object.keys(self.storageProps).map(function(key){
        return $('<div>').append($('<label>', {
          'for': 'bouncer-' + key,
          'text': self.storageProps[key].label+ ': '
        }).append($('<input>', {
          'id': 'bouncer-' + key,
          'type': self.storageProps[key].type,
          'checked': self.storageProps[key].type == "checkbox"?(!!self.storage[key]):undefined,
          'value': self.storageProps[key].type != "checkbox"?self.storage[key]:undefined,
        }).change(function(){
          console.log("updating " + key);
          self.storage[key] = self.storageProps[key].type=="checkbox"?(!!$(this).prop('checked')):$(this).val();
          self.save();
        })));
        
      })
    );
    if(!self.isConnected)
      self.settingsContainer.append(connectButt);
  },
  hijack:function(){
    socket.disconnect();
    socket.socket.options.port=self.storage.port;
    socket.socket.options.host=self.storage.host;
    //something's fucky and I can't seem to stay kicked
    socket.on('kicked',function(){
      socket.disconnect();
//      setTimeout(function(){
        socket.socket.options.reconnect=false;
     // },100);
    });
    socket.on('reconnecting',function(){
      window.IGNORE_GHOST_MESSAGES = false;

    });
    $('#chatbuffer>div').remove();
    $('#adminbuffer>div').remove();
    socket.on("reconnect",function(){
      $('#headbar').text("Connected To Bouncer");
      if(! self.isConnected)
        setTimeout(function(){
          window.IGNORE_GHOST_MESSAGES = false;
        },1000);
      self.isConnected = true;
    });
    socket.on("iVoted",function(data){
      if($('.poll.active').length){
        $('.poll.active ul .btn').addClass('disabled').data("disabled",true);
        $('.poll.active ul .btn').eq(data.op).addClass('voted');
      }
    });
    //rely on the login data that's stored in the #headbar(for some weird reason) to take of creds
    setTimeout(function(){
      socket.socket.reconnect();
    },3000);
    
  },
  init: function(){
    self.load();
    self.storage.firstRun = false;
    self.save();
    self.dialogDOM = $('<div>', {
      'title': 'Bouncer',
      'class': 'bouncer-dialog'
    }).hide().appendTo(document.body);

    self.patch(window, 'showConfigMenu', function(){
      self.settingsContainer = $('<fieldset>');
      $('#settingsGui > ul').append(
        $('<li>').append(self.settingsContainer)
      );
      self.updateSettingsGUI();
    });
    if(self.storage.auto){
      //if($('#headbar').data('loginData')){
        //var login = $('#headbar').data('loginData');
        //login.ghostBust = true;
        //socket.emit('setNick',login);
      //}
      self.hijack();
    }
  }

};

return self;

})();


$(function(){
    BouncyTube.init();
});
