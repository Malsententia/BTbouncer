var fs = require("fs")
  , ini = require("ini")
  , FixedArray = require("fixed-array");

//JSON is too easy for plebes to mess up.
//And yeah the ini module can write settings, but documentation is nice
var defaultINI = [
";The bouncer is designed for use by a single username",
";It will be \"locked\" to whatever username is provided below",
";If left blank, it will prompt you for a username when you start it.",
"username =",
"",
";The number of history lines it will send to newly connected clients",
";If you change this to a silly high number, things might slow down as all the emotes are processed",
"historyLines = 20",
"",
";You probably shouldn't have to change this, unless you are running multiple copies of the bouncer on a single machine",
"port = 8344",
"",
";Run in background; no console window.",
";On linux/unix machines, I would suggest you leave it false and instead set up the bouncer systemd/sysV service instead",
";username must be set above for this to function",
"daemon = false",
"",
";Make a debug console available at the following url (you must run npm install node-console for this) and output various debugging messages.",
";http://YOURIPORDOMAIN:9090/debug?ws=YOURIPORDOMAIN:9090&babel=6&port=9999",
";Not secure, not for day to day use.",
";Also debugging messages will contain passwords, so it'd be \"impolite\" to leave this on if you're running it for someone else.",
"debug = false",
"",
";The number of seconds the bouncer should stay on Berrytube after all clients are gone.",
";Worth noting: this is the window of time you will have to restart your browser if it crashes while you have berry(assuming no other bouncer clients are connected).",
"disconnectAfter = 30",
""
].join("\r\n");

var config;
try{
  config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
}catch(e) {
  console.log("error reading config file, resetting it");
  fs.writeFileSync('./config.ini',defaultINI);
  config = ini.parse(defaultINI);
}
//yeah, using lots of globals, not exactly good style, but sorta mimicing
//the BT client's style for ease, I guess.
NAME = config.username;
PORT = parseInt(config.port);
console.log(JSON.stringify(config));
DAEMON = config.daemon;
HISTORYLENGTH = parseInt(config.historyLines);
DISCONNECTAFTER = parseInt(config.disconnectAfter)*1000;
if (DISCONNECTAFTER < 10000)
  DISCONNECTAFTER = 10000;
DEBUG = config.debug;
PASS = null; 
UNVERFIEDPASS = null;
CHATLIST = {};//BT only sends it on initial connect. Must maintain our own for multiple clients
MUSTHAVECLIENTS = true;
KICKED = false;
ACTIVE = {};//not using currently.
POLL = null;
TIME = 0;
STATE = 1;
POLL = null;
LEADER = 0;
TYPE = -1;//not that unregged users will be able to use this anyway, but whatever, it can be the default
BTDISCONNECTED = false;
RECONNECTING = false;
MOBILEMODE = "main";//both/main/ops ; used for special mobile behavior for modmins
LASTMSGTIME = 0;
DISINTERVAL = null;
MAINQUEUE = FixedArray(HISTORYLENGTH);
OPSQUEUE = FixedArray(HISTORYLENGTH);
berrytube = null; //socket.io-client connection to bt will be here


if (!NAME) {
  if (process.env.BTBOUNCENAME){
    NAME = process.env.BTBOUNCENAME;
  } else {
    readlineSync = require("readline-sync");
    NAME = readlineSync.question("Enter BT Username: ");
  }
}

//if it's a daemon(whyyyy) try to read the NAME from the environment variable
if (DAEMON && NAME) {
  var env = process.env;
  env.BTBOUNCENAME = NAME;
  var daemon = require("daemon")({env:env});
}

var btio = require("socket.io-client");
io = require("socket.io").listen(PORT);
io.set('log level', 1);
dbg = function(){}
if (DEBUG) {
  dbg = console.log.apply(console);
}



//probably can do away with this in the future...since we're resending almost
//everything anyway. Perhaps replace with an array of what _not_ to rebroadcast
//and hook in to all messages.

