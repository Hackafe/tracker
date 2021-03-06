var extend = require('util')._extend;

module.exports = {
  loadPriority:  1000,
  startPriority: 1000,
  stopPriority:  1000,
  initialize: function(api, next){
    api.tracker = {
      // constants
      separator: '|',
      devicePrefix: 'device',
      sessionPrefix: 'session',
      // devices
      deviceGet: function(mac, next) {
        this.devices.find({mac:mac}).limit(1).next(next);
      },
      devicesGet: function(macs, next) {
        api.log('retrieving devices: '+JSON.stringify(macs), 'info');
        this.devices.find({mac: {$in: macs}}).toArray(function(err, devices) {
          if (err) api.log(err+' error retrieving devices', 'error');
          if (devices) api.log('devices: '+devices.length, 'info');
          api.log('devices: '+JSON.stringify(devices), 'debug');
          next(err, devices);
        });
      },
      deviceGetByIp: function(ip, next) {
        this.devices
            .find({"data.ip": ip})
            .sort({_updated: -1})
            .limit(1)
            .next(function (err, device) {
                if (err) {
                    api.log(err+' while searching device with ip '+ip, 'error');
                    return next(err);
                }
                if (!device) {
                    err = 'Could not find device with ip '+ip;
                    api.log(err, 'error');
                    return next(err);
                }
                next(null, device);
            });
      },
      devicesList: function(next) {
        this.devices.find().toArray(next);
      },
      deviceCreateOrUpdate: function(mac, data, next) {
        api.log('creating device '+mac+': '+data, 'info');
        this.devices.updateOne({mac: mac}, {
            $set: {
                data: data,
                _updated: new Date()
            },
            $setOnInsert: {
                _created: new Date()
            }}, {upsert: true}, function(err, r){
            if (err) {
                api.log(err+' error creating device', 'error');
            }
            api.log(r+' result creating device', 'info');
            if (next) next(err, r);
        });
      },
      // sessions
      sessionRegister: function(mac, start, end, next) {
        api.log('registering session for '+mac+': '+start+' '+end, 'info');
        return this.sessions.updateOne({
          mac: mac,
          end: {$gte: start}
        }, {
          $min: {start: start},
          $max: {end: end}
        }, {
          upsert: true
        }, function(err, r) {
            if (err) {
                api.log(err+' error registering session', 'error');
            }
            api.log(r+' result registering session', 'info');
            if (next) next(err, r);
        });
      },
      sessionAt: function (mac, time, next) {
          var q = {
              mac: mac,
              start: {$lte: time},
              end: {$gte: time}
          };
          api.log('mac='+mac, 'info');
          api.log('time='+time, 'info');
          this.sessions.find(q).limit(1).next(function(err, session) {
              if (err) {
                  api.log(err+' could not query session', 'error');
                  return next(err);
              }
              if (!session) {
                  err = "Could not find session for "+mac+" at "+time;
                  api.log(err, 'error');
                  return next(err);
              }
              next(null, session);
          });
      },
      sessionsAt: function(time, next) {
        var q = {
          start: {$lte: time},
          end: {$gte: time}
        };
        api.log('time='+time, 'info');
        this.sessions.find(q).toArray(function(err, sessions) {
          if (err) api.log(err+' could not query sessions', 'error');
          if (sessions) api.log('sessions: '+sessions.length, 'info');
          api.log('sessions: '+JSON.stringify(sessions), 'debug');
          next(err, sessions);
        });
      },
      deviceSessions: function(mac, next) {
          this.sessions.find({mac: mac}).sort({end: -1}).toArray(function(err, sessions){
              if (err) {
                  api.log(err+' could not query sessions for device '+mac, 'error');
                  return next(err);
              }
              next(null, sessions);
          });
      }
    };

    next();
  },
  start: function(api, next){
    api.tracker.devices = api.mongo.db.collection('devices');
    api.tracker.sessions = api.mongo.db.collection('sessions');

    api.tracker.devices.createIndexes([{
      key: {mac: 1},
      unique: true
    }, {
        key: {"data.ip": 1, _updated: -1},
        background: true
    }], function(err) {
      if (err) {
        api.log(err+' error creating unique index on devices', 'error');
        return next(err);
      }
      next();
    });
    api.tracker.sessions.createIndexes([
      {key: {mac: 1, start: -1, end: 1}, background: true}
    ]);
  },
  stop: function(api, next){
    next();
  }
};
