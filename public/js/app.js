/*
*  App
*/
Untangle = Ember.Application.create({
  POINT_RADIUS: 10,
  HELD_POINT_RADIUS: 15,
  POINT_FILL_COLOR: '#111',
  HELD_POINT_FILL_COLOR: '#111',
  POINT_STROKE_COLOR: '#42CBED',
  HELD_POINT_STROKE_COLOR: '#F00',
  LINE_COLOR: '#CCC',
  LINE_STROKE_WIDTH: 1,
  POINT_STROKE_WIDTH: 2,
  PLAYER_RADIUS: 10,
  UNIDENTIFIED_PLAYER_FILL_COLOR: '#111',
  UNIDENTIFIED_PLAYER_STROKE_COLOR: '#D3D3D3',
  PLAYER_STROKE_WIDTH: 2,
  XMIN: 20,
  XMAX: 480,
  YMIN: 20,
  YMAX: 480,

  socket: io.connect(location.protocol + '//' + location.hostname),
	me: null,

  // This is called when Ember finishes loading. It is a sort of initialization.
  ready: function () {
    Untangle.socket.on('init', function (data) {
      Untangle.pointsController.loadPoints(data.points);
      Untangle.linesController.loadLines(data.lines);
      Untangle.playersController.loadPlayers(data.players);
      Untangle.me = Untangle.playersController.find(data.me);
      Untangle.linesController.drawAll();
      Untangle.pointsController.drawAll();
      Untangle.playersController.drawAll();
    });

	  Untangle.socket.on('personUpdated', function (data) {
		  Untangle.personsController.personMoved(data.id, data.x*500, data.y*500);
    });
    
    Untangle.socket.on('personLeft', function (data) {
	    Untangle.personsController.personLeft(data.id);
    });
    
    Untangle.socket.on('personIdentified', function (data) {
	    Untangle.personsController.personIdentified(data.player_id, data.person_id);
    });
    
    Untangle.socket.on('personUndentified', function (data) {
	    Untangle.personsController.personUnidentified(data.player_id, data.person_id);
    });

    Untangle.socket.on('playerEntered', function (data) {
      Untangle.playersController.loadPlayers(data.players);
    });
    
	  Untangle.socket.on('playerUpdated', function (data) {
		  Untangle.playersController.playerMoved(data.id, data.x*500, data.y*500);
    });
    
    Untangle.socket.on('playerVisible', function (data) {
      Untangle.playersController.playerVisible(data.player_id, data.person_id, data.x, data.y);
    });
    
    Untangle.socket.on('playerInvisible', function (data) {
      Untangle.playersController.playerInvisible(data.id, data.x, data.y);
    });

    Untangle.socket.on('pointHeld', function (data) {
      Untangle.pointsController.pointHeld(data.player_id, data.point_id);
    });
    
	  Untangle.socket.on('pointReleased', function (data) {
      Untangle.pointsController.pointReleased(data.player_id, data.point_id);
    });

    Untangle.socket.on('solved', function (data) {
	    console.log('solved!');
      Untangle.pointsController.loadPoints(data.newPoints);
      Untangle.linesController.loadLines(data.newLines);
      Untangle.linesController.drawAll();
      Untangle.pointsController.drawAll();
    });
  }
});


/*
* Model
*/

// A point of the graph
Untangle.Point = Ember.Object.extend({
  id: null,
  x: null,
  y: null,
  held: false,

  /**
  * This point was held by a client, which may be this one.
  */
  wasHeld: function () {
    this.held = true;
  },

  /**
  * This point was moved by a client, which may be this one.
  * @param {Number} x the x coordinate to move the point to
  * @param {Number} y the y coordinate to move the point to
  */
  wasMoved: function (x, y) {
    this.x = x;
    this.y = y;
  },

  /**
  * This point was released by a client, which may be this one.
  */
  wasReleased: function () {
    this.held = false;
  }
});