//Messages from the client that are forwarded to the server
var clientRebroadcasts = ["activateGold","addVideo","ban","chat","chatOnly","closePoll","crash","delVideo","delVideoHistory","fondleUser","fondleVideo","forceStateChange","forceVideoChange","getBanlist","getFilters","hbVideoDetail","importPlaylist","kickUser","moveLeader","myPlaylistIsInited","newPoll","playNext","randomizeList","refreshMyPlaylist","refreshMyVideo","registerNick","renewPos","searchHistory","setAreas","setFilters","setOverrideCss","setToggleable","shadowBan","sortPlaylist","videoSeek","votePoll"];

//Messages from the server that are forwarded to the client
var serverRebroadcasts = ["addPlaylist","addVideo","adminLog","badAdd","chatMsg","clearPoll","createPlayer","debug","delVideo","doorStuck","drinkCount","dupeAdd","error","fondleUser","forceVideoChange","hbVideoDetail","kicked","leaderIs","loginError","midasTouch","newChatList","newPoll","numConnected","overrideCss","recvBanlist","recvFilters","recvNewPlaylist","recvPlaylist","recvPlugins","renewPos","searchHistoryResults","setAreas","setLeader","setNick","setToggleable","setToggleables","setType","setVidColorTag","setVidVolatile","shadowBan","sortPlaylist","unShadowBan","updatePlaylist","updatePoll","userJoin","userPart","videoRestriction"]; 

//some of these are call-response setups that don't necessirily need to be sent to all clients. Used for mapping what to listen for and not broadcast
var requestMap = {
  getBanlist:"recvBanlist",
  getFilters:"recvFilters",
  refreshMyPlaylist:"recvNewPlaylist",
  refreshMyVideo:"forceVideoChange",
  renewPos:"renewPos",
  searchHistory:"searchHistoryResults"
}

if (DEBUG) {
  try{
  var web_console = require("node-console");  
  var frontend_port = 9090;
  var agent_port = 9999;
  var listen_address = "0.0.0.0";
  var ecmascript_version = 6;
  web_console.start(frontend_port,agent_port,listen_address,ecmascript_version); 
  }catch(e) {}
}

//not really making use of this at the moment
//could reduce bugging of berrytube for some events in the future, assuming
//the bouncer is on a reliable connection that will stay in sync with BT.
function updateActive(data) {
  ACTIVE = data.video;
  TIME = data.time;
  STATE = data.state;
};

//used for resending chatlist to user
function objToArr(obj) {
  return Object.keys(obj).map(function(k) { return obj[k] });
}

//just for sanity
//the later 3 only get joined if client is already authorized, so authorization is implied
function sendAll(a,b) {
  io.sockets.in("auth").emit(a,b);
}
function sendMobile(a,b) {
  io.sockets.in("mobile").emit(a,b);
}
function sendIRC(a,b) {
  io.sockets.in("irc").emit(a,b);
}
function sendRegular(a,b) {
  io.sockets.in("regular").emit(a,b);
}


//f is their special function, q, if it exists and is not empty, is an array of
//clients that have emitted a command that warrants an individual response. IE,
//clients can request a forceVideoChange, with refreshmyvideo, but the server
//sends it on its own to all clients at other times.
//n, if present and true, means never rebroadcast , used for various responses,
//that are never meant to hit multiple clients, or at least have special logic
//that rebroadcasts selectively; 
//history searches, video restriction warnings, and so on

//This is a crime against readability and should be redone. It started out a a simple mapping

