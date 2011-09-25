/* -*- mode: js2; js2-basic-offset: 4; -*- */
var assert = require('assert');

const UP = 1, DOWN = 0;

function debug() {
    // console.log.apply(console, arguments);
}

function flip() {
    return Math.random() < 0.5;
}

function random(min, max) {
    return min + Math.floor((max - min) * Math.random());
}

function Elevator(building, n) {
    this._building   = building;
    this._sim        = building._sim;
    this._parms      = this._sim._parms;
    this._number     = n;
    this._floor      = 0;
    this._passengers = [];
    this._pressed    = {};
    this._last_move  = null;
    this._sim.after(0, this.idle.bind(this));
}

Elevator.prototype.parms = function() {
    return this._parms;
}

Elevator.prototype.idle = function() {
    if (this._building._floors[this._floor].called[this._last_move]) {
        this._sim.load_unload(this, this._last_move,
            this.deliver_passengers.bind(this));
        return;
    }
    var dir;
    if (this._floor === 0)
        dir = UP;
    else if (this._floor === this.parms().max_floor)
        dir = DOWN;
    else
        dir = flip() ? UP : DOWN;
    this.moveUntil(dir,
                   function () {
                       return this._building._floors[this._floor].called[dir];
                   }.bind(this),
                   this.idle.bind(this));
}

Elevator.prototype.deliver_passengers = function () {
    var dir;
    if (Object.keys(this._pressed).length === 0)
        return this.idle();
    for (p in this._pressed) {
        if (!this._pressed.hasOwnProperty(p))
            continue;
        if (p < this._floor)
            dir = DOWN;
        else
            dir = UP;
    }
    debug("car", this._number, "delivering", (dir === DOWN)?"down":"up");
    this.moveUntil(dir,
                   function () {
                       return this._building._floors[this._floor].called[dir] ||
                           this._pressed[this._floor];
                   }.bind(this),
                   function () {
                       var dir = this._last_move;
                       if (this._floor === 0)
                           dir = UP;
                       else if (this._floor === this._parms.max_floor)
                           dir = DOWN;
                       this._sim.load_unload(this, dir,
                         this.deliver_passengers.bind(this));
                   }.bind(this));
}