// Corresponds to a TSPS person object
Untangle.Person = Ember.Object.extend({
  id: null,
  x: null,
  y: null,
  identified: false,

  /**
  * Identify this person as a player.
  */
  identify: function () {
    this.wasIdentified();
    Untangle.socket.emit('identify', { 
      person : this 
    });
  },
  
  /**
  * Undentify this person as a player.
  */
  unidentify: function () {
    this.wasUnidentified();
    Untangle.socket.emit('unidentify', { 
      person : this 
    });
  },

  /**
  * This person was identified as a player.
  * @param {Number} id the id of this player
  * @param {String} color the color of this player
  * @param {String} name the name of this player
  */
  wasIdentified: function () {
    this.identified = true;
  },
  
  /**
  * This person was identified as a player.
  * @param {Number} id the id of this player
  * @param {String} color the color of this player
  * @param {String} name the name of this player
  */
  wasUnidentified: function () {
    this.identified = false;
  },

  /**
  * This person was moved.
  * @param {Number} x the x coordinate to move the person to
  * @param {Number} y the y coordinate to move the person to
  */
  wasMoved: function (x, y) {
    this.x = x;
    this.y = y;
  }
});

// A player 
Untangle.Player = Ember.Object.extend({
  id: null,
  person: null,
  visible: true,
  hold: null,
  color: '#FFDF00',
  name: '?',
  
  /**
  * This player was moved.
  * @param {Number} x the x coordinate to move the player to
  * @param {Number} y the y coordinate to move the player to
  */
  wasMoved: function (x, y) {
    Untangle.personsController.personMoved(this.person.id, x, y);
      
    if (this.hold !== null) {
      Untangle.pointsController.pointMoved(this.hold.id, x, y)
		} else {
			var point = Untangle.pointsController.checkHold(x,y);
			if (point) {
				this.hold = point;
			}
		}
  },
  
  /**
  * This player became associated with a person.
  */
  wasIdentified: function (person) {
    this.becameVisible(person);
  },
  
  /**
  * The association with a person was removed.
  */
  wasUnidentified: function () {
    this.person = null;
    this.becameInvisible();
  },
  
  /**
  * This player became visible.
  */
  becameVisible: function (person) {
      this.visible = true;
      this.person = person;
  },
  
  /**
  * This player became visible.
  */
  becameInvisible: function () {
      this.visible = false;
  },
  
  gotHold: function (point) {
      this.hold = point;
  },
  
  lostHold: function () {
      this.hold = null;
  }

});

// A line is simply composed of 2 points
Untangle.Line = Ember.Object.extend({
  point1: null,
  point2: null
});