var serverSpecial = {
  newChatList:{
    f:function(data) {
      CHATLIST = {};
      data.forEach(function(e) {
       CHATLIST[e.nick] = e;
      });
    }
  },
  newPoll:{
    f:function(data) {
      POLL = data;
    }
  },
  updatePoll:{
    f:function(data) {
      POLL.votes = data.votes;
    }
  },
  clearPoll:{
    f:function(data) {
      POLL = null;
    }
  },
  loginError:{
    f:function(data) {
      console.log("NAME:",NAME);
      console.log("Login Error: ",data);
    },n:true
  },
  userJoin:{
    f:function(data) {
        if (! "type" in data)
          data.type = 0;
        CHATLIST[data.nick] = data;
    }
  },
  userPart:{
    f:function(data) {
      delete CHATLIST[data.nick];
    }
  },
  //setNick:{
    //f:function(data) {
      //if (UNVERIFIEDPASS) {
        //PASS = UNVERIFIEDPASS;
      //}
    //}
  //},
  leaderIs:{
    f:function(data) {
      if (typeof data.nick == "string") {
        LEADER = data.nick;
      } else {
        LEADER = false;
      }
    }
  },
  chatMsg:{
    f:function(data) {
      sendRegular("chatMsg",data);
      //only relay a message to the IRC client from the bounced username if it's
      //been over half a second. Allows IRC clients to turn on echoing(allowing
      //them to see messages sent from other instances of the same user, whilst
      //not doubling their own messages.
      //If you're sending messages faster than that, please stop.
      if (data.msg.nick !== NAME || Date.now() >(LASTMSGTIME + 500)) {
        sendIRC("chatMsg",data);
      }
      if (! data.msg.metadata.channel) {
        //phone client doesn't specify channel! Need this for below logic.
        data.msg.metadata.channel = "main";
      }
      switch(data.msg.metadata.channel) {
        case "main":
          MAINQUEUE.push(data);
          if (MOBILEMODE.match(/^(both|main)$/))
            sendMobile("chatMsg",data);
          break;
        case "admin":
          OPSQUEUE.push(data);
          if (MOBILEMODE.match(/^(both|ops|admin)$/))
            sendMobile("chatMsg",data);
          break;
      }
    },n:true
  },
  badAdd:{n:true,q:[]},
  videoRestriction:{n:true,q:[]},
  dupeAdd:{n:true,q:[]},
  recvBanlist:{n:true,q:[]},
  recvNewPlaylist:{q:[]},
  recvFilters:{n:true,q:[]},
  renewPos:{f:updateActive,n:true,q:[]},
  hbVideoDetail:{f:updateActive},
  fondleUser:{
    f:function(data) {
      switch (data.action) {
        case "setUserNote":
          CHATLIST[data.info.nick].meta.note = data.info.note;
        break;
      }
    }
  },
  forceVideoChange:{f:updateActive,q:[]},
  searchHistoryResults:{n:true,q:[]},
  kicked:{
    f:function(data) {
      console.log("Server kicked, reason " + data);
      KICKED = true;
    }
  },
  setType:{
    f:function(data) {
      TYPE = data;
    }
  },
  setLeader:{
    f:function(data) {
      LEADER = data;
    }
  }
}

//Disclosure: Haven't used promises much before. amidoingitrite?
//Also the possibility for attac
function chainSetNicks(socket){
  return new Promise(function(resolve){
    var loginError,setNick;
    loginError = function() {
      dbg("chained loginError happened");
      berrytube.removeListener('loginError',loginError);
      berrytube.removeListener('setNick',setNick);
      socket.emit("kicked","authentication failed");
      socket.disconnect();
      resolve();
    }
    if(!PASS){
      setNick = function() {
        dbg("chained setNick happened");
        berrytube.removeListener('loginError',loginError);
        berrytube.removeListener('setNick',setNick);
        //resolve(socket.unverifiedpass);
        PASS = socket.unverifiedpass;
        doAuthSocket(socket,{nick:NAME,pass:socket.unverifiedpass});
        BTDISCONNECTED = false;
        resetInterval();
        berrytube.emit("myPlaylistIsInited");//yeah sure whatever
        resolve();
      }
      berrytube.on('setNick', setNick);
    }else{
      doAuthSocket(socket,{nick:NAME,pass:socket.unverifiedpass});
    }
    berrytube.on('loginError', loginError);
    dbg("setnick ",NAME,socket.unverifiedpass);
    berrytube.emit("setNick",{
      nick:NAME,
      pass:socket.unverifiedpass,
      ghostBust:true
    });
  });

}

