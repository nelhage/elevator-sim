var elevator = require('./elevator.js');
var dnode = require('dnode');

function plot(data, opts, cb) {
    dnode.connect(9000, function (server) {
        server.plot(data, opts);
        if (cb)
            cb();
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
    track_position:  false,
    debug:           false,
    passenger_rate:  10
};


var i, s, rate;
var min_rate, max_rate, steps;

var data  = [];
var series = [];
const debug_one = false;

if (debug_one) {
    s = new elevator.Simulation(options);
    s.run(100000);
    s._parms.track_position = true;
    s.run(1000);
    s._stats.dump_stats();

    for (i = 0; i < s._parms.num_elevators; i++) {
        series.push({
                        data: s._stats._positions[i],
                        label: "Elevator " + String(i),
                        points: {show: true},
                        lines: {show: true}
                    });
    }
    s._building._elevators.forEach(
        function (e) {
            console.log("** Elevator %d at %d moving to %d: **",
                        e._number, e._floor, e._dest);
            console.log(" pressed: %j", e._pressed);
            e._passengers.forEach(function (p) {
                                      console.log("passenger %d -> %d", p._start, p._dest);
                                  });
        })
    plot(series, {}, process.exit.bind(process, 0));
} else {
    min_rate = 2;
    max_rate = 30;
    steps = (max_rate - min_rate) + 1;

    for (i = 0; i < steps; i++) {
        options.passenger_rate = min_rate * Math.pow(max_rate / min_rate, i / (steps - 1));
        s = new elevator.Simulation(options);
        console.log("%s...", options.passenger_rate);
        s.run(100000);
        data.push({
                      rate: options.passenger_rate,
                      data: s._stats._stats.map(
                          function (s) {
                              return s.delivered;
                          })
                  });
    }

    var floors = [0, 10, 20, 30, 39];
    floors.forEach(function (floor) {
        series.push({
                data: data.map(function(d) {
                        return [1/d.rate, d.data[floor]]
                      }),
                label: String(floor),
        });
    });

    plot(series, {
             yaxis: {
                 min: 0,
                 max: 2000
             }
         },
         process.exit.bind(process, 0));
}