/*
  Controllers
*/
Untangle.pointsController = Ember.ArrayProxy.create({
  content: [],

  /**
  * Creates a point object and adds it to the content array of this controller
  * @param {Object} id the point's id
  * @param {Object} x the point's x coordinate
  * @param {Object} y the point's y coordinate
  * @return {Object} Returns the point that was created.
  */
  create: function (id, x, y) {
    var point = Untangle.Point.create({
        id: id,
        x: x,
        y: y
    });
    this.pushObject(point);
    return point;
  },

  /**
  * Loads an array of points into Ember by creating point objects and adding 
  * them to the content array of this controller
  * @param {Object} points an array of points, each of which has an id, 
  *                         an x coordinate, and a y coordinate.
  */
  loadPoints: function (points) {
    this.set('content', []);
    var point;
    for (var i = 0; i < points.length; i++) {
        point = points[i];
        this.create(point.id, point.x, point.y);
    }
  },

  /**
  * Erases any points that are already drawn and then draws all the points 
  * contained in the content array with d3 calls
  */
  drawAll: function () {
    d3.selectAll('circle').remove();

    d3.select('svg')
      .selectAll('circle')
      .data(this.get('content'))
      .enter()
      .append('circle')
      .attr('id', function (d) { return d.id; })
      .attr('cx', function (d) { return d.x; })
      .attr('cy', function (d) { return d.y; })
      .attr('r', function (d) { return (d.held ? Untangle.HELD_POINT_RADIUS : Untangle.POINT_RADIUS); })
      .style('fill', function (d) { return (d.held ? Untangle.HELD_POINT_FILL_COLOR : Untangle.POINT_FILL_COLOR); })
      .style('stroke', function (d) { return (d.held ? Untangle.HELD_POINT_STROKE_COLOR : Untangle.POINT_STROKE_COLOR); })
      .style('stroke-width', Untangle.POINT_STROKE_WIDTH);
  },

  /**
  * Finds a point with the id point_id in the contents array if it exists and returns it.
  * @param {Number} point_id the id of the desired point
  * @return {Object} Returns the point with the id point_id or null if it does not exist there.
  */
  find: function (point_id) {
    var points = this.get('content');
    for (var i = 0; i < points.length; i++) {
      if (points[i].id === point_id) {
        return points[i];
      }
    }
    return null;
  },

  /**
  * Finds a point close to x and y in the contents array if it exists and returns it.
  * @param {Number} x the x coordinate
  * @param {Number} y the y coordinate
  * @return {Object} Returns the id of the point close to (x,y) or -1 if it does not exist there.
  */
  checkHold: function (x, y) {
    var points = this.get('content');
    for (var i = 0; i < points.length; i++) {
      if (points[i].x > x-10 && points[i].x < x+10 
          && points[i].y > y-10 && points[i].y < y+10) {
		    Untangle.pointsController.pointHeld(points[i].id);
        return points[i];
      }
    }
    return null;
  },

  /**
  * Makes the necessary updates when a point is held
  * @param {Number} point_id the id of the point
  */
  pointHeld: function (point_id) {
    var point = Untangle.pointsController.find(point_id);
    point.wasHeld();
    d3.select('circle[id="' + point.id + '"]')
      .attr('r', Untangle.HELD_POINT_RADIUS)
      .style('fill', Untangle.HELD_POINT_FILL_COLOR)
      .style('stroke', Untangle.HELD_POINT_STROKE_COLOR);
  },

  /**
  * Makes the necessary updates when a point is moved
  * @param {Number} point_id the id of the point
  */
  pointMoved: function (point_id, x, y) {
    var point = Untangle.pointsController.find(point_id);
    point.wasMoved(x, y);
    d3.select('circle[id="' + point.id + '"]')
      .attr('cx', x).attr('cy', y)
      .attr('r', Untangle.HELD_POINT_RADIUS)
      .style('fill', Untangle.HELD_POINT_FILL_COLOR)
      .style('stroke', Untangle.HELD_POINT_STROKE_COLOR);
    Untangle.linesController.update();
  },

  /**
  * Makes the necessary updates when a point is released
  * @param {Number} point_id the id of the point
  */
  pointReleased: function (point_id) {
    var point = Untangle.pointsController.find(point_id);
    point.wasReleased();
    d3.select('circle[id="' + point.id + '"]')
      .attr('r', Untangle.POINT_RADIUS)
      .style('fill', Untangle.POINT_FILL_COLOR)
      .style('stroke', Untangle.POINT_STROKE_COLOR);
  }
});