function authWithTube(callback) {
  console.log("Authenticating With Tube");
//    setTimeout(function() {
    //there will ALMOST never be more than one client at this point,
    //BUT, because there theoretically could be, gotta try their passwords
    //individually, otherwise a theoretical window of attack
  var chain;
  for(var s in io.sockets.sockets){
    if(!chain)
      chain = chainSetNicks(io.sockets.sockets[s]);
    else
      chain.then(function(){
        chain = chainSetNicks(io.sockets.sockets[s]);
      });
  }
 //     dbg("setNicking with tube; NAME: "+NAME+" ; PASS: "+UNVERIFIEDPASS);
//      berrytube.emit("setNick",{ nick:NAME, pass:UNVERIFIEDPASS, ghostBust:true });
//    },500);
//  }
}



/*no longer storing the password on launch, instead just locking to
username and letting a successful BT authentictation serve as auth.
A bit more effort, and currently a bit messier, but should allow phone
and irc clients to use bouncer without special modification. 
(Other than changing to the bouncer server)
Thanks Atte for suggesting this*/


function sendHistory(socket) {
  if (socket.clientType !== "android-app" || MOBILEMODE.match(/^(both|main)$/)) {
    socket.emit("chatMsg",bounceMsg("Begin Bouncer Backlog","main"));
    MAINQUEUE.values().forEach(function(e) {
      e.ghost = true;
      socket.emit("chatMsg",e);
    });
  }

  if ( TYPE > 0 && (socket.clientType !== "android-app" || MOBILEMODE.match(/^(both|ops|admin)$/)) ) {
    socket.emit("chatMsg",bounceMsg("Begin Bouncer Backlog","admin"));
    OPSQUEUE.values().forEach(function(e) {
      e.ghost = true;
      socket.emit("chatMsg",e);
    });
  }
}

function bounceMsg(str,channel) {
  return {
    msg:{
    emote: "rcv",
    nick: "--BOUNCER--",
    type: 2,
    msg: str,
    metadata:{
      flair: 0,
      channel: channel||"main",
      nameflaunt: true},
      multi: 1,
      timestamp: new Date().toUTCString()
    },
    ghost: true
  };
}

function bounceDivider(str) {
  return {
    msg: {
      emote: false,
      nick: "BOUNCER",
      type: 2,
      msg: "----------"+str+"----------",
      metadata: {
        flair: 0,
        channel: "main",
        nameflaunt: true
      },
      multi: 1,
      timestamp: new Date().toUTCString()
    },
    ghost: true
  };
}


io.on('connection', function(socket) {
  console.log("New connection from: "+socket.handshake.address.address);
  socket.auth = false;
  socket.leave("");
  socket.on("setNick",function(data) {
    dbg("got setNick from client");
    //we're a bit more stringent here with validation, since anyone can get here.
    if (!socket.auth) {
      if (typeof data.nick == "string" &&
          data.nick.toLowerCase() !== NAME.toLowerCase()) {
        console.log("Client with unauthorized username \""+data.nick+"\" attempted connection, kicking.");
        socket.emit("kicked","Buzz off, this ain't your bouncer");
        socket.disconnect();
        return;
      } else {
        if (typeof data.nick !== "string" ||
            typeof data.pass !== "string" ||
            data.nick.length == 0 ||
            data.nick.length > 15 ||
            !data.nick.match(/^[0-9a-zA-Z_]+$/ig) ||
            data.pass.length == 0) {
          console.log("Client connected but credentials were missing/invalid.");
          socket.emit("kicked","authentication failed");
          socket.disconnect();
          return;
        } else {
          dbg("Credentials seem sane, let's check em with the tube or what we have stored");
          socket.unverifiedpass = data.pass;
          doAuthSocket(socket,data);
          return;
        }
      }
    }
  });
  setTimeout(function() {
    if (!socket.auth) {
      dbg("Disconnecting socket ", socket.id);
      dbg("Did not authenticate in time");
      socket.emit("kicked","Client Did Not Authenticate In Time");
      socket.disconnect("unauthorized");
    }
  }, 60000);
});


