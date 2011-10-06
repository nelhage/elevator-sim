/* -*- mode: js2; js2-basic-offset: 4; -*- */
var assert = require('assert');

const UP = 1, DOWN = 0;

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
    this._dest       = null;
    this._passengers = [];
    this._pressed    = {};
    this._idle       = true;
}

Elevator.prototype.parms = function() {
    return this._parms;
}

Elevator.prototype.idle = function() {
    this._idle = true;
    this._dest = null;
    this._building.run_queue();
    /*
    if (this._idle && this._floor !== 0) {
        this.moveUntil(DOWN, function() {
                           return this._floor === 0 || !this._idle;
                       },
                       function () {});
    }
    */
}

Elevator.prototype.wake_up = function(floor) {
    if (this._idle) {
        this._idle = false;
        this._dest = floor;
        if (this._dest === floor)
            this._sim.after(0, this.deliver_passengers.bind(this));
        else
            this._sim.after(0, this.move_towards_dest.bind(this));
    }
}

Elevator.prototype.deliver_passengers = function () {
    var dir = null;
    console.assert(!this._idle);
    if (this._dest !== null) {
        if (this._floor < this._dest)
            dir = UP;
        else if (this._floor > this._dest)
            dir = DOWN;
        else
            this._dest = null;
    }
    if (dir === null) {
        [UP,DOWN].forEach(function (d) {
                if (this._building._floors[this._floor].called[d])
                    dir = d;
                }.bind(this));
    }
    if (dir === null) {
        this.idle();
        return;
    }

    if (this._pressed[this._floor] ||
        this._building._floors[this._floor].called[dir]) {
        this._sim.load_unload(this, dir,
            this.move_towards_dest.bind(this));
        return;
    }
    if (this._dest !== null && this._floor !== this._dest) {
        this.move_towards_dest();
        return;
    }
    this.idle();
}

