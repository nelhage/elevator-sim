var assert = require('assert');

const UP = 1, DOWN = 0;
               
function flip() {
    return Math.random() < 0.5;
}
        
function random(min, max) {
    return min + Math.floor((max - min) * Math.random());
}

function Elevator(building, n) {
    this._building = building;
    this._sim      = building._sim;
    this._parms    = this._sim._parms;
    this._number = n;
    this._floor  = 0;
    this._passengers = [];
    this.idle();
}

Elevator.prototype.parms = function() {
    return this._parms;
}

Elevator.prototype.idle = function() {
    var dir;
    if (this._floor == 0)
        dir = UP;
    else if (this._floor == this.parms().max_floor)
        dir = DOWN;
    else
        dir = flip() ? UP : DOWN;
    this.moveUntil(dir,
                   function () {
                       return false;
                   }.bind(this),
                   this.idle.bind(this));
}

Elevator.prototype.moveUntil = function(dir, done, next) {
    this._sim.move(this, dir, 
        function() {
            if (this._floor === this.parms().max_floor
                || this._floor === 0
                || done())
                next()
            else
                this.moveUntil(dir, done, next);
        }.bind(this));
}

function Passenger(start, dest) {
    this._start = start;
    this._dest  = dest;
}

function Building(sim) {
    var i;
    this._sim = sim;
    this._elevators = [];
    this._floors    = [];
    for (i = 0; i < sim._parms.num_elevators; i++)
        this._elevators.push(new Elevator(this, i));
    for (i = 0; i <= sim._parms.max_floor; i++)
        this._floors.push({
                passengers: [],
                loading:    null,
                called:     { UP: false, DOWN: false}});
}

function Simulation(parms) {
    this._parms = parms;
    this._clock = [];
    this._tick  = 0;
    this._building = new Building(this);
    this.new_passenger();
}
        
Simulation.prototype.run = function (ticks) {
    var i;
    for (i = 0; i < ticks; i++)
        this.tick();
}

Simulation.prototype.tick = function () {
    var i,q;
    this._clock.sort(function(a, b) { return b.tick - a.tick;});
    
    i = this._clock.length - 1;
    q = [];
    while (i >= 0 && this._clock[i].tick == this._tick) {
        q.push(this._clock.pop());
        i--;
    }
    for (i = 0; i < q.length; i++)
        q[i].cb();
    this._tick++;
}

Simulation.prototype.at = function (tick, cb) {
    this._clock.push({tick: tick, cb: cb});
}

Simulation.prototype.after = function (delay, cb) {
    this.at(this._tick + delay, cb);
}
        
Simulation.prototype.move = function (car, direction, cb) {
    console.assert(direction === UP || direction === DOWN);
    this.after(this._parms.ticks_per_floor, function () {
                   car._floor += (direction === UP) ? 1 : -1;
                   cb();
               });
}
        
Simulation.prototype.add_passenger = function (p) {
    var direction = (p._start > p._dest) ? DOWN : UP;
    console.log("New passenger at", p._start, "->", p._dest);
    this._building._floors[p._start].passengers.push(p);
    this._building._floors[p._start].called[direction] = true;
}
        
Simulation.prototype.new_passenger = function () {
    var start, dest;
    if (flip()) {
        start = 0;
        dest  = random(1, this._parms.max_floor + 1);
    } else {
        dest  = 0;
        start = random(1, this._parms.max_floor + 1);
    }
    this.add_passenger(new Passenger(start, dest));
    this.after(4, this.new_passenger.bind(this));
}

var s = new Simulation({
                           num_elevators:   4,
                           max_floor:       39,
                           ticks_per_floor: 1,
                       });
s.run(50);

console.log("floors:", s._building._elevators.map(function (e) {
                                                      return e._floor;
                                                  }));