function connectToTube(callback) {

  console.log("Connecting to Berrytube");

  berrytube = btio.connect("http://66.85.144.241:8344",{
    "connect timeout": 10000, 
    "reconnect": false, 
    "max reconnection attempts": 5, 
    "reconnection delay": 500, 
  });
    //"reopen delay": 1000, 

  //if(callback) {
    //var firstSetNick = function() {
      //dbg("firstSetNick happened");
      //callback();
      //berrytube.removeListener('setNick',firstSetNick);
    //}
  //}
  berrytube.on("connect", function() {
    dbg("got connect");
      authWithTube(callback);
  });
  berrytube.on("reconnect", function() {
    dbg("got reconnect");
    //connect gets called either way.
  //  authWithTube(callback);
  });

  berrytube.on("reconnecting", function() {
   dbg("got reconnecting");
   RECONNECTING = true;           
  });

  berrytube.addListener("disconnect",function() {
    dbg("got disconnect");
    PASS = null;
    POLL = null;
    //UNVERIFIEDPASS = null;
    LEADER = false;
    BTDISCONNECTED = true;
    if (KICKED) {
      try{
        io.sockets.in("auth").forEach(function(e) {e.disconnect()});
      }catch(e) {};
    }
    KICKED = false;
    if (!shouldLeave())
      this.socket.reconnect();
  });

  serverRebroadcasts.forEach(function(e) {
    berrytube.on(e,function(data) {
//      dbg('server: '+e+'',data);
      if (serverSpecial[e]) {
        //execute special functions if any
        if (serverSpecial[e].f) 
          serverSpecial[e].f(data);

        if (Array.isArray(serverSpecial[e].q) && serverSpecial[e].q.length) {
          var now = Date.now();
          //if it can't find someone that's asked for it recently, give it to everyone, fuck the consequences.
          serverSpecial[e].q = serverSpecial[e].q.filter(function(v) {return now-v.time < 3000});
          if (serverSpecial[e].q.length) {
            serverSpecial[e].q.shift().socket.emit(e,data);
            return;
          }
        }
        if (serverSpecial[e].n)
          return;
      }
      sendAll(e,data);
    });
  });

//  berrytube.on('setNick', firstSetNick);
}

function doAuthSocket(socket,data) {
  if (socket.disconnected){
    resetInterval();
    return;
  }
//try{
  if (PASS) {
    console.log("We have a stored password...");
    //bt ain't case sensitive for usernames
    if (data.nick.toLowerCase() == NAME.toLowerCase() && data.pass == PASS) {
      console.log("..and the credentials check out!");
      dbg("new socket is", socket.id);
      //Congratulations! Your socket is now enabled for connections longer than 10 seconds.
      //(and able to send and receive all the normal stuff)
      socket.auth = true;
      socket.join("auth");
      //i hope this is close enough. Idk how much variation one might see in these.
      //Android doesn't technically use dalvik anymore, does it?
      if (TYPE >0 && !!socket.handshake.headers["user-agent"].match(/Dalvik\/.*?\(.* Android .*\)/)) {
        socket.clientType = "android-app";
        socket.join("mobile");
      } else if (!!socket.handshake.headers["user-agent"].match(/bt-irc-bridge/)) {
        console.log("Client set to irc");
        socket.clientType = "bt-irc-bridge";
        socket.join("irc");
      } else {
        socket.clientType = "regular";
        socket.join("regular"); 
      }


      NAME && socket.emit("setNick",NAME);
      POLL && socket.emit("newPoll",POLL); 
      CHATLIST && socket.emit("newChatList", objToArr(CHATLIST));
      
      if (typeof LEADER == "string") {
        if (LEADER.toLowerCase() == NAME.toLowerCase()) {
          socket.emit("setLeader",true);
        }
        socket.emit("leaderIs",{nick:LEADER});
      } else {
        socket.emit("setLeader",false);//probably not necessary
        socket.emit("leaderIs",{nick:false});
      }

      socket.emit("setType",TYPE);
      clientMsgs(socket);
      socket.on("error",function(e) {
        console.log("ERROR:",e);
      });
      socket.on("disconnect",resetInterval);
      sendHistory(socket);
    } else {
      console.log("...and credentials don't match! Boot to the head!");
      socket.emit("kicked","authentication failed");
      socket.disconnect(); 
    }
  } else {
    dbg("no stored password");
//    UNVERIFIEDPASS = data.pass;
    if (!berrytube) {
      dbg("no existing connection, calling connectToTube");
      connectToTube();
      //connectToTube(function() {
        //doAuthSocket(socket, data);
      //});
    } else {
      dbg("We are not currently RECONNECTING");
      if (BTDISCONNECTED) {
        dbg("berrytube exists, but we're disconnected and not currently reconnecting");
        RECONNECTING = true;
        var firstSetNick = function() {
          doAuthSocket(socket, data);
          berrytube.removeListener('setNick',firstSetNick);
        }
        berrytube.on('setNick', firstSetNick);
        console.log("Reconnecting to tube");
        berrytube.socket.reconnect();
      } else {
        dbg("door stuck? Or maybe authentication in progress. Give it a sec.")
        setTimeout(function(){
          if(PASS){
            doAuthSocket(socket, data);
          } else {
            socket.emit("kicked","Reconnection authentication failed, door stuck?");
            socket.disconnect(); 
          }
        },2000);
      }
    }
  }
//}catch(e) {}
}

