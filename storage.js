/**********************************************************************************
 * Mineavganger storage API
 **********************************************************************************
 Stores an ordered list of departure objects.

 Departure object shape:
 {
   id: <numeric auto generated if not present>,

   <any>...
 }
 */

'use strict';

/* Simple local browser storage of personal departures. */
const Storage = new function() {

    const db = window.localStorage;
    const self = this;
    
    const setDepartures = function(departures) {
        db.setItem('departures', JSON.stringify(departures));
        return departures;
    };

    /* Returns all stored departures as an array. */
    this.getDepartures = function() {
        const list = db.getItem('departures');
        return list ? JSON.parse(list) : [];
    };

    /* Returns a single departure by id */
    this.getDeparture = function(id) {
        return self.getDepartures().find(function(d) { return d.id === id; });
    };

    /* Saves a departure. Assigns an 'id' property automatically to object, if not
       already present. */
    this.saveDeparture = function(departure) {
        const list = self.getDepartures();
        if (!departure.id) {
            departure.id = list.map(function (d) {
                return d.id;
            }).reduce(function(max, n) {
                return n > max ? n : max;
            }, 0) + 1;
        } 
        const updateIdx = list.findIndex(function(d) { return d.id === departure.id; });
        if (updateIdx > -1) {
            list[updateIdx] = departure;
        } else {
            list.push(departure);
        }
        setDepartures(list);
        return departure;
    };

    /* Removes a departure by id, returns the removed departure. */
    this.removeDeparture = function(id) {
        var departureToRemove;
        setDepartures(self.getDepartures().filter(function(d) {
            if (id === d.id) {
                departureToRemove = d;
                return false;
            }
            return true;
        }));
        return departureToRemove;
    };

    const moveDeparture = function(departureId, first) {
        const departures = self.getDepartures();
        const departureToMove = departures.findIndex(function(d) { return d.id === departureId; });
        if (departureToMove > -1) {
            const departure = departures[departureToMove];
            departures.splice(departureToMove,1);
            if (first) {
                departures.unshift(departure);
            } else {
                departures.push(departure);
            }
            setDepartures(departures);
            return departure;
        }
        return undefined;
    };

    /* Moves an existing departure to first position in list.
       Returns moved departure. */
    this.moveFirst = function(departureId) {
        return moveDeparture(departureId, true);
    };

    /* Moves an existing departure to last position in list.
       Returns moved departure. */
    this.moveLast = function(departureId) {
        return moveDeparture(departureId, false);
    };

    this.removeAll = function() {
        return setDepartures([]);
    };
};