Elevator.prototype.move_towards_dest = function() {
    this._sim.debug("Car %d at %s moving to %s...",
        this._number, this._floor, this._dest);
    if (this._dest === null || this._floor === this._dest) {
        this.deliver_passengers();
        return;
    }
    var dir = (this._floor < this._dest) ? UP : DOWN;
    this.moveUntil(dir,
                   function () {
                       return this._floor === this._dest ||
                           this._pressed[this._floor] ||
                           this._building._floors[this._floor].called[dir];
                   }.bind(this),
                   this.deliver_passengers.bind(this)
                  );
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

Elevator.prototype.press_button = function (floor) {
    this._sim.debug("Elevator %d at %d->%s, presssed %d",
                    this._number, this._floor, this._dest, floor);
    if (!this._pressed[floor]) {
        this._pressed[floor] = true;
        if (this._dest === this._floor || this._dest === null) {
            this._dest = floor;
        } else if (this._dest > this._floor) {
            console.assert(floor > this._floor);
            this._dest = Math.max(this._dest, floor);
        } else {
            console.assert(floor < this._floor);
            this._dest = Math.min(this._dest, floor);
        }
    }
}

function Passenger(sim, start, dest) {
    this._sim     = sim;
    this._start   = start;
    this._dest    = dest;
    this._created = sim._tick;
}

Passenger.prototype.loaded = function (e) {
    e.press_button(this._dest);
    this._sim._stats.loaded(this);
}

Passenger.prototype.arrive = function () {
    this._sim._stats.arrived(this);
}

Passenger.prototype.enter_building = function () {
    this._sim._building.call_elevator(this._start,
        (this._dest > this._start) ? UP : DOWN);
}

Passenger.prototype.stranded = function () {
    this._sim._building.call_elevator(this._start,
        (this._dest > this._start) ? UP : DOWN);
}

function Stats(sim) {
    this._sim = sim;
    this._stats = []
    this._positions = [];
    for (var i = 0; i < this._sim._parms.num_elevators; i++)
        this._positions.push([]);
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

Stats.prototype.moved = function (e) {
    if (this._sim._parms.track_position)
        this._positions[e._number].push(
            [this._sim._tick, e._floor]);
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
    i = 0;
    this._sim._building._floors.forEach(function (f) {
        stranded += f.passengers.length;
        console.log("Floor %d: stranded: %d %s%s",
            i++, f.passengers.length,
            f.called[UP] ? "U" : "",
            f.called[DOWN] ? "D" : "");
    });
    console.log("Stranded passengers: %d", stranded);
}

function Building(sim) {
    var i;
    this._sim = sim;
    this._elevators  = [];
    this._floors     = [];
    this._call_queue = [];
    for (i = 0; i < sim._parms.num_elevators; i++)
        this._elevators.push(new Elevator(this, i));
    for (i = 0; i <= sim._parms.max_floor; i++)
        this._floors.push({
                passengers: [],
                loading:    null,
                called:     {}});
}

Building.prototype.call_elevator = function (floor, direction) {
    if (this._floors[floor].loading === null &&
        !this._floors[floor].called[direction]) {
        this._floors[floor].called[direction] = true;
        this.process_call(floor, direction);
    }
}

Building.prototype.compute_weight = function (e, floor, direction) {
    if (e._idle) {
        return {
            weight: Math.abs(e._floor - floor) + 10,
            dispatch: function () {
                e.wake_up(floor);
            }
        }
    }
    if (e._floor <= floor && e._dest >= e._floor && direction === UP) {
        if (e._dest >= floor) {
            return {
                weight: 0,
                dispatch: function () {}
            }
        }
        return {
            weight: floor - e._floor,
            dispatch: function () {
                e._dest = Math.max(e._dest, floor);
            }
        }
    }
    if (e._floor >= floor && e._dest <= e._floor && direction === DOWN) {
        if (e._dest <= floor) {
            return {
                weight: 0,
                dispatch: function () {}
            }
        }
        return {
            weight: e._floor - floor,
            dispatch: function () {
                e._dest = Math.min(e._dest, floor);
            }
        }
    }
    return null;
}

Building.prototype.process_call = function (floor, direction) {
    var i, e;
    var best = { weight: Number('Infinity') }, obj;
    for (i = 0; i < this._elevators.length; i++) {
        obj = this.compute_weight(this._elevators[i], floor, direction);
        if (obj !== null && obj.weight < best.weight) {
            best = obj;
            best.elevator = this._elevators[i];
        }
    }
    if (best.elevator !== undefined) {
        this._sim.debug("Dispatching call %d(%d) to elevator %d at %d",
              floor, direction,
              best.elevator._number,
              best.elevator._floor);
        best.dispatch()
    } else {
        this._sim.debug("Deferring call %d(%d)", floor, direction);
        this._call_queue.push({
                                  floor: floor,
                                  direction: direction
                              });
    }
}

Building.prototype.run_queue = function (floor, direction) {
    var q = this._call_queue;
    this._call_queue = [];
    q.forEach(function (e) {
        if(this._floors[e.floor].called[e.direction])
            this.process_call(e.floor, e.direction);
    }.bind(this));
}

function Simulation (parms) {
    this._parms = parms;
    this._clock = [];
    this._tick  = 0;
    this._building = new Building(this);
    this._stats = new Stats(this);
    this.new_passenger();
}

Simulation.prototype.debug = function() {
    if (this._parms.debug) {
        process.stdout.write("[tick " + this._tick.toString() + "] ");
        console.log.apply(console, arguments);
    }
}

Simulation.prototype.run = function (ticks) {
    var end = this._tick + ticks;
    while (this._tick < end)
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
    if (q.length == 0) {
        this._tick = this._clock[this._clock.length - 1].tick;
    } else {
        for (i = 0; i < q.length; i++)
            q[i].cb();
        this._tick++;
    }
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
                   this._stats.moved(car, car._floor);
                   cb();
               }.bind(this));
}

Simulation.prototype.load_time = function (load, unload) {
    return this._parms.door_delay +
        Math.max((load + unload) * this._parms.load_time,
                 this._parms.min_load_wait);
}

Simulation.prototype.load_unload = function (car, dir, cb) {
    var floor = this._building._floors[car._floor];
    var wait;
    var load, unload, stranded = [];
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
        stranded.push(load[0]);
        floor.passengers.push(load.shift());
    }

    wait = this.load_time(load.length, unload.length);
    this.debug("Car", car._number, "at", car._floor, "loading/unloading",
    load.length, "/", unload.length, "moving", dir === DOWN ? "down" : "up");
    this.after(wait, function () {
        car._passengers = car._passengers.concat(load);
        load.map(function (p) {p.loaded(car);})
        unload.map(function (p) {p.arrive();})
        floor.loading = null;
        stranded.forEach(function (p) {
            p.stranded();
        });
        cb();
    });
}

Simulation.prototype.add_passenger = function (p) {
    var direction = (p._start > p._dest) ? DOWN : UP;
    // console.log("New passenger at", p._start, "->", p._dest);
    this._building._floors[p._start].passengers.push(p);
    p.enter_building()
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

module.exports.Simulation = Simulation;
