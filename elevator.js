var assert = require('assert');

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
    var dir = 1 + 2*Math.floor(2*Math.random());
    if (this._floor == 0)
        dir = 1;
    else if (this._floor == this.parms().max_floor)
        dir = -1;
    this.moveUntil(dir,
                   function () {
                       return this._floor === 0 || this._floor === this.parms().max_floor
                   }.bind(this),
                   this.idle.bind(this));
}

Elevator.prototype.moveUntil = function(dir, done, next) {
    console.assert(dir === -1 || dir === 1);
    this._sim.after(this.parms().ticks_per_floor,
                    function() {
                        this._floor += dir;
                        if (done())
                            next();
                        else
                            this.moveUntil(dir, done, next);
                    }.bind(this));
}

function Passenger() {
}

function Building(sim) {
    var i;
    this._sim = sim;
    this._elevators = [];
    this._passengers = [];
    for (i = 0; i < sim._parms.num_elevators; i++)
        this._elevators.push(new Elevator(this, i));
    for (i = 0; i <= sim._parms.max_floor; i++)
        this._passengers.push([]);
}

function Simulation(parms) {
    this._parms = parms;
    this._clock = [];
    this._tick  = 0;
    this._building = new Building(this);
}

Simulation.prototype.run = function (ticks) {
    var i;
    for (i = 0; i < ticks; i++)
        this.tick();
}

Simulation.prototype.tick = function () {
    var i,q;
    this._clock.sort(function(a, b) { return a.tick - b.tick;});
    
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

var s = new Simulation({
                           num_elevators:   4,
                           max_floor:       39,
                           ticks_per_floor: 1
                       });
s.run(10);

console.log("floors:", s._building._elevators.map(function (e) {
                                                      return e._floor;
                                                  }));
