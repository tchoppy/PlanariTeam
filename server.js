(function () {
  // Starting positions that guarantee an intersection
  var thePoints = [
      { id: 0, x: 320, y: 230, held: false },
      { id: 1, x: 124, y: 251, held: false },
      { id: 2, x: 145, y: 454, held: false },
      { id: 3, x: 70, y: 330, held: false }
  ];

  var theLines = [
      { point1: thePoints[0], point2: thePoints[1] },
      { point1: thePoints[1], point2: thePoints[2] },
      { point1: thePoints[2], point2: thePoints[3] },
      { point1: thePoints[3], point2: thePoints[0] },
      { point1: thePoints[0], point2: thePoints[2] }
  ];

  // The clients logged in to the game, each associated with a
  // TSPS person object
  var thePlayers = {};

  // This associative array keeps any current "holdings" of points
  var holds    = {};

  // Set the minimum and maximum pixels x and y values for points
  var XMIN = 20,
      XMAX = 480,
      YMIN = 20,
      YMAX = 480;

  // Include some node modules
  var express  = require('express'),
      app      = express.createServer(),
      io       = require('socket.io').listen(app),
      osc      = require("osc"),
      geometry = require('./lib/geometry.js');

  app.get("/", function(req, res) {
      res.redirect("/index.html");
  });

  app.configure(function (){
    app.use(express.methodOverride());
    app.use(express.bodyParser());
    app.use(express.static(__dirname + '/public'));
    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));
    app.use(app.router);
  });


  // Assign random x and y values within the minimum and maximum constants
  // to each point
  function shufflePoints () {
    for (var i = 0; i < thePoints.length; i++) {
      thePoints[i].x = Math.floor((Math.random()*XMAX)) + XMIN;
      thePoints[i].y = Math.floor((Math.random()*YMAX)) + YMIN;
    }
  }


  // Add a point and two lines to a random existing line to create added
  // complexity and keep the puzzle solvable
  function grow () {
    var randomLine = theLines[Math.floor((Math.random()*theLines.length))],
    newPoint = {id: thePoints.length, x: 0, y:0, held:false};
    thePoints.push(newPoint);
    theLines.push({point1: newPoint, point2: randomLine.point1});
    theLines.push({point1: newPoint, point2: randomLine.point2});
    do {
      shufflePoints();
    } while (!geometry.intersectionsFound(theLines));
  }

  // TSPS communication via OSC protocol
  var getIPAddresses = function () {
    var os = require("os"),
        interfaces = os.networkInterfaces(),
        ipAddresses = [];

    for (var deviceName in interfaces) {
      var addresses = interfaces[deviceName];
      for (var i = 0; i < addresses.length; i++) {
        var addressInfo = addresses[i];
        if (addressInfo.family === "IPv4" && !addressInfo.internal) {
          ipAddresses.push(addressInfo.address);
        }
      }
    }

    return ipAddresses;
  };

  var udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 12000
  });

  udpPort.on("ready", function () {
    var ipAddresses = getIPAddresses();

    console.log("Listening for OSC over UDP.");
    ipAddresses.forEach(function (address) {
      console.log(" Host:", address + ", Port:", udpPort.options.localPort);
    });
  });

  udpPort.on("message", function (oscMessage) {
    var address = oscMessage.address;
    var values = oscMessage.args;

    switch(address) {
        
      case "/TSPS/personEntered/":
        var data = {id: values[0], x: values[3], y: values[4]};
        // check if a player became visible again
        var player, leavePos, enterPos;
        for (var i = 0; i < thePlayers.length; i++) {
          player = thePlayers[i];
          leavePos = {x: player.person.x, y: player.person.y};
          enterPos = {x: data.x, y: data.y};
          if (!player.visible &&
            Math.sqrt((enterPos.x-leavePos.x)*(enterPos.x-leavePos.x) +
                (enterPos.y-leavePos.y)*(enterPos.y-leavePos.y)) < 50) {
          player.visible = true;
          player.person = data;
          socket.broadcast.emit('playerVisible', {player_id: player.id, person_id: data.id, x: data.x, y: data.y});
          return;
          }
        }
        // this is an unidentified person object
        // it will be broadcasted on first move
        break;
        
      case "/TSPS/personUpdated/":
        var data = {id: values[0], x: values[3], y: values[4]};
        // check if this person is identified with a player
        var player;
        for (var i in thePlayers) {
          player = thePlayers[i];
          if (player.person !== null && player.person.id === data.id) {
            io.sockets.emit('playerUpdated', {id: player.id, x: data.x, y: data.y});
            if (player.hold && !geometry.intersectionsFound(theLines)) {
              grow();
              io.sockets.emit('solved', { newPoints: thePoints, newLines: theLines });
            }
            return;
          }
        }
        io.sockets.emit('personUpdated', data);
        break;
        
      case "/TSPS/personWillLeave/":
        var data = {id: values[0], x: values[3], y: values[4]};
        // check if this person is identified with a player
        var player;
        for (var i = 0; i < thePlayers.length; i++) {
          player = thePlayers[i];
          if (player.person.id === data.id) {
            player.visible = false;
            player.person = data;
            io.sockets.emit('playerInvisible', { id: player.id, x: data.x, y: data.y });
            return;
          }
        }
        io.sockets.emit('personLeft', data);
        break;
    }

  });

  udpPort.on("error", function (err) {
    console.log(err);
  });

  udpPort.open();

  // This makes socket.io work on Heroku
  io.configure(function () {
    io.set('transports', ['xhr-polling']);
    io.set('polling duration', 10);
    io.set('log level', 1);
  });

  // This runs every time a client connects to the server
  io.sockets.on('connection', function (socket) {

    // Create a new player
    thePlayers[socket.id] =
      { id     : socket.id,
        person : null,
        name   : '?',
        color  : '#FFDF00',
        visible: false,
        hold: null
      };

    // The client is first initialized with the current points and lines
    socket.emit('init', { points: thePoints, lines: theLines, players: thePlayers, me: socket.id });
    socket.broadcast.emit('playerEntered', { players: thePlayers });

    // When a user identifies himself as a TSPS person object
    socket.on('identify', function (data) {
      var player = thePlayers[socket.id];
      player.visible = true;
      player.person = data.person;
      socket.broadcast.emit('personIdentified', { player_id: player.id, person_id: data.person.id });
    });
    
    // When a user unidentifies himself
    socket.on('unidentify', function (data) {
      var player = thePlayers[socket.id];
      socket.broadcast.emit('personUnidentified', { player_id: player.id, person_id: player.person.id });
      player.visible = false;
      player.person = null;    
    });

    // When a user holds a point, the hold is stored in holds, and is
    // broadcasted to all other sockets.
    socket.on('hold', function (data) {
      holds[socket.id] = data.point_id;
      var curr;
      for (var i = 0; i < thePoints.length; i++) {
        curr = thePoints[i];
        if (curr.id === data.point_id) {
          curr.held = true;
          socket.broadcast.emit('pointHeld', { player_id: socket.id, point_id: curr.id });
          break;
        }
      }
    });

    // When a user releases a point, the hold is deleted from holds,
    // and is broadcasted to all other sockets.
    socket.on('release', function (data) {
      var curr;
      for (var i = 0; i < thePoints.length; i++) {
        curr = thePoints[i];
        if (curr.id === data.point_id) {
          curr.held = false;
          socket.broadcast.emit('pointReleased', { player_id: socket.id, point_id: curr.id });
          break;
        }
      }
      delete holds[socket.id];
    });

    // When a user disconnects, the server checks fot a hold and deletes it
    // from holds if it exists and broadcasts it.
    // Then a check is done for a win condition.
    socket.on('disconnect', function () {
      var curr,
          held_point = holds[socket.id];
      if (held_point) {
        for (var i = 0; i < thePoints.length; i++) {
          curr = thePoints[i];
          if (curr.id === held_point) {
            curr.held = false;
            socket.broadcast.emit('pointReleased', { player_id: socket.id, point_id: curr.id });
            break;
          }
        }
      }
      delete thePlayers[socket.id];
      delete holds[socket.id];
    });
  });

  app.listen(process.env.PORT || 4000);
}());
