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
	  var express  			= require('express'),
		  http     			= require('http');
		  socketIo       	= require('socket.io'),
		  expressCookieParser = require('cookie-parser'),
		  expressSession 	= require('express-session'),
		  osc      			= require("osc"),
		  geometry 			= require('./lib/geometry.js'),
		  bodyParser 		= require('body-parser'),
		  sessionStore 		= new expressSession.MemoryStore();

	// We define the key of the cookie containing the Express SID
	var EXPRESS_SID_KEY = 'connect.sid';

	// We define a secret string used to crypt the cookies sent by Express
	var COOKIE_SECRET = 'very secret string';
	var cookieParser = expressCookieParser(COOKIE_SECRET);
	 
	// Create a new store in memory for the Express sessions
	var sessionStore = new expressSession.MemoryStore(); 
	 
	var app = express();
	
	app.use(cookieParser);
	app.use(bodyParser.urlencoded({ extended: false }))
	app.use(express.static(__dirname + '/public'));
	app.use(expressSession({
		store: sessionStore,        // We use the session store created above
		resave: false,              // Do not save back the session to the session store if it was never modified during the request
		saveUninitialized: false,   // Do not save a session that is "uninitialized" to the store
		secret: COOKIE_SECRET,      // Secret used to sign the session ID cookie. Must use the same as speficied to cookie parser
		name: EXPRESS_SID_KEY       // Custom name for the SID cookie
	}));

	app.get('/', function (req, res) {
		res.sendFile('/index.html');
	});
	
	app.get('/game', function(req,res)
	{
		/*console.log(req.session.name);
		console.log(req.session.color);
		console.log(req.session.ID);
		
		var player = thePlayers[req.session.ID];
		
		console.log(player.name);
		console.log(player.color);
		console.log(player.id);*/
		res.sendFile(__dirname + '/public/game.html');
	});
	
	app.post('/login',function(req,res)
	{
		req.session.isLogged = true;
		req.session.color = req.body.color;
		req.session.name = req.body.name;
		
		res.redirect('/');
	});
	
	server = http.createServer(app);

	// Create Socket.io server
	var io = socketIo({
		// Optional Socket.io options
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
  
  function getHexCode(color)
	{
		switch (color) {
			case 'red':
				return '#fd1c15';
			case 'green':
				return '#4dc416';
			case 'blue':
				return '#165ad1';
			case 'yellow':
				return '#ffdf00';
			default:
			   return '#ffffff';
		}
	}
  
  // Deletes all holds. This is called before going to the next level.
  function deleteHolds () {
    for (var i in thePlayers) {
      thePlayers[i].hold = null;
    }
    holds = {};
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
        for (var i in thePlayers) {
          player = thePlayers[i];
          if (player.person !== null) {
            leavePos = {x: player.person.x, y: player.person.y};
            enterPos = {x: data.x, y: data.y};
            if (!player.visible &&
                Math.sqrt((enterPos.x-leavePos.x)*(enterPos.x-leavePos.x) +
                    (enterPos.y-leavePos.y)*(enterPos.y-leavePos.y)) < 0.1) {
                player.visible = true;
                player.person = data;
                io.sockets.emit('playerVisible', {player_id: player.id, person_id: data.id, x: data.x, y: data.y});
                return;
            }
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
            // this TSPS person is identified as a player 
            // => broadcast new player position + update thePlayers
            io.sockets.emit('playerUpdated', {id: player.id, x: data.x, y: data.y});
            thePlayers[player.id].person.x = data.x;
            thePlayers[player.id].person.y = data.y;
            // check if the puzzle is solved after this movement
            if (player.hold && !geometry.intersectionsFound(theLines)) {
              grow();
              deleteHolds();
              setTimeout(function () {
                io.sockets.emit('solved', { 
                    newPoints: thePoints, 
                    newLines: theLines, 
                    newPlayers: thePlayers 
                });
              }, 5000); // wait 5 seconds before going to the next level
            }
            return;
          }
        }
        // this TSPS person doesn't belong to a player
        io.sockets.emit('personUpdated', data);
        break;
        
      case "/TSPS/personWillLeave/":
        var data = {id: values[0], x: values[3], y: values[4]};
        // check if this person is identified with a player
        var player;
        for (var i in thePlayers) {
          player = thePlayers[i];
          if (player.person !== null && player.person.id === data.id) {
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

	// Socket.IO 1 is now using middlewares
	// We can use this functionnality to implement authentification
	io.use(function(socket, next) {
		var request = socket.request;

		if(!request.headers.cookie) {
			// If we want to refuse authentification, we pass an error to the first callback
			console.log('No cookie transmitted.');
			return next(new Error('No cookie transmitted.'));
		}

		// We use the Express cookieParser created before to parse the cookie
		// Express cookieParser(req, res, next) is used initialy to parse data in "req.headers.cookie".
		// Here our cookies are stored in "request.headers.cookie", so we just pass "request" to the first argument of function
		cookieParser(request, {}, function(parseErr) {
			if(parseErr) { 
				console.log('Error parsing cookies.');
				return next(new Error('Error parsing cookies.')); 
			}

			// Get the SID cookie
			var sidCookie = (request.secureCookies && request.secureCookies[EXPRESS_SID_KEY]) ||
							(request.signedCookies && request.signedCookies[EXPRESS_SID_KEY]) ||
							(request.cookies && request.cookies[EXPRESS_SID_KEY]);

			// Then we just need to load the session from the Express Session Store
			sessionStore.load(sidCookie, function(err, session) {
				// And last, we check if the used has a valid session and if he is logged in
				if (err) {
					return next(err);

				// Session is empty
				} else if(!session) {
					console.log('Session cannot be found/loaded');
					return next(new Error('Session cannot be found/loaded'));

				// Check for auth here, here is a basic example
				} else if (session.isLogged !== true) {
					console.log('User not logged in');
					return next(new Error('User not logged in'));

				// Everything is fine
				} else {
					// If you want, you can attach the session to the handshake data, so you can use it again later
					// You can access it later with "socket.request.session" and "socket.request.sessionId"
					console.log('Everything is fine');
					request.session = session;
					request.sessionId = sidCookie;

					return next();
				}
			});
		});
	});
	
	// Start the socket.io server
	io.listen(server);

  // This runs every time a client connects to the server
  io.on('connection', function (socket) {

	socket.on('load', function(data) 
	{		
		console.log('LOAD: ' + socket.request.sessionId);
		// Create a new player
		thePlayers[socket.request.sessionId] =
			{ 	id     : socket.request.sessionId,
				person : null,
				name   : socket.request.session.name,
				color  : getHexCode(socket.request.session.color),
				visible: false,
				hold: null
			};	
		
		// The client is first initialized with the current points and lines
		//socket.emit('init', { points: thePoints, lines: theLines, players: thePlayers, me: socket.handshake.sessionID });
		socket.emit('init', { points: thePoints, lines: theLines, players: thePlayers, me: socket.request.sessionId });
		socket.broadcast.emit('playerEntered', { players: thePlayers });
	});

    // When a user identifies himself as a TSPS person object
    socket.on('identify', function (data) {
      var player = thePlayers[socket.request.sessionId];
      player.visible = true;
      player.person = data.person;
      socket.broadcast.emit('personIdentified', { player_id: player.id, person_id: data.person.id });
    });

    // When a user holds a point, the hold is stored in holds, and is
    // broadcasted to all other sockets.
    socket.on('hold', function (data) {
      holds[socket.request.sessionId] = data.point;
      var curr;
      for (var i = 0; i < thePoints.length; i++) {
        curr = thePoints[i];
        if (curr.id === data.point.id) {
          curr.held = true;
          thePlayers[socket.request.sessionId].hold = curr;
          socket.broadcast.emit('pointHeld', { player_id: socket.request.sessionId, point_id: curr.id });
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
        if (curr.id === data.point.id) {
          curr.held = false;
          thePlayers[socket.request.sessionId].hold = null;
          socket.broadcast.emit('pointReleased', { player_id: socket.request.sessionId, point_id: curr.id });
          break;
        }
      }
      delete holds[socket.request.sessionId];
    });
    
    // When a user moves a point, the position is modified on the point object, 
    // and is broadcasted to all other sockets.
    socket.on('move', function (data) {
      var curr;
      for (var i = 0; i < thePoints.length; i++) {
        curr = thePoints[i];
        if (curr.id === data.point_id) {
          curr.x = data.x;
          curr.y = data.y;
          //socket.broadcast.emit('pointMoved', { point_id: curr.id, x: curr.x, y: curr.y });
          break;
        }
      }
    });

    // When a user disconnects, the server checks fot a hold and deletes it
    // from holds if it exists and broadcasts it.
    // Then a check is done for a win condition.
    socket.on('disconnect', function () {
      var curr,
          held_point = holds[socket.request.sessionId];
      socket.broadcast.emit('playerLeft', { player_id: socket.request.sessionId });
      if (held_point) {
        for (var i = 0; i < thePoints.length; i++) {
          curr = thePoints[i];
          if (curr.id === held_point) {
            curr.held = false;
            break;
          }
        }
      }
      delete thePlayers[socket.request.sessionId];
      delete holds[socket.request.sessionId];
    });
  });

  server.listen(process.env.PORT || 4000);
}());