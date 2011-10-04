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
    passenger_rate:  10
};


var i, s, rate;
var min_rate = 5, max_rate = 10, steps = 15;

var data  = [];
var series = [];


s = new elevator.Simulation(options);
s.run(1000);
s._stats.dump_stats();

for (i = 0; i < s._parms.num_elevators; i++) {
    series.push({
            data: s._stats._positions[i],
            label: "Elevator " + String(i)
            });
}
plot(series);

/*
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
             max: 2000
         }
     },
     process.exit.bind(process, 0));
*/