Elevator.prototype.moveUntil = function(dir, done, next) {
    this._last_move = dir;
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

function Passenger(sim, start, dest) {
    this._sim     = sim;
    this._start   = start;
    this._dest    = dest;
    this._created = sim._tick;
}

Passenger.prototype.loaded = function (e) {
    e._pressed[this._dest] = true;
    this._sim._stats.loaded(this);
}

Passenger.prototype.arrive = function () {
    this._sim._stats.arrived(this);
}

function Stats(sim) {
    this._sim = sim;
    this._stats = []
    for (var i = 0; i <= this._sim._parms.max_floor; i++) {
        this._stats.push({
            floor: i,
            latency:   0,
            delivered: 0,
            load_wait: 0})
    }
}

Stats.prototype.loaded = function (p) {
    this._stats[p._start].load_wait += (this._sim._tick - p._created);
}

Stats.prototype.arrived = function (p) {
    this._stats[p._start].delivered++;
    this._stats[p._start].latency += (this._sim._tick - p._created);
}

Stats.prototype.dump_stats = function() {
    var i;
    console.log("*** STATS as of %d ticks ***", this._sim._tick);
    console.log("** Average latency by source floor **");
    this._stats.forEach(function (s) {
        if (s.delivered) {
                console.log("%d: %d/%d [%d passengers]",
                        s.floor,
                        Math.floor(s.load_wait / s.delivered),
                        Math.floor(s.latency   / s.delivered),
                        s.delivered);
        } else {
            console.log("%d: No passengers delivered", s.floor);
        }
    });
    var stranded = 0;
    this._sim._building._floors.forEach(function (f) {
        stranded += f.passengers.length;
    });
    console.log("Stranded passengers: %d", stranded);
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
    this._stats = new Stats(this);
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
    /*
    console.assert(direction === UP || direction === DOWN);
    console.assert(direction === UP || car._floor > 0);
    console.assert(direction === DOWN || car._floor < this._parms.max_floor);
     */
    this.after(this._parms.ticks_per_floor, function () {
                   car._floor += (direction === UP) ? 1 : -1;
                   cb();
               });
}

Simulation.prototype.load_time = function (load, unload) {
    return this._parms.door_delay +
        Math.max((load + unload) * this._parms.load_time,
                 this._parms.min_load_wait);
}

Simulation.prototype.load_unload = function (car, dir, cb) {
    var floor = this._building._floors[car._floor];
    var wait;
    var load, unload;
    console.assert(dir === UP || car._floor > 0);
    console.assert(dir === DOWN || car._floor < this._parms.max_floor);
    floor.called[dir] = false;
    floor.loading = car;
    delete car._pressed[car._floor];

    unload = car._passengers.filter(function(p) {
        return p._dest === car._floor;
    });
    car._passengers = car._passengers.filter(function(p) {
        return p._dest !== car._floor;
    });
    load = floor.passengers.filter(function (p) {
        return (dir === DOWN) === (p._dest < car._floor);
    });
    floor.passengers = floor.passengers.filter(function (p) {
        return (dir === DOWN) !== (p._dest < car._floor);
    });
    while (load.length + car._passengers.length > this._parms.capacity) {
        floor.passengers.push(load.shift());
    }

    wait = this.load_time(load.length, unload.length);
    debug("Car", car._number, "at", car._floor, "loading/unloading",
    load.length, "/", unload.length, "moving", dir === DOWN ? "down" : "up");
    this.after(wait, function () {
        car._passengers = car._passengers.concat(load);
        load.map(function (p) {p.loaded(car);})
        unload.map(function (p) {p.arrive();})
        floor.loading = null;
        cb();
    });
}

Simulation.prototype.call_elevator = function(floor, direction) {
    if (this._building._floors[floor].loading === null)
        this._building._floors[floor].called[direction] = true;
}

Simulation.prototype.add_passenger = function (p) {
    var direction = (p._start > p._dest) ? DOWN : UP;
    // console.log("New passenger at", p._start, "->", p._dest);
    this._building._floors[p._start].passengers.push(p);
    this.call_elevator(p._start, direction);
}

Simulation.prototype.new_passenger = function () {
    var start, dest;
    var next = random(1, 2 * this._parms.passenger_rate);
    this.after(next, this.new_passenger.bind(this));
    if (flip()) {
        start = 0;
        dest  = random(1, this._parms.max_floor + 1);
    } else {
        dest  = 0;
        start = random(1, this._parms.max_floor + 1);
    }
    this.add_passenger(new Passenger(this, start, dest));
}

function plot(data, opts) {
    var dnode = require('dnode');
    dnode.connect(9000, function (server) {
        server.plot(data, opts);
    });
}

var options = {
    num_elevators:   4,
    max_floor:       39,
    ticks_per_floor: 1,
    min_load_wait:   8,
    load_time:       1, /* ticks/passenger */
    door_delay:      2,
    capacity:        10,
    passenger_rate:  10
};


var i, s, rate;
var min_rate = 5, max_rate = 20, steps = 10;

var data  = [];

for (i = 0; i < steps; i++) {
    options.passenger_rate = min_rate + (max_rate - min_rate) * (i / (steps - 1));
    s = new Simulation(options);
    console.log("%s...", options.passenger_rate);
    s.run(1000000);
    data.push({
            rate: options.passenger_rate,
            data: s._stats._stats.map(
                function (s) {
                    return s.latency / s.delivered;
                })
            });
}

var series = [];
var floor;
var floors = [0, 10, 20, 30, 39];
floors.forEach(function (floor) {
    series.push({
      data: data.map(function(d) {
              return [d.rate, d.data[floor]]
          }),
      label: String(floor),
    });
});

plot(series, {
         yaxis: {
             min: 0,
         }
     });