//here we provide some special behavior for admins/assistants using the android app,
//since apparently the android app merges ops and main, at least last I heard, mid 2015
//also shares votes with other clients.
function clientMsgs(socket) {
  clientRebroadcasts.forEach(function (e) {
    socket.on(e,function(data) {
      if (requestMap[e])
        serverSpecial[requestMap[e]].q.push({ socket:socket, time:Date.now() });
      //other instances on the bouncer don't know we voted, so tell em
      if (e == "votePoll") {
        sendAll("iVoted",data);//I promise I wasn't trying to make iJoke
      }
      if (e == "chat") {
        if (socket.clientType === "bt-irc-bridge")
          LASTMSGTIME = Date.now();

        if (data.msg.toLowerCase() === "/!ops" || data.msg.toLowerCase() === "/!admin") {
          MOBILEMODE = "ops";
          sendMobile("chatMsg",bounceMsg("Android app clients now in ADMIN/OPS chat"));
          sendMobile("chatMsg",bounceDivider("OPS"));
          return;
        }
        if (data.msg.toLowerCase() === "/!main") {
          MOBILEMODE = "main";
          sendMobile("chatMsg",bounceMsg("Android app clients now in MAIN chat"));
          sendMobile("chatMsg",bounceDivider("MAIN"));
          return;
        }
        if (data.msg.toLowerCase() === "/!both") {
          MOBILEMODE = "both";
          sendMobile("chatMsg",bounceMsg("Android app clients now in both chats...maybe the mobile app is fixed and this is what you want.."));
          sendMobile("chatMsg",bounceDivider("merged"));
          return;
        }
        if (socket.clientType === "android-app") {
          if (MOBILEMODE === "ops" ) {
            data.metadata.channel = "admin";
          } else if (MOBILEMODE === "main" || MOBILEMODE === "both" ) {
            data.metadata.channel = "main";
          }
        }
      }
      if (berrytube) berrytube.emit(e,data);
    });
  });
}


//there's totally better ways to do this. Meh.

function leaveTube() {
  console.log("Disconnecting from Berrytube");
  RECONNECTING = false;
  PASS = null;
  POLL = null;
  UNVERIFIEDPASS = null;
  LEADER = 0;
  BTDISCONNECTED = true;
  if (berrytube !== null)
    berrytube.disconnect();
}

function shouldLeave() {
  return io.sockets.in("auth").clients().length == 0;//&& BTDISCONNECTED === false;
}

function resetInterval() {
  dbg("resetting disconnect interval");
  if(!MUSTHAVECLIENTS)
    return;
  clearInterval(DISINTERVAL);
  DISINTERVAL = setInterval(function() {
    dbg("checking if we're out of clients");
    if (shouldLeave()) {
      clearInterval(DISINTERVAL); 
      setTimeout(function() {
        dbg("checking if we're STILL out of clients");
        if (shouldLeave()) {
          dbg("YEP, leaving tube");
          leaveTube();
        } else {
          dbg("Oh nevermind they came back");
          resetInterval();
        }
      },DISCONNECTAFTER);
    }
  },10000);
}

//vim: ts=2 sts=2 sw=2