Untangle.personsController = Ember.ArrayProxy.create({
  content: [],

  /**
  * Creates a person object and adds it to the content array of this controller
  * @param {Object} id the person's id
  * @param {Object} x the peson's x coordinate
  * @param {Object} y the person's y coordinate
  * @return {Object} Returns the person that was created.
  */
  create: function (id, x, y, identified) {
    var person = Untangle.Person.create({
        id: id,
        x: x,
        y: y, 
        identified: identified
    });
    this.pushObject(person);
    return person;
  },

  /**
  * Erases any persons that are already drawn and then draws all the persons contained in the content array with d3 calls
  */
  drawAll: function () {
    d3.selectAll('.person').remove();

    d3.select('svg')
      .selectAll('.person')
      .data(this.get('content'))
      .enter()
      .append('rect')
      .filter(function (d) { return !d.identified; })
      .attr('id', function (d) { return d.id; })
      .attr('class', 'person')
      .attr('x', function (d) { return d.x; })
      .attr('y', function (d) { return d.y; })
      .attr('width', function (d) { return Untangle.PLAYER_RADIUS; })
      .attr('height', function (d) { return Untangle.PLAYER_RADIUS; })
      .style('fill', function (d) { return (d.identified ? d.color : Untangle.UNIDENTIFIED_PLAYER_FILL_COLOR); })
      .style('stroke', function (d) { return (d.identified ? d.color : Untangle.UNIDENTIFIED_PLAYER_STROKE_COLOR); })
      .style('stroke-width', Untangle.PLAYER_STROKE_WIDTH)
      .on("click", function (d) {
        if (!d.identified) {
          Untangle.personsController.personIdentified(Untangle.me.id, d.id);
          var person = Untangle.personsController.find(d.id);
          Untangle.me.person = person;
          person.identify();
        }
      }); 
  },

  /**
  * Finds a person with the id person_id in the contents array if it exists and returns it.
  * @param {Number} person_id the id of the desired person
  * @return {Object} Returns the person with the id person_id or null if it does not exist there.
  */
  find: function (person_id) {
    var persons = this.get('content');
    for (var i = 0; i < persons.length; i++) {
      if (persons[i].id === person_id) {
        return persons[i];
      }
    }
    return null;
  },
  
  /**
  * Makes the necessary updates when a person is moved
  * @param {Number} person_id the id of the person
  */
  personMoved: function (person_id, x, y) {
    var person = Untangle.personsController.find(person_id);
    if (person) {
      person.wasMoved(x, y);
      d3.select('rect[id="' + person.id + '"]')
        .attr('x', x).attr('y', y);
    } else {
      person = this.create(person_id, x, y, false) 
      this.drawAll();     
    }
  },
  
  /**
  * Makes the necessary updates when a person is moved
  * @param {Number} person_id the id of the person
  */
  personIdentified: function (player_id, person_id) {
    console.log(person_id);
    var person = Untangle.personsController.find(person_id);
    var player = Untangle.playersController.find(player_id);
    player.wasIdentified(person);
		person.wasIdentified();
    
    d3.select('rect[id="' + person.id + '"]')
      .remove();
    Untangle.playersController.drawAll();
  },
  
  /**
  * Makes the necessary updates when a person is moved
  * @param {Number} person_id the id of the person
  */
  personUnidentified: function (player_id, person_id) {
    var person = Untangle.personsController.find(person_id);
    var player = Untangle.playersController.find(player_id);
    player.wasUnidentified();
    person.wasUnidentified();
		
    d3.select('rect[id="' + person.id + '"]')
      .remove();
  },

  /**
  * Makes the necessary updates when a person has left
  * @param {Number} person_id the id of the point
  */
  personLeft: function (person_id) {
    var person = Untangle.personsController.find(person_id);
    if (person) {
      this.removeObject(person);
      d3.select('rect[id="' + person.id + '"]')
        .remove();
    }
  }
});

Untangle.playersController = Ember.ArrayProxy.create({
    content: [],
    
    /**
    * Creates a point object and adds it to the content array of this controller
    * @param {Number} id the player's id
    * @param {Person} person the player's person object
    * @param {Bool} visible wheter this player is currently in the field
    * @param {Point} hold the point this player holds
    * @param {String} color the player's color    
    * @param {String} name the player's name
    * @return {Player} Returns the player that was created.
    */
    create: function (id, person, visible, hold, color, name) {
        var player = Untangle.Player.create({
            id: id,
            person: person,
            visible: visible,
            hold: hold,
            color: color,
            name: name
        });
        this.pushObject(player);
        return player;
    },
    
    /**
    * Loads an array of players into Ember by creating player objects and adding them to the content array of this controller
    * @param {Object} players an array of players, each of which has an id, an associated person object, an indication whether
    *                           he is visible, a color and a name.
    */
    loadPlayers: function (players) {
        this.set('content', []);
        var player;
        for (var i in players) {
            player = players[i];
            this.create(player.id, player.person, player.visible, player.hold, player.color, player.name);
        }
    },

    /**
    * Erases any players that are already drawn and then draws all the players contained in the content array with d3 calls
    */
    drawAll: function () {
        d3.selectAll('.player').remove();
      
        d3.select('svg')
          .selectAll('.player')
          .data(this.get('content'))
          .enter()
          .append('rect')
          .filter(function (d) { return d.person !== null; })
          .attr('id', function (d) { return d.id; })
          .attr('class', 'player')
          .attr('x', function (d) { return d.person ? d.person.x : 0; })
          .attr('y', function (d) { return d.person ? d.person.y : 0; })
          .attr('width', function (d) { return Untangle.PLAYER_RADIUS; })
          .attr('height', function (d) { return Untangle.PLAYER_RADIUS; })
          .style('fill', function (d) { return d.color })
          .style('stroke', function (d) { return d.color })
          .style('stroke-width', Untangle.PLAYER_STROKE_WIDTH)
          .on("click", function (d) {
            if (d.id == Untangle.me.id) {
              console.log("unidentified");
              Untangle.personsController.personUnidentified(d.id, Untangle.me.person.id);
            }
          }); 
    },

    /**
    * Finds a player with the id player_id in the contents array if it exists and returns it.
    * @param {Number} player_id the id of the desired player
    * @return {Object} Returns the player with the id player_id or null if it does not exist there.
    */
    find: function (player_id) {
        var players = this.get('content');
        for (var i = 0; i < players.length; i++) {
            if (players[i].id === player_id) {
                return players[i];
            }
        }
        return null;
    },

    /**
    * Makes the necessary updates when a player is moved
    * @param {Number} player_id the id of the player
    */
    playerMoved: function (player_id, x, y) {
        var player = Untangle.playersController.find(player_id);
        player.wasMoved(x, y);
        d3.select('rect[id="' + player.id + '"]')
          .attr('x', x).attr('y', y);
        Untangle.linesController.update();
    },
    
    /**
    * Makes the necessary updates when a player leaves the field
    * @param {Number} player_id the id of the player
    */
    playerInvisible: function (player_id, x, y) {
        var player = Untangle.playersController.find(player_id);
        player.wasMoved(x, y);
        player.becameInvisible();
        d3.select('rect[id="' + player.id + '"]')
          .attr('x', x).attr('y', y)
          .transition()
          .style("opacity", 0.5);
    },
    
    /**
    * Makes the necessary updates when a player re-enters the field
    * @param {Number} player_id the id of the player
    */
    playerVisible: function (player_id, person_id, x, y) {
        var player = Untangle.playersController.find(player_id);
        var person = Untangle.personsController.create(person_id, x, y, true);
        player.becameVisible(person);
        d3.select('rect[id="' + player.id + '"]')
          .transition()
          .style("opacity", 1)
          .attr('x', x).attr('y', y);
    },

    /**
    * Makes the necessary updates when a player leaves the game
    * @param {Number} player_id the id of the player
    */
    playerLeft: function (player_id) {
        var player = Untangle.playersController.find(player_id);
        this.removeObject(player);
        d3.select('rect[id="' + point.id + '"]')
          .transition()
          .remove()
    }
});

Untangle.linesController = Ember.ArrayProxy.create({
  content: [],

  /**
  * Creates a line object and adds it to the content array of this controller
  * @param {Object} point1 the first point of this line segment
  * @param {Object} point2 the second point of this line segment
  * @return {Object} Returns the line that was created.
  */
  create: function (point1, point2) {
    var line = Untangle.Line.create({
        point1: point1,
        point2: point2
    });
    this.pushObject(line);
    return line;
  },

  /**
  * Loads an array of lines into Ember by creating line objects and adding them to the content array of this controller
  * @param {Object} lines an array of lines, each of which is composed of 2 points
  */
  loadLines: function (lines) {
    this.set('content', []);
    var line, point1, point2;
    for (var i = 0; i < lines.length; i++) {
      line = lines[i];
      point1 = Untangle.pointsController.find(line.point1.id);
      point2 = Untangle.pointsController.find(line.point2.id);
      this.create(point1, point2);
    }
  },

  /**
  * Erases any lines that are already drawn and then draws all the lines contained in the content array with d3 calls
  */
  drawAll: function () {
    d3.selectAll('line').remove();
    d3.select('svg')
      .selectAll('line')
      .data(Untangle.linesController.get('content'))
      .enter()
      .append('line')
      .style('stroke', Untangle.LINE_COLOR)
      .style('stroke-width', Untangle.LINE_STROKE_WIDTH)
      .attr('x1', function (d) { return d.point1.x; })
      .attr('y1', function (d) { return d.point1.y; })
      .attr('x2', function (d) { return d.point2.x; })
      .attr('y2', function (d) { return d.point2.y; });
  },

  /**
  * Moves the endpoints of the lines when a point has moved
  */
  update: function () {
    d3.selectAll('line')
      .data(Untangle.linesController.get('content'))
      .attr('x1', function (d) { return d.point1.x; })
      .attr('y1', function (d) { return d.point1.y; })
      .attr('x2', function (d) { return d.point2.x; })
      .attr('y2', function (d) { return d.point2.y; });
  }
});
